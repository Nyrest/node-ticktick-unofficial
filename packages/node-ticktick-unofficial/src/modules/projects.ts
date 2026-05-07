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

  async findById(projectId: string): Promise<TickTickProjectProfile | null> {
    const projects = await this.list();
    return projects.find((project) => project.id === projectId) ?? null;
  }

  listTasks(projectId: string): Promise<TickTickTask[]> {
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

  async create(project: TickTickProjectCreateInput): Promise<TickTickProjectProfile>;
  async create(projects: TickTickProjectCreateInput[]): Promise<TickTickProjectProfile[]>;
  async create(
    project: TickTickProjectCreateInput | TickTickProjectCreateInput[],
  ): Promise<TickTickProjectProfile | TickTickProjectProfile[]> {
    const payloads = (Array.isArray(project) ? project : [project]).map((entry) => this.#buildCreatePayload(entry));
    const response = await this.batch({ add: payloads });
    const result = payloads.map((payload) => ({
      ...payload,
      etag: response.id2etag?.[payload.id],
    }));
    return Array.isArray(project) ? result : result[0]!;
  }

  async update(project: TickTickProjectUpdateInput): Promise<TickTickProjectUpdateInput>;
  async update(projects: TickTickProjectUpdateInput[]): Promise<TickTickProjectUpdateInput[]>;
  async update(
    project: TickTickProjectUpdateInput | TickTickProjectUpdateInput[],
  ): Promise<TickTickProjectUpdateInput | TickTickProjectUpdateInput[]> {
    const updates = Array.isArray(project) ? project : [project];
    await this.batch({ update: updates });
    return project;
  }

  #buildCreatePayload(project: TickTickProjectCreateInput): TickTickProjectCreateInput & Pick<TickTickProjectProfile, "id"> {
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

    return {
      ...payload,
      id: projectId,
    };
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
