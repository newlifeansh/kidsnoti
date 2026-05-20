# PROJECT

마지막 업데이트: `2026-05-16 21:48:13 KST`

## 프로젝트 개요

- 프로젝트명: `kids-notice-ait`
- 서비스명: `알림장쏙`
- 실행 주소: `http://localhost:5173`
- 목적: 키즈노트/종이 알림장/PDF를 업로드하면 OCR + AI 분석으로 일정, 준비물, 숙제, 제출물, 학부모 확인 항목을 정리하고, 저장 후 홈/알림 흐름까지 연결하는 앱
- 기술 스택: `Vite + React + TypeScript + Supabase + Apps in Toss`

## 현재 기준 핵심 상태

- 스플래시, 온보딩, 아이 등록 화면 동작
- 홈 화면 최신 버전 UI 반영
- 아이 프로필 등록/상세/삭제 동작
- 홈 상단 아바타 클릭 시 프로필 사진 선택 바텀시트 동작
- 업로드 -> OCR/AI 분석 -> 결과 확인 -> 저장 동작
- 저장 후 홈 반영 동작
- 설정 화면 정리 완료
- 홈 히어로 카드와 프로필 스트립 병합 완료
- 히어로 카드 내 텍스트 정보만 유지, 프로필 이미지는 아이 정보 진입 역할로 정리
- Google Calendar 연동은 이번 MVP에서 제외, 설정 내 placeholder UI만 유지
- Toss 광고 슬롯 3종에 Apps in Toss 광고 ID 반영 완료
- 알림 동의 재노출 정책 반영
- Apps in Toss 스마트 발송/알림동의문 콘솔 작업 진행 완료
- JPG/PNG/PDF 업로드 지원
- 업로드 파일 최대 `3개` 제한
- 원본 이미지/PDF는 장기 저장하지 않음
- Supabase 기반 저장/가족/초대/아이/알림 설정 흐름 연결 완료
- 가족 초대 백엔드 RPC 실동작 확인 완료
- 가족 초대 관계 지정 UX 반영 완료
- 버그 이벤트 수집, 버그 현황 화면, Google Sheets export 자동화 연결 완료
- 앱 내부 `버그 현황`은 임시 운영도구 수준이며, 장기적으로는 별도 admin으로 분리하는 방향 합의

## 최근 반영된 주요 제품/UI 변경

### 홈 화면

- 홈 최신 기준:
  - 자녀 선택 칩 UI
  - 히어로 카드
  - `알림장 업로드하기` 버튼
  - 업로드 버튼 아래 Toss 배너 슬롯
  - `오늘 준비물`, `내일 준비물`, `다가오는 일정`
- `오늘 준비물`, `내일 준비물`, `이번 주 일정` 카드에 수동 추가 `+` 버튼 반영
- `이번 주 일정` 아이콘은 체크리스트형 배지 스타일로 정리
- 홈 히어로 상단 변경 사항
  - 히어로 카드와 하단 프로필 스트립을 하나로 병합
  - 히어로 카드 안의 별도 `정보 보기` 버튼 제거
  - 이름 노출 제거
  - 카드 안에는 기관/학년/반 등 정보 텍스트만 남김
  - 오른쪽 프로필 이미지를 누르면 아이 정보 화면으로 이동
- 홈 일정 카드 변경 사항
  - 카드 제목 `이번 주 일정` -> `다가오는 일정`
  - 일정 row 클릭 시 상세 바텀시트 노출
  - 바텀시트에서 일정 삭제 가능

### 설정 화면

- 설정 아이콘 클릭 시 주황색 tap highlight 제거
- `Google Calendar 연동`은 별도 페이지를 없애고 설정 안에서 바로 토글/상태 UI로 정리
- 캘린더 상태 문구 정리:
  - `현재 상태` -> `연결 상태`
  - `연결 안 됨` -> `미 연결`
  - `기본 캘린더 primary` 노출 제거
