import {
  appLogin,
  closeView,
  loadFullScreenAd,
  requestNotificationAgreement,
  setIosSwipeGestureEnabled,
  showFullScreenAd,
  TossAds,
  type NotificationAgreementResult,
} from "@apps-in-toss/web-framework";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";

import "./App.css";
import {
  confirmNotice,
  createChild,
  getCurrentFamily,
  updateTodoStatus,
} from "./services/backendApi";
import {
  analyzeNoticeImage,
  isNoticeAnalyzeConfigured,
  type ParsedNoticeResult,
} from "./services/noticeAnalysis";
import { fetchBugEventLogs, trackBugEvent, type BugEventInput, type BugEventLog } from "./services/bugTracking";
import { convertPdfFilesToImages } from "./services/pdfUpload";
import { optimizeUploadImages } from "./services/uploadImage";
import { createFamilyInviteMessage, shareFamilyInvite } from "./services/familyInviteShare";
import { isSupabaseConfigured } from "./services/supabaseClient";
import {
  acceptSupabaseFamilyInvite,
  archiveSupabaseCalendarEvent,
  archiveSupabaseTodo,
  connectAppsInTossUser,
  createSupabaseFamilyInvite,
  createSupabaseChild,
  createSupabaseCalendarEvent,
  createSupabaseTodo,
  deleteSupabaseChild,
  getSupabaseFamilyData,
  getSupabaseNotificationPreferences,
  getSupabaseSession,
  getSupabaseTossUserKey,
  removeSupabaseFamilyMember,
  saveSupabaseNoticeResult,
  saveSupabaseNotificationPreferences,
  setSupabaseProfileDisplayName,
  subscribeSupabaseAuth,
  syncSupabaseTossUserKey,
  type SupabaseFamilyData,
  updateSupabaseChild,
  updateSupabaseTodo,
  updateSupabaseTodoStatus,
} from "./services/supabaseRepository";
import type {
  CalendarEventRecord,
  ChildProfile,
  FamilyMember,
  NotificationConsentStatus,
  NotificationPreferences,
  ParsedNoticeResult as BackendParsedNoticeResult,
  TodoCategory,
  TodoRecord,
} from "./types/domain";

type Screen =
  | "onboarding"
  | "onboarding-tips"
  | "first-child"
  | "home"
  | "upload"
  | "analyzing"
  | "result"
  | "todo"
  | "children"
  | "add-child"
  | "edit-child"
  | "settings"
  | "notifications"
  | "bug-events";

let hasInitializedTossAds = false;
let tossAdsInitializePromise: Promise<void> | null = null;
const APPS_IN_TOSS_NOTIFICATION_AGREEMENT_TEMPLATE_CODE = "kidsnoti-today-pending-items-v2";
const APPS_IN_TOSS_NOTIFICATION_AGREEMENT_CONFIRMED_AT_KEY =
  "alimjangssok.notifications.appsInTossAgreementConfirmedAt";

function canUseTossAds() {
  try {
    return TossAds.initialize.isSupported() && TossAds.attachBanner.isSupported();
  } catch {
    return false;
  }
}

function initializeTossAds() {
  if (hasInitializedTossAds) {
    return Promise.resolve();
  }

  if (tossAdsInitializePromise) {
    return tossAdsInitializePromise;
  }

  tossAdsInitializePromise = new Promise<void>((resolve, reject) => {
    try {
      TossAds.initialize({
        callbacks: {
          onInitialized: () => {
            hasInitializedTossAds = true;
            resolve();
          },
          onInitializationFailed: (error) => {
            tossAdsInitializePromise = null;
            reject(error);
          },
        },
      });
    } catch (error) {
      tossAdsInitializePromise = null;
      reject(error);
    }
  });

  return tossAdsInitializePromise;
}

function canUseFullScreenAd() {
  try {
    return loadFullScreenAd.isSupported() && showFullScreenAd.isSupported();
  } catch {
    return false;
  }
}

function requestAppsInTossNotificationAgreement(): Promise<NotificationAgreementResult | "local-dev-skipped"> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      resolve("local-dev-skipped");
      return;
    }

    let cleanup: (() => void) | null = null;
    const finish = (callback: () => void) => {
      try {
        cleanup?.();
      } catch {
        // 앱 브릿지 콜백 해제 실패는 동의 플로우 결과에 영향을 주지 않습니다.
      } finally {
        cleanup = null;
      }
      callback();
    };

    try {
      cleanup = requestNotificationAgreement({
        options: {
          templateCode: APPS_IN_TOSS_NOTIFICATION_AGREEMENT_TEMPLATE_CODE,
        },
        onEvent: (result) => {
          finish(() => resolve(result.type));
        },
        onError: (error) => {
          finish(() => reject(error));
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("ReactNativeWebView") ||
        message.includes("browser environment") ||
        message.includes("not supported") ||
        message.includes("is not a function")
      ) {
        resolve("local-dev-skipped");
        return;
      }
      reject(error);
    }
  });
}

function hasConfirmedAppsInTossNotificationAgreement() {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(APPS_IN_TOSS_NOTIFICATION_AGREEMENT_CONFIRMED_AT_KEY));
}

function markAppsInTossNotificationAgreementConfirmed(confirmedAt: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APPS_IN_TOSS_NOTIFICATION_AGREEMENT_CONFIRMED_AT_KEY, confirmedAt);
}

function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) {
  let timeoutId: number | undefined;

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  });
}

interface Child {
  id: string;
  name: string;
  school?: string;
  grade?: string;
  className?: string;
  avatar: string;
  calendarName?: string;
}

interface TodoItem {
  id: string;
  childId: string;
  childName: string;
  title: string;
  category: string;
  dueDate: string;
  detail?: string;
  completed: boolean;
}

interface CalendarEventItem {
  id: string;
  childId: string;
  childName: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  location?: string;
  reminderAt?: string;
  confidence?: number;
  needsUserConfirmation?: boolean;
  reason?: string;
}

interface SelectedUploadImage {
  id: string;
  file: File;
  previewUrl: string;
}

const OPERATOR_USER_IDS = new Set(
  String(import.meta.env.VITE_OPERATOR_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

interface AppBugContext {
  screen: Screen;
  childCount: number;
  todoCount: number;
  calendarEventCount: number;
  selectedFileCount: number;
}

interface ErrorDialogState {
  message: string;
  code?: string;
  description?: string;
}

interface PendingFamilyInvite {
  code: string;
  displayName?: string;
  existingChildrenCount: number;
  existingTodoCount: number;
  existingEventCount: number;
}

const MAX_UPLOAD_FILES = 3;
const NOTIFICATION_PROMPT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
const CHILD_REQUIRED_SCREENS = new Set<Screen>([
  "home",
  "upload",
  "analyzing",
  "result",
  "todo",
  "children",
  "add-child",
  "edit-child",
  "settings",
  "notifications",
  "bug-events",
]);

interface LocalNotificationPreferenceState {
  enabled: boolean;
  preparationDay: "before" | "same-day";
  preparationTime: string;
  morningTime: string;
  scheduleEnabled: boolean;
  scheduleDay: "before" | "same-day";
  scheduleTime: string;
  consentStatus: NotificationConsentStatus;
  consentLastPromptedAt?: string;
  consentAcceptedAt?: string;
  consentDeclinedAt?: string;
}

type NotificationConsentPromptSource = "post-save" | "settings-toggle";

interface AppHistoryState {
  __alimjangssok: true;
  kind: "sentinel" | "screen";
  screen?: Screen;
  index?: number;
}

interface CuteIconProps {
  size?: number;
}

interface AvatarOption {
  id: string;
  label: string;
  src: string;
}

function AssetIcon({
  src,
  size = 24,
  className = "",
}: CuteIconProps & {
  src: string;
  className?: string;
}) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`kids-icon asset-icon ${className}`.trim()}
      height={size}
      src={src}
      width={size}
    />
  );
}

function SettingsTabIcon({ size = 24 }: CuteIconProps) {
  return <AssetIcon src="/icons/settings.svg" size={size} />;
}

function NoticePhotoIcon({ size = 24 }: CuteIconProps) {
  return (
    <svg aria-hidden="true" className="kids-icon" height={size} viewBox="0 0 24 24" width={size}>
      <rect
        fill="none"
        height="15.5"
        rx="3.2"
        stroke="currentColor"
        strokeWidth="2"
        width="15.5"
        x="4.25"
        y="4.25"
      />
      <path
        d="m7.5 16.5 3.2-3.5 2.4 2.5 1.7-1.9 1.9 2.9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <circle cx="15.2" cy="8.8" fill="currentColor" r="1.2" />
    </svg>
  );
}

function CalendarCuteIcon({ size = 24 }: CuteIconProps) {
  return <AssetIcon src="/icons/calendar.svg" size={size} />;
}

function KidAvatar({
  avatarId,
  size = 72,
}: {
  avatarId: string;
  size?: number;
}) {
  const avatar = characterOptions.find((option) => option.id === avatarId) ?? characterOptions[0];

  return (
    <img
      alt=""
      aria-hidden="true"
      className="kid-avatar-image"
      height={size}
      src={avatar.src}
      width={size}
    />
  );
}

const initialChildren: Child[] = [];

const initialTodos: TodoItem[] = [];

const initialEvents: CalendarEventItem[] = [];

const APP_STATE_STORAGE_KEY = "alimjang-ssok-app-state-v1";
const ONBOARDING_GUIDE_DISMISSED_KEY = "alimjangssok.onboardingGuideDismissed";
const ANALYZE_TIMEOUT_MS = 180000;
const ANALYSIS_FULL_SCREEN_AD_ID = "ait.v2.live.31cd218812e44ce0";
const FULL_SCREEN_AD_LOAD_TIMEOUT_MS = 8000;
const FULL_SCREEN_AD_SHOW_TIMEOUT_MS = 20000;
const HOME_SHORTCUT_PROMPT_PENDING_KEY = "alimjangssok.home-shortcut.prompt-pending";
const HOME_SHORTCUT_PROMPT_SEEN_KEY = "alimjangssok.home-shortcut.prompt-seen";
const HOME_SHORTCUT_PROMPT_DISMISSED_KEY = "alimjangssok.home-shortcut.prompt-dismissed";
const NAVIGATION_STACK_STORAGE_KEY = "alimjangssok.navigation.stack";

interface PersistedAppState {
  children: Child[];
  todos: TodoItem[];
  calendarEvents: CalendarEventItem[];
  onboardingCompleted: boolean;
}

const ALL_SCREENS: Screen[] = [
  "onboarding",
  "onboarding-tips",
  "first-child",
  "home",
  "upload",
  "analyzing",
  "result",
  "todo",
  "children",
  "add-child",
  "edit-child",
  "settings",
  "notifications",
  "bug-events",
];

const SCREEN_SET = new Set<Screen>(ALL_SCREENS);

const characterOptions: AvatarOption[] = [
  { id: "baby-boy", label: "0~1세 남아", src: "/avatars/baby-boy.png" },
  { id: "baby-girl", label: "0~1세 여아", src: "/avatars/baby-girl.png" },
  { id: "age3-boy", label: "3세 남아", src: "/avatars/age3-boy.png" },
  { id: "age3-girl", label: "3세 여아", src: "/avatars/age3-girl.png" },
  { id: "age5-boy", label: "5세 남아", src: "/avatars/age5-boy.png" },
  { id: "age5-girl", label: "5세 여아", src: "/avatars/age5-girl.png" },
  { id: "age7-boy", label: "7세 남아", src: "/avatars/age7-boy.png" },
  { id: "age7-girl", label: "7세 여아", src: "/avatars/age7-girl.png" },
  { id: "age9-boy", label: "9세 남아", src: "/avatars/age9-boy.png" },
  { id: "age9-girl", label: "9세 여아", src: "/avatars/age9-girl.png" },
];

const demoFamilyMembers: FamilyMember[] = [
  {
    userId: "demo-owner",
    role: "owner",
    displayName: "엄마",
    joinedAt: new Date().toISOString(),
  },
  {
    userId: "demo-member",
    role: "member",
    displayName: "아빠",
    joinedAt: new Date().toISOString(),
  },
];

const inviteDisplayNameOptions = [
  "남편",
  "아내",
  "할머니",
  "할아버지",
] as const;

function loadPersistedAppState(): PersistedAppState {
  if (typeof window === "undefined") {
    return createEmptyPersistedState();
  }

  try {
    const rawState = window.localStorage.getItem(APP_STATE_STORAGE_KEY);
    if (!rawState) {
      return createEmptyPersistedState();
    }

    const state = JSON.parse(rawState) as Partial<PersistedAppState>;
    const children = Array.isArray(state.children) ? state.children.map(renameLegacyChild) : [];
    const childNameById = new Map(children.map((child) => [child.id, child.name]));
    const todos = Array.isArray(state.todos)
      ? state.todos
          .map((todo) => ({
            ...todo,
            childName: childNameById.get(todo.childId) ?? renameLegacyName(todo.childName),
          }))
          .filter((todo) => !isGeneratedStarterTodo(todo))
      : [];
    const calendarEvents = Array.isArray(state.calendarEvents)
      ? state.calendarEvents
          .map((event) => ({
            ...event,
            childName: childNameById.get(event.childId) ?? renameLegacyName(event.childName),
          }))
          .filter((event) => !isGeneratedStarterEvent(event))
      : [];

    return {
      children,
      todos,
      calendarEvents,
      onboardingCompleted: Boolean(state.onboardingCompleted),
    };
  } catch {
    return createEmptyPersistedState();
  }
}

function renameLegacyName(name: string) {
  return name === "민준" ? "안유이" : name;
}

function isScreenValue(value: unknown): value is Screen {
  return typeof value === "string" && SCREEN_SET.has(value as Screen);
}

function loadPersistedNavigationStack(): Screen[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.sessionStorage.getItem(NAVIGATION_STACK_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isScreenValue);
  } catch {
    return [];
  }
}

function persistNavigationStack(stack: Screen[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(NAVIGATION_STACK_STORAGE_KEY, JSON.stringify(stack));
}

function getInitialScreenFromSession(): Screen | null {
  const stack = loadPersistedNavigationStack();
  return stack.at(-1) ?? null;
}

function renameLegacyChild(child: Child): Child {
  return {
    ...child,
    name: renameLegacyName(child.name),
  };
}

function isGeneratedStarterTodo(todo: Pick<TodoItem, "id" | "title" | "detail">) {
  const starterTodoIdPattern = /^todo-.+-(1|2)$/;
  const starterTodoTitles = new Set([
    "알림장 사진을 첨부해 준비물 찾기",
    "체험학습 동의서 확인",
  ]);

  return (
    todo.id === "todo-demo-1" ||
    (starterTodoIdPattern.test(todo.id) && starterTodoTitles.has(todo.title)) ||
    todo.detail === "가운데 첨부하기 버튼을 눌러 첫 알림장을 분석해보세요."
  );
}

function isGeneratedStarterEvent(event: Pick<CalendarEventItem, "id" | "title" | "date" | "time">) {
  return (
    event.id === "event-demo-1" ||
    (/^event-.+-1$/.test(event.id) &&
      event.title === "학부모 상담" &&
      event.date === "5월 15일" &&
      event.time === "오후 2시")
  );
}

function shouldShowHomeShortcutPrompt() {
  return (
    window.localStorage.getItem(HOME_SHORTCUT_PROMPT_PENDING_KEY) === "true" &&
    window.localStorage.getItem(HOME_SHORTCUT_PROMPT_SEEN_KEY) !== "true" &&
    window.localStorage.getItem(HOME_SHORTCUT_PROMPT_DISMISSED_KEY) !== "true"
  );
}

function markHomeShortcutPromptPending() {
  if (window.localStorage.getItem(HOME_SHORTCUT_PROMPT_SEEN_KEY) === "true") return;
  if (window.localStorage.getItem(HOME_SHORTCUT_PROMPT_DISMISSED_KEY) === "true") return;
  window.localStorage.setItem(HOME_SHORTCUT_PROMPT_PENDING_KEY, "true");
}

function createEmptyPersistedState(): PersistedAppState {
  return {
    children: initialChildren,
    todos: initialTodos,
    calendarEvents: initialEvents,
    onboardingCompleted: false,
  };
}

function childProfileToChild(child: ChildProfile): Child {
  return {
    id: child.id,
    name: renameLegacyName(child.name),
    school: child.schoolName,
    grade: child.grade,
    className: child.className,
    avatar: child.avatarId || characterOptions[0].id,
    calendarName: "primary",
  };
}

function todoRecordToTodoItem(todo: TodoRecord, childNameById: Map<string, string>): TodoItem {
  return {
    id: todo.id,
    childId: todo.childId,
    childName: childNameById.get(todo.childId) ?? "아이",
    title: todo.title,
    category: todoCategoryLabel(todo.category),
    dueDate: todo.dueDate ?? "날짜 미정",
    detail: todo.description,
    completed: todo.status === "done",
  };
}

function calendarEventRecordToItem(
  event: CalendarEventRecord,
  childNameById: Map<string, string>,
): CalendarEventItem {
  const childId = event.childId ?? "";
  return {
    id: event.id,
    childId,
    childName: childNameById.get(childId) ?? "아이",
    title: event.title,
    description: event.description,
    date: event.date,
    time: event.startTime ?? "시간 미정",
    location: event.location,
    reminderAt: event.reminderAt,
    confidence: event.confidence,
    needsUserConfirmation: event.needsUserConfirmation,
    reason: event.reason,
  };
}

function applyFamilyResponse({
  responseFamilyMembers,
  responseChildren,
  responseTodos,
  responseCalendarEvents,
  setFamilyMembers,
  setChildren,
  setTodos,
  setCalendarEvents,
}: {
  responseFamilyMembers?: FamilyMember[];
  responseChildren: ChildProfile[];
  responseTodos: TodoRecord[];
  responseCalendarEvents: CalendarEventRecord[];
  setFamilyMembers?: React.Dispatch<React.SetStateAction<FamilyMember[]>>;
  setChildren: React.Dispatch<React.SetStateAction<Child[]>>;
  setTodos: React.Dispatch<React.SetStateAction<TodoItem[]>>;
  setCalendarEvents: React.Dispatch<React.SetStateAction<CalendarEventItem[]>>;
}) {
  const nextChildren = responseChildren.map(childProfileToChild);
  const childNameById = new Map(nextChildren.map((child) => [child.id, child.name]));

  setChildren(nextChildren);
  if (responseFamilyMembers && setFamilyMembers) {
    setFamilyMembers(responseFamilyMembers);
  }
  setTodos(
    responseTodos
      .map((todo) => todoRecordToTodoItem(todo, childNameById))
      .filter((todo) => !isGeneratedStarterTodo(todo)),
  );
  setCalendarEvents(
    responseCalendarEvents
      .map((event) => calendarEventRecordToItem(event, childNameById))
      .filter((event) => !isGeneratedStarterEvent(event)),
  );
}

function createTodoIdentity(todo: Pick<TodoItem, "childId" | "title" | "category" | "dueDate" | "detail">) {
  return [
    todo.childId,
    todo.title.trim().toLowerCase(),
    todo.category,
    todo.dueDate,
    (todo.detail ?? "").trim().toLowerCase(),
  ].join("::");
}

function mergeTodoItems(primary: TodoItem[], fallback: TodoItem[]) {
  const merged = [...primary];
  const seenIds = new Set(primary.map((item) => item.id));
  const seenIdentities = new Set(primary.map(createTodoIdentity));

  for (const item of fallback) {
    if (seenIds.has(item.id)) continue;
    if (seenIdentities.has(createTodoIdentity(item))) continue;
    merged.push(item);
  }

  return merged;
}

function createCalendarEventIdentity(
  event: Pick<CalendarEventItem, "childId" | "title" | "date" | "time" | "location">,
) {
  return [
    event.childId,
    event.title.trim().toLowerCase(),
    event.date,
    event.time,
    (event.location ?? "").trim().toLowerCase(),
  ].join("::");
}

function mergeCalendarEventItems(primary: CalendarEventItem[], fallback: CalendarEventItem[]) {
  const merged = [...primary];
  const seenIds = new Set(primary.map((item) => item.id));
  const seenIdentities = new Set(primary.map(createCalendarEventIdentity));

  for (const item of fallback) {
    if (seenIds.has(item.id)) continue;
    if (seenIdentities.has(createCalendarEventIdentity(item))) continue;
    merged.push(item);
  }

  return merged;
}

function getInviteCodeFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") ?? params.get("invite");
  if (code) return code;

  if (window.location.pathname.startsWith("/invite")) {
    return params.get("code");
  }

  return null;
}

function getInviteDisplayNameFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const inviteDisplayName = params.get("name");
  return inviteDisplayName?.trim() ? inviteDisplayName.trim() : null;
}

function clearInviteCodeFromLocation() {
  if (!window.location.pathname.startsWith("/invite") && !window.location.search.includes("code=")) {
    return;
  }

  window.history.replaceState({}, "", window.location.origin);
}

function isDemoModeRequested() {
  const params = new URLSearchParams(window.location.search);
  return params.get("demo") === "1";
}

function isFirstVisitPreviewRequested() {
  const params = new URLSearchParams(window.location.search);
  return params.get("firstVisit") === "1";
}

function isOnboardingGuideDismissed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDING_GUIDE_DISMISSED_KEY) === "true";
}

function dismissOnboardingGuide() {
  window.localStorage.setItem(ONBOARDING_GUIDE_DISMISSED_KEY, "true");
}

function todoCategoryLabel(category: TodoCategory | string): string {
  const labels: Record<TodoCategory, string> = {
    preparation: "준비물",
    homework: "숙제",
    submission: "제출물",
    parent_check: "학부모 확인",
    payment: "납부",
    other: "기타",
  };

  return labels[category as TodoCategory] ?? category;
}

function todoCategoryValue(category: string): TodoCategory {
  const values: Record<string, TodoCategory> = {
    준비물: "preparation",
    숙제: "homework",
    제출물: "submission",
    "학부모 확인": "parent_check",
    납부: "payment",
    payment: "payment",
    preparation: "preparation",
    homework: "homework",
    submission: "submission",
    parent_check: "parent_check",
    other: "other",
  };

  return values[category] ?? "other";
}

