'use strict';

const BaseStore = require('./base');

const INCREMENT_LUA_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { current, ttl }
`;

const DECREMENT_LUA_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current and tonumber(current) > 0 then
  return redis.call('DECR', KEYS[1])
end
return 0
`;

/**
 * Executes a Lua script across different Redis client libraries (ioredis or node-redis).
 *
 * @param {object} client - Redis client instance
 * @param {string} script - Lua script string
 * @param {string[]} keys - Key arguments
 * @param {string[]} args - Value arguments
 * @returns {Promise<any>}
 */
async function executeLua(client, script, keys, args) {
  if (!client || typeof client.eval !== 'function') {
    throw new Error('[sk-rate-limiter] A valid Redis client with an eval() method is required');
  }

  // Detect node-redis v4+ vs ioredis
  // In node-redis v4+, client.eval accepts (script, { keys, arguments })
  // In ioredis, client.eval accepts (script, numKeys, ...keys, ...args)
  const isNodeRedisV4 = typeof client.isOpen === 'boolean' || (client.options && !client.status);

  if (isNodeRedisV4) {
    try {
      return await client.eval(script, {
        keys,
        arguments: args.map(String)
      });
    } catch (nodeRedisErr) {
      // Fallback to ioredis format if object parameter signature failed
      return await client.eval(script, keys.length, ...keys, ...args);
    }
  }

  // Default: ioredis format
  return await client.eval(script, keys.length, ...keys, ...args);
}

/**
 * Distributed Redis store using atomic Lua scripts.
 */
class RedisStore extends BaseStore {
  /**
   * @param {object} options
   * @param {object} options.client - An active ioredis or redis client instance
   * @param {string} [options.prefix='sk-rl:'] - Key prefix for rate limiter entries in Redis
   */
  constructor(options = {}) {
    super();

    if (!options.client) {
      throw new Error(
        '[sk-rate-limiter] RedisStore requires an active Redis client passed via options.client'
      );
    }

    this.client = options.client;
    this.prefix = typeof options.prefix === 'string' ? options.prefix : 'sk-rl:';
  }

  /**
   * Resolves the full Redis key with configured prefix.
   *
   * @param {string} key
   * @returns {string}
   */
  prefixKey(key) {
    return `${this.prefix}${key}`;
  }

  /**
   * Atomically increments the counter and guarantees TTL expiry in Redis.
   *
   * @param {string} key
   * @param {number} windowMs
   * @returns {Promise<{ totalHits: number, resetTime: Date, remainingMs: number }>}
   */
  async increment(key, windowMs) {
    const fullKey = this.prefixKey(key);
    const windowMsStr = Math.round(windowMs).toString();

    const result = await executeLua(
      this.client,
      INCREMENT_LUA_SCRIPT,
      [fullKey],
      [windowMsStr]
    );

    const [current, ttl] = Array.isArray(result) ? result : [result, windowMs];
    const totalHits = Number(current);
    const remainingMs = Math.max(0, Number(ttl));
    const resetTime = new Date(Date.now() + remainingMs);

    return {
      totalHits,
      resetTime,
      remainingMs
    };
  }

  /**
   * Atomically decrements the counter if it exists.
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  async decrement(key) {
    const fullKey = this.prefixKey(key);
    try {
      await executeLua(this.client, DECREMENT_LUA_SCRIPT, [fullKey], []);
    } catch (err) {
      // Best-effort decrement, do not throw
    }
  }

  /**
   * Deletes a key from Redis.
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  async resetKey(key) {
    const fullKey = this.prefixKey(key);
    if (typeof this.client.del === 'function') {
      await this.client.del(fullKey);
    }
  }

  /**
   * Cleans up or disconnects store client if needed.
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    // If the consumer manages the client, we leave connection open.
    // BaseStore contract implementation
  }
}

module.exports = RedisStore;