- `앱인토스 알림 설정`은 `Google Calendar 연동` 아래로 이동
- `앱인토스 알림 설정`, `가족 초대하기` 볼드 처리
- `가족 구성원` 우측 `2개` 카운트 제거
- 자녀 카드 클릭 정렬/레이아웃 수정
- 자녀 상세 바텀시트 아바타 과대 노출 문제 수정
- 자녀 상세 바텀시트에서 삭제 가능
- 가족 초대 시 `남편`, `할머니`, `보호자` 등 대상 관계를 먼저 고르는 시트 추가
- 가족 초대 공유 실패 시 앱 내부 `가족 초대 링크` 바텀시트 노출
- 초대 링크 시트에서 `카톡 문구 복사`, `시스템 공유`, `링크 열기`, `링크 복사` 제공
- 초대 링크 시트에서 선택한 관계가 `할머니 초대 링크`처럼 보이도록 반영
- `버그 현황` 메뉴는 현재 운영자 allowlist 기반으로 숨김 처리 가능하게 보강했으나,
  이 기능은 장기적으로 앱 내부가 아니라 별도 admin으로 분리하기로 방향 정리

### 온보딩/초기 진입

- 온보딩 제목 가운데 정렬 및 폰트 축소
- 슬라이더/카드 중앙 정렬 보정
- 카드 외곽 그림자/글로우 과한 효과 제거
- 슬라이드 카드 비주얼 얼룩처럼 보이던 효과 완화

### 업로드/분석 결과

- 업로드 화면의 `알림장에서 찾을 내용` 카드 아래 배너 슬롯 추가
- 분석 결과 저장 시 프론트 -> 백엔드 결과 구조 정규화
- mock 날짜/시간 형식 정리
- 분석 결과 확인 카드에 `타이틀 + 아이 이름/날짜 + 설명` 노출
- 업로드 문구를 `사진 또는 파일을 업로드하여 한번에 알림장을 정리해요.`로 정리
- 업로드 버튼 문구를 `알림장 업로드하기`로 정리
- `AI 분석 실행` 버튼 문구 정리
- PDF 선택 시 페이지별 이미지로 임시 변환 후 기존 OCR 흐름으로 연결
- 여러 장 업로드 후 개별 취소/전체 취소 가능
- 결과 화면에서 To-do 후보는 바텀시트 편집 가능
- 저장 에러 시 토스 스타일 에러 팝업 노출
- 결과 화면 상단에 업로드 완료 후 전면 배너 슬롯 추가

## 광고 배치 / Apps in Toss 광고 ID

- 배너 A
  - 위치: 홈 `알림장 업로드하기` 버튼 아래
  - 광고 ID: `ait.v2.live.3a4c8b61b70145bf`
- 배너 B
  - 위치: 업로드 화면 `알림장에서 찾을 내용` 카드 아래
  - 광고 ID: `ait.v2.live.3dbb4427bbf84790`
- 전면 배너
  - 위치: 업로드 완료 후 결과 화면 상단
  - 광고 ID: `ait.v2.live.31cd218812e44ce0`
- 현재 구현 형태
  - 실제 광고 SDK 삽입 전, 각 위치에 연결 ID가 보이는 슬롯 UI로 반영
  - 추가 미연결 광고 placeholder는 현재 코드 기준 없음

## 가족 초대 UX / 관계 지정

- 현재 초대 흐름
  - 설정 화면 `가족 초대하기` 클릭
  - 초대 대상 관계 선택 시트 노출
  - 예시 선택: `남편`, `아내`, `할머니`, `할아버지`, `엄마`, `아빠`, `보호자`
  - 필요 시 직접 입력 가능
  - 이후 공유 시도 또는 앱 내부 초대 링크 시트로 연결
- 현재 초대 링크 형태
  - `invite?code=...&name=...`
  - 예: `할머니`를 선택하면 링크에 `name=할머니` 포함
- 현재 앱 반영 상태
  - 초대 링크 시트 문구에 선택한 관계를 함께 표시
  - `할머니 초대 링크`처럼 링크 성격이 명확히 보이도록 정리
  - 초대 URL 진입 시 `name` 파라미터가 있으면 수락 전 `profiles.display_name` 반영 시도
