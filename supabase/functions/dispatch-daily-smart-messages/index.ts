import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type TriggerKind =
  | "tomorrow_preparation_check"
  | "today_final_check"
  | "tomorrow_schedule_reminder"
  | "today_schedule_reminder";
type ReminderStatus = "empty" | "all_checked" | "pending_items";

interface NotificationPreferenceRow {
  user_id: string;
  family_id: string;
  enabled: boolean;
  preparation_time: string;
  morning_time: string;
  schedule_enabled?: boolean | null;
  schedule_day?: "before" | "same-day" | null;
  schedule_time?: string | null;
  consent_status: "unknown" | "accepted" | "declined";
}

interface ProfileRow {
  id: string;
  toss_user_key: string | null;
}

interface ChildRow {
  id: string;
  family_id: string;
  name: string;
}

interface TodoRow {
  id: string;
  family_id: string;
  child_id: string;
  title: string;
  category: "preparation" | "homework" | "submission" | "parent_check" | "payment" | "other";
  due_date: string | null;
  due_label: string | null;
  status: "pending" | "done" | "archived";
}

interface CalendarEventRow {
  id: string;
  family_id: string;
  child_id: string | null;
  title: string;
  event_date: string;
  start_time: string | null;
}

interface SmartMessagePayload {
  templateSetCode: string;
  context: Record<string, string>;
}

const MATCH_WINDOW_MINUTES = 10;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    assertSchedulerSecret(request);

    const supabase = createServiceClient();
    const now = new Date();
    const nowInKst = formatKst(now);
    const preferences = await getTargetPreferences(supabase, nowInKst.time);

    const summary = {
      evaluatedUsers: preferences.length,
      sent: 0,
      skipped: 0,
      failed: 0,
    };

    for (const preference of preferences) {
      const triggerKinds = getDueTriggerKinds(preference, nowInKst.time);
      for (const triggerKind of triggerKinds) {
        const result = await processDailyReminder(supabase, preference, triggerKind, nowInKst.date);
        summary[result] += 1;
      }
    }

    return jsonResponse(summary);
  } catch (error) {
    return jsonResponse(
      { message: error instanceof Error ? error.message : "일일 알림 평가에 실패했어요." },
      { status: 500 },
    );
  }
});

async function processDailyReminder(
  supabase: ReturnType<typeof createServiceClient>,
  preference: NotificationPreferenceRow,
  triggerKind: TriggerKind,
  todayDate: string,
): Promise<"sent" | "skipped" | "failed"> {
  try {
    if (preference.consent_status !== "accepted") {
      return "skipped";
    }

    const profile = await getProfile(supabase, preference.user_id);
    if (!profile?.toss_user_key) {
      return "skipped";
    }

    const targetDate = isTomorrowTrigger(triggerKind) ? addDays(todayDate, 1) : todayDate;
    const targetLabel = isTomorrowTrigger(triggerKind) ? "내일" : "오늘";

    const children = await getChildren(supabase, preference.family_id);
    if (isPreparationTrigger(triggerKind)) {
      const todos = await getPreparationTodos(supabase, preference.family_id, targetDate, targetLabel);

      let sentCount = 0;
      for (const child of children) {
        const childTodos = todos.filter((todo) => todo.child_id === child.id);
        const status = getReminderStatus(childTodos);
        const pendingCount = childTodos.filter((todo) => todo.status !== "done").length;
        const totalCount = childTodos.length;
        const templateSetCode = resolveTemplateSetCode(triggerKind, status);

        if (!templateSetCode) {
          continue;
        }

        const alreadySent = await hasSentDailyReminder(
          supabase,
          preference.user_id,
          child.id,
          triggerKind,
          targetDate,
        );
        if (alreadySent) {
          continue;
        }

        const payload: SmartMessagePayload = {
          templateSetCode,
          context: {
            status,
            targetDayLabel: targetLabel,
            pendingCount: String(pendingCount),
            totalCount: String(totalCount),
          },
        };

        const responseBody = await sendAppsInTossSmartMessage(profile.toss_user_key, payload);
        await insertDailyDeliveryLog(supabase, {
          userId: preference.user_id,
          familyId: preference.family_id,
          childId: child.id,
          targetDate,
          triggerKind,
          templateSetCode,
          requestPayload: payload,
          responseBody,
        });
        sentCount += 1;
      }

      return sentCount > 0 ? "sent" : "skipped";
    }

    const events = await getCalendarEvents(supabase, preference.family_id, targetDate);
    let sentCount = 0;
    for (const child of children) {
      const childEvents = events.filter((event) => event.child_id === child.id);
      if (childEvents.length === 0) {
        continue;
      }

      const templateSetCode = resolveTemplateSetCode(triggerKind, "pending_items");
      if (!templateSetCode) {
        continue;
      }

      const alreadySent = await hasSentDailyReminder(
        supabase,
        preference.user_id,
        child.id,
        triggerKind,
        targetDate,
      );
      if (alreadySent) {
        continue;
      }

      const firstEvent = childEvents[0];
      const payload: SmartMessagePayload = {
        templateSetCode,
        context: {
          targetDayLabel: targetLabel,
          eventCount: String(childEvents.length),
          firstEventTitle: firstEvent.title,
          firstEventTime: firstEvent.start_time ?? "시간 미정",
        },
      };

      const responseBody = await sendAppsInTossSmartMessage(profile.toss_user_key, payload);
      await insertDailyDeliveryLog(supabase, {
        userId: preference.user_id,
        familyId: preference.family_id,
        childId: child.id,
        targetDate,
        triggerKind,
        templateSetCode,
        requestPayload: payload,
        responseBody,
      });
      sentCount += 1;
    }

    return sentCount > 0 ? "sent" : "skipped";
  } catch (error) {
    console.error(error);
    return "failed";
  }
}

