'use strict';

const rateLimit = require('./middleware');
const MemoryStore = require('./stores/memory');
const RedisStore = require('./stores/redis');
const BaseStore = require('./stores/base');
const { defaultKeyGenerator, normalizeIp } = require('./core/keyGenerator');

// Allow both:
// const { rateLimit } = require('sk-rate-limiter');
// const rateLimit = require('sk-rate-limiter');
rateLimit.rateLimit = rateLimit;
rateLimit.default = rateLimit;
rateLimit.MemoryStore = MemoryStore;
rateLimit.RedisStore = RedisStore;
rateLimit.BaseStore = BaseStore;
rateLimit.defaultKeyGenerator = defaultKeyGenerator;
rateLimit.normalizeIp = normalizeIp;

module.exports = rateLimit;
