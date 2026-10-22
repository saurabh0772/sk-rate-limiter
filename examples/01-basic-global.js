'use strict';

/**
 * Example 1: Basic Global Rate Limiting
 *
 * Protects all routes on the Express server: 100 requests per minute per IP.
 * Exceeding requests automatically receive HTTP 429 Too Many Requests.
 *
 * Run: node examples/01-basic-global.js
 */

const express = require('express');
const { rateLimit } = require('../src/index'); // In your app: require('sk-rate-limiter')

const app = express();

app.use(
  rateLimit({
    limit: 100,          // 100 requests max
    windowMs: 60 * 1000  // 1 minute window
  })
);

app.get('/', (req, res) => {
  res.json({
    message: 'Global rate-limited API',
    rateLimit: req.rateLimit
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
