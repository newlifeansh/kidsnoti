import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface CalendarConnectionRow {
  calendar_id: string;
  encrypted_refresh_token: string;
}

interface CalendarEventRow {
  id: string;
  family_id: string;
  child_id: string | null;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  google_event_id: string | null;
  status: "pending" | "created" | "failed" | "deleted";
}

interface GoogleRefreshResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ message: "POST만 지원해요." }, { status: 405 });
  }

  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await safeJson(request) as { calendarEventIds?: string[] };
    const supabase = createServiceClient();
    const familyId = await getCurrentFamilyId(supabase, userId);
    const connection = await getCalendarConnection(supabase, userId);
    const refreshToken = await decryptText(connection.encrypted_refresh_token);
    const accessToken = await refreshGoogleAccessToken(refreshToken);
    const events = await getPendingCalendarEvents(supabase, familyId, body.calendarEventIds);

    const results = await Promise.allSettled(
      events.map(async (event) => {
        const googleEventId = await insertGoogleCalendarEvent(connection.calendar_id, accessToken, event);
        const { error } = await supabase
          .from("calendar_events")
          .update({
            google_event_id: googleEventId,
            google_calendar_id: connection.calendar_id,
            status: "created",
          })
          .eq("id", event.id);

        if (error) throw error;
        return event.id;
      }),
    );

    const failedIds = results.flatMap((result, index) =>
      result.status === "rejected" ? [events[index].id] : [],
    );

    if (failedIds.length > 0) {
      await supabase
        .from("calendar_events")
        .update({ status: "failed" })
        .in("id", failedIds);
    }

    return jsonResponse({
      picked: events.length,
      created: results.filter((result) => result.status === "fulfilled").length,
      failed: failedIds.length,
    });
  } catch (error) {
    return jsonResponse(
      { message: error instanceof Error ? error.message : "Google Calendar 일정 생성에 실패했어요." },
      { status: 500 },
    );
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
    throw new Error("Supabase 사용자 확인에 실패했어요.");
  }

  return data.user.id;
}

async function getCurrentFamilyId(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("current_family_id")
    .eq("id", userId)
    .single<{ current_family_id: string | null }>();

  if (error) throw error;
  if (!data.current_family_id) {
    throw new Error("가족 정보가 없어요.");
  }

  return data.current_family_id;
}

async function getCalendarConnection(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("calendar_connections")
    .select("calendar_id, encrypted_refresh_token")
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("calendar_id", "primary")
    .maybeSingle<CalendarConnectionRow>();

  if (error) throw error;
  if (!data) {
    throw new Error("Google Calendar 연결이 필요해요.");
  }

  return data;
}

async function getPendingCalendarEvents(
  supabase: ReturnType<typeof createServiceClient>,
  familyId: string,
  calendarEventIds?: string[],
) {
  let query = supabase
    .from("calendar_events")
    .select("*")
    .eq("family_id", familyId)
    .is("google_event_id", null)
    .neq("status", "deleted")
    .limit(20)
    .returns<CalendarEventRow[]>();

  if (calendarEventIds && calendarEventIds.length > 0) {
    query = query.in("id", calendarEventIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function refreshGoogleAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });

  const body = await response.json() as GoogleRefreshResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description ?? body.error ?? "Google access token 갱신에 실패했어요.");
  }

  return body.access_token;
}

async function insertGoogleCalendarEvent(
  calendarId: string,
  accessToken: string,
  event: CalendarEventRow,
) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toGoogleEvent(event)),
    },
  );

  const body = await response.json() as { id?: string; error?: { message?: string } };
  if (!response.ok || !body.id) {
    throw new Error(body.error?.message ?? "Google Calendar 이벤트 생성에 실패했어요.");
  }

  return body.id;
}

function toGoogleEvent(event: CalendarEventRow) {
  const summary = event.title;
  const location = event.location ?? undefined;

  if (!event.start_time) {
    return {
      summary,
      location,
      start: { date: event.event_date },
      end: { date: addDays(event.event_date, 1) },
    };
  }

  const start = `${event.event_date}T${event.start_time.slice(0, 5)}:00+09:00`;
  const endTime = event.end_time?.slice(0, 5) ?? event.start_time.slice(0, 5);
  const end = `${event.event_date}T${endTime}:00+09:00`;

  return {
    summary,
    location,
    start: { dateTime: start, timeZone: "Asia/Seoul" },
    end: { dateTime: end, timeZone: "Asia/Seoul" },
  };
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+09:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

async function decryptText(value: string) {
  const [ivText, cipherText] = value.split(".");
  if (!ivText || !cipherText) {
    throw new Error("저장된 Calendar token 형식이 올바르지 않아요.");
  }

  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(ivText) },
    await aesKey(),
    base64UrlToBytes(cipherText),
  );

  return new TextDecoder().decode(plain);
}

async function aesKey() {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(requireEnv("TOKEN_ENCRYPTION_KEY")),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function safeJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
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
