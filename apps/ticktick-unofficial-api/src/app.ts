import { bearer } from "@elysiajs/bearer";
import { cron } from "@elysiajs/cron";
import { openapi } from "@elysiajs/openapi";
import { Elysia, t } from "elysia";

import type { AppConfig } from "./lib/config";
import {
  ArchivedCalendarEventSchema,
  CalendarAccountsResponseSchema,
  CalendarEventsResponseSchema,
  ColumnSchema,
  CompletedTasksQuerySchema,
  CountdownBatchRequestSchema,
  CountdownBatchResponseSchema,
  CountdownDraftSchema,
  CountdownSchema,
  CountdownUpdateSchema,
  DateRangeParamsSchema,
  DeleteResultSchema,
  ErrorSchema,
  FocusActionSchema,
  FocusOverviewSchema,
  FocusStartSchema,
  FocusStateSchema,
  FocusSyncBodySchema,
  FocusTimelineEntrySchema,
  GeneralStatisticsSchema,
  HabitBatchRequestSchema,
  HabitBatchResponseSchema,
  HabitCheckinBatchRequestSchema,
  HabitCheckinQueryResponseSchema,
  HabitCheckinQuerySchema,
  HabitCheckinUpsertSchema,
  HabitDraftSchema,
  HabitSchema,
  HabitWeeklyStatisticsSchema,
  HealthSchema,
  ProjectBatchRequestSchema,
  ProjectBatchResponseSchema,
  ProjectCreateSchema,
  ProjectSchema,
  ProjectUpdateSchema,
  RankingStatisticsSchema,
  RootInfoSchema,
  SessionMaintenanceSchema,
  SessionStatusSchema,
  TagBatchRequestSchema,
  TagBatchResponseSchema,
  TagSchema,
  TaskBatchRequestSchema,
  TaskBatchResponseSchema,
  TaskDraftSchema,
  TaskMoveSchema,
  TaskPinSchema,
  TaskSchema,
  TaskStatisticsEntrySchema,
  TaskStatusMutationSchema,
  TaskSyncSchema,
  TrashQuerySchema,
  TrashResponseSchema,
  UserProfileSchema,
} from "./lib/schemas";
import { resolveTag, TickTickTaskStatuses } from "node-ticktick-unofficial";
import { mapErrorToResponse, type TickTickService } from "./lib/ticktick-service";

const ArrayOfUnknownRecords = t.Array(t.Record(t.String(), t.Any()));
const UnknownRecord = t.Record(t.String(), t.Any());
const TaskDraftInputSchema = t.Union([TaskDraftSchema, t.Array(TaskDraftSchema)]);
const TaskMutationSchema = t.Union([TaskSchema, t.Array(TaskSchema)]);
const TaskStatusInputSchema = t.Union([TaskStatusMutationSchema, t.Array(TaskStatusMutationSchema)]);
const CountdownMutationSchema = t.Union([CountdownUpdateSchema, t.Array(CountdownUpdateSchema)]);
const DeleteManySchema = t.Object({
  ids: t.Array(t.String(), { minItems: 1 }),
});

