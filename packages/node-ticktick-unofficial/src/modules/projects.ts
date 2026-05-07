import { createObjectId } from "../internal/ids.js";
import type { TickTickClient } from "../client.js";
import type {
  TickTickColumn,
  TickTickDeleteResult,
  TickTickProjectBatchRequest,
  TickTickProjectBatchResponse,
  TickTickProjectProfile,
  TickTickTask,
} from "../types.js";

type TickTickProjectCreateInput = NonNullable<TickTickProjectBatchRequest["add"]>[number];
type TickTickProjectUpdateInput = NonNullable<TickTickProjectBatchRequest["update"]>[number];

export class TickTickProjectsApi {
  constructor(private readonly client: TickTickClient) {}

  list(): Promise<TickTickProjectProfile[]> {
    return this.client.requestJson<TickTickProjectProfile[]>({
      path: "/api/v2/projects",
    });
  }

  get(projectId: string): Promise<TickTickTask[]> {
    return this.client.requestJson<TickTickTask[]>({
      path: `/api/v2/project/${projectId}/tasks`,
    });
  }

  async listColumns(projectId?: string): Promise<TickTickColumn[]> {
    const response = await this.client.requestJson<{ update?: TickTickColumn[] }>({
      path: "/api/v2/column?from=0",
    });

    const columns = response.update ?? [];
    return projectId ? columns.filter((column) => column.projectId === projectId) : columns;
  }

  batch(payload: TickTickProjectBatchRequest): Promise<TickTickProjectBatchResponse> {
    return this.client.requestJson<TickTickProjectBatchResponse>({
      path: "/api/v2/batch/project",
      method: "POST",
      json: {
        add: payload.add ?? [],
        update: payload.update ?? [],
        delete: payload.delete ?? [],
      },
    });
  }

  async create(project: TickTickProjectCreateInput): Promise<TickTickProjectProfile> {
    const projectId = project.id ?? createObjectId();
    const payload: TickTickProjectCreateInput = {
      color: project.color ?? undefined,
      groupId: project.groupId ?? undefined,
      id: projectId,
      inAll: project.inAll ?? true,
      isOwner: project.isOwner ?? true,
      kind: project.kind ?? "TASK",
      muted: project.muted ?? false,
      name: project.name,
      needAudit: project.needAudit ?? true,
      openToTeam: project.openToTeam ?? false,
      remindType: project.remindType ?? 1,
      showType: project.showType ?? 1,
      sortOrder: project.sortOrder ?? 0,
      teamId: project.teamId ?? undefined,
      teamMemberPermission: project.teamMemberPermission ?? undefined,
      viewMode: project.viewMode ?? "list",
    };

    const response = await this.batch({ add: [payload] });
    return {
      ...payload,
      id: projectId,
      etag: response.id2etag?.[projectId],
    };
  }

  async update(project: TickTickProjectUpdateInput): Promise<TickTickProjectUpdateInput> {
    await this.batch({ update: [project] });
    return project;
  }

  async delete(projectId: string): Promise<TickTickDeleteResult>;
  async delete(projectIds: string[]): Promise<TickTickDeleteResult[]>;
  async delete(projectIds: string | string[]): Promise<TickTickDeleteResult | TickTickDeleteResult[]> {
    const ids = Array.isArray(projectIds) ? projectIds : [projectIds];
    await this.batch({ delete: ids });
    const result = ids.map((id) => ({ id, deleted: true }) satisfies TickTickDeleteResult);
    return Array.isArray(projectIds) ? result : result[0]!;
  }
}
