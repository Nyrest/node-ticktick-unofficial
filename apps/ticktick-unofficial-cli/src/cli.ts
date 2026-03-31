#!/usr/bin/env bun

import { writeFile } from "node:fs/promises";
import packageJson from "../package.json" with { type: "json" };

import { Crust, type CommandNode } from "@crustjs/core";
import { confirm, input, password, select, spinner } from "@crustjs/prompts";
import { helpPlugin, renderHelp } from "@crustjs/plugins";
import {
  TickTickHabitCheckinStatusInputHelp,
  TickTickCountdownDayCalculationModeInputHelp,
  TickTickCountdownDaysOptionInputHelp,
  TickTickCountdownTimerModeInputHelp,
  TickTickCountdownTypeInputHelp,
  TickTickTaskPriorityInputHelp,
  TickTickTaskStatuses,
  TickTickTaskStatusInputHelp,
} from "node-ticktick-unofficial";
import type { TickTickClient, TickTickCountdown, TickTickHabit, TickTickTask } from "node-ticktick-unofficial";

import {
  APP_NAME,
  CliError,
  ENV_PASSWORD,
  ENV_USERNAME,
  createRuntime,
  indexProjects,
  loginWithCredentials,
  logout,
  parseDateInput,
  formatHabitCheckinStatusLabel,
  formatCountdownDayCalculationModeLabel,
  formatCountdownDaysOptionLabel,
  formatCountdownTimerModeLabel,
  formatCountdownTypeLabel,
  parseHabitCheckinStatus,
  parseCountdownDayCalculationMode,
  parseCountdownDaysOption,
  parseCountdownTimerMode,
  parseCountdownType,
  parsePriority,
  parseTaskStatus,
  pickHabits,
  pickTaskCollection,
  requireClient,
  resolveCountdown,
  resolveDateRange,
  resolveHabit,
  resolveProject,
  resolveProjects,
  resolveSessionPath,
  resolveTag,
  resolveTask,
  resolveTaskByReference,
  resolveTasks,
  resolveTasksByReferences,
  serializeError,
  sortTasks,
  toDayKey,
  withService,
  withSessionPath,
  type SortOrder,
  type TaskSortField,
  type RuntimeContext,
  type SharedFlags,
} from "./lib/app.ts";
import { runFocusMode } from "./lib/focus-mode.ts";
import {
  formatDate,
  formatFocusStatus,
  printOutput,
  renderHabitTable,
  renderCountdownDetails,
  renderCountdownTable,
  renderProjectDetails,
  renderProjectTable,
  renderStatistics,
  renderTaskDetails,
  renderTaskTable,
} from "./lib/output.ts";

const rootFlags = {
  json: {
    type: "boolean",
    short: "j",
    inherit: true,
    description: "Emit JSON for automation and agents",
  },
  color: {
    type: "boolean",
    default: true,
    inherit: true,
    description: "Enable ANSI styling (use --no-color to disable)",
  },
  service: {
    type: "string",
    inherit: true,
    description: "TickTick service target: ticktick or dida365",
  },
  session: {
    type: "string",
    inherit: true,
    description: "Override the persisted session file path",
  },
  timezone: {
    type: "string",
    inherit: true,
    description: "Override the request timezone",
  },
  verbose: {
    type: "boolean",
    short: "V",
    inherit: true,
    description: "Show verbose error details",
  },
  version: {
    type: "boolean",
    short: "v",
    inherit: true,
    description: "Show version number",
  },
} as const;

let cli!: Crust<any, any, any>;

function joinWords(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(" ").trim();
  }

  return value?.trim() ?? "";
}

function ensureValue(value: string, label: string): string {
  if (!value) {
    throw new CliError(`${label} is required.`);
  }

  return value;
}

function parseBooleanValue(input: string): boolean {
  if (input === "true" || input === "yes" || input === "1") return true;
  if (input === "false" || input === "no" || input === "0") return false;
  throw new CliError(`Invalid boolean "${input}". Use true/false.`);
}

function parseNumberValue(input: string | number | undefined, label: string): number | undefined {
  if (input == null || input === "") {
    return undefined;
  }

  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value)) {
    throw new CliError(`Invalid ${label} "${input}". Use a number.`);
  }

  return value;
}

function parseTaskSortField(input: string | undefined): TaskSortField {
  const value = input?.trim().toLowerCase() ?? "updated";
  if (value === "updated" || value === "created" || value === "due" || value === "priority" || value === "title") {
    return value;
  }

  throw new CliError(`Invalid task sort "${input}". Use updated, created, due, priority, or title.`);
}

function parseSortOrder(input: string | undefined): SortOrder {
  const value = input?.trim().toLowerCase() ?? "desc";
  if (value === "asc" || value === "desc") {
    return value;
  }

  throw new CliError(`Invalid sort order "${input}". Use asc or desc.`);
}

function parseCommaSeparatedStrings(input: string | undefined): string[] | undefined {
  if (!input) {
    return undefined;
  }

  const values = input
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}

function readApiErrorCode(error: unknown): string | undefined {
  const responseBody = Reflect.get(error as object, "responseBody");
  if (!responseBody || typeof responseBody !== "object") {
    return undefined;
  }

  const errorCode = Reflect.get(responseBody as object, "errorCode");
  return typeof errorCode === "string" ? errorCode : undefined;
}

function requireConfirmation(
  approved: boolean | undefined,
  message: string,
): Promise<boolean> {
  if (approved) {
    return Promise.resolve(true);
  }

  if (!process.stdin.isTTY) {
    throw new CliError(`Non-interactive removal requires -y. ${message}`);
  }

  return confirm({
    message,
    default: false,
  });
}

