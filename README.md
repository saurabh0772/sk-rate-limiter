# sk-rate-limiter 🛡️

[![npm version](https://img.shields.io/npm/v/sk-rate-limiter.svg)](https://www.npmjs.com/package/sk-rate-limiter)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-brightgreen.svg)](https://nodejs.org/)

A lightweight rate-limiting middleware for **Express**. Protect APIs from excessive requests with in-memory counters or an optional shared Redis store.

> **Documentation note:** This README is based on the API and features you supplied. Before publishing, verify each option, default, compatibility claim, and example against the actual package implementation and tests.

## Navigation

**[Quick Start](#quick-start)** · **[Examples](#common-examples)** · **[Configuration](#configuration-reference)** · **[Redis](#redis-storage)** · **[Troubleshooting](#troubleshooting)** · **[Testing](#testing)**

<details>
<summary><strong>📚 Full table of contents (click to expand)</strong></summary>

- [What is rate limiting?](#what-is-rate-limiting)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
  - [Install](#install)
  - [ES Modules](#es-modules)
  - [CommonJS](#commonjs)
  - [Default settings](#default-settings)
- [Common Examples](#common-examples)
  - [Global rate limit](#global-rate-limit)
  - [Different limits for different APIs](#different-limits-for-different-apis)
  - [Route rules in one middleware](#route-rules-in-one-middleware)
  - [Exclude routes](#exclude-routes)
  - [Custom client identification](#custom-client-identification)
  - [Custom blocked response](#custom-blocked-response)
  - [Count only failed requests](#count-only-failed-requests)
- [Storage](#storage)
  - [Memory storage](#memory-storage)
  - [Redis storage](#redis-storage)
- [Configuration Reference](#configuration-reference)
- [Rate-limit Responses and Headers](#rate-limit-responses-and-headers)
- [Failure Handling](#failure-handling)
- [Reverse Proxies and Client IPs](#reverse-proxies-and-client-ips)
- [TypeScript](#typescript)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Publishing Checklist](#publishing-checklist)
- [License](#license)

</details>

---

## What is rate limiting?

Rate limiting controls how many requests a client can send within a period of time.

For example:

```js
rateLimit({
  limit: 5,
  windowMs: 60_000
})
```

This allows **5 requests in 60 seconds** per client key. Requests over the limit are blocked (normally with HTTP `429 Too Many Requests`) until the quota resets.

**Time units:** `windowMs` uses **milliseconds**. `60_000` and `60000` mean exactly the same thing in JavaScript.

| Time | `windowMs` |
| --- | ---: |
| 1 second | `1_000` |
| 30 seconds | `30_000` |
| 1 minute | `60_000` |
| 15 minutes | `900_000` |
| 1 hour | `3_600_000` |

## Requirements

- Node.js **16 or newer**, according to the supplied package specification.
- Express **4 or 5**, according to the supplied package specification.
- Redis is **optional**; you do not need Redis for the default memory store.
- For distributed deployments, use a supported Redis server and compatible client.

> The middleware targets Express. It is **not** a drop-in middleware for Fastify, Python, or Next.js without an appropriate adapter.

---

## Quick Start

### Install

```bash
npm install sk-rate-limiter
```

> If the package is not yet published to npm, test your local copy with:
>
> ```bash
> npm install /absolute/path/to/sk-rate-limiter
> ```

### ES Modules

Use this version when your `package.json` contains `"type": "module"`:

```js
import express from 'express';
import { rateLimit } from 'sk-rate-limiter';

const app = express();

app.use(rateLimit({
  limit: 5,
  windowMs: 60_000
}));

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express!' });
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
```

### CommonJS

Use this version when your project uses `require()`:

```js
const express = require('express');
const { rateLimit } = require('sk-rate-limiter');

const app = express();

app.use(rateLimit({
  limit: 5,
  windowMs: 60_000
}));

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express!' });
});

app.listen(3000);
```

### Default settings

If you do not pass options, the supplied specification says the defaults are **60 requests per minute per IP**:

```js
app.use(rateLimit());
```

---

## Common Examples

The snippets below assume you have already created `app` and imported `rateLimit`.

### Global rate limit

Protect every route registered **after** the middleware:

```js
app.use(rateLimit({
  limit: 100,
  windowMs: 60_000,
  message: { error: 'Too many requests. Please try again later.' }
}));
```

**Important:** Middleware order matters in Express. Register the limiter before the routes you want to protect.

### Different limits for different APIs

Attach a different limiter to each route:

```js
const homeLimiter = rateLimit({
  limit: 10,
  windowMs: 60_000
});

const usersLimiter = rateLimit({
  limit: 5,
  windowMs: 60_000
});

const loginLimiter = rateLimit({
  limit: 3,
  windowMs: 60_000
});

app.get('/', homeLimiter, (req, res) => {
  res.send('Home');
});

app.get('/api/users', usersLimiter, (req, res) => {
  res.json({ users: ['Saurabh', 'Rahul'] });
});

app.post('/api/login', loginLimiter, (req, res) => {
  res.json({ message: 'Login endpoint' });
});
```

This is usually the **easiest approach** when you have just a few routes.

### Route rules in one middleware

If you have many endpoints, configure their limits in one place:

```js
app.use(rateLimit({
  limit: 100,
  windowMs: 60_000,
  routes: [
    {
      path: '/api/auth/login',
      methods: ['POST'],
      limit: 5,
      windowMs: 60_000
    },
    {
      path: '/api/auth/register',
      methods: ['POST'],
      limit: 3,
      windowMs: 60_000
    },
    {
      path: '/api/search',
      methods: ['GET'],
      limit: 20,
      windowMs: 60_000
    }
  ]
}));
```

Route-specific rules are intended to override the global settings for matching requests. Verify the package's route matching and counter-isolation behavior before relying on it in production.

### Exclude routes

Allow selected routes to bypass the limiter:

```js
app.use(rateLimit({
  limit: 100,
  windowMs: 60_000,
  exclude: [
    '/health',
    '/metrics/*',
    '/webhooks/**'
  ]
}));
```

The supplied specification describes `*` as a single-level wildcard and `**` as a deep wildcard. Check the implemented matcher for exact semantics.

A dynamic exclusion function is also described:

```js
app.use(rateLimit({
  limit: 100,
  exclude: (req) => req.path === '/health'
}));
```

**Security:** Do not bypass limits based only on a client-supplied `x-internal-secret` header unless the secret is strong and verified securely. Avoid hardcoding secrets.

### Custom client identification

By default, clients are identified by IP. You can instead identify them by authenticated user ID or API key.

**Per authenticated user:**

```js
// Authentication middleware must run BEFORE this limiter.
app.use(rateLimit({
  limit: 100,
  windowMs: 60_000,
  keyGenerator: (req) => req.user?.id
    ? `user:${req.user.id}`
    : `ip:${req.ip}`
}));
```

**Per API key:**

```js
// Verify the API key before treating it as a trusted identity.
app.use(rateLimit({
  limit: 1000,
  windowMs: 60_000,
  keyGenerator: (req) => req.apiClient?.id
    ? `client:${req.apiClient.id}`
    : `ip:${req.ip}`
}));
```

Use a **validated** identity from your authentication middleware rather than blindly trusting a request header. Prefix keys (`user:`, `ip:`, etc.) to avoid accidental collisions.

### Custom blocked response

```js
app.use(rateLimit({
  limit: 10,
  windowMs: 60_000,
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Please wait before trying again.'
  }
}));
```

The supplied API also describes a function-style `message` handler:

```js
app.use(rateLimit({
  limit: 10,
  message: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: res.getHeader('Retry-After')
    });
  }
}));
```

Verify function handler behavior against `src/middleware.js` before publishing this example.

### Count only failed requests

Useful for protecting login endpoints from repeated unsuccessful attempts:

```js
app.post(
  '/api/login',
  rateLimit({
    limit: 5,
    windowMs: 15 * 60_000,
    skipSuccessfulRequests: true
  }),
  (req, res) => {
    // Replace with real authentication logic.
    res.status(401).json({ error: 'Invalid credentials' });
  }
);
```

With `skipSuccessfulRequests: true`, successful responses (status below 400) are intended not to count toward the final quota. The middleware may count first and adjust the counter after the response finishes.

To avoid counting failed responses instead:

```js
app.use(rateLimit({
  limit: 100,
  skipFailedRequests: true
}));
```

---

## Storage

### Memory storage

Memory storage is the default. It needs no database and is a good fit for local development or a single Node.js process.

```js
import { rateLimit, MemoryStore } from 'sk-rate-limiter';

app.use(rateLimit({
  limit: 100,
  windowMs: 60_000,
  store: new MemoryStore({
    cleanupIntervalMs: 60_000,
    maxKeys: 50_000
  })
}));
```

**Limitation:** Each Node.js process has its own counters. Limits are not automatically shared across PM2 workers, multiple containers, or separate servers. Memory counters also disappear when the process restarts.

### Redis storage

Redis lets multiple application instances share counters.

Install a Redis client:

```bash
npm install ioredis
```

Example using `ioredis`:

```js
import express from 'express';
import Redis from 'ioredis';
import { rateLimit, RedisStore } from 'sk-rate-limiter';

const app = express();
const redisClient = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379'
);

app.use(rateLimit({
  limit: 100,
  windowMs: 60_000,
  store: new RedisStore({
    client: redisClient,
    prefix: 'sk-rl:'
  })
}));

app.get('/api/data', (req, res) => {
  res.json({ ok: true });
});

app.listen(3000);
```

The supplied implementation description says Redis counters use an **atomic Lua script** to update the count and TTL without race conditions. Check the actual Redis store's client compatibility before claiming support for both `ioredis` and `redis`.

**Redis vs memory:**

| Feature | Memory | Redis |
| --- | --- | --- |
| Extra setup | None | Redis server and client |
| Multiple app instances share quota | No | Yes |
| Survives app restart | No | Yes, while Redis retains the keys |
| Best for | Local/single-process apps | Distributed deployments |

---

## Configuration Reference

These settings and defaults are taken from the supplied README; verify them against the code before publishing.

| Option | Type | Supplied default | Purpose |
| --- | --- | --- | --- |
| `limit` | `number` | `60` | Requests allowed per window |
| `windowMs` | `number` | `60000` | Window length in milliseconds |
| `statusCode` | `number` | `429` | Status when quota is exceeded |
| `message` | `string`, object, function | JSON error object | Body or custom handler when blocked |
| `exclude` | array or function | `[]` | Skip selected requests |
| `routes` | array | `[]` | Route-specific rules |
| `keyGenerator` | function | IP-based | Identify clients |
| `store` | store instance | `MemoryStore` | Storage backend |
| `standardHeaders` | boolean or string | `true` | Standard rate-limit headers |
| `legacyHeaders` | boolean | `false` | Legacy `X-RateLimit-*` headers |
| `passOnStoreError` | boolean | `true` | Continue on store errors if enabled |
| `skipSuccessfulRequests` | boolean | `false` | Do not count successful responses |
| `skipFailedRequests` | boolean | `false` | Do not count failed responses |
| `onLimitReached` | function | Not set | Hook when quota is exceeded |
| `requestPropertyName` | string | `'rateLimit'` | Request property for quota information |
| `prefix` | string | `'sk-rl'` | Storage key namespace |

### Route rule fields

| Field | Example | Purpose |
| --- | --- | --- |
| `path` | `'/api/login'` | Route pattern |
| `methods` | `['POST']` | HTTP methods to match |
| `limit` | `5` | Requests for matching route |
| `windowMs` | `60_000` | Window for matching route |

**Tip:** Start with `limit` and `windowMs`. Add advanced options only when needed.

---

## Rate-limit Responses and Headers

When a client exceeds the quota, the default behavior is described as an HTTP **429 Too Many Requests** response.

Illustrative response (actual numbers change per request):

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 42
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 42
RateLimit-Policy: 100;w=60

{"error":"Too many requests","status":429}
```

### Standard headers

When enabled, the supplied specification describes:

| Header | Meaning |
| --- | --- |
| `RateLimit-Limit` | Maximum requests allowed |
| `RateLimit-Remaining` | Requests left |
| `RateLimit-Reset` | Seconds until reset |
| `RateLimit-Policy` | Limit and window policy |
| `Retry-After` | How long to wait after a 429 |

The `RateLimit-*` naming and exact format vary between IETF drafts; verify the emitted headers before calling them compliant with a particular draft.

### Legacy headers

Enable legacy headers if your clients expect them:

```js
app.use(rateLimit({
  limit: 100,
  legacyHeaders: true
}));
```

Expected legacy names include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.

Inspect the actual headers:

```bash
curl -i http://localhost:3000/api/users
```

---

## Failure Handling

Choose what happens if the configured store becomes unavailable.

**Fail-open:** Keep serving requests even if the limiter cannot access its store:

```js
app.use(rateLimit({
  passOnStoreError: true
}));
```

**Fail-closed:** Reject requests if rate-limit state cannot be checked:

```js
app.use(rateLimit({
  passOnStoreError: false
}));
```

The supplied specification says fail-closed storage errors return HTTP 500. Verify this in tests. Fail-open improves availability but temporarily weakens abuse protection; fail-closed preserves stricter enforcement but can make the API unavailable.

---

## Reverse Proxies and Client IPs

If Express is behind NGINX, a cloud load balancer, or another reverse proxy, configure `trust proxy` **only for proxies you control**:

```js
const app = express();

// Example ONLY when exactly one trusted proxy hop is in front of Express:
app.set('trust proxy', 1);
```

**Do not blindly enable `trust proxy` for every deployment.** A wrong configuration can let clients spoof their IP using forwarded headers and bypass per-IP limits.

For more information, see the [Express guide to running behind proxies](https://expressjs.com/en/guide/behind-proxies.html).

---

## TypeScript

Type declarations are described as bundled with the package.

```ts
import express from 'express';
import { rateLimit } from 'sk-rate-limiter';
import type { RateLimitOptions } from 'sk-rate-limiter';

const app = express();

const options: RateLimitOptions = {
  limit: 50,
  windowMs: 30_000,
  keyGenerator: (req) => req.ip || 'unknown'
};

app.use(rateLimit(options));

app.get('/', (_req, res) => {
  res.json({ message: 'TypeScript works!' });
});
```

The `req.rateLimit` property is described in the supplied README. Verify that the published declaration file includes the appropriate Express request augmentation before demonstrating typed access to it.

---

## Testing

### Run the automated tests

Inside the package project:

```bash
npm test
```

If configured in `package.json`, run coverage:

```bash
npm run test:coverage
```

### Manually test a route

Start your Express server, then run:

```bash
for i in {1..8}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    http://localhost:3000/api/users
done
```

For a fresh window with `limit: 5`, the expected status codes are:

```text
200
200
200
200
200
429
429
429
```

If another request already used the quota, or the route returns a different success status, the output may differ.

### Test Redis locally

```bash
docker run -d --name sk-test-redis -p 6380:6379 redis:alpine
```

Configure the test client to connect to port `6380`. If your test suite supports the environment variable shown in the supplied README, run:

```bash
REDIS_TEST_PORT=6380 npm test
```

When finished:

```bash
docker rm -f sk-test-redis
```

---

## Troubleshooting

<details>
<summary><strong>Every request returns 429</strong></summary>

You may have already used the quota in the current window. Wait for reset, restart a local memory-backed server, or temporarily increase the limit. Also check whether multiple routes share a key unexpectedly.

</details>

<details>
<summary><strong>The limiter never blocks requests</strong></summary>

Make sure middleware is registered **before** the protected routes. Check whether the route is excluded, a custom key changes on every request, or `passOnStoreError: true` is letting requests through after a storage failure.

</details>

<details>
<summary><strong>Different users share the same rate limit</strong></summary>

If the app is behind a proxy, check Express `trust proxy` configuration. If every request appears to come from the same proxy IP, the limiter may group users together.

</details>

<details>
<summary><strong>Limits behave differently across multiple servers</strong></summary>

Memory storage is per process. Use a shared Redis store when multiple instances need the same counters.

</details>

<details>
<summary><strong>npm install cannot find the package</strong></summary>

Confirm the package has been published to npm. Until then, install it from a local directory or a package tarball.

</details>

---

## Publishing Checklist

Before publishing a new version:

1. Verify that every documented option exists in the source code.
2. Run the test suite and check the results.
3. Test CommonJS, ESM, and TypeScript imports.
4. Test Redis with each client library you claim to support.
5. Check `package.json` entry points, exports, Node.js engines, and bundled type definitions.
6. Check the npm package contents:

   ```bash
   npm pack --dry-run
   ```

7. Sign in and publish when ready:

   ```bash
   npm login
   npm publish --access public
   ```

8. Update the README and version badge for future releases.

---

## License

[MIT](LICENSE) © Saurabh

---

**[⬆ Back to top](#sk-rate-limiter-)**
