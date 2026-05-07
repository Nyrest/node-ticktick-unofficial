import type { TickTickClient } from "../client.js";
import type { TickTickDeleteResult, TickTickTag, TickTickTagBatchRequest, TickTickTagBatchResponse } from "../types.js";

export class TickTickTagsApi {
  constructor(private readonly client: TickTickClient) {}

  async list(): Promise<TickTickTag[]> {
    const response = await this.client.tasks.getAll();
    const rawTags = response.tags ?? [];
    return rawTags.map((tag) => {
      if (typeof tag === "string") {
        return { name: tag, label: tag };
      }
      return tag as unknown as TickTickTag;
    });
  }

  batch(payload: TickTickTagBatchRequest): Promise<TickTickTagBatchResponse> {
    return this.client.requestJson<TickTickTagBatchResponse>({
      path: "/api/v2/batch/tag",
      method: "POST",
      json: {
        add: payload.add ?? [],
        update: payload.update ?? [],
        delete: payload.delete ?? [],
      },
    });
  }

  async create(tag: TickTickTag): Promise<TickTickTag>;
  async create(tags: TickTickTag[]): Promise<TickTickTag[]>;
  async create(tag: TickTickTag | TickTickTag[]): Promise<TickTickTag | TickTickTag[]> {
    const tags = Array.isArray(tag) ? tag : [tag];
    await this.batch({ add: tags });
    return tag;
  }

  async update(tag: TickTickTag): Promise<TickTickTag>;
  async update(tags: TickTickTag[]): Promise<TickTickTag[]>;
  async update(tag: TickTickTag | TickTickTag[]): Promise<TickTickTag | TickTickTag[]> {
    const tags = Array.isArray(tag) ? tag : [tag];
    await this.batch({ update: tags });
    return tag;
  }

  async delete(name: string): Promise<TickTickDeleteResult>;
  async delete(names: string[]): Promise<TickTickDeleteResult[]>;
  async delete(name: string | string[]): Promise<TickTickDeleteResult | TickTickDeleteResult[]> {
    const names = Array.isArray(name) ? name : [name];
    if (names.length === 0) {
      return [];
    }

    if (names.length === 1) {
      await this.client.request({
        path: "/api/v2/tag/delete",
        method: "DELETE",
        json: { name: names[0]! },
      });
      return { id: names[0]!, deleted: true };
    }

    await this.client.requestJson<TickTickTagBatchResponse>({
      path: "/api/v2/batch/tag",
      method: "POST",
      json: {
        delete: names,
      },
    });
    return names.map((id) => ({ id, deleted: true }));
  }

  async setPinned(name: string, pinned: boolean): Promise<void> {
    await this.client.request({
      path: "/api/v2/batch/order",
      method: "POST",
      json: {
        projectPinned: {
          [pinned ? "add" : "delete"]: [name],
        },
        type: 7,
      },
    });
  }

  rename(oldName: string, newLabel: string): Promise<TickTickTagBatchResponse> {
    return this.client.requestJson<TickTickTagBatchResponse>({
      path: "/api/v2/tag/rename",
      method: "PUT",
      json: {
        name: oldName,
        newName: newLabel,
      },
    });
  }

  merge(oldName: string, targetName: string): Promise<TickTickTagBatchResponse> {
    return this.client.requestJson<TickTickTagBatchResponse>({
      path: "/api/v2/tag/merge",
      method: "PUT",
      json: {
        name: oldName,
        newName: targetName,
      },
    });
  }
}