- 현재 서버 반영 상태
  - 프런트/로컬 SQL 파일에는 `intended_display_name` 기반 확장안 반영
  - 원격 Supabase는 아직 구버전 `create_family_invite` 함수 사용 중
  - 그래서 현재 운영 환경에서는 관계 지정 링크 UX는 동작하지만, 가족 구성원 `display_name` 영구 반영은 SQL 마이그레이션 적용 후 완전해짐

## OCR/저장/데이터 흐름 관련 반영 사항

### 분석/저장 안정화

- 분석 타임아웃 상향
- 예전 로컬 fallback 제거
- mock/fallback 경로 제거
- 실제 실패는 실패로 처리하도록 정리
- 업로드 이미지 최적화 추가
  - 긴 변 최대 `1600px` 기준 리사이즈
  - 분석 전 이미지 용량 축소
- OCR/LLM 결과에서 발행일/배부일/공문 날짜를 마감일로 잘못 쓰지 않도록 보정
- 저장 직전 항목 정규화
  - 빈 제목 기본값 보정
  - childId 없는 경우 현재 아이로 매핑
  - dueDate 이상값은 `날짜 미정` 처리
- 저장 후 홈 재조회 실패 시에도 방금 저장한 항목을 fallback 병합해 홈 반영
- fallback 병합 시 내용 기준 dedupe 추가로 2중 저장처럼 보이던 문제 보정

### 결과 저장 스키마 정리

- 화면용 `ParsedNoticeResult`를 백엔드 저장용 구조로 변환 후 저장
- `category`, `description`, `startTime`, `infoOnlyItems` 등 DB 스키마와 맞게 정리
- `calendar_events`에 아래 필드까지 저장하도록 확장
  - `description`
  - `reminder_at`
  - `confidence`
  - `needs_user_confirmation`
  - `reason`

### Supabase 저장 안정화

- Apps in Toss 연결을 single-flight promise로 정리해 signup 경쟁 감소
- `notification_preferences` 구스키마 호환 저장 분기 추가
- 아이 삭제용 Supabase repository 함수 추가
- `profiles.toss_user_hash`, `profiles.toss_user_key` 저장/조회 정리
- `notification_preferences.schedule_enabled/schedule_day/schedule_time` 실제 저장 반영
- `family_members.display_name` 백필 및 생성/초대 시 자동 저장 반영
- `push_schedules`가 todo insert뿐 아니라 update/archive에도 정합성 맞추도록 트리거 보강

### 가족 초대 실동작 확인 결과

- 프런트 흐름
  - 설정 화면 `가족 초대하기` 버튼 -> 관계 선택 시트 -> `connectAppsInTossUser()` -> `createSupabaseFamilyInvite()` -> 공유 시도
  - 초대 URL 진입 시 `acceptSupabaseFamilyInvite()`로 자동 수락 처리
- DB/RPC 구현 확인
  - `create_family_for_current_user`
  - `create_family_invite`
  - `accept_family_invite`
  - `leave_current_family`
  - `remove_family_member`
- 원격 Supabase 실검증 완료
  - 익명 사용자 1명으로 가족 생성 성공
  - 초대 코드 생성 성공
  - 다른 익명 사용자로 초대 수락 성공
  - `family_members`에 `owner`, `member` 2명 반영 확인
  - 초대받은 사용자 가족 나가기 성공
- 로컬 브라우저 fallback 확인
  - 네이티브 공유/클립보드 권한이 없는 환경에서는 오류로 끝내지 않고 앱 내부 초대 링크 시트로 대체
  - 관계 선택 시트와 `할머니 초대 링크` 형태의 링크 시트 노출 확인 완료
  - 생성 링크에 `name` 파라미터 포함 확인 완료

## 알림 기능 현재 상태

## 목표 알림 시나리오

- `tomorrow_preparation_check`
  - `empty`
  - `all_checked`
  - `pending_items`
- `today_final_check`
  - `empty`
  - `all_checked`
  - `pending_items`

즉 최종적으로는 `2개 트리거 x 3개 상태 = 6개 발송 상태` 구조입니다.

