import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface BugEventRow {
  id: string;
  user_id: string | null;
  family_id: string | null;
  event_type: string;
  severity: "info" | "warning" | "error";
  screen: string | null;
  step: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  export_attempts: number;
  exported_at: string | null;
  last_export_error: string | null;
  created_at: string;
}

interface SheetExportRow {
  id: string;
  createdAt: string;
  severity: string;
  screen: string;
  step: string;
  eventType: string;
  message: string;
  userId: string;
  familyId: string;
  errorCode: string;
  childCount: string;
  todoCount: string;
  calendarEventCount: string;
  selectedFileCount: string;
  metadataJson: string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    assertSchedulerSecret(request);
    const supabase = createServiceClient();
    const limit = clampLimit(Number(new URL(request.url).searchParams.get("limit") ?? "100"));
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "true";

    const { data: bugEvents, error } = await supabase
      .from("bug_events")
      .select("*")
      .is("exported_at", null)
      .order("created_at", { ascending: true })
      .limit(limit)
      .returns<BugEventRow[]>();

    if (error) throw error;

    if (bugEvents.length === 0) {
      return jsonResponse({
        exported: 0,
        skipped: 0,
        message: "내보낼 bug_events가 없어요.",
      });
    }

    const rows = bugEvents.map(toSheetExportRow);

    if (dryRun) {
      return jsonResponse({
        exported: 0,
        skipped: bugEvents.length,
        preview: rows.slice(0, 5),
      });
    }

    const webhookUrl = requireEnv("BUG_EVENTS_SHEET_WEBHOOK_URL");
    const payload = {
      rows,
      source: "alimjang-ssok",
      exportedAt: new Date().toISOString(),
    };

    try {
      await appendRowsToWebhook(webhookUrl, payload);
    } catch (error) {
      await markExportFailed(
        supabase,
        bugEvents.map((event) => event.id),
        error instanceof Error ? error.message : "sheet_export_failed",
      );
      throw error;
    }

    await markExportSucceeded(supabase, bugEvents.map((event) => event.id));

    return jsonResponse({
      exported: bugEvents.length,
      skipped: 0,
      message: "bug_events를 스프레드시트로 내보냈어요.",
    });
  } catch (error) {
    console.error("export-bug-events-to-sheet failed", serializeError(error));
    return jsonResponse(
      {
        message: getErrorMessage(error),
        error: serializeError(error),
      },
      { status: 500 },
    );
  }
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return "bug_events 스프레드시트 적재에 실패했어요.";
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (error && typeof error === "object") {
    return error;
  }

  return { message: String(error) };
}

function clampLimit(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 100;
  return Math.min(Math.floor(value), 500);
}

function toSheetExportRow(row: BugEventRow): SheetExportRow {
  const metadata = row.metadata ?? {};
  const metadataRecord = typeof metadata === "object" && metadata !== null
    ? metadata as Record<string, unknown>
    : {};
  const reason = metadataRecord.reason;
  const reasonCode = typeof reason === "object" && reason !== null
    ? (reason as Record<string, unknown>).code
    : undefined;
  const errorCode = typeof metadataRecord.errorCode === "string"
    ? metadataRecord.errorCode
    : typeof reasonCode === "string"
    ? reasonCode
    : "";

  return {
    id: row.id,
    createdAt: row.created_at,
    severity: row.severity,
    screen: row.screen ?? "",
    step: row.step ?? "",
    eventType: row.event_type,
    message: row.message ?? "",
    userId: row.user_id ?? "",
    familyId: row.family_id ?? "",
    errorCode,
    childCount: stringifyCount(metadataRecord.childCount),
    todoCount: stringifyCount(metadataRecord.todoCount),
    calendarEventCount: stringifyCount(metadataRecord.calendarEventCount),
    selectedFileCount: stringifyCount(metadataRecord.selectedFileCount),
    metadataJson: JSON.stringify(metadataRecord),
  };
}

function stringifyCount(value: unknown) {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return "";
}

async function appendRowsToWebhook(
  webhookUrl: string,
  payload: { rows: SheetExportRow[]; source: string; exportedAt: string },
) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || "Google Sheets webhook 호출에 실패했어요.");
  }
}

async function markExportSucceeded(
  supabase: ReturnType<typeof createServiceClient>,
  ids: string[],
) {
  const { error } = await supabase
    .from("bug_events")
    .update({
      exported_at: new Date().toISOString(),
      last_export_error: null,
    })
    .in("id", ids);

  if (error) throw error;
}

async function markExportFailed(
  supabase: ReturnType<typeof createServiceClient>,
  ids: string[],
  errorMessage: string,
) {
  const { data: rows, error: fetchError } = await supabase
    .from("bug_events")
    .select("id, export_attempts")
    .in("id", ids)
    .returns<Array<{ id: string; export_attempts: number }>>();

  if (fetchError) throw fetchError;

  for (const row of rows ?? []) {
    const { error } = await supabase
      .from("bug_events")
      .update({
        export_attempts: row.export_attempts + 1,
        last_export_error: errorMessage.slice(0, 500),
      })
      .eq("id", row.id);

    if (error) throw error;
  }
}

function assertSchedulerSecret(request: Request) {
  const expected = Deno.env.get("SCHEDULER_SECRET");
  if (!expected) return;

  const actual = request.headers.get("x-scheduler-secret");
  if (actual !== expected) {
    throw new Error("스케줄러 인증에 실패했어요.");
  }
}

function createServiceClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} 환경변수가 필요해요.`);
  }
  return value;
}
