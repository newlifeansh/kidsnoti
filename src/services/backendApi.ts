import type {
  CalendarEventRecord,
  ChildProfile,
  Family,
  ParsedNoticeResult,
  PushSchedule,
  TodoRecord,
} from "../types/domain";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
const DEFAULT_DEV_API_BASE_URL = "http://localhost:8080";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AnalyzeNoticeRequest {
  images: File[];
  children: ChildProfile[];
  today: string;
  timezone: "Asia/Seoul";
}

export interface ConfirmNoticeRequest {
  calendarEvents: CalendarEventRecord[];
  todos: TodoRecord[];
}

export interface CurrentFamilyResponse {
  family: Family;
  children: ChildProfile[];
  todos: TodoRecord[];
  calendarEvents: CalendarEventRecord[];
  pushSchedules?: PushSchedule[];
}

interface CalendarAuthUrlResponse {
  authUrl: string;
}

export async function getCurrentFamily(): Promise<CurrentFamilyResponse> {
  return requestJson<CurrentFamilyResponse>("/v1/families/current");
}

export async function createChild(
  child: Pick<ChildProfile, "name" | "avatarId" | "schoolName" | "grade" | "className">,
): Promise<ChildProfile> {
  return requestJson<ChildProfile>("/v1/children", {
    method: "POST",
    body: JSON.stringify(child),
  });
}

export async function updateTodoStatus(
  todoId: string,
  status: TodoRecord["status"],
): Promise<TodoRecord> {
  return requestJson<TodoRecord>(`/v1/todos/${todoId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function analyzeNoticeImages({
  images,
  children,
  today,
  timezone,
}: AnalyzeNoticeRequest): Promise<ParsedNoticeResult> {
  const formData = new FormData();
  images.forEach((image) => {
    formData.append("images", image);
  });
  formData.append("children", JSON.stringify(children));
  formData.append("today", today);
  formData.append("timezone", timezone);

  return requestJson<ParsedNoticeResult>("/v1/notices/analyze", {
    body: formData,
    method: "POST",
  });
}

export async function confirmNotice(
  noticeId: string,
  payload: ConfirmNoticeRequest,
): Promise<CurrentFamilyResponse> {
  return requestJson<CurrentFamilyResponse>(`/v1/notices/${noticeId}/confirm`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getGoogleCalendarAuthUrl(): Promise<string> {
  try {
    const response = await requestJson<CalendarAuthUrlResponse>("/v1/calendar/auth-url");
    if (response.authUrl) {
      return response.authUrl;
    }
  } catch {
    // Fallback to the direct Google Calendar landing page in local/mock environments.
  }

  return "https://calendar.google.com/";
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiBaseUrl = API_BASE_URL ?? (import.meta.env.DEV ? DEFAULT_DEV_API_BASE_URL : undefined);

  if (!apiBaseUrl) {
    throw new ApiError("VITE_API_BASE_URL이 설정되지 않았어요.", 500);
  }

  const isFormData = init.body instanceof FormData;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }

  return response.json() as Promise<T>;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? "요청 처리에 실패했어요.";
  } catch {
    return "요청 처리에 실패했어요.";
  }
}