function withRuntime<T extends { flags: Record<string, unknown> }>(
  handler: (ctx: T, runtime: RuntimeContext) => Promise<void>,
): (ctx: T) => Promise<void> {
  return async (ctx) => {
    const runtime = await createRuntime(ctx.flags as SharedFlags);
    try {
      await handler(ctx, runtime);
    } catch (error) {
      if (runtime.json) {
        console.error(
          JSON.stringify(
            {
              ok: false,
              error: serializeError(error),
            },
            null,
            2,
          ),
        );
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  };
}

async function resolveOpenTaskByReference(client: TickTickClient, reference: string): Promise<TickTickTask> {
  const tasks = await client.tasks.list();

  try {
    return resolveTask(tasks, reference);
  } catch (error) {
    if (!looksLikeTaskId(reference)) {
      throw error;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const task = await client.tasks.getById(reference);
      if (task) {
        return task;
      }

      await Bun.sleep(500 * (attempt + 1));
    }

    throw error;
  }
}

function renderHelpForPath(path: string[]): string {
  const root = cli._node;
  let node: CommandNode = root;
  const commandPath = [root.meta.name];

  for (const part of path) {
    const next = node.subCommands[part];
    if (!next) {
      throw new CliError(`Unknown command path "${path.join(" ")}".`);
    }

    node = next;
    commandPath.push(part);
  }

  return renderHelp(node, commandPath);
}

async function chooseLoginService(runtime: RuntimeContext): Promise<"ticktick" | "dida365"> {
  if (runtime.flags.service ?? process.env.TICKTICK_SERVICE) {
    return runtime.service;
  }

  return select<"ticktick" | "dida365">({
    message: "Service",
    choices: [
      { label: "TickTick", value: "ticktick" },
      { label: "Dida365", value: "dida365" },
    ],
    default: runtime.service,
  });
}

function createHelpCommand() {
  return new Crust("help")
    .flags(rootFlags)
    .meta({
      description: "Show help for the CLI or a subcommand path",
    })
    .args([{ name: "path", type: "string", variadic: true }] as const)
    .run(({ args }) => {
      console.log(renderHelpForPath(args.path ?? []));
    });
}

function createLoginCommand() {
  return new Crust("login")
    .meta({
      description: "Log in interactively or with flags/env vars and persist the session",
    })
    .flags({
      ...rootFlags,
      username: {
        type: "string",
        short: "u",
        description: `TickTick username or email (falls back to ${ENV_USERNAME})`,
      },
      password: {
        type: "string",
        short: "p",
        description: `TickTick password (falls back to ${ENV_PASSWORD})`,
      },
      "save-as": {
        type: "string",
        description: "Save the session under this file name or full file path",
      },
    } as const)
    .run(
      withRuntime(async ({ flags }, runtime) => {
        if (flags.session && flags["save-as"]) {
          throw new CliError("Use either --session or --save-as for login, not both.");
        }

        const selectedService = await chooseLoginService(runtime);
        const loginSessionPath = resolveSessionPath(flags["save-as"] ?? flags.session ?? runtime.sessionPath);
        const loginRuntime = withService(withSessionPath(runtime, loginSessionPath), selectedService);
        const service = selectedService === "ticktick" ? "TickTick" : "Dida365";
        const username =
          flags.username ??
          process.env[ENV_USERNAME] ??
          (await input({
            message: `${service} username`,
            default: runtime.config.username,
          }));
        const passwordValue =
          flags.password ??
          process.env[ENV_PASSWORD] ??
          (await password({
            message: `${service} password`,
          }));

        const client = runtime.json
          ? await loginWithCredentials(loginRuntime, { username, password: passwordValue }, selectedService)
          : await spinner({
              message: `Logging in to ${service}...`,
              task: async () => loginWithCredentials(loginRuntime, { username, password: passwordValue }, selectedService),
            });
        const profile = await client.user.getProfile();

        printOutput(
          loginRuntime,
          {
            ok: true,
            profile,
            service: selectedService,
            sessionPath: loginRuntime.sessionPath,
          },
          () =>
            [
              `Logged in to ${service}.`,
              `User: ${profile.username ?? username}`,
              `Session: ${loginRuntime.sessionPath}`,
            ].join("\n"),
        );
      }),
    );
}

function createLogoutCommand() {
  return new Crust("logout")
    .flags(rootFlags)
    .meta({
      description: "Clear the persisted session",
    })
    .run(
      withRuntime(async (_, runtime) => {
        await logout(runtime);
        printOutput(
          runtime,
          {
            ok: true,
            service: runtime.service,
            sessionPath: runtime.sessionPath,
          },
          () => `Cleared the ${runtime.service} session at ${runtime.sessionPath}.`,
        );
      }),
    );
}

function createWhoamiCommand() {
  return new Crust("whoami")
    .flags(rootFlags)
    .meta({
      description: "Show the active account and session details",
    })
    .run(
      withRuntime(async (_, runtime) => {
        const client = await requireClient(runtime);
        const profile = await client.user.getProfile();

        printOutput(
          runtime,
          {
            ok: true,
            profile,
            service: runtime.service,
            sessionPath: runtime.sessionPath,
          },
          () =>
            [
              `Service: ${runtime.service}`,
              `Username: ${profile.username ?? runtime.config.username ?? "-"}`,
              `User ID: ${profile.userId ?? "-"}`,
              `Inbox ID: ${profile.inboxId ?? "-"}`,
              `Session: ${runtime.sessionPath}`,
            ].join("\n"),
        );
      }),
    );
}

function createTagCommand() {
  return new Crust("tag")
    .flags(rootFlags)
    .meta({
      description: "Manage TickTick tags",
    })
    .command(
      "list",
      (command) =>
        command
          .meta({
            description: "List tags",
          })
          .flags({
            ...rootFlags,
            search: {
              type: "string",
              description: "Filter tags by name",
            },
          } as const)
          .run(
            withRuntime(async ({ flags }, runtime) => {
              const client = await requireClient(runtime);
              const tags = await client.tags.list();
              const search = flags.search?.toLowerCase();
              const filtered = search
                ? tags.filter((tag) => tag.name.toLowerCase().includes(search))
                : tags;

              printOutput(
                runtime,
                {
                  ok: true,
                  count: filtered.length,
                  tags: filtered,
                },
                () => renderTagTable(filtered),
              );
            }),
          ),
    )
    .command(
      "show",
      (command) =>
        command
          .meta({
            description: "Show one tag",
          })
          .args([{ name: "tag", type: "string", required: true }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const client = await requireClient(runtime);
              const tags = await client.tags.list();
              const tag = resolveTag(tags, args.tag);

              printOutput(
                runtime,
                {
                  ok: true,
                  tag,
                },
                () => renderTagDetails(tag),
              );
            }),
          ),
    )
    .command(
      "add",
      (command) =>
        command
          .meta({
            description: "Create a tag",
          })
          .flags({
            ...rootFlags,
            color: {
              type: "string",
              description: "Tag color, for example #4F86F7",
            },
            parent: {
              type: "string",
              description: "Parent tag name",
            },
          } as const)
          .args([{ name: "label", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const client = await requireClient(runtime);
              const label = ensureValue(joinWords(args.label), "Tag label");
              const result = await client.tags.create({
                label,
                name: label.toLowerCase(),
                color: flags.color ?? undefined,
                parent: flags.parent ?? undefined,
              });

              printOutput(
                runtime,
                {
                  ok: true,
                  result,
                },
                () => `Created tag ${label}.`,
              );
            }),
          ),
    )
    .command(
      "edit",
      (command) =>
        command
          .meta({
            description: "Edit a tag",
          })
          .flags({
            ...rootFlags,
            color: {
              type: "string",
              description: "Tag color",
            },
            label: {
              type: "string",
              description: "New label for the tag",
            },
            parent: {
              type: "string",
              description: "New parent tag name",
            },
          } as const)
          .args([{ name: "tag", type: "string", required: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const client = await requireClient(runtime);
              const tags = await client.tags.list();
              const current = resolveTag(tags, args.tag);

              const updated: TickTickTag = {
                ...current,
                ...(flags.label ? { label: flags.label } : null),
                ...(flags.color !== undefined ? { color: flags.color } : null),
                ...(flags.parent !== undefined ? { parent: flags.parent || null } : null),
              };

              const result = await client.tags.update(updated);

              printOutput(
                runtime,
                {
                  ok: true,
                  result,
                },
                () => `Updated tag ${current.name}.`,
              );
            }),
          ),
    )
    .command(
      "rename",
      (command) =>
        command
          .meta({
            description: "Rename a tag",
          })
          .args([
            { name: "tag", type: "string", required: true },
            { name: "new-label", type: "string", required: true, variadic: true },
          ] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const client = await requireClient(runtime);
              const tags = await client.tags.list();
              const current = resolveTag(tags, args.tag);
              const newLabel = joinWords(args["new-label"]);
              const result = await client.tags.rename(current.name, newLabel);

              printOutput(
                runtime,
                {
                  ok: true,
                  result,
                },
                () => `Renamed tag ${current.name} to ${newLabel}.`,
              );
            }),
          ),
    )
    .command(
      "merge",
      (command) =>
        command
          .meta({
            description: "Merge a tag into another",
          })
          .args([
            { name: "tag", type: "string", required: true },
            { name: "target-tag", type: "string", required: true },
          ] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const client = await requireClient(runtime);
              const tags = await client.tags.list();
              const current = resolveTag(tags, args.tag);
              const target = resolveTag(tags, args["target-tag"]);
              const result = await client.tags.merge(current.name, target.name);

              printOutput(
                runtime,
                {
                  ok: true,
                  result,
                },
                () => `Merged tag ${current.name} into ${target.name}.`,
              );
            }),
          ),
    )
    .command(
      "pin",
      (command) =>
        command
          .meta({
            description: "Pin a tag to sidebar",
          })
          .args([{ name: "tag", type: "string", required: true }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const client = await requireClient(runtime);
              const tags = await client.tags.list();
              const tag = resolveTag(tags, args.tag);
              await client.tags.setPinned(tag.name, true);

              printOutput(
                runtime,
                {
                  ok: true,
                  tag,
                },
                () => `Pinned tag ${tag.name} to sidebar.`,
              );
            }),
          ),
    )
    .command(
      "unpin",
      (command) =>
        command
          .meta({
            description: "Unpin a tag from sidebar",
          })
          .args([{ name: "tag", type: "string", required: true }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const client = await requireClient(runtime);
              const tags = await client.tags.list();
              const tag = resolveTag(tags, args.tag);
              await client.tags.setPinned(tag.name, false);

              printOutput(
                runtime,
                {
                  ok: true,
                  tag,
                },
                () => `Unpinned tag ${tag.name} from sidebar.`,
              );
            }),
          ),
    )
    .command(
      "delete",
      (command) =>
        command
          .meta({
            description: "Delete one or more tags",
          })
          .flags({
            ...rootFlags,
            y: {
              type: "boolean",
              description: "Skip confirmation",
            },
          } as const)
          .args([{ name: "tags", type: "string", required: true, variadic: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const client = await requireClient(runtime);
              await requireConfirmation(flags.y ?? false, "Use -y to delete tags without a prompt.");

              const tags = await client.tags.list();
              const selected = args.tags.map((reference) => resolveTag(tags, reference));
              const result = await client.tags.delete(selected.map((tag) => tag.name));

              printOutput(
                runtime,
                {
                  tags: selected,
                  ok: true,
                  result,
                },
                () => `Deleted ${selected.length} tag${selected.length === 1 ? "" : "s"}.`,
              );
            }),
          ),
    );
}