export function createApp(
  config: AppConfig,
  ticktick: TickTickService,
  options: {
    adapter?: unknown;
  } = {},
) {
  const baseApp = new Elysia({
    adapter: options.adapter as never,
    name: config.packageName,
    serve: {
      idleTimeout: 60,
    },
  })
    .use(bearer())
    .use(
      openapi({
        path: config.docs.swaggerPath,
        specPath: config.docs.openapiPath,
        provider: config.docs.swaggerEnabled ? "swagger-ui" : null,
        documentation: {
          info: {
            title: "TickTick Unofficial API",
            version: config.packageVersion,
            description:
              "Typed single-user HTTP API for the local node-ticktick-unofficial client, including session maintenance, cron hooks, and optional bearer protection.",
          },
          tags: [
            { name: "System", description: "Service metadata, health, and session state." },
            { name: "User", description: "TickTick account profile data." },
            { name: "Projects", description: "Project and column management." },
            { name: "Tags", description: "Tag management." },
            { name: "Tasks", description: "Task sync, CRUD, pinning, status changes, and trash access." },
            { name: "Calendar", description: "Third-party calendar bindings and bound calendar events." },
            { name: "Countdowns", description: "Countdown, anniversary, birthday, and holiday management." },
            { name: "Habits", description: "Habit CRUD, exports, and check-in workflows." },
            { name: "Focus", description: "Pomodoro, focus timeline, and focus operations." },
            { name: "Statistics", description: "General, ranking, and task statistics." },
            { name: "Internal", description: "Cron and maintenance hooks intended for platform schedulers." },
          ],
          components: {
            securitySchemes: {
              bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "API token",
              },
              cronSecret: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "Cron secret",
              },
            },
          },
        },
      }),
    )
    .onError(function handleError({ error, set }) {
      const mapped = mapErrorToResponse(error);
      set.status = mapped.status;
      return mapped.body;
    })
    .get(
      "/",
      function getRootInfo() {
        return {
          name: config.packageName,
          version: config.packageVersion,
          runtime: config.runtime.name,
          docs: {
            openapi: config.docs.openapiPath,
            swagger: config.docs.swaggerEnabled ? config.docs.swaggerPath : null,
          },
          auth: {
            mode: config.auth.mode,
          },
          cron: {
            driver: config.cron.driver,
            enabled: config.cron.enabled,
          },
          telemetry: {
            enabled: config.telemetry.enabled,
          },
        };
      },
      {
        detail: {
          tags: ["System"],
          summary: "Service metadata",
          description: "Returns package, runtime, documentation, auth, cron, and telemetry metadata for this deployment.",
        },
        response: {
          200: RootInfoSchema,
        },
      },
    )
    .get(
      "/health",
      function getHealth() {
        return {
          ok: true as const,
          timestamp: new Date().toISOString(),
          service: config.packageName,
          runtime: config.runtime.name,
        };
      },
      {
        detail: {
          tags: ["System"],
          summary: "Health check",
          description: "Simple liveness response for load balancers and deployment probes.",
        },
        response: {
          200: HealthSchema,
        },
      },
    )
    .post(
      config.cron.internalPath,
      async function triggerCronRefresh({ bearer, set }) {
        if (!config.cron.secret || bearer !== config.cron.secret) {
          set.status = 401;
          set.headers["WWW-Authenticate"] = "Bearer";
          return {
            code: "UNAUTHORIZED",
            message: "Valid cron bearer token required.",
          };
        }

        return ticktick.refreshSession(`http-cron:${config.cron.driver}`);
      },
      {
        detail: {
          tags: ["Internal"],
          summary: "Trigger session refresh",
          description: "Internal endpoint used by platform schedulers to maintain an active TickTick session.",
          security: [{ cronSecret: [] }],
        },
        response: {
          200: SessionMaintenanceSchema,
          401: ErrorSchema,
        },
      },
    );

  const api = new Elysia({ prefix: "/api" })
    .get(
      "/session",
      async function getSessionStatus() {
        return ticktick.getSessionStatus();
      },
      {
        detail: protectedDetail(config, "System", "Get session status", "Checks if the server has a valid TickTick session."),
        response: {
          200: SessionStatusSchema,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/user/profile",
      async function getUserProfile() {
        return (await ticktick.getClient()).user.getProfile();
      },
      {
        detail: protectedDetail(config, "User", "Get user profile", "Returns basic account information."),
        response: {
          200: UserProfileSchema,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/projects",
      async function listProjects() {
        return (await ticktick.getClient()).projects.list();
      },
      {
        detail: protectedDetail(config, "Projects", "List projects", "Returns the full project list."),
        response: {
          200: t.Array(ProjectSchema),
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/projects/:projectId/tasks",
      async function getProjectTasks({ params }) {
        return (await ticktick.getClient()).projects.listTasks(params.projectId);
      },
      {
        params: t.Object({
          projectId: t.String(),
        }),
        detail: protectedDetail(config, "Projects", "Get project tasks", "Returns active tasks for one project using TickTick's direct project tasks endpoint."),
        response: {
          200: t.Array(TaskSchema),
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/projects/:projectId/columns",
      async function listColumns({ params }) {
        return (await ticktick.getClient()).projects.listColumns(params.projectId);
      },
      {
        params: t.Object({
          projectId: t.String(),
        }),
        detail: protectedDetail(config, "Projects", "List project columns", "Returns columns for a Kanban-style project."),
        response: {
          200: t.Array(ColumnSchema),
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/projects",
      async function createProject({ body }) {
        return (await ticktick.getClient()).projects.create(body as never);
      },
      {
        body: ProjectCreateSchema,
        detail: protectedDetail(config, "Projects", "Create project", "Creates a new project list."),
        response: {
          200: ProjectSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/projects/batch",
      async function batchProjects({ body }) {
        return (await ticktick.getClient()).projects.batch(body as never);
      },
      {
        body: ProjectBatchRequestSchema,
        detail: protectedDetail(config, "Projects", "Batch mutate projects", "Submits add, update, or delete project mutations."),
        response: {
          200: ProjectBatchResponseSchema,
          401: ErrorSchema,
        },
      },
    )
    .patch(
      "/projects/:projectId",
      async function updateProject({ body, params }) {
        return (await ticktick.getClient()).projects.update({
          ...body,
          id: params.projectId,
        });
      },
      {
        params: t.Object({
          projectId: t.String(),
        }),
        body: ProjectUpdateSchema,
        detail: protectedDetail(config, "Projects", "Update project", "Updates project metadata by id."),
        response: {
          200: ProjectUpdateSchema,
          401: ErrorSchema,
        },
      },
    )
    .delete(
      "/projects/:projectId",
      async function deleteProject({ params }) {
        return (await ticktick.getClient()).projects.delete(params.projectId);
      },
      {
        params: t.Object({
          projectId: t.String(),
        }),
        detail: protectedDetail(config, "Projects", "Delete project", "Deletes a project by id."),
        response: {
          200: DeleteResultSchema,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/tags",
      async function listTags() {
        return (await ticktick.getClient()).tags.list();
      },
      {
        detail: protectedDetail(config, "Tags", "List tags", "Returns all account tags."),
        response: {
          200: t.Array(TagSchema),
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/tags/:tagName",
      async function getTag({ params }) {
        const tags = await (await ticktick.getClient()).tags.list();
        return resolveTag(tags, params.tagName);
      },
      {
        params: t.Object({
          tagName: t.String(),
        }),
        detail: protectedDetail(config, "Tags", "Get tag", "Returns a single tag by name."),
        response: {
          200: TagSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/tags",
      async function createTag({ body }) {
        return (await ticktick.getClient()).tags.create(body as never);
      },
      {
        body: t.Union([TagSchema, t.Array(TagSchema)]),
        detail: protectedDetail(config, "Tags", "Create tag or tags", "Creates one or multiple tags."),
        response: {
          200: t.Union([TagSchema, t.Array(TagSchema)]),
          401: ErrorSchema,
        },
      },
    )
    .patch(
      "/tags/:tagName",
      async function updateTag({ body, params }) {
        return (await ticktick.getClient()).tags.update({
          ...body,
          name: params.tagName,
        });
      },
      {
        params: t.Object({
          tagName: t.String(),
        }),
        body: t.Partial(TagSchema),
        detail: protectedDetail(config, "Tags", "Update tag", "Updates a single tag by its name."),
        response: {
          200: TagSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/tags/:tagName/rename",
      async function renameTag({ body, params }) {
        return (await ticktick.getClient()).tags.rename(params.tagName, body.newName);
      },
      {
        params: t.Object({
          tagName: t.String(),
        }),
        body: t.Object({
          newName: t.String(),
        }),
        detail: protectedDetail(config, "Tags", "Rename tag", "Renames a tag to a new label."),
        response: {
          200: TagBatchResponseSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/tags/:tagName/merge",
      async function mergeTag({ body, params }) {
        return (await ticktick.getClient()).tags.merge(params.tagName, body.targetTagName);
      },
      {
        params: t.Object({
          tagName: t.String(),
        }),
        body: t.Object({
          targetTagName: t.String(),
        }),
        detail: protectedDetail(config, "Tags", "Merge tag", "Merges a tag into another target tag."),
        response: {
          200: TagBatchResponseSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/tags/batch",
      async function batchTags({ body }) {
        return (await ticktick.getClient()).tags.batch(body as never);
      },
      {
        body: TagBatchRequestSchema,
        detail: protectedDetail(config, "Tags", "Batch mutate tags", "Submits add, update, or delete tag changes."),
        response: {
          200: TagBatchResponseSchema,
          401: ErrorSchema,
        },
      },
    )
    .delete(
      "/tags/:tagName",
      async function deleteTag({ params }) {
        return (await ticktick.getClient()).tags.delete(params.tagName);
      },
      {
        params: t.Object({
          tagName: t.String(),
        }),
        detail: protectedDetail(config, "Tags", "Delete tag", "Deletes a tag by name."),
        response: {
          200: DeleteResultSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/tags/:tagName/pin",
      async function pinTag({ params }) {
        return (await ticktick.getClient()).tags.setPinned(params.tagName, true);
      },
      {
        params: t.Object({
          tagName: t.String(),
        }),
        detail: protectedDetail(config, "Tags", "Pin tag", "Pins a tag to the sidebar."),
        response: {
          200: t.Any(),
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/tags/:tagName/unpin",
      async function unpinTag({ params }) {
        return (await ticktick.getClient()).tags.setPinned(params.tagName, false);
      },
      {
        params: t.Object({
          tagName: t.String(),
        }),
        detail: protectedDetail(config, "Tags", "Unpin tag", "Unpins a tag from the sidebar."),
        response: {
          200: t.Any(),
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/tasks/sync",
      async function syncTasks() {
        return (await ticktick.getClient()).tasks.sync();
      },
      {
        detail: protectedDetail(
          config,
          "Tasks",
          "Get full sync payload",
          "Returns the raw task sync payload from TickTick, including projects and checkpoint metadata.",
        ),
        response: {
          200: TaskSyncSchema,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/tasks",
      async function listTasks() {
        return (await ticktick.getClient()).tasks.listActive();
      },
      {
        detail: protectedDetail(config, "Tasks", "List active tasks", "Returns the active task list from the sync endpoint."),
        response: {
          200: t.Array(TaskSchema),
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/tasks/:taskId",
      async function getTaskById({ params }) {
        return (await ticktick.getClient()).tasks.get(params.taskId);
      },
      {
        params: t.Object({
          taskId: t.String(),
        }),
        detail: protectedDetail(config, "Tasks", "Get task by id", "Returns one task using the direct TickTick task endpoint."),
        response: {
          200: TaskSchema,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/tasks/completed",
      async function listCompletedTasks({ query }) {
        return (await ticktick.getClient()).tasks.listClosed(query);
      },
      {
        query: CompletedTasksQuerySchema,
        detail: protectedDetail(
          config,
          "Tasks",
          "List closed tasks",
          "Returns completed and abandoned tasks, optionally filtered by closed status and paged by completion timestamp.",
        ),
        response: {
          200: t.Array(TaskSchema),
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/tasks/trash",
      async function listTrashTasks({ query }) {
        return (await ticktick.getClient()).tasks.listTrash(query.limit, query.taskType);
      },
      {
        query: TrashQuerySchema,
        detail: protectedDetail(config, "Tasks", "List trash", "Returns trashed tasks with TickTick pagination metadata."),
        response: {
          200: TrashResponseSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/tasks",
      async function createTasks({ body }) {
        return (await ticktick.getClient()).tasks.create(body as never);
      },
      {
        body: TaskDraftInputSchema,
        detail: protectedDetail(config, "Tasks", "Create task or tasks", "Creates one task or multiple tasks in a single request."),
        response: {
          200: t.Union([TaskSchema, t.Array(TaskSchema)]),
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/tasks/batch",
      async function batchTasks({ body }) {
        return (await ticktick.getClient()).tasks.batch(body as never);
      },
      {
        body: TaskBatchRequestSchema,
        detail: protectedDetail(config, "Tasks", "Batch mutate tasks", "Submits raw batch task mutations."),
        response: {
          200: TaskBatchResponseSchema,
          401: ErrorSchema,
        },
      },
    )
    .patch(
      "/tasks",
      async function updateTasks({ body }) {
        return (await ticktick.getClient()).tasks.update(body as never);
      },
      {
        body: TaskMutationSchema,
        detail: protectedDetail(config, "Tasks", "Update task or tasks", "Updates one task or an array of tasks."),
        response: {
          200: t.Union([TaskSchema, t.Array(TaskSchema)]),
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/tasks/status",
      async function setTaskStatus({ body }) {
        return (await ticktick.getClient()).tasks.setStatus(body as never);
      },
      {
        body: TaskStatusInputSchema,
        detail: protectedDetail(
          config,
          "Tasks",
          "Set task status",
          "Transitions one or multiple tasks to open, completed, or abandoned states.",
        ),
        response: {
          200: t.Union([TaskSchema, t.Array(TaskSchema)]),
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/tasks/move",
      async function moveTask({ body }) {
        return (await ticktick.getClient()).tasks.move(body.taskId, body.toProjectId);
      },
      {
        body: TaskMoveSchema,
        detail: protectedDetail(
          config,
          "Tasks",
          "Move task between projects",
          "Moves a task to another project and refreshes its column.",
        ),
        response: {
          200: TaskSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/tasks/:taskId/pin",
      async function pinTask({ body, params }) {
        return (await ticktick.getClient()).tasks.setPinned(params.taskId, body.pin as never);
      },
      {
        params: t.Object({
          taskId: t.String(),
        }),
        body: TaskPinSchema,
        detail: protectedDetail(config, "Tasks", "Pin or unpin task", "Sets the pinned state of a task. Use false to unpin."),
        response: {
          200: TaskSchema,
          401: ErrorSchema,
        },
      },
    )
    .delete(
      "/tasks/:taskId",
      async function deleteTask({ params }) {
        return (await ticktick.getClient()).tasks.delete(params.taskId);
      },
      {
        params: t.Object({
          taskId: t.String(),
        }),
        detail: protectedDetail(config, "Tasks", "Soft-delete task", "Marks a task as deleted using TickTick trash semantics."),
        response: {
          200: DeleteResultSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/tasks/delete",
      async function deleteManyTasks({ body }) {
        return (await ticktick.getClient()).tasks.delete(body.ids);
      },
      {
        body: DeleteManySchema,
        detail: protectedDetail(config, "Tasks", "Soft-delete multiple tasks", "Marks multiple tasks as deleted."),
        response: {
          200: t.Array(DeleteResultSchema),
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/calendar/accounts",
      async function listCalendarAccounts() {
        return (await ticktick.getClient()).calendar.listAccounts();
      },
      {
        detail: protectedDetail(
          config,
          "Calendar",
          "List third-party calendar accounts",
          "Returns bound third-party calendar accounts and integrations such as Google, Outlook, and Notion.",
        ),
        response: {
          200: CalendarAccountsResponseSchema,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/calendar/events",
      async function listCalendarEvents() {
        return (await ticktick.getClient()).calendar.listEvents();
      },
      {
        detail: protectedDetail(
          config,
          "Calendar",
          "List bound calendar events",
          "Returns events grouped by bound third-party calendar.",
        ),
        response: {
          200: CalendarEventsResponseSchema,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/calendar/archived-events",
      async function listArchivedCalendarEvents() {
        return (await ticktick.getClient()).calendar.listArchivedEvents();
      },
      {
        detail: protectedDetail(
          config,
          "Calendar",
          "List archived calendar events",
          "Returns archived or hidden bound calendar events tracked by TickTick.",
        ),
        response: {
          200: t.Array(ArchivedCalendarEventSchema),
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/countdowns",
      async function listCountdowns() {
        return (await ticktick.getClient()).countdowns.list();
      },
      {
        detail: protectedDetail(config, "Countdowns", "List countdowns", "Returns the full Countdown list."),
        response: {
          200: t.Array(CountdownSchema),
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/countdowns",
      async function createCountdown({ body }) {
        return (await ticktick.getClient()).countdowns.create(body as never);
      },
      {
        body: CountdownDraftSchema,
        detail: protectedDetail(config, "Countdowns", "Create countdown", "Creates a new countdown."),
        response: {
          200: CountdownSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/countdowns/batch",
      async function batchCountdowns({ body }) {
        return (await ticktick.getClient()).countdowns.batch(body as never);
      },
      {
        body: CountdownBatchRequestSchema,
        detail: protectedDetail(
          config,
          "Countdowns",
          "Batch mutate countdowns",
          "Submits add, update, or delete Countdown mutations.",
        ),
        response: {
          200: CountdownBatchResponseSchema,
          401: ErrorSchema,
        },
      },
    )
    .put(
      "/countdowns",
      async function updateCountdowns({ body }) {
        return (await ticktick.getClient()).countdowns.update(body as never);
      },
      {
        body: CountdownMutationSchema,
        detail: protectedDetail(config, "Countdowns", "Update countdowns", "Updates one or more countdowns."),
        response: {
          200: CountdownMutationSchema,
          401: ErrorSchema,
        },
      },
    )
    .delete(
      "/countdowns/:countdownId",
      async function deleteCountdown({ params }) {
        return (await ticktick.getClient()).countdowns.delete(params.countdownId);
      },
      {
        params: t.Object({
          countdownId: t.String(),
        }),
        detail: protectedDetail(config, "Countdowns", "Delete countdown", "Deletes a countdown by id."),
        response: {
          200: DeleteResultSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/countdowns/delete",
      async function deleteManyCountdowns({ body }) {
        return (await ticktick.getClient()).countdowns.delete(body.ids);
      },
      {
        body: DeleteManySchema,
        detail: protectedDetail(config, "Countdowns", "Delete multiple countdowns", "Deletes multiple countdowns."),
        response: {
          200: t.Array(DeleteResultSchema),
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/habits",
      async function listHabits() {
        return (await ticktick.getClient()).habits.list();
      },
      {
        detail: protectedDetail(config, "Habits", "List habits", "Returns the full habit list."),
        response: {
          200: t.Array(HabitSchema),
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/habits/statistics/week/current",
      async function getCurrentWeekHabitStats() {
        return (await ticktick.getClient()).habits.getWeekCurrentStatistics();
      },
      {
        detail: protectedDetail(
          config,
          "Habits",
          "Get current week habit statistics",
          "Returns per-day habit completion counts for the current week.",
        ),
        response: {
          200: HabitWeeklyStatisticsSchema,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/habits/export",
      async function exportHabits() {
        const payload = await (await ticktick.getClient()).habits.export();
        return new Response(payload.slice().buffer, {
          headers: {
            "content-type": "application/octet-stream",
            "content-disposition": 'attachment; filename="ticktick-habits-export.bin"',
          },
        });
      },
      {
        detail: protectedDetail(
          config,
          "Habits",
          "Export habits",
          "Downloads the habits export payload. TickTick may rate limit this endpoint.",
        ),
        response: {
          200: t.String({ format: "binary" }),
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/habits",
      async function createHabit({ body }) {
        return (await ticktick.getClient()).habits.create(body as never);
      },
      {
        body: HabitDraftSchema,
        detail: protectedDetail(config, "Habits", "Create habit", "Creates a new habit."),
        response: {
          200: HabitSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/habits/batch",
      async function batchHabits({ body }) {
        return (await ticktick.getClient()).habits.batch(body as never);
      },
      {
        body: HabitBatchRequestSchema,
        detail: protectedDetail(config, "Habits", "Batch mutate habits", "Submits add, update, or delete habit mutations."),
        response: {
          200: HabitBatchResponseSchema,
          401: ErrorSchema,
        },
      },
    )
    .delete(
      "/habits/:habitId",
      async function deleteHabit({ params }) {
        return (await ticktick.getClient()).habits.delete(params.habitId);
      },
      {
        params: t.Object({
          habitId: t.String(),
        }),
        detail: protectedDetail(config, "Habits", "Delete habit", "Deletes a habit by id."),
        response: {
          200: DeleteResultSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/habits/checkins/query",
      async function queryHabitCheckins({ body }) {
        return (await ticktick.getClient()).habits.queryCheckins(body);
      },
      {
        body: HabitCheckinQuerySchema,
        detail: protectedDetail(config, "Habits", "Query habit check-ins", "Returns habit check-ins after a date stamp."),
        response: {
          200: HabitCheckinQueryResponseSchema,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/habits/checkins/upsert",
      async function upsertHabitCheckin({ body }) {
        return (await ticktick.getClient()).habits.upsertCheckin(body as never);
      },
      {
        body: HabitCheckinUpsertSchema,
        detail: protectedDetail(
          config,
          "Habits",
          "Upsert habit check-in",
          "Creates or updates the check-in for a habit on a specific day.",
        ),
        response: {
          200: UnknownRecord,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/habits/checkins/batch",
      async function batchHabitCheckins({ body }) {
        return (await ticktick.getClient()).habits.batchCheckins(body as never);
      },
      {
        body: HabitCheckinBatchRequestSchema,
        detail: protectedDetail(config, "Habits", "Batch mutate habit check-ins", "Submits raw check-in batch mutations."),
        response: {
          200: UnknownRecord,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/focus/state",
      async function getFocusState() {
        return (await ticktick.getClient()).focus.getState();
      },
      {
        detail: protectedDetail(config, "Focus", "Get local focus state", "Returns the focus state snapshot tracked by the client."),
        response: {
          200: FocusStateSchema,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/focus/overview",
      async function getFocusOverview() {
        return (await ticktick.getClient()).focus.getOverview();
      },
      {
        detail: protectedDetail(config, "Focus", "Get focus overview", "Returns high-level focus statistics."),
        response: {
          200: FocusOverviewSchema,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/focus/timeline",
      async function getFocusTimeline({ query }) {
        return (await ticktick.getClient()).focus.getTimeline(query.to);
      },
      {
        query: t.Object({
          to: t.Optional(t.Numeric()),
        }),
        detail: protectedDetail(config, "Focus", "Get focus timeline", "Returns the focus timeline, optionally ending at a given checkpoint."),
        response: {
          200: t.Array(FocusTimelineEntrySchema),
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/focus/distribution/:startDate/:endDate",
      async function getFocusDistribution({ params }) {
        return (await ticktick.getClient()).focus.getDistribution(params.startDate, params.endDate);
      },
      {
        params: DateRangeParamsSchema,
        detail: protectedDetail(config, "Focus", "Get focus distribution", "Returns distribution data for the given date range."),
        response: {
          200: UnknownRecord,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/focus/heatmap/:startDate/:endDate",
      async function getFocusHeatmap({ params }) {
        return (await ticktick.getClient()).focus.getHeatmap(params.startDate, params.endDate);
      },
      {
        params: DateRangeParamsSchema,
        detail: protectedDetail(config, "Focus", "Get focus heatmap", "Returns heatmap entries for the given date range."),
        response: {
          200: ArrayOfUnknownRecords,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/focus/time-distribution/:startDate/:endDate",
      async function getFocusTimeDistribution({ params }) {
        return (await ticktick.getClient()).focus.getTimeDistribution(params.startDate, params.endDate);
      },
      {
        params: DateRangeParamsSchema,
        detail: protectedDetail(
          config,
          "Focus",
          "Get focus time distribution",
          "Returns time-of-day focus distribution for the given date range.",
        ),
        response: {
          200: ArrayOfUnknownRecords,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/focus/hour-distribution/:startDate/:endDate",
      async function getFocusHourDistribution({ params }) {
        return (await ticktick.getClient()).focus.getHourDistribution(params.startDate, params.endDate);
      },
      {
        params: DateRangeParamsSchema,
        detail: protectedDetail(
          config,
          "Focus",
          "Get focus hour distribution",
          "Returns per-hour focus distribution for the given date range.",
        ),
        response: {
          200: ArrayOfUnknownRecords,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/focus/sync",
      async function syncFocusState({ body }) {
        return (await ticktick.getClient()).focus.syncCurrentState(body.lastPoint);
      },
      {
        body: FocusSyncBodySchema,
        detail: protectedDetail(config, "Focus", "Sync focus state", "Syncs the current focus state from TickTick."),
        response: {
          200: UnknownRecord,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/focus/start",
      async function startFocus({ body }) {
        return (await ticktick.getClient()).focus.start(body);
      },
      {
        body: FocusStartSchema,
        detail: protectedDetail(config, "Focus", "Start focus session", "Starts a focus session with optional metadata."),
        response: {
          200: UnknownRecord,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/focus/pause",
      async function pauseFocus({ body }) {
        return (await ticktick.getClient()).focus.pause(body);
      },
      {
        body: FocusActionSchema,
        detail: protectedDetail(config, "Focus", "Pause focus session", "Pauses the active focus session."),
        response: {
          200: UnknownRecord,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/focus/resume",
      async function resumeFocus({ body }) {
        return (await ticktick.getClient()).focus.resume(body);
      },
      {
        body: FocusActionSchema,
        detail: protectedDetail(config, "Focus", "Resume focus session", "Resumes the active focus session."),
        response: {
          200: UnknownRecord,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/focus/finish",
      async function finishFocus({ body }) {
        return (await ticktick.getClient()).focus.finish(body);
      },
      {
        body: FocusActionSchema,
        detail: protectedDetail(config, "Focus", "Finish focus session", "Finishes the active focus session."),
        response: {
          200: UnknownRecord,
          401: ErrorSchema,
        },
      },
    )
    .post(
      "/focus/stop",
      async function stopFocus({ body }) {
        return (await ticktick.getClient()).focus.stop(body);
      },
      {
        body: FocusActionSchema,
        detail: protectedDetail(config, "Focus", "Stop focus session", "Drops and optionally exits the active focus session."),
        response: {
          200: UnknownRecord,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/statistics/general",
      async function getGeneralStatistics() {
        return (await ticktick.getClient()).statistics.getGeneral();
      },
      {
        detail: protectedDetail(config, "Statistics", "Get general statistics", "Returns general account statistics."),
        response: {
          200: GeneralStatisticsSchema,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/statistics/ranking",
      async function getRankingStatistics() {
        return (await ticktick.getClient()).statistics.getRanking();
      },
      {
        detail: protectedDetail(config, "Statistics", "Get ranking statistics", "Returns ranking and score statistics."),
        response: {
          200: RankingStatisticsSchema,
          401: ErrorSchema,
        },
      },
    )
    .get(
      "/statistics/tasks/:startDate/:endDate",
      async function getTaskStatistics({ params }) {
        return (await ticktick.getClient()).statistics.getTaskStatistics(params.startDate, params.endDate);
      },
      {
        params: DateRangeParamsSchema,
        detail: protectedDetail(
          config,
          "Statistics",
          "Get task statistics by range",
          "Returns task statistics for the inclusive date range.",
        ),
        response: {
          200: t.Array(TaskStatisticsEntrySchema),
          401: ErrorSchema,
        },
      },
    );

  return baseApp.use(api);
}

function protectedDetail(config: AppConfig, tag: string, summary: string, description: string) {
  return {
    tags: [tag],
    summary,
    description,
    security: config.auth.mode === "bearer" ? [{ bearerAuth: [] }] : undefined,
  };
}