async function getTargetPreferences(
  supabase: ReturnType<typeof createServiceClient>,
  nowTime: string,
) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("user_id, family_id, enabled, preparation_time, morning_time, schedule_enabled, schedule_day, schedule_time, consent_status")
    .eq("enabled", true)
    .returns<NotificationPreferenceRow[]>();

  if (error) throw error;

  return (data ?? []).filter((preference) => {
    const hasPreparationTrigger =
      isWithinMatchWindow(preference.preparation_time, nowTime) ||
      isWithinMatchWindow(preference.morning_time, nowTime);
    const hasScheduleTrigger =
      preference.schedule_enabled === true &&
      preference.schedule_time &&
      isWithinMatchWindow(preference.schedule_time, nowTime);

    return hasPreparationTrigger || hasScheduleTrigger;
  });
}

async function getProfile(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, toss_user_key")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();
  if (error) throw error;
  return data;
}

async function getChildren(supabase: ReturnType<typeof createServiceClient>, familyId: string) {
  const { data, error } = await supabase
    .from("children")
    .select("id, family_id, name")
    .eq("family_id", familyId)
    .returns<ChildRow[]>();
  if (error) throw error;
  return data ?? [];
}

async function getPreparationTodos(
  supabase: ReturnType<typeof createServiceClient>,
  familyId: string,
  targetDate: string,
  targetLabel: string,
) {
  const { data, error } = await supabase
    .from("todos")
    .select("id, family_id, child_id, title, category, due_date, due_label, status")
    .eq("family_id", familyId)
    .eq("category", "preparation")
    .in("status", ["pending", "done"])
    .returns<TodoRow[]>();

  if (error) throw error;

  return (data ?? []).filter((todo) => todo.due_date === targetDate || todo.due_label === targetLabel);
}

async function getCalendarEvents(
  supabase: ReturnType<typeof createServiceClient>,
  familyId: string,
  targetDate: string,
) {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, family_id, child_id, title, event_date, start_time")
    .eq("family_id", familyId)
    .eq("event_date", targetDate)
    .neq("status", "deleted")
    .returns<CalendarEventRow[]>();

  if (error) throw error;

  return data ?? [];
}

function getReminderStatus(todos: TodoRow[]): ReminderStatus {
  if (todos.length === 0) return "empty";
  if (todos.every((todo) => todo.status === "done")) return "all_checked";
  return "pending_items";
}

