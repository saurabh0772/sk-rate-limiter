'use strict';

/**
 * Example 5: Custom User ID and API Key Rate Limiting
 *
 * Rate limits authenticated users by user ID (or API key) instead of IP address.
 * Different users behind the same corporate NAT/proxy receive their own quotas.
 *
 * Run: node examples/05-custom-user-id.js
 */

const express = require('express');
const { rateLimit } = require('../src/index');

const app = express();

// Simulated auth middleware
app.use((req, res, next) => {
  // E.g., decoded from JWT or API key header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer user_')) {
    req.user = { id: authHeader.replace('Bearer ', '') };
  }
  next();
});

// Limiter identifying clients by User ID if authenticated, else IP
app.use(
  rateLimit({
    limit: 50,
    windowMs: 60 * 1000,
    keyGenerator: (req) => {
      if (req.user?.id) {
        return `user:${req.user.id}`;
      }
      return req.ip;
    }
  })
);

app.get('/api/profile', (req, res) => {
  res.json({
    user: req.user || 'anonymous',
    rateLimit: req.rateLimit
  });
});

const PORT = 3004;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
