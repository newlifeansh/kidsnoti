import { isSupabaseConfigured, supabase, supabaseProjectUrl } from "./supabaseClient";

export type BugEventSeverity = "info" | "warning" | "error";

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

export interface BugEventInput {
  eventType: string;
  severity?: BugEventSeverity;
  screen?: string;
  step?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  userId?: string | null;
  familyId?: string | null;
}

export interface BugEventLog {
  id: string;
  event_type: string;
  severity: BugEventSeverity;
  screen: string | null;
  step: string | null;
  message: string | null;
  metadata: Record<string, JsonLike>;
  user_id: string | null;
  family_id: string | null;
  exported_at?: string | null;
  last_export_error?: string | null;
  export_attempts?: number;
  created_at: string;
}

interface BugEventQueueRow {
  event_type: string;
  severity: BugEventSeverity;
  screen: string | null;
  step: string | null;
  message: string | null;
  metadata: Record<string, JsonLike>;
  user_id: string | null;
  family_id: string | null;
  created_at: string;
}

const BUG_EVENT_QUEUE_KEY = "alimjangssok.bug-events.queue";
let isBugEventTableUnavailable = false;
const REDACTED_KEYS = new Set([
  "children",
  "detail",
  "displayName",
  "ocrText",
  "parsedResult",
  "sourceText",
  "stack",
  "title",
]);

function sanitizeMetadata(value: unknown, depth = 0): JsonLike {
  if (depth > 3) {
    return "[truncated]";
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeMetadata(item, depth + 1));
  }

  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
    };
  }

  if (typeof value === "object") {
    const sanitizedEntries = Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (REDACTED_KEYS.has(key)) {
        return [key, "[redacted]"] as const;
      }
      return [key, sanitizeMetadata(item, depth + 1)] as const;
    });

    return Object.fromEntries(sanitizedEntries);
  }

  return String(value);
}

function readQueuedRows() {
  try {
    const rawQueue = window.localStorage.getItem(BUG_EVENT_QUEUE_KEY);
    if (!rawQueue) return [];
    const parsed = JSON.parse(rawQueue);
    return Array.isArray(parsed) ? (parsed as BugEventQueueRow[]) : [];
  } catch {
    return [];
  }
}

function writeQueuedRows(rows: BugEventQueueRow[]) {
  try {
    window.localStorage.setItem(BUG_EVENT_QUEUE_KEY, JSON.stringify(rows.slice(-20)));
  } catch {
    // localStorage까지 실패하면 콘솔 로그만 남깁니다.
  }
}

function queueBugEvent(row: BugEventQueueRow) {
  const queuedRows = readQueuedRows();
  queuedRows.push(row);
  writeQueuedRows(queuedRows);
}

async function flushQueuedBugEvents() {
  if (!supabase) return;

  const queuedRows = readQueuedRows();
  if (queuedRows.length === 0) return;

  const { error } = await supabase.from("bug_events").insert(queuedRows);
  if (!error) {
    writeQueuedRows([]);
  }
}

function buildBugEventRow(input: BugEventInput, userId: string | null): BugEventQueueRow {
  return {
    event_type: input.eventType,
    severity: input.severity ?? "error",
    screen: input.screen ?? null,
    step: input.step ?? null,
    message: input.message ?? null,
    metadata: {
      ...((sanitizeMetadata(input.metadata ?? {}) as Record<string, JsonLike>) ?? {}),
      appVersion: import.meta.env.VITE_APP_VERSION ?? "local",
      pathname: window.location.pathname,
      timestamp: new Date().toISOString(),
    },
    user_id: input.userId ?? userId,
    family_id: input.familyId ?? null,
    created_at: new Date().toISOString(),
  };
}

export async function trackBugEvent(input: BugEventInput) {
  const fallbackMessage = input.message ?? input.eventType;

  if (!isSupabaseConfigured || !supabase || isBugEventTableUnavailable) {
    console.error("[bug-event]", fallbackMessage, input.metadata ?? {});
    queueBugEvent(buildBugEventRow(input, null));
    return;
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const row = buildBugEventRow(input, session?.user.id ?? null);
    const { error } = await supabase.from("bug_events").insert(row);

    if (error) {
      if (error.message.includes("Could not find the table 'public.bug_events'")) {
        isBugEventTableUnavailable = true;
      }
      queueBugEvent(row);
      console.error("[bug-event:insert-failed]", error.message, row);
      return;
    }

    await flushQueuedBugEvents();
  } catch (error) {
    queueBugEvent(buildBugEventRow(input, null));
    console.error("[bug-event:unexpected-failed]", fallbackMessage, error);
  }
}

export async function fetchBugEventLogs(limit = 50) {
  if (!isSupabaseConfigured || !supabase) {
    return [] as BugEventLog[];
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Supabase 로그인이 필요해요.");
  }

  const response = await fetch(
    `${supabaseProjectUrl}/functions/v1/admin-bug-events?limit=${Math.max(1, Math.min(limit, 200))}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  );

  const body = await response.json().catch(() => ({})) as { message?: string; logs?: BugEventLog[] };
  if (!response.ok) {
    throw new Error(body.message ?? "버그 로그를 불러오지 못했어요.");
  }

  return Array.isArray(body.logs) ? body.logs : [];
}
