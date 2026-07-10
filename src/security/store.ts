import "server-only";
import { Redis } from "@upstash/redis";
import { parseEnvironment } from "@/src/config/env";
import type { AuditEvent } from "@/src/logging/logger";

export interface SecurityStore {
  putOnce(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  consume(key: string): Promise<string | null>;
  incrementWithinWindow(key: string, ttlSeconds: number): Promise<number>;
  appendAudit(event: AuditEvent, retentionSeconds: number): Promise<void>;
}

interface MemoryEntry { value: string; expiresAt: number }

export class MemorySecurityStore implements SecurityStore {
  private readonly values = new Map<string, MemoryEntry>();
  private readonly counters = new Map<string, { value: number; expiresAt: number }>();
  readonly audits: AuditEvent[] = [];

  async putOnce(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.values.get(key);
    if (existing && existing.expiresAt > now) return false;
    this.values.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
    return true;
  }

  async consume(key: string): Promise<string | null> {
    const entry = this.values.get(key);
    this.values.delete(key);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry.value;
  }

  async incrementWithinWindow(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const current = this.counters.get(key);
    if (!current || current.expiresAt <= now) {
      this.counters.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    current.value += 1;
    return current.value;
  }

  async appendAudit(event: AuditEvent): Promise<void> { this.audits.push(structuredClone(event)); }
}

class RedisSecurityStore implements SecurityStore {
  constructor(private readonly redis: Redis) {}

  async putOnce(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.redis.set(key, value, { nx: true, ex: ttlSeconds })) === "OK";
  }

  async consume(key: string): Promise<string | null> {
    return this.redis.eval<[], string | null>(
      "local v=redis.call('GET',KEYS[1]); if v then redis.call('DEL',KEYS[1]) end; return v",
      [key],
      [],
    );
  }

  async incrementWithinWindow(key: string, ttlSeconds: number): Promise<number> {
    return this.redis.eval<[number], number>(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      [key],
      [ttlSeconds],
    );
  }

  async appendAudit(event: AuditEvent, retentionSeconds: number): Promise<void> {
    const key = `mcp:audit:${new Date(event.timestamp).toISOString().slice(0, 10)}`;
    const pipeline = this.redis.pipeline();
    pipeline.lpush(key, JSON.stringify(event));
    pipeline.ltrim(key, 0, 9_999);
    pipeline.expire(key, retentionSeconds);
    await pipeline.exec();
  }
}

let memoryStore: MemorySecurityStore | undefined;
let redisStore: RedisSecurityStore | undefined;

export function getSecurityStore(): SecurityStore {
  const env = parseEnvironment();
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    redisStore ??= new RedisSecurityStore(new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }));
    return redisStore;
  }
  memoryStore ??= new MemorySecurityStore();
  return memoryStore;
}
