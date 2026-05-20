# bug_events → Google Sheets 적재

## 구조

1. 앱에서 에러 발생
2. `public.bug_events` 테이블에 저장
3. Supabase Edge Function `export-bug-events-to-sheet` 실행
4. Google Apps Script Web App이 시트 `bug_events` 탭에 append

## 필요한 값

- `BUG_EVENTS_SHEET_WEBHOOK_URL`
- `SCHEDULER_SECRET`

## Apps Script 준비

1. Google Spreadsheet를 새로 만듭니다.
2. `확장 프로그램 → Apps Script`를 엽니다.
3. [`bug-events-sheet-apps-script.gs`](./bug-events-sheet-apps-script.gs) 내용을 붙여넣습니다.
4. `배포 → 새 배포 → 웹 앱`
5. 실행 사용자: 본인
6. 액세스 권한: 링크를 아는 모든 사용자
7. 배포 후 Web App URL 복사

## Supabase Secret 설정

```bash
supabase secrets set BUG_EVENTS_SHEET_WEBHOOK_URL='https://script.google.com/macros/s/.../exec'
supabase secrets set SCHEDULER_SECRET='your-secret'
```

## 함수 수동 실행

```bash
curl -X POST \
  'https://ktcirkevttdfscqepzvx.supabase.co/functions/v1/export-bug-events-to-sheet?limit=100' \
  -H 'x-scheduler-secret: your-secret'
```

## Dry run

```bash
curl -X POST \
  'https://ktcirkevttdfscqepzvx.supabase.co/functions/v1/export-bug-events-to-sheet?dryRun=true&limit=5' \
  -H 'x-scheduler-secret: your-secret'
```

## 추천 운영

- 5분마다 1회 실행
- 실패 로그는 `last_export_error`에 저장
- 성공한 로그는 `exported_at`이 채워짐