### 알림 동의 UX 정책

- 1차 트리거: 업로드 결과 화면에서 `확인하고 저장` 직후
- 거절/닫기 시 즉시 반복 노출하지 않음
- 재노출 조건:
  - 설정에서 알림 토글 `ON` 시도 시 즉시 재시도
  - 다음 업로드 저장 시점에는 `3일 쿨다운` 후 재시도

### 프론트 반영 완료 항목

- 알림 동의 시트 추가
- 저장 성공 뒤 조건부 동의 시트 노출
- 설정 토글 ON 시 동의 없는 경우 먼저 동의 시트 노출
- 동의 상태 로컬/서버 추적 필드 반영

### 데이터 모델 반영 완료 항목

- `notification_preferences`
  - `consent_status`
  - `consent_last_prompted_at`
  - `consent_accepted_at`
  - `consent_declined_at`
  - `schedule_enabled`
  - `schedule_day`
  - `schedule_time`
- `message_delivery_logs`
  - `child_id`
  - `target_date`
  - `trigger_kind`
- `push_schedules`
  - pending 기준 unique 관리
  - todo 수정/보관 시 cancel/update 동기화

### 백엔드 반영 완료 항목

- `dispatch-push`
  - 실제 발송 전 준비/호환 구조 정리
- 신규 함수:
  - `supabase/functions/dispatch-daily-smart-messages/index.ts`
- 역할:
  - 자녀별 준비물 상태 계산
  - `today/tomorrow` 기준 평가
  - `empty / all_checked / pending_items` 분기
  - 템플릿 코드가 있으면 발송, 없으면 skip

### 현재 실제 발송 상태

- 실제 Smart Message 운영 발송은 아직 `OFF`
- 이유:
  - 토스 템플릿 심사 승인 대기
  - secret 최종 연결 전 단계

## 버그 트래킹 / 운영 모니터링 상태

### 버그 수집

- 전역 에러 수집
  - `window.onerror`
  - `unhandledrejection`
  - React Error Boundary
- 핵심 단계 로그 수집
  - 업로드 선택
  - PDF 변환
  - OCR 시작/성공/실패
  - 저장 시작/성공/실패
  - 알림 설정 저장

### 저장 위치

- Supabase `bug_events` 테이블 저장
- 민감한 원문 전체 대신 step, screen, message, metadata 중심 저장

### 운영 확인 경로

- 현재 앱 내부 `설정 > 버그 현황`은 임시 운영 UI
- Supabase SQL Editor용 조회 쿼리 세트 준비
- Google Sheets 시간순 export 자동화 연결

### 버그 현황 화면 관련 최신 판단

- 기존 구조:
  - 앱 내부 `설정 > 버그 현황`
  - 자기 계정 로그 또는 운영자 allowlist 기반 접근을 실험
- 확인된 문제:
  - 서비스 운영자가 보고 싶은 것은 `가족 owner 기준`이 아니라 `서비스 전체 계정 버그 현황`
  - 사용자 앱 내부에 운영 대시보드를 숨겨 넣는 방식은 권한/보안/확장성 측면에서 애매함
- 현재 판단:
  - `버그 현황`은 별도 운영자 admin으로 분리하는 것이 맞음
  - 앱 내부 메뉴는 임시 도구 수준으로만 간주
- 코드 상태:
  - `VITE_OPERATOR_USER_IDS` 기반 프론트 숨김 로직 반영
  - `supabase/functions/admin-bug-events/index.ts` 초안 추가
  - `src/services/bugTracking.ts`는 운영자 전체 로그용 함수 호출 구조로 조정됨
  - 다만 원격 배포/운영 연결은 완료 전 단계
- 결론:
  - 별도 admin 과제로 재정의
  - 앱 내부 버그 현황은 추후 제거 또는 개발용으로만 유지 검토

### Google Sheets export

- Apps Script 웹앱 배포 완료
- Supabase secret `BUG_EVENTS_SHEET_WEBHOOK_URL` 연결 완료
- `bug_events` -> Google Sheets 적재 검증 완료
- 자동화:
  - 이름: `Bug Events Export`
  - 주기: 매 1시간

