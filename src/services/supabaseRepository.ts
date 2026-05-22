import type { Session, User } from "@supabase/supabase-js";

import type {
  CalendarEventRecord,
  ChildProfile,
  Family,
  FamilyMember,
  NotificationConsentStatus,
  NotificationPreferences,
  ParsedNoticeResult,
  TodoRecord,
  TodoStatus,
} from "../types/domain";
import { getAppsInTossIdentity, type AppsInTossIdentity } from "./appsInTossIdentity";
import { supabase, supabaseProjectUrl } from "./supabaseClient";

interface ProfileRow {
  id: string;
  display_name: string | null;
  toss_user_hash: string | null;
  toss_user_key: string | null;
  current_family_id: string | null;
  created_at: string;
  updated_at: string;
}

interface FamilyRow {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface ChildRow {
  id: string;
  family_id: string;
  name: string;
  avatar_id: string;
  school_name: string | null;
  grade: string | null;
  class_name: string | null;
  created_at: string;
  updated_at: string;
}

interface TodoRow {
  id: string;
  family_id: string;
  child_id: string;
  created_by: string;
  title: string;
  description: string | null;
  category: TodoRecord["category"];
  due_date: string | null;
  due_label: string | null;
  remind_at: string | null;
  status: TodoStatus;
  source_notice_id: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CalendarEventRow {
  id: string;
  family_id: string;
  child_id: string | null;
  created_by: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  reminder_at: string | null;
  confidence: number | null;
  needs_user_confirmation: boolean | null;
  reason: string | null;
  google_event_id: string | null;
  google_calendar_id: string | null;
  source_notice_id: string | null;
  status: CalendarEventRecord["status"];
  created_at: string;
  updated_at: string;
}

interface FamilyMemberRow {
  family_id: string;
  user_id: string;
  role: FamilyMember["role"];
  display_name: string | null;
  joined_at: string;
}

interface NotificationPreferencesRow {
  user_id: string;
  family_id: string;
  enabled: boolean;
  preparation_day: "before" | "same-day";
  preparation_time: string;
  morning_time: string;
  schedule_enabled?: boolean | null;
  schedule_day?: "before" | "same-day" | null;
  schedule_time?: string | null;
  template_set_code: string | null;
  consent_status?: NotificationConsentStatus | null;
  consent_last_prompted_at?: string | null;
  consent_accepted_at?: string | null;
  consent_declined_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseFamilyData {
  family: Family;
  familyMembers: FamilyMember[];
  children: ChildProfile[];
  todos: TodoRecord[];
  calendarEvents: CalendarEventRecord[];
}

export interface AppsInTossSession {
  identity: AppsInTossIdentity;
  userId: string;
}

let connectAppsInTossUserPromise: Promise<AppsInTossSession> | null = null;

export interface SaveNoticeDraft {
  noticeId: string;
  sourceText: string;
  parsedResult: unknown;
  todos: Array<{
    childId: string;
    title: string;
    description?: string;
    category: TodoRecord["category"];
    dueDate?: string;
    remindAt?: string;
  }>;
  calendarEvents: Array<{
    childId?: string;
    title: string;
    description?: string;
    date: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    reminderAt?: string;
    confidence?: number;
    needsUserConfirmation?: boolean;
    reason?: string;
  }>;
}

export interface SupabaseTodoInput {
  childId: string;
  title: string;
  description?: string;
  category: TodoRecord["category"];
  dueDate?: string;
  remindAt?: string;
}

export interface SupabaseCalendarEventInput {
  childId?: string;
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  reminderAt?: string;
  confidence?: number;
  needsUserConfirmation?: boolean;
  reason?: string;
}

export interface SupabaseNotificationPreferencesInput {
  enabled: boolean;
  preparationDay: "before" | "same-day";
  preparationTime: string;
  morningTime: string;
  scheduleEnabled: boolean;
  scheduleDay: "before" | "same-day";
  scheduleTime: string;
  templateSetCode?: string;
  consentStatus?: NotificationConsentStatus;
  consentLastPromptedAt?: string | null;
  consentAcceptedAt?: string | null;
  consentDeclinedAt?: string | null;
}

export async function getSupabaseSession(): Promise<Session | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function getSupabaseUserEmail(user: User | null): string | null {
  return user?.email ?? null;
}

export function getSupabaseUserLabel(user: User | null): string | null {
  if (!user) return null;
  const tossHash = user.user_metadata.toss_user_hash;
  if (typeof tossHash === "string" && tossHash.length > 0) {
    return `토스 사용자 ${tossHash.slice(0, 8)}`;
  }
  return user.email ?? `사용자 ${user.id.slice(0, 8)}`;
}

export async function connectAppsInTossUser(): Promise<AppsInTossSession> {
  if (connectAppsInTossUserPromise) {
    return connectAppsInTossUserPromise;
  }

  connectAppsInTossUserPromise = connectAppsInTossUserInternal();

  try {
    return await connectAppsInTossUserPromise;
  } finally {
    connectAppsInTossUserPromise = null;
  }
}

async function connectAppsInTossUserInternal(): Promise<AppsInTossSession> {
  if (!supabase) throw new Error("서비스 연결 설정이 필요해요.");

  const identity = await getAppsInTossIdentity();
  const currentSession = await getSupabaseSession();

  if (currentSession) {
    await ensureProfile(currentSession.user, identity);
    return {
      identity,
      userId: currentSession.user.id,
    };
  }

  const { data, error } = await supabase.auth.signInAnonymously({
    options: {
      data: {
        auth_provider: "apps-in-toss",
        toss_user_hash: identity.userHash,
        identity_source: identity.source,
      },
    },
  });

  if (error) throw error;
  if (!data.user) throw new Error("앱인토스 사용자 연결에 실패했어요.");

  await ensureProfile(data.user, identity);

  return {
    identity,
    userId: data.user.id,
  };
}

export async function signOutSupabase() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function subscribeSupabaseAuth(callback: (session: Session | null) => void) {
  if (!supabase) {
    return () => undefined;
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => data.subscription.unsubscribe();
}

export async function getSupabaseFamilyData(): Promise<SupabaseFamilyData | null> {
  const session = await getSupabaseSession();
  if (!session || !supabase) return null;

  await ensureProfile(session.user);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, toss_user_hash, toss_user_key, current_family_id, created_at, updated_at")
    .eq("id", session.user.id)
    .maybeSingle<ProfileRow>();

  if (profileError) throw profileError;
  if (!profile?.current_family_id) return null;

  return loadFamilyData(profile.current_family_id);
}

export async function getSupabaseNotificationPreferences(): Promise<NotificationPreferences | null> {
  const session = await getSupabaseSession();
  if (!session || !supabase) return null;

  const familyId = await getCurrentFamilyId(session.user.id);
  if (!familyId) return null;

  const [{ data, error }, profile] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("family_id", familyId)
      .maybeSingle<NotificationPreferencesRow>(),
    getProfileRow(session.user.id),
  ]);

