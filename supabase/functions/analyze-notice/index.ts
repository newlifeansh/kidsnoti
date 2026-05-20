import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface ChildInput {
  id: string;
  name: string;
  schoolName?: string;
  grade?: string;
  className?: string;
}

interface ParsedNoticeResult {
  noticeId: string;
  sourceText: string;
  calendarEvents: Array<{
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
  }>;
  todos: Array<{
    id: string;
    title: string;
    description?: string;
    childId?: string;
    childName?: string;
    category: "preparation" | "homework" | "submission" | "parent_check" | "payment" | "other";
    dueDate?: string;
    remindAt?: string;
    confidence: number;
    needsUserConfirmation: boolean;
    reason?: string;
  }>;
  infoOnlyItems: Array<{
    id: string;
    title: string;
    description?: string;
    confidence: number;
  }>;
  warnings: string[];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ message: "POST만 지원해요." }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const images = formData.getAll("images").filter((value): value is File => value instanceof File);
    const children = parseChildren(formData.get("children"));
    const today = String(formData.get("today") ?? new Date().toISOString().slice(0, 10));
    const timezone = String(formData.get("timezone") ?? "Asia/Seoul");

    if (images.length === 0) {
      return jsonResponse({ message: "분석할 이미지가 필요해요." }, { status: 400 });
    }

    const sourceText = await extractTextFromImages(images);
    if (!sourceText.trim()) {
      return jsonResponse(emptyParsedResult("업로드한 이미지에서 읽을 수 있는 알림장 텍스트를 찾지 못했어요."));
    }

    const result = await structureNotice({
      sourceText,
      children,
      today,
      timezone,
    });

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse(
      { message: error instanceof Error ? error.message : "알림장 분석에 실패했어요." },
      { status: 500 },
    );
  }
});

function parseChildren(value: FormDataEntryValue | null): ChildInput[] {
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value) as ChildInput[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function extractTextFromImages(images: File[]) {
  const apiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
  if (!apiKey) {
    throw new Error("GOOGLE_CLOUD_VISION_API_KEY가 설정되지 않았어요.");
  }

  const requests = await Promise.all(
    images.map(async (image) => ({
      image: {
        content: arrayBufferToBase64(await image.arrayBuffer()),
      },
      features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
    })),
  );

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    },
  );

  if (!response.ok) {
    throw new Error("OCR 처리에 실패했어요.");
  }

  const body = await response.json() as {
    responses?: Array<{ fullTextAnnotation?: { text?: string }; error?: { message?: string } }>;
  };

  const errors = body.responses?.flatMap((item) => item.error?.message ? [item.error.message] : []) ?? [];
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return (body.responses ?? [])
    .map((item) => item.fullTextAnnotation?.text ?? "")
    .filter(Boolean)
    .join("\n\n");
}

function emptyParsedResult(message: string): ParsedNoticeResult {
  return {
    noticeId: crypto.randomUUID(),
    sourceText: "",
    calendarEvents: [],
    todos: [],
    infoOnlyItems: [],
    warnings: [message],
  };
}

async function structureNotice({
  sourceText,
  children,
  today,
  timezone,
}: {
  sourceText: string;
  children: ChildInput[];
  today: string;
  timezone: string;
}): Promise<ParsedNoticeResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되지 않았어요.");
  }

  const schemaPrompt = [
    "너는 한국 학교/어린이집/학원 알림장을 분석하는 도우미다.",
    "OCR 텍스트를 읽고 JSON만 반환해라.",
    `오늘 날짜: ${today}`,
    `timezone: ${timezone}`,
    `아이 목록: ${JSON.stringify(children)}`,
    "반드시 최상위 키는 sourceText, calendarEvents, todos, infoOnlyItems, warnings만 사용해라.",
    "calendar, events, tasks 같은 다른 키 이름은 절대 쓰지 마라.",
    "calendarEvents 항목 필드: title, description, childId, childName, date, startTime, endTime, location, reminderAt, confidence, needsUserConfirmation, reason.",
    "todos 항목 필드: title, description, childId, childName, category, dueDate, remindAt, confidence, needsUserConfirmation, reason.",
    "Calendar에는 행사, 체험학습, 시험, 상담처럼 날짜 중심 이벤트만 넣어라.",
    "준비물, 숙제, 제출물, 학부모 확인은 todos에 넣어라.",
    "가정에서 지도해주세요, 확인해주세요, 안내해주세요처럼 부모가 확인하거나 지도해야 하는 항목은 category를 parent_check로 분류해라.",
    "todo.title은 사용자가 바로 이해할 수 있게 12~24자 정도의 짧은 행동 문장으로 작성해라.",
    "todo.description은 반드시 작성해라. 원문 근거, 준비/제출해야 할 것, 마감일/조건을 부모가 이해하기 쉽게 1~3문장으로 정리해라.",
    "예: title='생일선물 준비 및 이름 기입', description='이번 주 금요일 생일파티가 있어 1만원 상당의 생일선물을 목요일까지 준비해야 합니다. 선물에는 아이 이름을 써서 보내달라고 안내되어 있습니다.'",
    "여러 정보가 하나의 행동으로 이어지면 하나의 todo로 묶고, 서로 다른 마감/행동이면 분리해라.",
    "날짜가 불확실하거나 조건부 문구는 needsUserConfirmation=true로 표시해라.",
    "date/dueDate는 실제 행사일, 제출 마감일, 준비물 지참일, 신청 마감일처럼 사용자가 행동해야 하는 날짜가 명확할 때만 YYYY-MM-DD로 넣어라.",
    "오늘 날짜는 상대 날짜 해석 기준일일 뿐이며, dueDate의 기본값으로 절대 사용하지 마라.",
    "가정통신문/알림장 하단의 작성일, 발행일, 배부일, 공문 날짜는 마감일이나 행동일이 아니므로 todo.dueDate에 넣지 마라.",
    "해야 할 행동은 있지만 명확한 마감일이 없으면 todo.dueDate를 생략하고 reason에 '명확한 마감일 없음'이라고 써라.",
    "예: 2026년 5월 8일자 통신문에 '초등안심벨 사용법을 지도해주세요'라고만 있으면 dueDate를 생략해라. 2026-05-08은 발행일이지 마감일이 아니다.",
    "내일, 이번 주 목요일, 이번 주 금요일 같은 상대 날짜는 오늘 날짜 이후의 가장 가까운 해당 날짜로 계산해라.",
    "예: 오늘이 2026-05-12 화요일이면 내일 수요일은 2026-05-13, 이번 주 목요일은 2026-05-14, 이번 주 금요일은 2026-05-15다.",
    "카테고리는 preparation/homework/submission/parent_check/payment/other 중 하나만 써라.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: schemaPrompt,
        },
        {
          role: "user",
          content: sourceText,
        },
      ],
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("OpenAI structureNotice failed", errorBody);

    try {
      const parsedError = JSON.parse(errorBody) as { error?: { code?: string; type?: string } };
      if (
        parsedError.error?.code === "insufficient_quota" ||
        parsedError.error?.type === "insufficient_quota"
      ) {
        throw new Error("OpenAI 결제 또는 사용량 한도 설정이 필요해요.");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("OpenAI 결제")) {
        throw error;
      }
    }

    throw new Error("LLM 구조화에 실패했어요.");
  }

  const body = await response.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  const text = body.output_text ?? body.output?.flatMap((item) => item.content ?? [])
    .map((item) => item.text)
    .find(Boolean);

  if (!text) {
    throw new Error("LLM 응답이 비어 있어요.");
  }

  return normalizeParsedResult(JSON.parse(text) as Partial<ParsedNoticeResult>, sourceText, children, today);
}