### 에러 팝업

- 저장/분석 실패 시 토스 스타일 팝업 노출
- 내부 오류 코드 함께 표시하도록 보강

## Apps in Toss / 콘솔 진행 상태

### 알림동의문

- 알림동의문 등록 완료
- 이름: `준비물·일정 알림 동의`
- 성격: 특정 조건 충족 시 직접 발송하는 기능성 알림용

### 기능성 메시지 템플릿

초안 생성 및 검토 요청 완료:

- `kidsnoti-tomorrow-empty`
- `kidsnoti-tomorrow-all-checked`
- `kidsnoti-tomorrow-pending-items`
- `kidsnoti-today-empty`
- `kidsnoti-today-all-checked`
- `kidsnoti-today-pending-items`

현재 상태:

- 6개 모두 콘솔에서 `검토 중`
- 각 상세 화면에서 `검토를 요청했어요` 토스트와 `검토 중이에요` 상태 확인 완료

## 원격 Supabase 진행 상태

- 최신 SQL 반영 진행함
- Edge Function 배포 진행함
- 신규 일일 평가 함수 배포 진행함
- `sync-toss-user-key` 흐름 준비됨
- 알림 연동은 `연동 준비 완료 / 실제 발송 비활성화` 상태
- `analyze-notice` / `dispatch-push` / `dispatch-daily-smart-messages` / `export-bug-events-to-sheet` 계열 운영 준비
- 저장 관련 컬럼 누락 이슈(`toss_user_hash`, `toss_user_key`) 정리 완료
- 가족 초대 관계 지정 확장 SQL은 로컬 파일 반영 완료, 원격 DB 마이그레이션은 아직 필요

## DB 저장 기준 정리

- 장기 저장하지 않는 것
  - 원본 이미지
  - 원본 PDF
- 저장하는 것
  - OCR 텍스트 `notices.source_text`
  - 구조화 결과 `notices.parsed_result`
  - 자녀 정보 `children`
  - 가족/구성원/초대 `families`, `family_members`, `family_invites`
  - 할 일 `todos`
  - 일정 `calendar_events`
  - 알림 설정 `notification_preferences`
  - 발송 스케줄 `push_schedules`
  - 발송 로그 `message_delivery_logs`
  - 버그 로그 `bug_events`

## 현재 기준 중요 파일

- `/Users/sukhwan/Documents/New project/kids-notice-ait/src/App.tsx`
  - 홈/설정/업로드/동의 시트/프로필 상세/수동 추가/버그 현황 흐름 대부분 포함

- `/Users/sukhwan/Documents/New project/kids-notice-ait/src/App.css`
  - 홈/설정/온보딩/바텀시트/배너 placeholder 스타일 정리

- `/Users/sukhwan/Documents/New project/kids-notice-ait/src/services/noticeAnalysis.ts`
  - OCR/분석 결과 처리 정리
  - 발행일/배부일/공문 날짜 보정
  - PDF 업로드 후 OCR 결과 정규화

- `/Users/sukhwan/Documents/New project/kids-notice-ait/src/services/supabaseRepository.ts`
  - Apps in Toss 연결
  - 알림 설정 저장
  - consent 상태 저장/조회
  - 자녀 삭제
  - notice/todo/calendar event 저장
  - 저장 fallback 응답 처리

- `/Users/sukhwan/Documents/New project/kids-notice-ait/src/services/backendApi.ts`
  - 캘린더 auth URL/Fallback 등 백엔드 연동 정리

- `/Users/sukhwan/Documents/New project/kids-notice-ait/src/services/bugTracking.ts`
  - bug_events 저장/조회
  - 로컬 fallback queue
  - 운영자 전체 조회용 Edge Function 호출

- `/Users/sukhwan/Documents/New project/kids-notice-ait/src/services/pdfUpload.ts`
  - PDF -> 이미지 변환

- `/Users/sukhwan/Documents/New project/kids-notice-ait/src/services/uploadImage.ts`
  - 업로드 이미지 최적화

