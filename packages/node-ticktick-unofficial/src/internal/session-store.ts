import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { TickTickSerializedSession, TickTickSessionStore } from "../types.js";

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

export class FileSessionStore implements TickTickSessionStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<TickTickSerializedSession | null> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as TickTickSerializedSession;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async save(session: TickTickSerializedSession): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}

export function createFileSessionStore(filePath: string): TickTickSessionStore {
  return new FileSessionStore(filePath);
}
