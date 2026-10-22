'use strict';

const { validateOptions } = require('./core/validation');
const { resolveClientKey, buildStoreKey } = require('./core/keyGenerator');
const {
  compileExclusions,
  compileRoutes,
  isExcluded,
  findMatchingRoute
} = require('./core/routeMatcher');
const MemoryStore = require('./stores/memory');
const { setRateLimitHeaders } = require('./utils/headers');
const { sendRateLimitResponse, sendStoreErrorResponse } = require('./utils/response');

/**
 * Creates an Express rate-limiting middleware.
 *
 * @param {import('../types').RateLimitOptions} [userOptions]
 * @returns {import('express').RequestHandler}
 */
function rateLimit(userOptions = {}) {
  const options = validateOptions(userOptions);
  const store = options.store || new MemoryStore();

  const compiledExclusions = compileExclusions(options.exclude);
  const compiledRoutes = compileRoutes(options.routes);

  /**
   * Express middleware handler
   */
  const middleware = async function rateLimitMiddleware(req, res, next) {
    // 1. Check exclusions
    if (isExcluded(req, compiledExclusions)) {
      return next();
    }

    // 2. Route matching or global fallback
    const matchedRoute = findMatchingRoute(req, compiledRoutes);

    const activeLimit = matchedRoute ? matchedRoute.limit : options.limit;
    const activeWindowMs = matchedRoute?.windowMs || options.windowMs;
    const activeStatusCode = matchedRoute?.statusCode || options.statusCode;
    const activeMessage = matchedRoute?.message !== undefined ? matchedRoute.message : options.message;
    const activeKeyGen = matchedRoute?.keyGenerator || options.keyGenerator;
    const scope = matchedRoute ? matchedRoute.id : 'global';

    // 3. Resolve client key
    const clientKey = await resolveClientKey(activeKeyGen, req);
    const storeKey = buildStoreKey(options.prefix, scope, clientKey);

    // 4. Increment store
    let storeResult;
    try {
      storeResult = await store.increment(storeKey, activeWindowMs);
    } catch (storeErr) {
      if (options.passOnStoreError) {
        if (process.env.NODE_ENV !== 'test') {
          console.warn('[sk-rate-limiter] Store error encountered; passing request through:', storeErr.message);
        }
        return next();
      } else {
        return sendStoreErrorResponse(req, res);
      }
    }

    const { totalHits, resetTime, remainingMs } = storeResult;
    const remaining = Math.max(0, activeLimit - totalHits);

    // 5. Attach rate limit info to request object
    const rateLimitInfo = {
      limit: activeLimit,
      current: totalHits,
      remaining,
      resetTime
    };

    if (options.requestPropertyName) {
      req[options.requestPropertyName] = rateLimitInfo;
    }

    // 6. Set response headers
    setRateLimitHeaders(
      res,
      {
        limit: activeLimit,
        totalHits,
        resetTime,
        remainingMs,
        windowMs: activeWindowMs
      },
      options
    );

    // 7. Handle skipSuccessfulRequests or skipFailedRequests
    if (options.skipSuccessfulRequests || options.skipFailedRequests) {
      let decremented = false;

      const handleResponseOutcome = () => {
        if (decremented) return;
        decremented = true;

        const isSuccess = res.statusCode >= 200 && res.statusCode < 400;
        const isFailed = res.statusCode >= 400;

        if (
          (options.skipSuccessfulRequests && isSuccess) ||
          (options.skipFailedRequests && isFailed)
        ) {
          store.decrement(storeKey).catch(() => {});
        }
      };

      res.once('finish', handleResponseOutcome);
      res.once('close', handleResponseOutcome);
    }

    // 8. Check limit violation
    if (totalHits > activeLimit) {
      if (typeof options.onLimitReached === 'function') {
        try {
          options.onLimitReached(req, res, {
            limit: activeLimit,
            current: totalHits,
            resetTime
          });
        } catch (callbackErr) {
          // Prevent callback errors from crashing middleware
        }
      }

      return sendRateLimitResponse(req, res, {
        statusCode: activeStatusCode,
        message: activeMessage
      });
    }

    // Request is allowed within limit
    return next();
  };

  // Expose store and reset helpers on middleware function for testing and management
  middleware.store = store;
  middleware.resetKey = (key) => store.resetKey(key);
  middleware.shutdown = () => store.shutdown();

  return middleware;
}

module.exports = rateLimit;
