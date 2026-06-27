// src/web/config.ts - Runtime configuration helpers

const DEVELOPMENT_JWT_SECRET = 'llm-bench-dev-secret';
const DEVELOPMENT_ADMIN_PASSWORD = 'admin123';
const INSECURE_JWT_SECRETS = new Set([
  'llm-bench-secret',
  'llm-bench-secret-change-in-production',
  DEVELOPMENT_JWT_SECRET,
]);

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.LLM_BENCH_REQUIRE_SECURE_CONFIG === '1';
}

function requireNonDefault(name: string, value: string | undefined, insecureValues: Set<string>): string {
  if (!value || insecureValues.has(value)) {
    throw new Error(`${name} must be set to a non-default value in production`);
  }
  return value;
}

export function getJwtSecret(): string {
  const value = process.env.JWT_SECRET;
  if (isProductionRuntime()) {
    return requireNonDefault('JWT_SECRET', value, INSECURE_JWT_SECRETS);
  }
  return value || DEVELOPMENT_JWT_SECRET;
}

export function getAdminPassword(): string {
  const value = process.env.ADMIN_PASSWORD;
  if (isProductionRuntime()) {
    return requireNonDefault('ADMIN_PASSWORD', value, new Set([DEVELOPMENT_ADMIN_PASSWORD]));
  }
  return value || DEVELOPMENT_ADMIN_PASSWORD;
}

export function validateRuntimeConfig(): void {
  getJwtSecret();
  getAdminPassword();
}

export function adminPasswordSource(): 'environment' | 'development-default' {
  return process.env.ADMIN_PASSWORD ? 'environment' : 'development-default';
}
