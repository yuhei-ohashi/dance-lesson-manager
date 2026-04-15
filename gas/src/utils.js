/**
 * utils.js — 基盤ユーティリティ
 *
 * 全モジュールから呼び出す共通関数。
 * GAS のグローバルスコープに展開されるため、関数名の衝突に注意すること。
 */

// ─── 定数 ────────────────────────────────────────────────────────────────────

var TZ = 'Asia/Tokyo';

// ─── 日時フォーマット ─────────────────────────────────────────────────────────

/**
 * Date → "YYYY-MM-DD HH:MM"（スプレッドシート保存用）
 * @param {Date} date
 * @returns {string}
 */
function formatDateTime(date) {
  return Utilities.formatDate(date, TZ, 'yyyy-MM-dd HH:mm');
}

/**
 * Date → "YYYY-MM-DD"
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  return Utilities.formatDate(date, TZ, 'yyyy-MM-dd');
}

/**
 * Date → "HH:MM"
 * @param {Date} date
 * @returns {string}
 */
function formatTime(date) {
  return Utilities.formatDate(date, TZ, 'HH:mm');
}

/**
 * 現在日時を "YYYY-MM-DD HH:MM" で返す
 * @returns {string}
 */
function nowDateTime() {
  return formatDateTime(new Date());
}

/**
 * 現在日付を "YYYY-MM-DD" で返す
 * @returns {string}
 */
function nowDate() {
  return formatDate(new Date());
}

// ─── LockService ─────────────────────────────────────────────────────────────

/**
 * スクリプトロックを取得して fn を実行し、必ず解放する。
 * 書き込みを伴うすべての操作はこの関数でラップすること。
 *
 * @param {Function} fn          - ロック内で実行する関数。戻り値をそのまま返す。
 * @param {number}   [timeoutMs] - ロック取得タイムアウト（デフォルト 10 秒）
 * @returns {*} fn の戻り値
 * @throws ロック取得に失敗した場合は例外をスロー
 */
function withLock(fn, timeoutMs) {
  var timeout = timeoutMs || 10000;
  var lock = LockService.getScriptLock();
  lock.waitLock(timeout);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ─── スプレッドシート取得 ──────────────────────────────────────────────────────

/**
 * バインドされたスプレッドシートを返す。
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * シート名でシートを取得する。存在しない場合は例外をスロー。
 * @param {string} sheetName
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheet(sheetName) {
  var sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('シートが見つかりません: ' + sheetName);
  }
  return sheet;
}

// ─── ID 採番 ──────────────────────────────────────────────────────────────────

/**
 * シートの A 列（ID列）を読んで次の採番 ID を返す。
 * ⚠️ withLock() のコールバック内で呼び出すこと。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {number} 次の ID（1 始まり）
 */
function getNextId(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;
  var ids = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues()
    .map(function(row) { return Number(row[0]); })
    .filter(function(v) { return !isNaN(v) && v > 0; });
  return ids.length === 0 ? 1 : Math.max.apply(null, ids) + 1;
}

// ─── 行の追加・取得・更新 ──────────────────────────────────────────────────────

/**
 * シートの末尾に 1 行追加する。
 * ⚠️ withLock() のコールバック内で呼び出すこと。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array} rowArray - 追加するデータの配列（列順に並べること）
 * @returns {number} 追加した行番号（1始まり）
 */
function appendRow(sheet, rowArray) {
  var newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1, 1, rowArray.length).setValues([rowArray]);
  return newRow;
}

/**
 * シートの A 列（ID列）で id に一致する行番号を返す。
 * 見つからない場合は -1 を返す。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number|string} id
 * @returns {number} 行番号（1始まり）、見つからない場合は -1
 */
function findRowById(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      return i + 2;
    }
  }
  return -1;
}

/**
 * シートの指定行をヘッダーをキーとするオブジェクトで返す。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowNumber - 行番号（1始まり）
 * @returns {Object}
 */
function getRowAsObject(sheet, rowNumber) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values  = sheet.getRange(rowNumber, 1, 1, lastCol).getValues()[0];
  var obj = {};
  headers.forEach(function(header, i) {
    obj[header] = values[i];
  });
  return obj;
}

/**
 * シートのデータ行をすべてオブジェクトの配列として返す。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Object[]}
 */
function getAllRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var lastCol  = sheet.getLastColumn();
  var headers  = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var data     = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return data.map(function(row) {
    var obj = {};
    headers.forEach(function(header, i) {
      obj[header] = row[i];
    });
    return obj;
  });
}

/**
 * シートの指定行・指定カラム名のセルを更新する。
 * ⚠️ withLock() のコールバック内で呼び出すこと。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowNumber   - 行番号（1始まり）
 * @param {string} columnName  - カラム名（ヘッダー行の値）
 * @param {*}      value
 */
function updateCell(sheet, rowNumber, columnName, value) {
  var headers  = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIndex = headers.indexOf(columnName);
  if (colIndex === -1) {
    throw new Error('カラムが見つかりません: ' + columnName);
  }
  sheet.getRange(rowNumber, colIndex + 1).setValue(value);
}
