# 알림장쏙 Supabase 모델

## 설계 원칙

- 원본 이미지는 저장하지 않는다.
- OCR 텍스트와 LLM 구조화 JSON은 `notices`에 저장한다.
- 준비물, 숙제, 제출물, 학부모 확인은 `todos`에 저장한다.
- 실제 날짜 중심 일정만 `calendar_events`에 저장한다.
- Google Calendar refresh token과 앱인토스 푸시 예약은 서버 전용으로 다룬다.
- 사용자별 알림 설정과 토스 `userKey`는 Smart Message 발송용으로 별도 저장한다.
- 사용자별 알림 설정에는 알림 동의 상태와 마지막 재노출 시점도 함께 저장한다.
- 사용자별 알림 설정에는 준비물 알림 외에 일정 알림 토글/기준/시간도 함께 저장한다.
- 가족 권한은 `family_members` 기준 RLS로 제어한다.

## 주요 테이블

```text
profiles
families
family_members
family_invites
children
notices
todos
calendar_events
calendar_connections     -- server-only
push_schedules           -- server-only
notification_preferences
message_delivery_logs    -- server-only
```

## 인증

- Supabase Auth를 기본 인증으로 사용한다.
- MVP에서는 Google 로그인 또는 앱인토스 사용자 식별값을 Supabase user와 매핑한다.
- 앱인토스 Smart Message 발송용 대상 식별은 `profiles.toss_user_key`를 사용한다.
- Smart Message 실제 발송 전에는 `notification_preferences.consent_status = accepted`를 만족해야 한다.
- 클라이언트는 anon key만 사용한다.
- 서버/Edge Function은 service role key로 OCR, LLM, Calendar, Push 등 민감 작업을 처리한다.

## RLS 요약

- 가족 구성원은 같은 `family_id`의 child/todo/notice/calendar event를 읽을 수 있다.
- owner는 자녀 정보와 가족 구성원을 관리한다.
- member는 To-do 확인/완료 체크를 할 수 있다.
- `calendar_connections`, `push_schedules`는 클라이언트 직접 접근을 막고 서버 API로만 다룬다.
- `notification_preferences`는 본인 설정만 읽고 수정할 수 있다.
- `message_delivery_logs`는 클라이언트 직접 접근을 막고 서버 로그로만 사용한다.
- 초대 링크는 `family_invites.code`를 통해 발급하고, 수락 시 `accept_family_invite` RPC가 같은 `family_id`에 member를 추가한다.
- `todos.remind_at`이 있으면 DB trigger가 가족 구성원별 `push_schedules`를 자동 생성한다.
- 일일 준비물 알림은 `dispatch-daily-smart-messages` 함수가 아침/저녁에 가족/자녀별 상태를 계산해 보낸다.
- 일정 알림은 `dispatch-daily-smart-messages` 함수가 `calendar_events`를 기준으로 오늘/내일 일정을 찾아 자녀별 리마인드를 보낸다.

## 스키마 적용

Supabase SQL Editor에서 아래 파일을 실행한다.

```text
supabase/schema.sql
```

## 다음 구현 포인트

- `profiles` 생성 트리거 또는 회원가입 후 upsert API
- 첫 가족 생성 RPC 또는 Edge Function
- Google Calendar insert를 포함한 `confirm-notice` Edge Function 전환
- Google Calendar refresh token 암호화 저장
- 앱인토스 `appLogin` 기반 `userKey` 저장까지 우선 완료하고, Smart Message 템플릿/발송 트리거는 다음 단계에서 연결
- 기능성 메시지 템플릿은 아래 6개로 분리하는 것을 권장한다.
- 준비물 기능성 메시지 템플릿은 아래 6개로 분리하는 것을 권장한다.
  - `tomorrow_preparation_check.empty`
  - `tomorrow_preparation_check.all_checked`
  - `tomorrow_preparation_check.pending_items`
  - `today_final_check.empty`
  - `today_final_check.all_checked`
  - `today_final_check.pending_items`
- 일정 기능성 메시지 템플릿은 아래 2개를 추가로 권장한다.
  - `tomorrow_schedule_reminder`
  - `today_schedule_reminder`
