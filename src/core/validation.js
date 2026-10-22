'use strict';

const { defaultKeyGenerator } = require('./keyGenerator');

const DEFAULT_OPTIONS = {
  limit: 60,
  windowMs: 60 * 1000, // 1 minute in milliseconds
  statusCode: 429,
  message: {
    error: 'Too many requests',
    status: 429
  },
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  requestPropertyName: 'rateLimit',
  prefix: 'sk-rl',
  exclude: [],
  routes: []
};

/**
 * Validates and normalizes user configuration options.
 * Throws descriptive TypeError or RangeError on invalid options.
 *
 * @param {import('../../types').RateLimitOptions} [userOptions]
 * @returns {Record<string, any>} Normalized configuration options
 */
function validateOptions(userOptions = {}) {
  if (userOptions !== null && typeof userOptions !== 'object') {
    throw new TypeError('[sk-rate-limiter] Options must be an object');
  }

  const options = { ...DEFAULT_OPTIONS, ...userOptions };

  // 1. Validate limit
  if (options.limit !== undefined) {
    if (typeof options.limit !== 'number' || !Number.isInteger(options.limit) || options.limit <= 0) {
      throw new RangeError('[sk-rate-limiter] "limit" must be a positive integer greater than 0');
    }
  }

  // 2. Validate windowMs
  if (typeof options.windowMs !== 'number' || options.windowMs <= 0 || !Number.isFinite(options.windowMs)) {
    throw new RangeError('[sk-rate-limiter] "windowMs" must be a positive number of milliseconds');
  }

  // 3. Validate statusCode
  if (typeof options.statusCode !== 'number' || !Number.isInteger(options.statusCode) || options.statusCode < 400 || options.statusCode > 599) {
    throw new RangeError('[sk-rate-limiter] "statusCode" must be a valid HTTP client error code (400-599)');
  }

  // 4. Validate message
  if (
    typeof options.message !== 'string' &&
    typeof options.message !== 'object' &&
    typeof options.message !== 'function'
  ) {
    throw new TypeError('[sk-rate-limiter] "message" must be a string, object, or response function');
  }

  // 5. Validate keyGenerator
  if (options.keyGenerator !== undefined) {
    if (typeof options.keyGenerator !== 'function') {
      throw new TypeError('[sk-rate-limiter] "keyGenerator" must be a function');
    }
  } else {
    options.keyGenerator = defaultKeyGenerator;
  }

  // 6. Validate store if provided
  if (options.store !== undefined && options.store !== null) {
    if (typeof options.store !== 'object' || typeof options.store.increment !== 'function') {
      throw new TypeError('[sk-rate-limiter] "store" must be an object implementing the increment(key, windowMs) method');
    }
  }

  // 7. Validate standardHeaders & legacyHeaders
  if (typeof options.standardHeaders !== 'boolean' && typeof options.standardHeaders !== 'string') {
    throw new TypeError('[sk-rate-limiter] "standardHeaders" must be a boolean or draft string (e.g. "draft-7", "draft-6")');
  }
  if (typeof options.legacyHeaders !== 'boolean') {
    throw new TypeError('[sk-rate-limiter] "legacyHeaders" must be a boolean');
  }

  // 8. Validate passOnStoreError, skipSuccessfulRequests, skipFailedRequests
  if (typeof options.passOnStoreError !== 'boolean') {
    throw new TypeError('[sk-rate-limiter] "passOnStoreError" must be a boolean');
  }
  if (typeof options.skipSuccessfulRequests !== 'boolean') {
    throw new TypeError('[sk-rate-limiter] "skipSuccessfulRequests" must be a boolean');
  }
  if (typeof options.skipFailedRequests !== 'boolean') {
    throw new TypeError('[sk-rate-limiter] "skipFailedRequests" must be a boolean');
  }

  // 9. Validate onLimitReached
  if (options.onLimitReached !== undefined && typeof options.onLimitReached !== 'function') {
    throw new TypeError('[sk-rate-limiter] "onLimitReached" must be a function');
  }

  // 10. Validate exclude
  if (options.exclude !== undefined) {
    if (typeof options.exclude !== 'function' && !Array.isArray(options.exclude)) {
      throw new TypeError('[sk-rate-limiter] "exclude" must be an array of paths or a predicate function');
    }
    if (Array.isArray(options.exclude)) {
      for (let i = 0; i < options.exclude.length; i++) {
        const item = options.exclude[i];
        if (typeof item !== 'string' && (typeof item !== 'object' || item === null || typeof item.path !== 'string')) {
          throw new TypeError(`[sk-rate-limiter] "exclude[${i}]" must be a string path or an object with a "path" string`);
        }
      }
    }
  }

  // 11. Validate routes
  if (options.routes !== undefined) {
    if (!Array.isArray(options.routes)) {
      throw new TypeError('[sk-rate-limiter] "routes" must be an array of route rule objects');
    }
    for (let i = 0; i < options.routes.length; i++) {
      const route = options.routes[i];
      if (typeof route !== 'object' || route === null) {
        throw new TypeError(`[sk-rate-limiter] "routes[${i}]" must be an object`);
      }
      if (typeof route.path !== 'string' || route.path.trim().length === 0) {
        throw new TypeError(`[sk-rate-limiter] "routes[${i}].path" must be a non-empty string`);
      }
      if (typeof route.limit !== 'number' || !Number.isInteger(route.limit) || route.limit <= 0) {
        throw new RangeError(`[sk-rate-limiter] "routes[${i}].limit" must be a positive integer greater than 0`);
      }
      if (route.windowMs !== undefined) {
        if (typeof route.windowMs !== 'number' || route.windowMs <= 0 || !Number.isFinite(route.windowMs)) {
          throw new RangeError(`[sk-rate-limiter] "routes[${i}].windowMs" must be a positive number`);
        }
      }
      if (route.methods !== undefined) {
        if (!Array.isArray(route.methods) || route.methods.some((m) => typeof m !== 'string')) {
          throw new TypeError(`[sk-rate-limiter] "routes[${i}].methods" must be an array of HTTP method strings`);
        }
      }
      if (route.keyGenerator !== undefined && typeof route.keyGenerator !== 'function') {
        throw new TypeError(`[sk-rate-limiter] "routes[${i}].keyGenerator" must be a function`);
      }
    }
  }

  return options;
}

module.exports = {
  DEFAULT_OPTIONS,
  validateOptions
};
