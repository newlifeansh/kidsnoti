const SHEET_NAME = 'bug_events';
const SPREADSHEET_ID_KEY = 'BUG_EVENTS_SPREADSHEET_ID';
const SPREADSHEET_URL_KEY = 'BUG_EVENTS_SPREADSHEET_URL';
const SPREADSHEET_NAME_KEY = 'BUG_EVENTS_SPREADSHEET_NAME';
const DEFAULT_SPREADSHEET_NAME = 'Alimjangssok Bug Events';

function doPost(e) {
  const sheet = getOrCreateSheet_();
  const body = JSON.parse(e.postData.contents || '{}');
  const rows = Array.isArray(body.rows) ? body.rows : [];

  ensureHeader_(sheet);

  if (rows.length === 0) {
    return jsonResponse_({ ok: true, appended: 0 });
  }

  const values = rows.map((row) => [
    row.id || '',
    row.createdAt || '',
    row.severity || '',
    row.screen || '',
    row.step || '',
    row.eventType || '',
    row.message || '',
    row.userId || '',
    row.familyId || '',
    row.errorCode || '',
    row.childCount || '',
    row.todoCount || '',
    row.calendarEventCount || '',
    row.selectedFileCount || '',
    row.metadataJson || '',
    body.source || '',
    body.exportedAt || '',
  ]);

  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
  return jsonResponse_({ ok: true, appended: values.length });
}

function doGet() {
  const sheet = getOrCreateSheet_();
  return jsonResponse_({
    ok: true,
    spreadsheetId: sheet.getParent().getId(),
    spreadsheetUrl: sheet.getParent().getUrl(),
    sheetName: sheet.getName(),
  });
}

function getOrCreateSheet_() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty(SPREADSHEET_ID_KEY);
  let spreadsheet;

  if (spreadsheetId) {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } else {
    const spreadsheetName = props.getProperty(SPREADSHEET_NAME_KEY) || DEFAULT_SPREADSHEET_NAME;
    spreadsheet = SpreadsheetApp.create(spreadsheetName);
    props.setProperty(SPREADSHEET_ID_KEY, spreadsheet.getId());
    props.setProperty(SPREADSHEET_URL_KEY, spreadsheet.getUrl());
  }

  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeader_(sheet) {
  if (sheet.getLastRow() > 0) return;

  sheet.appendRow([
    'id',
    'created_at',
    'severity',
    'screen',
    'step',
    'event_type',
    'message',
    'user_id',
    'family_id',
    'error_code',
    'child_count',
    'todo_count',
    'calendar_event_count',
    'selected_file_count',
    'metadata_json',
    'source',
    'exported_at',
  ]);
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