function resolveTemplateSetCode(triggerKind: TriggerKind, status: ReminderStatus) {
  if (triggerKind === "tomorrow_preparation_check") {
    if (status === "empty") return Deno.env.get("APPS_IN_TOSS_TEMPLATE_TOMORROW_EMPTY") ?? "";
    if (status === "all_checked") return Deno.env.get("APPS_IN_TOSS_TEMPLATE_TOMORROW_ALL_CHECKED") ?? "";
    return Deno.env.get("APPS_IN_TOSS_TEMPLATE_TOMORROW_PENDING_ITEMS") ?? "";
  }

  if (status === "empty") return Deno.env.get("APPS_IN_TOSS_TEMPLATE_TODAY_EMPTY") ?? "";
  if (status === "all_checked") return Deno.env.get("APPS_IN_TOSS_TEMPLATE_TODAY_ALL_CHECKED") ?? "";
  if (triggerKind === "tomorrow_schedule_reminder") {
    return Deno.env.get("APPS_IN_TOSS_TEMPLATE_TOMORROW_SCHEDULE") ?? "";
  }
  if (triggerKind === "today_schedule_reminder") {
    return Deno.env.get("APPS_IN_TOSS_TEMPLATE_TODAY_SCHEDULE") ?? "";
  }
  return Deno.env.get("APPS_IN_TOSS_TEMPLATE_TODAY_PENDING_ITEMS") ?? "";
}

async function hasSentDailyReminder(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  childId: string,
  triggerKind: TriggerKind,
  targetDate: string,
) {
  const { data, error } = await supabase
    .from("message_delivery_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("child_id", childId)
    .eq("trigger_kind", triggerKind)
    .eq("target_date", targetDate)
    .eq("status", "sent")
    .limit(1);

  if (error) throw error;
  return (data ?? []).length > 0;
}

async function insertDailyDeliveryLog(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    userId: string;
    familyId: string;
    childId: string;
    targetDate: string;
    triggerKind: TriggerKind;
    templateSetCode: string;
    requestPayload: Record<string, unknown>;
    responseBody?: Record<string, unknown>;
  },
) {
  const { error } = await supabase
    .from("message_delivery_logs")
    .insert({
      schedule_id: null,
      todo_id: null,
      user_id: input.userId,
      family_id: input.familyId,
      child_id: input.childId,
      target_date: input.targetDate,
      trigger_kind: input.triggerKind,
      template_set_code: input.templateSetCode,
      status: "sent",
      request_payload: input.requestPayload,
      response_body: input.responseBody ?? null,
      sent_at: new Date().toISOString(),
    });

  if (error) throw error;
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
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-toss-user-key": userKey,
      },
      body: JSON.stringify(payload),
    },
  );

  const body = await response.json() as {
    resultType?: string;
    error?: { reason?: string };
  } & Record<string, unknown>;

  if (!response.ok || body.resultType !== "SUCCESS") {
    throw new Error(body.error?.reason ?? "토스 스마트 발송 API 호출에 실패했어요.");
  }

  return body;
}

function getDueTriggerKinds(preference: NotificationPreferenceRow, nowTime: string): TriggerKind[] {
  const kinds: TriggerKind[] = [];
  if (isWithinMatchWindow(preference.preparation_time, nowTime)) {
    kinds.push("tomorrow_preparation_check");
  }
  if (isWithinMatchWindow(preference.morning_time, nowTime)) {
    kinds.push("today_final_check");
  }
  if (preference.schedule_enabled === true && preference.schedule_time && isWithinMatchWindow(preference.schedule_time, nowTime)) {
    kinds.push(preference.schedule_day === "same-day" ? "today_schedule_reminder" : "tomorrow_schedule_reminder");
  }
  return kinds;
}

function isPreparationTrigger(triggerKind: TriggerKind) {
  return triggerKind === "tomorrow_preparation_check" || triggerKind === "today_final_check";
}

function isTomorrowTrigger(triggerKind: TriggerKind) {
  return triggerKind === "tomorrow_preparation_check" || triggerKind === "tomorrow_schedule_reminder";
}

function isWithinMatchWindow(targetTime: string, nowTime: string) {
  const targetMinutes = toMinutes(targetTime);
  const nowMinutes = toMinutes(nowTime);
  return Math.abs(targetMinutes - nowMinutes) <= MATCH_WINDOW_MINUTES;
}

function toMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return (hours * 60) + minutes;
}

function formatKst(date: Date) {
  const kstDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const iso = new Date(kstDate.getTime() - (kstDate.getTimezoneOffset() * 60000)).toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
  };
}

function addDays(date: string, days: number) {
  const target = new Date(`${date}T00:00:00+09:00`);
  target.setDate(target.getDate() + days);
  return target.toISOString().slice(0, 10);
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
