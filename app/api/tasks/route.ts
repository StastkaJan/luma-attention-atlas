// The Cloudflare Vite plugin provides this virtual module at build/runtime.
// @ts-expect-error Worker types are generated when the D1 binding is configured.
import { env } from "cloudflare:workers";

const TONES = ["coral", "blue", "moss"] as const;
const JSON_LIMIT = 16_384;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

type Tone = (typeof TONES)[number];
type TaskRow = {
  id: string;
  date: string;
  time: string;
  label: string;
  note: string;
  duration: number;
  tone: Tone;
  done: number;
  position: number;
  created_at: string;
  updated_at: string;
};

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes?: number } }>;
};

type Database = { prepare(sql: string): Statement };

const CREATE_TASKS_SQL = `
  CREATE TABLE IF NOT EXISTS luma_tasks_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    owner TEXT NOT NULL CHECK (length(owner) BETWEEN 3 AND 254),
    date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    time TEXT NOT NULL CHECK (time GLOB '[0-2][0-9]:[0-5][0-9]'),
    label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
    note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
    duration INTEGER NOT NULL CHECK (duration BETWEEN 1 AND 1440),
    tone TEXT NOT NULL CHECK (tone IN ('coral', 'blue', 'moss')),
    done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
    position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 10000),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

let schemaReady: Promise<void> | undefined;

function database(): Database {
  const db = (env as unknown as { DB?: Database }).DB;
  if (!db) throw new Error("Database binding unavailable");
  return db;
}

function ensureSchema(db: Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = db.prepare(CREATE_TASKS_SQL).run().then((result) => {
      if (!result.success) throw new Error("Schema initialization failed");
    }).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function invalid(message: string): Response {
  return json({ error: message }, 400);
}

function ownerFor(request: Request): string | Response {
  const rawOwner = request.headers.get("oai-authenticated-user-email");
  if (rawOwner) {
    const owner = rawOwner.normalize("NFKC").trim().toLowerCase();
    if (owner.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)) return owner;
    return json({ error: "Unauthorized" }, 401);
  }

  const hostname = new URL(request.url).hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    return "local@luma.invalid";
  }
  return json({ error: "Unauthorized" }, 401);
}

function serverError(action: string, error: unknown): Response {
  console.error(`Task API ${action} failed`, error);
  return json({ error: `Unable to ${action} tasks` }, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function normalizeTask(row: TaskRow) {
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    label: row.label,
    note: row.note,
    duration: row.duration,
    tone: row.tone,
    done: row.done === 1,
    position: row.position,
  };
}

async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return json({ error: "Content-Type must be application/json" }, 415);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > JSON_LIMIT) {
    return json({ error: "Request body is too large" }, 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > JSON_LIMIT) {
    return json({ error: "Request body is too large" }, 413);
  }

  try {
    const body: unknown = JSON.parse(text);
    return isRecord(body) ? body : invalid("JSON body must be an object");
  } catch {
    return invalid("Invalid JSON body");
  }
}

function validateFields(body: Record<string, unknown>, partial: boolean): string | null {
  const allowed = new Set(["date", "time", "label", "note", "duration", "tone", "done", "position"]);
  if (Object.keys(body).some((key) => !allowed.has(key) && !(partial && key === "id"))) {
    return "Unknown field";
  }

  const required = ["date", "time", "label", "duration", "tone", "position"];
  if (!partial && required.some((key) => !(key in body))) return "Missing required field";
  if ("date" in body && !isDate(body.date)) return "date must be a valid YYYY-MM-DD date";
  if ("time" in body && (typeof body.time !== "string" || !TIME_PATTERN.test(body.time))) return "time must use HH:MM";
  if ("label" in body && (typeof body.label !== "string" || body.label.trim().length < 1 || body.label.trim().length > 120)) return "label must be 1-120 characters";
  if ("note" in body && (typeof body.note !== "string" || body.note.trim().length > 500)) return "note must be at most 500 characters";
  if ("duration" in body && (!Number.isInteger(body.duration) || (body.duration as number) < 1 || (body.duration as number) > 1440)) return "duration must be an integer from 1 to 1440";
  if ("tone" in body && (typeof body.tone !== "string" || !TONES.includes(body.tone as Tone))) return "tone must be coral, blue, or moss";
  if ("done" in body && typeof body.done !== "boolean") return "done must be boolean";
  if ("position" in body && (!Number.isInteger(body.position) || (body.position as number) < 0 || (body.position as number) > 10000)) return "position must be an integer from 0 to 10000";
  return null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const owner = ownerFor(request);
    if (owner instanceof Response) return owner;
    const date = new URL(request.url).searchParams.get("date");
    if (!isDate(date)) return invalid("date must be a valid YYYY-MM-DD date");

    const db = database();
    await ensureSchema(db);
    const { results } = await db.prepare(
      "SELECT id, date, time, label, note, duration, tone, done, position, created_at, updated_at FROM luma_tasks_v2 WHERE owner = ? AND date = ? ORDER BY time, created_at",
    ).bind(owner, date).all<TaskRow>();
    return json({ tasks: results.map(normalizeTask) });
  } catch (error) {
    return serverError("load", error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const owner = ownerFor(request);
    if (owner instanceof Response) return owner;
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const issue = validateFields(body, false);
    if (issue) return invalid(issue);

    const db = database();
    await ensureSchema(db);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const values = {
      id,
      owner,
      date: body.date as string,
      time: body.time as string,
      label: (body.label as string).trim(),
      note: typeof body.note === "string" ? body.note.trim() : "",
      duration: body.duration as number,
      tone: body.tone as Tone,
      done: body.done === true ? 1 : 0,
      position: body.position as number,
      created_at: now,
      updated_at: now,
    };

    const result = await db.prepare(
      "INSERT INTO luma_tasks_v2 (id, owner, date, time, label, note, duration, tone, done, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(...Object.values(values)).run();
    if (!result.success) throw new Error("Insert failed");
    return json({ task: normalizeTask(values) }, 201);
  } catch (error) {
    return serverError("create", error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const owner = ownerFor(request);
    if (owner instanceof Response) return owner;
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (!isId(body.id)) return invalid("id must be a valid UUID");
    const issue = validateFields(body, true);
    if (issue) return invalid(issue);

    const fields = Object.keys(body).filter((key) => key !== "id");
    if (fields.length === 0) return invalid("At least one field must be updated");

    const columnValues: Record<string, unknown> = {
      date: body.date,
      time: body.time,
      label: typeof body.label === "string" ? body.label.trim() : undefined,
      note: typeof body.note === "string" ? body.note.trim() : undefined,
      duration: body.duration,
      tone: body.tone,
      done: typeof body.done === "boolean" ? Number(body.done) : undefined,
      position: body.position,
    };
    const db = database();
    await ensureSchema(db);
    const assignments = fields.map((field) => `${field} = ?`).join(", ");
    const result = await db.prepare(
      `UPDATE luma_tasks_v2 SET ${assignments}, updated_at = ? WHERE id = ? AND owner = ?`,
    ).bind(...fields.map((field) => columnValues[field]), new Date().toISOString(), body.id, owner).run();
    if (!result.meta.changes) return json({ error: "Task not found" }, 404);

    const task = await db.prepare(
      "SELECT id, date, time, label, note, duration, tone, done, position, created_at, updated_at FROM luma_tasks_v2 WHERE id = ? AND owner = ?",
    ).bind(body.id, owner).first<TaskRow>();
    if (!task) return json({ error: "Task not found" }, 404);
    return json({ task: normalizeTask(task) });
  } catch (error) {
    return serverError("update", error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const owner = ownerFor(request);
    if (owner instanceof Response) return owner;
    const id = new URL(request.url).searchParams.get("id");
    if (!isId(id)) return invalid("id must be a valid UUID");

    const db = database();
    await ensureSchema(db);
    const result = await db.prepare("DELETE FROM luma_tasks_v2 WHERE id = ? AND owner = ?").bind(id, owner).run();
    if (!result.meta.changes) return json({ error: "Task not found" }, 404);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("delete", error);
  }
}