function createProjectCommand() {
  return new Crust("project")
    .flags(rootFlags)
    .meta({
      description: "Manage TickTick projects",
    })
    .command(
      "list",
      (command) =>
        command
          .meta({
            description: "List projects",
          })
          .flags({
            ...rootFlags,
            search: {
              type: "string",
              description: "Filter projects by name",
            },
          } as const)
          .run(
            withRuntime(async ({ flags }, runtime) => {
              const client = await requireClient(runtime);
              const projects = await client.projects.list();
              const search = flags.search?.toLowerCase();
              const filtered = search
                ? projects.filter((project) => project.name.toLowerCase().includes(search))
                : projects;

              printOutput(
                runtime,
                {
                  ok: true,
                  count: filtered.length,
                  projects: filtered,
                },
                () => renderProjectTable(filtered),
              );
            }),
          ),
    )
    .command(
      "show",
      (command) =>
        command
          .meta({
            description: "Show one project",
          })
          .args([{ name: "project", type: "string", required: true }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const client = await requireClient(runtime);
              const projects = await client.projects.list();
              const project = resolveProject(projects, args.project);

              printOutput(
                runtime,
                {
                  ok: true,
                  project,
                },
                () => renderProjectDetails(project),
              );
            }),
          ),
    )
    .command(
      "columns",
      (command) =>
        command
          .meta({
            description: "Show columns for a project",
          })
          .args([{ name: "project", type: "string", required: true }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const client = await requireClient(runtime);
              const projects = await client.projects.list();
              const project = resolveProject(projects, args.project);
              const columns = await client.projects.listColumns(project.id);

              printOutput(
                runtime,
                {
                  ok: true,
                  columns,
                  project,
                },
                () => {
                  if (columns.length === 0) {
                    return `No columns found for ${project.name}.`;
                  }

                  return columns.map((column) => `${column.id}  ${column.name}`).join("\n");
                },
              );
            }),
          ),
    )
    .command(
      "add",
      (command) =>
        command
          .meta({
            description: "Create a project",
          })
          .flags({
            ...rootFlags,
            color: {
              type: "string",
              description: "Project color, for example #4F86F7",
            },
            kind: {
              type: "string",
              default: "TASK",
              description: "Project kind",
            },
            view: {
              type: "string",
              default: "list",
              description: "Project view mode, for example list or kanban",
            },
          } as const)
          .args([{ name: "name", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const client = await requireClient(runtime);
              const name = ensureValue(joinWords(args.name), "Project name");
              const result = await client.projects.create({
                name,
                color: flags.color ?? undefined,
                kind: flags.kind ?? undefined,
                viewMode: flags.view ?? undefined,
              });
              const projectId = Object.keys(result.id2etag ?? {})[0];
              const projects = await client.projects.list();
              const project = projectId ? projects.find((item) => item.id === projectId) ?? null : null;

              printOutput(
                runtime,
                {
                  ok: true,
                  project,
                  result,
                },
                () =>
                  project
                    ? `Created project ${project.name} (${project.id}).`
                    : `Created project ${name}.`,
              );
            }),
          ),
    )
    .command(
      "rename",
      (command) =>
        command
          .meta({
            description: "Rename a project",
          })
          .args([
            { name: "project", type: "string", required: true },
            { name: "name", type: "string", variadic: true },
          ] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const client = await requireClient(runtime);
              const projects = await client.projects.list();
              const project = resolveProject(projects, args.project);
              const name = ensureValue(joinWords(args.name), "New project name");
              await client.projects.update({
                id: project.id,
                name,
              });
              const updated = (await client.projects.getById(project.id)) ?? { ...project, name };

              printOutput(
                runtime,
                {
                  ok: true,
                  project: updated,
                },
                () => `Renamed project to ${updated.name}.`,
              );
            }),
          ),
    )
    .command(
      "edit",
      (command) =>
        command
          .meta({
            description: "Edit a project field",
          })
          .args([
            { name: "field", type: "string", required: true },
            { name: "project", type: "string", required: true },
            { name: "value", type: "string", variadic: true },
          ] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const client = await requireClient(runtime);
              const projects = await client.projects.list();
              const project = resolveProject(projects, args.project);
              const field = args.field.toLowerCase();
              const value = ensureValue(joinWords(args.value), "Field value");
              const update: Record<string, unknown> = { id: project.id };

              if (field === "name") update.name = value;
              else if (field === "color") update.color = value;
              else if (field === "view" || field === "viewmode") update.viewMode = value;
              else if (field === "closed") update.closed = parseBooleanValue(value);
              else throw new CliError(`Unsupported project field "${args.field}".`);

              await client.projects.update(update as { id: string });
              const updated = (await client.projects.getById(project.id)) ?? { ...project, ...update };

              printOutput(
                runtime,
                {
                  ok: true,
                  project: updated,
                },
                () => `Updated project ${updated.name}.`,
              );
            }),
          ),
    )
    .command(
      "remove",
      (command) =>
        command
          .meta({
            description: "Remove one or more projects",
          })
          .flags({
            ...rootFlags,
            yes: {
              type: "boolean",
              short: "y",
              description: "Skip the confirmation prompt",
            },
          } as const)
          .args([{ name: "projects", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const references = args.projects ?? [];
              if (references.length === 0) {
                throw new CliError("Provide at least one project reference.");
              }

              const client = await requireClient(runtime);
              const projects = resolveProjects(await client.projects.list(), references);
              const approved = await requireConfirmation(
                flags.yes,
                `Remove ${projects.length} project(s): ${projects.map((project) => project.name).join(", ")}?`,
              );
              if (!approved) {
                return;
              }

              await client.projects.delete(projects.map((project) => project.id));

              printOutput(
                runtime,
                {
                  ok: true,
                  removed: projects,
                },
                () => `Removed ${projects.length} project(s).`,
              );
            }),
          ),
    )
    .command(
      "rm",
      (command) =>
        command
          .meta({
            description: "Alias for project remove",
          })
          .flags({
            ...rootFlags,
            yes: {
              type: "boolean",
              short: "y",
              description: "Skip the confirmation prompt",
            },
          } as const)
          .args([{ name: "projects", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const references = args.projects ?? [];
              if (references.length === 0) {
                throw new CliError("Provide at least one project reference.");
              }

              const client = await requireClient(runtime);
              const projects = resolveProjects(await client.projects.list(), references);
              const approved = await requireConfirmation(
                flags.yes,
                `Remove ${projects.length} project(s): ${projects.map((project) => project.name).join(", ")}?`,
              );
              if (!approved) {
                return;
              }

              await client.projects.delete(projects.map((project) => project.id));

              printOutput(
                runtime,
                {
                  ok: true,
                  removed: projects,
                },
                () => `Removed ${projects.length} project(s).`,
              );
            }),
          ),
    );
}