  if (error) throw error;

  return notificationPreferencesRowToRecord(
    data ?? {
      user_id: session.user.id,
      family_id: familyId,
      enabled: false,
      preparation_day: "before",
      preparation_time: "20:00:00",
      morning_time: "07:30:00",
      schedule_enabled: false,
      schedule_day: "before",
      schedule_time: "18:30:00",
      template_set_code: null,
      consent_status: "unknown",
      consent_last_prompted_at: null,
      consent_accepted_at: null,
      consent_declined_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    profile?.toss_user_key ?? null,
  );
}

export async function saveSupabaseNotificationPreferences(
  input: SupabaseNotificationPreferencesInput,
): Promise<NotificationPreferences> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const familyId = await ensureCurrentFamily();
  const { data: existing, error: existingError } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", session.user.id)
    .eq("family_id", familyId)
    .maybeSingle<NotificationPreferencesRow>();

  if (existingError) throw existingError;
  const basePayload = {
    user_id: session.user.id,
    family_id: familyId,
    enabled: input.enabled,
    preparation_day: input.preparationDay,
    preparation_time: normalizeTimeForDb(input.preparationTime),
    morning_time: normalizeTimeForDb(input.morningTime),
    schedule_enabled: input.scheduleEnabled,
    schedule_day: input.scheduleDay,
    schedule_time: normalizeTimeForDb(input.scheduleTime),
    template_set_code: input.templateSetCode ?? existing?.template_set_code ?? null,
  };
  const legacyPayload = {
    user_id: session.user.id,
    family_id: familyId,
    enabled: input.enabled,
    preparation_day: input.preparationDay,
    preparation_time: normalizeTimeForDb(input.preparationTime),
    morning_time: normalizeTimeForDb(input.morningTime),
    template_set_code: input.templateSetCode ?? existing?.template_set_code ?? null,
  };

