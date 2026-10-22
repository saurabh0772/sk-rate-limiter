'use strict';

/**
 * Base abstract class defining the Store contract for sk-rate-limiter.
 */
class BaseStore {
  /**
   * Increments the counter for a given key within a window.
   *
   * @param {string} key - Unique store key
   * @param {number} windowMs - Window duration in milliseconds
   * @returns {Promise<{ totalHits: number, resetTime: Date, remainingMs: number }>}
   */
  async increment(key, windowMs) {
    throw new Error('Store must implement increment(key, windowMs)');
  }

  /**
   * Decrements the counter for a given key (used for skipSuccessfulRequests / skipFailedRequests).
   *
   * @param {string} key - Unique store key
   * @returns {Promise<void>}
   */
  async decrement(key) {
    // Optional implementation in store, no-op by default
  }

  /**
   * Resets the counter for a specific key.
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  async resetKey(key) {
    // Optional implementation
  }

  /**
   * Resets all stored counters.
   *
   * @returns {Promise<void>}
   */
  async resetAll() {
    // Optional implementation
  }

  /**
   * Cleans up timers, connections, or resources.
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    // Optional implementation
  }
}

module.exports = BaseStore;
