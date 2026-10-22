'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { rateLimit, MemoryStore } = require('../src/index');

describe('Route-Specific Limits and Exclusions', () => {
  it('applies route-specific rules and separates route counters from global quota', async () => {
    const app = express();
    app.use(
      rateLimit({
        limit: 10, // Global limit: 10
        windowMs: 10000,
        store: new MemoryStore(),
        routes: [
          {
            path: '/login',
            methods: ['POST'],
            limit: 2, // Strict limit for POST /login
            windowMs: 10000
          },
          {
            path: '/search',
            limit: 5
          }
        ]
      })
    );

    app.post('/login', (req, res) => res.json({ route: 'login' }));
    app.get('/login', (req, res) => res.json({ route: 'login-get' }));
    app.get('/search', (req, res) => res.json({ route: 'search' }));
    app.get('/general', (req, res) => res.json({ route: 'general' }));

    // 1. POST /login: limit 2
    await request(app).post('/login').expect(200);
    await request(app).post('/login').expect(200);
    const login3 = await request(app).post('/login');
    assert.strictEqual(login3.status, 429);

    // 2. GET /login did NOT specify POST only, so it falls back to global limit 10
    const loginGet = await request(app).get('/login');
    assert.strictEqual(loginGet.status, 200);
    assert.strictEqual(loginGet.headers['ratelimit-limit'], '10');

    // 3. /search has limit 5
    const searchRes = await request(app).get('/search');
    assert.strictEqual(searchRes.status, 200);
    assert.strictEqual(searchRes.headers['ratelimit-limit'], '5');

    // 4. /general uses global limit 10
    const genRes = await request(app).get('/general');
    assert.strictEqual(genRes.status, 200);
    assert.strictEqual(genRes.headers['ratelimit-limit'], '10');
  });

  it('supports direct per-route middleware attachment', async () => {
    const app = express();
    const loginLimiter = rateLimit({
      limit: 2,
      windowMs: 5000,
      store: new MemoryStore()
    });

    app.post('/api/auth/login', loginLimiter, (req, res) => res.json({ success: true }));
    app.get('/unlimited', (req, res) => res.json({ unlimited: true }));

    await request(app).post('/api/auth/login').expect(200);
    await request(app).post('/api/auth/login').expect(200);
    await request(app).post('/api/auth/login').expect(429);

    // /unlimited has no limiter
    await request(app).get('/unlimited').expect(200);
    await request(app).get('/unlimited').expect(200);
  });

  it('excludes exact routes and wildcard patterns', async () => {
    const app = express();
    app.use(
      rateLimit({
        limit: 1,
        windowMs: 5000,
        store: new MemoryStore(),
        exclude: ['/health', '/metrics/*', '/webhooks/**']
      })
    );

    app.get('/health', (req, res) => res.send('healthy'));
    app.get('/health/', (req, res) => res.send('healthy-slash'));
    app.get('/metrics/cpu', (req, res) => res.send('cpu'));
    app.post('/webhooks/stripe/events', (req, res) => res.send('webhook'));
    app.get('/api/data', (req, res) => res.send('data'));

    // Excluded routes can be called multiple times with no rate-limit headers
    for (let i = 0; i < 5; i++) {
      const resHealth = await request(app).get('/health').expect(200);
      assert.strictEqual(resHealth.headers['ratelimit-limit'], undefined);

      const resMetrics = await request(app).get('/metrics/cpu').expect(200);
      assert.strictEqual(resMetrics.headers['ratelimit-limit'], undefined);

      const resWebhooks = await request(app).post('/webhooks/stripe/events').expect(200);
      assert.strictEqual(resWebhooks.headers['ratelimit-limit'], undefined);
    }

    // Normal non-excluded route is limited to 1 request
    await request(app).get('/api/data').expect(200);
    await request(app).get('/api/data').expect(429);
  });

  it('supports exclusion predicate callback function', async () => {
    const app = express();
    app.use(
      rateLimit({
        limit: 1,
        windowMs: 5000,
        store: new MemoryStore(),
        exclude: (req) => req.headers['x-internal-secret'] === 'classified'
      })
    );
    app.get('/protected', (req, res) => res.send('ok'));

    // Request with secret bypasses limiter
    await request(app).get('/protected').set('x-internal-secret', 'classified').expect(200);
    await request(app).get('/protected').set('x-internal-secret', 'classified').expect(200);

    // Request without secret is limited
    await request(app).get('/protected').expect(200);
    await request(app).get('/protected').expect(429);
  });

  it('properly strips query strings and handles mounted Express routers', async () => {
    const app = express();
    const apiRouter = express.Router();

    app.use(
      rateLimit({
        limit: 2,
        windowMs: 5000,
        store: new MemoryStore(),
        routes: [
          {
            path: '/v1/search',
            limit: 1
          }
        ]
      })
    );

    apiRouter.get('/search', (req, res) => res.json({ results: [] }));
    app.use('/v1', apiRouter);

    // First search with query params matches /v1/search rule
    const res1 = await request(app).get('/v1/search?query=nodejs&page=1');
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.headers['ratelimit-limit'], '1');

    // Second search should be 429
    const res2 = await request(app).get('/v1/search?query=express');
    assert.strictEqual(res2.status, 429);
  });
});
