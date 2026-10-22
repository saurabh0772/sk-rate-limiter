'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { rateLimit } = require('../src/index');

describe('Configuration Validation', () => {
  it('rejects non-object options', () => {
    assert.throws(() => rateLimit('invalid'), /Options must be an object/);
    assert.throws(() => rateLimit(123), /Options must be an object/);
  });

  it('rejects invalid limit values', () => {
    assert.throws(() => rateLimit({ limit: 0 }), /"limit" must be a positive integer/);
    assert.throws(() => rateLimit({ limit: -5 }), /"limit" must be a positive integer/);
    assert.throws(() => rateLimit({ limit: 2.5 }), /"limit" must be a positive integer/);
    assert.throws(() => rateLimit({ limit: '10' }), /"limit" must be a positive integer/);
  });

  it('rejects invalid windowMs values', () => {
    assert.throws(() => rateLimit({ windowMs: 0 }), /"windowMs" must be a positive number/);
    assert.throws(() => rateLimit({ windowMs: -1000 }), /"windowMs" must be a positive number/);
    assert.throws(() => rateLimit({ windowMs: '60000' }), /"windowMs" must be a positive number/);
    assert.throws(() => rateLimit({ windowMs: NaN }), /"windowMs" must be a positive number/);
  });

  it('rejects invalid statusCode values', () => {
    assert.throws(() => rateLimit({ statusCode: 200 }), /"statusCode" must be a valid HTTP client error/);
    assert.throws(() => rateLimit({ statusCode: 600 }), /"statusCode" must be a valid HTTP client error/);
    assert.throws(() => rateLimit({ statusCode: '429' }), /"statusCode" must be a valid HTTP client error/);
  });

  it('rejects invalid message values', () => {
    assert.throws(() => rateLimit({ message: 123 }), /"message" must be a string, object, or response function/);
    assert.throws(() => rateLimit({ message: true }), /"message" must be a string, object, or response function/);
  });

  it('rejects invalid keyGenerator', () => {
    assert.throws(() => rateLimit({ keyGenerator: 'ip' }), /"keyGenerator" must be a function/);
    assert.throws(() => rateLimit({ keyGenerator: {} }), /"keyGenerator" must be a function/);
  });

  it('rejects invalid store objects', () => {
    assert.throws(() => rateLimit({ store: 'memory' }), /"store" must be an object implementing the increment/);
    assert.throws(() => rateLimit({ store: {} }), /"store" must be an object implementing the increment/);
  });

  it('rejects invalid header flags', () => {
    assert.throws(() => rateLimit({ standardHeaders: 123 }), /"standardHeaders" must be a boolean or draft string/);
    assert.throws(() => rateLimit({ legacyHeaders: 'true' }), /"legacyHeaders" must be a boolean/);
  });

  it('rejects invalid boolean policy flags', () => {
    assert.throws(() => rateLimit({ passOnStoreError: 'yes' }), /"passOnStoreError" must be a boolean/);
    assert.throws(() => rateLimit({ skipSuccessfulRequests: 1 }), /"skipSuccessfulRequests" must be a boolean/);
    assert.throws(() => rateLimit({ skipFailedRequests: null }), /"skipFailedRequests" must be a boolean/);
  });

  it('rejects invalid onLimitReached callback', () => {
    assert.throws(() => rateLimit({ onLimitReached: 'log' }), /"onLimitReached" must be a function/);
  });

  it('rejects invalid exclude options', () => {
    assert.throws(() => rateLimit({ exclude: 'health' }), /"exclude" must be an array of paths or a predicate function/);
    assert.throws(() => rateLimit({ exclude: [123] }), /"exclude\[0\]" must be a string path/);
  });

  it('rejects invalid route definitions', () => {
    assert.throws(() => rateLimit({ routes: 'all' }), /"routes" must be an array of route rule objects/);
    assert.throws(() => rateLimit({ routes: [{ path: '' }] }), /"routes\[0\].path" must be a non-empty string/);
    assert.throws(() => rateLimit({ routes: [{ path: '/api', limit: -1 }] }), /"routes\[0\].limit" must be a positive integer/);
    assert.throws(() => rateLimit({ routes: [{ path: '/api', limit: 10, windowMs: -5 }] }), /"routes\[0\].windowMs" must be a positive number/);
    assert.throws(() => rateLimit({ routes: [{ path: '/api', limit: 10, methods: 'GET' }] }), /"routes\[0\].methods" must be an array/);
    assert.throws(() => rateLimit({ routes: [{ path: '/api', limit: 10, keyGenerator: 'user' }] }), /"routes\[0\].keyGenerator" must be a function/);
  });
});
