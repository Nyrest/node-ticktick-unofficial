import type {
  TickTickCountdownDayCalculationMode,
  TickTickCountdownDayCalculationModeInput,
  TickTickCountdownDaysOption,
  TickTickCountdownDaysOptionInput,
  TickTickCountdownTimerMode,
  TickTickCountdownTimerModeInput,
  TickTickCountdownType,
  TickTickCountdownTypeInput,
  TickTickHabitCheckinStatus,
  TickTickHabitCheckinStatusInput,
  TickTickHabitStatus,
  TickTickHabitStatusInput,
  TickTickTagType,
  TickTickTagTypeInput,
  TickTickTaskItemStatus,
  TickTickTaskPriority,
  TickTickTaskPriorityInput,
  TickTickTaskStatus,
  TickTickTaskStatusInput,
} from "./semantic.js";

export type TickTickServiceName = "ticktick" | "dida365";

export interface TickTickServiceConfig {
  readonly service: TickTickServiceName;
  readonly apiBaseUrl: string;
  readonly msBaseUrl: string;
  readonly webBaseUrl: string;
  readonly loginPath: string;
  readonly defaultLanguage: string;
}

export interface TickTickCredentials {
  username: string;
  password: string;
}

export interface TickTickDeviceDescriptor {
  platform: string;
  os: string;
  device: string;
  name: string;
  version: number;
  id: string;
  channel: string;
  campaign: string;
  websocket: string;
}

export interface TickTickSerializedSession {
  service: TickTickServiceName;
  username?: string;
  token?: string;
  csrfToken?: string;
  device: TickTickDeviceDescriptor;
  cookies: Record<string, string>;
  login: TickTickPasswordLoginResponse | null;
  createdAt: string;
  updatedAt: string;
  lastValidatedAt?: string;
}

export interface TickTickSessionStore {
  load(): Promise<TickTickSerializedSession | null>;
  save(session: TickTickSerializedSession): Promise<void>;
  clear(): Promise<void>;
}

export interface TickTickClientOptions {
  service?: TickTickServiceName;
  credentials?: TickTickCredentials;
  session?: TickTickSerializedSession;
  sessionStore?: TickTickSessionStore;
  fetch?: typeof globalThis.fetch;
  timezone?: string;
  language?: string;
  userAgent?: string;
  device?: Partial<TickTickDeviceDescriptor>;
}

export interface TickTickPasswordLoginResponse {
  token: string;
  userId: string;
  userCode?: string;
  username: string;
  teamPro?: boolean;
  proStartDate?: string;
  proEndDate?: string;
  subscribeType?: string;
  subscribeFreq?: string;
  needSubscribe?: boolean;
  freq?: string;
  inboxId?: string;
  teamUser?: boolean;
  activeTeamUser?: boolean;
  freeTrial?: boolean;
  gracePeriod?: boolean;
  pro?: boolean;
  ds?: boolean;
  [key: string]: unknown;
}

export interface TickTickUserProfile {
  etimestamp?: string | null;
  username?: string;
  siteDomain?: string;
  createdCampaign?: string;
  createdDeviceInfo?: unknown | null;
  filledPassword?: boolean;
  accountDomain?: string | null;
  extenalId?: string | null;
  email?: string | null;
  verifiedEmail?: boolean;
  fakedEmail?: boolean;
  phone?: string | null;
  name?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  link?: string | null;
  picture?: string;
  gender?: number | null;
  locale?: string;
  userCode?: string;
  verCode?: string | null;
  verKey?: string | null;
  externalId?: string | null;
  phoneWithoutCountryCode?: string | null;
  displayName?: string;
  userId?: string;
  inboxId?: string;
  [key: string]: unknown;
}