function createTaskCommand() {
  const listCommand = (name: string) =>
    new Crust(name)
      .meta({
        description: "List tasks",
      })
      .flags({
        ...rootFlags,
        all: {
          type: "boolean",
          description: "Include completed tasks",
        },
        completed: {
          type: "boolean",
          description: "Show only completed tasks",
        },
        limit: {
          type: "number",
          default: 50,
          description: "Maximum number of tasks to show",
        },
        order: {
          type: "string",
          default: "desc",
          description: "Sort order: asc or desc",
        },
        project: {
          type: "string",
          description: "Limit tasks to one project",
        },
        search: {
          type: "string",
          description: "Filter tasks by text",
        },
        sort: {
          type: "string",
          default: "updated",
          description: "Sort field: updated, created, due, priority, or title",
        },
        status: {
          type: "string",
          description: `Filter by status: ${TickTickTaskStatusInputHelp}`,
        },
      } as const)
      .run(
        withRuntime(async ({ flags }, runtime) => {
          const requestedStatus = parseTaskStatus(flags.status ?? undefined);
          const sortField = parseTaskSortField(flags.sort);
          const sortOrder = parseSortOrder(flags.order);
          const client = await requireClient(runtime);
          const [projects, openTasks, completedTasks, abandonedTasks] = await Promise.all([
            client.projects.list(),
            client.tasks.list(),
            flags.all || flags.completed || requestedStatus === TickTickTaskStatuses.completed
              ? client.tasks.listCompleted({ status: "Completed" })
              : Promise.resolve([]),
            flags.all || flags.completed || requestedStatus === TickTickTaskStatuses.wontDo
              ? client.tasks.listCompleted({ status: "Abandoned" })
              : Promise.resolve([]),
          ]);

          const projectId = flags.project ? resolveProject(projects, flags.project).id : undefined;
          const closedTasks = [...completedTasks, ...abandonedTasks];
          const source =
            requestedStatus === TickTickTaskStatuses.completed
              ? completedTasks
              : requestedStatus === TickTickTaskStatuses.wontDo
                ? abandonedTasks
                : requestedStatus === TickTickTaskStatuses.open
                  ? openTasks
                  : flags.completed
                    ? closedTasks
                    : flags.all
                      ? [...openTasks, ...closedTasks]
                      : openTasks;
          const collection = pickTaskCollection(source, {
            projectId,
            search: flags.search ?? undefined,
          });
          const sorted = sortTasks(collection, sortField, sortOrder);
          const limited = sorted.slice(0, flags.limit ?? 50);

          printOutput(
            runtime,
            {
              ok: true,
              total: collection.length,
              count: limited.length,
              order: sortOrder,
              sort: sortField,
              tasks: limited,
            },
            () => renderTaskTable(limited, indexProjects(projects)),
          );
        }),
      );

  return new Crust("task")
    .flags(rootFlags)
    .meta({
      description: "Manage tasks",
    })
    .command(listCommand("list"))
    .command(listCommand("ls"))
    .command(
      "show",
      (command) =>
        command
          .meta({
            description: "Show one task",
          })
          .args([{ name: "task", type: "string", required: true }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const client = await requireClient(runtime);
              const projects = await client.projects.list();
              const task = await resolveTaskByReference(client, args.task, { includeCompleted: true });

              printOutput(
                runtime,
                {
                  ok: true,
                  task,
                },
                () => renderTaskDetails(task, indexProjects(projects)),
              );
            }),
          ),
    )
    .command(
      "add",
      (command) =>
        command
          .meta({
            description: "Create a task",
          })
          .flags({
            ...rootFlags,
            content: {
              type: "string",
              description: "Task content body",
            },
            desc: {
              type: "string",
              description: "Task description",
            },
            due: {
              type: "string",
              description: "Due date/time",
            },
            priority: {
              type: "string",
              description: `Priority: ${TickTickTaskPriorityInputHelp}`,
            },
            project: {
              type: "string",
              description: "Target project",
            },
            start: {
              type: "string",
              description: "Start date/time",
            },
            status: {
              type: "string",
              description: `Status: ${TickTickTaskStatusInputHelp}`,
            },
            tag: {
              type: "string",
              multiple: true,
              description: "Repeatable task tags",
            },
          } as const)
          .args([{ name: "title", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const client = await requireClient(runtime);
              const title = ensureValue(joinWords(args.title), "Task title");
              const projects = await client.projects.list();
              const projectId = flags.project ? resolveProject(projects, flags.project).id : undefined;
              const result = await client.tasks.create({
                title,
                content: flags.content ?? "",
                desc: flags.desc ?? undefined,
                dueDate: parseDateInput(flags.due ?? undefined)?.toISOString(),
                priority: parsePriority(flags.priority ?? undefined),
                projectId,
                startDate: parseDateInput(flags.start ?? undefined)?.toISOString(),
                status: parseTaskStatus(flags.status ?? undefined),
                tags: flags.tag ?? [],
              });
              const taskId = Object.keys(result.id2etag ?? {})[0];
              const task = taskId ? await client.tasks.getById(taskId) : null;

              printOutput(
                runtime,
                {
                  ok: true,
                  result,
                  task,
                },
                () => (task ? `Created task ${task.title} (${task.id}).` : `Created task ${title}.`),
              );
            }),
          ),
    )
    .command(
      "edit",
      (command) =>
        command
          .meta({
            description: "Edit a task field by id",
          })
          .args([
            { name: "field", type: "string", required: true },
            { name: "task", type: "string", required: true },
            { name: "value", type: "string", variadic: true },
          ] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const client = await requireClient(runtime);
              const field = args.field.toLowerCase();
              const task = await resolveTaskByReference(client, args.task, { includeCompleted: true });

              const value = joinWords(args.value);
              const nextTask: TickTickTask = { ...task };

              if (field === "title") nextTask.title = ensureValue(value, "Task title");
              else if (field === "content") nextTask.content = value;
              else if (field === "desc" || field === "description") nextTask.desc = value || null;
              else if (field === "due") nextTask.dueDate = parseDateInput(value)?.toISOString() ?? null;
              else if (field === "start") nextTask.startDate = parseDateInput(value)?.toISOString() ?? null;
              else if (field === "priority") nextTask.priority = parsePriority(value) ?? 0;
              else if (field === "status") {
                nextTask.status = parseTaskStatus(value) ?? TickTickTaskStatuses.open;
                nextTask.completedTime =
                  nextTask.status === TickTickTaskStatuses.open ? null : new Date().toISOString();
              }
              else if (field === "project") {
                const projects = await client.projects.list();
                nextTask.projectId = resolveProject(projects, value).id;
              }
              else if (field === "tag" || field === "tags") nextTask.tags = parseCommaSeparatedStrings(value) ?? [];
              else throw new CliError(`Unsupported task field "${args.field}".`);

              const updated =
                field === "project"
                  ? await client.tasks.move(task.id, nextTask.projectId)
                  : field === "status"
                    ? await client.tasks.setStatus({
                        id: task.id,
                        status: nextTask.status,
                        completedTime: nextTask.completedTime ?? undefined,
                      })
                  : await client.tasks.update(nextTask);

              printOutput(
                runtime,
                {
                  ok: true,
                  task: updated,
                },
                () => `Updated task ${updated.title}.`,
              );
            }),
          ),
    )
    .command(
      "move",
      (command) =>
        command
          .meta({
            description: "Move a task to another project",
          })
          .flags({
            ...rootFlags,
            project: {
              type: "string",
              required: true,
              description: "Destination project",
            },
          } as const)
          .args([{ name: "task", type: "string", required: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const client = await requireClient(runtime);
              const projects = await client.projects.list();
              const task = await resolveTaskByReference(client, args.task);
              const project = resolveProject(projects, flags.project);
              const updated = await client.tasks.move(task.id, project.id);

              printOutput(
                runtime,
                {
                  ok: true,
                  project,
                  task: updated,
                },
                () => `Moved task ${updated.title} to ${project.name}.`,
              );
            }),
          ),
    )
    .command(
      "complete",
      (command) =>
        command
          .meta({
            description: "Complete one or more tasks",
          })
          .args([{ name: "tasks", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const references = args.tasks ?? [];
              if (references.length === 0) {
                throw new CliError("Provide at least one task reference.");
              }

              const client = await requireClient(runtime);
              const tasks = await resolveTasksByReferences(client, references);
              const updated = await Promise.all(
                tasks.map((task) =>
                  client.tasks.setStatus({
                    id: task.id,
                    status: TickTickTaskStatuses.completed,
                  }),
                ),
              );

              printOutput(
                runtime,
                {
                  ok: true,
                  tasks: updated,
                },
                () => `Completed ${updated.length} task(s).`,
              );
            }),
          ),
    )
    .command(
      "abandon",
      (command) =>
        command
          .meta({
            description: "Mark one or more tasks as won't-do / abandoned",
          })
          .args([{ name: "tasks", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const references = args.tasks ?? [];
              if (references.length === 0) {
                throw new CliError("Provide at least one task reference.");
              }

              const client = await requireClient(runtime);
              const tasks = await resolveTasksByReferences(client, references);
              const updated = await Promise.all(
                tasks.map((task) =>
                  client.tasks.setStatus({
                    id: task.id,
                    status: TickTickTaskStatuses.wontDo,
                  }),
                ),
              );

              printOutput(
                runtime,
                {
                  ok: true,
                  tasks: updated,
                },
                () => `Abandoned ${updated.length} task(s).`,
              );
            }),
          ),
    )
    .command(
      "wont-do",
      (command) =>
        command
          .meta({
            description: "Alias for task abandon",
          })
          .args([{ name: "tasks", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const references = args.tasks ?? [];
              if (references.length === 0) {
                throw new CliError("Provide at least one task reference.");
              }

              const client = await requireClient(runtime);
              const tasks = await resolveTasksByReferences(client, references);
              const updated = await Promise.all(
                tasks.map((task) =>
                  client.tasks.setStatus({
                    id: task.id,
                    status: TickTickTaskStatuses.wontDo,
                  }),
                ),
              );

              printOutput(
                runtime,
                {
                  ok: true,
                  tasks: updated,
                },
                () => `Abandoned ${updated.length} task(s).`,
              );
            }),
          ),
    )
    .command(
      "reopen",
      (command) =>
        command
          .meta({
            description: "Reopen one or more completed or abandoned tasks",
          })
          .args([{ name: "tasks", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const references = args.tasks ?? [];
              if (references.length === 0) {
                throw new CliError("Provide at least one task reference.");
              }

              const client = await requireClient(runtime);
              const tasks = await resolveTasksByReferences(client, references, { includeCompleted: true });
              const updated: TickTickTask[] = [];

              for (const task of tasks) {
                let result: TickTickTask | undefined;

                for (let attempt = 0; attempt < 3; attempt += 1) {
                  try {
                    result = await client.tasks.setStatus({
                      id: task.id,
                      status: TickTickTaskStatuses.open,
                    });
                    break;
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    if (attempt === 2 || !message.includes("was not found")) {
                      throw error;
                    }

                    await Bun.sleep(500 * (attempt + 1));
                  }
                }

                updated.push(result!);
              }

              printOutput(
                runtime,
                {
                  ok: true,
                  tasks: updated,
                },
                () => `Reopened ${updated.length} task(s).`,
              );
            }),
          ),
    )
    .command(
      "pin",
      (command) =>
        command
          .meta({
            description: "Pin one or more tasks",
          })
          .args([{ name: "tasks", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const references = args.tasks ?? [];
              if (references.length === 0) {
                throw new CliError("Provide at least one task reference.");
              }

              const client = await requireClient(runtime);
              const tasks = await resolveTasksByReferences(client, references);
              const updated = await Promise.all(
                tasks.map((task) => client.tasks.setPinned(task.id, true)),
              );

              printOutput(
                runtime,
                {
                  ok: true,
                  tasks: updated,
                },
                () => `Pinned ${updated.length} task(s).`,
              );
            }),
          ),
    )
    .command(
      "unpin",
      (command) =>
        command
          .meta({
            description: "Unpin one or more tasks",
          })
          .args([{ name: "tasks", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const references = args.tasks ?? [];
              if (references.length === 0) {
                throw new CliError("Provide at least one task reference.");
              }

              const client = await requireClient(runtime);
              const tasks = await resolveTasksByReferences(client, references);
              const updated = await Promise.all(
                tasks.map((task) => client.tasks.setPinned(task.id, false)),
              );

              printOutput(
                runtime,
                {
                  ok: true,
                  tasks: updated,
                },
                () => `Unpinned ${updated.length} task(s).`,
              );
            }),
          ),
    )
    .command(
      "remove",
      (command) =>
        command
          .meta({
            description: "Move one or more tasks to trash",
          })
          .flags({
            ...rootFlags,
            yes: {
              type: "boolean",
              short: "y",
              description: "Skip the confirmation prompt",
            },
          } as const)
          .args([{ name: "tasks", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const references = args.tasks ?? [];
              if (references.length === 0) {
                throw new CliError("Provide at least one task reference.");
              }

              const client = await requireClient(runtime);
              const tasks = await resolveTasksByReferences(client, references);
              const approved = await requireConfirmation(
                flags.yes,
                `Move ${tasks.length} task(s) to trash: ${tasks.map((t) => t.title).join(", ")}?`,
              );
              if (!approved) {
                return;
              }

              const removed = await client.tasks.delete(tasks.map((t) => t.id));

              printOutput(
                runtime,
                {
                  ok: true,
                  tasks: removed,
                },
                () => `Moved ${removed.length} task(s) to trash.`,
              );
            }),
          ),
    )
    .command(
      "rm",
      (command) =>
        command
          .meta({
            description: "Alias for task remove",
          })
          .flags({
            ...rootFlags,
            yes: {
              type: "boolean",
              short: "y",
              description: "Skip the confirmation prompt",
            },
          } as const)
          .args([{ name: "tasks", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const references = args.tasks ?? [];
              if (references.length === 0) {
                throw new CliError("Provide at least one task reference.");
              }

              const client = await requireClient(runtime);
              const tasks = await resolveTasksByReferences(client, references);
              const approved = await requireConfirmation(
                flags.yes,
                `Move ${tasks.length} task(s) to trash: ${tasks.map((t) => t.title).join(", ")}?`,
              );
              if (!approved) {
                return;
              }

              const removed = await client.tasks.delete(tasks.map((t) => t.id));

              printOutput(
                runtime,
                {
                  ok: true,
                  tasks: removed,
                },
                () => `Moved ${removed.length} task(s) to trash.`,
              );
            }),
          ),
    );
}

