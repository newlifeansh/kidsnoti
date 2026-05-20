# 알림장쏙 Mock API

실제 Supabase Edge Functions 연결 전, 프론트와 서버 계약을 검증하기 위한 로컬 API 서버입니다.

## 실행

```bash
npm run api:mock
```

기본 주소는 `http://localhost:8080` 입니다.

프론트에서 mock API 분석을 사용하려면 `.env.local`에 아래 값을 둡니다.

```bash
VITE_API_BASE_URL=http://localhost:8080
VITE_NOTICE_ANALYZE_ENDPOINT=http://localhost:8080/v1/notices/analyze
```

## 지원 라우트

- `GET /healthz`
- `GET /v1/me`
- `GET /v1/families/current`
- `POST /v1/children`
- `GET /v1/todos`
- `POST /v1/todos`
- `PATCH /v1/todos/:todoId`
- `POST /v1/notices/analyze`
- `POST /v1/notices/:noticeId/confirm`
- `GET /v1/push/schedules`
- `POST /v1/push/schedules`
- `POST /v1/push/dispatch-due`

## Push mock 동작

- `POST /v1/todos` 또는 `POST /v1/notices/:noticeId/confirm`으로 pending To-do가 저장되면 `pushSchedules`가 자동 생성됩니다.
- `PATCH /v1/todos/:todoId`로 To-do를 `done` 또는 `archived` 처리하면 연결된 pending push schedule은 `cancelled`로 바뀝니다.
- `POST /v1/push/dispatch-due`는 `scheduledAt <= now`인 pending schedule을 찾아 `sent`로 바꾸고 발송 결과를 반환합니다.

## 다음 교체 지점

- `/v1/notices/analyze`: Google Vision OCR + LLM 구조화로 교체
- `/v1/notices/:noticeId/confirm`: Supabase 저장 + Google Calendar insert + pushSchedules 생성으로 교체
- `/v1/todos/:todoId`: Supabase To-do 완료 체크로 교체
- `/v1/push/dispatch-due`: 앱인토스 알림 API 발송 worker로 교체
