import { z } from "zod";

// Client-safe schemas + JSON-Schema tool declarations sent to the model.
// Add new modules (notes, calendar, drive…) by appending a registry entry here
// and an executor in the matching *.tools.server.ts file.

export const PriorityEnum = z.enum(["High", "Medium", "Low"]);

export const CreateTaskArgs = z.object({
  title: z.string().trim().min(1).max(200),
  due_at: z.string().trim().min(1).max(60).optional(),
  priority: PriorityEnum.optional(),
  workspace: z.string().trim().min(1).max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const ListTasksArgs = z.object({
  status: z.enum(["open", "done", "all"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const UpdateTaskArgs = z.object({
  id: z.string().uuid().optional(),
  match_title: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  due_at: z.string().trim().min(1).max(60).nullable().optional(),
  priority: PriorityEnum.optional(),
  workspace: z.string().trim().min(1).max(80).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  done: z.boolean().optional(),
});

export const DeleteTaskArgs = z.object({
  id: z.string().uuid().optional(),
  match_title: z.string().trim().min(1).max(200).optional(),
});

export const WorkspaceSummaryArgs = z.object({});

const dueDescription =
  "Natural language or ISO date/time for when it is due, e.g. '2026-08-18T18:00:00' or 'tomorrow 6 PM'. Omit if the user did not say.";

export const toolDeclarations = [
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description:
        "Create a task for the signed-in user. Only call when you know what the task is; if the description is missing, ask the user instead.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short description of the task." },
          due_at: { type: "string", description: dueDescription },
          priority: { type: "string", enum: ["High", "Medium", "Low"] },
          workspace: { type: "string", description: "Workspace name, defaults to 'Nexus HQ'." },
          notes: { type: "string" },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_tasks",
      description:
        "List the signed-in user's tasks. Use this before answering any question about their tasks, progress or priorities.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["open", "done", "all"] },
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_task",
      description:
        "Update one of the user's tasks. Identify it by id (preferred, from list_tasks) or match_title.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          match_title: { type: "string", description: "Part of the existing task title." },
          title: { type: "string" },
          due_at: { type: "string", description: dueDescription },
          priority: { type: "string", enum: ["High", "Medium", "Low"] },
          workspace: { type: "string" },
          notes: { type: "string" },
          done: { type: "boolean", description: "Mark complete or incomplete." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_task",
      description: "Delete one of the user's tasks, by id or match_title.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          match_title: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_workspace_summary",
      description:
        "Retrieve aggregated stats about the user's workspace (task counts, completed this week, upcoming deadlines, top priorities). Use for 'catch me up' / 'what's my progress' style requests.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_email_status",
      description:
        "Check how the signed-in user can send email: their default sender, whether Nexus Default Mail is ready, and whether their own Gmail is connected. Call before send_email when the user asks which account will be used.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_email",
      description:
        "Send an email on behalf of the signed-in user. Uses their own connected Gmail when that is their default (or when sender is 'gmail'), otherwise Nexus Default Mail, and automatically falls back to Nexus Default Mail if Gmail fails. Only call after the user has confirmed the recipient, subject and message.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address." },
          subject: { type: "string" },
          body: { type: "string", description: "Plain-text message body." },
          sender: {
            type: "string",
            enum: ["auto", "nexus", "gmail"],
            description: "Which sender to use. Defaults to 'auto' (the user's chosen default).",
          },
        },
        required: ["to", "subject", "body"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description:
        "Search the live web and return real sources with their content. Use whenever the user asks to research a topic, wants current/recent information, news, prices, product comparisons, documentation, or anything you are not certain about. Only cite URLs this tool returns.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Focused search query." },
          limit: { type: "number", description: "How many results to read (1-8, default 5)." },
          scrape_content: {
            type: "boolean",
            description: "Read the full page content of each result. Defaults to true.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "scrape_url",
      description:
        "Read one public web page and return its title, description, main content as Markdown and its links. Use when the user pastes or names a specific URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full http(s) URL of a public page." },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
];

export const MUTATING_TOOLS = ["create_task", "update_task", "delete_task", "send_email"];
