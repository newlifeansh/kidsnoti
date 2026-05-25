import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface PushScheduleRow {
  id: string;
  user_id: string;
  family_id: string;
  todo_id: string;
  scheduled_at: string;
  status: "pending" | "sent" | "failed" | "cancelled";
}

interface NotificationPreferenceRow {
  user_id: string;
  family_id: string;
  enabled: boolean;
  preparation_day: "before" | "same-day";
  preparation_time: string;
  morning_time: string;
  template_set_code: string | null;
}

interface ProfileRow {
  id: string;
  toss_user_key: string | null;
}

interface TodoRow {
  id: string;
  child_id: string;
  title: string;
  description: string | null;
  category: "preparation" | "homework" | "submission" | "parent_check" | "payment" | "other";
  due_date: string | null;
  due_label: string | null;
}

interface ChildRow {
  id: string;
  name: string;
}

interface SmartMessagePayload {
  templateSetCode: string;
  context: Record<string, string>;
}

type SmartMessageResponse = {
  resultType?: string;
  success?: {
    msgCount?: number;
    sentPushCount?: number;
    sentInboxCount?: number;
    sentSmsCount?: number;
    sentAlimtalkCount?: number;
    sentFriendtalkCount?: number;
    fail?: Record<string, unknown>;
  };
  error?: { reason?: string };
} & Record<string, unknown>;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    assertSchedulerSecret(request);

    const supabase = createServiceClient();
    const { data: schedules, error } = await supabase
      .from("push_schedules")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .limit(50)
      .returns<PushScheduleRow[]>();

    if (error) throw error;

    const summary = {
      picked: schedules.length,
      sent: 0,
      failed: 0,
      skipped: 0,
    };

    for (const schedule of schedules) {
      const result = await processSchedule(supabase, schedule);
      summary[result] += 1;
    }

    return jsonResponse(summary);
  } catch (error) {
    return jsonResponse(
      { message: error instanceof Error ? error.message : "알림 발송에 실패했어요." },
      { status: 500 },
    );
  }
});

async function processSchedule(
  supabase: ReturnType<typeof createServiceClient>,
  schedule: PushScheduleRow,
): Promise<"sent" | "failed" | "skipped"> {
  let templateSetCode = Deno.env.get("APPS_IN_TOSS_SMART_MESSAGE_TEMPLATE_SET_CODE") ?? "unset";
  let payload: SmartMessagePayload | null = null;

  try {
    const [preference, profile, todo] = await Promise.all([
      getNotificationPreference(supabase, schedule.user_id, schedule.family_id),
      getProfile(supabase, schedule.user_id),
      getTodo(supabase, schedule.todo_id),
    ]);

    if (!preference?.enabled) {
      await markScheduleCancelled(supabase, schedule.id);
      await insertDeliveryLog(supabase, {
        scheduleId: schedule.id,
        userId: schedule.user_id,
        familyId: schedule.family_id,
        todoId: schedule.todo_id,
        templateSetCode,
        status: "skipped",
        requestPayload: {},
        responseBody: { reason: "notifications_disabled" },
      });
      return "skipped";
    }

    templateSetCode = preference.template_set_code
      ?? Deno.env.get("APPS_IN_TOSS_SMART_MESSAGE_TEMPLATE_SET_CODE")
      ?? "";
    if (!templateSetCode) {
      await markScheduleCancelled(supabase, schedule.id);
      await insertDeliveryLog(supabase, {
        scheduleId: schedule.id,
        userId: schedule.user_id,
        familyId: schedule.family_id,
        todoId: schedule.todo_id,
        templateSetCode: "unconfigured",
        status: "skipped",
        requestPayload: {},
        responseBody: { reason: "template_set_code_not_ready" },
      });
      return "skipped";
    }

    if (!profile.toss_user_key) {
      await markScheduleCancelled(supabase, schedule.id);
      await insertDeliveryLog(supabase, {
        scheduleId: schedule.id,
        userId: schedule.user_id,
        familyId: schedule.family_id,
        todoId: schedule.todo_id,
        templateSetCode,
        status: "skipped",
        requestPayload: {},
        responseBody: { reason: "toss_user_key_not_ready" },
      });
      return "skipped";
    }

    const child = await getChild(supabase, todo.child_id);
    payload = createSmartMessagePayload(templateSetCode, todo, child);
    const responseBody = await sendAppsInTossSmartMessage(profile.toss_user_key, payload);
    const deliveryResult = getSmartMessageDeliveryResult(responseBody);

    if (!deliveryResult.delivered) {
      await markScheduleFailed(supabase, schedule.id);
      await insertDeliveryLog(supabase, {
        scheduleId: schedule.id,
        userId: schedule.user_id,
        familyId: schedule.family_id,
        todoId: schedule.todo_id,
        templateSetCode,
        status: "failed",
        requestPayload: payload,
        responseBody,
        errorMessage: deliveryResult.reason,
      });
      return "failed";
    }

    await markScheduleSent(supabase, schedule.id);
    await insertDeliveryLog(supabase, {
      scheduleId: schedule.id,
      userId: schedule.user_id,
      familyId: schedule.family_id,
      todoId: schedule.todo_id,
      templateSetCode,
      status: "sent",
      requestPayload: payload,
      responseBody,
      sentAt: new Date().toISOString(),
    });
    return "sent";
  } catch (error) {
    await markScheduleFailed(supabase, schedule.id);
    await insertDeliveryLog(supabase, {
      scheduleId: schedule.id,
      userId: schedule.user_id,
      familyId: schedule.family_id,
      todoId: schedule.todo_id,
      templateSetCode,
      status: "failed",
      requestPayload: payload ?? {},
      responseBody: error instanceof Error ? { message: error.message } : {},
      errorMessage: error instanceof Error ? error.message : "unknown_error",
    });
    return "failed";
  }
}

