# 알림장쏙 백엔드 진행 순서

## 추가로 필요한 구성

1. Auth
   - 앱인토스 `getAnonymousKey()`로 토스 사용자 식별값 확보
   - Supabase Anonymous Auth 세션과 `profiles.toss_user_hash` 연결
   - 서버 API 요청마다 `userId`, `familyId`, 권한 검증

2. DB
   - 가족, 구성원, 자녀, 알림장 분석 결과, To-do, 캘린더 이벤트, 푸시 예약 저장
   - Supabase Postgres + RLS 사용

3. Server API
   - 프론트가 직접 OCR/LLM/Calendar/Push 키를 갖지 않도록 서버에서 처리
   - 추천: Supabase Edge Functions
   - Google Calendar OAuth/앱인토스 mTLS처럼 런타임 제약이 있으면 Cloud Run 보조 사용

4. OCR
   - 이미지 원본은 임시 메모리/임시 파일에서만 처리
   - OCR 후 원본 삭제, 저장은 OCR 텍스트와 분석 JSON만

5. LLM
   - OCR 텍스트를 `ParsedNoticeResult`로 구조화
   - confidence 낮거나 조건부 문구는 자동 저장하지 않고 확인 필요 처리

6. Google Calendar OAuth
   - 앱인토스 사용자 식별/저장과 별도 권한
   - refresh token 암호화 저장
   - 확정된 일정만 Google Calendar에 insert

7. 앱인토스 푸시
   - `remindAt` 기준으로 서버가 예약/발송
   - Apps in Toss Smart Message API 사용
   - 중복 발송 방지를 위해 `pushSchedules`에 상태 저장

8. Scheduler
   - 1~5분 간격으로 due push schedule 조회
   - pending -> sent/failed/cancelled 상태 전이

9. 운영/보안
   - 환경변수와 Secret Manager
   - 요청 rate limit
   - 이미지 크기/확장자 제한
   - 분석 실패 재시도와 비용 한도

## 권장 구현 순서

1. DB 모델과 서버 API 계약 확정
2. Supabase schema/RLS 적용
3. 가족/자녀/To-do CRUD API
4. 이미지 업로드 분석 API mock 연결
5. 분석 결과 확정 저장 API와 pushSchedules 생성
6. Google Vision OCR 연결
7. LLM 구조화와 schema validation
8. Google Calendar OAuth와 이벤트 생성
9. 앱인토스 푸시 예약 테이블과 발송 worker
10. 운영 로그, 에러 처리, 비용 제한

## 1차 API 목록

- `GET /v1/me`
- `GET /v1/families/current`
- `POST /v1/children`
- `PATCH /v1/children/:childId`
- `GET /v1/todos`
- `POST /v1/todos`
- `PATCH /v1/todos/:todoId`
- `POST /v1/notices/analyze`
- `POST /v1/notices/:noticeId/confirm`
- `GET /v1/calendar/auth-url`
- `POST /v1/calendar/oauth/callback`
- `POST /v1/calendar/events`
- `GET /v1/push/schedules`
- `POST /v1/push/schedules`
- `POST /v1/push/dispatch-due`
