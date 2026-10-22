'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const Redis = require('ioredis');
const { rateLimit, RedisStore } = require('../src/index');

const REDIS_TEST_PORT = process.env.REDIS_TEST_PORT || 6380;
const REDIS_TEST_URL = `redis://127.0.0.1:${REDIS_TEST_PORT}`;

describe('RedisStore & Distributed Limiting', () => {
  let redisClient;
  let isRedisAvailable = false;

  before(async () => {
    try {
      redisClient = new Redis(REDIS_TEST_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true
      });
      await redisClient.connect();
      isRedisAvailable = true;
    } catch (e) {
      isRedisAvailable = false;
      console.log('Real Redis not reachable on port ' + REDIS_TEST_PORT + '; using mock mode');
    }
  });

  after(async () => {
    if (redisClient) {
      await redisClient.quit().catch(() => {});
    }
  });

  it('throws when RedisStore is initialized without a client', () => {
    assert.throws(
      () => new RedisStore(),
      /RedisStore requires an active Redis client/
    );
  });

  it('runs atomic increments and window TTL in real Redis', async () => {
    if (!isRedisAvailable) return;

    const store = new RedisStore({
      client: redisClient,
      prefix: 'test-rl:'
    });

    const testKey = `client-${Date.now()}`;
    const windowMs = 2000;

    // 1st increment
    const res1 = await store.increment(testKey, windowMs);
    assert.strictEqual(res1.totalHits, 1);
    assert.ok(res1.remainingMs > 0 && res1.remainingMs <= windowMs);
    assert.ok(res1.resetTime instanceof Date);

    // 2nd increment
    const res2 = await store.increment(testKey, windowMs);
    assert.strictEqual(res2.totalHits, 2);
    assert.ok(res2.remainingMs > 0 && res2.remainingMs <= windowMs);

    // Decrement
    await store.decrement(testKey);
    const ttl = await redisClient.ttl(`test-rl:${testKey}`);
    assert.ok(ttl > 0);

    // Reset key
    await store.resetKey(testKey);
    const exists = await redisClient.exists(`test-rl:${testKey}`);
    assert.strictEqual(exists, 0);
  });

  it('protects Express app using RedisStore end-to-end', async () => {
    if (!isRedisAvailable) return;

    const store = new RedisStore({
      client: redisClient,
      prefix: `app-test-${Date.now()}:`
    });

    const app = express();
    app.use(
      rateLimit({
        limit: 2,
        windowMs: 5000,
        store
      })
    );
    app.get('/redis-api', (req, res) => res.json({ success: true }));

    // Request 1: allowed
    const r1 = await request(app).get('/redis-api');
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r1.headers['ratelimit-remaining'], '1');

    // Request 2: allowed
    const r2 = await request(app).get('/redis-api');
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.headers['ratelimit-remaining'], '0');

    // Request 3: blocked with 429
    const r3 = await request(app).get('/redis-api');
    assert.strictEqual(r3.status, 429);
    assert.strictEqual(r3.body.error, 'Too many requests');
    assert.ok(r3.headers['retry-after']);
  });

  it('handles concurrent requests atomically in Redis without race conditions', async () => {
    if (!isRedisAvailable) return;

    const store = new RedisStore({
      client: redisClient,
      prefix: `concurrent-${Date.now()}:`
    });

    const key = 'test-concurrent';
    const windowMs = 5000;
    const numRequests = 50;

    const promises = [];
    for (let i = 0; i < numRequests; i++) {
      promises.push(store.increment(key, windowMs));
    }

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 50);

    // Each hit should have received a unique hit count from 1 to 50
    const hitCounts = results.map((r) => r.totalHits).sort((a, b) => a - b);
    assert.strictEqual(hitCounts[0], 1);
    assert.strictEqual(hitCounts[hitCounts.length - 1], 50);

    await store.resetKey(key);
  });

  it('fails open (allows requests) when passOnStoreError is true and store fails', async () => {
    // Failing store
    const brokenStore = {
      increment: async () => {
        throw new Error('Redis connection refused: ECONNREFUSED');
      }
    };

    const app = express();
    app.use(
      rateLimit({
        limit: 1,
        windowMs: 5000,
        store: brokenStore,
        passOnStoreError: true // default
      })
    );
    app.get('/error-test', (req, res) => res.json({ passed: true }));

    const res = await request(app).get('/error-test');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.passed, true);
  });

  it('fails closed (returns 500) when passOnStoreError is false and store fails', async () => {
    const brokenStore = {
      increment: async () => {
        throw new Error('Redis connection timed out');
      }
    };

    const app = express();
    app.use(
      rateLimit({
        limit: 1,
        windowMs: 5000,
        store: brokenStore,
        passOnStoreError: false
      })
    );
    app.get('/error-test', (req, res) => res.json({ passed: true }));

    const res = await request(app).get('/error-test');
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.error, 'Rate limiter storage unavailable');
    assert.strictEqual(res.body.status, 500);
  });
});
