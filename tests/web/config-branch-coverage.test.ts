// tests/web/config-branch-coverage.test.ts
// Covers the two uncovered conditional-expression arms in src/web/config.ts:44
// (`adminPasswordSource()`): both the truthy (ADMIN_PASSWORD present) and the
// falsy (ADMIN_PASSWORD absent -> development-default) branch.
//
// The function is a pure env-reader, so each arm is exercised by swapping
// process.env.ADMIN_PASSWORD around a direct call. Env mutations are restored
// in afterEach so no other suite observes a leaked ADMIN_PASSWORD.

import {
  adminPasswordSource,
  getAdminPassword,
  getJwtSecret,
  isProductionRuntime,
  validateRuntimeConfig,
} from '../../src/web/config';

describe('adminPasswordSource branch coverage', () => {
  const ORIGINAL = process.env.ADMIN_PASSWORD;
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_REQUIRE_SECURE = process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG;
  const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = ORIGINAL;
    }
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }
    if (ORIGINAL_REQUIRE_SECURE === undefined) {
      delete process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG;
    } else {
      process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG = ORIGINAL_REQUIRE_SECURE;
    }
    if (ORIGINAL_JWT_SECRET === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    }
  });

  describe("src/web/config.ts:44 ternary arms", () => {
    it("returns 'environment' when ADMIN_PASSWORD is set", () => {
      process.env.ADMIN_PASSWORD = 'from-env-secret';

      expect(adminPasswordSource()).toBe('environment');
    });

    it("returns 'development-default' when ADMIN_PASSWORD is unset", () => {
      delete process.env.ADMIN_PASSWORD;

      expect(adminPasswordSource()).toBe('development-default');
    });

    it("returns 'development-default' when ADMIN_PASSWORD is the empty string", () => {
      // Empty string is falsy, so the ternary takes the same arm as unset.
      process.env.ADMIN_PASSWORD = '';

      expect(adminPasswordSource()).toBe('development-default');
    });
  });

  describe('sibling helpers stay consistent with the reported source', () => {
    it('reports development-default only while no ADMIN_PASSWORD is set', () => {
      delete process.env.ADMIN_PASSWORD;

      expect(adminPasswordSource()).toBe('development-default');
      // getAdminPassword() must then fall back to the same development default
      // it reports, so the log line printed by auth.ts/server.ts is truthful.
      expect(getAdminPassword()).toBe('admin123');
    });

    it('reports environment and returns the env value once ADMIN_PASSWORD is set', () => {
      process.env.ADMIN_PASSWORD = 'from-env-secret';

      expect(adminPasswordSource()).toBe('environment');
      expect(getAdminPassword()).toBe('from-env-secret');
    });

    it('treats a known-insecure JWT secret as a production config error', () => {
      process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG = '1';
      process.env.JWT_SECRET = 'llm-bench-secret';

      expect(isProductionRuntime()).toBe(true);
      expect(() => getJwtSecret()).toThrow(
        'JWT_SECRET must be set to a non-default value in production',
      );
    });

    it('accepts a non-default JWT secret under the secure-runtime flag', () => {
      process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG = '1';
      process.env.JWT_SECRET = 'a-real-rotated-secret';

      expect(isProductionRuntime()).toBe(true);
      expect(getJwtSecret()).toBe('a-real-rotated-secret');
    });

    it('validates a development runtime without a secure-config flag', () => {
      delete process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG;
      delete process.env.NODE_ENV;
      delete process.env.JWT_SECRET;
      process.env.ADMIN_PASSWORD = 'dev-admin-pw';

      expect(isProductionRuntime()).toBe(false);
      expect(() => validateRuntimeConfig()).not.toThrow();
    });

    it('rejects a missing ADMIN_PASSWORD under the secure-runtime flag', () => {
      process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG = '1';
      process.env.JWT_SECRET = 'a-real-rotated-secret';
      delete process.env.ADMIN_PASSWORD;

      expect(() => getAdminPassword()).toThrow(
        'ADMIN_PASSWORD must be set to a non-default value in production',
      );
    });

    it('rejects the known development ADMIN_PASSWORD under the secure-runtime flag', () => {
      process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG = '1';
      process.env.JWT_SECRET = 'a-real-rotated-secret';
      process.env.ADMIN_PASSWORD = 'admin123';

      expect(() => getAdminPassword()).toThrow(
        'ADMIN_PASSWORD must be set to a non-default value in production',
      );
    });
  });
});
