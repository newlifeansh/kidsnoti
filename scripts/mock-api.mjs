import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_API_PORT ?? 8080);
const FAMILY_ID = "family-demo";
const USER_ID = "user-demo";
const TODO_CATEGORIES = new Set([
  "preparation",
  "homework",
  "submission",
  "parent_check",
  "payment",
  "other",
]);
const TODO_STATUSES = new Set(["pending", "done", "archived"]);

const now = () => new Date().toISOString();

const state = {
  family: {
    id: FAMILY_ID,
    name: "알림장쏙 가족",
    ownerId: USER_ID,
    createdAt: now(),
    updatedAt: now(),
  },
  children: [],
  todos: [],
  calendarEvents: [],
  pushSchedules: [],
};

const server = createServer(async (request, response) => {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const method = request.method ?? "GET";

    if (method === "GET" && url.pathname === "/healthz") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/me") {
      sendJson(response, 200, {
        id: USER_ID,
        displayName: "데모 사용자",
        familyId: state.family.id,
        createdAt: now(),
        updatedAt: now(),
      });
      return;
    }

    if (method === "GET" && url.pathname === "/v1/families/current") {
      sendJson(response, 200, currentFamilyResponse());
      return;
    }

    if (method === "GET" && url.pathname === "/v1/calendar/auth-url") {
      sendJson(response, 200, {
        authUrl: "https://calendar.google.com/",
      });
      return;
    }

    if (method === "POST" && url.pathname === "/v1/children") {
      const body = await readJson(request);
      if (!optionalString(body.name)) {
        sendJson(response, 400, { message: "아이 이름을 입력해주세요." });
        return;
      }

      const child = {
        id: `child-${randomUUID()}`,
        familyId: state.family.id,
        name: String(body.name),
        avatarId: String(body.avatarId ?? "age5-boy"),
        schoolName: optionalString(body.schoolName),
        grade: optionalString(body.grade),
        className: optionalString(body.className),
        createdAt: now(),
        updatedAt: now(),
      };
      state.children.push(child);
      sendJson(response, 201, child);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/todos") {
      sendJson(response, 200, state.todos);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/todos") {
      const body = await readJson(request);
      const todo = normalizeTodo(body);
      state.todos.unshift(todo);
      state.pushSchedules.push(...createPushSchedulesForTodo(todo));
      sendJson(response, 201, todo);
      return;
    }

    const todoMatch = url.pathname.match(/^\/v1\/todos\/([^/]+)$/);
    if (method === "PATCH" && todoMatch) {
      const todo = state.todos.find((item) => item.id === todoMatch[1]);
      if (!todo) {
        sendJson(response, 404, { message: "To-do를 찾을 수 없어요." });
        return;
      }

      const body = await readJson(request);
      if (!TODO_STATUSES.has(body.status)) {
        sendJson(response, 400, { message: "지원하지 않는 To-do 상태예요." });
        return;
      }

      todo.status = body.status;
      todo.completedBy = todo.status === "done" ? USER_ID : undefined;
      todo.completedAt = todo.status === "done" ? now() : undefined;
      todo.updatedAt = now();

      if (todo.status !== "pending") {
        state.pushSchedules = state.pushSchedules.map((schedule) =>
          schedule.todoId === todo.id && schedule.status === "pending"
            ? { ...schedule, status: "cancelled", updatedAt: now() }
            : schedule,
        );
      }

      sendJson(response, 200, todo);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/notices/analyze") {
      const rawBody = await readBody(request);
      const children = readMultipartJson(rawBody, "children") ?? state.children;
      sendJson(response, 200, mockAnalyzeNotice(children));
      return;
    }

    const confirmMatch = url.pathname.match(/^\/v1\/notices\/([^/]+)\/confirm$/);
    if (method === "POST" && confirmMatch) {
      const body = await readJson(request);
      if (Array.isArray(body.todos)) {
        const todos = body.todos.map((todo) =>
          normalizeTodo({ ...todo, sourceNoticeId: confirmMatch[1] }),
        );
        state.todos.unshift(...todos);
        state.pushSchedules.push(...todos.flatMap(createPushSchedulesForTodo));
      }
      if (Array.isArray(body.calendarEvents)) {
        state.calendarEvents.unshift(...body.calendarEvents.map(normalizeCalendarEvent));
      }
      sendJson(response, 200, currentFamilyResponse());
      return;
    }

    if (method === "GET" && url.pathname === "/v1/push/schedules") {
      sendJson(response, 200, state.pushSchedules);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/push/schedules") {
      const body = await readJson(request);
      const schedule = normalizePushSchedule(body);
      state.pushSchedules.push(schedule);
      sendJson(response, 201, schedule);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/push/dispatch-due") {
      const dispatchedAt = now();
      const dueSchedules = state.pushSchedules.filter(
        (schedule) =>
          schedule.status === "pending" &&
          new Date(schedule.scheduledAt).getTime() <= new Date(dispatchedAt).getTime(),
      );

      state.pushSchedules = state.pushSchedules.map((schedule) =>
        dueSchedules.some((dueSchedule) => dueSchedule.id === schedule.id)
          ? { ...schedule, status: "sent", sentAt: dispatchedAt, updatedAt: dispatchedAt }
          : schedule,
      );

      sendJson(response, 200, {
        dispatchedAt,
        sentCount: dueSchedules.length,
        schedules: dueSchedules.map((schedule) => ({
          ...schedule,
          status: "sent",
          sentAt: dispatchedAt,
          updatedAt: dispatchedAt,
        })),
      });
      return;
    }

    sendJson(response, 404, { message: "지원하지 않는 mock API 경로예요." });
  } catch (error) {
    sendJson(response, error instanceof ClientError ? error.status : 500, {
      message: error instanceof Error ? error.message : "mock API 처리에 실패했어요.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Mock API server listening on http://localhost:${PORT}`);
});

function currentFamilyResponse() {
  return {
    family: state.family,
    children: state.children,
    todos: state.todos,
    calendarEvents: state.calendarEvents,
    pushSchedules: state.pushSchedules,
  };
}

function mockAnalyzeNotice(children) {
  const child = children[0] ?? state.children[0] ?? { id: "child-demo", name: "아이" };
  const noticeId = `notice-${randomUUID()}`;

  return {
    noticeId,
    sourceText: [
      "[Mock OCR]",
      "5월 15일 학부모 상담이 있습니다.",
      "미술 시간 준비물: 도화지, 크레파스, 물감",
      "5월 14일까지 체험학습 동의서를 제출해주세요.",
    ].join("\n"),
    calendarEvents: [
      {
        id: `${noticeId}-event-1`,
        title: "학부모 상담",
        childId: child.id,
        childName: child.name,
        date: "2026-05-15",
        startTime: "14:00",
        location: "교실",
        confidence: 0.86,
        needsUserConfirmation: false,
      },
    ],
    todos: [
      {
        id: `${noticeId}-todo-1`,
        title: "미술 준비물 챙기기",
        childId: child.id,
        childName: child.name,
        category: "preparation",
        dueDate: "오늘",
        description: "도화지, 크레파스, 물감",
        confidence: 0.91,
        needsUserConfirmation: false,
      },
      {
        id: `${noticeId}-todo-2`,
        title: "체험학습 동의서 제출",
        childId: child.id,
        childName: child.name,
        category: "submission",
        dueDate: "내일",
        confidence: 0.78,
        needsUserConfirmation: true,
        reason: "제출 대상과 날짜 확인이 필요해요.",
      },
    ],
    infoOnlyItems: [
      {
        id: `${noticeId}-info-1`,
        title: "다음 주부터 여름 체육복 착용 가능",
        confidence: 0.82,
      },
    ],
    warnings: ["조건부 문구나 날짜가 애매한 항목은 확인 필요로 표시했어요."],
  };
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  const allowedOrigin =
    typeof origin === "string" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
      ? origin
      : "http://localhost:5173";

  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeTodo(body) {
  if (!optionalString(body.title)) {
    throw new ClientError("To-do 제목을 입력해주세요.", 400);
  }

  if (!optionalString(body.childId)) {
    throw new ClientError("To-do를 연결할 아이를 선택해주세요.", 400);
  }

  const category = TODO_CATEGORIES.has(body.category) ? body.category : "other";
  const status = TODO_STATUSES.has(body.status) ? body.status : "pending";
  const timestamp = now();

  return {
    id: optionalString(body.id) ?? `todo-${randomUUID()}`,
    familyId: optionalString(body.familyId) ?? FAMILY_ID,
    childId: String(body.childId),
    createdBy: optionalString(body.createdBy) ?? USER_ID,
    title: String(body.title),
    description: optionalString(body.description),
    category,
    dueDate: optionalString(body.dueDate),
    remindAt: optionalString(body.remindAt),
    status,
    sourceNoticeId: optionalString(body.sourceNoticeId),
    completedBy: optionalString(body.completedBy),
    completedAt: optionalString(body.completedAt),
    createdAt: optionalString(body.createdAt) ?? timestamp,
    updatedAt: timestamp,
  };
}

function normalizeCalendarEvent(body) {
  if (!optionalString(body.title)) {
    throw new ClientError("일정 제목을 입력해주세요.", 400);
  }

  if (!optionalString(body.date)) {
    throw new ClientError("일정 날짜를 입력해주세요.", 400);
  }

  const timestamp = now();

  return {
    id: optionalString(body.id) ?? `event-${randomUUID()}`,
    familyId: optionalString(body.familyId) ?? FAMILY_ID,
    childId: optionalString(body.childId),
    createdBy: optionalString(body.createdBy) ?? USER_ID,
    title: String(body.title),
    date: String(body.date),
    startTime: optionalString(body.startTime),
    endTime: optionalString(body.endTime),
    location: optionalString(body.location),
    googleEventId: optionalString(body.googleEventId),
    googleCalendarId: optionalString(body.googleCalendarId),
    sourceNoticeId: optionalString(body.sourceNoticeId),
    status: optionalString(body.status) ?? "pending",
    createdAt: optionalString(body.createdAt) ?? timestamp,
    updatedAt: timestamp,
  };
}

function normalizePushSchedule(body) {
  if (!optionalString(body.todoId)) {
    throw new ClientError("푸시 예약을 연결할 To-do가 필요해요.", 400);
  }

  const timestamp = now();

  return {
    id: optionalString(body.id) ?? `push-${randomUUID()}`,
    userId: optionalString(body.userId) ?? USER_ID,
    familyId: optionalString(body.familyId) ?? FAMILY_ID,
    todoId: String(body.todoId),
    scheduledAt: optionalString(body.scheduledAt) ?? timestamp,
    status: optionalString(body.status) ?? "pending",
    sentAt: optionalString(body.sentAt),
    createdAt: optionalString(body.createdAt) ?? timestamp,
    updatedAt: timestamp,
  };
}

function createPushSchedulesForTodo(todo) {
  if (todo.status !== "pending") {
    return [];
  }

  return [
    normalizePushSchedule({
      todoId: todo.id,
      scheduledAt: todo.remindAt ?? scheduledAtFromDueDate(todo.dueDate),
    }),
  ];
}

function scheduledAtFromDueDate(dueDate) {
  const scheduledDate = new Date();
  if (dueDate === "내일") {
    scheduledDate.setDate(scheduledDate.getDate() + 1);
  }
  scheduledDate.setHours(20, 0, 0, 0);
  return scheduledDate.toISOString();
}

class ClientError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function readJson(request) {
  const rawBody = await readBody(request);
  if (!rawBody.length) {
    return {};
  }
  return JSON.parse(rawBody.toString("utf8"));
}

function readMultipartJson(rawBody, fieldName) {
  const text = rawBody.toString("utf8");
  const match = text.match(new RegExp(`name="${fieldName}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`));
  if (!match?.[1]) {
    return undefined;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}
