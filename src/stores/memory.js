'use strict';

const BaseStore = require('./base');

/**
 * In-memory fixed window store for single-instance Node.js applications.
 * Default store used when no custom store is provided.
 */
class MemoryStore extends BaseStore {
  /**
   * @param {object} [options]
   * @param {number} [options.cleanupIntervalMs=60000] - Interval to purge expired records (ms)
   * @param {number} [options.maxKeys=100000] - Max keys retained in memory before eviction
   */
  constructor(options = {}) {
    super();
    this.cleanupIntervalMs =
      typeof options.cleanupIntervalMs === 'number' && options.cleanupIntervalMs > 0
        ? options.cleanupIntervalMs
        : 60 * 1000;
    this.maxKeys =
      typeof options.maxKeys === 'number' && options.maxKeys > 0
        ? options.maxKeys
        : 100000;

    /** @type {Map<string, { count: number, resetTime: number }>} */
    this.hits = new Map();

    // Start background cleanup interval, unref'd so it doesn't prevent Node process exit
    if (this.cleanupIntervalMs > 0) {
      this.intervalId = setInterval(() => {
        this.cleanup();
      }, this.cleanupIntervalMs);

      if (this.intervalId.unref) {
        this.intervalId.unref();
      }
    }
  }

  /**
   * Increments the counter for a given key within a window.
   *
   * @param {string} key
   * @param {number} windowMs
   * @returns {Promise<{ totalHits: number, resetTime: Date, remainingMs: number }>}
   */
  async increment(key, windowMs) {
    const now = Date.now();
    let entry = this.hits.get(key);

    if (!entry || now >= entry.resetTime) {
      // Evict if map exceeds maximum allowed keys
      if (this.hits.size >= this.maxKeys) {
        this.cleanup();
        // If still full, remove the oldest entry
        if (this.hits.size >= this.maxKeys) {
          const firstKey = this.hits.keys().next().value;
          if (firstKey) this.hits.delete(firstKey);
        }
      }

      entry = {
        count: 1,
        resetTime: now + windowMs
      };
      this.hits.set(key, entry);
    } else {
      entry.count += 1;
    }

    const remainingMs = Math.max(0, entry.resetTime - now);

    return {
      totalHits: entry.count,
      resetTime: new Date(entry.resetTime),
      remainingMs
    };
  }

  /**
   * Decrements the counter for a given key.
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  async decrement(key) {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (entry && now < entry.resetTime && entry.count > 0) {
      entry.count -= 1;
    }
  }

  /**
   * Resets the counter for a specific key.
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  async resetKey(key) {
    this.hits.delete(key);
  }

  /**
   * Resets all stored counters.
   *
   * @returns {Promise<void>}
   */
  async resetAll() {
    this.hits.clear();
  }

  /**
   * Safe garbage collection: removes expired entries without touching active counters.
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.hits.entries()) {
      if (now >= entry.resetTime) {
        this.hits.delete(key);
      }
    }
  }

  /**
   * Shuts down cleanup timers and clears memory.
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.hits.clear();
  }
}

module.exports = MemoryStore;