async function getNotificationPreference(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  familyId: string,
) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .eq("family_id", familyId)
    .maybeSingle<NotificationPreferenceRow>();

  if (error) throw error;
  return data;
}

async function getProfile(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, toss_user_key")
    .eq("id", userId)
    .single<ProfileRow>();

  if (error) throw error;
  return data;
}

async function getTodo(supabase: ReturnType<typeof createServiceClient>, todoId: string) {
  const { data, error } = await supabase
    .from("todos")
    .select("id, child_id, title, description, category, due_date, due_label")
    .eq("id", todoId)
    .single<TodoRow>();

  if (error) throw error;
  return data;
}

async function getChild(supabase: ReturnType<typeof createServiceClient>, childId: string) {
  const { data, error } = await supabase
    .from("children")
    .select("id, name")
    .eq("id", childId)
    .single<ChildRow>();

  if (error) throw error;
  return data;
}

async function markScheduleSent(supabase: ReturnType<typeof createServiceClient>, scheduleId: string) {
  const { error } = await supabase
    .from("push_schedules")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", scheduleId);

  if (error) throw error;
}

async function markScheduleFailed(supabase: ReturnType<typeof createServiceClient>, scheduleId: string) {
  const { error } = await supabase
    .from("push_schedules")
    .update({ status: "failed" })
    .eq("id", scheduleId);

  if (error) throw error;
}

async function markScheduleCancelled(supabase: ReturnType<typeof createServiceClient>, scheduleId: string) {
  const { error } = await supabase
    .from("push_schedules")
    .update({ status: "cancelled" })
    .eq("id", scheduleId);

  if (error) throw error;
}

async function insertDeliveryLog(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    scheduleId: string;
    userId: string;
    familyId: string;
    todoId: string;
    templateSetCode: string;
    status: "pending" | "sent" | "failed" | "skipped";
    requestPayload: Record<string, unknown>;
    responseBody?: Record<string, unknown>;
    errorMessage?: string;
    sentAt?: string;
  },
) {
  const { error } = await supabase
    .from("message_delivery_logs")
    .insert({
      schedule_id: input.scheduleId,
      user_id: input.userId,
      family_id: input.familyId,
      todo_id: input.todoId,
      template_set_code: input.templateSetCode,
      status: input.status,
      request_payload: input.requestPayload,
      response_body: input.responseBody ?? null,
      error_message: input.errorMessage ?? null,
      sent_at: input.sentAt ?? null,
    });

  if (error) throw error;
}

