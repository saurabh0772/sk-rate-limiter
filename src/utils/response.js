'use strict';

/**
 * Sends a rate limit exceeded response.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} options - Configured limiter options
 */
function sendRateLimitResponse(req, res, options) {
  if (res.headersSent) {
    return;
  }

  const statusCode = options.statusCode || 429;
  const message = options.message;

  // Custom handler function
  if (typeof message === 'function') {
    return message(req, res, options);
  }

  // String message
  if (typeof message === 'string') {
    return res.status(statusCode).json({
      error: message,
      status: statusCode
    });
  }

  // Object / JSON message
  if (message && typeof message === 'object') {
    return res.status(statusCode).json(message);
  }

  // Default fallback
  return res.status(statusCode).json({
    error: 'Too many requests',
    status: statusCode
  });
}

/**
 * Sends an error response when store fails and passOnStoreError is false.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function sendStoreErrorResponse(req, res) {
  if (res.headersSent) {
    return;
  }

  return res.status(500).json({
    error: 'Rate limiter storage unavailable',
    status: 500
  });
}

module.exports = {
  sendRateLimitResponse,
  sendStoreErrorResponse
};
