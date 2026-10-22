'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { MemoryStore } = require('../src/index');

describe('MemoryStore Internals & Lifecycle', () => {
  it('resets counter after windowMs expires', async () => {
    const store = new MemoryStore({ cleanupIntervalMs: 0 });
    const windowMs = 50; // 50ms window

    const res1 = await store.increment('client-1', windowMs);
    assert.strictEqual(res1.totalHits, 1);

    const res2 = await store.increment('client-1', windowMs);
    assert.strictEqual(res2.totalHits, 2);

    // Wait 60ms for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Next hit should start a fresh window with count = 1
    const res3 = await store.increment('client-1', windowMs);
    assert.strictEqual(res3.totalHits, 1);

    await store.shutdown();
  });

  it('handles high concurrent increments safely without race conditions', async () => {
    const store = new MemoryStore();
    const windowMs = 5000;
    const concurrentRequests = 100;

    const promises = [];
    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(store.increment('concurrent-key', windowMs));
    }

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 100);

    // The last result totalHits must equal 100
    const finalCheck = await store.increment('concurrent-key', windowMs);
    assert.strictEqual(finalCheck.totalHits, 101);

    await store.shutdown();
  });

  it('cleans up expired entries without affecting active keys', async () => {
    const store = new MemoryStore({ cleanupIntervalMs: 0 });

    // Key 1: expired (10ms)
    await store.increment('expired-key', 10);

    // Key 2: active (5000ms)
    await store.increment('active-key', 5000);

    assert.strictEqual(store.hits.size, 2);

    // Wait 20ms so key 1 expires
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Run cleanup
    store.cleanup();

    assert.strictEqual(store.hits.has('expired-key'), false);
    assert.strictEqual(store.hits.has('active-key'), true);

    await store.shutdown();
  });

  it('evicts oldest keys when maxKeys limit is exceeded', async () => {
    const store = new MemoryStore({ maxKeys: 3, cleanupIntervalMs: 0 });

    await store.increment('key-1', 10000);
    await store.increment('key-2', 10000);
    await store.increment('key-3', 10000);
    assert.strictEqual(store.hits.size, 3);

    // Adding 4th key should trigger eviction
    await store.increment('key-4', 10000);
    assert.ok(store.hits.size <= 3);

    await store.shutdown();
  });

  it('supports decrement, resetKey, resetAll, and shutdown', async () => {
    const store = new MemoryStore();
    await store.increment('key-a', 5000);
    await store.increment('key-a', 5000);
    assert.strictEqual(store.hits.get('key-a').count, 2);

    await store.decrement('key-a');
    assert.strictEqual(store.hits.get('key-a').count, 1);

    await store.resetKey('key-a');
    assert.strictEqual(store.hits.has('key-a'), false);

    await store.increment('key-b', 5000);
    await store.resetAll();
    assert.strictEqual(store.hits.size, 0);

    await store.shutdown();
  });
});