function normalizeParsedResult(
  parsed: Partial<ParsedNoticeResult>,
  sourceText: string,
  children: ChildInput[],
  today: string,
): ParsedNoticeResult {
  const noticeId = parsed.noticeId ?? crypto.randomUUID();
  const firstChild = children[0];

  return {
    noticeId,
    sourceText: parsed.sourceText ?? sourceText,
    calendarEvents: (parsed.calendarEvents ?? []).map((event, index) => ({
      id: event.id ?? `${noticeId}-event-${index + 1}`,
      title: event.title ?? "일정",
      description: event.description,
      childId: event.childId ?? firstChild?.id,
      childName: event.childName ?? firstChild?.name,
      date: event.date ?? "",
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
      reminderAt: event.reminderAt,
      confidence: normalizeConfidence(event.confidence),
      needsUserConfirmation: event.needsUserConfirmation ?? true,
      reason: event.reason,
    })),
    todos: (parsed.todos ?? []).map((todo, index) => ({
      id: todo.id ?? `${noticeId}-todo-${index + 1}`,
      title: todo.title ?? "할 일",
      description: todo.description,
      childId: todo.childId ?? firstChild?.id,
      childName: todo.childName ?? firstChild?.name,
      category: normalizeTodoCategory(todo.category, todo.title, todo.description),
      dueDate: normalizeTodoDueDate(todo.dueDate, todo.reason ?? todo.description, today),
      remindAt: todo.remindAt,
      confidence: normalizeConfidence(todo.confidence),
      needsUserConfirmation: todo.needsUserConfirmation ?? true,
      reason: todo.reason,
    })),
    infoOnlyItems: (parsed.infoOnlyItems ?? []).map((item, index) => ({
      id: item.id ?? `${noticeId}-info-${index + 1}`,
      title: item.title ?? "안내",
      description: item.description,
      confidence: normalizeConfidence(item.confidence),
    })),
    warnings: parsed.warnings ?? [],
  };
}

function normalizeConfidence(confidence: unknown) {
  if (typeof confidence === "number" && Number.isFinite(confidence)) {
    return Math.min(Math.max(confidence, 0), 1);
  }

  if (typeof confidence === "string") {
    const normalized = confidence.toLowerCase();
    if (normalized === "high" || normalized === "높음") return 0.9;
    if (normalized === "medium" || normalized === "보통") return 0.6;
    if (normalized === "low" || normalized === "낮음") return 0.35;

    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return Math.min(Math.max(parsed, 0), 1);
  }

  return 0.5;
}

function normalizeTodoCategory(
  category: ParsedNoticeResult["todos"][number]["category"] | undefined,
  title: string | undefined,
  description: string | undefined,
) {
  const validCategories = new Set(["preparation", "homework", "submission", "parent_check", "payment", "other"]);
  if (category && validCategories.has(category)) return category;

  const text = `${title ?? ""} ${description ?? ""}`;
  if (/(지도|확인|안내|주의|가정에서|학부모)/.test(text)) return "parent_check";
  return "other";
}

function normalizeTodoDueDate(
  dueDate: string | undefined,
  reasonText: string | undefined,
  today: string,
) {
  if (!dueDate) return undefined;
  const text = reasonText ?? "";
  const looksLikeImplicitToday = dueDate === "오늘" || dueDate === today;
  const hasNoExplicitDeadline =
    text.includes("명확한 마감일 없음") ||
    text.includes("마감일 없음") ||
    text.includes("날짜 불명확") ||
    text.includes("발행일") ||
    text.includes("작성일") ||
    text.includes("배부일") ||
    text.includes("공문 날짜");

  return looksLikeImplicitToday && hasNoExplicitDeadline ? undefined : dueDate;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