function createFocusCommand() {
  return new Crust("focus")
    .flags(rootFlags)
    .meta({
      description: "Manage focus sessions",
    })
    .command(
      "status",
      (command) =>
        command
          .meta({
            description: "Show the current focus session",
          })
          .run(
            withRuntime(async (_, runtime) => {
              const client = await requireClient(runtime);
              const snapshot = await client.focus.syncCurrentState();
              const current = snapshot.current as Record<string, unknown> | undefined;
              const status = formatFocusStatus(
                typeof current?.status === "number" ? current.status : undefined,
                typeof current?.exited === "boolean" ? current.exited : undefined,
              );

              printOutput(
                runtime,
                {
                  current,
                  ok: true,
                  point: snapshot.point,
                  status,
                },
                () => {
                  if (!current) {
                    return "No active focus session.";
                  }

                  return [
                    `Status: ${status}`,
                    `Focus ID: ${String(current.id ?? "-")}`,
                    `Duration: ${String(current.duration ?? "-")} min`,
                    `Start: ${formatDate(current.startTime)}`,
                    `End: ${formatDate(current.endTime)}`,
                  ].join("\n");
                },
              );
            }),
          ),
    )
    .command(
      "timeline",
      (command) =>
        command
          .meta({
            description: "Show recent focus sessions",
          })
          .flags({
            ...rootFlags,
            limit: {
              type: "number",
              default: 20,
              description: "Maximum number of focus sessions to show",
            },
          } as const)
          .run(
            withRuntime(async ({ flags }, runtime) => {
              const client = await requireClient(runtime);
              const timeline = await client.focus.getTimeline();
              const entries = timeline.slice(0, flags.limit ?? 20);

              printOutput(
                runtime,
                {
                  entries,
                  ok: true,
                },
                () =>
                  entries
                    .map(
                      (entry) =>
                        `${entry.id}  ${formatFocusStatus(entry.status, false)}  ${formatDate(entry.startTime)} -> ${formatDate(entry.endTime)}`,
                    )
                    .join("\n"),
              );
            }),
          ),
    )
    .command(
      "start",
      (command) =>
        command
          .meta({
            description: "Start a focus session",
          })
          .flags({
            ...rootFlags,
            detach: {
              type: "boolean",
              description: "Start the session without entering the live terminal view",
            },
            duration: {
              type: "number",
              default: 25,
              description: "Focus duration in minutes",
            },
            note: {
              type: "string",
              description: "Session note",
            },
            task: {
              type: "string",
              description: "Bind the focus session to a task",
            },
          } as const)
          .run(
            withRuntime(async ({ flags }, runtime) => {
              const client = await requireClient(runtime);
              await client.focus.syncCurrentState();
              const task = flags.task ? await resolveOpenTaskByReference(client, flags.task) : null;
              const result = await client.focus.start({
                duration: flags.duration ?? 25,
                note: flags.note ?? "",
                focusOnId: task?.id ?? "",
                focusOnTitle: task?.title ?? null,
                focusOnType: task ? 0 : null,
              });

              if (!runtime.json && !flags.detach && process.stdin.isTTY && process.stderr.isTTY) {
                await runFocusMode({
                  client,
                  current: result.current as Record<string, unknown> | undefined,
                  style: runtime.style,
                });
              }

              printOutput(
                runtime,
                {
                  ok: true,
                  result,
                },
                () => {
                  const current = result.current as Record<string, unknown> | undefined;
                  return [
                    "Started focus session.",
                    `Focus ID: ${String(current?.id ?? "-")}`,
                    `Duration: ${String(current?.duration ?? flags.duration ?? 25)} min`,
                    `Task: ${task?.title ?? "-"}`,
                  ].join("\n");
                },
              );
            }),
          ),
    )
    .command(
      "pause",
      (command) =>
        command
          .meta({
            description: "Pause the active focus session",
          })
          .run(
            withRuntime(async (_, runtime) => {
              const client = await requireClient(runtime);
              await client.focus.syncCurrentState();
              const result = await client.focus.pause();

              printOutput(
                runtime,
                {
                  ok: true,
                  result,
                },
                () => "Paused the focus session.",
              );
            }),
          ),
    )
    .command(
      "resume",
      (command) =>
        command
          .meta({
            description: "Resume the active focus session",
          })
          .run(
            withRuntime(async (_, runtime) => {
              const client = await requireClient(runtime);
              await client.focus.syncCurrentState();
              const result = await client.focus.resume();

              printOutput(
                runtime,
                {
                  ok: true,
                  result,
                },
                () => "Resumed the focus session.",
              );
            }),
          ),
    )
    .command(
      "finish",
      (command) =>
        command
          .meta({
            description: "Finish the active focus session",
          })
          .run(
            withRuntime(async (_, runtime) => {
              const client = await requireClient(runtime);
              await client.focus.syncCurrentState();
              const result = await client.focus.finish();

              printOutput(
                runtime,
                {
                  ok: true,
                  result,
                },
                () => "Finished the focus session.",
              );
            }),
          ),
    )
    .command(
      "stop",
      (command) =>
        command
          .meta({
            description: "Stop the active focus session",
          })
          .run(
            withRuntime(async (_, runtime) => {
              const client = await requireClient(runtime);
              await client.focus.syncCurrentState();
              const result = await client.focus.stop();

              printOutput(
                runtime,
                {
                  ok: true,
                  result,
                },
                () => "Stopped the focus session.",
              );
            }),
          ),
    );
}