export interface TickTickCountdown {
  id: string;
  type: TickTickCountdownType;
  iconRes?: string;
  color?: string;
  name: string;
  date: number;
  ignoreYear?: boolean;
  typeOfSmartList?: number;
  showCalendarType?: number;
  reminders?: string[];
  annoyingAlert?: unknown;
  repeatFlag?: string | null;
  remark?: string;
  status?: number;
  deleted?: number;
  sortOrder?: number;
  background?: string | null;
  style?: string;
  styleColor?: string[];
  dateDisplayFormat?: string;
  createdTime?: string;
  modifiedTime?: string;
  pinnedTime?: string | null;
  etag?: string;
  archivedTime?: string | null;
  timerMode?: TickTickCountdownTimerMode;
  showAge?: boolean;
  daysOption?: TickTickCountdownDaysOption;
  showRemark?: boolean | null;
  preSet?: unknown;
  [key: string]: unknown;
}

export interface TickTickCountdownBatchRequest {
  add?: TickTickCountdown[];
  update?: TickTickCountdown[];
  delete?: string[];
}

export interface TickTickCountdownBatchResponse {
  id2etag?: Record<string, string>;
  id2error?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TickTickCountdownDraft {
  name: string;
  id?: string;
  type?: TickTickCountdownTypeInput | string | number;
  iconRes?: string;
  color?: string;
  date?: number | Date | string;
  ignoreYear?: boolean;
  typeOfSmartList?: number;
  showCalendarType?: number;
  reminders?: string[];
  annoyingAlert?: unknown;
  repeatFlag?: string | null;
  remark?: string;
  status?: number;
  deleted?: number;
  sortOrder?: number;
  background?: string | null;
  style?: string;
  styleColor?: string[];
  dateDisplayFormat?: string;
  createdTime?: string;
  modifiedTime?: string;
  pinnedTime?: string | null;
  etag?: string;
  archivedTime?: string | null;
  timerMode?: TickTickCountdownTimerModeInput | string | number;
  dayCalculationMode?: TickTickCountdownDayCalculationModeInput | string | number;
  showAge?: boolean;
  daysOption?: TickTickCountdownDaysOptionInput | string | number;
  showRemark?: boolean | null;
  preSet?: unknown;
}

export interface TickTickTaskReminder {
  id: string;
  trigger: string;
  [key: string]: unknown;
}

export interface TickTickTaskItem {
  id: string;
  title: string;
  status?: TickTickTaskItemStatus;
  sortOrder?: number;
  completedTime?: string | null;
  [key: string]: unknown;
}

export interface TickTickAttachment {
  id: string;
  refId?: string;
  path?: string;
  size?: number;
  fileName?: string;
  fileType?: string;
  status?: number;
  createdTime?: string;
  [key: string]: unknown;
}

export interface TickTickTask {
  id: string;
  projectId: string;
  title: string;
  status: TickTickTaskStatus;
  priority?: TickTickTaskPriority;
  deleted?: number;
  createdTime?: string;
  modifiedTime?: string;
  completedTime?: string | null;
  completedUserId?: number;
  deletedTime?: number;
  deletedBy?: number;
  creator?: number;
  sortOrder?: number;
  items?: TickTickTaskItem[];
  reminders?: TickTickTaskReminder[];
  exDate?: string[];
  columnId?: string | null;
  isAllDay?: boolean | null;
  isFloating?: boolean;
  startDate?: string | null;
  dueDate?: string | null;
  content?: string | null;
  desc?: string | null;
  timeZone?: string;
  kind?: string | null;
  tags?: string[];
  etag?: string;
  pinnedTime?: string | null;
  [key: string]: unknown;
}

export interface TickTickTag {
  name: string;
  label?: string;
  color?: string;
  parent?: string | null;
  sortOrder?: number;
  sortType?: string;
  etag?: string;
  rawName?: string;
  type?: TickTickTagType;
  sortOption?: {
    groupBy: string;
    orderBy: string;
    order?: string | null;
  };
  timeline?: {
    sortOption: {
      groupBy: string;
      orderBy: string;
      order?: string | null;
    };
    range?: string | null;
    sortType?: string | null;
  };
}

export interface TickTickTagBatchRequest {
  add?: TickTickTag[];
  update?: TickTickTag[];
  delete?: string[];
}

export interface TickTickTagBatchResponse {
  id2etag?: Record<string, string>;
  id2error?: Record<string, unknown>;
}

export interface TickTickProjectProfile {
  id: string;
  name: string;
  color?: string;
  sortOrder?: number;
  kind?: string;
  permission?: string;
  viewMode?: string;
  closed?: boolean | null;
  [key: string]: unknown;
}

export interface TickTickProjectBatchRequest {
  add?: Array<Partial<TickTickProjectProfile> & Pick<TickTickProjectProfile, "name">>;
  update?: Array<Partial<TickTickProjectProfile> & Pick<TickTickProjectProfile, "id">>;
  delete?: string[];
}

export interface TickTickProjectBatchResponse {
  id2etag?: Record<string, string>;
  id2error?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TickTickColumn {
  id: string;
  projectId: string;
  name: string;
  sortOrder?: number;
  createdTime?: string;
  modifiedTime?: string;
  etag?: string;
  [key: string]: unknown;
}

export interface TickTickTaskSyncResponse {
  checkPoint: number;
  syncTaskBean?: {
    update?: TickTickTask[];
    tagUpdate?: unknown[];
    delete?: string[];
    add?: string[];
    empty?: boolean;
    [key: string]: unknown;
  };
  projectProfiles?: TickTickProjectProfile[];
  projectGroups?: unknown[];
  filters?: unknown;
  tags?: string[];
  inboxId?: string;
  [key: string]: unknown;
}

export interface TickTickCompletedTaskOptions {
  to?: string;
  status?: "Completed" | "Abandoned";
}

export interface TickTickTrashResponse {
  tasks: TickTickTask[];
  next: number;
  [key: string]: unknown;
}

export interface TickTickTaskBatchRequest {
  add?: TickTickTask[];
  update?: TickTickTask[];
  delete?: string[];
  addAttachments?: TickTickAttachment[];
  updateAttachments?: TickTickAttachment[];
  deleteAttachments?: string[];
}

export interface TickTickTaskBatchResponse {
  id2etag?: Record<string, string>;
  id2error?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TickTickTaskProjectMove {
  taskId: string;
  fromProjectId: string;
  toProjectId: string;
}

export interface TickTickTaskDraft {
  title: string;
  id?: string;
  projectId?: string;
  columnId?: string | null;
  content?: string | null;
  desc?: string | null;
  dueDate?: string | null;
  completedTime?: string | null;
  isAllDay?: boolean | null;
  isFloating?: boolean;
  kind?: string | null;
  progress?: number;
  priority?: TickTickTaskPriorityInput;
  status?: TickTickTaskStatusInput;
  sortOrder?: number;
  startDate?: string | null;
  tags?: string[];
  timeZone?: string;
  pinnedTime?: string | null;
}

export interface TickTickTaskStatusMutation {
  id: string;
  status: TickTickTaskStatusInput;
  completedTime?: Date | number | string | null;
}

export interface TickTickHabit {
  id: string;
  name: string;
  color?: string;
  iconRes?: string;
  sortOrder?: number;
  status?: TickTickHabitStatus;
  encouragement?: string;
  totalCheckIns?: number;
  createdTime?: string;
  modifiedTime?: string;
  archivedTime?: string | null;
  goal?: number;
  step?: number;
  type?: string;
  unit?: string;
  recordEnable?: boolean;
  repeatRule?: string;
  reminders?: unknown[];
  sectionId?: string;
  targetDays?: number;
  targetStartDate?: number;
  completedCycles?: number;
  currentStreak?: number;
  style?: number;
  exDates?: string[];
  [key: string]: unknown;
}

export interface TickTickHabitCheckin {
  id?: string | null;
  habitId: string;
  checkinStamp: number;
  checkinTime?: string | null;
  opTime?: string | null;
  goal: number;
  value: number;
  status: TickTickHabitCheckinStatus;
  [key: string]: unknown;
}

export interface TickTickHabitCheckinQuery {
  habitIds: string[];
  afterStamp: number;
}

export interface TickTickHabitBatchRequest {
  add?: TickTickHabit[];
  update?: TickTickHabit[];
  delete?: string[];
}

export interface TickTickHabitBatchResponse {
  id2etag?: Record<string, string>;
  id2error?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TickTickHabitDraft {
  name: string;
  archivedTime?: string | null;
  color?: string;
  completedCycles?: number;
  createdTime?: string;
  currentStreak?: number;
  encouragement?: string;
  etag?: string;
  exDates?: string[];
  status?: TickTickHabitStatusInput;
  goal?: number;
  iconRes?: string;
  id?: string;
  modifiedTime?: string;
  recordEnable?: boolean;
  reminders?: unknown[];
  repeatRule?: string;
  sectionId?: string;
  sortOrder?: number;
  step?: number;
  style?: number;
  targetDays?: number;
  targetStartDate?: number;
  totalCheckIns?: number;
  type?: string;
  unit?: string;
}

export interface TickTickHabitCheckinUpsertInput {
  habitId: string;
  value?: number;
  status?: TickTickHabitCheckinStatusInput;
  goal: number;
  date?: Date | number | string;
}

export interface TickTickHabitCheckinBatchRequest {
  add?: TickTickHabitCheckin[];
  update?: TickTickHabitCheckin[];
  delete?: string[];
}

export interface TickTickHabitCheckinQueryResponse {
  checkins: Record<string, TickTickHabitCheckin[]>;
  [key: string]: unknown;
}

export interface TickTickFocusTimelineEntry {
  id: string;
  startTime: string;
  endTime: string;
  status: number;
  pauseDuration: number;
  type: number;
  tasks?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface TickTickFocusOverview {
  todayPomoCount: number;
  todayPomoDuration: number;
  totalPomoCount: number;
  totalPomoDuration: number;
  [key: string]: unknown;
}

export type TickTickFocusOperationName = "start" | "pause" | "continue" | "finish" | "drop" | "exit";

export interface TickTickFocusOperation {
  id: string;
  oId: string;
  oType: number;
  op: TickTickFocusOperationName;
  duration: number;
  firstFocusId: string;
  focusOnId: string;
  focusOnType?: number | null;
  focusOnTitle?: string | null;
  autoPomoLeft: number;
  pomoCount: number;
  manual: boolean;
  note: string;
  time: string;
  createdTime: number;
}

export interface TickTickFocusBatchRequest {
  lastPoint: number;
  opList: TickTickFocusOperation[];
}

export interface TickTickFocusStateSnapshot {
  lastPoint: number;
  focusId: string | null;
  firstFocusId: string | null;
  duration: number;
  autoPomoLeft: number;
  pomoCount: number;
  manual: boolean;
  note: string;
  focusOnId: string;
  focusOnType: number | null;
  focusOnTitle: string | null;
  status: number | null;
  rawCurrent: Record<string, unknown>;
}

export interface TickTickTaskStatisticsEntry {
  overdueCompleteCount: number;
  onTimeCompleteCount: number;
  noTimeCompleteCount: number;
  notCompleteCount: number;
  projectCompleteCounts: Record<string, number>;
  tagCompleteCounts: Record<string, number>;
  day: string;
  timezone: string;
  [key: string]: unknown;
}

export interface TickTickGeneralStatistics {
  score: number;
  level: number;
  todayCompleted: number;
  totalCompleted: number;
  todayPomoCount: number;
  totalPomoCount: number;
  [key: string]: unknown;
}

export interface TickTickRankingStatistics {
  ranking: number;
  taskCount: number;
  projectCount: number;
  dayCount: number;
  completedCount: number;
  score: number;
  level: number;
  [key: string]: unknown;
}
