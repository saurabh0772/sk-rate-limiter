'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { rateLimit, MemoryStore } = require('../src/index');

describe('skipSuccessfulRequests & skipFailedRequests', () => {
  it('does not count successful responses when skipSuccessfulRequests is true', async () => {
    const store = new MemoryStore();
    const app = express();

    app.use(
      rateLimit({
        limit: 2,
        windowMs: 10000,
        store,
        skipSuccessfulRequests: true
      })
    );

    app.get('/success', (req, res) => res.status(200).json({ ok: true }));
    app.get('/fail', (req, res) => res.status(500).json({ error: 'fail' }));

    // Making multiple successful requests should not exhaust quota because successful ones are decremented
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/success');
      assert.strictEqual(res.status, 200);
    }

    // Now make failed requests, which ARE counted
    await request(app).get('/fail').expect(500);
    await request(app).get('/fail').expect(500);

    // Third request exceeds limit
    const exceeded = await request(app).get('/fail');
    assert.strictEqual(exceeded.status, 429);
  });

  it('does not count failed responses when skipFailedRequests is true', async () => {
    const store = new MemoryStore();
    const app = express();

    app.use(
      rateLimit({
        limit: 2,
        windowMs: 10000,
        store,
        skipFailedRequests: true
      })
    );

    app.get('/fail', (req, res) => res.status(404).json({ error: 'not found' }));
    app.get('/success', (req, res) => res.status(200).json({ ok: true }));

    // Failed requests should be decremented and not consume the quota
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/fail');
      assert.strictEqual(res.status, 404);
    }

    // Successful requests ARE counted
    await request(app).get('/success').expect(200);
    await request(app).get('/success').expect(200);

    // Third request exceeds limit
    const exceeded = await request(app).get('/success');
    assert.strictEqual(exceeded.status, 429);
  });
});
