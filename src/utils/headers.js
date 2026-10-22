'use strict';

/**
 * Sets standard and legacy rate limit headers on the HTTP response.
 *
 * @param {import('express').Response} res
 * @param {object} info
 * @param {number} info.limit - Configured maximum requests allowed
 * @param {number} info.totalHits - Current hit count
 * @param {Date} info.resetTime - Window expiration timestamp
 * @param {number} info.remainingMs - Milliseconds remaining until window reset
 * @param {number} info.windowMs - Total window duration in milliseconds
 * @param {object} options
 * @param {boolean|string} [options.standardHeaders=true] - Send RateLimit-* headers
 * @param {boolean} [options.legacyHeaders=false] - Send X-RateLimit-* headers
 */
function setRateLimitHeaders(res, info, options) {
  if (!res || res.headersSent) {
    return;
  }

  const { limit, totalHits, resetTime, remainingMs, windowMs } = info;
  const remaining = Math.max(0, limit - totalHits);
  const resetDeltaSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  // 1. Standard IETF headers (draft-7 format)
  if (options.standardHeaders) {
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetDeltaSeconds));
    res.setHeader('RateLimit-Policy', `${limit};w=${windowSeconds}`);
  }

  // 2. Legacy X-RateLimit-* headers
  if (options.legacyHeaders) {
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetTime.getTime() / 1000)));
  }

  // 3. Retry-After header when limit is exceeded
  if (totalHits > limit) {
    res.setHeader('Retry-After', String(Math.max(1, resetDeltaSeconds)));
  }
}

module.exports = {
  setRateLimitHeaders
};
