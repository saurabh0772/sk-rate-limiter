'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { rateLimit, MemoryStore } = require('../src/index');
const { normalizeIp, defaultKeyGenerator } = require('../src/core/keyGenerator');

describe('Client Keys & IP Identification', () => {
  it('normalizes IPv4, IPv6-mapped IPv4, and IPv6 addresses correctly', () => {
    assert.strictEqual(normalizeIp('192.168.1.10'), '192.168.1.10');
    assert.strictEqual(normalizeIp('::ffff:192.168.1.10'), '192.168.1.10');
    assert.strictEqual(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
    assert.strictEqual(normalizeIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334'), '2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    assert.strictEqual(normalizeIp(''), '127.0.0.1');
    assert.strictEqual(normalizeIp(null), '127.0.0.1');
  });

  it('keeps independent counters for different client IPs', async () => {
    const app = express();
    app.set('trust proxy', true);
    app.use(
      rateLimit({
        limit: 2,
        windowMs: 5000,
        store: new MemoryStore()
      })
    );
    app.get('/ip-test', (req, res) => res.send('ok'));

    // Client 1 makes 2 requests (exhausts quota)
    await request(app).get('/ip-test').set('X-Forwarded-For', '203.0.113.1').expect(200);
    await request(app).get('/ip-test').set('X-Forwarded-For', '203.0.113.1').expect(200);
    const client1Exceeded = await request(app).get('/ip-test').set('X-Forwarded-For', '203.0.113.1');
    assert.strictEqual(client1Exceeded.status, 429);

    // Client 2 should still be allowed (not affected by Client 1)
    const client2Res1 = await request(app).get('/ip-test').set('X-Forwarded-For', '203.0.113.2');
    assert.strictEqual(client2Res1.status, 200);
    assert.strictEqual(client2Res1.headers['ratelimit-remaining'], '1');
  });

  it('supports custom keyGenerator for API keys and user IDs', async () => {
    const app = express();
    app.use(
      rateLimit({
        limit: 2,
        windowMs: 5000,
        store: new MemoryStore(),
        keyGenerator: (req) => req.headers['x-api-key'] || req.ip
      })
    );
    app.get('/api-test', (req, res) => res.send('ok'));

    // Key 'alpha' makes 2 requests
    await request(app).get('/api-test').set('x-api-key', 'alpha').expect(200);
    await request(app).get('/api-test').set('x-api-key', 'alpha').expect(200);
    await request(app).get('/api-test').set('x-api-key', 'alpha').expect(429);

    // Key 'beta' is independent
    await request(app).get('/api-test').set('x-api-key', 'beta').expect(200);
  });

  it('handles async keyGenerator function', async () => {
    const app = express();
    app.use(
      rateLimit({
        limit: 1,
        windowMs: 5000,
        store: new MemoryStore(),
        keyGenerator: async (req) => {
          return Promise.resolve(req.headers['x-tenant-id']);
        }
      })
    );
    app.get('/async-key', (req, res) => res.send('ok'));

    await request(app).get('/async-key').set('x-tenant-id', 'tenant-a').expect(200);
    await request(app).get('/async-key').set('x-tenant-id', 'tenant-a').expect(429);
    await request(app).get('/async-key').set('x-tenant-id', 'tenant-b').expect(200);
  });

  it('safely falls back to client IP if custom keyGenerator throws an error', async () => {
    const app = express();
    app.use(
      rateLimit({
        limit: 2,
        windowMs: 5000,
        store: new MemoryStore(),
        keyGenerator: (req) => {
          if (req.headers['crash']) {
            throw new Error('Key generator exploded!');
          }
          return req.ip;
        }
      })
    );
    app.get('/crash-key', (req, res) => res.send('ok'));

    // Should not crash the process; falls back to IP
    const res1 = await request(app).get('/crash-key').set('crash', 'true');
    assert.strictEqual(res1.status, 200);
    const res2 = await request(app).get('/crash-key').set('crash', 'true');
    assert.strictEqual(res2.status, 200);
    const res3 = await request(app).get('/crash-key').set('crash', 'true');
    assert.strictEqual(res3.status, 429);
  });
});