function createSmartMessagePayload(
  templateSetCode: string,
  todo: TodoRow,
  child: ChildRow,
): SmartMessagePayload {
  return {
    templateSetCode,
    context: {
      childName: child.name,
      todoTitle: todo.title,
      todoDescription: todo.description ?? "",
      dueDate: todo.due_label ?? todo.due_date ?? "",
      category: formatTodoCategory(todo.category),
    },
  };
}

async function sendAppsInTossSmartMessage(userKey: string, payload: SmartMessagePayload) {
  if (Deno.env.get("APPS_IN_TOSS_ENABLE_SMART_MESSAGE") !== "true") {
    return {
      resultType: "SUCCESS",
      success: {
        msgCount: 1,
        sentPushCount: 1,
        dryRun: true,
      },
    };
  }

  const response = await fetch(
    `${requireEnv("APPS_IN_TOSS_API_BASE_URL")}/api-partner/v1/apps-in-toss/messenger/send-message`,
    withTossMutualTlsClient({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-toss-user-key": userKey,
      },
      body: JSON.stringify(payload),
    }),
  );

  const body = await response.json() as SmartMessageResponse;

  if (!response.ok || body.resultType !== "SUCCESS") {
    throw new Error(body.error?.reason ?? "토스 스마트 발송 API 호출에 실패했어요.");
  }

  return body;
}

function getSmartMessageDeliveryResult(body: SmartMessageResponse) {
  const success = body.success;
  const deliveredCount =
    (success?.sentPushCount ?? 0) +
    (success?.sentInboxCount ?? 0) +
    (success?.sentSmsCount ?? 0) +
    (success?.sentAlimtalkCount ?? 0) +
    (success?.sentFriendtalkCount ?? 0);

  if (deliveredCount > 0) {
    return { delivered: true, reason: undefined };
  }

  return {
    delivered: false,
    reason:
      extractSmartMessageFailReason(body) ??
      `smart_message_not_delivered: msgCount=${success?.msgCount ?? 0}, deliveredCount=${deliveredCount}`,
  };
}

function extractSmartMessageFailReason(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  if (typeof record.reachedFailReason === "string") return record.reachedFailReason;
  if (typeof record.reason === "string") return record.reason;

  for (const nested of Object.values(record)) {
    const reason = extractSmartMessageFailReason(nested);
    if (reason) return reason;
  }

  return undefined;
}

function formatTodoCategory(category: TodoRow["category"]) {
  const labels: Record<TodoRow["category"], string> = {
    preparation: "준비물",
    homework: "숙제",
    submission: "제출물",
    parent_check: "학부모 확인",
    payment: "납부",
    other: "기타",
  };

  return labels[category] ?? "기타";
}

function withTossMutualTlsClient(init: RequestInit) {
  const client = createTossMutualTlsClient();
  return client ? { ...init, client } as RequestInit : init;
}

function createTossMutualTlsClient() {
  const cert = readPemSecret("APPS_IN_TOSS_MTLS_CERT_PEM", "APPS_IN_TOSS_MTLS_CERT_BASE64");
  const key = readPemSecret("APPS_IN_TOSS_MTLS_KEY_PEM", "APPS_IN_TOSS_MTLS_KEY_BASE64");

  if (!cert && !key) {
    return undefined;
  }

  if (!cert || !key) {
    throw new Error("토스 스마트메시지 API 인증서 설정을 확인해주세요.");
  }

  const deno = Deno as typeof Deno & {
    createHttpClient?: (options: { cert: string; key: string }) => unknown;
  };

  if (typeof deno.createHttpClient !== "function") {
    throw new Error("토스 스마트메시지 API 인증서 연결을 준비하지 못했어요.");
  }

  return deno.createHttpClient({ cert, key });
}

function readPemSecret(pemName: string, base64Name: string) {
  const pemValue = Deno.env.get(pemName);
  if (pemValue) return pemValue.replace(/\\n/g, "\n");

  const base64Value = Deno.env.get(base64Name);
  if (!base64Value) return undefined;

  try {
    return atob(base64Value).replace(/\\n/g, "\n");
  } catch {
    throw new Error(`${base64Name} 값을 읽지 못했어요.`);
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