  const fullPayload = {
    ...basePayload,
    consent_status: input.consentStatus ?? existing?.consent_status ?? "unknown",
    consent_last_prompted_at: input.consentLastPromptedAt ?? existing?.consent_last_prompted_at ?? null,
    consent_accepted_at: input.consentAcceptedAt ?? existing?.consent_accepted_at ?? null,
    consent_declined_at: input.consentDeclinedAt ?? existing?.consent_declined_at ?? null,
  };

  let data: NotificationPreferencesRow | null = null;

  const fullResult = await supabase
    .from("notification_preferences")
    .upsert(fullPayload)
    .select("*")
    .single<NotificationPreferencesRow>();

  if (fullResult.error) {
    if (!isLegacyNotificationPreferencesSchemaError(fullResult.error)) {
      throw fullResult.error;
    }

    const legacyResult = await supabase
      .from("notification_preferences")
      .upsert(legacyPayload)
      .select("*")
      .single<NotificationPreferencesRow>();

    if (legacyResult.error) throw legacyResult.error;
    data = legacyResult.data;
  } else {
    data = fullResult.data;
  }

  const profile = await getProfileRow(session.user.id);

  return notificationPreferencesRowToRecord(
    {
      ...data,
      schedule_enabled: data.schedule_enabled ?? input.scheduleEnabled,
      schedule_day: data.schedule_day ?? input.scheduleDay,
      schedule_time: data.schedule_time ?? normalizeTimeForDb(input.scheduleTime),
      consent_status: input.consentStatus ?? data.consent_status ?? existing?.consent_status ?? "unknown",
      consent_last_prompted_at:
        input.consentLastPromptedAt ?? data.consent_last_prompted_at ?? existing?.consent_last_prompted_at ?? null,
      consent_accepted_at:
        input.consentAcceptedAt ?? data.consent_accepted_at ?? existing?.consent_accepted_at ?? null,
      consent_declined_at:
        input.consentDeclinedAt ?? data.consent_declined_at ?? existing?.consent_declined_at ?? null,
    },
    profile?.toss_user_key ?? null,
  );
}

async function getProfileRow(userId: string) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, toss_user_hash, toss_user_key, current_family_id, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();
  if (error) throw error;
  return data;
}

async function getCurrentFamilyId(userId: string): Promise<string | null> {
  const profile = await getProfileRow(userId);
  return profile?.current_family_id ?? null;
}

export async function saveSupabaseTossUserKey(userKey: string): Promise<void> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const { error } = await supabase
    .from("profiles")
    .update({
      toss_user_key: userKey,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.user.id);

  if (error) throw error;
}

export async function getSupabaseTossUserKey(): Promise<string | null> {
  const session = await getSupabaseSession();
  if (!session || !supabase) return null;

  const profile = await getProfileRow(session.user.id);
  return profile?.toss_user_key ?? null;
}

export async function createSupabaseChild(
  child: Pick<ChildProfile, "name" | "avatarId" | "schoolName" | "grade" | "className">,
): Promise<ChildProfile> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const familyId = await ensureCurrentFamily();
  const { data, error } = await supabase
    .from("children")
    .insert({
      family_id: familyId,
      name: child.name,
      avatar_id: child.avatarId,
      school_name: child.schoolName,
      grade: child.grade,
      class_name: child.className,
    })
    .select("*")
    .single<ChildRow>();

