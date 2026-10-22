import rateLimitCjs from './index.js';

export const rateLimit = rateLimitCjs.rateLimit;
export const MemoryStore = rateLimitCjs.MemoryStore;
export const RedisStore = rateLimitCjs.RedisStore;
export const BaseStore = rateLimitCjs.BaseStore;
export const defaultKeyGenerator = rateLimitCjs.defaultKeyGenerator;
export const normalizeIp = rateLimitCjs.normalizeIp;

export default rateLimitCjs;
