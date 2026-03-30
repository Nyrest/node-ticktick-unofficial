import type { TickTickSerializedSession, TickTickSessionStore } from "node-ticktick-unofficial/core";

export interface RedisSessionStoreOptions {
  url: string;
  token: string;
  key: string;
  runtime: "cloudflare" | "other";
}

interface RedisClientLike {
  get<TData>(key: string): Promise<TData | null>;
  set<TData>(key: string, value: TData): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

export class RedisSessionStore implements TickTickSessionStore {
  constructor(
    private readonly client: RedisClientLike,
    private readonly key: string,
  ) {}

  async load(): Promise<TickTickSerializedSession | null> {
    return this.client.get<TickTickSerializedSession>(this.key);
  }

  async save(session: TickTickSerializedSession): Promise<void> {
    await this.client.set(this.key, session);
  }

  async clear(): Promise<void> {
    await this.client.del(this.key);
  }
}

export async function createRedisSessionStore(options: RedisSessionStoreOptions): Promise<TickTickSessionStore> {
  const client = await createRedisClient(options);
  return new RedisSessionStore(client, options.key);
}

async function createRedisClient(options: RedisSessionStoreOptions): Promise<RedisClientLike> {
  if (options.runtime === "cloudflare") {
    const { Redis } = await import("@upstash/redis/cloudflare");
    return new Redis({
      url: options.url,
      token: options.token,
    });
  }

  const { Redis } = await import("@upstash/redis");
  return new Redis({
    url: options.url,
    token: options.token,
  });
}
