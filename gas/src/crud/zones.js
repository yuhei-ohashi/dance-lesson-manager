/**
 * crud/zones.js — zones シート CRUD
 *
 * 列定義:
 *   A: zone_id      TEXT (PK, "z001" 形式)
 *   B: day_of_week  INTEGER  0=月〜6=日
 *   C: start_time   TEXT (HH:MM)
 *   D: end_time     TEXT (HH:MM)
 *   E: studio_id    TEXT (FK→studios)
 *   F: is_active    BOOLEAN
 *   G: updated_at   TEXT (YYYY-MM-DD HH:MM)
 *
 * 制約:
 *   - 同一 day_of_week で時間帯が重複しないこと
 *   - start_time < end_time（HH:MM 文字列比較）
 */

var ZONES_SHEET = 'zones';

// ─── ID 採番（"z001" 形式）────────────────────────────────────────────────────

/**
 * 次の zone_id を生成する。
 * ⚠️ withLock() のコールバック内で呼び出すこと。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {string}  例: "z001"
 */
function _getNextZoneId(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 'z001';
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
    .map(function(row) { return String(row[0]); })
    .filter(function(v) { return /^z\d+$/.test(v); })
    .map(function(v) { return parseInt(v.slice(1), 10); });
  var maxNum = ids.length === 0 ? 0 : Math.max.apply(null, ids);
  var next = maxNum + 1;
  return 'z' + String(next).padStart(3, '0');
}

// ─── バリデーション ──────────────────────────────────────────────────────────

/**
 * 同一 day_of_week で時間帯が重複するゾーンが存在するかチェック。
 * @param {number} dayOfWeek
 * @param {string} startTime  HH:MM
 * @param {string} endTime    HH:MM
 * @param {string} [excludeZoneId]
 * @returns {boolean}
 */
function _hasZoneTimeOverlap(dayOfWeek, startTime, endTime, excludeZoneId) {
  return getAllZones().some(function(row) {
    if (excludeZoneId && String(row.zone_id) === String(excludeZoneId)) return false;
    if (String(row.day_of_week) !== String(dayOfWeek)) return false;
    if (row.is_active !== true && row.is_active !== 'TRUE') return false;
    // 重複判定: 既存の [s, e) と新規の [startTime, endTime) が重なる
    return startTime < row.end_time && endTime > row.start_time;
  });
}

// ─── 参照 ─────────────────────────────────────────────────────────────────────

/**
 * 1件取得。
 * @param {string} zoneId
 * @returns {Object|null}
 */
function getZone(zoneId) {
  var sheet = getSheet(ZONES_SHEET);
  var rowNumber = findRowById(sheet, zoneId);
  if (rowNumber === -1) return null;
  return getRowAsObject(sheet, rowNumber);
}

/**
 * 全件取得。
 * @returns {Object[]}
 */
function getAllZones() {
  return getAllRows(getSheet(ZONES_SHEET));
}

/**
 * アクティブなゾーンのみ取得。
 * @returns {Object[]}
 */
function getActiveZones() {
  return getAllZones().filter(function(row) {
    return row.is_active === true || row.is_active === 'TRUE';
  });
}

/**
 * 指定曜日のアクティブなゾーン一覧を取得。
 * @param {number} dayOfWeek  0=月〜6=日
 * @returns {Object[]}
 */
function getActiveZonesByDay(dayOfWeek) {
  return getActiveZones().filter(function(row) {
    return String(row.day_of_week) === String(dayOfWeek);
  });
}

// ─── 書き込み ─────────────────────────────────────────────────────────────────

/**
 * ゾーンを追加する。
 *
 * @param {Object} data
 * @param {number} data.day_of_week
 * @param {string} data.start_time
 * @param {string} data.end_time
 * @param {string} data.studio_id
 * @param {boolean} [data.is_active]  デフォルト true
 * @returns {string} 追加した zone_id
 */
function addZone(data) {
  if (data.day_of_week == null || data.day_of_week === '') {
    throw new Error('day_of_week は必須です。');
  }
  if (!data.studio_id) {
    throw new Error('studio_id は必須です。');
  }
  if (!data.start_time || !data.end_time) {
    throw new Error('start_time と end_time は必須です。');
  }
  if (data.start_time >= data.end_time) {
    throw new Error('start_time は end_time より前である必要があります。');
  }
  return withLock(function() {
    var sheet = getSheet(ZONES_SHEET);
    if (_hasZoneTimeOverlap(data.day_of_week, data.start_time, data.end_time)) {
      throw new Error('同一曜日に時間帯が重複するゾーンが存在します。');
    }
    var zoneId = _getNextZoneId(sheet);
    appendRow(sheet, [
      zoneId,
      data.day_of_week,
      data.start_time,
      data.end_time,
      data.studio_id,
      data.is_active !== undefined ? data.is_active : true,
      nowDateTime(),
    ]);
    return zoneId;
  });
}

/**
 * ゾーン情報を更新する。
 *
 * @param {string} zoneId
 * @param {Object} data
 *   更新可能: day_of_week, start_time, end_time, studio_id, is_active
 * @returns {boolean}
 */
function updateZone(zoneId, data) {
  return withLock(function() {
    var sheet = getSheet(ZONES_SHEET);
    var rowNumber = findRowById(sheet, zoneId);
    if (rowNumber === -1) return false;

    // 時間帯変更時の重複チェック
    if (data.start_time !== undefined || data.end_time !== undefined || data.day_of_week !== undefined) {
      var current = getRowAsObject(sheet, rowNumber);
      var newDay   = data.day_of_week  !== undefined ? data.day_of_week  : current.day_of_week;
      var newStart = data.start_time   !== undefined ? data.start_time   : current.start_time;
      var newEnd   = data.end_time     !== undefined ? data.end_time     : current.end_time;
      if (newStart >= newEnd) {
        throw new Error('start_time は end_time より前である必要があります。');
      }
      if (_hasZoneTimeOverlap(newDay, newStart, newEnd, zoneId)) {
        throw new Error('同一曜日に時間帯が重複するゾーンが存在します。');
      }
    }

    var updatable = ['day_of_week', 'start_time', 'end_time', 'studio_id', 'is_active'];
    updatable.forEach(function(field) {
      if (data[field] !== undefined) {
        updateCell(sheet, rowNumber, field, data[field]);
      }
    });
    updateCell(sheet, rowNumber, 'updated_at', nowDateTime());
    return true;
  });
}

/**
 * ゾーンを無効化する（is_active = FALSE）。
 * @param {string} zoneId
 * @returns {boolean}
 */
function deactivateZone(zoneId) {
  return withLock(function() {
    var sheet = getSheet(ZONES_SHEET);
    var rowNumber = findRowById(sheet, zoneId);
    if (rowNumber === -1) return false;
    updateCell(sheet, rowNumber, 'is_active', false);
    updateCell(sheet, rowNumber, 'updated_at', nowDateTime());
    return true;
  });
}