- `/Users/sukhwan/Documents/New project/kids-notice-ait/scripts/export-bug-events.mjs`
  - bug_events 수동 export 스크립트

- `/Users/sukhwan/Documents/New project/kids-notice-ait/supabase/schema.sql`
- `/Users/sukhwan/Documents/New project/kids-notice-ait/supabase/apply-latest-updates.sql`
  - 최신 DB 구조 기준
  - push schedule 정합성 / calendar event 상세 필드 / family member display_name 반영

- `/Users/sukhwan/Documents/New project/kids-notice-ait/supabase/functions/analyze-notice/index.ts`
  - 분석 함수

- `/Users/sukhwan/Documents/New project/kids-notice-ait/supabase/functions/sync-toss-user-key/index.ts`
  - Apps in Toss 사용자 키 동기화

- `/Users/sukhwan/Documents/New project/kids-notice-ait/supabase/functions/dispatch-push/index.ts`
  - 기존 push dispatch 흐름

- `/Users/sukhwan/Documents/New project/kids-notice-ait/supabase/functions/dispatch-daily-smart-messages/index.ts`
  - 아침/저녁 준비물 상태 평가형 Smart Message 발송 준비 함수

- `/Users/sukhwan/Documents/New project/kids-notice-ait/supabase/functions/admin-bug-events/index.ts`
  - 운영자 전체 bug_events 조회용 Edge Function 초안

- `/Users/sukhwan/Documents/New project/kids-notice-ait/docs/bug-events-sheet-apps-script.gs`
  - bug_events Google Sheets 적재용 Apps Script

- `/Users/sukhwan/Documents/New project/kids-notice-ait/docs/supabase-setup.md`
- `/Users/sukhwan/Documents/New project/kids-notice-ait/docs/supabase-model.md`
  - 운영/모델 문서

## 사용자 선호/의사결정 메모

- 저장 직후 알림 동의는 허용
- 거절 직후 반복 팝업 비선호, 쿨다운 필요
- 설정 토글 ON 시 다시 동의 받는 방식 선호
- 다음 업로드 저장 시점 재시도 허용
- 템플릿은 준비물 요약보다 `미확인 개수` 중심 문구 선호
- 홈 최신 버전은 자녀 칩 + 업로드 버튼 아래 배너 + 준비물 카드 구조 기준
- 광고는 Toss 제공 배너 기준 placeholder로 먼저 배치
- Google Calendar 연동은 다음 릴리즈로 미룸
- PDF 업로드는 허용하되 최대 `3개`까지만 허용
- 버그 로그는 Supabase에도 남기고 Google Sheets로도 적재하는 방향 선호
- 앱 내부 운영도구를 억지로 숨겨두기보다, 운영 현황은 별도 admin으로 분리하는 방향 선호

## 현재 확인된 검증 상태

- `npx tsc --noEmit` 통과
- `npm run build` 통과
- `.ait` 빌드 완료
- 여러 UI 수정은 브라우저에서 반복 확인
- Apps in Toss 콘솔:
  - 알림동의문 등록 확인
  - 템플릿 6개 생성 확인
  - 템플릿 6개 검토 요청 확인
- bug_events:
  - Supabase insert/select smoke test 확인
  - Google Sheets export 실제 적재 확인
- 실제 PDF 업로드 검증:
  - `/Users/sukhwan/Downloads/업로드테스트.pdf`
  - 업로드 성공
  - OCR/AI 분석 성공
  - 결과 확인 성공
  - 저장 후 홈 복귀 성공
  - 알림 동의 저장 성공

## 현재 알려진 제한 사항

- Google Calendar 실제 OAuth/이벤트 생성은 MVP에서 비활성 placeholder 상태
- Smart Message 실제 운영 발송은 템플릿 승인/secret 연결 전까지 OFF
- PDF는 최대 8페이지까지 임시 이미지 변환 기준
- 업로드 파일은 최대 3개
- 일정 상세 필드는 저장되지만 홈 카드 UI에서는 아직 title/date/time/location 중심으로만 노출
- 운영자 전체 버그 대시보드는 아직 앱 내부 정식 기능으로 확정하지 않음
- `admin-bug-events` 함수는 로컬 코드에 추가됐지만 원격 배포/운영 연결은 별도 작업 필요