function createStatisticsCommand() {
  return new Crust("statistics")
    .meta({
      description: "Show ranking, focus, and task statistics",
    })
    .flags({
      ...rootFlags,
      from: {
        type: "string",
        description: "Range start day",
      },
      to: {
        type: "string",
        description: "Range end day",
      },
    } as const)
    .run(
      withRuntime(async ({ flags }, runtime) => {
        const client = await requireClient(runtime);
        const range = resolveDateRange(flags.from ?? undefined, flags.to ?? undefined);
        const [general, ranking, daily] = await Promise.all([
          client.statistics.getGeneral(),
          client.statistics.getRanking(),
          client.statistics.getTaskStatistics(range.from, range.to),
        ]);

        printOutput(
          runtime,
          {
            daily,
            general,
            ok: true,
            range,
            ranking,
          },
          () => renderStatistics(general, ranking, daily),
        );
      }),
    );
}

function createHabitCommand() {
  return new Crust("habit")
    .flags(rootFlags)
    .meta({
      description: "Manage habits",
    })
    .command(
      "add",
      (command) =>
        command
          .meta({
            description: "Create a habit",
          })
          .flags({
            ...rootFlags,
            goal: {
              type: "number",
              default: 1,
              description: "Target goal",
            },
            step: {
              type: "number",
              default: 1,
              description: "Progress step size",
            },
            type: {
              type: "string",
              default: "number",
              description: "Habit type",
            },
            unit: {
              type: "string",
              default: "times",
              description: "Habit unit label",
            },
            repeat: {
              type: "string",
              default: "RRULE:FREQ=DAILY;INTERVAL=1",
              description: "Repeat rule",
            },
            "record-enable": {
              type: "boolean",
              default: true,
              description: "Enable record notes and emoji",
            },
          } as const)
          .args([{ name: "name", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const client = await requireClient(runtime);
              const name = ensureValue(joinWords(args.name), "Habit name");
              const result = await client.habits.create({
                goal: flags.goal ?? 1,
                name,
                recordEnable: flags["record-enable"] ?? true,
                repeatRule: flags.repeat ?? "RRULE:FREQ=DAILY;INTERVAL=1",
                step: flags.step ?? 1,
                type: flags.type ?? "number",
                unit: flags.unit ?? "times",
              });
              const habitId = Object.keys(result.id2etag ?? {})[0];
              const habits = await client.habits.list();
              const habit = habitId ? habits.find((entry) => entry.id === habitId) ?? null : null;

              printOutput(
                runtime,
                {
                  habit,
                  ok: true,
                  result,
                },
                () => (habit ? `Created habit ${habit.name} (${habit.id}).` : `Created habit ${name}.`),
              );
            }),
          ),
    )
    .command(
      "list",
      (command) =>
        command
          .meta({
            description: "List habits",
          })
          .flags({
            ...rootFlags,
            search: {
              type: "string",
              description: "Filter habits by name",
            },
          } as const)
          .run(
            withRuntime(async ({ flags }, runtime) => {
              const client = await requireClient(runtime);
              const [habits, weekStats] = await Promise.all([
                client.habits.list(),
                client.habits.getWeekCurrentStatistics(),
              ]);
              const filtered = pickHabits(habits, flags.search ?? undefined);

              printOutput(
                runtime,
                {
                  habits: filtered,
                  ok: true,
                  weekStats,
                },
                () => {
                  const dayKeys = Object.keys(weekStats).sort();
                  const summary = dayKeys
                    .map((day) => `${day}: ${weekStats[day]?.completedHabitCount ?? 0}/${weekStats[day]?.totalHabitCount ?? 0}`)
                    .join("\n");
                  return `${renderHabitTable(filtered)}\n\nThis week:\n${summary}`;
                },
              );
            }),
          ),
    )
    .command(
      "checkin",
      (command) =>
        command
          .meta({
            description: "Create or update one habit checkin",
          })
          .flags({
            ...rootFlags,
            date: {
              type: "string",
              description: "Checkin day",
            },
            goal: {
              type: "number",
              description: "Override the habit goal for this checkin",
            },
            status: {
              type: "string",
              description: `Checkin status: ${TickTickHabitCheckinStatusInputHelp}`,
            },
            value: {
              type: "number",
              description: "Numeric progress value",
            },
          } as const)
          .args([{ name: "habit", type: "string", required: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const client = await requireClient(runtime);
              const habits = await client.habits.list();
              const habit = resolveHabit(habits, args.habit);
              const goal = flags.goal ?? habit.goal;
              if (goal == null) {
                throw new CliError(`Habit ${habit.name} does not expose a goal. Pass --goal explicitly.`);
              }

              const date = parseDateInput(flags.date ?? undefined) ?? new Date();
              const status = parseHabitCheckinStatus(flags.status ?? undefined);
              await client.habits.upsertCheckin({
                date,
                goal,
                habitId: habit.id,
                status,
                value: flags.value ?? undefined,
              });

              const stamp = Number(toDayKey(date));
              const query = await client.habits.queryCheckins({
                afterStamp: stamp - 1,
                habitIds: [habit.id],
              });
              const checkin = query.checkins[habit.id]?.find((entry) => entry.checkinStamp === stamp) ?? null;
              const label = checkin ? formatHabitCheckinStatusLabel(checkin.status) : "unknown";

              printOutput(
                runtime,
                {
                  checkin,
                  habit,
                  ok: true,
                  stamp,
                },
                () =>
                  checkin
                    ? `Recorded ${habit.name} on ${stamp}: ${label} (${checkin.value}/${checkin.goal}).`
                    : `Recorded ${habit.name} on ${stamp}.`,
              );
            }),
          ),
    )
    .command(
      "export",
      (command) =>
        command
          .meta({
            description: "Export habits as the TickTick XLSX payload",
          })
          .args([{ name: "path", type: "string" }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const client = await requireClient(runtime);
              let bytes: Uint8Array;

              try {
                bytes = await client.habits.export();
              } catch (error) {
                if (readApiErrorCode(error) === "export_too_many_times") {
                  throw new CliError(
                    "TickTick habit export is temporarily rate-limited by the service (export_too_many_times). Try again later.",
                  );
                }

                throw error;
              }

              const filePath = args.path ?? "ticktick-habits.xlsx";
              await writeFile(filePath, bytes);

              printOutput(
                runtime,
                {
                  bytes: bytes.byteLength,
                  ok: true,
                  path: filePath,
                },
                () => `Exported habits to ${filePath}.`,
              );
            }),
          ),
    )
    .command(
      "remove",
      (command) =>
        command
          .meta({
            description: "Remove one or more habits",
          })
          .flags({
            ...rootFlags,
            y: {
              type: "boolean",
              description: "Skip confirmation",
            },
          } as const)
          .args([{ name: "habits", type: "string", required: true, variadic: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const client = await requireClient(runtime);
              await requireConfirmation(
                flags.y ?? false,
                "Use -y to remove habits without a prompt.",
              );

              const habits = await client.habits.list();
              const selected = args.habits.map((reference) => resolveHabit(habits, reference));
              const result = await client.habits.delete(selected.map((habit) => habit.id));

              printOutput(
                runtime,
                {
                  habits: selected,
                  ok: true,
                  result,
                },
                () => `Removed ${selected.length} habit${selected.length === 1 ? "" : "s"}.`,
              );
            }),
          ),
    )
    .command(
      "rm",
      (command) =>
        command
          .meta({
            description: "Alias for habit remove",
          })
          .flags({
            ...rootFlags,
            y: {
              type: "boolean",
              description: "Skip confirmation",
            },
          } as const)
          .args([{ name: "habits", type: "string", required: true, variadic: true }] as const)
          .run(withRuntime(async ({ args, flags }, runtime) => {
            const client = await requireClient(runtime);
            await requireConfirmation(
              flags.y ?? false,
              "Use -y to remove habits without a prompt.",
            );

            const habits = await client.habits.list();
            const selected = args.habits.map((reference) => resolveHabit(habits, reference));
            const result = await client.habits.delete(selected.map((habit) => habit.id));

            printOutput(
              runtime,
              {
                habits: selected,
                ok: true,
                result,
              },
              () => `Removed ${selected.length} habit${selected.length === 1 ? "" : "s"}.`,
            );
          })),
    );
}

