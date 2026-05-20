# Supabase 전환 체크리스트

## 1. 프로젝트 생성

1. Supabase에서 새 프로젝트를 만든다.
2. Project Settings > API에서 `Project URL`과 `publishable key`를 확인한다.
3. 로컬 `.env.local`에 아래 값을 넣는다.

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

서버/Edge Function 환경에는 아래 값을 넣는다.

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
GOOGLE_CLOUD_VISION_API_KEY=YOUR_GOOGLE_VISION_KEY
OPENAI_API_KEY=YOUR_OPENAI_KEY
OPENAI_MODEL=gpt-4o-mini
TOKEN_ENCRYPTION_KEY=YOUR_RANDOM_32_BYTE_SECRET
APPS_IN_TOSS_API_BASE_URL=https://apps-in-toss-api.toss.im
APPS_IN_TOSS_ENABLE_SMART_MESSAGE=false
APPS_IN_TOSS_TEMPLATE_TOMORROW_EMPTY=kidsnoti-tomorrow-empty-v2
APPS_IN_TOSS_TEMPLATE_TOMORROW_ALL_CHECKED=kidsnoti-tomorrow-all-checked-v2
APPS_IN_TOSS_TEMPLATE_TOMORROW_PENDING_ITEMS=kidsnoti-tomorrow-pending-items-v2
APPS_IN_TOSS_TEMPLATE_TODAY_EMPTY=kidsnoti-today-empty-v2
APPS_IN_TOSS_TEMPLATE_TODAY_ALL_CHECKED=kidsnoti-today-all-checked-v2
APPS_IN_TOSS_TEMPLATE_TODAY_PENDING_ITEMS=kidsnoti-today-pending-items-v2
APPS_IN_TOSS_TEMPLATE_TOMORROW_SCHEDULE=kidsnoti-tomorrow-schedule-reminder-v2
APPS_IN_TOSS_TEMPLATE_TODAY_SCHEDULE=kidsnoti-today-schedule-reminder-v2
SCHEDULER_SECRET=YOUR_RANDOM_SECRET
```

## 2. DB 스키마 적용

Supabase SQL Editor에서 `supabase/schema.sql` 전체를 실행한다.

적용 후 확인할 테이블:

- `profiles`
- `families`
- `family_members`
- `family_invites`
- `children`
- `notices`
- `todos`
- `calendar_events`
- `calendar_connections`
- `push_schedules`
- `notification_preferences`
- `message_delivery_logs`

## 3. Auth 설정

MVP 추천:

- 앱인토스 비게임 사용자 식별은 `getAnonymousKey()`를 사용
- 토스 스마트 발송 대상 식별은 `appLogin()`으로 받은 인가코드를 서버에서 교환해 얻은 `profiles.toss_user_key`를 사용
- Supabase Auth는 Anonymous sign-ins를 활성화
- `profiles.toss_user_hash`에 앱인토스 사용자 hash 저장
- `profiles.toss_user_key`는 알림 동의까지 완료한 사용자가 토스 로그인 연동을 완료했을 때 저장
- 로컬 브라우저에서는 앱인토스 브릿지가 없으므로 `local-dev-*` 개발용 hash 사용
- 첫 진입 시 family가 없으면 family와 owner member를 함께 생성
- Google 로그인은 앱 저장용이 아니라 Google Calendar OAuth가 필요할 때만 별도 연동

## 4. Edge Functions 우선순위

1. `current-family`
   - 현재 사용자 기준 family, children, todos, calendar_events 반환
2. `create-child`
   - owner 권한 확인 후 child 생성
3. `analyze-notice`
   - 이미지 임시 수신
   - OCR 호출
   - LLM 구조화
   - 원본 이미지 폐기
   - draft notice 생성 또는 parsed result 반환
4. `confirm-notice`
   - Notice confirmed 처리
   - todos/calendar_events 저장
   - push_schedules 생성
   - Google Calendar event insert는 다음 릴리즈에서 활성화
5. `dispatch-push`
   - due push_schedules 조회
   - `notification_preferences`, `profiles.toss_user_key` 확인
   - 앱인토스 Smart Message 발송
   - `message_delivery_logs`와 sent/failed 상태 저장
6. `dispatch-daily-smart-messages`
   - `notification_preferences.enabled = true`
   - `notification_preferences.consent_status = accepted`
   - 저녁에는 `tomorrow_preparation_check`
   - 아침에는 `today_final_check`
   - 자녀별 준비물 상태를 `empty / all_checked / pending_items`로 계산
   - 상태별 템플릿 코드로 Smart Message 발송
   - 일정 알림이 켜져 있으면 `calendar_events`를 기준으로 `today_schedule_reminder` 또는 `tomorrow_schedule_reminder`도 함께 평가
   - 일정은 등록된 이벤트가 있을 때만 발송
   - `message_delivery_logs`에 자녀/날짜/트리거 단위로 기록
7. `sync-toss-user-key`
   - 앱인토스 `appLogin()` 인가코드를 access token으로 교환
   - `login-me` API로 `userKey` 조회
   - `profiles.toss_user_key` 저장
8. 다음 릴리즈: `google-calendar-oauth`, `sync-google-calendar-events`
   - 이번 MVP에서는 Google Calendar 연동을 화면과 자동 동기화에서 제외한다.
   - 함수 초안은 저장소에 남겨두되 기본 배포 스크립트에서는 제외한다.
   - 다음 릴리즈에서 OAuth 키를 넣고 `calendar_connections`/`google_event_id` 저장을 활성화한다.

현재 저장소에는 아래 Edge Function 골격이 포함되어 있다.

```bash
npm run supabase:deploy:functions
```

배포 전 Supabase CLI 인증이 필요하다.

```bash
npx supabase login
```

또는 CI/로컬 환경변수로 `SUPABASE_ACCESS_TOKEN`을 넣고 실행한다.

프론트에서 Edge Function을 바로 호출하려면 `.env.local`의 분석 endpoint를 배포 URL로 바꾼다.

```bash
VITE_NOTICE_ANALYZE_ENDPOINT=https://YOUR_PROJECT.supabase.co/functions/v1/analyze-notice
```

스케줄러는 아래 두 함수를 주기적으로 호출한다.

- `dispatch-push`
- `dispatch-daily-smart-messages`

두 함수 모두 `x-scheduler-secret: $SCHEDULER_SECRET` 헤더를 붙여 호출한다.

## 5. 현재 mock API와 매핑

| 현재 mock API | Supabase 전환 대상 |
| --- | --- |
| `GET /v1/families/current` | Edge Function `current-family` |
| `POST /v1/children` | Edge Function `create-child` 또는 direct insert |
| `PATCH /v1/todos/:todoId` | RLS direct update 또는 Edge Function |
| `POST /v1/notices/analyze` | Edge Function `analyze-notice` |
| `POST /v1/notices/:noticeId/confirm` | Edge Function `confirm-notice` |
| `POST /v1/push/dispatch-due` | Scheduled Edge Function or Cloud Run worker |

현재 프론트는 분석 확정 시 Supabase에 직접 `notices`, `todos`, `calendar_events`를 저장한다. Google Calendar insert와 token 암호화는 이번 MVP에서 제외하고 다음 릴리즈에서 `confirm-notice` Edge Function으로 이동한다.
현재 알림 설정 화면은 `notification_preferences`와 `profiles.toss_user_key`를 사용해 서버 발송 준비까지만 저장한다.
실제 Smart Message 템플릿 코드와 발송 시점 트리거는 아직 비워둬도 된다.

## 6. 보안 기준

- 브라우저에는 `VITE_SUPABASE_PUBLISHABLE_KEY`만 노출한다.
- `SUPABASE_SERVICE_ROLE_KEY`, OpenAI key, Google key, Calendar secret, Apps in Toss secret은 절대 `VITE_`로 만들지 않는다.
- `calendar_connections`, `push_schedules`는 클라이언트에서 직접 접근하지 않는다.
- `message_delivery_logs`는 service role만 쓰고 클라이언트 조회를 막는다.
- 이미지 원본은 Storage에 저장하지 않고 Edge Function 메모리/임시 파일로만 처리한다.
