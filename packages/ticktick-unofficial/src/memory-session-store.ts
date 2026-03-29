import type { TickTickSerializedSession, TickTickSessionStore } from "./types.js";

export class MemorySessionStore implements TickTickSessionStore {
  #session: TickTickSerializedSession | null = null;

  async load(): Promise<TickTickSerializedSession | null> {
    return this.#session;
  }

  async save(session: TickTickSerializedSession): Promise<void> {
    this.#session = session;
  }

  async clear(): Promise<void> {
    this.#session = null;
  }
}