function getNotificationSettings() {
  const enabled = window.localStorage.getItem("alimjangssok.notifications.enabled") !== "false";
  const preparationDay =
    window.localStorage.getItem("alimjangssok.notifications.preparationDay") ?? "before";
  const preparationTime =
    window.localStorage.getItem("alimjangssok.notifications.preparationTime") ?? "20:00";

  return {
    enabled,
    preparationDay,
    preparationTime,
  };
}

function calculateTodoReminderAt(dueDate?: string) {
  const settings = getNotificationSettings();
  if (!settings.enabled || !dueDate) return undefined;

  const due = parseTodoDueDate(dueDate);
  if (!due) return undefined;

  const [hourText, minuteText] = settings.preparationTime.split(":");
  const reminderDate = new Date(due);
  if (settings.preparationDay === "before") {
    reminderDate.setDate(reminderDate.getDate() - 1);
  }
  reminderDate.setHours(Number(hourText) || 20, Number(minuteText) || 0, 0, 0);

  return reminderDate.toISOString();
}

function parseTodoDueDate(dueDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dueDate === "오늘") return today;
  if (dueDate === "내일") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    const parsed = new Date(`${dueDate}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isUuid(value: string | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

function serializeErrorForLog(error: unknown) {
  if (error instanceof Error) {
    const record = error as Error & {
      code?: unknown;
      debugMessage?: unknown;
      debugName?: unknown;
    };
    return {
      code: record.code,
      debugMessage: record.debugMessage,
      debugName: record.debugName,
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      code: record.code,
      details: record.details,
      hint: record.hint,
      message: record.message,
      name: record.name,
      status: record.status,
    };
  }

  return { message: String(error) };
}

function getUserFacingServiceErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  const lowerMessage = message.toLowerCase();
  const isInternalConfigurationError =
    message.includes("Supabase 설정") ||
    message.includes("Supabase 로그인이") ||
    message.includes("서비스 연결 설정") ||
    message.includes("ReactNativeWebView") ||
    message.includes("browser environment") ||
    message.includes("CertificateRequired") ||
    message.includes("SendRequest") ||
    message.includes("generate-token") ||
    message.includes("apps-in-toss-api") ||
    message.includes("토스 로그인 API 인증") ||
    message.includes("invalid_grant") ||
    message.includes("authorization_code") ||
    message.includes("clientId") ||
    lowerMessage.includes("supabase") ||
    lowerMessage.includes("failed to fetch") ||
    lowerMessage.includes("client error") ||
    lowerMessage.includes("connection error") ||
    lowerMessage.includes("fetch");

  if (isInternalConfigurationError) {
    return fallback;
  }

  return message || fallback;
}

type TodoDateBucket = "past" | "today" | "tomorrow" | "week" | "unscheduled" | "later";

function getTodoDateBucket(dueDate: string): TodoDateBucket {
  if (dueDate === "오늘") return "today";
  if (dueDate === "내일") return "tomorrow";
  if (dueDate === "이번 주") return "week";
  if (dueDate === "날짜 미정") return "unscheduled";

  const parsedDate = parseTodoDueDate(dueDate);
  if (!parsedDate) return "unscheduled";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  if (getLocalDateKey(parsedDate) === getLocalDateKey(today)) return "today";
  if (getLocalDateKey(parsedDate) === getLocalDateKey(tomorrow)) return "tomorrow";
  if (parsedDate < today) return "past";
  if (parsedDate > tomorrow && parsedDate <= weekEnd) return "week";

  return "later";
}

function displayTodoDueDate(dueDate: string) {
  const bucket = getTodoDateBucket(dueDate);
  if (bucket === "today") return "오늘";
  if (bucket === "tomorrow") return "내일";
  if (dueDate === "이번 주" || dueDate === "날짜 미정") return dueDate;

  const parsedDate = parseTodoDueDate(dueDate);
  if (!parsedDate) return dueDate;

  return `${parsedDate.getMonth() + 1}월 ${parsedDate.getDate()}일`;
}

function normalizeActionTodoDueDate(todo: Pick<TodoItem, "category" | "dueDate" | "detail" | "title">) {
  const dueDate = todo.dueDate;
  if (dueDate !== "오늘" && dueDate !== getLocalDateKey(new Date())) return dueDate;

  const text = `${todo.title} ${todo.detail ?? ""}`;
  const looksLikeParentGuidance =
    todo.category === "학부모 확인" || /(지도|확인|주의|사용법|가정에서)/.test(text);
  const hasExplicitDeadline = /(까지|마감|제출|신청|준비|보내|가져|지참|생일|행사|체험|상담)/.test(text);

  return looksLikeParentGuidance && !hasExplicitDeadline ? "날짜 미정" : dueDate;
}

function toBackendParsedNoticeResult(result: ParsedNoticeResult): BackendParsedNoticeResult {
  return {
    noticeId: result.noticeId,
    sourceText: result.sourceText,
    calendarEvents: result.calendarEvents.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      childId: event.childId || undefined,
      childName: event.childName || undefined,
      date: event.date,
      startTime: event.time,
      location: event.location,
      reminderAt: event.reminderAt,
      confidence: event.confidence,
      needsUserConfirmation: event.needsUserConfirmation,
      reason: event.reason,
    })),
    todos: result.todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      childId: todo.childId || undefined,
      childName: todo.childName || undefined,
      category: todoCategoryValue(todo.category),
      dueDate: todo.dueDate,
      description: todo.detail,
      confidence: todo.confidence,
      needsUserConfirmation: todo.needsUserConfirmation,
    })),
    infoOnlyItems: result.infoOnlyItems.map((item, index) => ({
      id: `${result.noticeId}-info-${index + 1}`,
      title: item,
      confidence: 0.5,
    })),
    warnings: result.warnings,
  };
}

function loadLocalNotificationPreferenceState(): LocalNotificationPreferenceState {
  return {
    enabled: window.localStorage.getItem("alimjangssok.notifications.enabled") === "true",
    preparationDay:
      (window.localStorage.getItem("alimjangssok.notifications.preparationDay") as "before" | "same-day" | null)
      ?? "before",
    preparationTime: window.localStorage.getItem("alimjangssok.notifications.preparationTime") ?? "20:00",
    morningTime: window.localStorage.getItem("alimjangssok.notifications.morningTime") ?? "07:30",
    scheduleEnabled: window.localStorage.getItem("alimjangssok.notifications.scheduleEnabled") === "true",
    scheduleDay:
      (window.localStorage.getItem("alimjangssok.notifications.scheduleDay") as "before" | "same-day" | null)
      ?? "before",
    scheduleTime: window.localStorage.getItem("alimjangssok.notifications.scheduleTime") ?? "18:30",
    consentStatus:
      (window.localStorage.getItem("alimjangssok.notifications.consentStatus") as NotificationConsentStatus | null)
      ?? "unknown",
    consentLastPromptedAt:
      window.localStorage.getItem("alimjangssok.notifications.consentLastPromptedAt") ?? undefined,
    consentAcceptedAt:
      window.localStorage.getItem("alimjangssok.notifications.consentAcceptedAt") ?? undefined,
    consentDeclinedAt:
      window.localStorage.getItem("alimjangssok.notifications.consentDeclinedAt") ?? undefined,
  };
}

function persistLocalNotificationPreferenceState(state: LocalNotificationPreferenceState) {
  window.localStorage.setItem("alimjangssok.notifications.enabled", String(state.enabled));
  window.localStorage.setItem("alimjangssok.notifications.preparationDay", state.preparationDay);
  window.localStorage.setItem("alimjangssok.notifications.preparationTime", state.preparationTime);
  window.localStorage.setItem("alimjangssok.notifications.morningTime", state.morningTime);
  window.localStorage.setItem("alimjangssok.notifications.scheduleEnabled", String(state.scheduleEnabled));
  window.localStorage.setItem("alimjangssok.notifications.scheduleDay", state.scheduleDay);
  window.localStorage.setItem("alimjangssok.notifications.scheduleTime", state.scheduleTime);
  window.localStorage.setItem("alimjangssok.notifications.consentStatus", state.consentStatus);

  if (state.consentLastPromptedAt) {
    window.localStorage.setItem("alimjangssok.notifications.consentLastPromptedAt", state.consentLastPromptedAt);
  } else {
    window.localStorage.removeItem("alimjangssok.notifications.consentLastPromptedAt");
  }

  if (state.consentAcceptedAt) {
    window.localStorage.setItem("alimjangssok.notifications.consentAcceptedAt", state.consentAcceptedAt);
  } else {
    window.localStorage.removeItem("alimjangssok.notifications.consentAcceptedAt");
  }

  if (state.consentDeclinedAt) {
    window.localStorage.setItem("alimjangssok.notifications.consentDeclinedAt", state.consentDeclinedAt);
  } else {
    window.localStorage.removeItem("alimjangssok.notifications.consentDeclinedAt");
  }
}

function notificationPreferencesToLocalState(preferences: NotificationPreferences): LocalNotificationPreferenceState {
  return {
    enabled: preferences.enabled,
    preparationDay: preferences.preparationDay,
    preparationTime: preferences.preparationTime,
    morningTime: preferences.morningTime,
    scheduleEnabled: preferences.scheduleEnabled,
    scheduleDay: preferences.scheduleDay,
    scheduleTime: preferences.scheduleTime,
    consentStatus: preferences.consentStatus,
    consentLastPromptedAt: preferences.consentLastPromptedAt,
    consentAcceptedAt: preferences.consentAcceptedAt,
    consentDeclinedAt: preferences.consentDeclinedAt,
  };
}

function shouldPromptForNotificationConsent(
  preferences: Pick<
    LocalNotificationPreferenceState,
    "consentStatus" | "consentLastPromptedAt" | "consentDeclinedAt"
  >,
) {
  if (preferences.consentStatus === "accepted") {
    return !hasConfirmedAppsInTossNotificationAgreement();
  }

  const lastPromptedAt = preferences.consentDeclinedAt ?? preferences.consentLastPromptedAt;
  if (!lastPromptedAt) return true;

  const elapsed = Date.now() - new Date(lastPromptedAt).getTime();
  return Number.isFinite(elapsed) ? elapsed >= NOTIFICATION_PROMPT_COOLDOWN_MS : true;
}

function hasFamilyContent(familyData: SupabaseFamilyData | null) {
  return Boolean(
    familyData &&
      (familyData.children.length > 0 ||
        familyData.todos.length > 0 ||
        familyData.calendarEvents.length > 0),
  );
}

function App() {
  const [persistedState] = useState(loadPersistedAppState);
  const forceFirstVisitPreview = isFirstVisitPreviewRequested();
  const shouldShowFirstVisitFlow =
    forceFirstVisitPreview ||
    (!isOnboardingGuideDismissed() &&
      !(persistedState.onboardingCompleted && persistedState.children.length > 0));
  const initialAppState = forceFirstVisitPreview ? createEmptyPersistedState() : persistedState;
  const sessionInitialScreen = forceFirstVisitPreview ? null : getInitialScreenFromSession();
  const defaultInitialScreen =
    shouldShowFirstVisitFlow
      ? "onboarding"
      : initialAppState.onboardingCompleted && initialAppState.children.length > 0
      ? "home"
      : "first-child";
  const resolvedInitialScreen =
    sessionInitialScreen &&
    !(initialAppState.children.length === 0 && CHILD_REQUIRED_SCREENS.has(sessionInitialScreen))
      ? sessionInitialScreen
      : defaultInitialScreen;
  const [screen, setScreen] = useState<Screen>(
    resolvedInitialScreen,
  );
  const [children, setChildren] = useState<Child[]>(initialAppState.children);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(demoFamilyMembers);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>(initialAppState.todos);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>(
    initialAppState.calendarEvents,
  );
  const [selectedImages, setSelectedImages] = useState<SelectedUploadImage[]>([]);
  const [analysisResult, setAnalysisResult] = useState<ParsedNoticeResult | null>(null);
  const [analysisError, setAnalysisError] = useState<ErrorDialogState | null>(null);
  const [isSavingResult, setIsSavingResult] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [inviteFallbackState, setInviteFallbackState] = useState<{
    inviteLink: string;
    invitedDisplayName?: string;
  } | null>(null);
  const [pendingFamilyInvite, setPendingFamilyInvite] = useState<PendingFamilyInvite | null>(null);
  const [isAcceptingFamilyInvite, setIsAcceptingFamilyInvite] = useState(false);
  const [showInviteRoleSheet, setShowInviteRoleSheet] = useState(false);
  const [notificationPreferencesSnapshot, setNotificationPreferencesSnapshot] = useState<LocalNotificationPreferenceState>(
    loadLocalNotificationPreferenceState,
  );
  const [notificationConsentPromptSource, setNotificationConsentPromptSource] =
    useState<NotificationConsentPromptSource | null>(null);
  const [notificationConsentDraft, setNotificationConsentDraft] =
    useState<LocalNotificationPreferenceState>(loadLocalNotificationPreferenceState);
  const [isSubmittingNotificationConsent, setIsSubmittingNotificationConsent] = useState(false);
  const [notificationConsentMessage, setNotificationConsentMessage] = useState<string | null>(null);
  const [tossUserKey, setTossUserKey] = useState<string | null>(null);
  const [isConnectingTossLogin, setIsConnectingTossLogin] = useState(false);
  const [tossLoginStatusMessage, setTossLoginStatusMessage] = useState<string | null>(null);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const hasPersistedChildren = persistedState.children.length > 0;
  const shouldBootstrapDemoFamily =
    (!forceFirstVisitPreview && persistedState.onboardingCompleted) ||
    (!forceFirstVisitPreview && hasPersistedChildren) ||
    isDemoModeRequested();
  const childrenRef = useRef<Child[]>(initialAppState.children);
  const effectiveScreenRef = useRef<Screen>(
    children.length === 0 && CHILD_REQUIRED_SCREENS.has(screen) ? "first-child" : screen,
  );
  const hasInitializedHistoryRef = useRef(false);
  const isApplyingPopStateRef = useRef(false);
  const historyIndexRef = useRef(0);
  const navigationStackRef = useRef<Screen[]>(
    (() => {
      const persistedStack = forceFirstVisitPreview ? [] : loadPersistedNavigationStack();
      if (persistedStack.length > 0) return persistedStack;
      if (resolvedInitialScreen === "onboarding" || resolvedInitialScreen === "onboarding-tips") {
        return [resolvedInitialScreen];
      }
      if (resolvedInitialScreen === "first-child") {
        return ["first-child"];
      }
      if (resolvedInitialScreen === "home") return ["home"];
      return ["home", resolvedInitialScreen];
    })(),
  );
  const lastHistoryScreenRef = useRef<Screen>(
    children.length === 0 && CHILD_REQUIRED_SCREENS.has(screen) ? "first-child" : screen,
  );
  const bugContextRef = useRef<AppBugContext>({
    screen: shouldShowFirstVisitFlow
      ? "onboarding"
      : initialAppState.onboardingCompleted && initialAppState.children.length > 0
      ? "home"
      : "first-child",
    childCount: initialAppState.children.length,
    todoCount: initialAppState.todos.length,
    calendarEventCount: initialAppState.calendarEvents.length,
    selectedFileCount: 0,
  });
  const analysisFullScreenAdRef = useRef<{
    status: "idle" | "loading" | "loaded" | "showing";
    cleanup: (() => void) | null;
    promise: Promise<void> | null;
  }>({
    status: "idle",
    cleanup: null,
    promise: null,
  });

  const effectiveScreen =
    children.length === 0 && CHILD_REQUIRED_SCREENS.has(screen) ? "first-child" : screen;
  const showChrome = !["onboarding", "onboarding-tips", "first-child"].includes(effectiveScreen);
  const toErrorCode = (value: string) =>
    value
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase();
  const deriveErrorCode = (
    error: unknown,
    step: string,
    metadata?: Record<string, unknown>,
  ) => {
    if (typeof metadata?.errorCode === "string" && metadata.errorCode.trim()) {
      return toErrorCode(metadata.errorCode);
    }

    if (error && typeof error === "object") {
      const errorRecord = error as Record<string, unknown>;
      if (typeof errorRecord.code === "string" && errorRecord.code.trim()) {
        return toErrorCode(errorRecord.code);
      }
      if (typeof errorRecord.errorCode === "string" && errorRecord.errorCode.trim()) {
        return toErrorCode(errorRecord.errorCode);
      }
    }

    if (error instanceof Error && /^[A-Z0-9_]{4,}$/.test(error.message.trim())) {
      return toErrorCode(error.message);
    }

    return toErrorCode(step);
  };
  const trackAppEvent = useCallback((
    input: Omit<BugEventInput, "screen" | "metadata"> & {
      metadata?: Record<string, unknown>;
    },
  ) => {
    void trackBugEvent({
      ...input,
      screen: bugContextRef.current.screen,
      metadata: {
        childCount: bugContextRef.current.childCount,
        todoCount: bugContextRef.current.todoCount,
        calendarEventCount: bugContextRef.current.calendarEventCount,
        selectedFileCount: bugContextRef.current.selectedFileCount,
        ...input.metadata,
      },
    });
  }, []);

  const showProcessingError = (
    error: unknown,
    step = "app_processing",
    metadata?: Record<string, unknown>,
  ) => {
    const errorMessage = error instanceof Error ? error.message : "알 수 없는 처리 오류";
    const errorCode = deriveErrorCode(error, step, metadata);
    console.error(`알림장쏙 처리 실패: ${JSON.stringify(serializeErrorForLog(error))}`);
    trackAppEvent({
      eventType: "processing_failed",
      severity: "error",
      step,
      message: errorMessage,
      metadata: {
        errorCode,
        error: serializeErrorForLog(error),
        ...metadata,
      },
    });
    if (error instanceof Error && error.message === "ANALYZE_TIMEOUT") {
      setAnalysisError({
        message: "분석 시간이 오래 걸려서 중단했어요.",
        description: "다시 시도해주세요.",
        code: errorCode,
      });
      return;
    }

    if (step === "analyze_upload" || step.startsWith("confirm_analysis")) {
      setAnalysisError({
        message: "일시적인 문제로 처리가 실패되었어요.",
        description: errorMessage,
        code: errorCode,
      });
      return;
    }

    setAnalysisError({
      message: "일시적인 문제로 처리가 실패되었어요.",
      description: "잠시 후 다시 시도해주세요.",
      code: errorCode,
    });
  };

  const applyInviteFamilyData = useCallback((
    invitedFamily: SupabaseFamilyData,
    sessionUserId: string,
    inviteDisplayName?: string,
  ) => {
    applyFamilyResponse({
      responseFamilyMembers: inviteDisplayName
        ? invitedFamily.familyMembers.map((member) =>
            member.userId === sessionUserId
              ? { ...member, displayName: inviteDisplayName }
              : member,
          )
        : invitedFamily.familyMembers,
      responseChildren: invitedFamily.children,
      responseTodos: invitedFamily.todos,
      responseCalendarEvents: invitedFamily.calendarEvents,
      setFamilyMembers,
      setChildren,
      setTodos,
      setCalendarEvents,
    });
    setScreen(invitedFamily.children.length > 0 ? "home" : "first-child");
  }, []);

  const acceptFamilyInvite = useCallback(async (inviteCode: string, inviteDisplayName?: string) => {
    const session = await getSupabaseSession();
    if (!session) throw new Error("Supabase 로그인이 필요해요.");

    if (inviteDisplayName) {
      await setSupabaseProfileDisplayName(inviteDisplayName);
    }

    const invitedFamily = await acceptSupabaseFamilyInvite(inviteCode, inviteDisplayName);
    clearInviteCodeFromLocation();
    applyInviteFamilyData(invitedFamily, session.user.id, inviteDisplayName);
  }, [applyInviteFamilyData]);

  const withAnalyzeTimeout = async <T,>(promise: Promise<T>) => {
    return runWithTimeout(promise, ANALYZE_TIMEOUT_MS, "ANALYZE_TIMEOUT");
  };

  const resetAnalysisFullScreenAd = () => {
    analysisFullScreenAdRef.current.cleanup?.();
    analysisFullScreenAdRef.current = {
      status: "idle",
      cleanup: null,
      promise: null,
    };
  };

  const preloadAnalysisFullScreenAd = (trigger: "file_selected" | "analyze_click") => {
    const current = analysisFullScreenAdRef.current;
    if (current.status === "loaded") {
      return Promise.resolve();
    }
    if (current.status === "loading" && current.promise) {
      return current.promise;
    }
    if (!canUseFullScreenAd()) {
      trackAppEvent({
        eventType: "fullscreen_ad_unsupported",
        severity: "info",
        step: "analyze_upload.fullscreen_ad",
        message: "현재 환경에서 전면 광고 브릿지를 사용할 수 없어요.",
        metadata: {
          adGroupId: ANALYSIS_FULL_SCREEN_AD_ID,
          trigger,
        },
      });
      return Promise.resolve();
    }

    trackAppEvent({
      eventType: "fullscreen_ad_load_started",
      severity: "info",
      step: "analyze_upload.fullscreen_ad",
      message: "AI 분석 전 전면 광고를 미리 불러오고 있어요.",
      metadata: {
        adGroupId: ANALYSIS_FULL_SCREEN_AD_ID,
        trigger,
      },
    });

    let cleanup = () => undefined;
    const loadPromise = runWithTimeout(
      new Promise<void>((resolve, reject) => {
        cleanup = loadFullScreenAd({
          options: { adGroupId: ANALYSIS_FULL_SCREEN_AD_ID },
          onEvent: (event) => {
            if (event.type === "loaded") {
              cleanup();
              analysisFullScreenAdRef.current = {
                status: "loaded",
                cleanup: null,
                promise: null,
              };
              trackAppEvent({
                eventType: "fullscreen_ad_loaded",
                severity: "info",
                step: "analyze_upload.fullscreen_ad",
                message: "AI 분석 전 전면 광고를 불러왔어요.",
                metadata: {
                  adGroupId: ANALYSIS_FULL_SCREEN_AD_ID,
                  trigger,
                },
              });
              resolve();
            }
          },
          onError: (error) => {
            cleanup();
            reject(error);
          },
        });
      }),
      FULL_SCREEN_AD_LOAD_TIMEOUT_MS,
      "FULLSCREEN_AD_LOAD_TIMEOUT",
    ).catch((error) => {
      cleanup();
      analysisFullScreenAdRef.current = {
        status: "idle",
        cleanup: null,
        promise: null,
      };
      trackAppEvent({
        eventType: "fullscreen_ad_load_failed",
        severity: "warning",
        step: "analyze_upload.fullscreen_ad",
        message: error instanceof Error ? error.message : "전면 광고 로드 실패",
        metadata: {
          adGroupId: ANALYSIS_FULL_SCREEN_AD_ID,
          trigger,
          error: serializeErrorForLog(error),
        },
      });
      throw error;
    });

    analysisFullScreenAdRef.current = {
      status: "loading",
      cleanup,
      promise: loadPromise,
    };

    return loadPromise;
  };

  const showAnalysisFullScreenAd = async () => {
    if (!canUseFullScreenAd()) {
      return;
    }

    try {
      await preloadAnalysisFullScreenAd("analyze_click");

      await runWithTimeout(
        new Promise<void>((resolve, reject) => {
          let cleanup = () => undefined;
          analysisFullScreenAdRef.current.status = "showing";
          cleanup = showFullScreenAd({
            options: { adGroupId: ANALYSIS_FULL_SCREEN_AD_ID },
            onEvent: (event) => {
              trackAppEvent({
                eventType: `fullscreen_ad_${event.type}`,
                severity: event.type === "failedToShow" ? "warning" : "info",
                step: "analyze_upload.fullscreen_ad",
                message: `AI 분석 전 전면 광고 이벤트: ${event.type}`,
                metadata: {
                  adGroupId: ANALYSIS_FULL_SCREEN_AD_ID,
                },
              });
              if (event.type === "dismissed" || event.type === "failedToShow") {
                cleanup();
                resetAnalysisFullScreenAd();
                resolve();
              }
            },
            onError: (error) => {
              cleanup();
              resetAnalysisFullScreenAd();
              reject(error);
            },
          });
        }),
        FULL_SCREEN_AD_SHOW_TIMEOUT_MS,
        "FULLSCREEN_AD_SHOW_TIMEOUT",
      );

      trackAppEvent({
        eventType: "fullscreen_ad_finished",
        severity: "info",
        step: "analyze_upload.fullscreen_ad",
        message: "AI 분석 전 전면 광고가 종료되었어요.",
        metadata: {
          adGroupId: ANALYSIS_FULL_SCREEN_AD_ID,
        },
      });
    } catch (error) {
      resetAnalysisFullScreenAd();
      console.warn("AI 분석 전 전면 광고를 표시하지 못했어요.", error);
      trackAppEvent({
        eventType: "fullscreen_ad_skipped",
        severity: "warning",
        step: "analyze_upload.fullscreen_ad",
        message: error instanceof Error ? error.message : "전면 광고 표시 실패",
        metadata: {
          adGroupId: ANALYSIS_FULL_SCREEN_AD_ID,
          error: serializeErrorForLog(error),
        },
      });
    }
  };

  const ensureSupabaseChildIds = async () => {
    const childIdMap = new Map(children.map((child) => [child.id, child.id]));
    if (!isSupabaseConfigured) {
      return childIdMap;
    }

    await connectAppsInTossUser();
    const familyData = await getSupabaseFamilyData();
    const remoteChildren = familyData?.children.map(childProfileToChild) ?? [];
    const remoteChildrenByName = new Map(remoteChildren.map((child) => [child.name, child]));
    const nextChildren = [...children];
    let changed = false;

    for (const child of children) {
      if (isUuid(child.id)) continue;

      const matchedChild = remoteChildrenByName.get(child.name);
      const nextChild = matchedChild ?? childProfileToChild(
        await createSupabaseChild({
          name: child.name,
          avatarId: child.avatar,
          schoolName: child.school,
          grade: child.grade,
          className: child.className,
        }),
      );
      childIdMap.set(child.id, nextChild.id);
      const childIndex = nextChildren.findIndex((item) => item.id === child.id);
      if (childIndex >= 0) {
        nextChildren[childIndex] = nextChild;
        changed = true;
      }
    }

    if (changed) {
      setChildren(nextChildren);
    }

    return childIdMap;
  };

  const syncNotificationPreferencesSnapshot = useCallback((next: LocalNotificationPreferenceState) => {
    setNotificationPreferencesSnapshot(next);
    persistLocalNotificationPreferenceState(next);
  }, []);

  const refreshTossLoginState = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setTossUserKey(null);
      return null;
    }

    try {
      await connectAppsInTossUser();
      const nextTossUserKey = await getSupabaseTossUserKey();
      setTossUserKey(nextTossUserKey);
      return nextTossUserKey;
    } catch {
      setTossUserKey(null);
      return null;
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen]);

  useEffect(() => {
    childrenRef.current = children;
  }, [children]);

  useEffect(() => {
    effectiveScreenRef.current = effectiveScreen;
  }, [effectiveScreen]);

  useEffect(() => {
    if (children.length === 0 && CHILD_REQUIRED_SCREENS.has(screen)) {
      setScreen("first-child");
    }
  }, [children.length, screen]);

  useEffect(() => {
    void setIosSwipeGestureEnabled({ isEnabled: effectiveScreen !== "home" }).catch(() => undefined);
  }, [effectiveScreen]);

  useEffect(() => {
    const nextScreen = effectiveScreen;

    if (!hasInitializedHistoryRef.current) {
      const sentinelState: AppHistoryState = { __alimjangssok: true, kind: "sentinel" };
      const initialScreenState: AppHistoryState = {
        __alimjangssok: true,
        kind: "screen",
        screen: nextScreen,
        index: 0,
      };
      window.history.replaceState(sentinelState, "", window.location.href);
      window.history.pushState(initialScreenState, "", window.location.href);
      hasInitializedHistoryRef.current = true;
      historyIndexRef.current = 0;
      lastHistoryScreenRef.current = nextScreen;
      navigationStackRef.current = navigationStackRef.current.at(-1) === nextScreen
        ? navigationStackRef.current
        : [...navigationStackRef.current, nextScreen];
      persistNavigationStack(navigationStackRef.current);
      return;
    }

    if (isApplyingPopStateRef.current) {
      isApplyingPopStateRef.current = false;
      lastHistoryScreenRef.current = nextScreen;
      persistNavigationStack(navigationStackRef.current);
      return;
    }

    if (lastHistoryScreenRef.current === nextScreen) {
      return;
    }

    const previousStack = navigationStackRef.current;
    navigationStackRef.current =
      previousStack.at(-1) === nextScreen ? previousStack : [...previousStack, nextScreen];
    persistNavigationStack(navigationStackRef.current);
    historyIndexRef.current += 1;
    lastHistoryScreenRef.current = nextScreen;
    window.history.pushState(
      {
        __alimjangssok: true,
        kind: "screen",
        screen: nextScreen,
        index: historyIndexRef.current,
      } satisfies AppHistoryState,
      "",
      window.location.href,
    );
  }, [effectiveScreen]);

  const restoreCurrentHistoryEntry = useCallback(() => {
    window.history.pushState(
      {
        __alimjangssok: true,
        kind: "screen",
        screen: effectiveScreenRef.current,
        index: historyIndexRef.current,
      } satisfies AppHistoryState,
      "",
      window.location.href,
    );
    lastHistoryScreenRef.current = effectiveScreenRef.current;
  }, []);

  const navigateBackInApp = useCallback(() => {
    const currentStack = navigationStackRef.current;
    const previousScreen = currentStack.at(-2);

    if (!previousScreen) {
      restoreCurrentHistoryEntry();
      if (effectiveScreenRef.current === "home") {
        setIsExitConfirmOpen(true);
      } else {
        isApplyingPopStateRef.current = true;
        navigationStackRef.current = ["home"];
        persistNavigationStack(navigationStackRef.current);
        setIsExitConfirmOpen(false);
        setScreen("home");
      }
      return;
    }

    navigationStackRef.current = currentStack.slice(0, -1);
    persistNavigationStack(navigationStackRef.current);
    isApplyingPopStateRef.current = true;
    historyIndexRef.current = Math.max(historyIndexRef.current + 1, 1);
    lastHistoryScreenRef.current = previousScreen;
    window.history.pushState(
      {
        __alimjangssok: true,
        kind: "screen",
        screen: previousScreen,
        index: historyIndexRef.current,
      } satisfies AppHistoryState,
      "",
      window.location.href,
    );
    setIsExitConfirmOpen(false);
    setScreen(previousScreen);
  }, [restoreCurrentHistoryEntry]);

  useEffect(() => {
    const handleRootBack = () => {
      navigateBackInApp();
    };

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as AppHistoryState | null;

      if (state?.__alimjangssok && state.kind === "screen" && state.screen) {
        isApplyingPopStateRef.current = true;
        historyIndexRef.current = typeof state.index === "number" ? state.index : historyIndexRef.current;
        lastHistoryScreenRef.current = state.screen;
        const currentStack = navigationStackRef.current;
        if (currentStack.at(-2) === state.screen) {
          navigationStackRef.current = currentStack.slice(0, -1);
        } else if (currentStack.at(-1) !== state.screen) {
          navigationStackRef.current = [...currentStack, state.screen];
        }
        persistNavigationStack(navigationStackRef.current);
        setIsExitConfirmOpen(false);
        setScreen(state.screen);
        return;
      }

      if (state?.__alimjangssok && state.kind === "sentinel") {
        handleRootBack();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [navigateBackInApp]);

  useEffect(() => {
    let ignore = false;

    if (!isSupabaseConfigured) return () => {
      ignore = true;
    };

    void (async () => {
      try {
        await connectAppsInTossUser();
        const preferences = await getSupabaseNotificationPreferences();
        if (!preferences || ignore) return;
        syncNotificationPreferencesSnapshot(notificationPreferencesToLocalState(preferences));
      } catch {
        // 원격 동기화가 실패해도 로컬 설정으로 계속 동작합니다.
      }
    })();

    return () => {
      ignore = true;
    };
  }, [syncNotificationPreferencesSnapshot]);

  useEffect(() => {
    bugContextRef.current = {
      screen,
      childCount: children.length,
      todoCount: todos.length,
      calendarEventCount: calendarEvents.length,
      selectedFileCount: selectedImages.length,
    };
  }, [calendarEvents.length, children.length, screen, selectedImages.length, todos.length]);

  useEffect(() => {
    if (effectiveScreen === "upload" && selectedImages.length > 0) {
      void preloadAnalysisFullScreenAd("file_selected").catch(() => undefined);
      return;
    }

    if (selectedImages.length === 0 && analysisFullScreenAdRef.current.status !== "showing") {
      resetAnalysisFullScreenAd();
    }
    // preloadAnalysisFullScreenAd reads fresh refs and event context on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveScreen, selectedImages.length]);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      void trackBugEvent({
        eventType: "window_error",
        severity: "error",
        screen: bugContextRef.current.screen,
        step: "window.onerror",
        message: event.message || "window error",
        metadata: {
          ...bugContextRef.current,
          error: serializeErrorForLog(event.error),
          fileName: event.filename,
          line: event.lineno,
          column: event.colno,
        },
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      void trackBugEvent({
        eventType: "unhandled_rejection",
        severity: "error",
        screen: bugContextRef.current.screen,
        step: "window.unhandledrejection",
        message:
          event.reason instanceof Error
            ? event.reason.message
            : "처리되지 않은 Promise 에러가 발생했어요.",
        metadata: {
          ...bugContextRef.current,
          reason: serializeErrorForLog(event.reason),
        },
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    if (forceFirstVisitPreview) {
      return;
    }

    window.localStorage.setItem(
      APP_STATE_STORAGE_KEY,
      JSON.stringify({
        children,
        todos,
        calendarEvents,
        onboardingCompleted: children.length > 0,
      } satisfies PersistedAppState),
    );
  }, [calendarEvents, children, forceFirstVisitPreview, todos]);

  useEffect(() => {
    let ignore = false;

    if (forceFirstVisitPreview) {
      setCurrentUserId(null);
      return () => {
        ignore = true;
      };
    }

    const hasLocalFamilyState = () => childrenRef.current.length > 0 || hasPersistedChildren;
    const shouldKeepLocalFamilyState = (responseChildrenLength: number) =>
      !isDemoModeRequested() && responseChildrenLength === 0 && hasLocalFamilyState();

    const applyData = (response: {
      familyMembers?: FamilyMember[];
      children: ChildProfile[];
      todos: TodoRecord[];
      calendarEvents: CalendarEventRecord[];
    }) => {
      if (shouldKeepLocalFamilyState(response.children.length)) {
        return;
      }

      applyFamilyResponse({
        responseFamilyMembers: response.familyMembers,
        responseChildren: response.children,
        responseTodos: response.todos,
        responseCalendarEvents: response.calendarEvents,
        setFamilyMembers,
        setChildren,
        setTodos,
        setCalendarEvents,
      });

      if (response.children.length > 0) {
        setScreen((current) =>
          ["onboarding", "onboarding-tips", "first-child"].includes(current) ? "home" : current,
        );
      }
    };

    const loadInitialData = async () => {
      try {
        await connectAppsInTossUser();
        const session = await getSupabaseSession();
        if (ignore) return;

        if (session) {
          setCurrentUserId(session.user.id);
          void refreshTossLoginState();
          const inviteCode = getInviteCodeFromLocation();
          if (inviteCode) {
            const inviteDisplayName = getInviteDisplayNameFromLocation();
            const currentFamilyData = await getSupabaseFamilyData();
            if (ignore) return;

            if (hasFamilyContent(currentFamilyData) || hasLocalFamilyState()) {
              setPendingFamilyInvite({
                code: inviteCode,
                displayName: inviteDisplayName ?? undefined,
                existingChildrenCount: currentFamilyData?.children.length ?? childrenRef.current.length,
                existingTodoCount: currentFamilyData?.todos.length ?? 0,
                existingEventCount: currentFamilyData?.calendarEvents.length ?? 0,
              });
              return;
            }

            await acceptFamilyInvite(inviteCode, inviteDisplayName ?? undefined);
            return;
          }

          const supabaseData = await getSupabaseFamilyData();
          if (ignore) return;

          if (supabaseData) {
            applyData(supabaseData);
          } else if (!hasLocalFamilyState()) {
            setScreen("onboarding");
          }
          return;
        }
      } catch {
        // Supabase 설정/세션이 아직 준비되지 않으면 mock API로 이어갑니다.
      }

    try {
        if (!shouldBootstrapDemoFamily) {
          return;
        }

        const response = await getCurrentFamily();
        if (ignore) return;
        if (
          !isDemoModeRequested() &&
          response.children.length === 0 &&
          hasLocalFamilyState()
        ) {
          return;
        }
        applyData(response);
      } catch {
        // API가 아직 없거나 꺼져 있으면 localStorage 기반 프로토타입으로 동작합니다.
      }
    };

    void loadInitialData();

    const unsubscribe = subscribeSupabaseAuth((session) => {
      if (session) {
        setCurrentUserId(session.user.id);
        void refreshTossLoginState();
        void getSupabaseFamilyData()
          .then((response) => {
            if (!response) {
              if (!hasLocalFamilyState()) {
                setScreen("onboarding");
              }
              return;
            }
            applyData(response);
          })
          .catch((error) => {
            trackAppEvent({
              eventType: "family_sync_failed",
              severity: "warning",
              step: "supabase_auth.family_sync",
              message: error instanceof Error ? error.message : "가족 데이터 동기화에 실패했어요.",
              metadata: {
                error: serializeErrorForLog(error),
              },
            });
          });
      } else {
        setCurrentUserId(null);
        setTossUserKey(null);
      }
    });

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, [
    acceptFamilyInvite,
    forceFirstVisitPreview,
    hasPersistedChildren,
    refreshTossLoginState,
    shouldBootstrapDemoFamily,
    trackAppEvent,
  ]);

  const connectTossLogin = useCallback(async (options?: {
    returnScreen?: Screen;
    successMessage?: string;
  }) => {
    setIsConnectingTossLogin(true);
    setTossLoginStatusMessage("토스 로그인 화면을 여는 중이에요.");

    try {
      if (!isSupabaseConfigured) {
        throw new Error("서비스 연결 설정이 필요해요.");
      }

      await connectAppsInTossUser();

      const loginResult = await appLogin() as
        | {
            authorizationCode?: string;
            authorization_code?: string;
            referrer?: "DEFAULT" | "SANDBOX" | null;
          }
        | undefined;

      const authorizationCode =
        typeof loginResult?.authorizationCode === "string"
          ? loginResult.authorizationCode
          : typeof loginResult?.authorization_code === "string"
          ? loginResult.authorization_code
          : "";
      const referrer = loginResult?.referrer === "SANDBOX" ? "SANDBOX" : "DEFAULT";

      if (!authorizationCode) {
        throw new Error("토스 로그인 인증 코드를 받지 못했어요.");
      }

      const syncedTossUserKey = await syncSupabaseTossUserKey(authorizationCode, referrer);
      setTossUserKey(syncedTossUserKey);
      if (options?.returnScreen) {
        setScreen(options.returnScreen);
      }
      setTossLoginStatusMessage(options?.successMessage ?? "토스 로그인 연결을 완료했어요.");
      trackAppEvent({
        eventType: "toss_login_connected",
        severity: "info",
        step: "toss_login.connect",
        message: "토스 로그인 연결을 완료했어요.",
      });
    } catch (error) {
      const userFacingMessage = getUserFacingServiceErrorMessage(
        error,
        "토스 로그인 연결을 준비하지 못했어요. 잠시 후 다시 시도해주세요.",
      );
      const serializedError = serializeErrorForLog(error);

      setTossLoginStatusMessage(userFacingMessage);
      trackAppEvent({
        eventType: "toss_login_connect_failed",
        severity: "warning",
        step: "toss_login.connect",
        message: userFacingMessage,
        metadata: {
          error: serializedError,
          rawErrorCode: serializedError.code,
          rawErrorMessage: serializedError.debugMessage ?? serializedError.message,
        },
      });
    } finally {
      setIsConnectingTossLogin(false);
    }
  }, [trackAppEvent]);

  const addChild = async (child: Child) => {
    try {
      await connectAppsInTossUser();
      const session = await getSupabaseSession();
      if (session) {
        const createdChild = await createSupabaseChild({
          name: child.name,
          avatarId: child.avatar,
          schoolName: child.school,
          grade: child.grade,
          className: child.className,
        });
        setChildren((current) => [...current, childProfileToChild(createdChild)]);
        setScreen("home");
        return;
      }
    } catch {
      // Supabase 저장 실패 시 기존 mock/local 흐름으로 이어갑니다.
    }

    try {
      const createdChild = await createChild({
        name: child.name,
        avatarId: child.avatar,
        schoolName: child.school,
        grade: child.grade,
        className: child.className,
      });
      setChildren((current) => [...current, childProfileToChild(createdChild)]);
    } catch {
      setChildren((current) => [...current, child]);
    }
    setScreen("home");
  };

  const editChild = (child: Child) => {
    setEditingChild(child);
    setScreen("edit-child");
  };

  const changeChildAvatar = async (childId: string, avatarId: string) => {
    const currentChild = children.find((child) => child.id === childId);
    if (!currentChild || currentChild.avatar === avatarId) return;

    const optimisticChild = { ...currentChild, avatar: avatarId };
    setChildren((current) =>
      current.map((child) => (child.id === childId ? optimisticChild : child)),
    );

    try {
      const updatedChild = await updateSupabaseChild(childId, {
        name: currentChild.name,
        avatarId,
        schoolName: currentChild.school,
        grade: currentChild.grade,
        className: currentChild.className,
      });
      const nextChild = childProfileToChild(updatedChild);
      setChildren((current) =>
        current.map((child) => (child.id === childId ? nextChild : child)),
      );
    } catch {
      // 로컬/데모 모드에서는 낙관적으로 바꾼 아바타를 그대로 유지합니다.
    }
  };

  const saveChild = async (child: Child) => {
    const previousChild = editingChild ?? children.find((item) => item.id === child.id) ?? child;
    const previousChildId = previousChild.id;
    let nextChild = child;

    try {
      await connectAppsInTossUser();
      const childPayload = {
        name: child.name,
        avatarId: child.avatar,
        schoolName: child.school,
        grade: child.grade,
        className: child.className,
      };
      const savedChild = isUuid(child.id)
        ? await updateSupabaseChild(child.id, childPayload)
        : await createSupabaseChild(childPayload);
      nextChild = childProfileToChild(savedChild);
    } catch (error) {
      console.warn("아이 프로필 원격 저장에 실패해 로컬 상태를 먼저 갱신했어요.", error);
      // 로컬/데모 모드에서는 화면 상태만 먼저 갱신합니다.
    }

    setChildren((current) =>
      current.map((item) => (item.id === previousChildId ? nextChild : item)),
    );
    setTodos((current) =>
      current.map((todo) =>
        todo.childId === previousChildId
          ? { ...todo, childId: nextChild.id, childName: nextChild.name }
          : todo,
      ),
    );
    setCalendarEvents((current) =>
      current.map((event) =>
        event.childId === previousChildId
          ? { ...event, childId: nextChild.id, childName: nextChild.name }
          : event,
      ),
    );
    setEditingChild(null);
    setScreen("children");
  };

  const deleteEditingChild = async (child: Child) => {
    try {
      await deleteSupabaseChild(child.id);
    } catch {
      // 로컬/데모 모드에서는 화면 상태만 먼저 정리합니다.
    }

    deleteChild(child);
    setEditingChild(null);
    setScreen(children.length <= 1 ? "first-child" : "children");
  };

  const completeFirstChild = async (child: Child) => {
    try {
      await connectAppsInTossUser();
      const session = await getSupabaseSession();
      if (session) {
        const createdChild = await createSupabaseChild({
          name: child.name,
          avatarId: child.avatar,
          schoolName: child.school,
          grade: child.grade,
          className: child.className,
        });
        const nextChild = childProfileToChild(createdChild);
        setChildren([nextChild]);
        setTodos([]);
        setCalendarEvents([]);
        setScreen("home");
        return;
      }
    } catch {
      // Supabase 저장 실패 시 기존 mock/local 흐름으로 이어갑니다.
    }

    try {
      const createdChild = await createChild({
        name: child.name,
        avatarId: child.avatar,
        schoolName: child.school,
        grade: child.grade,
        className: child.className,
      });
      const nextChild = childProfileToChild(createdChild);
      setChildren([nextChild]);
      setTodos([]);
      setCalendarEvents([]);
    } catch {
      setChildren([child]);
      setTodos([]);
      setCalendarEvents([]);
    }
    setScreen("home");
  };

  const toggleTodo = (id: string) => {
    const targetTodo = todos.find((todo) => todo.id === id);
    if (targetTodo) {
      const nextStatus = targetTodo.completed ? "pending" : "done";
      void updateSupabaseTodoStatus(id, nextStatus)
        .catch(() => updateTodoStatus(id, nextStatus))
        .catch(() => undefined);
    }

    setTodos((current) =>
      current.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    );
  };

  const saveTodo = (todo: TodoItem) => {
    setTodos((current) =>
      current.map((item) => (item.id === todo.id ? todo : item)),
    );

    void updateSupabaseTodo(todo.id, {
      childId: todo.childId,
      title: todo.title,
      description: todo.detail,
      category: todoCategoryValue(todo.category),
      dueDate: todo.dueDate,
      remindAt: calculateTodoReminderAt(todo.dueDate),
    }).catch(() => undefined);
  };

  const addTodo = (todo: Omit<TodoItem, "id" | "completed">) => {
    const optimisticId = `manual-todo-${Date.now()}-${crypto.randomUUID()}`;
    const nextTodo: TodoItem = {
      ...todo,
      id: optimisticId,
      completed: false,
    };
    setTodos((current) => [nextTodo, ...current]);

    void createSupabaseTodo({
      childId: todo.childId,
      title: todo.title,
      description: todo.detail,
      category: todoCategoryValue(todo.category),
      dueDate: todo.dueDate,
      remindAt: calculateTodoReminderAt(todo.dueDate),
    })
      .then((createdTodo) => {
        setTodos((current) =>
          current.map((item) =>
            item.id === optimisticId
              ? todoRecordToTodoItem(createdTodo, new Map([[todo.childId, todo.childName]]))
              : item,
          ),
        );
      })
      .catch(() => undefined);
  };

  const addEvent = (event: Omit<CalendarEventItem, "id">) => {
    const optimisticId = `manual-event-${Date.now()}-${crypto.randomUUID()}`;
    const nextEvent: CalendarEventItem = {
      ...event,
      id: optimisticId,
    };
    setCalendarEvents((current) => [nextEvent, ...current]);

    void createSupabaseCalendarEvent({
      childId: event.childId,
      title: event.title,
      date: event.date,
      startTime: event.time,
      location: event.location,
    })
      .then((createdEvent) => {
        setCalendarEvents((current) =>
          current.map((item) =>
            item.id === optimisticId
              ? calendarEventRecordToItem(
                  createdEvent,
                  new Map([[event.childId, event.childName]]),
                )
              : item,
          ),
        );
      })
      .catch(() => undefined);
  };

  const deleteTodo = (id: string) => {
    void archiveSupabaseTodo(id).catch(() => undefined);
    setTodos((current) => current.filter((todo) => todo.id !== id));
  };

  const deleteCalendarEvent = (id: string) => {
    void archiveSupabaseCalendarEvent(id).catch(() => undefined);
    setCalendarEvents((current) => current.filter((event) => event.id !== id));
  };

  const deleteChild = (child: Child) => {
    setChildren((current) => current.filter((item) => item.id !== child.id));
    setTodos((current) => current.filter((todo) => todo.childId !== child.id));
    setCalendarEvents((current) => current.filter((event) => event.childId !== child.id));
  };

  const shareInvite = (invitedDisplayName?: string) => {
    void (async () => {
      await connectAppsInTossUser();
      const normalizedInviteName = invitedDisplayName?.trim() || undefined;
      const inviteCode = await createSupabaseFamilyInvite(normalizedInviteName);
      const shareResult = await shareFamilyInvite(inviteCode, normalizedInviteName);
      setShowInviteRoleSheet(false);
      setInviteFallbackState(
        shareResult.fallbackInviteLink
          ? {
              inviteLink: shareResult.fallbackInviteLink,
              invitedDisplayName: normalizedInviteName,
            }
          : null,
      );
    })().catch((error) => {
      showProcessingError(error, "family_invite_share");
    });
  };

  const cancelPendingFamilyInvite = () => {
    setPendingFamilyInvite(null);
    clearInviteCodeFromLocation();
  };

  const confirmPendingFamilyInvite = () => {
    if (!pendingFamilyInvite || isAcceptingFamilyInvite) return;

    setIsAcceptingFamilyInvite(true);
    void acceptFamilyInvite(pendingFamilyInvite.code, pendingFamilyInvite.displayName)
      .then(() => {
        setPendingFamilyInvite(null);
      })
      .catch((error) => {
        showProcessingError(error, "family_invite_accept", {
          inviteCode: pendingFamilyInvite.code,
        });
      })
      .finally(() => {
        setIsAcceptingFamilyInvite(false);
      });
  };

  const closeExitConfirm = () => {
    setIsExitConfirmOpen(false);
  };

  const confirmExitApp = () => {
    window.sessionStorage.removeItem(NAVIGATION_STACK_STORAGE_KEY);
    void closeView().catch(() => {
      window.history.back();
    });
  };

  const removeFamilyMember = (userId: string) => {
    void removeSupabaseFamilyMember(userId)
      .then(() => {
        setFamilyMembers((current) => current.filter((member) => member.userId !== userId));
      })
      .catch((error) => {
        showProcessingError(error, "family_member_remove", { targetUserId: userId });
      });
  };

  const clearSelectedImages = () => {
    selectedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setSelectedImages([]);
    setAnalysisError(null);
  };

  const loadEffectiveNotificationPreferences = async () => {
    if (!isSupabaseConfigured) {
      return loadLocalNotificationPreferenceState();
    }

    await connectAppsInTossUser();
    const preferences = await getSupabaseNotificationPreferences();
    if (!preferences) {
      return loadLocalNotificationPreferenceState();
    }

    const nextState = notificationPreferencesToLocalState(preferences);
    syncNotificationPreferencesSnapshot(nextState);
    return nextState;
  };

  const openNotificationConsentPrompt = (
    source: NotificationConsentPromptSource,
    draft: LocalNotificationPreferenceState = notificationPreferencesSnapshot,
  ) => {
    setNotificationConsentMessage(null);
    setNotificationConsentDraft(draft);
    setNotificationConsentPromptSource(source);
  };

  const updateNotificationConsentPreferenceState = async (next: LocalNotificationPreferenceState) => {
    syncNotificationPreferencesSnapshot(next);

    if (!isSupabaseConfigured) {
      return;
    }

    await connectAppsInTossUser();
    const saved = await saveSupabaseNotificationPreferences({
      enabled: next.enabled,
      preparationDay: next.preparationDay,
      preparationTime: next.preparationTime,
      morningTime: next.morningTime,
      scheduleEnabled: next.scheduleEnabled,
      scheduleDay: next.scheduleDay,
      scheduleTime: next.scheduleTime,
      consentStatus: next.consentStatus,
      consentLastPromptedAt: next.consentLastPromptedAt ?? null,
      consentAcceptedAt: next.consentAcceptedAt ?? null,
      consentDeclinedAt: next.consentDeclinedAt ?? null,
    });
    syncNotificationPreferencesSnapshot(notificationPreferencesToLocalState(saved));
  };

  const maybePromptNotificationConsent = async (source: NotificationConsentPromptSource) => {
    const preferences = await loadEffectiveNotificationPreferences();
    if (!shouldPromptForNotificationConsent(preferences)) {
      return false;
    }

    openNotificationConsentPrompt(source, preferences);
    return true;
  };

  const dismissNotificationConsentPrompt = async () => {
    const now = new Date().toISOString();
    const next = {
      ...notificationConsentDraft,
      consentLastPromptedAt: now,
    };

    setNotificationConsentPromptSource(null);
    setNotificationConsentMessage(null);

    try {
      await updateNotificationConsentPreferenceState(next);
    } catch {
      // 동의 재노출 쿨다운 기록이 실패해도 UI 흐름은 유지합니다.
    }
  };

  const acceptNotificationConsentPrompt = async () => {
    setIsSubmittingNotificationConsent(true);
    setNotificationConsentMessage(null);

    try {
      const agreementResult = await requestAppsInTossNotificationAgreement();
      if (agreementResult === "agreementRejected") {
        setNotificationConsentMessage("토스 알림 동의가 완료되어야 실제 알림을 받을 수 있어요.");
        return;
      }

      const now = new Date().toISOString();
      markAppsInTossNotificationAgreementConfirmed(now);
      const next = {
        ...notificationConsentDraft,
        enabled: true,
        scheduleEnabled: true,
        consentStatus: "accepted" as const,
        consentLastPromptedAt: now,
        consentAcceptedAt: now,
        consentDeclinedAt: undefined,
      };

      await updateNotificationConsentPreferenceState(next);
      setNotificationConsentPromptSource(null);
      setNotificationConsentMessage(
        agreementResult === "local-dev-skipped"
          ? "로컬에서는 토스 알림 동의 화면을 건너뛰고 설정을 저장했어요."
          : "토스 알림 동의와 앱 알림 설정을 완료했어요.",
      );
      if (!tossUserKey) {
        setScreen("notifications");
        await connectTossLogin({
          returnScreen: "notifications",
          successMessage: "토스 로그인 연결까지 마쳤어요. 이제 알림을 받을 준비가 되었어요.",
        });
      }
    } catch (error) {
      setNotificationConsentMessage(
        getUserFacingServiceErrorMessage(
          error,
          "알림 동의 저장에 실패했어요. 잠시 후 다시 시도해주세요.",
        ),
      );
    } finally {
      setIsSubmittingNotificationConsent(false);
    }
  };

  const declineNotificationConsentPrompt = async () => {
    const now = new Date().toISOString();
    const next = {
      ...notificationConsentDraft,
      enabled: false,
      consentStatus: "declined" as const,
      consentLastPromptedAt: now,
      consentAcceptedAt: undefined,
      consentDeclinedAt: now,
    };

    setIsSubmittingNotificationConsent(true);
    setNotificationConsentMessage(null);

    try {
      await updateNotificationConsentPreferenceState(next);
      setNotificationConsentPromptSource(null);
      setNotificationConsentMessage("알림은 나중에 다시 켤 수 있어요.");
    } catch (error) {
      setNotificationConsentMessage(
        error instanceof Error ? error.message : "알림 동의 상태 저장에 실패했어요.",
      );
    } finally {
      setIsSubmittingNotificationConsent(false);
    }
  };

  const analyzeUpload = async () => {
    if (selectedImages.length === 0) return;

    setAnalysisError(null);
    await showAnalysisFullScreenAd();
    setScreen("analyzing");
    trackAppEvent({
      eventType: "ocr_started",
      severity: "info",
      step: "analyze_upload",
      message: "OCR/AI 분석을 시작했어요.",
      metadata: {
        files: selectedImages.map((image) => ({
          name: image.file.name,
          size: image.file.size,
          type: image.file.type,
        })),
      },
    });

    try {
      const files = selectedImages.map((image) => image.file);
      const result = await withAnalyzeTimeout(analyzeNoticeImage({
        files,
        children,
      }));

      if (!isNoticeAnalyzeConfigured) {
        trackAppEvent({
          eventType: "analysis_configuration_warning",
          severity: "warning",
          step: "analyze_upload",
          message: "OCR 분석 엔드포인트가 설정되지 않은 상태예요.",
        });
      }

      trackAppEvent({
        eventType: "analysis_succeeded",
        severity: "info",
        step: "analyze_upload",
        message: "OCR/AI 분석이 완료되었어요.",
        metadata: {
          calendarEventCount: result.calendarEvents.length,
          todoCount: result.todos.length,
          infoCount: result.infoOnlyItems.length,
          warningCount: result.warnings.length,
        },
      });
      setAnalysisResult(result);
      setScreen("result");
    } catch (error) {
      showProcessingError(error, "analyze_upload");
      setScreen("upload");
    }
  };

  const confirmAnalysis = async () => {
    if (!analysisResult) return;
    setIsSavingResult(true);
    setAnalysisError(null);
    let childIdMap = new Map(children.map((child) => [child.id, child.id]));

    try {
      childIdMap = await ensureSupabaseChildIds();
    } catch (error) {
      showProcessingError(error, "confirm_analysis.ensure_child_ids");
      setIsSavingResult(false);
      return;
    }

    const resolveChildId = (childId?: string) => {
      if (childId && childIdMap.has(childId)) {
        return childIdMap.get(childId) ?? childId;
      }
      if (isUuid(childId)) {
        return childId;
      }
      const firstChildId = children[0]?.id;
      return firstChildId ? childIdMap.get(firstChildId) ?? firstChildId : "";
    };
    const fallbackChildId = resolveChildId(children[0]?.id);

    if (!fallbackChildId) {
      showProcessingError(new Error("저장할 아이 정보가 없어요."), "confirm_analysis.missing_child");
      setIsSavingResult(false);
      return;
    }

    const newTodos = analysisResult.todos
      .map((todo) => {
        const normalizedCategory = todoCategoryLabel(todo.category);
        const normalizedTitle = todo.title.trim() || "할 일";
        const normalizedDueDate = normalizeActionTodoDueDate({
          title: normalizedTitle,
          category: normalizedCategory,
          dueDate: todo.dueDate,
          detail: todo.detail,
        });

        return {
          id: todo.id,
          childId: resolveChildId(todo.childId) || fallbackChildId,
          childName: todo.childName || children.find((child) => child.id === fallbackChildId)?.name,
          title: normalizedTitle,
          category: normalizedCategory,
          dueDate: normalizedDueDate || "날짜 미정",
          detail: todo.detail?.trim() || undefined,
          completed: false,
        };
      })
      .filter((todo) => Boolean(todo.childId) && Boolean(todo.title.trim()));

    const newCalendarEvents = analysisResult.calendarEvents
      .map((event) => ({
        id: event.id,
        childId: resolveChildId(event.childId) || fallbackChildId,
        childName: event.childName || children.find((child) => child.id === fallbackChildId)?.name,
        title: event.title.trim() || "일정",
        description: event.description?.trim() || undefined,
        date: event.date || getLocalDateKey(new Date()),
        time: event.time?.trim() || "",
        location: event.location?.trim() || undefined,
        reminderAt: event.reminderAt,
        confidence: event.confidence,
        needsUserConfirmation: event.needsUserConfirmation,
        reason: event.reason,
      }))
      .filter((event) => Boolean(event.childId) && Boolean(event.title.trim()));

    try {
      trackAppEvent({
        eventType: "notice_save_started",
        severity: "info",
        step: "confirm_analysis",
        message: "분석 결과 저장을 시작했어요.",
        metadata: {
          noticeId: analysisResult.noticeId,
          todoCount: newTodos.length,
          calendarEventCount: newCalendarEvents.length,
        },
      });
      const supabaseResponse = await saveSupabaseNoticeResult({
        noticeId: analysisResult.noticeId,
        sourceText: analysisResult.sourceText,
        parsedResult: toBackendParsedNoticeResult(analysisResult),
        todos: newTodos.map((todo) => ({
          childId: todo.childId,
          title: todo.title,
          description: todo.detail,
          category: todoCategoryValue(todo.category),
          dueDate: todo.dueDate,
          remindAt: calculateTodoReminderAt(todo.dueDate),
        })),
        calendarEvents: newCalendarEvents.map((event) => ({
          childId: event.childId,
          title: event.title,
          description: event.description,
          date: event.date,
          startTime: event.time,
          location: event.location,
          reminderAt: event.reminderAt,
          confidence: event.confidence,
          needsUserConfirmation: event.needsUserConfirmation,
          reason: event.reason,
        })),
      });

      const responseChildren = supabaseResponse.children.length > 0
        ? supabaseResponse.children
        : children.map((child) => ({
            id: child.id,
            familyId: "",
            name: child.name,
            avatarId: child.avatar,
            schoolName: child.school,
            grade: child.grade,
            className: child.className,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }));
      const responseChildItems = responseChildren.map(childProfileToChild);
      const responseChildNameById = new Map(responseChildItems.map((child) => [child.id, child.name]));
      const fallbackTodos = newTodos.map((todo) => ({
        ...todo,
        childName: responseChildNameById.get(todo.childId) ?? todo.childName ?? "아이",
      }));
      const fallbackCalendarEvents = newCalendarEvents.map((event) => ({
        ...event,
        childName: responseChildNameById.get(event.childId) ?? event.childName ?? "아이",
        time: event.time || "시간 미정",
      }));
      const responseTodos = mergeTodoItems(
        supabaseResponse.todos.map((todo) => todoRecordToTodoItem(todo, responseChildNameById)),
        fallbackTodos,
      ).filter((todo) => !isGeneratedStarterTodo(todo));
      const responseCalendarEvents = mergeCalendarEventItems(
        supabaseResponse.calendarEvents.map((event) => calendarEventRecordToItem(event, responseChildNameById)),
        fallbackCalendarEvents,
      ).filter((event) => !isGeneratedStarterEvent(event));

      setChildren(responseChildItems);
      setFamilyMembers(supabaseResponse.familyMembers);
      setTodos(responseTodos);
      setCalendarEvents(responseCalendarEvents);

      clearSelectedImages();
      setAnalysisResult(null);
      markHomeShortcutPromptPending();
      setScreen("home");
      setIsSavingResult(false);
      void maybePromptNotificationConsent("post-save");
      trackAppEvent({
        eventType: "notice_saved",
        severity: "info",
        step: "confirm_analysis",
        message: "분석 결과 저장이 완료되었어요.",
        metadata: {
          noticeId: analysisResult.noticeId,
        },
      });
      return;
    } catch (error) {
      if (isSupabaseConfigured) {
        showProcessingError(error, "confirm_analysis.supabase_save", {
          noticeId: analysisResult.noticeId,
        });
        setIsSavingResult(false);
        return;
      }

      // Supabase 설정이 없는 로컬 개발 환경에서만 서버 API 또는 로컬 저장 흐름으로 이어갑니다.
    }

    try {
      const response = await confirmNotice(analysisResult.noticeId, {
        todos: newTodos.map((todo) => ({
          id: todo.id,
          familyId: "family-demo",
          childId: todo.childId,
          createdBy: "user-demo",
          title: todo.title,
          description: todo.detail,
          category: todoCategoryValue(todo.category),
          dueDate: todo.dueDate,
          remindAt: calculateTodoReminderAt(todo.dueDate),
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })),
        calendarEvents: newCalendarEvents.map((event) => ({
          id: event.id,
          familyId: "family-demo",
          childId: event.childId,
          createdBy: "user-demo",
          title: event.title,
          date: event.date,
          startTime: event.time,
          location: event.location,
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })),
      });

      applyFamilyResponse({
        responseChildren: response.children,
        responseTodos: response.todos,
        responseCalendarEvents: response.calendarEvents,
        setChildren,
        setTodos,
        setCalendarEvents,
      });

      clearSelectedImages();
      setAnalysisResult(null);
      markHomeShortcutPromptPending();
      setScreen("home");
      setIsSavingResult(false);
      void maybePromptNotificationConsent("post-save");
      trackAppEvent({
        eventType: "notice_saved",
        severity: "info",
        step: "confirm_analysis.mock_api",
        message: "분석 결과 저장이 완료되었어요.",
        metadata: {
          noticeId: analysisResult.noticeId,
          source: "mock-api",
        },
      });
      return;
    } catch (error) {
      trackAppEvent({
        eventType: "notice_save_fallback",
        severity: "warning",
        step: "confirm_analysis.local_fallback",
        message: error instanceof Error ? error.message : "로컬 저장으로 전환했어요.",
        metadata: {
          error: serializeErrorForLog(error),
          noticeId: analysisResult.noticeId,
        },
      });
      // 서버가 없으면 기존 로컬 저장 흐름으로 확정합니다.
    }

    setTodos((current) => [
      ...newTodos,
      ...current,
    ]);

    setCalendarEvents((current) => [
      ...newCalendarEvents,
      ...current,
    ]);

    clearSelectedImages();
    setAnalysisResult(null);
    markHomeShortcutPromptPending();
    setScreen("home");
    setIsSavingResult(false);
    void maybePromptNotificationConsent("post-save");
    trackAppEvent({
      eventType: "notice_saved",
      severity: "info",
      step: "confirm_analysis.local_save",
      message: "분석 결과를 로컬에 저장했어요.",
      metadata: {
        noticeId: analysisResult.noticeId,
        source: "local",
      },
    });
  };

  const addSelectedImages = (files: File[]) => {
    setAnalysisError(null);
    setSelectedImages((current) => [
      ...current,
      ...files.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  };

  const removeSelectedImage = (id: string) => {
    setSelectedImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((image) => image.id !== id);
    });
  };

  const handleNotificationPreferencesUpdated = (preferences: NotificationPreferences) => {
    syncNotificationPreferencesSnapshot(notificationPreferencesToLocalState(preferences));
  };

  return (
    <div className="app-shell">
      <main
        className={
          showChrome
            ? "screen with-nav"
            : "screen"
        }
      >
        {effectiveScreen === "onboarding" && (
          <IntroBridgeScreen
            onStart={() => setScreen("onboarding-tips")}
          />
        )}
        {effectiveScreen === "onboarding-tips" && (
          <OnboardingTipsScreen
            onComplete={() => {
              dismissOnboardingGuide();
              setScreen("first-child");
            }}
            onDismiss={() => {
              dismissOnboardingGuide();
              setScreen("first-child");
            }}
          />
        )}
        {effectiveScreen === "first-child" && (
          <ChildSetupScreen
            mode="first"
            onAddChild={completeFirstChild}
          />
        )}
        {effectiveScreen === "home" && (
          <HomeScreen
            children={children}
            events={calendarEvents}
            onAddEvent={addEvent}
            onChangeChildAvatar={changeChildAvatar}
            onDeleteEvent={deleteCalendarEvent}
            todos={todos}
            onAddTodo={addTodo}
            onDeleteTodo={deleteTodo}
            onEditChild={editChild}
            onNavigate={setScreen}
            onSaveTodo={saveTodo}
            onToggleTodo={toggleTodo}
          />
        )}
        {effectiveScreen === "upload" && (
          <UploadScreen
            images={selectedImages}
            onAnalyze={analyzeUpload}
            onAddImages={addSelectedImages}
            onBack={navigateBackInApp}
            onClearImages={clearSelectedImages}
            onRemoveImage={removeSelectedImage}
            onTrackEvent={trackAppEvent}
          />
        )}
        {effectiveScreen === "analyzing" && <AnalyzingScreen />}
        {effectiveScreen === "result" && (
          <ResultScreen
            childrenProfiles={children}
            isSaving={isSavingResult}
            onBack={navigateBackInApp}
            result={analysisResult}
            onConfirm={confirmAnalysis}
            onNavigate={setScreen}
            onUpdateResult={setAnalysisResult}
          />
        )}
        {effectiveScreen === "todo" && (
          <TodoScreen
            children={children}
            onBack={navigateBackInApp}
            todos={todos}
            onAddTodo={addTodo}
            onDeleteTodo={deleteTodo}
            onSaveTodo={saveTodo}
            onToggleTodo={toggleTodo}
          />
        )}
        {effectiveScreen === "children" && (
          <ChildrenScreen children={children} onBack={navigateBackInApp} onEditChild={editChild} onNavigate={setScreen} />
        )}
        {effectiveScreen === "add-child" && (
          <ChildSetupScreen
            mode="add"
            onBack={navigateBackInApp}
            onAddChild={addChild}
          />
        )}
        {effectiveScreen === "edit-child" && editingChild && (
          <ChildSetupScreen
            child={editingChild}
            mode="edit"
            onBack={navigateBackInApp}
            onAddChild={saveChild}
            onDeleteChild={deleteEditingChild}
          />
        )}
        {effectiveScreen === "settings" && (
          <SettingsScreen
            children={children}
            currentUserId={currentUserId}
            familyMembers={familyMembers}
            isConnectingTossLogin={isConnectingTossLogin}
            onBack={navigateBackInApp}
            onDeleteChild={deleteChild}
            onConnectTossLogin={() => {
              void connectTossLogin();
            }}
            onEditChild={editChild}
            onNavigate={setScreen}
            onRemoveMember={removeFamilyMember}
            onShareInvite={() => setShowInviteRoleSheet(true)}
            tossLoginStatusMessage={tossLoginStatusMessage}
            tossUserKey={tossUserKey}
          />
        )}
        {effectiveScreen === "notifications" && (
          <NotificationsScreen
            consentSnapshot={notificationPreferencesSnapshot}
            isConnectingTossLogin={isConnectingTossLogin}
            onBack={navigateBackInApp}
            onConnectTossLogin={() => {
              void connectTossLogin({
                returnScreen: "notifications",
                successMessage: "토스 로그인 연결을 완료했어요. 알림 설정으로 다시 돌아왔어요.",
              });
            }}
            onPreferencesUpdated={handleNotificationPreferencesUpdated}
            onSnapshotUpdated={syncNotificationPreferencesSnapshot}
            onRequestConsentPrompt={(draft) => {
              openNotificationConsentPrompt("settings-toggle", draft);
            }}
            tossLoginStatusMessage={tossLoginStatusMessage}
            tossUserKey={tossUserKey}
          />
        )}
        {effectiveScreen === "bug-events" && <BugDashboardScreen onBack={navigateBackInApp} />}
      </main>

      {notificationConsentPromptSource ? (
        <NotificationConsentSheet
          isSubmitting={isSubmittingNotificationConsent}
          message={notificationConsentMessage}
          source={notificationConsentPromptSource}
          onAccept={() => {
            void acceptNotificationConsentPrompt();
          }}
          onClose={() => {
            void dismissNotificationConsentPrompt();
          }}
          onDecline={() => {
            void declineNotificationConsentPrompt();
          }}
        />
      ) : null}
      {analysisError ? (
        <ErrorDialog
          code={analysisError.code}
          description={analysisError.description}
          message={analysisError.message}
          onClose={() => setAnalysisError(null)}
        />
      ) : null}
      {isExitConfirmOpen ? (
        <ExitConfirmDialog
          onClose={closeExitConfirm}
          onConfirm={confirmExitApp}
        />
      ) : null}
      {pendingFamilyInvite ? (
        <FamilyInviteSwitchDialog
          existingChildrenCount={pendingFamilyInvite.existingChildrenCount}
          existingEventCount={pendingFamilyInvite.existingEventCount}
          existingTodoCount={pendingFamilyInvite.existingTodoCount}
          invitedDisplayName={pendingFamilyInvite.displayName}
          isSubmitting={isAcceptingFamilyInvite}
          onCancel={cancelPendingFamilyInvite}
          onConfirm={confirmPendingFamilyInvite}
        />
      ) : null}
      {showInviteRoleSheet ? (
        <InviteRoleSheet
          onClose={() => setShowInviteRoleSheet(false)}
          onSubmit={shareInvite}
        />
      ) : null}
      {inviteFallbackState ? (
        <InviteLinkSheet
          inviteLink={inviteFallbackState.inviteLink}
          invitedDisplayName={inviteFallbackState.invitedDisplayName}
          onClose={() => setInviteFallbackState(null)}
        />
      ) : null}
    </div>
  );
}

function IntroBridgeScreen({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    const splashTimer = window.setTimeout(onStart, 3000);
    return () => window.clearTimeout(splashTimer);
  }, [onStart]);

  return (
    <section className="onboarding-screen splash-screen" aria-label="알림장쏙 시작 화면">
      <div className="splash-backdrop" aria-hidden="true" />
      <div className="splash-stage" aria-hidden="true">
        <img
          alt=""
          aria-hidden="true"
          className="splash-illustration"
          src="/splash-illustration.png"
        />
      </div>
      <div className="splash-brand">
        <span className="splash-wordmark">알림장쏙</span>
        <span className="splash-tagline">우리 아이 하루를 쏙 정리해요</span>
      </div>
    </section>
  );
}

function OnboardingTodoPreview() {
  return (
    <div className="tips-todo-preview" aria-hidden="true">
      <div className="tips-todo-card floating">
        <div>
          <span>오늘</span>
          <strong>체육복 챙기기</strong>
        </div>
        <CheckCircle2 size={18} />
      </div>
      <div className="tips-todo-card">
        <div>
          <span>내일</span>
          <strong>준비물 알림</strong>
        </div>
        <em>오후 8:00</em>
      </div>
      <div className="tips-todo-calendar">
        <span>5월 22일</span>
        <strong>체육대회</strong>
      </div>
    </div>
  );
}

const onboardingTips = [
  {
    id: "capture",
    title: "키즈노트 또는 알림장을 사진 찍거나 캡처하세요",
    description: "앱 공지, 종이 알림장, 키즈노트 화면까지 편한 방식으로 준비하면 돼요.",
    accent: "사진 준비",
    visual: <NoticePhotoIcon size={34} />,
  },
  {
    id: "upload",
    title: "준비한 사진을 업로드 해주세요",
    description: "여러 장도 한 번에 올릴 수 있어서 긴 공지도 빠르게 정리할 수 있어요.",
    accent: "업로드",
    visual: <AssetIcon src="/icons/upload.svg" size={34} />,
  },
  {
    id: "reminder",
    title: "AI가 날짜별로 할 일을 정리해주고, 알림도 보내줘요",
    description: "정리된 준비물과 일정은 전날과 당일에 다시 알려드려서 잊지 않게 도와드려요.",
    accent: "AI 정리 · 알림",
    visual: <OnboardingTodoPreview />,
  },
] satisfies Array<{
  id: string;
  title: string;
  description: string;
  accent: string;
  visual: React.ReactNode;
}>;

function OnboardingTipsScreen({
  onComplete,
  onDismiss,
}: {
  onComplete: () => void;
  onDismiss: () => void;
}) {
  const [step, setStep] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const isLastStep = step === onboardingTips.length - 1;
  const goToStep = (nextStep: number) => {
    const boundedStep = Math.min(Math.max(nextStep, 0), onboardingTips.length - 1);
    setStep(boundedStep);
    sliderRef.current?.scrollTo({
      behavior: "smooth",
      left: sliderRef.current.clientWidth * boundedStep,
    });
  };

  const handleSliderScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { clientWidth, scrollLeft } = event.currentTarget;
    if (clientWidth === 0) return;

    const nextStep = Math.round(scrollLeft / clientWidth);
    if (nextStep !== step) {
      setStep(Math.min(Math.max(nextStep, 0), onboardingTips.length - 1));
    }
  };

  return (
    <section className="onboarding-screen onboarding-tips-screen">
      <div className="tips-topbar">
        <button className="tips-dismiss-button" onClick={onDismiss} type="button">
          다시 보지 않기
        </button>
      </div>

      <div className="tips-slider-viewport" onScroll={handleSliderScroll} ref={sliderRef}>
        <div className="tips-slider-track">
          {onboardingTips.map((tip) => (
            <article className="tips-slider-card" key={tip.id}>
              <div className={tip.id === "reminder" ? "tips-visual-shell todo-preview-shell" : "tips-visual-shell"}>
                <div className="tips-visual-glow" aria-hidden="true" />
                <div className={tip.id === "reminder" ? "tips-visual-icon todo-preview-host" : "tips-visual-icon"}>
                  {tip.visual}
                </div>
                {tip.id !== "reminder" ? (
                  <div className="tips-visual-note primary">
                    <span>{tip.accent}</span>
                  </div>
                ) : null}
              </div>

              <div className="tips-copy">
                <h1>{tip.title}</h1>
                <p>{tip.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="tips-pagination" aria-label="사용 가이드 단계">
        {onboardingTips.map((tip, index) => (
          <span
            aria-current={index === step ? "step" : undefined}
            className={index === step ? "active" : ""}
            key={tip.id}
          />
        ))}
      </div>

      <div className="screen-actions onboarding-tip-actions">
        <Button size="l" onClick={isLastStep ? onComplete : () => goToStep(step + 1)}>
          {isLastStep ? "시작하기" : "다음"}
        </Button>
      </div>
    </section>
  );
}

function HomeScreen({
  children,
  events,
  onAddEvent,
  onChangeChildAvatar,
  onDeleteEvent,
  onEditChild,
  todos,
  onAddTodo,
  onDeleteTodo,
  onNavigate,
  onSaveTodo,
  onToggleTodo,
}: {
  children: Child[];
  events: CalendarEventItem[];
  onAddEvent: (event: Omit<CalendarEventItem, "id">) => void;
  onChangeChildAvatar: (childId: string, avatarId: string) => void;
  onDeleteEvent: (id: string) => void;
  onEditChild: (child: Child) => void;
  todos: TodoItem[];
  onAddTodo: (todo: Omit<TodoItem, "id" | "completed">) => void;
  onDeleteTodo: (id: string) => void;
  onNavigate: (screen: Screen) => void;
  onSaveTodo: (todo: TodoItem) => void;
  onToggleTodo: (id: string) => void;
}) {
  const [selectedChild, setSelectedChild] = useState(children[0]?.id ?? "");
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventItem | null>(null);
  const [isAddingTodo, setIsAddingTodo] = useState(false);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [showHomeShortcutSheet, setShowHomeShortcutSheet] = useState(false);

  useEffect(() => {
    if (!selectedChild && children[0]) {
      setSelectedChild(children[0].id);
    }
  }, [children, selectedChild]);

  useEffect(() => {
    if (!shouldShowHomeShortcutPrompt()) return;

    setShowHomeShortcutSheet(true);
    window.localStorage.setItem(HOME_SHORTCUT_PROMPT_PENDING_KEY, "false");
    window.localStorage.setItem(HOME_SHORTCUT_PROMPT_SEEN_KEY, "true");
  }, []);

  const currentChild = children.find((child) => child.id === selectedChild) ?? children[0];
  const filteredTodos = currentChild
    ? todos.filter((todo) => todo.childId === currentChild.id)
    : todos;
  const todayTodos = filteredTodos.filter((todo) => getTodoDateBucket(todo.dueDate) === "today");
  const tomorrowTodos = filteredTodos.filter((todo) => getTodoDateBucket(todo.dueDate) === "tomorrow");
  const weekTodos = filteredTodos.filter((todo) => getTodoDateBucket(todo.dueDate) === "week");
  const laterTodos = filteredTodos.filter((todo) => getTodoDateBucket(todo.dueDate) === "later");
  const pastTodos = filteredTodos.filter((todo) => getTodoDateBucket(todo.dueDate) === "past");
  const unscheduledTodos = filteredTodos.filter(
    (todo) => getTodoDateBucket(todo.dueDate) === "unscheduled",
  );
  const followUpTodos = filteredTodos.filter((todo) => {
    if (todo.completed) return false;
    const bucket = getTodoDateBucket(todo.dueDate);
    return bucket === "week" || bucket === "later" || bucket === "unscheduled" || bucket === "past";
  });
  const hasTodayPending = todayTodos.some((todo) => !todo.completed);
  const hasTomorrowPending = tomorrowTodos.some((todo) => !todo.completed);
  const heroMessage = hasTodayPending
    ? "오늘 챙길 것이 있어요"
    : hasTomorrowPending
      ? "내일 준비물 미리 챙겨요"
      : todayTodos.length > 0 || tomorrowTodos.length > 0
        ? "오늘도 빠짐없이 잘 챙겨주셨네요!"
        : "오늘은 가볍게 출발해요";
  const filteredEvents = currentChild
    ? events.filter((event) => event.childId === currentChild.id)
    : events;
  const closeHomeShortcutSheet = () => {
    setShowHomeShortcutSheet(false);
  };
  const dismissHomeShortcutSheet = () => {
    window.localStorage.setItem(HOME_SHORTCUT_PROMPT_DISMISSED_KEY, "true");
    setShowHomeShortcutSheet(false);
  };

  return (
    <section className="page-stack assistant-home">
      <div className="child-rail" aria-label="자녀 선택">
        {children.map((child) => (
          <button
            className={currentChild?.id === child.id ? "child-rail-card active" : "child-rail-card"}
            key={child.id}
            onClick={() => setSelectedChild(child.id)}
            type="button"
          >
            <span>
              <KidAvatar avatarId={child.avatar} size={28} />
            </span>
            <strong>{child.name}</strong>
          </button>
        ))}
        <button className="child-rail-card add" onClick={() => onNavigate("add-child")} type="button">
          <Plus size={22} />
          <strong>자녀 추가</strong>
        </button>
      </div>

      <section className="hero-card">
        <button
          aria-label="설정"
          className="hero-settings-button"
          onClick={() => onNavigate("settings")}
          type="button"
        >
          <SettingsTabIcon size={20} />
        </button>
        <div className="hero-copy">
          <p className="eyebrow">놓치지 마세요!</p>
          <h1>{heroMessage}</h1>
          {currentChild ? (
            <div className="hero-child-summary">
              <div className="hero-child-copy">
                <span>
                  {currentChild.school ?? "기관명 없음"} · {currentChild.grade || "학년 미입력"} {currentChild.className || "반 미입력"}
                </span>
              </div>
            </div>
          ) : null}
        </div>
        <button
          aria-label={`${currentChild?.name ?? "아이"} 정보 보기`}
          className="avatar-stage"
          onClick={() => {
            if (currentChild) {
              onEditChild(currentChild);
            } else {
              onNavigate("add-child");
            }
          }}
          type="button"
        >
          <KidAvatar avatarId={currentChild?.avatar ?? characterOptions[0].id} size={104} />
        </button>
      </section>

      <button className="primary-attach" onClick={() => onNavigate("upload")} type="button">
        <div>
          <NoticePhotoIcon size={24} />
        </div>
        <span>알림장 업로드하기</span>
      </button>

      <TossAdBanner
        adId="ait.v2.live.3a4c8b61b70145bf"
        candidate="A"
        placement="알림장 업로드하기 버튼 아래"
      />

      {todayTodos.length === 0 && tomorrowTodos.length === 0 && followUpTodos.length > 0 ? (
        <Card title="바로 확인할 항목" count={followUpTodos.length}>
          {followUpTodos.slice(0, 3).map((todo) => (
            <TodoCheckRow
              key={todo.id}
              todo={todo}
              onEditTodo={setEditingTodo}
              onToggleTodo={onToggleTodo}
            />
          ))}
        </Card>
      ) : null}

      <Card
        title="오늘 준비물"
        count={todayTodos.length}
        action={
          currentChild ? (
            <button
              aria-label="준비물 직접 추가"
              className="card-add-button"
              onClick={() => setIsAddingTodo(true)}
              type="button"
            >
              <Plus size={18} />
            </button>
          ) : null
        }
      >
        {todayTodos.length > 0 ? (
          todayTodos.map((todo) => (
            <TodoCheckRow
              key={todo.id}
              todo={todo}
              onEditTodo={setEditingTodo}
              onToggleTodo={onToggleTodo}
            />
          ))
        ) : (
          <EmptyState text="오늘 챙길 준비물이 없어요." />
        )}
      </Card>

      <Card
        title="내일 준비물"
        count={tomorrowTodos.length}
        action={
          currentChild ? (
            <button
              aria-label="내일 준비물 직접 추가"
              className="card-add-button"
              onClick={() => setIsAddingTodo(true)}
              type="button"
            >
              <Plus size={18} />
            </button>
          ) : null
        }
      >
        {tomorrowTodos.length > 0 ? (
          tomorrowTodos.map((todo) => (
            <TodoCheckRow
              key={todo.id}
              todo={todo}
              onEditTodo={setEditingTodo}
              onToggleTodo={onToggleTodo}
            />
          ))
        ) : (
          <EmptyState text="내일 준비물은 아직 없어요." />
        )}
      </Card>

      {weekTodos.length > 0 ? (
        <Card title="이번 주 할 일" count={weekTodos.length}>
          {weekTodos.map((todo) => (
            <TodoCheckRow
              key={todo.id}
              todo={todo}
              onEditTodo={setEditingTodo}
              onToggleTodo={onToggleTodo}
            />
          ))}
        </Card>
      ) : null}

      {laterTodos.length > 0 ? (
        <Card title="다가오는 할 일" count={laterTodos.length}>
          {laterTodos.map((todo) => (
            <TodoCheckRow
              key={todo.id}
              todo={todo}
              onEditTodo={setEditingTodo}
              onToggleTodo={onToggleTodo}
            />
          ))}
        </Card>
      ) : null}

      {pastTodos.length > 0 ? (
        <Card title="지난 할 일" count={pastTodos.length}>
          {pastTodos.map((todo) => (
            <TodoCheckRow
              key={todo.id}
              todo={todo}
              onEditTodo={setEditingTodo}
              onToggleTodo={onToggleTodo}
            />
          ))}
        </Card>
      ) : null}

      {unscheduledTodos.length > 0 ? (
        <Card title="날짜 미정" count={unscheduledTodos.length}>
          {unscheduledTodos.map((todo) => (
            <TodoCheckRow
              key={todo.id}
              todo={todo}
              onEditTodo={setEditingTodo}
              onToggleTodo={onToggleTodo}
            />
          ))}
        </Card>
      ) : null}

      <Card
        title="다가오는 일정"
        count={filteredEvents.length}
        action={
          currentChild ? (
            <button
              aria-label="다가오는 일정 직접 추가"
              className="card-add-button"
              onClick={() => setIsAddingEvent(true)}
              type="button"
            >
              <Plus size={18} />
            </button>
          ) : null
        }
      >
        {filteredEvents.length > 0 ? filteredEvents.map((event) => (
          <button
            className="event-row checklist-row event-row-button"
            key={event.id}
            onClick={() => setSelectedEvent(event)}
            type="button"
          >
            <div aria-hidden="true" className="event-check-badge">
              <CalendarCuteIcon size={18} />
            </div>
            <div className="row-copy">
              <strong>{event.title}</strong>
              <span>
                {event.date} · {event.time} · {event.childName}
              </span>
            </div>
          </button>
        )) : <EmptyState text="등록된 일정이 아직 없어요." />}
      </Card>
      {(editingTodo || isAddingTodo) && currentChild ? (
        <TodoEditorSheet
          children={children}
          defaultChildId={currentChild.id}
          mode={editingTodo ? "edit" : "add"}
          todo={editingTodo}
          onAddTodo={(todo) => {
            onAddTodo(todo);
            setIsAddingTodo(false);
          }}
          onClose={() => {
            setEditingTodo(null);
            setIsAddingTodo(false);
          }}
          onDeleteTodo={(id) => {
            onDeleteTodo(id);
            setEditingTodo(null);
          }}
          onSaveTodo={(todo) => {
            onSaveTodo(todo);
            setEditingTodo(null);
          }}
        />
      ) : null}
      {isAddingEvent && currentChild ? (
        <EventEditorSheet
          children={children}
          defaultChildId={currentChild.id}
          onAddEvent={(event) => {
            onAddEvent(event);
            setIsAddingEvent(false);
          }}
          onClose={() => setIsAddingEvent(false)}
        />
      ) : null}
      {selectedEvent ? (
        <EventDetailSheet
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDelete={() => {
            onDeleteEvent(selectedEvent.id);
            setSelectedEvent(null);
          }}
        />
      ) : null}
      {isAvatarPickerOpen && currentChild ? (
        <AvatarPickerSheet
          currentAvatarId={currentChild.avatar}
          onClose={() => setIsAvatarPickerOpen(false)}
          onSelectAvatar={(avatarId) => {
            onChangeChildAvatar(currentChild.id, avatarId);
            setIsAvatarPickerOpen(false);
          }}
        />
      ) : null}
      {showHomeShortcutSheet ? (
        <HomeShortcutSheet
          onClose={closeHomeShortcutSheet}
          onDismiss={dismissHomeShortcutSheet}
        />
      ) : null}
    </section>
  );
}

function UploadScreen({
  images,
  onAnalyze,
  onAddImages,
  onBack,
  onClearImages,
  onRemoveImage,
  onTrackEvent,
}: {
  images: SelectedUploadImage[];
  onAnalyze: () => void;
  onAddImages: (files: File[]) => void;
  onBack: () => void;
  onClearImages: () => void;
  onRemoveImage: (id: string) => void;
  onTrackEvent: (
    input: Omit<BugEventInput, "screen" | "metadata"> & { metadata?: Record<string, unknown> },
  ) => void;
}) {
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const remainingSlots = Math.max(MAX_UPLOAD_FILES - images.length, 0);
    if (remainingSlots === 0) {
      window.alert(`파일은 최대 ${MAX_UPLOAD_FILES}개까지만 올릴 수 있어요.`);
      event.target.value = "";
      return;
    }

    const selectedFiles = Array.from(event.target.files ?? []);
    const imageFiles = selectedFiles
      .filter((file) => ["image/jpeg", "image/png"].includes(file.type))
      .slice(0, remainingSlots);
    const pdfFiles = selectedFiles.filter((file) => file.type === "application/pdf");
    const pdfSlots = Math.max(remainingSlots - imageFiles.length, 0);

    try {
      setIsConvertingPdf(pdfFiles.length > 0);
      const convertedPdfResult = pdfFiles.length > 0
        ? await convertPdfFilesToImages(pdfFiles, pdfSlots)
        : { files: [], totalPageCount: 0 };
      const convertedPdfImages = convertedPdfResult.files;
      const optimizedImageFiles = await optimizeUploadImages(imageFiles);
      const optimizedPdfImages = await optimizeUploadImages(convertedPdfImages);
      const uploadFiles = [...optimizedImageFiles, ...optimizedPdfImages];
      const truncatedPdfPageCount = Math.max(
        convertedPdfResult.totalPageCount - convertedPdfImages.length,
        0,
      );

      if (uploadFiles.length > 0) {
        onTrackEvent({
          eventType: "upload_selected",
          severity: "info",
          step: "upload_screen.file_select",
          message: "업로드 파일을 선택했어요.",
          metadata: {
            selectedCount: uploadFiles.length,
            imageCount: imageFiles.length,
            pdfCount: pdfFiles.length,
            originalImageBytes: imageFiles.reduce((sum, file) => sum + file.size, 0),
            optimizedImageBytes: optimizedImageFiles.reduce((sum, file) => sum + file.size, 0),
            convertedPdfPageCount: convertedPdfImages.length,
            totalPdfPageCount: convertedPdfResult.totalPageCount,
            truncatedPdfPageCount,
            convertedPdfBytes: optimizedPdfImages.reduce((sum, file) => sum + file.size, 0),
            fileTypes: uploadFiles.map((file) => file.type),
          },
        });
        onAddImages(uploadFiles);
        if (truncatedPdfPageCount > 0) {
          const pdfAttachmentMessage = convertedPdfImages.length > 0
            ? `PDF는 앞 ${convertedPdfImages.length}장만 첨부했어요.`
            : "이미 첨부된 파일이 3장이라 PDF는 첨부하지 못했어요.";

          window.alert(
            `첨부파일은 최대 ${MAX_UPLOAD_FILES}장까지 업로드돼요.\n${pdfAttachmentMessage} ${MAX_UPLOAD_FILES}장 이후 내용은 스크린샷으로 별도로 업로드해주세요.`,
          );
        } else if (selectedFiles.length > uploadFiles.length) {
          window.alert(`첨부파일은 최대 ${MAX_UPLOAD_FILES}장까지 업로드돼요.`);
        }
      }
    } catch (error) {
      console.error("PDF 변환 실패", error);
      onTrackEvent({
        eventType: "pdf_convert_failed",
        severity: "error",
        step: "upload_screen.pdf_convert",
        message: error instanceof Error ? error.message : "PDF 변환 실패",
        metadata: {
          error: serializeErrorForLog(error),
          selectedPdfCount: pdfFiles.length,
        },
      });
      window.alert("PDF 파일을 이미지로 변환하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsConvertingPdf(false);
      event.target.value = "";
    }
  };

  return (
    <section className="page-stack">
      <div className="page-title-row with-back">
        <div className="page-title-leading">
          <PageBackButton onBack={onBack} />
          <div>
            <h1>알림장 파일을 올려주세요</h1>
            <p>사진과 PDF를 최대 3개까지 올릴 수 있고, 파일별로 취소할 수 있어요.</p>
          </div>
        </div>
      </div>

      <label className={images.length > 0 ? "upload-zone compact" : "upload-zone"}>
        <input
          accept="image/jpeg,image/png,application/pdf"
          className="hidden-input"
          multiple
          onChange={handleImageSelect}
          type="file"
        />
        <div className="upload-icon">
          <NoticePhotoIcon size={34} />
        </div>
        <strong>{isConvertingPdf ? "PDF를 준비하고 있어요" : images.length > 0 ? "파일 추가 선택" : "파일 선택"}</strong>
        <span>JPG, PNG, PDF 파일을 최대 3개까지 올릴 수 있어요.</span>
      </label>

      {images.length > 0 ? (
        <section className="upload-list-section">
          <div className="upload-list-header">
            <strong>첨부한 파일 {images.length}개</strong>
            <button onClick={onClearImages} type="button">
              전체 취소
            </button>
          </div>
          <div className="upload-preview-list">
            {images.map((image, index) => (
              <article className="upload-preview-item" key={image.id}>
                <img alt={`선택한 알림장 ${index + 1}`} src={image.previewUrl} />
                <button
                  aria-label={`${image.file.name} 첨부 취소`}
                  className="remove-image-inline"
                  onClick={() => onRemoveImage(image.id)}
                  type="button"
                >
                  <X size={18} />
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <Card title="알림장에서 찾을 내용">
        <div className="category-grid">
          {["일정", "준비물", "숙제", "제출물", "학부모 확인", "단순 안내"].map((item) => (
            <span className="category-pill" key={item}>
              {item}
            </span>
          ))}
        </div>
      </Card>

      <TossAdBanner
        adId="ait.v2.live.3dbb4427bbf84790"
        candidate="B"
        placement="알림장에서 찾을 내용 카드 아래"
      />

      <Button disabled={images.length === 0} size="l" onClick={onAnalyze}>
        AI 분석 실행
      </Button>
    </section>
  );
}

function AnalyzingScreen() {
  const steps = useMemo(
    () => ["알림장을 읽고 있어요", "날짜와 준비물을 찾고 있어요", "해야할 일을 정리하고 있어요"],
    [],
  );
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentStep((current) => Math.min(current + 1, steps.length - 1));
    }, 1300);

    return () => {
      window.clearInterval(interval);
    };
  }, [steps.length]);

  return (
    <section className="analyzing-screen">
      <div className="loader-circle">
        <Loader2 className="spin" size={42} />
      </div>
      <div className="page-title center">
        <h1>{steps[currentStep]}</h1>
        <p>잠시만 기다려주세요.</p>
      </div>
      <div className="analysis-steps">
        {steps.map((step, index) => (
          <div
            className={`analysis-step ${index === currentStep ? "active" : ""} ${
              index < currentStep ? "done" : ""
            }`}
            key={step}
          >
            <span>{index < currentStep ? <CheckCircle2 size={16} /> : index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function ErrorDialog({
  code,
  description,
  message,
  onClose,
}: {
  code?: string;
  description?: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-modal="true"
        className="error-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="error-dialog-icon">
          <AlertCircle size={24} />
        </div>
        <h2>{message}</h2>
        <p>{description ?? "잠시 후 다시 시도해주세요."}</p>
        {code ? <span className="error-dialog-code">오류 코드 {code}</span> : null}
        <button onClick={onClose} type="button">
          확인
        </button>
      </section>
    </div>
  );
}

function FamilyInviteSwitchDialog({
  existingChildrenCount,
  existingEventCount,
  existingTodoCount,
  invitedDisplayName,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  existingChildrenCount: number;
  existingEventCount: number;
  existingTodoCount: number;
  invitedDisplayName?: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const targetLabel = invitedDisplayName ? `${invitedDisplayName} 초대 가족` : "초대된 가족";

  return (
    <div className="dialog-backdrop" role="presentation" onClick={isSubmitting ? undefined : onCancel}>
      <section
        aria-modal="true"
        className="exit-dialog family-invite-switch-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="error-dialog-icon">
          <AlertCircle size={24} />
        </div>
        <h2>{targetLabel}으로 전환할까요?</h2>
        <p>
          지금 계정에 저장된 아이 정보와 준비물, 일정 화면은 더 이상 이 계정의 기본 화면에 보이지 않고
          초대한 가족의 정보로 바뀌어요.
        </p>
        <div className="family-invite-summary">
          <span>현재 저장된 정보</span>
          <strong>
            아이 {existingChildrenCount}명 · 할 일 {existingTodoCount}개 · 일정 {existingEventCount}개
          </strong>
        </div>
        <div className="exit-dialog-actions">
          <Button disabled={isSubmitting} onClick={onCancel} size="m" variant="weak">
            취소
          </Button>
          <Button disabled={isSubmitting} onClick={onConfirm} size="m">
            {isSubmitting ? "전환 중" : "확인하고 합류"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function ExitConfirmDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-modal="true"
        className="exit-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="error-dialog-icon">
          <AlertCircle size={24} />
        </div>
        <h2>앱을 종료할까요?</h2>
        <p>홈에서 뒤로가기를 누르면 알림장쏙이 종료돼요.</p>
        <div className="exit-dialog-actions">
          <Button onClick={onClose} size="m" variant="weak">
            계속 보기
          </Button>
          <Button onClick={onConfirm} size="m" variant="danger">
            종료하기
          </Button>
        </div>
      </section>
    </div>
  );
}

function ResultScreen({
  childrenProfiles,
  isSaving,
  onBack,
  result,
  onConfirm,
  onNavigate,
  onUpdateResult,
}: {
  childrenProfiles: Child[];
  isSaving: boolean;
  onBack: () => void;
  result: ParsedNoticeResult | null;
  onConfirm: () => void;
  onNavigate: (screen: Screen) => void;
  onUpdateResult: React.Dispatch<React.SetStateAction<ParsedNoticeResult | null>>;
}) {
  const [editingTodo, setEditingTodo] = useState<ParsedNoticeResult["todos"][number] | null>(null);

  if (!result) {
    return (
      <section className="page-stack">
        <div className="page-title-row with-back">
          <div className="page-title-leading">
            <PageBackButton onBack={onBack} />
            <div>
              <h1>분석 결과가 아직 없어요</h1>
              <p>알림장 사진을 먼저 업로드해주세요.</p>
            </div>
          </div>
        </div>
        <Button size="l" onClick={() => onNavigate("upload")}>
          업로드로 돌아가기
        </Button>
      </section>
    );
  }

  const todoGroups = [
    {
      title: "준비물",
      items: result.todos.filter((todo) => todo.category === "준비물"),
    },
    {
      title: "제출물",
      items: result.todos.filter((todo) => todo.category === "제출물"),
    },
    {
      title: "학부모 확인",
      items: result.todos.filter((todo) => todo.category === "학부모 확인"),
    },
    {
      title: "숙제",
      items: result.todos.filter((todo) => todo.category === "숙제"),
    },
    {
      title: "기타 할 일",
      items: result.todos.filter(
        (todo) => !["준비물", "제출물", "학부모 확인", "숙제"].includes(todo.category),
      ),
    },
  ].filter((group) => group.items.length > 0);

  const totalCount = result.calendarEvents.length + result.todos.length + result.infoOnlyItems.length;
  const defaultChildId = editingTodo?.childId || childrenProfiles[0]?.id || "";
  const editorTodo = editingTodo
    ? {
        id: editingTodo.id,
        childId: editingTodo.childId || defaultChildId,
        childName: editingTodo.childName || childrenProfiles[0]?.name || "아이",
        title: editingTodo.title,
        category: editingTodo.category,
        dueDate: editingTodo.dueDate,
        detail: editingTodo.detail,
        completed: false,
      }
    : null;

  const updateTodoCandidate = (todo: TodoItem) => {
    onUpdateResult((current) => {
      if (!current) return current;

      return {
        ...current,
        todos: current.todos.map((item) =>
          item.id === todo.id
            ? {
                ...item,
                title: todo.title,
                category: todo.category,
                dueDate: todo.dueDate,
                childId: todo.childId,
                childName: todo.childName,
                detail: todo.detail,
                needsUserConfirmation: false,
              }
            : item,
        ),
      };
    });
    setEditingTodo(null);
  };

  const deleteTodoCandidate = (todoId: string) => {
    onUpdateResult((current) => {
      if (!current) return current;

      return {
        ...current,
        todos: current.todos.filter((item) => item.id !== todoId),
      };
    });
    setEditingTodo(null);
  };

  return (
    <section className="page-stack">
      <div className="page-title-row with-back">
        <div className="page-title-leading">
          <PageBackButton onBack={onBack} />
          <div>
            <h1>알림장을 분류했어요</h1>
            <p>저장할 항목을 가볍게 확인해주세요.</p>
          </div>
        </div>
      </div>

      <section className="result-summary-card">
        <strong>총 {totalCount}개 항목</strong>
        <span>
          일정 {result.calendarEvents.length} · 할 일 {result.todos.length} · 안내 {result.infoOnlyItems.length}
        </span>
      </section>

      {result.warnings.length > 0 ? (
        <div className="notice-box warning-box">
          <AlertCircle size={18} />
          <span>{result.warnings.join(" ")}</span>
        </div>
      ) : null}

      {result.calendarEvents.length > 0 ? (
        <Card title="일정" count={result.calendarEvents.length}>
          {result.calendarEvents.map((event) => (
            <article className="review-compact-row" key={event.id}>
              <div className="icon-tile">
                <CalendarCuteIcon size={18} />
              </div>
              <div className="row-copy">
                <strong>{event.title}</strong>
                <span>
                  {event.date} · {event.time} · {event.childName}
                </span>
              </div>
              {event.needsUserConfirmation ? <span className="mini-warning">확인</span> : null}
            </article>
          ))}
        </Card>
      ) : null}

      {todoGroups.map((group) => (
        <Card title={group.title} count={group.items.length} key={group.title}>
          {group.items.map((todo) => (
            <button
              className={todo.needsUserConfirmation ? "review-compact-row warning" : "review-compact-row"}
              key={todo.id}
              onClick={() => setEditingTodo(todo)}
              type="button"
            >
              <span className="review-check-dot">
                <Circle size={20} />
              </span>
              <div className="row-copy">
                <strong>{todo.title}</strong>
                <span>
                  {todo.childName} · {displayTodoDueDate(todo.dueDate)}
                </span>
                {todo.detail ? <p>{todo.detail}</p> : null}
              </div>
              {todo.needsUserConfirmation ? <span className="mini-warning">확인</span> : null}
            </button>
          ))}
        </Card>
      ))}

      {result.infoOnlyItems.length > 0 ? (
        <Card title="단순 안내" count={result.infoOnlyItems.length}>
          <ul className="plain-list">
            {result.infoOnlyItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="action-pair">
        <Button disabled={isSaving} size="l" variant="weak" onClick={() => onNavigate("upload")}>
          다시 분석
        </Button>
        <Button disabled={isSaving} size="l" onClick={onConfirm}>
          {isSaving ? "저장 중..." : "확인하고 저장"}
        </Button>
      </div>

      {editorTodo && childrenProfiles.length > 0 ? (
        <TodoEditorSheet
          children={childrenProfiles}
          defaultChildId={defaultChildId}
          mode="edit"
          todo={editorTodo}
          onAddTodo={() => undefined}
          onClose={() => setEditingTodo(null)}
          onDeleteTodo={deleteTodoCandidate}
          onSaveTodo={updateTodoCandidate}
        />
      ) : null}
    </section>
  );
}

function TodoScreen({
  children,
  onBack,
  todos,
  onAddTodo,
  onDeleteTodo,
  onSaveTodo,
  onToggleTodo,
}: {
  children: Child[];
  onBack: () => void;
  todos: TodoItem[];
  onAddTodo: (todo: Omit<TodoItem, "id" | "completed">) => void;
  onDeleteTodo: (id: string) => void;
  onSaveTodo: (todo: TodoItem) => void;
  onToggleTodo: (id: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [selectedChild, setSelectedChild] = useState("all");
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [isAddingTodo, setIsAddingTodo] = useState(false);
  const filteredTodos = todos.filter((todo) => {
    const matchesChild = selectedChild === "all" || todo.childId === selectedChild;
    const matchesDate = filter === "all" || getTodoDateBucket(todo.dueDate) === filter;
    return matchesChild && matchesDate;
  });
  const activeTodos = filteredTodos.filter((todo) => !todo.completed);
  const doneTodos = filteredTodos.filter((todo) => todo.completed);

  return (
    <section className="page-stack">
      <div className="page-title-row with-back">
        <div className="page-title-leading">
          <PageBackButton onBack={onBack} />
          <div>
            <h1>할 일</h1>
            <p>dueDate 기준으로 정렬된 아이별 To-do</p>
          </div>
        </div>
        <button className="round-action" onClick={() => setIsAddingTodo(true)} type="button">
          <Plus size={22} />
        </button>
      </div>

      <ChildFilter
        children={children}
        selectedChild={selectedChild}
        onSelect={setSelectedChild}
      />

      <div className="segmented-row">
        {[
          ["all", "전체"],
          ["past", "지난"],
          ["today", "오늘"],
          ["tomorrow", "내일"],
          ["week", "이번 주"],
          ["later", "예정"],
          ["unscheduled", "미정"],
        ].map(([key, label]) => (
          <button
            className={filter === key ? "segment active" : "segment"}
            key={key}
            onClick={() => setFilter(key)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <Card title="해야 할 일" count={activeTodos.length}>
        {activeTodos.map((todo) => (
          <TodoCheckRow
            key={todo.id}
            todo={todo}
            onEditTodo={setEditingTodo}
            onToggleTodo={onToggleTodo}
          />
        ))}
        {activeTodos.length === 0 ? <EmptyState text="해야 할 일이 없어요." /> : null}
      </Card>

      <Card title="완료한 일" count={doneTodos.length}>
        {doneTodos.map((todo) => (
          <TodoCheckRow
            key={todo.id}
            todo={todo}
            onEditTodo={setEditingTodo}
            onToggleTodo={onToggleTodo}
          />
        ))}
        {doneTodos.length === 0 ? <EmptyState text="완료한 일이 아직 없어요." /> : null}
      </Card>
      {(editingTodo || isAddingTodo) && children.length > 0 ? (
        <TodoEditorSheet
          children={children}
          defaultChildId={selectedChild === "all" ? children[0].id : selectedChild}
          mode={editingTodo ? "edit" : "add"}
          todo={editingTodo}
          onAddTodo={(todo) => {
            onAddTodo(todo);
            setIsAddingTodo(false);
          }}
          onClose={() => {
            setEditingTodo(null);
            setIsAddingTodo(false);
          }}
          onDeleteTodo={(id) => {
            onDeleteTodo(id);
            setEditingTodo(null);
          }}
          onSaveTodo={(todo) => {
            onSaveTodo(todo);
            setEditingTodo(null);
          }}
        />
      ) : null}
    </section>
  );
}

function ChildrenScreen({
  children,
  onBack,
  onEditChild,
  onNavigate,
}: {
  children: Child[];
  onBack: () => void;
  onEditChild: (child: Child) => void;
  onNavigate: (screen: Screen) => void;
}) {
  return (
    <section className="page-stack">
      <div className="page-title-row with-back">
        <div className="page-title-leading">
          <PageBackButton onBack={onBack} />
          <div>
            <h1>아이 정보</h1>
            <p>아이별 학교, 학년, 반 정보를 관리합니다.</p>
          </div>
        </div>
        <button className="round-action" onClick={() => onNavigate("add-child")} type="button">
          <Plus size={22} />
        </button>
      </div>

      {children.map((child) => (
        <button
          aria-label={`${child.name} 아이 정보 수정`}
          className="child-card child-card-button"
          key={child.id}
          onClick={() => onEditChild(child)}
          type="button"
        >
          <div className="row-top">
            <div>
              <strong>{child.name}</strong>
              <p>
                {child.school} {child.grade} {child.className}
              </p>
            </div>
            <ChevronRight size={20} />
          </div>
          <InfoLine label="학교/기관" value={child.school ?? "-"} />
          <InfoLine label="학년/반" value={`${child.grade ?? "-"} ${child.className ?? ""}`.trim()} />
        </button>
      ))}

      <button className="setting-link" onClick={() => onNavigate("notifications")} type="button">
        <AssetIcon src="/icons/bell.svg" size={20} />
        <span>가족 공통 알림 설정</span>
        <ChevronRight size={18} />
      </button>
    </section>
  );
}

function ChildSetupScreen({
  child,
  mode,
  onBack,
  onAddChild,
  onDeleteChild,
}: {
  child?: Child;
  mode: "first" | "add" | "edit";
  onBack?: () => void;
  onAddChild: (child: Child) => void;
  onDeleteChild?: (child: Child) => Promise<void> | void;
}) {
  const [name, setName] = useState(child?.name ?? "");
  const [school, setSchool] = useState(child?.school ?? "");
  const [grade, setGrade] = useState(child?.grade ?? "");
  const [className, setClassName] = useState(child?.className ?? "");
  const [avatar, setAvatar] = useState(child?.avatar ?? characterOptions[0].id);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setName(child?.name ?? "");
    setSchool(child?.school ?? "");
    setGrade(child?.grade ?? "");
    setClassName(child?.className ?? "");
    setAvatar(child?.avatar ?? characterOptions[0].id);
  }, [child]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    onAddChild({
      id: child?.id ?? `child-${Date.now()}`,
      name: name.trim(),
      school: school.trim() || undefined,
      grade: grade.trim() || undefined,
      className: className.trim() || undefined,
      avatar,
      calendarName: "primary",
    });
  };

  const handleDelete = async () => {
    if (!child || !onDeleteChild || isDeleting) return;
    if (!window.confirm(`${child.name} 프로필을 삭제할까요? 등록된 일정과 할 일 정보도 함께 정리돼요.`)) return;

    setIsDeleting(true);
    try {
      await onDeleteChild(child);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className={mode === "first" ? "onboarding-screen setup-screen" : "page-stack setup-page"}>
      {mode === "first" ? (
        <div className="setup-hero">
          <h1>우리 아이 정보를 입력해주세요.</h1>
        </div>
      ) : (
        <div className="page-title-row with-back">
          <div className="page-title-leading">
            {onBack ? <PageBackButton onBack={onBack} /> : null}
            <div>
              <h1>{mode === "edit" ? "아이 정보 수정" : "자녀 추가"}</h1>
              <p>{mode === "edit" ? "프로필 정보를 수정하고 저장할 수 있어요." : "새 자녀 정보를 등록할 수 있어요."}</p>
            </div>
          </div>
        </div>
      )}

      <form className="form-stack" onSubmit={submit}>
        <button className="character-stage" onClick={() => setIsAvatarPickerOpen(true)} type="button">
          <div className="selected-character">
            <KidAvatar avatarId={avatar} size={76} />
          </div>
          <div>
            <strong>{name.trim() || "아이 이름"}</strong>
            <span>
              {school.trim() || "기관명"} · {className.trim() || "반 이름"}
            </span>
          </div>
        </button>

        <Field label="아이 이름" required>
          <input
            maxLength={20}
            onChange={(event) => setName(event.target.value)}
            placeholder="예) 안유이"
            value={name}
          />
        </Field>
        <Field label="학교/기관명">
          <input
            onChange={(event) => setSchool(event.target.value)}
            placeholder="예) 해솔초등학교"
            value={school}
          />
        </Field>
        <div className="form-grid">
          <Field label="학년 또는 나이 구분">
            <input
              onChange={(event) => setGrade(event.target.value)}
              placeholder="예) 7세 or 초2"
              value={grade}
            />
          </Field>
          <Field label="반 이름">
            <input
              onChange={(event) => setClassName(event.target.value)}
              placeholder="예) 햇살반"
              value={className}
            />
          </Field>
        </div>
        <div className={`setup-fixed-action ${mode === "edit" ? "split" : ""}`.trim()}>
          {mode === "edit" ? (
            <Button disabled={isDeleting} onClick={handleDelete} size="l" variant="danger">
              프로필 삭제
            </Button>
          ) : null}
          <Button disabled={!name.trim() || isDeleting} size="l" type="submit">
            {mode === "first" ? "알림장쏙 시작하기" : mode === "edit" ? "저장하기" : "자녀 추가하기"}
          </Button>
        </div>
      </form>

      {isAvatarPickerOpen ? (
        <div className="avatar-modal-backdrop" role="presentation" onClick={() => setIsAvatarPickerOpen(false)}>
          <section
            aria-label="아이 캐릭터 선택"
            className="avatar-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="avatar-modal-header">
              <SheetCloseButton onClose={() => setIsAvatarPickerOpen(false)} />
            </div>
            <div className="character-grid">
              {characterOptions.map((option) => (
                <button
                  aria-label={option.label}
                  className={avatar === option.id ? "character-option active" : "character-option"}
                  key={option.id}
                  onClick={() => {
                    setAvatar(option.id);
                    setIsAvatarPickerOpen(false);
                  }}
                  type="button"
                >
                  <KidAvatar avatarId={option.id} size={78} />
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function SettingsScreen({
  children,
  currentUserId,
  familyMembers,
  isConnectingTossLogin,
  onBack,
  onDeleteChild,
  onConnectTossLogin,
  onEditChild,
  onNavigate,
  onRemoveMember,
  onShareInvite,
  tossLoginStatusMessage,
  tossUserKey,
}: {
  children: Child[];
  currentUserId: string | null;
  familyMembers: FamilyMember[];
  isConnectingTossLogin: boolean;
  onBack: () => void;
  onDeleteChild: (child: Child) => void;
  onConnectTossLogin: () => void;
  onEditChild: (child: Child) => void;
  onNavigate: (screen: Screen) => void;
  onRemoveMember: (userId: string) => void;
  onShareInvite: () => void;
  tossLoginStatusMessage: string | null;
  tossUserKey: string | null;
}) {
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const canViewBugEvents = currentUserId !== null && OPERATOR_USER_IDS.has(currentUserId);
  const isTossLoginConnected = Boolean(tossUserKey);
  const getFamilyMemberLabel = (member: FamilyMember) => {
    if (member.displayName?.trim()) return member.displayName.trim();
    return member.role === "owner" ? "소유자" : "가족";
  };
  const deleteChild = async (child: Child) => {
    setSelectedChild(null);

    try {
      await deleteSupabaseChild(child.id);
    } catch {
      // Supabase 삭제가 안 되더라도 설정 화면에서는 즉시 정리합니다.
    }
    onDeleteChild(child);
  };

  return (
    <section className="page-stack">
      <div className="page-title-row with-back">
        <div className="page-title-leading">
          <PageBackButton onBack={onBack} />
          <div>
            <h1>설정</h1>
            <p>알림과 가족 공유를 한 곳에서 관리해요.</p>
          </div>
        </div>
      </div>

      <Card title="아이 정보">
        {children.map((child) => (
          <button
            className="member-row settings-detail-trigger"
            key={child.id}
            onClick={() => setSelectedChild(child)}
            type="button"
          >
            <div className="settings-child">
              <span className="settings-avatar">
                <KidAvatar avatarId={child.avatar} size={34} />
              </span>
              <div>
                <strong>{child.name}</strong>
                <span>{child.school ?? "기관 미입력"} · {child.className ?? "반 미입력"}</span>
              </div>
            </div>
            <ChevronRight size={18} />
          </button>
        ))}
      </Card>

      <button className="setting-link" onClick={() => onNavigate("notifications")} type="button">
        <AssetIcon src="/icons/bell.svg" size={20} />
        <span>앱인토스 알림 설정</span>
        <ChevronRight size={18} />
      </button>
      <button className="setting-link" onClick={onConnectTossLogin} type="button">
        <AssetIcon src="/icons/settings.svg" size={20} />
        <div className="setting-link-copy">
          <span className="setting-link-title">토스 로그인 연결</span>
          <span className="setting-link-caption">
            {isTossLoginConnected
              ? "알림 발송용 토스 계정 연결이 완료되었어요."
              : "알림 발송을 위해 토스 계정을 연결해주세요."}
          </span>
        </div>
        <span className={`status-chip ${isTossLoginConnected ? "success" : "warning"}`}>
          {isConnectingTossLogin ? "연결 중" : isTossLoginConnected ? "연결 완료" : "연결 필요"}
        </span>
      </button>
      {canViewBugEvents ? (
        <button className="setting-link" onClick={() => onNavigate("bug-events")} type="button">
          <AlertCircle size={20} />
          <span>버그 현황</span>
          <ChevronRight size={18} />
        </button>
      ) : null}
      <button className="setting-link" onClick={onShareInvite} type="button">
        <AssetIcon src="/icons/invite.svg" size={20} />
        <span>가족 초대하기</span>
        <ChevronRight size={18} />
      </button>

      <Card title="가족 구성원">
        {familyMembers.map((member) => (
          <article className="member-row" key={member.userId}>
            <div>
              <strong>{getFamilyMemberLabel(member)}</strong>
            </div>
            {member.role === "owner" ? (
              <span className="status-chip owner">소유자</span>
            ) : (
              <button
                className="status-chip member-remove"
                onClick={() => onRemoveMember(member.userId)}
                type="button"
              >
                연결 해제
              </button>
            )}
          </article>
        ))}
      </Card>
      {tossLoginStatusMessage ? (
        <div className="notice-box">
          <AlertCircle size={18} />
          <span>{tossLoginStatusMessage}</span>
        </div>
      ) : null}
      {selectedChild ? (
        <ChildDetailSheet
          child={selectedChild}
          onClose={() => setSelectedChild(null)}
          onDelete={() => {
            void deleteChild(selectedChild);
          }}
          onEdit={() => {
            const childToEdit = selectedChild;
            setSelectedChild(null);
            onEditChild(childToEdit);
          }}
        />
      ) : null}
    </section>
  );
}

function BugDashboardScreen({ onBack }: { onBack: () => void }) {
  const [logs, setLogs] = useState<BugEventLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadLogs = async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const nextLogs = await fetchBugEventLogs(80);
      setLogs(Array.isArray(nextLogs) ? nextLogs : []);
    } catch (error) {
      setLogs([]);
      setLoadError(error instanceof Error ? error.message : "버그 로그를 불러오지 못했어요.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  const last24Hours = useMemo(() => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return logs.filter((log) => new Date(log.created_at).getTime() >= since);
  }, [logs]);

  const summary = useMemo(() => {
    const errors24h = last24Hours.filter((log) => log.severity === "error").length;
    const warnings24h = last24Hours.filter((log) => log.severity === "warning").length;
    const pendingExport = logs.filter((log) => !log.exported_at).length;
    const exportFailed = logs.filter((log) => Boolean(log.last_export_error)).length;
    return { errors24h, warnings24h, pendingExport, exportFailed };
  }, [last24Hours, logs]);

  const topSteps = useMemo(() => {
    const counts = new Map<string, number>();
    last24Hours.forEach((log) => {
      const key = log.step ?? "step 없음";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5);
  }, [last24Hours]);

  const formatWhen = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "시간 정보 없음";
    }

    return new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);
  };

  const getErrorCode = (log: BugEventLog) => {
    const metadata = log.metadata ?? {};
    const errorCode = metadata.errorCode;
    return typeof errorCode === "string" && errorCode.trim()
      ? errorCode
      : log.step?.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase() ?? "UNKNOWN";
  };

  return (
    <section className="page-stack">
      <div className="page-title-row with-back">
        <div className="page-title-leading">
          <PageBackButton onBack={onBack} />
          <div>
            <h1>버그 현황</h1>
            <p>서비스 전체 계정에서 들어온 오류와 시트 적재 상태를 확인해요.</p>
          </div>
        </div>
        <button className="round-action secondary" onClick={() => void loadLogs()} type="button">
          <RefreshCw size={18} />
        </button>
      </div>

      <section className="bug-metric-grid">
        <article className="bug-metric-card">
          <span>24시간 오류</span>
          <strong>{summary.errors24h}</strong>
        </article>
        <article className="bug-metric-card">
          <span>24시간 경고</span>
          <strong>{summary.warnings24h}</strong>
        </article>
        <article className="bug-metric-card">
          <span>시트 미전송</span>
          <strong>{summary.pendingExport}</strong>
        </article>
        <article className="bug-metric-card">
          <span>전송 실패</span>
          <strong>{summary.exportFailed}</strong>
        </article>
      </section>

      {loadError ? (
        <div className="notice-box error">
          <AlertCircle size={18} />
          <span>{loadError}</span>
        </div>
      ) : null}

      <Card title="많이 발생한 단계" count={topSteps.length}>
        {topSteps.map(([step, count]) => (
          <article className="bug-step-row" key={step}>
            <strong>{step}</strong>
            <span>{count}건</span>
          </article>
        ))}
        {!isLoading && topSteps.length === 0 ? <EmptyState text="최근 24시간 버그 로그가 없어요." /> : null}
      </Card>

      <Card title="최근 로그" count={logs.length}>
        {isLoading ? (
          <div className="notice-box compact">
            <Loader2 className="spin" size={16} />
            <span>버그 로그를 불러오고 있어요.</span>
          </div>
        ) : null}

        {!isLoading && logs.length === 0 ? <EmptyState text="아직 기록된 버그 로그가 없어요." /> : null}

        {!isLoading
          ? logs.slice(0, 20).map((log) => (
              <article className="bug-log-row" key={log.id}>
                <div className="bug-log-row-top">
                  <strong>{log.message ?? log.event_type}</strong>
                  <span className={`status-chip ${log.severity === "error" ? "warning" : ""}`}>
                    {log.severity}
                  </span>
                </div>
                <div className="bug-log-meta">
                  <span>{formatWhen(log.created_at)}</span>
                  <span>{log.screen ?? "screen 없음"}</span>
                  <span>{log.step ?? "step 없음"}</span>
                  <span>{getErrorCode(log)}</span>
                </div>
                <div className="bug-log-footer">
                  <span>{log.exported_at ? "시트 전송 완료" : "시트 전송 대기"}</span>
                  {log.last_export_error ? <span>{log.last_export_error}</span> : null}
                </div>
              </article>
            ))
          : null}
      </Card>
    </section>
  );
}

function Button({
  children,
  disabled,
  onClick,
  size = "l",
  type = "button",
  variant,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  size?: "m" | "l";
  type?: "button" | "submit";
  variant?: "weak" | "danger";
}) {
  return (
    <button
      className={`app-button ${variant === "weak" ? "weak" : ""} ${variant === "danger" ? "danger" : ""} ${size === "m" ? "medium" : ""}`.trim()}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

function SheetCloseButton({ onClose }: { onClose: () => void }) {
  const handleClose = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  const stopPointerEvent = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <button
      aria-label="닫기"
      className="sheet-close-button"
      onClick={handleClose}
      onPointerDown={stopPointerEvent}
      type="button"
    >
      <X size={20} />
    </button>
  );
}

function PageBackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      aria-label="이전 화면으로 돌아가기"
      className="page-back-button"
      onClick={onBack}
      type="button"
    >
      <ChevronLeft size={22} />
    </button>
  );
}

function ChildDetailSheet({
  child,
  onClose,
  onDelete,
  onEdit,
}: {
  child: Child;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="아이 정보 상세"
        className="bottom-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <div>
            <h2>{child.name}</h2>
            <p>등록된 아이 정보를 확인하고 정리할 수 있어요.</p>
          </div>
          <SheetCloseButton onClose={onClose} />
        </div>
        <div className="child-detail-sheet">
          <div className="child-detail-hero">
            <span className="child-detail-avatar">
              <KidAvatar avatarId={child.avatar} size={54} />
            </span>
            <div>
              <strong>{child.name}</strong>
              <span>{child.school ?? "기관 미입력"} · {child.className ?? "반 미입력"}</span>
            </div>
          </div>
          <div className="child-detail-grid">
            <InfoLine label="학년/나이" value={child.grade ?? "-"} />
            <InfoLine label="반 이름" value={child.className ?? "-"} />
          </div>
          <div className="sheet-actions">
            <button className="primary-action" onClick={onEdit} type="button">
              수정하기
            </button>
            <button className="danger-action" onClick={onDelete} type="button">
              삭제
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function EventDetailSheet({
  event,
  onClose,
  onDelete,
}: {
  event: CalendarEventItem;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="일정 상세"
        className="bottom-sheet"
        onClick={(nextEvent) => nextEvent.stopPropagation()}
      >
        <div aria-hidden="true" className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <h2>{event.title}</h2>
            <p>일정 정보를 확인하고 필요하면 삭제할 수 있어요.</p>
          </div>
          <SheetCloseButton onClose={onClose} />
        </div>
        <div className="todo-detail-panel">
          <strong>{event.title}</strong>
          <div className="todo-detail-meta">
            <span>{event.childName}</span>
            <span>{event.date}</span>
            <span>{event.time}</span>
            {event.location ? <span>{event.location}</span> : null}
          </div>
          <p>
            {event.location
              ? `${event.childName} 일정이에요. ${event.date} ${event.time}에 ${event.location}에서 진행돼요.`
              : `${event.childName} 일정이에요. ${event.date} ${event.time}에 진행돼요.`}
          </p>
          <div className="sheet-actions">
            <button className="secondary-action" onClick={onClose} type="button">
              닫기
            </button>
            <button className="danger-action" onClick={onDelete} type="button">
              삭제
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function AvatarPickerSheet({
  currentAvatarId,
  onClose,
  onSelectAvatar,
}: {
  currentAvatarId: string;
  onClose: () => void;
  onSelectAvatar: (avatarId: string) => void;
}) {
  return (
    <div className="avatar-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="프로필 사진 선택"
        className="avatar-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="avatar-modal-header avatar-picker-header">
          <div>
            <strong>프로필 사진 변경</strong>
            <span>사진만 골라서 바로 바꿀 수 있어요.</span>
          </div>
          <SheetCloseButton onClose={onClose} />
        </div>
        <div className="character-grid">
          {characterOptions.map((option) => (
            <button
              aria-label={option.label}
              className={currentAvatarId === option.id ? "character-option active" : "character-option"}
              key={option.id}
              onClick={() => onSelectAvatar(option.id)}
              type="button"
            >
              <KidAvatar avatarId={option.id} size={78} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function NotificationsScreen({
  consentSnapshot,
  isConnectingTossLogin,
  onBack,
  onConnectTossLogin,
  onPreferencesUpdated,
  onSnapshotUpdated,
  onRequestConsentPrompt,
  tossLoginStatusMessage,
  tossUserKey,
}: {
  consentSnapshot: LocalNotificationPreferenceState;
  isConnectingTossLogin: boolean;
  onBack: () => void;
  onConnectTossLogin: () => void;
  onPreferencesUpdated: (preferences: NotificationPreferences) => void;
  onSnapshotUpdated: (state: LocalNotificationPreferenceState) => void;
  onRequestConsentPrompt: (draft: LocalNotificationPreferenceState) => void;
  tossLoginStatusMessage: string | null;
  tossUserKey: string | null;
}) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(consentSnapshot.enabled);
  const [preparationDay, setPreparationDay] = useState<"before" | "same-day">(consentSnapshot.preparationDay);
  const [preparationTime, setPreparationTime] = useState(consentSnapshot.preparationTime);
  const [morningTime, setMorningTime] = useState(consentSnapshot.morningTime);
  const [scheduleEnabled, setScheduleEnabled] = useState(consentSnapshot.scheduleEnabled);
  const [scheduleDay, setScheduleDay] = useState<"before" | "same-day">(consentSnapshot.scheduleDay);
  const [scheduleTime, setScheduleTime] = useState(consentSnapshot.scheduleTime);
  const [isSavingNotificationPrefs, setIsSavingNotificationPrefs] = useState(false);
  const [notificationSyncMessage, setNotificationSyncMessage] = useState<string | null>(null);
  const isTossLoginConnected = Boolean(tossUserKey);
  const hasRequestedAgreementPromptRef = useRef(false);

  useEffect(() => {
    setNotificationsEnabled(consentSnapshot.enabled);
    setPreparationDay(consentSnapshot.preparationDay);
    setPreparationTime(consentSnapshot.preparationTime);
    setMorningTime(consentSnapshot.morningTime);
    setScheduleEnabled(consentSnapshot.scheduleEnabled);
    setScheduleDay(consentSnapshot.scheduleDay);
    setScheduleTime(consentSnapshot.scheduleTime);
  }, [consentSnapshot]);

  useEffect(() => {
    if (hasRequestedAgreementPromptRef.current) return;
    if (!isTossLoginConnected) return;
    if (!notificationsEnabled && !scheduleEnabled) return;
    if (!shouldPromptForNotificationConsent(consentSnapshot)) return;

    hasRequestedAgreementPromptRef.current = true;
    onRequestConsentPrompt({
      ...consentSnapshot,
      enabled: true,
      preparationDay,
      preparationTime,
      morningTime,
      scheduleEnabled: true,
      scheduleDay,
      scheduleTime,
    });
  }, [
    consentSnapshot,
    isTossLoginConnected,
    morningTime,
    notificationsEnabled,
    onRequestConsentPrompt,
    preparationDay,
    preparationTime,
    scheduleDay,
    scheduleEnabled,
    scheduleTime,
  ]);

  useEffect(() => {
    let ignore = false;

    if (!isSupabaseConfigured) {
      return () => {
        ignore = true;
      };
    }

    void (async () => {
      try {
        await connectAppsInTossUser();
        const prefs = await getSupabaseNotificationPreferences();
        if (!prefs || ignore) return;

        const nextLocalState = notificationPreferencesToLocalState(prefs);
        setNotificationsEnabled(prefs.enabled);
        setPreparationDay(prefs.preparationDay);
        setPreparationTime(prefs.preparationTime);
        setMorningTime(prefs.morningTime);
        setScheduleEnabled(prefs.scheduleEnabled);
        setScheduleDay(prefs.scheduleDay);
        setScheduleTime(prefs.scheduleTime);
        onSnapshotUpdated(nextLocalState);
        persistLocalNotificationPreferenceState(nextLocalState);
      } catch {
        if (!ignore) {
          setNotificationSyncMessage("현재는 기기 설정으로 저장되고 있어요.");
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [onSnapshotUpdated]);

  const applyNotificationPreferences = (prefs: NotificationPreferences) => {
    setNotificationsEnabled(prefs.enabled);
    setPreparationDay(prefs.preparationDay);
    setPreparationTime(prefs.preparationTime);
    setMorningTime(prefs.morningTime);
    setScheduleEnabled(prefs.scheduleEnabled);
    setScheduleDay(prefs.scheduleDay);
    setScheduleTime(prefs.scheduleTime);
    onPreferencesUpdated(prefs);
  };

  const saveNotificationPreferences = async (
    next: Partial<{
      enabled: boolean;
      preparationDay: "before" | "same-day";
      preparationTime: string;
      morningTime: string;
      scheduleEnabled: boolean;
      scheduleDay: "before" | "same-day";
      scheduleTime: string;
    }>,
  ) => {
    const merged = {
      enabled: next.enabled ?? notificationsEnabled,
      preparationDay: next.preparationDay ?? preparationDay,
      preparationTime: next.preparationTime ?? preparationTime,
      morningTime: next.morningTime ?? morningTime,
      scheduleEnabled: next.scheduleEnabled ?? scheduleEnabled,
      scheduleDay: next.scheduleDay ?? scheduleDay,
      scheduleTime: next.scheduleTime ?? scheduleTime,
    };

    setNotificationsEnabled(merged.enabled);
    setPreparationDay(merged.preparationDay);
    setPreparationTime(merged.preparationTime);
    setMorningTime(merged.morningTime);
    setScheduleEnabled(merged.scheduleEnabled);
    setScheduleDay(merged.scheduleDay);
    setScheduleTime(merged.scheduleTime);
    persistLocalNotificationPreferenceState({
      ...consentSnapshot,
      ...merged,
    });
    onSnapshotUpdated({
      ...consentSnapshot,
      ...merged,
    });
    void trackBugEvent({
      eventType: "notification_settings_changed",
      severity: "info",
      screen: "notifications",
      step: "notification_settings.local_change",
      message: "알림 설정 값이 변경되었어요.",
      metadata: merged,
    });

    if (!isSupabaseConfigured) return;

    setIsSavingNotificationPrefs(true);
    setNotificationSyncMessage(null);

    try {
      await connectAppsInTossUser();
      const saved = await saveSupabaseNotificationPreferences({
        enabled: merged.enabled,
        preparationDay: merged.preparationDay,
        preparationTime: merged.preparationTime,
        morningTime: merged.morningTime,
        scheduleEnabled: merged.scheduleEnabled,
        scheduleDay: merged.scheduleDay,
        scheduleTime: merged.scheduleTime,
      });

      applyNotificationPreferences(saved);
      setNotificationSyncMessage(
        merged.enabled
          ? "알림 설정을 저장했어요."
          : "알림 설정을 껐어요.",
      );
      void trackBugEvent({
        eventType: "notification_settings_saved",
        severity: "info",
        screen: "notifications",
        step: "notification_settings.remote_save",
        message: "알림 설정이 서버에 저장되었어요.",
        metadata: merged,
      });
    } catch (error) {
      void trackBugEvent({
        eventType: "notification_settings_save_failed",
        severity: "error",
        screen: "notifications",
        step: "notification_settings.remote_save",
        message: error instanceof Error ? error.message : "알림 설정 저장 실패",
        metadata: {
          error: serializeErrorForLog(error),
          ...merged,
        },
      });
      setNotificationSyncMessage(
        getUserFacingServiceErrorMessage(
          error,
          "알림 설정을 저장하지 못했어요. 잠시 후 다시 시도해주세요.",
        ),
      );
    } finally {
      setIsSavingNotificationPrefs(false);
    }
  };

  return (
    <section className="page-stack">
      <div className="page-title-row with-back">
        <div className="page-title-leading">
          <PageBackButton onBack={onBack} />
          <div>
            <h1>알림 설정</h1>
          </div>
        </div>
      </div>

      <article className="child-card notification-settings-card">
        <div className="row-top">
          <strong>내 알림 시간</strong>
          <label className="toggle-switch">
            <input
              checked={notificationsEnabled}
              onChange={(event) => {
                if (event.target.checked && !isTossLoginConnected) {
                  setNotificationSyncMessage("알림을 받으려면 먼저 토스 로그인 연결이 필요해요.");
                  onConnectTossLogin();
                  return;
                }
                if (event.target.checked && shouldPromptForNotificationConsent(consentSnapshot)) {
                  onRequestConsentPrompt({
                    ...consentSnapshot,
                    enabled: true,
                    preparationDay,
                    preparationTime,
                    morningTime,
                    scheduleEnabled: true,
                    scheduleDay,
                    scheduleTime,
                  });
                  return;
                }
                void saveNotificationPreferences({
                  enabled: event.target.checked,
                  scheduleEnabled: event.target.checked ? true : scheduleEnabled,
                });
              }}
              type="checkbox"
            />
            <span aria-hidden="true" />
          </label>
        </div>
        <label className="notification-control">
          <span>준비 사항 알림</span>
          <div>
            <TossSelect
              disabled={!notificationsEnabled}
              label="준비 사항 알림 기준"
              onChange={(value) => {
                void saveNotificationPreferences({
                  preparationDay: value as "before" | "same-day",
                });
              }}
              options={[
                { label: "전날", value: "before" },
                { label: "당일", value: "same-day" },
              ]}
              value={preparationDay}
            />
            <input
              disabled={!notificationsEnabled}
              onChange={(event) => {
                void saveNotificationPreferences({ preparationTime: event.target.value });
              }}
              type="time"
              value={preparationTime}
            />
          </div>
        </label>
        <label className="notification-control">
          <span>당일 리마인드</span>
          <input
            disabled={!notificationsEnabled}
            onChange={(event) => {
              void saveNotificationPreferences({ morningTime: event.target.value });
            }}
            type="time"
            value={morningTime}
          />
        </label>
        <div className="notification-subsection">
          <div className="notification-subsection-header">
            <strong>일정 알림</strong>
            <label className="toggle-switch">
              <input
                checked={scheduleEnabled}
                disabled={!notificationsEnabled}
                onChange={(event) => {
                  void saveNotificationPreferences({ scheduleEnabled: event.target.checked });
                }}
                type="checkbox"
              />
              <span aria-hidden="true" />
            </label>
          </div>
          <p className="notification-helper">
            이번 주 일정에 등록된 이벤트가 있을 때만 전날 또는 당일에 알려드려요.
          </p>
          <label className="notification-control">
            <span>일정 알림 기준</span>
            <div>
              <TossSelect
                disabled={!notificationsEnabled || !scheduleEnabled}
                label="일정 알림 기준"
                onChange={(value) => {
                  void saveNotificationPreferences({
                    scheduleDay: value as "before" | "same-day",
                  });
                }}
                options={[
                  { label: "전날", value: "before" },
                  { label: "당일", value: "same-day" },
                ]}
                value={scheduleDay}
              />
              <input
                disabled={!notificationsEnabled || !scheduleEnabled}
                onChange={(event) => {
                  void saveNotificationPreferences({ scheduleTime: event.target.value });
                }}
                type="time"
                value={scheduleTime}
              />
            </div>
          </label>
        </div>
      </article>

      {!isTossLoginConnected ? (
        <div className="notice-box">
          <AlertCircle size={18} />
          <span>실제 알림 수신을 위해 토스 로그인 연결이 필요해요.</span>
          <button
            className="detail-link-button"
            disabled={isConnectingTossLogin}
            onClick={() => onConnectTossLogin()}
            type="button"
          >
            {isConnectingTossLogin ? "연결 중..." : "지금 연결하기"}
          </button>
        </div>
      ) : null}

      {notificationSyncMessage ? (
        <div className="notice-box">
          <AlertCircle size={18} />
          <span>{notificationSyncMessage}</span>
        </div>
      ) : null}

      {tossLoginStatusMessage ? (
        <div className="notice-box">
          <CheckCircle2 size={18} />
          <span>{tossLoginStatusMessage}</span>
        </div>
      ) : null}

      {isSavingNotificationPrefs ? (
        <div className="notice-box compact">
          <Loader2 className="spin" size={16} />
          <span>알림 설정을 서버에 저장하고 있어요.</span>
        </div>
      ) : null}
    </section>
  );
}

function NotificationConsentSheet({
  isSubmitting,
  message,
  source,
  onAccept,
  onClose,
  onDecline,
}: {
  isSubmitting: boolean;
  message: string | null;
  source: NotificationConsentPromptSource;
  onAccept: () => void;
  onClose: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="준비물 및 일정 알림 동의"
        className="bottom-sheet notification-consent-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <div>
            <h2>준비물과 일정 알림도 받아볼까요?</h2>
            <p>
              {source === "post-save"
                ? "이번 알림장 저장을 기준으로 준비물 확인과 다가오는 일정 알림을 보내드릴게요."
                : "알림을 켜면 준비물 확인과 이번 주 일정 리마인드 알림을 받을 수 있어요."}
            </p>
          </div>
          <SheetCloseButton onClose={onClose} />
        </div>

        <div className="notification-consent-card">
          <strong>받게 되는 알림</strong>
          <ul className="plain-list consent-list">
            <li>내일 챙길 준비물이 있는지 저녁에 알려드려요.</li>
            <li>오늘 챙길 준비물을 아침에 마지막으로 확인해드려요.</li>
            <li>준비물이 없거나 모두 챙긴 날도 놓친 내용이 없는지 가볍게 체크해드려요.</li>
            <li>이번 주 일정이 있으면 전날이나 당일에 잊지 않도록 다시 알려드려요.</li>
          </ul>
        </div>

        {message ? (
          <div className="notice-box compact">
            <AlertCircle size={16} />
            <span>{message}</span>
          </div>
        ) : null}

        <div className="sheet-actions">
          <button className="secondary-action" disabled={isSubmitting} onClick={onDecline} type="button">
            나중에
          </button>
          <button className="primary-sheet-action" disabled={isSubmitting} onClick={onAccept} type="button">
            {isSubmitting ? "저장 중..." : "동의하고 알림받기"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ChildFilter({
  children,
  selectedChild,
  onSelect,
}: {
  children: Child[];
  selectedChild: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="filter-row">
      <button
        className={selectedChild === "all" ? "filter-chip active" : "filter-chip"}
        onClick={() => onSelect("all")}
        type="button"
      >
        전체
      </button>
      {children.map((child) => (
        <button
          className={selectedChild === child.id ? "filter-chip active" : "filter-chip"}
          key={child.id}
          onClick={() => onSelect(child.id)}
          type="button"
        >
          {child.name}
        </button>
      ))}
    </div>
  );
}

function Card({
  action,
  title,
  count,
  children,
}: {
  action?: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
        <div className="card-header-actions">
          {typeof count === "number" ? <span>{count}개</span> : null}
          {action}
        </div>
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

interface TossSelectOption {
  label: string;
  value: string;
}

function TossSelect({
  disabled = false,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: TossSelectOption[];
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <>
      <button
        aria-label={`${label} 선택`}
        className="toss-select-trigger"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <span>{selectedOption?.label ?? "선택"}</span>
        <ChevronDown aria-hidden="true" size={18} />
      </button>

      {isOpen ? (
        <div className="bottom-sheet-backdrop" role="presentation" onClick={() => setIsOpen(false)}>
          <section
            aria-label={`${label} 선택`}
            aria-modal="true"
            className="bottom-sheet select-sheet"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header select-sheet-header">
              <div>
                <h2>{label}</h2>
                <p>원하는 항목을 선택해주세요.</p>
              </div>
              <SheetCloseButton onClose={() => setIsOpen(false)} />
            </div>
            <div className="select-option-list">
              {options.map((option) => (
                <button
                  className={option.value === value ? "select-option active" : "select-option"}
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  type="button"
                >
                  <span>{option.label}</span>
                  {option.value === value ? <CheckCircle2 size={20} /> : null}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function HomeShortcutSheet({
  onClose,
  onDismiss,
}: {
  onClose: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="홈 화면 추가 안내"
        className="bottom-sheet home-shortcut-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="home-shortcut-sheet-copy">
          <span className="home-shortcut-sheet-badge">빠른 실행</span>
          <strong>홈 화면에 추가하고 더 빠르게 열어보세요</strong>
          <p>토스 상단 메뉴에서 홈 화면에 추가하면 다음부터 바로 들어올 수 있어요.</p>
        </div>
        <div className="sheet-actions">
          <button className="secondary-action" onClick={onDismiss} type="button">
            다시 보지 않기
          </button>
          <button className="primary-action" onClick={onClose} type="button">
            확인
          </button>
        </div>
      </section>
    </div>
  );
}

function InviteRoleSheet({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (invitedDisplayName?: string) => void;
}) {
  const [selectedInviteLabel, setSelectedInviteLabel] = useState<string>("");
  const [customInviteLabel, setCustomInviteLabel] = useState("");
  const normalizedInviteLabel = customInviteLabel.trim() || selectedInviteLabel || undefined;

  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="가족 초대 대상 선택"
        className="bottom-sheet invite-role-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <div>
            <h2>누구를 초대할까요?</h2>
            <p>예: 남편, 할머니처럼 지정해두면 가족 구성원에 그 이름으로 바로 보여줄 수 있어요.</p>
          </div>
          <SheetCloseButton onClose={onClose} />
        </div>
        <div className="invite-role-options">
          {inviteDisplayNameOptions.map((option) => (
            <button
              className={selectedInviteLabel === option && !customInviteLabel.trim() ? "invite-role-option active" : "invite-role-option"}
              key={option}
              onClick={() => {
                setSelectedInviteLabel(option);
                setCustomInviteLabel("");
              }}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
        <label className="invite-role-field">
          <span>직접 입력</span>
          <input
            onChange={(event) => setCustomInviteLabel(event.target.value)}
            placeholder="예) 외할머니, 큰아빠"
            value={customInviteLabel}
          />
        </label>
        <div className="sheet-actions">
          <button className="secondary-action" onClick={onClose} type="button">
            취소
          </button>
          <button className="primary-action" onClick={() => onSubmit(normalizedInviteLabel)} type="button">
            초대 링크 만들기
          </button>
        </div>
      </section>
    </div>
  );
}

function InviteLinkSheet({
  inviteLink,
  invitedDisplayName,
  onClose,
}: {
  inviteLink: string;
  invitedDisplayName?: string;
  onClose: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "link" | "message">("idle");
  const shareMessage = createFamilyInviteMessage(inviteLink, invitedDisplayName);
  const canUseSystemShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleCopy = (value: string, nextStatus: "link" | "message") => {
    void navigator.clipboard.writeText(value)
      .then(() => {
        setCopyStatus(nextStatus);
      })
      .catch(() => {
        setCopyStatus("idle");
      });
  };

  const handleOpenLink = () => {
    window.open(inviteLink, "_blank", "noopener,noreferrer");
  };

  const handleSystemShare = () => {
    if (!canUseSystemShare) return;

    void navigator.share?.({
      title: "알림장쏙 가족 초대",
      text: shareMessage,
      url: inviteLink,
    }).catch(() => undefined);
  };

  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="가족 초대 링크"
        className="bottom-sheet invite-link-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <div>
            <h2>가족 초대 링크</h2>
            <p>
              공유 권한이 없어 링크를 직접 보여드려요.
              {invitedDisplayName ? ` 이 링크는 ${invitedDisplayName} 초대용이에요.` : ""}
            </p>
          </div>
          <SheetCloseButton onClose={onClose} />
        </div>
        <div className="invite-link-card">
          <span>{invitedDisplayName ? `${invitedDisplayName} 초대 링크` : "초대 링크"}</span>
          <code>{inviteLink}</code>
        </div>
        <div className="invite-link-actions">
          <button
            className="secondary-action"
            onClick={() => handleCopy(shareMessage, "message")}
            type="button"
          >
            {copyStatus === "message" ? "카톡 문구 복사 완료" : "카톡 문구 복사"}
          </button>
          <button
            className="secondary-action"
            disabled={!canUseSystemShare}
            onClick={handleSystemShare}
            type="button"
          >
            시스템 공유
          </button>
          <button className="secondary-action" onClick={handleOpenLink} type="button">
            링크 열기
          </button>
        </div>
        <div className="sheet-actions">
          <button className="secondary-action" onClick={onClose} type="button">
            닫기
          </button>
          <button className="primary-action" onClick={() => handleCopy(inviteLink, "link")} type="button">
            {copyStatus === "link" ? "링크 복사 완료" : "링크 복사"}
          </button>
        </div>
      </section>
    </div>
  );
}

function TodoEditorSheet({
  children,
  defaultChildId,
  mode,
  todo,
  onAddTodo,
  onClose,
  onDeleteTodo,
  onSaveTodo,
}: {
  children: Child[];
  defaultChildId: string;
  mode: "add" | "edit";
  todo: TodoItem | null;
  onAddTodo: (todo: Omit<TodoItem, "id" | "completed">) => void;
  onClose: () => void;
  onDeleteTodo: (id: string) => void;
  onSaveTodo: (todo: TodoItem) => void;
}) {
  const initialChildId = todo?.childId ?? defaultChildId;
  const [childId, setChildId] = useState(initialChildId);
  const [title, setTitle] = useState(todo?.title ?? "");
  const [category, setCategory] = useState(todo?.category ?? "준비물");
  const [dueDate, setDueDate] = useState(todo?.dueDate ?? "오늘");
  const [detail, setDetail] = useState(todo?.detail ?? "");
  const selectedChild = children.find((child) => child.id === childId) ?? children[0];
  const canSubmit = title.trim().length > 0 && Boolean(selectedChild);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !selectedChild) return;

    const payload = {
      childId: selectedChild.id,
      childName: selectedChild.name,
      title: title.trim(),
      category,
      dueDate,
      detail: detail.trim() || undefined,
    };

    if (mode === "edit" && todo) {
      onSaveTodo({
        ...todo,
        ...payload,
      });
      return;
    }

    onAddTodo(payload);
  };

  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label={mode === "edit" ? "할 일 수정" : "할 일 추가"}
        className="bottom-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <div>
            <h2>{mode === "edit" ? "준비물 수정" : "준비물 추가"}</h2>
            <p>내용을 직접 고치고 저장할 수 있어요.</p>
          </div>
          <SheetCloseButton onClose={onClose} />
        </div>
        <form className="todo-editor-form" onSubmit={submit}>
          <label>
            <span>아이</span>
            <TossSelect
              label="아이"
              onChange={setChildId}
              options={children.map((child) => ({
                label: child.name,
                value: child.id,
              }))}
              value={childId}
            />
          </label>
          <label>
            <span>제목</span>
            <input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예) 물통 챙기기"
              value={title}
            />
          </label>
          <div className="todo-editor-grid">
            <label>
              <span>분류</span>
              <TossSelect
                label="분류"
                onChange={setCategory}
                options={["준비물", "숙제", "제출물", "학부모 확인", "납부", "기타"].map((item) => ({
                  label: item,
                  value: item,
                }))}
                value={category}
              />
            </label>
            <label>
              <span>날짜</span>
              <TossSelect
                label="날짜"
                onChange={setDueDate}
                options={["오늘", "내일", "이번 주", "날짜 미정"].map((item) => ({
                  label: item,
                  value: item,
                }))}
                value={dueDate}
              />
            </label>
          </div>
          <label>
            <span>메모</span>
            <textarea
              onChange={(event) => setDetail(event.target.value)}
              placeholder="예) 도화지, 크레파스, 물감"
              rows={3}
              value={detail}
            />
          </label>
          <div className="sheet-actions">
            {mode === "edit" && todo ? (
              <button className="danger-action" onClick={() => onDeleteTodo(todo.id)} type="button">
                삭제
              </button>
            ) : (
              <button className="secondary-action" onClick={onClose} type="button">
                취소
              </button>
            )}
            <button className="primary-action" disabled={!canSubmit} type="submit">
              {mode === "edit" ? "저장" : "추가"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function EventEditorSheet({
  children,
  defaultChildId,
  onAddEvent,
  onClose,
}: {
  children: Child[];
  defaultChildId: string;
  onAddEvent: (event: Omit<CalendarEventItem, "id">) => void;
  onClose: () => void;
}) {
  const [childId, setChildId] = useState(defaultChildId);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(getLocalDateKey(new Date()));
  const [time, setTime] = useState("09:00");
  const [location, setLocation] = useState("");
  const selectedChild = children.find((child) => child.id === childId) ?? children[0];
  const canSubmit = title.trim().length > 0 && Boolean(selectedChild);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !selectedChild) return;

    onAddEvent({
      childId: selectedChild.id,
      childName: selectedChild.name,
      title: title.trim(),
      date,
      time,
      location: location.trim() || undefined,
    });
  };

  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="일정 추가"
        className="bottom-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <div>
            <h2>이번 주 일정 추가</h2>
            <p>상담, 행사, 체험학습 같은 일정을 직접 넣을 수 있어요.</p>
          </div>
          <SheetCloseButton onClose={onClose} />
        </div>
        <form className="todo-editor-form" onSubmit={submit}>
          <label>
            <span>아이</span>
            <TossSelect
              label="아이"
              onChange={setChildId}
              options={children.map((child) => ({
                label: child.name,
                value: child.id,
              }))}
              value={childId}
            />
          </label>
          <label>
            <span>일정 이름</span>
            <input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예) 체험학습, 학부모 상담"
              value={title}
            />
          </label>
          <div className="todo-editor-grid">
            <label>
              <span>날짜</span>
              <input onChange={(event) => setDate(event.target.value)} type="date" value={date} />
            </label>
            <label>
              <span>시간</span>
              <input onChange={(event) => setTime(event.target.value)} type="time" value={time} />
            </label>
          </div>
          <label>
            <span>장소</span>
            <input
              onChange={(event) => setLocation(event.target.value)}
              placeholder="예) 교실, 강당, 체험장"
              value={location}
            />
          </label>
          <div className="sheet-actions">
            <button className="secondary-action" onClick={onClose} type="button">
              취소
            </button>
            <button className="primary-action" disabled={!canSubmit} type="submit">
              일정 추가
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TodoCheckRow({
  todo,
  onEditTodo,
  onToggleTodo,
}: {
  todo: TodoItem;
  onEditTodo?: (todo: TodoItem) => void;
  onToggleTodo: (id: string) => void;
}) {
  return (
    <article
      className={todo.completed ? "todo-check-row done" : "todo-check-row"}
      onClick={() => onEditTodo?.(todo)}
      onKeyDown={(event) => {
        if (!onEditTodo) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEditTodo(todo);
        }
      }}
      role={onEditTodo ? "button" : undefined}
      tabIndex={onEditTodo ? 0 : undefined}
    >
      <button
        aria-label={`${todo.title} 완료 상태 변경`}
        className="todo-check-button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleTodo(todo.id);
        }}
        type="button"
      >
        {todo.completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
      </button>
      <div className="row-copy">
        <strong>{todo.title}</strong>
        <span>
          {todo.category} · {todo.childName} · {displayTodoDueDate(todo.dueDate)}
        </span>
        {todo.detail ? <p>{todo.detail}</p> : null}
      </div>
    </article>
  );
}

function InfoLine({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className={icon ? "info-line" : "info-line no-icon"}>
      {icon ? <div className="info-icon">{icon}</div> : null}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? <em>*</em> : null}
      </span>
      {children}
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function TossAdBanner({
  adId,
  candidate,
  placement,
}: {
  adId?: string;
  candidate: string;
  placement: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "hidden" | "visible">("idle");

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !adId) {
      setStatus("hidden");
      return;
    }

    if (!canUseTossAds()) {
      setStatus("hidden");
      return;
    }

    let isMounted = true;
    let banner: ReturnType<typeof TossAds.attachBanner> | null = null;

    void (async () => {
      try {
        setStatus("loading");

        await initializeTossAds();
        if (!isMounted) return;

        banner = TossAds.attachBanner(adId, container, {
          theme: "light",
          tone: "grey",
          variant: "card",
          callbacks: {
            onAdRendered: () => {
              if (isMounted) setStatus("visible");
            },
            onNoFill: () => {
              if (isMounted) setStatus("hidden");
            },
            onAdFailedToRender: (payload) => {
              console.warn("토스 배너 광고 렌더링에 실패했어요.", {
                candidate,
                placement,
                adId,
                error: payload.error,
              });
              if (isMounted) setStatus("hidden");
            },
          },
        });
      } catch (error) {
        console.warn("토스 배너 광고를 불러오지 못했어요.", { candidate, placement, adId, error });
        if (isMounted) setStatus("hidden");
      }
    })();

    return () => {
      isMounted = false;
      banner?.destroy();
    };
  }, [adId, candidate, placement]);

  return (
    <div
      aria-hidden={status === "hidden"}
      aria-label={`토스 배너 광고 ${candidate}`}
      className={status === "hidden" ? "toss-ad-banner hidden" : "toss-ad-banner"}
      data-ad-placement={placement}
      ref={containerRef}
    />
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    void trackBugEvent({
      eventType: "react_render_error",
      severity: "error",
      screen: "home",
      step: "react.error_boundary",
      message: error.message,
      metadata: {
        error: serializeErrorForLog(error),
        componentStack: errorInfo.componentStack,
      },
    });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <ErrorDialog
          message="화면을 불러오는 중 문제가 생겼어요."
          onClose={() => this.setState({ hasError: false })}
        />
      );
    }

    return this.props.children;
  }
}

export default function AppRoot() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}