  if (error) throw error;
  return childRowToProfile(data);
}

export async function updateSupabaseChild(
  childId: string,
  child: Pick<ChildProfile, "name" | "avatarId" | "schoolName" | "grade" | "className">,
): Promise<ChildProfile> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const { data, error } = await supabase
    .from("children")
    .update({
      name: child.name,
      avatar_id: child.avatarId,
      school_name: child.schoolName,
      grade: child.grade,
      class_name: child.className,
      updated_at: new Date().toISOString(),
    })
    .eq("id", childId)
    .select("*")
    .single<ChildRow>();

  if (error) throw error;
  return childRowToProfile(data);
}

export async function deleteSupabaseChild(childId: string): Promise<void> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const { error } = await supabase
    .from("children")
    .delete()
    .eq("id", childId);

  if (error) throw error;
}

export async function updateSupabaseTodoStatus(
  todoId: string,
  status: TodoStatus,
): Promise<TodoRecord> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const { data, error } = await supabase
    .from("todos")
    .update({
      status,
      completed_by: status === "done" ? session.user.id : null,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .eq("id", todoId)
    .select("*")
    .single<TodoRow>();

  if (error) throw error;
  return todoRowToRecord(data);
}

export async function createSupabaseTodo(input: SupabaseTodoInput): Promise<TodoRecord> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const familyId = await ensureCurrentFamily();
  const parsedDueDate = toDateOrNull(input.dueDate);
  const { data, error } = await supabase
    .from("todos")
    .insert({
      family_id: familyId,
      child_id: input.childId,
      created_by: session.user.id,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      due_date: parsedDueDate,
      due_label: parsedDueDate ? null : input.dueDate ?? null,
      remind_at: input.remindAt ?? null,
      status: "pending",
    })
    .select("*")
    .single<TodoRow>();

  if (error) throw error;
  return todoRowToRecord(data);
}

export async function updateSupabaseTodo(
  todoId: string,
  input: SupabaseTodoInput,
): Promise<TodoRecord> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const parsedDueDate = toDateOrNull(input.dueDate);
  const { data, error } = await supabase
    .from("todos")
    .update({
      child_id: input.childId,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      due_date: parsedDueDate,
      due_label: parsedDueDate ? null : input.dueDate ?? null,
      remind_at: input.remindAt ?? null,
    })
    .eq("id", todoId)
    .select("*")
    .single<TodoRow>();

  if (error) throw error;
  return todoRowToRecord(data);
}

export async function archiveSupabaseTodo(todoId: string): Promise<void> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const { error } = await supabase
    .from("todos")
    .update({
      status: "archived",
      completed_by: null,
      completed_at: null,
    })
    .eq("id", todoId);

  if (error) throw error;
}

export async function createSupabaseCalendarEvent(
  input: SupabaseCalendarEventInput,
): Promise<CalendarEventRecord> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const familyId = await ensureCurrentFamily();
  const basePayload = {
    family_id: familyId,
    child_id: input.childId || null,
    created_by: session.user.id,
    title: input.title,
    description: input.description ?? null,
    event_date: toDateOrNull(input.date) ?? new Date().toISOString().slice(0, 10),
    start_time: toTimeOrNull(input.startTime),
    end_time: toTimeOrNull(input.endTime),
    location: input.location ?? null,
    reminder_at: input.reminderAt ?? null,
    status: "pending",
  };
  const legacyPayload = {
    family_id: basePayload.family_id,
    child_id: basePayload.child_id,
    created_by: basePayload.created_by,
    title: basePayload.title,
    event_date: basePayload.event_date,
    start_time: basePayload.start_time,
    status: basePayload.status,
  };

  const fullResult = await supabase
    .from("calendar_events")
    .insert({
      ...basePayload,
      confidence: input.confidence ?? null,
      needs_user_confirmation: input.needsUserConfirmation ?? false,
      reason: input.reason ?? null,
    })
    .select("*")
    .single<CalendarEventRow>();

  if (!fullResult.error) {
    return calendarEventRowToRecord(fullResult.data);
  }

  if (!isLegacyCalendarEventSchemaError(fullResult.error)) {
    throw fullResult.error;
  }

  const legacyResult = await supabase
    .from("calendar_events")
    .insert(legacyPayload)
    .select("*")
    .single<CalendarEventRow>();

  if (legacyResult.error) throw legacyResult.error;
  return calendarEventRowToRecord(legacyResult.data);
}

