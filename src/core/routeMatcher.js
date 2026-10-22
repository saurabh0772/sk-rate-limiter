'use strict';

/**
 * Extracts normalized request path, handling query strings, fragments, and mounted routers.
 *
 * @param {import('express').Request} req
 * @returns {string} Normalized path (e.g. '/api/users')
 */
function getRequestPath(req) {
  if (!req) return '/';

  let raw = '';
  if (typeof req.originalUrl === 'string' && req.originalUrl.length > 0) {
    raw = req.originalUrl;
  } else {
    raw = (req.baseUrl || '') + (req.path || '/');
  }

  // Strip query string and fragment
  const queryIndex = raw.indexOf('?');
  if (queryIndex !== -1) {
    raw = raw.substring(0, queryIndex);
  }
  const hashIndex = raw.indexOf('#');
  if (hashIndex !== -1) {
    raw = raw.substring(0, hashIndex);
  }

  // Normalize multiple slashes to single slash
  let path = raw.replace(/\/+/g, '/');

  // Strip trailing slash if path is longer than 1 character
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  return path || '/';
}

/**
 * Compiles a path pattern (with optional wildcards) into a RegExp.
 * Supports:
 * - Exact path: '/login'
 * - Single-level wildcard: '/users/*' (matches '/users/123', but not '/users/123/profile')
 * - Multi-level wildcard: '/api/**' (matches '/api/v1', '/api/v1/users', etc.)
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
function compilePattern(pattern) {
  if (typeof pattern !== 'string') {
    throw new TypeError('Path pattern must be a string');
  }

  // Clean trailing slash for consistency
  let cleaned = pattern.trim().replace(/\/+/g, '/');
  if (cleaned.length > 1 && cleaned.endsWith('/') && !cleaned.endsWith('*/')) {
    cleaned = cleaned.slice(0, -1);
  }

  // Escape regex special characters, except for '*'
  const escaped = cleaned.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  // Single-pass replacement for '**' (any subpath) and '*' (single path segment)
  const regexStr = escaped.replace(/\*\*|\*/g, (match) => {
    return match === '**' ? '.*' : '[^/]+';
  });

  // Allow optional trailing slash at the end
  return new RegExp(`^${regexStr}/?$`, 'i');
}

/**
 * Checks if a request path and method match a pattern and method filter.
 *
 * @param {string} reqPath - Normalized request path
 * @param {string} reqMethod - Normalized request method
 * @param {string|RegExp} pattern - Compiled pattern or path string
 * @param {string[]} [methods] - Allowed HTTP methods
 * @returns {boolean}
 */
function matchesRoute(reqPath, reqMethod, pattern, methods) {
  // 1. Method check
  if (methods && Array.isArray(methods) && methods.length > 0) {
    const methodUpper = (reqMethod || 'GET').toUpperCase();
    const matchedMethod = methods.some((m) => m.toUpperCase() === methodUpper);
    if (!matchedMethod) {
      return false;
    }
  }

  // 2. Path check
  if (pattern instanceof RegExp) {
    return pattern.test(reqPath);
  }

  const compiled = compilePattern(pattern);
  return compiled.test(reqPath);
}

/**
 * Pre-compiles route rules for fast lookup during request handling.
 *
 * @param {Array<object>} routes
 * @returns {Array<object>}
 */
function compileRoutes(routes = []) {
  if (!Array.isArray(routes)) return [];

  return routes.map((route, index) => {
    return {
      id: `route_${index}_${route.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
      path: route.path,
      regex: compilePattern(route.path),
      methods: route.methods ? route.methods.map((m) => m.toUpperCase()) : null,
      limit: route.limit,
      windowMs: route.windowMs,
      statusCode: route.statusCode,
      message: route.message,
      keyGenerator: route.keyGenerator
    };
  });
}

/**
 * Pre-compiles exclusion rules.
 *
 * @param {Array<string|object>|Function} exclude
 * @returns {Array<object>|Function}
 */
function compileExclusions(exclude) {
  if (typeof exclude === 'function') {
    return exclude;
  }
  if (!Array.isArray(exclude)) {
    return [];
  }

  return exclude.map((item) => {
    if (typeof item === 'string') {
      return {
        regex: compilePattern(item),
        methods: null
      };
    }
    return {
      regex: compilePattern(item.path),
      methods: item.methods ? item.methods.map((m) => m.toUpperCase()) : null
    };
  });
}

/**
 * Checks if a request should be excluded from rate limiting.
 *
 * @param {import('express').Request} req
 * @param {Array<object>|Function} compiledExclusions
 * @returns {boolean}
 */
function isExcluded(req, compiledExclusions) {
  if (!compiledExclusions) return false;

  if (typeof compiledExclusions === 'function') {
    try {
      return Boolean(compiledExclusions(req));
    } catch (e) {
      return false;
    }
  }

  if (Array.isArray(compiledExclusions) && compiledExclusions.length > 0) {
    const reqPath = getRequestPath(req);
    const reqMethod = (req.method || 'GET').toUpperCase();

    for (let i = 0; i < compiledExclusions.length; i++) {
      const exclusion = compiledExclusions[i];
      if (matchesRoute(reqPath, reqMethod, exclusion.regex, exclusion.methods)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Finds the first matching route rule for a request.
 *
 * @param {import('express').Request} req
 * @param {Array<object>} compiledRoutes
 * @returns {object|null} Matching compiled route or null
 */
function findMatchingRoute(req, compiledRoutes) {
  if (!Array.isArray(compiledRoutes) || compiledRoutes.length === 0) {
    return null;
  }

  const reqPath = getRequestPath(req);
  const reqMethod = (req.method || 'GET').toUpperCase();

  for (let i = 0; i < compiledRoutes.length; i++) {
    const route = compiledRoutes[i];
    if (matchesRoute(reqPath, reqMethod, route.regex, route.methods)) {
      return route;
    }
  }

  return null;
}

module.exports = {
  getRequestPath,
  compilePattern,
  matchesRoute,
  compileRoutes,
  compileExclusions,
  isExcluded,
  findMatchingRoute
};
