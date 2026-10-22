import type { Request, Response, NextFunction, RequestHandler } from 'express';

export interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: Date;
}

declare global {
  namespace Express {
    interface Request {
      rateLimit?: RateLimitInfo;
      [key: string]: any;
    }
  }
}

export interface StoreResult {
  totalHits: number;
  resetTime: Date;
  remainingMs: number;
}

export interface Store {
  increment(key: string, windowMs: number): Promise<StoreResult>;
  decrement?(key: string): Promise<void>;
  resetKey?(key: string): Promise<void>;
  resetAll?(): Promise<void>;
  shutdown?(): Promise<void>;
}

export interface MemoryStoreOptions {
  cleanupIntervalMs?: number;
  maxKeys?: number;
}

export class BaseStore implements Store {
  increment(key: string, windowMs: number): Promise<StoreResult>;
  decrement(key: string): Promise<void>;
  resetKey(key: string): Promise<void>;
  resetAll(): Promise<void>;
  shutdown(): Promise<void>;
}

export class MemoryStore extends BaseStore {
  constructor(options?: MemoryStoreOptions);
  hits: Map<string, { count: number; resetTime: number }>;
  cleanup(): void;
}

export interface RedisStoreOptions {
  client: any;
  prefix?: string;
}

export class RedisStore extends BaseStore {
  constructor(options: RedisStoreOptions);
  client: any;
  prefix: string;
}

export interface RouteRule {
  /**
   * Target path or wildcard pattern (e.g. '/login', '/api/*', '/users/**')
   */
  path: string;
  /**
   * HTTP methods to apply this rule to (e.g. ['POST']). If omitted, applies to all methods.
   */
  methods?: string[];
  /**
   * Maximum requests allowed within windowMs for this route
   */
  limit: number;
  /**
   * Time window in milliseconds (defaults to global windowMs if omitted)
   */
  windowMs?: number;
  /**
   * Custom HTTP status code when exceeded (default 429)
   */
  statusCode?: number;
  /**
   * Custom rejection message, object, or function
   */
  message?: string | Record<string, any> | ((req: Request, res: Response, options: any) => any);
  /**
   * Route-specific key generator
   */
  keyGenerator?: (req: Request) => string | Promise<string>;
}

export type ExcludeOption =
  | string
  | { path: string; methods?: string[] }
  | ((req: Request) => boolean);

export interface RateLimitOptions {
  /**
   * Maximum requests allowed within the window.
   * @default 60
   */
  limit?: number;

  /**
   * Duration of the rate limit window in milliseconds.
   * @default 60000 (1 minute)
   */
  windowMs?: number;

  /**
   * HTTP status code to return when rate limit is exceeded.
   * @default 429
   */
  statusCode?: number;

  /**
   * Response message, JSON payload, or custom handler when rate limit is exceeded.
   * @default { error: "Too many requests", status: 429 }
   */
  message?: string | Record<string, any> | ((req: Request, res: Response, options: any) => any);

  /**
   * Enable IETF draft standard RateLimit-* headers.
   * @default true
   */
  standardHeaders?: boolean | 'draft-6' | 'draft-7';

  /**
   * Enable legacy X-RateLimit-* headers.
   * @default false
   */
  legacyHeaders?: boolean;

  /**
   * Custom function to identify clients.
   * Defaults to client IP address.
   */
  keyGenerator?: (req: Request) => string | Promise<string>;

  /**
   * Storage backend for rate limiting counters.
   * Defaults to in-memory store.
   */
  store?: Store;

  /**
   * Routes or patterns to exclude from rate limiting.
   */
  exclude?: ExcludeOption | ExcludeOption[];

  /**
   * Specific rules overriding the global limit for particular routes.
   */
  routes?: RouteRule[];

  /**
   * Callback invoked when a client exceeds the limit.
   */
  onLimitReached?: (req: Request, res: Response, info: { limit: number; current: number; resetTime: Date }) => void;

  /**
   * Whether requests should continue (fail open) if the rate limiter storage encounters an error.
   * @default true
   */
  passOnStoreError?: boolean;

  /**
   * Do not count requests that return a successful status code (< 400).
   * @default false
   */
  skipSuccessfulRequests?: boolean;

  /**
   * Do not count requests that return an error status code (>= 400).
   * @default false
   */
  skipFailedRequests?: boolean;

  /**
   * Property name on the Request object to attach rate limit info.
   * @default 'rateLimit'
   */
  requestPropertyName?: string;

  /**
   * Prefix for storage keys.
   * @default 'sk-rl'
   */
  prefix?: string;
}

export interface RateLimitMiddleware extends RequestHandler {
  store: Store;
  resetKey: (key: string) => Promise<void>;
  shutdown: () => Promise<void>;
}

export function rateLimit(options?: RateLimitOptions): RateLimitMiddleware;

export function defaultKeyGenerator(req: Request): string;

export function normalizeIp(ip: string): string;

export default rateLimit;
