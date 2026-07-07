// chain #16 closure: auth.ts:32 admin init console.log -> webAdminLog per-prefix helper
import * as fs from 'fs';
import * as path from 'path';

const AUTH_TS = path.join(__dirname, '..', '..', 'src', 'web', 'routes', 'auth.ts');

function readAuthSrc(): string {
  return fs.readFileSync(AUTH_TS, 'utf8');
}

describe('auth.ts webAdminLog per-prefix helper (chain #16 closure)', () => {
  it('has 0 inline console.log( call sites (excl. helper body + comments)', () => {
    const src = readAuthSrc();
    const lines = src.split('\n');
    let inlineCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('*') || line.startsWith('//')) continue;
      if (line === 'console.log(...args);') continue;
      if (line.includes('console.log(')) inlineCount++;
    }
    expect(inlineCount).toBe(0);
  });

  it('defines webAdminLog helper with correct shape', () => {
    const src = readAuthSrc();
    expect(src).toMatch(/const webAdminLog = \(...args: unknown\[\]\): void => \{/);
    expect(src).toMatch(/console\.log\(...args\);/);
  });

  it('routes admin init log through webAdminLog with preserved payload', () => {
    const src = readAuthSrc();
    expect(src).toContain('webAdminLog(');
    expect(src).toContain('Admin user created: admin');
    expect(src).toContain('adminPasswordSource()');
  });
});
