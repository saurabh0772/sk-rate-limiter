'use strict';

/**
 * Example 6: Distributed Rate Limiting with Redis
 *
 * Demonstrates cluster-safe rate limiting using Redis and atomic Lua scripts.
 * Multiple Node.js processes or Kubernetes pods share the same counters.
 *
 * Run: node examples/06-redis-distributed.js
 */

const express = require('express');
const Redis = require('ioredis');
const { rateLimit, RedisStore } = require('../src/index');

const app = express();

// Initialize Redis client (works with Upstash, AWS ElastiCache, or local Redis)
const redisClient = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6380', {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true
});

redisClient.on('connect', () => console.log('Connected to Redis'));
redisClient.on('error', (err) => console.error('Redis error:', err.message));

app.use(
  rateLimit({
    limit: 100,
    windowMs: 60 * 1000,
    store: new RedisStore({
      client: redisClient,
      prefix: 'myapp-rl:' // Redis key prefix
    }),
    passOnStoreError: true // If Redis goes down, requests still succeed
  })
);

app.get('/api/distributed', (req, res) => {
  res.json({
    message: 'Distributed Redis rate limited',
    rateLimit: req.rateLimit
  });
});

const PORT = 3005;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
