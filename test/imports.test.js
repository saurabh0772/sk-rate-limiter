'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('Package Entrypoints, Imports & Metadata', () => {
  it('supports CommonJS named and default imports', () => {
    const cjs = require('../src/index');
    assert.strictEqual(typeof cjs, 'function');
    assert.strictEqual(typeof cjs.rateLimit, 'function');
    assert.strictEqual(cjs.rateLimit, cjs);
    assert.strictEqual(typeof cjs.MemoryStore, 'function');
    assert.strictEqual(typeof cjs.RedisStore, 'function');
    assert.strictEqual(typeof cjs.defaultKeyGenerator, 'function');
  });

  it('supports ES Module imports via dynamic import', async () => {
    const esm = await import('../src/index.mjs');
    assert.strictEqual(typeof esm.default, 'function');
    assert.strictEqual(typeof esm.rateLimit, 'function');
    assert.strictEqual(typeof esm.MemoryStore, 'function');
    assert.strictEqual(typeof esm.RedisStore, 'function');
  });

  it('provides a valid TypeScript declaration file', () => {
    const dtsPath = path.join(__dirname, '../types/index.d.ts');
    assert.ok(fs.existsSync(dtsPath), 'types/index.d.ts must exist');

    const content = fs.readFileSync(dtsPath, 'utf8');
    assert.ok(content.includes('export function rateLimit'), 'Must export rateLimit function');
    assert.ok(content.includes('export class MemoryStore'), 'Must export MemoryStore');
    assert.ok(content.includes('export class RedisStore'), 'Must export RedisStore');
    assert.ok(content.includes('RateLimitOptions'), 'Must define RateLimitOptions');
  });

  it('has valid package.json with existing main, types, and exports', () => {
    const pkgPath = path.join(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert.strictEqual(pkg.name, 'sk-rate-limiter');
    assert.strictEqual(pkg.version, '1.0.0');
    assert.ok(fs.existsSync(path.join(__dirname, '..', pkg.main)));
    assert.ok(fs.existsSync(path.join(__dirname, '..', pkg.types)));
    assert.ok(fs.existsSync(path.join(__dirname, '..', pkg.exports['.'].import)));
    assert.ok(fs.existsSync(path.join(__dirname, '..', pkg.exports['.'].require)));
  });

  it('includes only allowed files in npm package tarball', () => {
    const output = execSync('npm pack --dry-run --json', {
      cwd: path.join(__dirname, '..')
    }).toString();

    const packInfo = JSON.parse(output)[0];
    const filePaths = packInfo.files.map((f) => f.path);

    // Verify critical package files are present
    assert.ok(filePaths.includes('package.json'));
    assert.ok(filePaths.includes('README.md'));
    assert.ok(filePaths.includes('LICENSE'));
    assert.ok(filePaths.some((p) => p.startsWith('src/')));
    assert.ok(filePaths.some((p) => p.startsWith('types/')));

    // Verify excluded files are NOT included
    assert.ok(!filePaths.some((p) => p.startsWith('node_modules')));
    assert.ok(!filePaths.some((p) => p.startsWith('test/')));
    assert.ok(!filePaths.some((p) => p.startsWith('examples/')));
    assert.ok(!filePaths.some((p) => p.endsWith('.env')));
    assert.ok(!filePaths.some((p) => p.endsWith('.log')));
  });
});
