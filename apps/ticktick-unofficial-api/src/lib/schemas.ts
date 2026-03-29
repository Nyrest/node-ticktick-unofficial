import { t } from "elysia";

const NullableString = t.Union([t.String(), t.Null()]);
const UnknownRecord = t.Record(t.String(), t.Any());

export const ErrorSchema = t.Object({
  code: t.String(),
  message: t.String(),
  details: t.Optional(t.Any()),
});

export const RootInfoSchema = t.Object({
  name: t.String(),
  version: t.String(),
  runtime: t.String(),
  docs: t.Object({
    openapi: t.String(),
    swagger: t.Union([t.String(), t.Null()]),
  }),
  auth: t.Object({
    mode: t.String(),
  }),
  cron: t.Object({
    driver: t.String(),
    enabled: t.Boolean(),
  }),
  telemetry: t.Object({
    enabled: t.Boolean(),
  }),
});

export const HealthSchema = t.Object({
  ok: t.Literal(true),
  timestamp: t.String({ format: "date-time" }),
  service: t.String(),
  runtime: t.String(),
});

export const SessionStatusSchema = t.Object({
  hasSession: t.Boolean(),
  username: t.String(),
  service: t.String(),
  updatedAt: NullableString,
  createdAt: NullableString,
  deviceId: NullableString,
  sessionStore: t.String(),
  authMode: t.String(),
  cronDriver: t.String(),
  telemetryEnabled: t.Boolean(),
});

export const SessionMaintenanceSchema = t.Object({
  ok: t.Literal(true),
  action: t.Union([t.Literal("login"), t.Literal("relogin"), t.Literal("keepalive")]),
  source: t.String(),
  ranAt: t.String({ format: "date-time" }),
  sessionUpdatedAt: NullableString,
  sessionCreatedAt: NullableString,
  deviceId: NullableString,
});

export const UserProfileSchema = t.Object(
  {
    userId: t.Optional(t.String()),
    username: t.Optional(t.String()),
    inboxId: t.Optional(t.String()),
  },
  { additionalProperties: true },
);

export const ColumnSchema = t.Object(
  {
    id: t.String(),
    projectId: t.String(),
    name: t.String(),
    sortOrder: t.Optional(t.Number()),
    createdTime: t.Optional(t.String()),
    modifiedTime: t.Optional(t.String()),
    etag: t.Optional(t.String()),
  },
  { additionalProperties: true },
);

export const ProjectSchema = t.Object(
  {
    id: t.String(),
    name: t.String(),
    color: t.Optional(t.String()),
    sortOrder: t.Optional(t.Number()),
    kind: t.Optional(t.String()),
    permission: t.Optional(t.String()),
    viewMode: t.Optional(t.String()),
    closed: t.Optional(t.Union([t.Boolean(), t.Null()])),
  },
  { additionalProperties: true },
);

export const ProjectBatchResponseSchema = t.Object(
  {
    id2etag: t.Optional(t.Record(t.String(), t.String())),
    id2error: t.Optional(UnknownRecord),
  },
  { additionalProperties: true },
);

export const ProjectCreateSchema = t.Object(
  {
    name: t.String(),
    color: t.Optional(t.String()),
    sortOrder: t.Optional(t.Number()),
    viewMode: t.Optional(t.String()),
  },
  { additionalProperties: true },
);

export const ProjectUpdateSchema = t.Object(
  {
    id: t.String(),
    name: t.Optional(t.String()),
    color: t.Optional(t.String()),
    sortOrder: t.Optional(t.Number()),
    viewMode: t.Optional(t.String()),
  },
  { additionalProperties: true },
);

export const ProjectBatchRequestSchema = t.Object({
  add: t.Optional(t.Array(ProjectCreateSchema)),
  update: t.Optional(t.Array(ProjectUpdateSchema)),
  delete: t.Optional(t.Array(t.String())),
});

export const TaskItemSchema = t.Object(
  {
    id: t.String(),
    title: t.String(),
    status: t.Optional(t.Number()),
    sortOrder: t.Optional(t.Number()),
    completedTime: t.Optional(NullableString),
  },
  { additionalProperties: true },
);

export const TaskReminderSchema = t.Object(
  {
    id: t.String(),
    trigger: t.String(),
  },
  { additionalProperties: true },
);

export const TaskSchema = t.Object(
  {
    id: t.String(),
    projectId: t.String(),
    title: t.String(),
    status: t.Number(),
    priority: t.Optional(t.Number()),
    deleted: t.Optional(t.Number()),
    createdTime: t.Optional(t.String()),
    modifiedTime: t.Optional(t.String()),
    completedTime: t.Optional(NullableString),
    columnId: t.Optional(t.Union([t.String(), t.Null()])),
    isAllDay: t.Optional(t.Union([t.Boolean(), t.Null()])),
    isFloating: t.Optional(t.Boolean()),
    startDate: t.Optional(NullableString),
    dueDate: t.Optional(NullableString),
    content: t.Optional(NullableString),
    desc: t.Optional(NullableString),
    timeZone: t.Optional(t.String()),
    kind: t.Optional(t.Union([t.String(), t.Null()])),
    tags: t.Optional(t.Array(t.String())),
    items: t.Optional(t.Array(TaskItemSchema)),
    reminders: t.Optional(t.Array(TaskReminderSchema)),
  },
  { additionalProperties: true },
);

