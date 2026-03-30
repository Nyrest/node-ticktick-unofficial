import { createObjectId } from "../internal/ids.js";
import type { TickTickClient } from "../client.js";
import type {
  TickTickColumn,
  TickTickProjectBatchRequest,
  TickTickProjectBatchResponse,
  TickTickProjectProfile,
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

  async listColumns(projectId?: string): Promise<TickTickColumn[]> {
    const response = await this.client.requestJson<{ update?: TickTickColumn[] }>({
      path: "/api/v2/column?from=0",
    });

    const columns = response.update ?? [];
    return projectId ? columns.filter((column) => column.projectId === projectId) : columns;
  }

  async getById(projectId: string): Promise<TickTickProjectProfile | null> {
    const projects = await this.list();
    return projects.find((project) => project.id === projectId) ?? null;
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

  create(project: TickTickProjectCreateInput): Promise<TickTickProjectBatchResponse> {
    const payload: TickTickProjectCreateInput = {
      color: project.color ?? undefined,
      groupId: project.groupId ?? undefined,
      id: project.id ?? createObjectId(),
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

    return this.batch({ add: [payload] });
  }

  update(project: TickTickProjectUpdateInput): Promise<TickTickProjectBatchResponse> {
    return this.batch({ update: [project] });
  }

  delete(projectIds: string | string[]): Promise<TickTickProjectBatchResponse> {
    const ids = Array.isArray(projectIds) ? projectIds : [projectIds];
    return this.batch({ delete: ids });
  }
}
