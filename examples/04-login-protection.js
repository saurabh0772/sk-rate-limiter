'use strict';

/**
 * Example 4: Login Endpoint Protection (Brute-Force Guard)
 *
 * Attaches a dedicated limiter directly to the POST /login route.
 * With `skipSuccessfulRequests: true`, only failed logins (< 400 status is skipped)
 * consume the client's attempts.
 *
 * Run: node examples/04-login-protection.js
 */

const express = require('express');
const { rateLimit } = require('../src/index');

const app = express();
app.use(express.json());

// Strict limiter for login: 5 failed attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  limit: 5,
  windowMs: 15 * 60 * 1000,
  skipSuccessfulRequests: true, // Only bad passwords count!
  message: {
    error: 'Too many failed login attempts. Please try again in 15 minutes.'
  }
});

app.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};

  if (username === 'admin' && password === 'secret123') {
    return res.status(200).json({ token: 'jwt-auth-token-xyz' });
  }

  // Failed login returns 401, which consumes 1 of the 5 allowed attempts
  return res.status(401).json({ error: 'Invalid username or password' });
});

const PORT = 3003;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