export async function archiveSupabaseCalendarEvent(eventId: string): Promise<void> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const { error } = await supabase
    .from("calendar_events")
    .update({
      status: "deleted",
      google_event_id: null,
      google_calendar_id: null,
    })
    .eq("id", eventId);

  if (error) throw error;
}

export async function getSupabaseGoogleCalendarAuthUrl(): Promise<string> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  if (!supabaseProjectUrl) throw new Error("서비스 연결 설정이 필요해요.");

  const endpoint = `${supabaseProjectUrl}/functions/v1/google-calendar-oauth`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    throw await readFunctionError(response);
  }

  const body = await response.json() as { authUrl?: string };
  if (!body.authUrl) {
    throw new Error("Google Calendar 연동 URL을 만들지 못했어요.");
  }

  return body.authUrl;
}

export async function syncSupabaseGoogleCalendarEvents(calendarEventIds?: string[]) {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");
  if (!supabaseProjectUrl) throw new Error("서비스 연결 설정이 필요해요.");

  const response = await fetch(`${supabaseProjectUrl}/functions/v1/sync-google-calendar-events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ calendarEventIds }),
  });

  if (!response.ok) {
    throw await readFunctionError(response);
  }

  return response.json() as Promise<{ picked: number; created: number; failed: number }>;
}

export async function syncSupabaseTossUserKey(
  authorizationCode: string,
  referrer: "DEFAULT" | "SANDBOX",
) {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");
  if (!supabaseProjectUrl) throw new Error("서비스 연결 설정이 필요해요.");

  const response = await fetch(`${supabaseProjectUrl}/functions/v1/sync-toss-user-key`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ authorizationCode, referrer }),
  });

  if (!response.ok) {
    throw await readFunctionError(response);
  }

  const body = await response.json() as { userKey?: string };
  if (!body.userKey) {
    throw new Error("토스 userKey를 저장하지 못했어요.");
  }
  return body.userKey;
}

export async function createSupabaseFamilyInvite(invitedDisplayName?: string): Promise<string> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  await ensureCurrentFamily();
  const { data, error } = await supabase.rpc("create_family_invite", {
    target_family_id: null,
    invited_display_name: invitedDisplayName?.trim() || null,
  });

  if (error) throw error;
  return data as string;
}

export async function setSupabaseProfileDisplayName(displayName: string): Promise<void> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const normalizedName = displayName.trim();
  if (!normalizedName) return;

  const { error } = await supabase.from("profiles").upsert({
    id: session.user.id,
    display_name: normalizedName,
  });

  if (error) throw error;
}

export async function acceptSupabaseFamilyInvite(
  code: string,
  invitedDisplayName?: string,
): Promise<SupabaseFamilyData> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const { data, error } = await supabase.rpc("accept_family_invite", {
    invite_code: code,
    invite_display_name_override: invitedDisplayName?.trim() || null,
  });

  if (error) throw error;
  return loadFamilyData(data as string);
}

export async function leaveSupabaseFamily(): Promise<void> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const { error } = await supabase.rpc("leave_current_family");
  if (error) throw error;
}

export async function removeSupabaseFamilyMember(userId: string): Promise<void> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const { error } = await supabase.rpc("remove_family_member", {
    target_user_id: userId,
    target_family_id: null,
  });
  if (error) throw error;
}

export async function saveSupabaseNoticeResult(
  draft: SaveNoticeDraft,
): Promise<SupabaseFamilyData> {
  const session = await getSupabaseSession();
  if (!session || !supabase) throw new Error("Supabase 로그인이 필요해요.");

  const familyId = await ensureCurrentFamily();
  const now = new Date().toISOString();
  const { data: notice, error: noticeError } = await supabase
    .from("notices")
    .insert({
      family_id: familyId,
      uploaded_by: session.user.id,
      source_text: draft.sourceText,
      parsed_result: draft.parsedResult as ParsedNoticeResult,
      status: "confirmed",
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single<{ id: string }>();

  if (noticeError) throw withStep(noticeError, "notice_insert");

  let insertedTodos: TodoRow[] = [];
  if (draft.todos.length > 0) {
    const { data, error } = await supabase
      .from("todos")
      .insert(
        draft.todos.map((todo) => ({
          family_id: familyId,
          child_id: todo.childId,
          created_by: session.user.id,
          title: todo.title,
          description: todo.description ?? null,
          category: todo.category,
          due_date: toDateOrNull(todo.dueDate),
          due_label: toDateOrNull(todo.dueDate) ? null : todo.dueDate ?? null,
          remind_at: todo.remindAt ?? null,
          status: "pending",
          source_notice_id: notice.id,
        })),
      )
      .select("*")
      .returns<TodoRow[]>();

    if (error) throw withStep(error, "todos_insert");
    insertedTodos = data ?? [];
  }

  let insertedCalendarEvents: CalendarEventRow[] = [];
  if (draft.calendarEvents.length > 0) {
    const calendarEventPayloads = draft.calendarEvents.map((event) => ({
      family_id: familyId,
      child_id: event.childId || null,
      created_by: session.user.id,
      title: event.title,
      description: event.description ?? null,
      event_date: toDateOrNull(event.date) ?? new Date().toISOString().slice(0, 10),
      start_time: toTimeOrNull(event.startTime),
      end_time: toTimeOrNull(event.endTime),
      location: event.location ?? null,
      reminder_at: event.reminderAt ?? null,
      source_notice_id: notice.id,
      status: "pending",
    }));
    const legacyCalendarEventPayloads = calendarEventPayloads.map((payload) => ({
      family_id: payload.family_id,
      child_id: payload.child_id,
      created_by: payload.created_by,
      title: payload.title,
      event_date: payload.event_date,
      start_time: payload.start_time,
      status: payload.status,
    }));

    const fullResult = await supabase
      .from("calendar_events")
      .insert(
        calendarEventPayloads.map((payload, index) => {
          const event = draft.calendarEvents[index];
          return {
            ...payload,
            confidence: event.confidence ?? null,
            needs_user_confirmation: event.needsUserConfirmation ?? false,
            reason: event.reason ?? null,
          };
        }),
      )
      .select("*")
      .returns<CalendarEventRow[]>();

    if (fullResult.error) {
      if (!isLegacyCalendarEventSchemaError(fullResult.error)) {
        throw withStep(fullResult.error, "calendar_events_insert");
      }

      const legacyResult = await supabase
        .from("calendar_events")
        .insert(legacyCalendarEventPayloads)
        .select("*")
        .returns<CalendarEventRow[]>();

      if (legacyResult.error) throw withStep(legacyResult.error, "calendar_events_insert_legacy");
      insertedCalendarEvents = legacyResult.data ?? [];
    } else {
      insertedCalendarEvents = fullResult.data ?? [];
    }
  }

  try {
    return await loadFamilyData(familyId);
  } catch {
    const [familyResult, membersResult, childrenResult] = await Promise.all([
      supabase
        .from("families")
        .select("*")
        .eq("id", familyId)
        .maybeSingle<FamilyRow>(),
      supabase
        .from("family_members")
        .select("*")
        .eq("family_id", familyId)
        .order("joined_at", { ascending: true })
        .returns<FamilyMemberRow[]>(),
      supabase
        .from("children")
        .select("*")
        .eq("family_id", familyId)
        .order("created_at", { ascending: true })
        .returns<ChildRow[]>(),
    ]);

    return {
      family: familyResult.data
        ? familyRowToFamily(familyResult.data)
        : {
            id: familyId,
            name: "알림장쏙 가족",
            ownerId: session.user.id,
            createdAt: now,
            updatedAt: now,
          },
      familyMembers: (membersResult.data ?? []).map(familyMemberRowToRecord),
      children: (childrenResult.data ?? []).map(childRowToProfile),
      todos: insertedTodos.map(todoRowToRecord),
      calendarEvents: insertedCalendarEvents.map(calendarEventRowToRecord),
    };
  }
}

function withStep(error: unknown, step: string) {
  if (error && typeof error === "object") {
    return {
      ...(error as Record<string, unknown>),
      step,
    };
  }

  return {
    message: String(error),
    step,
  };
}

async function ensureProfile(user: User, identity?: AppsInTossIdentity) {
  if (!supabase) return;

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    display_name: user.user_metadata.name ?? user.email ?? null,
    toss_user_hash:
      identity?.userHash ??
      (typeof user.user_metadata.toss_user_hash === "string"
        ? user.user_metadata.toss_user_hash
        : null),
    toss_user_key:
      typeof user.user_metadata.toss_user_key === "string"
        ? user.user_metadata.toss_user_key
        : null,
  });

  if (error) throw error;
}

async function ensureCurrentFamily(): Promise<string> {
  if (!supabase) throw new Error("서비스 연결 설정이 필요해요.");

  const current = await getSupabaseFamilyData();
  if (current) return current.family.id;

  const { data, error } = await supabase.rpc("create_family_for_current_user", {
    family_name: "알림장쏙 가족",
  });

  if (error) throw error;
  return data as string;
}

async function loadFamilyData(familyId: string): Promise<SupabaseFamilyData> {
  if (!supabase) throw new Error("서비스 연결 설정이 필요해요.");

  const [familyResult, membersResult, childrenResult, todosResult, eventsResult] = await Promise.all([
    supabase
      .from("families")
      .select("*")
      .eq("id", familyId)
      .single<FamilyRow>(),
    supabase
      .from("family_members")
      .select("*")
      .eq("family_id", familyId)
      .order("joined_at", { ascending: true })
      .returns<FamilyMemberRow[]>(),
    supabase
      .from("children")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true })
      .returns<ChildRow[]>(),
    supabase
      .from("todos")
      .select("*")
      .eq("family_id", familyId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .returns<TodoRow[]>(),
    supabase
      .from("calendar_events")
      .select("*")
      .eq("family_id", familyId)
      .neq("status", "deleted")
      .order("event_date", { ascending: true })
      .returns<CalendarEventRow[]>(),
  ]);

  if (familyResult.error) throw familyResult.error;
  if (membersResult.error) throw membersResult.error;
  if (childrenResult.error) throw childrenResult.error;
  if (todosResult.error) throw todosResult.error;
  if (eventsResult.error) throw eventsResult.error;

  return {
    family: familyRowToFamily(familyResult.data),
    familyMembers: membersResult.data.map(familyMemberRowToRecord),
    children: childrenResult.data.map(childRowToProfile),
    todos: todosResult.data.map(todoRowToRecord),
    calendarEvents: eventsResult.data.map(calendarEventRowToRecord),
  };
}

function familyMemberRowToRecord(row: FamilyMemberRow): FamilyMember {
  return {
    userId: row.user_id,
    role: row.role,
    displayName: row.display_name ?? undefined,
    joinedAt: row.joined_at,
  };
}

function familyRowToFamily(row: FamilyRow): Family {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function childRowToProfile(row: ChildRow): ChildProfile {
  return {
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    avatarId: row.avatar_id,
    schoolName: row.school_name ?? undefined,
    grade: row.grade ?? undefined,
    className: row.class_name ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function todoRowToRecord(row: TodoRow): TodoRecord {
  return {
    id: row.id,
    familyId: row.family_id,
    childId: row.child_id,
    createdBy: row.created_by,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category,
    dueDate: row.due_label ?? row.due_date ?? undefined,
    remindAt: row.remind_at ?? undefined,
    status: row.status,
    sourceNoticeId: row.source_notice_id ?? undefined,
    completedBy: row.completed_by ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function calendarEventRowToRecord(row: CalendarEventRow): CalendarEventRecord {
  return {
    id: row.id,
    familyId: row.family_id,
    childId: row.child_id ?? undefined,
    createdBy: row.created_by,
    title: row.title,
    description: row.description ?? undefined,
    date: row.event_date,
    startTime: row.start_time ?? undefined,
    endTime: row.end_time ?? undefined,
    location: row.location ?? undefined,
    reminderAt: row.reminder_at ?? undefined,
    confidence: row.confidence ?? undefined,
    needsUserConfirmation: row.needs_user_confirmation ?? undefined,
    reason: row.reason ?? undefined,
    googleEventId: row.google_event_id ?? undefined,
    googleCalendarId: row.google_calendar_id ?? undefined,
    sourceNoticeId: row.source_notice_id ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function notificationPreferencesRowToRecord(
  row: NotificationPreferencesRow,
  tossUserKey?: string | null,
): NotificationPreferences {
  return {
    userId: row.user_id,
    familyId: row.family_id,
    enabled: row.enabled,
    preparationDay: row.preparation_day,
    preparationTime: normalizeTimeForClient(row.preparation_time),
    morningTime: normalizeTimeForClient(row.morning_time),
    scheduleEnabled: row.schedule_enabled ?? false,
    scheduleDay: row.schedule_day ?? "before",
    scheduleTime: normalizeTimeForClient(row.schedule_time ?? "18:30:00"),
    templateSetCode: row.template_set_code ?? undefined,
    tossUserKey: tossUserKey ?? undefined,
    consentStatus: row.consent_status ?? "unknown",
    consentLastPromptedAt: row.consent_last_prompted_at ?? undefined,
    consentAcceptedAt: row.consent_accepted_at ?? undefined,
    consentDeclinedAt: row.consent_declined_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isLegacyNotificationPreferencesSchemaError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("notification_preferences") &&
    (
      message.includes("consent_status") ||
      message.includes("schedule_enabled") ||
      message.includes("schedule_day") ||
      message.includes("schedule_time") ||
      message.includes("consent_last_prompted_at") ||
      message.includes("consent_accepted_at") ||
      message.includes("consent_declined_at")
    )
  );
}

function isLegacyCalendarEventSchemaError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("calendar_events") &&
    (
      message.includes("could not find") ||
      message.includes("description") ||
      message.includes("confidence") ||
      message.includes("needs_user_confirmation") ||
      message.includes("reason") ||
      message.includes("end_time") ||
      message.includes("location") ||
      message.includes("reminder_at") ||
      message.includes("source_notice_id")
    )
  );
}

function toDateOrNull(value?: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
}

function toTimeOrNull(value?: string): string | null {
  if (!value) return null;
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value;
  return null;
}

function normalizeTimeForDb(value: string) {
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
}

function normalizeTimeForClient(value: string) {
  return value.slice(0, 5);
}

class SupabaseFunctionError extends Error {
  code?: string;
  debugMessage?: string;
  debugName?: string;

  constructor(message: string, payload?: { code?: string; debugMessage?: string; debugName?: string }) {
    super(message);
    this.name = "SupabaseFunctionError";
    this.code = payload?.code;
    this.debugMessage = payload?.debugMessage;
    this.debugName = payload?.debugName;
  }
}

async function readFunctionError(response: Response) {
  try {
    const body = await response.json() as {
      code?: string;
      debugMessage?: string;
      debugName?: string;
      message?: string;
    };
    return new SupabaseFunctionError(body.message ?? "요청 처리에 실패했어요.", body);
  } catch {
    return new SupabaseFunctionError("요청 처리에 실패했어요.");
  }
}
