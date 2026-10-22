# sk-rate-limiter

[![npm version](https://img.shields.io/npm/v/sk-rate-limiter)](https://www.npmjs.com/package/sk-rate-limiter)
[![npm downloads](https://img.shields.io/npm/dm/sk-rate-limiter)](https://www.npmjs.com/package/sk-rate-limiter)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D16-brightgreen)](https://nodejs.org/)

A lightweight rate-limiting middleware for Express.js. Protect your APIs from excessive requests with in-memory storage or an optional shared Redis store.

## Features

- **Simple setup** — works with Express applications.
- **Memory storage** — no external database required.
- **Redis storage** — share rate limits across application instances.
- **Route-specific limits** — configure different limits for different endpoints.
- **Custom client keys** — rate-limit by IP, user ID, or API client.
- **Route exclusions** — skip selected paths.
- **Configurable responses and headers** — customize blocked responses and rate-limit headers.
- **Request filtering** — optionally skip successful or failed responses.
- **TypeScript support** — includes type declarations.
- **CommonJS and ESM** — supports both module systems.

## Installation

```bash
npm install sk-rate-limiter
```

## Quick Start

### ES Modules

```js
import express from 'express';
import { rateLimit } from 'sk-rate-limiter';

const app = express();

app.use(rateLimit({
  limit: 100,
  windowMs: 60_000
}));

app.get('/', (req, res) => {
  res.json({ message: 'Hello, world!' });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### CommonJS

```js
const express = require('express');
const { rateLimit } = require('sk-rate-limiter');

const app = express();

app.use(rateLimit({
  limit: 100,
  windowMs: 60_000
}));

app.get('/', (req, res) => {
  res.json({ message: 'Hello, world!' });
});

app.listen(3000);
```

The example allows up to 100 requests per client during a 60-second window. Requests exceeding the configured limit are rejected according to the middleware's response settings.

## Usage

### Different limits for different routes

Use separate middleware instances to protect sensitive endpoints.

```js
app.post(
  '/api/auth/login',
  rateLimit({
    limit: 5,
    windowMs: 15 * 60_000
  }),
  loginHandler
);

app.get(
  '/api/products',
  rateLimit({
    limit: 100,
    windowMs: 60_000
  }),
  productsHandler
);
```

### Route-specific rules

Configure multiple endpoint limits in one middleware.

```js
app.use(rateLimit({
  limit: 100,
  windowMs: 60_000,
  routes: [
    {
      path: '/api/auth/login',
      methods: ['POST'],
      limit: 5,
      windowMs: 15 * 60_000
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

### Exclude routes

Skip rate limiting for selected paths.

```js
app.use(rateLimit({
  limit: 100,
  windowMs: 60_000,
  exclude: ['/health', '/metrics/*']
}));
```

### Custom client identification

By default, clients are identified by IP. You can provide a custom key generator to rate-limit authenticated users separately.

```js
app.use(rateLimit({
  limit: 100,
  windowMs: 60_000,
  keyGenerator: (req) =>
    req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`
}));
```

Run authentication middleware before the limiter when using `req.user`.

### Custom error response

```js
app.use(rateLimit({
  limit: 10,
  windowMs: 60_000,
  message: {
    error: 'Too many requests',
    message: 'Please try again later.'
  }
}));
```

### Skip successful requests

Useful for endpoints where unsuccessful attempts should count toward the limit.

```js
app.use('/api/auth/login', rateLimit({
  limit: 5,
  windowMs: 15 * 60_000,
  skipSuccessfulRequests: true
}));
```

Use `skipFailedRequests: true` when failed responses should not count instead.

## Storage

### Memory (default)

Memory storage requires no additional setup and is suitable for development or single-process applications.

```js
app.use(rateLimit({
  limit: 100,
  windowMs: 60_000
}));
```

**Note:** Memory counters are local to the Node.js process and are lost when it restarts. Multiple application instances do not share their counters.

### Redis

Use Redis when multiple application instances need to share rate-limit counters.

Install the Redis client:

```bash
npm install ioredis
```

Configure the middleware:

```js
import express from 'express';
import Redis from 'ioredis';
import { rateLimit, RedisStore } from 'sk-rate-limiter';

const app = express();
const redis = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379'
);

app.use(rateLimit({
  limit: 100,
  windowMs: 60_000,
  store: new RedisStore({
    client: redis,
    prefix: 'sk-rl:'
  })
}));

app.listen(3000);
```

Ensure Redis is running and configure `REDIS_URL` for your environment. Close the Redis client gracefully when shutting down your application.

## Configuration

| Option | Description |
|---|---|
| `limit` | Maximum requests allowed per window. |
| `windowMs` | Rate-limit window in milliseconds. |
| `keyGenerator` | Function that generates a client-specific key. |
| `store` | Storage backend, such as a memory or Redis store. |
| `routes` | Route-specific rate-limit rules. |
| `exclude` | Paths or requests to exclude from limiting. |
| `message` | Custom response for rate-limited requests. |
| `statusCode` | HTTP status code used for blocked requests. |
| `standardHeaders` | Controls standard rate-limit headers. |
| `legacyHeaders` | Enables legacy `X-RateLimit-*` headers. |
| `skipSuccessfulRequests` | Excludes successful responses from the final count. |
| `skipFailedRequests` | Excludes failed responses from the final count. |
| `passOnStoreError` | Controls whether requests continue when storage fails. |

### Time units

`windowMs` is measured in milliseconds.

| Duration | Value |
|---|---:|
| 1 second | `1_000` |
| 1 minute | `60_000` |
| 15 minutes | `900_000` |
| 1 hour | `3_600_000` |

## Rate-limit responses

When a client exceeds its configured limit, the middleware normally responds with HTTP `429 Too Many Requests`.

Example:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30
```

Actual response bodies and headers depend on your configuration.

## TypeScript

The package includes TypeScript declarations.

```ts
import { rateLimit } from 'sk-rate-limiter';
import type { RateLimitOptions } from 'sk-rate-limiter';

const options: RateLimitOptions = {
  limit: 50,
  windowMs: 30_000,
  keyGenerator: (req) => req.ip || 'unknown'
};

app.use(rateLimit(options));
```

## Important Notes

- Register the middleware before the routes you want to protect.
- Configure Express `trust proxy` carefully when running behind a reverse proxy. Trust only proxies you control.
- Use Redis for shared limits across multiple application instances.
- Choose your storage-error behavior according to your application's availability and security requirements.

## License

[MIT](LICENSE) © Saurabh Kumar

## Links

- [npm package](https://www.npmjs.com/package/sk-rate-limiter)
- [GitHub repository](https://github.com/saurabh0772/sk-rate-limiter)
- [Report an issue](https://github.com/saurabh0772/sk-rate-limiter/issues)
