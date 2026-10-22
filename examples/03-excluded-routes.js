'use strict';

/**
 * Example 3: Excluded Routes & Wildcard Patterns
 *
 * Demonstrates excluding health checks, metrics, and third-party webhooks
 * from consuming rate limit quotas.
 *
 * Run: node examples/03-excluded-routes.js
 */

const express = require('express');
const { rateLimit } = require('../src/index');

const app = express();

app.use(
  rateLimit({
    limit: 5,
    windowMs: 60 * 1000,

    exclude: [
      '/health',         // Exact match
      '/metrics/*',      // Single-level wildcard
      '/webhooks/**'     // Multi-level wildcard
    ]
  })
);

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/metrics/cpu', (req, res) => res.json({ cpu: '12%' }));
app.post('/webhooks/stripe/v1/payment', (req, res) => res.json({ received: true }));
app.get('/api/users', (req, res) => res.json({ users: [] })); // Limited to 5 requests

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
