/**
 * crud/zone_overrides.js — zone_overrides シート CRUD
 *
 * 列定義:
 *   A: override_id      TEXT (PK, "ov001" 形式)
 *   B: week_start_date  TEXT (YYYY-MM-DD, その週の月曜日)
 *   C: day_of_week      INTEGER  0=月〜6=日
 *   D: start_time       TEXT (HH:MM, is_cancelled=TRUE の場合は空欄可)
 *   E: end_time         TEXT (HH:MM, is_cancelled=TRUE の場合は空欄可)
 *   F: studio_id        TEXT (FK→studios, is_cancelled=TRUE の場合は空欄可)
 *   G: note             TEXT
 *   H: is_cancelled     BOOLEAN
 *   I: created_at       TEXT (YYYY-MM-DD HH:MM)
 *
 * 仕様:
 *   - ある週の特定曜日に override が存在する場合、zones テンプレートを完全置換する
 *   - is_cancelled=TRUE の場合はその曜日のゾーンをすべて無効化（空き枠なし）
 *   - is_cancelled=FALSE の場合は start_time/end_time/studio_id で新しいゾーンを定義
 */

var ZONE_OVERRIDES_SHEET = 'zone_overrides';

// ─── ID 採番（"ov001" 形式）──────────────────────────────────────────────────

/**
 * 次の override_id を生成する。
 * ⚠️ withLock() のコールバック内で呼び出すこと。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {string}  例: "ov001"
 */
function _getNextOverrideId(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 'ov001';
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
    .map(function(row) { return String(row[0]); })
    .filter(function(v) { return /^ov\d+$/.test(v); })
    .map(function(v) { return parseInt(v.slice(2), 10); });
  var maxNum = ids.length === 0 ? 0 : Math.max.apply(null, ids);
  var next = maxNum + 1;
  return 'ov' + String(next).padStart(3, '0');
}

// ─── 参照 ─────────────────────────────────────────────────────────────────────

/**
 * 1件取得。
 * @param {string} overrideId
 * @returns {Object|null}
 */
function getZoneOverride(overrideId) {
  var sheet = getSheet(ZONE_OVERRIDES_SHEET);
  var rowNumber = findRowById(sheet, overrideId);
  if (rowNumber === -1) return null;
  return getRowAsObject(sheet, rowNumber);
}

/**
 * 全件取得。
 * @returns {Object[]}
 */
function getAllZoneOverrides() {
  return getAllRows(getSheet(ZONE_OVERRIDES_SHEET));
}

/**
 * 指定週（週の月曜日）のオーバーライド一覧を取得。
 * @param {string} weekStartDate  YYYY-MM-DD（月曜日の日付）
 * @returns {Object[]}
 */
function getZoneOverridesByWeek(weekStartDate) {
  return getAllZoneOverrides().filter(function(row) {
    return row.week_start_date === weekStartDate;
  });
}

/**
 * 指定週・指定曜日のオーバーライドを取得。
 * @param {string} weekStartDate  YYYY-MM-DD
 * @param {number} dayOfWeek      0=月〜6=日
 * @returns {Object|null}
 */
function getZoneOverrideByWeekAndDay(weekStartDate, dayOfWeek) {
  var found = getAllZoneOverrides().filter(function(row) {
    return (
      row.week_start_date === weekStartDate &&
      String(row.day_of_week) === String(dayOfWeek)
    );
  });
  return found.length > 0 ? found[0] : null;
}

/**
 * 指定日付が属する週（月曜日基準）の week_start_date を計算する。
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {string}  YYYY-MM-DD（その週の月曜日）
 */
function getWeekStartDate(dateStr) {
  var d = new Date(dateStr + 'T00:00:00+09:00');
  // Utilities.formatDate で Asia/Tokyo の曜日を取得（u: 1=月〜7=日）
  var dowStr = Utilities.formatDate(d, 'Asia/Tokyo', 'u');
  var dow = parseInt(dowStr, 10); // 1=月, 2=火, ..., 7=日
  var diff = dow === 7 ? -6 : 1 - dow; // 月曜日が週の開始
  var monday = new Date(d.getTime() + diff * 24 * 60 * 60 * 1000);
  return formatDate(monday);
}

// ─── 書き込み ─────────────────────────────────────────────────────────────────

/**
 * ゾーンオーバーライドを追加する。
 *
 * @param {Object} data
 * @param {string} data.week_start_date  YYYY-MM-DD（月曜日）
 * @param {number} data.day_of_week
 * @param {string} [data.start_time]     HH:MM（is_cancelled=FALSE の場合に必須）
 * @param {string} [data.end_time]       HH:MM（is_cancelled=FALSE の場合に必須）
 * @param {string} [data.studio_id]      is_cancelled=FALSE の場合に必須
 * @param {string} [data.note]
 * @param {boolean} [data.is_cancelled]  デフォルト false
 * @returns {string} 追加した override_id
 */
function addZoneOverride(data) {
  var isCancelled = data.is_cancelled === true;
  if (!isCancelled) {
    if (!data.start_time || !data.end_time) {
      throw new Error('is_cancelled=FALSE の場合は start_time と end_time が必須です。');
    }
    if (!data.studio_id) {
      throw new Error('is_cancelled=FALSE の場合は studio_id が必須です。');
    }
    if (data.start_time >= data.end_time) {
      throw new Error('start_time は end_time より前である必要があります。');
    }
  }
  return withLock(function() {
    var sheet = getSheet(ZONE_OVERRIDES_SHEET);
    var overrideId = _getNextOverrideId(sheet);
    appendRow(sheet, [
      overrideId,
      data.week_start_date,
      data.day_of_week,
      data.start_time  || '',
      data.end_time    || '',
      data.studio_id   || '',
      data.note        || '',
      isCancelled,
      nowDateTime(),
    ]);
    return overrideId;
  });
}

/**
 * ゾーンオーバーライドを削除する（物理削除）。
 * zones テンプレートに戻したい場合に使用する。
 * @param {string} overrideId
 * @returns {boolean}
 */
function deleteZoneOverride(overrideId) {
  return withLock(function() {
    var sheet = getSheet(ZONE_OVERRIDES_SHEET);
    var rowNumber = findRowById(sheet, overrideId);
    if (rowNumber === -1) return false;
    sheet.deleteRow(rowNumber);
    return true;
  });
}

/**
 * ゾーンオーバーライドを更新する。
 *
 * @param {string} overrideId
 * @param {Object} data
 *   更新可能: week_start_date, day_of_week, start_time, end_time, studio_id, note, is_cancelled
 * @returns {boolean}
 */
function updateZoneOverride(overrideId, data) {
  return withLock(function() {
    var sheet = getSheet(ZONE_OVERRIDES_SHEET);
    var rowNumber = findRowById(sheet, overrideId);
    if (rowNumber === -1) return false;
    var updatable = [
      'week_start_date', 'day_of_week', 'start_time',
      'end_time', 'studio_id', 'note', 'is_cancelled',
    ];
    updatable.forEach(function(field) {
      if (data[field] !== undefined) {
        updateCell(sheet, rowNumber, field, data[field]);
      }
    });
    return true;
  });
}
