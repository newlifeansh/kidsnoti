export interface AnalysisChild {
  id: string;
  name: string;
  notificationTime?: string;
}

export interface ParsedCalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  childId: string;
  childName: string;
  location?: string;
  reminderAt?: string;
  confidence: number;
  needsUserConfirmation: boolean;
  reason?: string;
}

export interface ParsedTodo {
  id: string;
  title: string;
  category: string;
  dueDate: string;
  childId: string;
  childName: string;
  detail?: string;
  confidence: number;
  needsUserConfirmation: boolean;
}

export interface ParsedNoticeResult {
  noticeId: string;
  sourceText: string;
  calendarEvents: ParsedCalendarEvent[];
  todos: ParsedTodo[];
  infoOnlyItems: string[];
  warnings: string[];
}

export const isNoticeAnalyzeConfigured = Boolean(import.meta.env.VITE_NOTICE_ANALYZE_ENDPOINT);

interface AnalyzeNoticeImageParams {
  files: File[];
  children: AnalysisChild[];
}

interface RawParsedNoticeResult {
  noticeId?: string;
  sourceText?: string;
  calendarEvents?: Array<{
    id?: string;
    title?: string;
    description?: string;
    date?: string;
    time?: string;
    startTime?: string;
    childId?: string;
    childName?: string;
    location?: string;
    reminderAt?: string;
    confidence?: number;
    needsUserConfirmation?: boolean;
    reason?: string;
  }>;
  todos?: Array<{
    id?: string;
    title?: string;
    category?: string;
    dueDate?: string;
    childId?: string;
    childName?: string;
    description?: string;
    detail?: string;
    confidence?: number;
    needsUserConfirmation?: boolean;
  }>;
  infoOnlyItems?: Array<
    | string
    | {
        title?: string;
        description?: string;
      }
  >;
  warnings?: string[];
}

const implicitTodayReasons = [
  "명확한 마감일 없음",
  "마감일 없음",
  "날짜 불명확",
  "발행일",
  "작성일",
  "배부일",
  "공문 날짜",
];

export async function analyzeNoticeImage({
  files,
  children,
}: AnalyzeNoticeImageParams): Promise<ParsedNoticeResult> {
  const endpoint = import.meta.env.VITE_NOTICE_ANALYZE_ENDPOINT as string | undefined;

  if (!endpoint) {
    throw new Error("OCR 분석 엔드포인트가 설정되지 않았어요.");
  }

  const formData = new FormData();
  files.forEach((file) => {
    formData.append("images", file);
  });
  formData.append("children", JSON.stringify(children));
  formData.append("timezone", "Asia/Seoul");
  formData.append("today", getLocalDateKey(new Date()));

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readAnalyzeError(response));
  }

  const result = await response.json() as RawParsedNoticeResult;
  return normalizeParsedNoticeResult(result, children);
}

async function readAnalyzeError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message ?? "알림장 분석에 실패했어요. 잠시 후 다시 시도해주세요.";
  } catch {
    return "알림장 분석에 실패했어요. 잠시 후 다시 시도해주세요.";
  }
}

function normalizeParsedNoticeResult(
  result: RawParsedNoticeResult,
  children: AnalysisChild[],
): ParsedNoticeResult {
  const noticeId = result.noticeId ?? `notice-${Date.now()}`;
  const fallbackChild = children[0] ?? { id: "child-1", name: "아이" };

  return {
    noticeId,
    sourceText: result.sourceText ?? "",
    calendarEvents: (result.calendarEvents ?? []).map((event, index) => ({
      id: event.id ?? `${noticeId}-event-${index + 1}`,
      title: event.title ?? "일정",
      description: event.description,
      date: event.date ?? "날짜 미정",
      time: event.time ?? event.startTime ?? "시간 미정",
      childId: event.childId ?? fallbackChild.id,
      childName: event.childName ?? fallbackChild.name,
      location: event.location,
      reminderAt: event.reminderAt,
      confidence: event.confidence ?? 0.5,
      needsUserConfirmation: event.needsUserConfirmation ?? true,
      reason: event.reason,
    })),
    todos: (result.todos ?? []).map((todo, index) => ({
      id: todo.id ?? `${noticeId}-todo-${index + 1}`,
      title: todo.title ?? "할 일",
      category: todoCategoryLabel(todo.category),
      dueDate: normalizeTodoDueDate(todo.dueDate, todo.description ?? todo.detail),
      childId: todo.childId ?? fallbackChild.id,
      childName: todo.childName ?? fallbackChild.name,
      detail: todo.detail ?? todo.description,
      confidence: todo.confidence ?? 0.5,
      needsUserConfirmation: todo.needsUserConfirmation ?? true,
    })),
    infoOnlyItems: (result.infoOnlyItems ?? []).map((item) => {
      if (typeof item === "string") return item;
      return item.description ?? item.title ?? "안내";
    }),
    warnings: result.warnings ?? [],
  };
}

function normalizeTodoDueDate(dueDate: string | undefined, detail: string | undefined) {
  if (!dueDate) return "날짜 미정";
  const normalizedDetail = detail ?? "";

  if (
    (dueDate === "오늘" || dueDate === getLocalDateKey(new Date())) &&
    implicitTodayReasons.some((reason) => normalizedDetail.includes(reason))
  ) {
    return "날짜 미정";
  }

  return dueDate;
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todoCategoryLabel(category: string | undefined) {
  const labels: Record<string, string> = {
    preparation: "준비물",
    homework: "숙제",
    submission: "제출물",
    parent_check: "학부모 확인",
    payment: "납부",
    other: "기타",
  };

  return category ? labels[category] ?? category : "기타";
}
