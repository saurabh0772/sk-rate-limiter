'use strict';

/**
 * Normalizes an IP address, handling IPv6 mapped IPv4 addresses.
 * E.g., '::ffff:127.0.0.1' -> '127.0.0.1'
 *
 * @param {string} ip
 * @returns {string}
 */
function normalizeIp(ip) {
  if (!ip || typeof ip !== 'string') {
    return '127.0.0.1';
  }

  let cleaned = ip.trim();

  // Handle IPv6 mapped IPv4 address
  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.substring(7);
  }

  return cleaned || '127.0.0.1';
}

/**
 * Default key generator using client IP.
 * Uses Express's req.ip (which correctly honors 'trust proxy' setting),
 * falling back to socket.remoteAddress or connection.remoteAddress.
 *
 * @param {import('express').Request} req
 * @returns {string} Client IP address
 */
function defaultKeyGenerator(req) {
  if (!req) return '127.0.0.1';

  // Express populated req.ip (trust proxy aware)
  if (typeof req.ip === 'string' && req.ip.length > 0) {
    return normalizeIp(req.ip);
  }

  // Socket remote address fallback
  const socketAddress =
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    req.info?.remoteAddress;

  if (typeof socketAddress === 'string' && socketAddress.length > 0) {
    return normalizeIp(socketAddress);
  }

  return '127.0.0.1';
}

/**
 * Resolves a client key using the provided keyGenerator and normalizes it.
 *
 * @param {Function} keyGen
 * @param {import('express').Request} req
 * @returns {Promise<string>}
 */
async function resolveClientKey(keyGen, req) {
  try {
    const rawKey = await keyGen(req);
    if (rawKey === undefined || rawKey === null || rawKey === '') {
      return defaultKeyGenerator(req);
    }
    return String(rawKey);
  } catch (err) {
    // If custom key generator throws, fall back to safe IP
    return defaultKeyGenerator(req);
  }
}

/**
 * Builds a namespaced store key.
 *
 * @param {string} prefix - General prefix (e.g. 'sk-rl')
 * @param {string} scope - Scope identifier ('global' or route-specific identifier)
 * @param {string} clientKey - Sanitized client identifier
 * @returns {string}
 */
function buildStoreKey(prefix, scope, clientKey) {
  return `${prefix}:${scope}:${clientKey}`;
}

module.exports = {
  normalizeIp,
  defaultKeyGenerator,
  resolveClientKey,
  buildStoreKey
};
