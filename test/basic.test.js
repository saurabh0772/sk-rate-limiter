'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { rateLimit, MemoryStore } = require('../src/index');

describe('Basic Rate Limiting', () => {
  it('allows requests below the limit and blocks exceeding requests with 429', async () => {
    const app = express();
    app.use(
      rateLimit({
        limit: 3,
        windowMs: 5000,
        store: new MemoryStore()
      })
    );
    app.get('/test', (req, res) => res.json({ ok: true }));

    // Request 1: allowed
    const res1 = await request(app).get('/test');
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.headers['ratelimit-limit'], '3');
    assert.strictEqual(res1.headers['ratelimit-remaining'], '2');

    // Request 2: allowed
    const res2 = await request(app).get('/test');
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.headers['ratelimit-remaining'], '1');

    // Request 3: allowed (exactly reaching limit)
    const res3 = await request(app).get('/test');
    assert.strictEqual(res3.status, 200);
    assert.strictEqual(res3.headers['ratelimit-remaining'], '0');

    // Request 4: exceeded (HTTP 429)
    const res4 = await request(app).get('/test');
    assert.strictEqual(res4.status, 429);
    assert.deepStrictEqual(res4.body, { error: 'Too many requests', status: 429 });
    assert.ok(res4.headers['retry-after']);
    assert.strictEqual(res4.headers['ratelimit-remaining'], '0');
  });

  it('works with zero-config default options', async () => {
    const app = express();
    const limiter = rateLimit();
    app.use(limiter);
    app.get('/', (req, res) => res.json({ message: 'ok' }));

    const res = await request(app).get('/');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['ratelimit-limit'], '60');
    assert.strictEqual(res.headers['ratelimit-remaining'], '59');
    assert.ok(res.headers['ratelimit-policy'].includes('60;w=60'));
    await limiter.shutdown();
  });

  it('sets legacy X-RateLimit-* headers when configured', async () => {
    const app = express();
    app.use(
      rateLimit({
        limit: 2,
        windowMs: 10000,
        legacyHeaders: true,
        standardHeaders: false,
        store: new MemoryStore()
      })
    );
    app.get('/', (req, res) => res.send('ok'));

    const res = await request(app).get('/');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['x-ratelimit-limit'], '2');
    assert.strictEqual(res.headers['x-ratelimit-remaining'], '1');
    assert.ok(res.headers['x-ratelimit-reset']);
    assert.strictEqual(res.headers['ratelimit-limit'], undefined);
  });

  it('supports custom status code and custom message object', async () => {
    const app = express();
    app.use(
      rateLimit({
        limit: 1,
        windowMs: 5000,
        statusCode: 420,
        message: { error: 'Slow down buddy', code: 'RATE_EXCEEDED' },
        store: new MemoryStore()
      })
    );
    app.get('/', (req, res) => res.send('ok'));

    const res1 = await request(app).get('/');
    assert.strictEqual(res1.status, 200);

    const res2 = await request(app).get('/');
    assert.strictEqual(res2.status, 420);
    assert.deepStrictEqual(res2.body, { error: 'Slow down buddy', code: 'RATE_EXCEEDED' });
  });

  it('supports custom message string and custom message function', async () => {
    const app = express();
    app.use(
      rateLimit({
        limit: 1,
        windowMs: 5000,
        message: 'Rate limit hit',
        store: new MemoryStore()
      })
    );
    app.get('/string', (req, res) => res.send('ok'));

    await request(app).get('/string');
    const resString = await request(app).get('/string');
    assert.strictEqual(resString.status, 429);
    assert.deepStrictEqual(resString.body, { error: 'Rate limit hit', status: 429 });

    // Function message
    const appFn = express();
    appFn.use(
      rateLimit({
        limit: 1,
        windowMs: 5000,
        message: (req, res) => res.status(429).send('Custom Function Rejection'),
        store: new MemoryStore()
      })
    );
    appFn.get('/fn', (req, res) => res.send('ok'));

    await request(appFn).get('/fn');
    const resFn = await request(appFn).get('/fn');
    assert.strictEqual(resFn.status, 429);
    assert.strictEqual(resFn.text, 'Custom Function Rejection');
  });

  it('calls onLimitReached callback when limit is exceeded', async () => {
    let callbackTriggered = false;
    let callbackInfo = null;

    const app = express();
    app.use(
      rateLimit({
        limit: 1,
        windowMs: 5000,
        store: new MemoryStore(),
        onLimitReached: (req, res, info) => {
          callbackTriggered = true;
          callbackInfo = info;
        }
      })
    );
    app.get('/', (req, res) => res.send('ok'));

    await request(app).get('/');
    assert.strictEqual(callbackTriggered, false);

    await request(app).get('/');
    assert.strictEqual(callbackTriggered, true);
    assert.strictEqual(callbackInfo.limit, 1);
    assert.strictEqual(callbackInfo.current, 2);
    assert.ok(callbackInfo.resetTime instanceof Date);
  });

  it('attaches rateLimit metadata to request object (req.rateLimit)', async () => {
    let capturedRateLimit = null;
    const app = express();
    app.use(
      rateLimit({
        limit: 5,
        windowMs: 10000,
        store: new MemoryStore()
      })
    );
    app.get('/meta', (req, res) => {
      capturedRateLimit = req.rateLimit;
      res.json({ ok: true });
    });

    await request(app).get('/meta');
    assert.ok(capturedRateLimit);
    assert.strictEqual(capturedRateLimit.limit, 5);
    assert.strictEqual(capturedRateLimit.current, 1);
    assert.strictEqual(capturedRateLimit.remaining, 4);
    assert.ok(capturedRateLimit.resetTime instanceof Date);
  });
});