function createCountdownCommand() {
  return new Crust("countdown")
    .flags(rootFlags)
    .meta({
      description: "Manage countdowns, anniversaries, birthdays, and holidays",
    })
    .command(
      "list",
      (command) =>
        command
          .meta({
            description: "List countdowns",
          })
          .flags({
            ...rootFlags,
            search: {
              type: "string",
              description: "Filter countdowns by name",
            },
          } as const)
          .run(
            withRuntime(async ({ flags }, runtime) => {
              const client = await requireClient(runtime);
              const countdowns = await client.countdowns.list();
              const search = flags.search?.trim().toLowerCase();
              const filtered = search
                ? countdowns.filter((countdown) => countdown.name.toLowerCase().includes(search))
                : countdowns;

              printOutput(
                runtime,
                {
                  countdowns: filtered,
                  ok: true,
                },
                () => renderCountdownTable(filtered),
              );
            }),
          ),
    )
    .command(
      "show",
      (command) =>
        command
          .meta({
            description: "Show one countdown by id or name",
          })
          .args([{ name: "countdown", type: "string", required: true }] as const)
          .run(
            withRuntime(async ({ args }, runtime) => {
              const client = await requireClient(runtime);
              const countdown = resolveCountdown(await client.countdowns.list(), args.countdown);

              printOutput(
                runtime,
                {
                  countdown,
                  ok: true,
                },
                () => renderCountdownDetails(countdown),
              );
            }),
          ),
    )
    .command(
      "add",
      (command) =>
        command
          .meta({
            description: "Create a countdown",
          })
          .flags({
            ...rootFlags,
            type: {
              type: "string",
              default: "countdown",
              description: `Countdown type: ${TickTickCountdownTypeInputHelp}`,
            },
            date: {
              type: "string",
              description: "Countdown date",
            },
            "ignore-year": {
              type: "boolean",
              default: false,
              description: "Ignore the year part of the date",
            },
            repeat: {
              type: "string",
              description: "Repeat rule",
            },
            reminder: {
              type: "string",
              description: "Comma-separated reminder triggers",
            },
            "timer-mode": {
              type: "string",
              description: `Counting mode: ${TickTickCountdownTimerModeInputHelp}`,
            },
            "day-calculation-mode": {
              type: "string",
              description: `Day calculation mode: ${TickTickCountdownDayCalculationModeInputHelp}`,
            },
            "show-age": {
              type: "boolean",
              default: false,
              description: "Show age on birthdays",
            },
            "days-option": {
              type: "string",
              description: `Smart List visibility: ${TickTickCountdownDaysOptionInputHelp}`,
            },
            style: {
              type: "string",
              description: "Countdown style",
            },
            "style-color": {
              type: "string",
              description: "Comma-separated style colors",
            },
            remark: {
              type: "string",
              description: "Countdown note/remark",
            },
            "icon-res": {
              type: "string",
              description: "Icon resource id",
            },
            color: {
              type: "string",
              description: "Primary color",
            },
          } as const)
          .args([{ name: "name", type: "string", variadic: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const client = await requireClient(runtime);
              const name = ensureValue(joinWords(args.name), "Countdown name");
              const result = await client.countdowns.create({
                name,
                type: flags.type ?? "countdown",
                date: flags.date ?? undefined,
                ignoreYear: flags["ignore-year"] ?? false,
                repeatFlag: flags.repeat ?? null,
                reminders: parseCommaSeparatedStrings(flags.reminder ?? undefined),
                timerMode: flags["timer-mode"] ?? undefined,
                dayCalculationMode: flags["day-calculation-mode"] ?? undefined,
                showAge: flags["show-age"] ?? false,
                daysOption: flags["days-option"] ?? undefined,
                style: flags.style ?? undefined,
                styleColor: parseCommaSeparatedStrings(flags["style-color"] ?? undefined),
                remark: flags.remark ?? undefined,
                iconRes: flags["icon-res"] ?? undefined,
                color: flags.color ?? undefined,
              });

              const countdownId = Object.keys(result.id2etag ?? {})[0];
              const countdowns = await client.countdowns.list();
              const countdown = countdownId ? countdowns.find((entry) => entry.id === countdownId) ?? null : null;

              printOutput(
                runtime,
                {
                  countdown,
                  ok: true,
                  result,
                },
                () => (countdown ? `Created countdown ${countdown.name} (${countdown.id}).` : `Created countdown ${name}.`),
              );
            }),
          ),
    )
    .command(
      "update",
      (command) =>
        command
          .meta({
            description: "Update one countdown",
          })
          .flags({
            ...rootFlags,
            name: {
              type: "string",
              description: "Rename the countdown",
            },
            type: {
              type: "string",
              description: `Countdown type: ${TickTickCountdownTypeInputHelp}`,
            },
            date: {
              type: "string",
              description: "Countdown date",
            },
            "ignore-year": {
              type: "boolean",
              description: "Ignore the year part of the date",
            },
            repeat: {
              type: "string",
              description: "Repeat rule",
            },
            reminder: {
              type: "string",
              description: "Comma-separated reminder triggers",
            },
            "timer-mode": {
              type: "string",
              description: `Counting mode: ${TickTickCountdownTimerModeInputHelp}`,
            },
            "day-calculation-mode": {
              type: "string",
              description: `Day calculation mode: ${TickTickCountdownDayCalculationModeInputHelp}`,
            },
            "show-age": {
              type: "boolean",
              description: "Show age on birthdays",
            },
            "days-option": {
              type: "string",
              description: `Smart List visibility: ${TickTickCountdownDaysOptionInputHelp}`,
            },
            style: {
              type: "string",
              description: "Countdown style",
            },
            "style-color": {
              type: "string",
              description: "Comma-separated style colors",
            },
            remark: {
              type: "string",
              description: "Countdown note/remark",
            },
            "icon-res": {
              type: "string",
              description: "Icon resource id",
            },
            color: {
              type: "string",
              description: "Primary color",
            },
          } as const)
          .args([{ name: "countdown", type: "string", required: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const client = await requireClient(runtime);
              const current = resolveCountdown(await client.countdowns.list(), args.countdown);
              const date = flags.date ? Number(toDayKey(parseDateInput(flags.date)!)) : current.date;

              const updated: TickTickCountdown = {
                ...current,
                ...(flags.name ? { name: flags.name } : null),
                ...(flags.type ? { type: parseCountdownType(flags.type) ?? current.type } : null),
                date,
                ...(flags["ignore-year"] != null ? { ignoreYear: flags["ignore-year"] } : null),
                ...(flags.repeat !== undefined ? { repeatFlag: flags.repeat || null } : null),
                ...(flags.reminder !== undefined ? { reminders: parseCommaSeparatedStrings(flags.reminder) ?? [] } : null),
                ...(flags["timer-mode"] ? { timerMode: parseCountdownTimerMode(flags["timer-mode"]) ?? current.timerMode } : null),
                ...(flags["day-calculation-mode"]
                  ? {
                      dayCalculationMode:
                        parseCountdownDayCalculationMode(flags["day-calculation-mode"]) ??
                        flags["day-calculation-mode"],
                    }
                  : null),
                ...(flags["show-age"] != null ? { showAge: flags["show-age"] } : null),
                ...(flags["days-option"]
                  ? { daysOption: parseCountdownDaysOption(flags["days-option"]) ?? current.daysOption }
                  : null),
                ...(flags.style !== undefined ? { style: flags.style } : null),
                ...(flags["style-color"] !== undefined ? { styleColor: parseCommaSeparatedStrings(flags["style-color"]) ?? [] } : null),
                ...(flags.remark !== undefined ? { remark: flags.remark } : null),
                ...(flags["icon-res"] !== undefined ? { iconRes: flags["icon-res"] } : null),
                ...(flags.color !== undefined ? { color: flags.color } : null),
              };

              const result = await client.countdowns.update(updated);
              const countdown = (await client.countdowns.getById(current.id)) ?? updated;

              printOutput(
                runtime,
                {
                  countdown,
                  ok: true,
                  result,
                },
                () => `Updated countdown ${countdown.name} (${countdown.id}).`,
              );
            }),
          ),
    )
    .command(
      "delete",
      (command) =>
        command
          .meta({
            description: "Delete one or more countdowns",
          })
          .flags({
            ...rootFlags,
            y: {
              type: "boolean",
              description: "Skip confirmation",
            },
          } as const)
          .args([{ name: "countdowns", type: "string", required: true, variadic: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const client = await requireClient(runtime);
              await requireConfirmation(flags.y ?? false, "Use -y to delete countdowns without a prompt.");

              const countdowns = await client.countdowns.list();
              const selected = args.countdowns.map((reference) => resolveCountdown(countdowns, reference));
              const result = await client.countdowns.delete(selected.map((countdown) => countdown.id));

              printOutput(
                runtime,
                {
                  countdowns: selected,
                  ok: true,
                  result,
                },
                () => `Deleted ${selected.length} countdown${selected.length === 1 ? "" : "s"}.`,
              );
            }),
          ),
    )
    .command(
      "rm",
      (command) =>
        command
          .meta({
            description: "Alias for countdown delete",
          })
          .flags({
            ...rootFlags,
            y: {
              type: "boolean",
              description: "Skip confirmation",
            },
          } as const)
          .args([{ name: "countdowns", type: "string", required: true, variadic: true }] as const)
          .run(
            withRuntime(async ({ args, flags }, runtime) => {
              const client = await requireClient(runtime);
              await requireConfirmation(flags.y ?? false, "Use -y to delete countdowns without a prompt.");

              const countdowns = await client.countdowns.list();
              const selected = args.countdowns.map((reference) => resolveCountdown(countdowns, reference));
              const result = await client.countdowns.delete(selected.map((countdown) => countdown.id));

              printOutput(
                runtime,
                {
                  countdowns: selected,
                  ok: true,
                  result,
                },
                () => `Deleted ${selected.length} countdown${selected.length === 1 ? "" : "s"}.`,
              );
            }),
          ),
    );
}

cli = new Crust(APP_NAME)
  .meta({
description: "Human-friendly and automation-friendly CLI for TickTick using node-ticktick-unofficial.",
  })
  .flags(rootFlags)
  .use(helpPlugin())
  .command(createHelpCommand())
  .command(createLoginCommand())
  .command(createLogoutCommand())
  .command(createWhoamiCommand())
  .command(createTagCommand())
  .command(createProjectCommand())
  .command(createTaskCommand())
  .command(createFocusCommand())
  .command(createStatisticsCommand())
  .command(createCountdownCommand())
  .command(createHabitCommand());

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(`${packageJson.name} v${packageJson.version}`);
  process.exit(0);
}

try {
  await cli.execute();
} catch (error) {
  const wantsJson = process.argv.includes("--json") || process.argv.includes("-j");
  if (wantsJson) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: serializeError(error),
        },
        null,
        2,
      ),
    );
  } else if (error instanceof Error) {
    console.error(error.message);
    if (process.argv.includes("--verbose") || process.argv.includes("-V")) {
      console.error(error.stack ?? "");
    }
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
}