export const TaskSyncSchema = t.Object(
  {
    checkPoint: t.Number(),
    syncTaskBean: t.Optional(
      t.Object(
        {
          update: t.Optional(t.Array(TaskSchema)),
          delete: t.Optional(t.Array(t.String())),
          add: t.Optional(t.Array(t.String())),
          empty: t.Optional(t.Boolean()),
        },
        { additionalProperties: true },
      ),
    ),
    projectProfiles: t.Optional(t.Array(ProjectSchema)),
    tags: t.Optional(t.Array(t.String())),
    inboxId: t.Optional(t.String()),
  },
  { additionalProperties: true },
);

export const TaskDraftSchema = t.Object(
  {
    title: t.String(),
    id: t.Optional(t.String()),
    projectId: t.Optional(t.String()),
    columnId: t.Optional(t.Union([t.String(), t.Null()])),
    content: t.Optional(t.Union([t.String(), t.Null()])),
    desc: t.Optional(t.Union([t.String(), t.Null()])),
    dueDate: t.Optional(t.Union([t.String(), t.Null()])),
    completedTime: t.Optional(t.Union([t.String(), t.Number(), t.Null()])),
    isAllDay: t.Optional(t.Union([t.Boolean(), t.Null()])),
    isFloating: t.Optional(t.Boolean()),
    kind: t.Optional(t.Union([t.String(), t.Null()])),
    progress: t.Optional(t.Number()),
    priority: t.Optional(t.Union([t.String(), t.Number()])),
    status: t.Optional(t.Union([t.String(), t.Number()])),
    sortOrder: t.Optional(t.Number()),
    startDate: t.Optional(t.Union([t.String(), t.Null()])),
    tags: t.Optional(t.Array(t.String())),
    timeZone: t.Optional(t.String()),
  },
  { additionalProperties: true },
);

export const TaskBatchRequestSchema = t.Object({
  add: t.Optional(t.Array(TaskSchema)),
  update: t.Optional(t.Array(TaskSchema)),
  delete: t.Optional(t.Array(t.String())),
});

export const TaskBatchResponseSchema = t.Object(
  {
    id2etag: t.Optional(t.Record(t.String(), t.String())),
    id2error: t.Optional(UnknownRecord),
  },
  { additionalProperties: true },
);

export const TaskStatusMutationSchema = t.Object({
  id: t.String(),
  status: t.Union([t.String(), t.Number()]),
  completedTime: t.Optional(t.Union([t.String(), t.Number(), t.Null()])),
});

export const TaskMoveSchema = t.Object({
  taskId: t.String(),
  toProjectId: t.String(),
});

export const CompletedTasksQuerySchema = t.Object({
  to: t.Optional(t.String()),
  status: t.Optional(t.Union([t.Literal("Completed"), t.Literal("Abandoned")])),
});

export const TrashQuerySchema = t.Object({
  limit: t.Optional(t.Numeric()),
  taskType: t.Optional(t.Numeric()),
});

export const TrashResponseSchema = t.Object(
  {
    tasks: t.Array(TaskSchema),
    next: t.Number(),
  },
  { additionalProperties: true },
);

export const HabitSchema = t.Object(
  {
    id: t.String(),
    name: t.String(),
    color: t.Optional(t.String()),
    iconRes: t.Optional(t.String()),
    sortOrder: t.Optional(t.Number()),
    status: t.Optional(t.Number()),
    encouragement: t.Optional(t.String()),
    totalCheckIns: t.Optional(t.Number()),
    createdTime: t.Optional(t.String()),
    modifiedTime: t.Optional(t.String()),
    archivedTime: t.Optional(NullableString),
    goal: t.Optional(t.Number()),
    step: t.Optional(t.Number()),
    type: t.Optional(t.String()),
    unit: t.Optional(t.String()),
    recordEnable: t.Optional(t.Boolean()),
    repeatRule: t.Optional(t.String()),
  },
  { additionalProperties: true },
);

export const HabitDraftSchema = t.Object(
  {
    name: t.String(),
    archivedTime: t.Optional(t.Union([t.String(), t.Null()])),
    color: t.Optional(t.String()),
    encouragement: t.Optional(t.String()),
    goal: t.Optional(t.Number()),
    iconRes: t.Optional(t.String()),
    repeatRule: t.Optional(t.String()),
    status: t.Optional(t.Union([t.String(), t.Number()])),
    type: t.Optional(t.String()),
    unit: t.Optional(t.String()),
  },
  { additionalProperties: true },
);

export const HabitBatchRequestSchema = t.Object({
  add: t.Optional(t.Array(HabitSchema)),
  update: t.Optional(t.Array(HabitSchema)),
  delete: t.Optional(t.Array(t.String())),
});