## 남은 작업

### 1. 토스 심사 승인 대기

- 기능성 템플릿 6개 승인 필요

### 2. 승인 후 secret 연결

예정 secret:

- `APPS_IN_TOSS_TEMPLATE_TOMORROW_EMPTY`
- `APPS_IN_TOSS_TEMPLATE_TOMORROW_ALL_CHECKED`
- `APPS_IN_TOSS_TEMPLATE_TOMORROW_PENDING_ITEMS`
- `APPS_IN_TOSS_TEMPLATE_TODAY_EMPTY`
- `APPS_IN_TOSS_TEMPLATE_TODAY_ALL_CHECKED`
- `APPS_IN_TOSS_TEMPLATE_TODAY_PENDING_ITEMS`

그리고:

- `APPS_IN_TOSS_ENABLE_SMART_MESSAGE=true`

### 3. 운영 DB 최종 반영

- Supabase SQL Editor에서 `supabase/apply-latest-updates.sql` 최신본 실행
- 특히 아래 추가분 반영 필요
  - `calendar_events` 상세 필드
  - `push_schedules` pending unique index / update trigger
  - `family_members.display_name` 백필

### 4. 배포 전 최종 시나리오 재검증

- 이미지 업로드 -> 분석 -> 저장 -> 홈 반영
- PDF 업로드 -> 분석 -> 저장 -> 홈 반영
- 수동 To-do 추가/수정/보관 -> push schedule 정합성
- 에러 발생 시 bug_events + Sheets 적재 확인

### 5. 실발송 최종 점검

- 동의한 사용자만 발송되는지
- 중복 발송 방지 로그가 잘 쌓이는지
- 아침/저녁 시간대 계산이 의도대로인지

### 6. adbanner connection

- 홈/업로드 화면의 광고 영역은 placeholder가 아니라 Apps in Toss `TossAds.attachBanner()` 실연동으로 변경 완료
- 로컬 브라우저에서는 토스 광고 브릿지가 없으면 자동 숨김 처리
- 앱인토스 런타임에서는 `TossAds.initialize()` 후 배너 광고 그룹 ID로 attach
- 홈 배너 ID: `ait.v2.live.3a4c8b61b70145bf`
- 업로드 화면 배너 ID: `ait.v2.live.3dbb4427bbf84790`
- 새 앱인토스 업로드 번들: `kidsnoti.ait`

### 7. 운영자 admin 별도 과제 분리

- 목표:
  - 서비스 전체 계정 기준 운영 현황 조회
  - bug_events, 업로드 실패율, OCR 실패율, 알림 발송 현황 등 통합
- 원칙:
  - 사용자 앱과 분리
  - service role 또는 서버 API 뒤에서만 전체 데이터 조회
  - 운영자 인증은 allowlist 또는 사내 인증으로 분리
- 현재 앱 내부 `버그 현황`은 이 별도 과제로 대체 검토

## 스크린샷/산출물 메모

- 서비스용 스크린샷은 `636x1048` 기준으로 여러 장 생성함
- 최신 홈 기준 스크린샷도 별도 재생성함
- 관련 파일은 `screenshots` 폴더 및 `Downloads/kids-notice-ait-service-screens`에 존재

## 자주 쓰는 검증 명령

```bash
cd "/Users/sukhwan/Documents/New project/kids-notice-ait"
npm run lint
npm run build
```

## 한 줄 요약

- 프론트 제품 화면, 실제 업로드/OCR/저장 흐름, 알림 동의 UX, Supabase 준비, Apps in Toss 알림동의문, Smart Message 템플릿 6개 검토 요청까지 완료
- 현재 남은 핵심은 `토스 심사 승인 후 템플릿 코드 secret 연결 및 실제 발송 활성화`, 그리고 `운영 현황용 별도 admin 분리`
