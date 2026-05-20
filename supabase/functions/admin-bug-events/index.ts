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
  export_attempts: number | null;
  exported_at: string | null;
  last_export_error: string | null;
  created_at: string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return jsonResponse({ message: "GET만 지원해요." }, { status: 405 });
  }

  try {
    const userId = await getAuthenticatedUserId(request);
    assertOperatorUser(userId);

    const limit = clampLimit(Number(new URL(request.url).searchParams.get("limit") ?? "80"));
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("bug_events")
      .select(
        "id, event_type, severity, screen, step, message, metadata, user_id, family_id, exported_at, last_export_error, export_attempts, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<BugEventRow[]>();

    if (error) throw error;

    return jsonResponse({
      logs: data ?? [],
      total: data?.length ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "버그 로그를 불러오지 못했어요.";
    const status = message === "권한이 없어요." ? 403 : message === "Supabase 로그인이 필요해요." ? 401 : 500;
    return jsonResponse({ message }, { status });
  }
});

async function getAuthenticatedUserId(request: Request) {
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.replace(/^Bearer\s+/i, "");
  if (!accessToken) {
    throw new Error("Supabase 로그인이 필요해요.");
  }

  const { data, error } = await createServiceClient().auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error("Supabase 로그인이 필요해요.");
  }

  return data.user.id;
}

function assertOperatorUser(userId: string) {
  const allowedUserIds = String(Deno.env.get("OPERATOR_USER_IDS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!allowedUserIds.includes(userId)) {
    throw new Error("권한이 없어요.");
  }
}

function clampLimit(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 80;
  return Math.min(Math.floor(value), 200);
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
