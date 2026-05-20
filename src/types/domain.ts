export type FamilyRole = "owner" | "member";

export type TodoCategory =
  | "preparation"
  | "homework"
  | "submission"
  | "parent_check"
  | "payment"
  | "other";

export type TodoStatus = "pending" | "done" | "archived";

export type NoticeStatus = "draft" | "confirmed" | "cancelled";

export type CalendarEventStatus = "pending" | "created" | "failed" | "deleted";

export type PushScheduleStatus = "pending" | "sent" | "failed" | "cancelled";
export type NotificationPreparationDay = "before" | "same-day";
export type SmartMessageDeliveryStatus = "pending" | "sent" | "failed" | "skipped";
export type NotificationConsentStatus = "unknown" | "accepted" | "declined";
export type SmartMessageTriggerKind =
  | "tomorrow_preparation_check"
  | "today_final_check"
  | "tomorrow_schedule_reminder"
  | "today_schedule_reminder";

export interface UserProfile {
  id: string;
  displayName?: string;
  familyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Family {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyMember {
  userId: string;
  role: FamilyRole;
  displayName?: string;
  joinedAt: string;
}

export interface ChildProfile {
  id: string;
  familyId: string;
  name: string;
  avatarId: string;
  schoolName?: string;
  grade?: string;
  className?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TodoRecord {
  id: string;
  familyId: string;
  childId: string;
  createdBy: string;
  title: string;
  description?: string;
  category: TodoCategory;
  dueDate?: string;
  remindAt?: string;
  status: TodoStatus;
  sourceNoticeId?: string;
  completedBy?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventRecord {
  id: string;
  familyId: string;
  childId?: string;
  createdBy: string;
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
  googleEventId?: string;
  googleCalendarId?: string;
  sourceNoticeId?: string;
  status: CalendarEventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedCalendarEvent {
  id: string;
  title: string;
  description?: string;
  childId?: string;
  childName?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  reminderAt?: string;
  confidence: number;
  needsUserConfirmation: boolean;
  reason?: string;
}

export interface ParsedTodo {
  id: string;
  title: string;
  description?: string;
  childId?: string;
  childName?: string;
  category: TodoCategory;
  dueDate?: string;
  remindAt?: string;
  confidence: number;
  needsUserConfirmation: boolean;
  reason?: string;
}

export interface ParsedInfoItem {
  id: string;
  title: string;
  description?: string;
  confidence: number;
}

export interface ParsedNoticeResult {
  noticeId: string;
  sourceText: string;
  calendarEvents: ParsedCalendarEvent[];
  todos: ParsedTodo[];
  infoOnlyItems: ParsedInfoItem[];
  warnings: string[];
}

export interface NoticeRecord {
  id: string;
  familyId: string;
  uploadedBy: string;
  sourceText: string;
  parsedResult: ParsedNoticeResult;
  status: NoticeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarConnection {
  id: string;
  userId: string;
  provider: "google";
  calendarId: string;
  accessTokenExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PushSchedule {
  id: string;
  userId: string;
  familyId: string;
  todoId: string;
  scheduledAt: string;
  status: PushScheduleStatus;
  sentAt?: string;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  familyId: string;
  enabled: boolean;
  preparationDay: NotificationPreparationDay;
  preparationTime: string;
  morningTime: string;
  scheduleEnabled: boolean;
  scheduleDay: NotificationPreparationDay;
  scheduleTime: string;
  templateSetCode?: string;
  tossUserKey?: string;
  consentStatus: NotificationConsentStatus;
  consentLastPromptedAt?: string;
  consentAcceptedAt?: string;
  consentDeclinedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmartMessageDeliveryLog {
  id: string;
  scheduleId?: string;
  userId: string;
  familyId: string;
  todoId?: string;
  childId?: string;
  targetDate?: string;
  triggerKind?: SmartMessageTriggerKind;
  templateSetCode: string;
  status: SmartMessageDeliveryStatus;
  requestPayload: Record<string, unknown>;
  responseBody?: Record<string, unknown>;
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
}