export const HabitBatchResponseSchema = t.Object(
  {
    id2etag: t.Optional(t.Record(t.String(), t.String())),
    id2error: t.Optional(UnknownRecord),
  },
  { additionalProperties: true },
);

export const HabitWeeklyStatisticsSchema = t.Record(
  t.String(),
  t.Object({
    totalHabitCount: t.Number(),
    completedHabitCount: t.Number(),
  }),
);

export const HabitCheckinSchema = t.Object(
  {
    id: t.Optional(t.Union([t.String(), t.Null()])),
    habitId: t.String(),
    checkinStamp: t.Number(),
    checkinTime: t.Optional(NullableString),
    opTime: t.Optional(NullableString),
    goal: t.Number(),
    value: t.Number(),
    status: t.Number(),
  },
  { additionalProperties: true },
);

export const HabitCheckinQuerySchema = t.Object({
  habitIds: t.Array(t.String()),
  afterStamp: t.Number(),
});

export const HabitCheckinQueryResponseSchema = t.Object({
  checkins: t.Record(t.String(), t.Array(HabitCheckinSchema)),
});

export const HabitCheckinBatchRequestSchema = t.Object({
  add: t.Optional(t.Array(HabitCheckinSchema)),
  update: t.Optional(t.Array(HabitCheckinSchema)),
  delete: t.Optional(t.Array(t.String())),
});

export const HabitCheckinUpsertSchema = t.Object({
  habitId: t.String(),
  value: t.Optional(t.Number()),
  status: t.Optional(t.Union([t.String(), t.Number()])),
  goal: t.Number(),
  date: t.Optional(t.Union([t.String(), t.Number()])),
});

export const FocusOverviewSchema = t.Object(
  {
    todayPomoCount: t.Number(),
    todayPomoDuration: t.Number(),
    totalPomoCount: t.Number(),
    totalPomoDuration: t.Number(),
  },
  { additionalProperties: true },
);

export const FocusTimelineEntrySchema = t.Object(
  {
    id: t.String(),
    startTime: t.String(),
    endTime: t.String(),
    status: t.Number(),
    pauseDuration: t.Number(),
    type: t.Number(),
    tasks: t.Optional(t.Array(UnknownRecord)),
  },
  { additionalProperties: true },
);

export const FocusStateSchema = t.Object(
  {
    lastPoint: t.Number(),
    focusId: t.Union([t.String(), t.Null()]),
    firstFocusId: t.Union([t.String(), t.Null()]),
    duration: t.Number(),
    autoPomoLeft: t.Number(),
    pomoCount: t.Number(),
    manual: t.Boolean(),
    note: t.String(),
    focusOnId: t.String(),
    focusOnType: t.Union([t.Number(), t.Null()]),
    focusOnTitle: t.Union([t.String(), t.Null()]),
    status: t.Union([t.Number(), t.Null()]),
    rawCurrent: UnknownRecord,
  },
);

export const FocusStartSchema = t.Object({
  duration: t.Optional(t.Number()),
  autoPomoLeft: t.Optional(t.Number()),
  pomoCount: t.Optional(t.Number()),
  manual: t.Optional(t.Boolean()),
  note: t.Optional(t.String()),
  focusOnId: t.Optional(t.String()),
  focusOnType: t.Optional(t.Union([t.Number(), t.Null()])),
  focusOnTitle: t.Optional(t.Union([t.String(), t.Null()])),
  lastPoint: t.Optional(t.Number()),
});

export const FocusActionSchema = t.Object({
  manual: t.Optional(t.Boolean()),
  note: t.Optional(t.String()),
  lastPoint: t.Optional(t.Number()),
  includeExit: t.Optional(t.Boolean()),
});

export const DateRangeParamsSchema = t.Object({
  startDate: t.String({ description: "Date formatted as YYYY-MM-DD" }),
  endDate: t.String({ description: "Date formatted as YYYY-MM-DD" }),
});

export const FocusSyncBodySchema = t.Object({
  lastPoint: t.Optional(t.Number()),
});

export const GeneralStatisticsSchema = t.Object(
  {
    score: t.Number(),
    level: t.Number(),
    todayCompleted: t.Number(),
    totalCompleted: t.Number(),
    todayPomoCount: t.Number(),
    totalPomoCount: t.Number(),
  },
  { additionalProperties: true },
);

export const RankingStatisticsSchema = t.Object(
  {
    ranking: t.Number(),
    taskCount: t.Number(),
    projectCount: t.Number(),
    dayCount: t.Number(),
    completedCount: t.Number(),
    score: t.Number(),
    level: t.Number(),
  },
  { additionalProperties: true },
);

export const TaskStatisticsEntrySchema = t.Object(
  {
    overdueCompleteCount: t.Number(),
    onTimeCompleteCount: t.Number(),
    noTimeCompleteCount: t.Number(),
    notCompleteCount: t.Number(),
    projectCompleteCounts: t.Record(t.String(), t.Number()),
    tagCompleteCounts: t.Record(t.String(), t.Number()),
    day: t.String(),
    timezone: t.String(),
  },
  { additionalProperties: true },
);
