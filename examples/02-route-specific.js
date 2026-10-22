'use strict';

/**
 * Example 2: Route-Specific Rate Limiting
 *
 * Applies a global rate limit of 100 req/min, but applies custom
 * quotas to /login (5 req/min) and /search (20 req/min).
 *
 * Run: node examples/02-route-specific.js
 */

const express = require('express');
const { rateLimit } = require('../src/index');

const app = express();
app.use(express.json());

app.use(
  rateLimit({
    limit: 100, // Global limit for unlisted routes
    windowMs: 60 * 1000,

    routes: [
      {
        path: '/login',
        methods: ['POST'],
        limit: 5, // Strict limit: 5 attempts per minute
        windowMs: 60 * 1000,
        message: { error: 'Too many login attempts. Please try again in 1 minute.' }
      },
      {
        path: '/search',
        methods: ['GET'],
        limit: 20,
        windowMs: 60 * 1000
      }
    ]
  })
);

app.post('/login', (req, res) => {
  res.json({ success: true, message: 'Logged in' });
});

app.get('/search', (req, res) => {
  res.json({ results: ['item 1', 'item 2'] });
});

app.get('/general', (req, res) => {
  res.json({ message: 'General endpoint (uses global 100 limit)' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
