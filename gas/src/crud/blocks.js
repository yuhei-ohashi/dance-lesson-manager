/**
 * crud/blocks.js — blocks シート CRUD
 *
 * 列定義:
 *   A: block_id       INTEGER (PK, 自動採番)
 *   B: label          TEXT  例: "移動"
 *   C: sub_label      TEXT  例: "仙台SS → 齊藤DG"
 *   D: day_of_week    INTEGER  0=月〜6=日（繰り返しの基準曜日）
 *   E: start_time     TEXT (HH:MM)
 *   F: end_time       TEXT (HH:MM)
 *   G: is_recurring   BOOLEAN  TRUE=毎週繰り返し
 *   H: specific_date  TEXT (YYYY-MM-DD, is_recurring=FALSE の場合に必須)
 *   I: is_active      BOOLEAN
 *   J: created_at     TEXT (YYYY-MM-DD HH:MM)
 *
 * 補足:
 *   - is_recurring=TRUE: day_of_week で毎週適用。specific_date は空欄
 *   - is_recurring=FALSE: specific_date の1日のみ適用。day_of_week は参考値
 */

var BLOCKS_SHEET = 'blocks';

// ─── 参照 ─────────────────────────────────────────────────────────────────────

/**
 * 1件取得。
 * @param {number} blockId
 * @returns {Object|null}
 */
function getBlock(blockId) {
  var sheet = getSheet(BLOCKS_SHEET);
  var rowNumber = findRowById(sheet, blockId);
  if (rowNumber === -1) return null;
  return getRowAsObject(sheet, rowNumber);
}

/**
 * 全件取得（is_active を問わず）。
 * @returns {Object[]}
 */
function getAllBlocks() {
  return getAllRows(getSheet(BLOCKS_SHEET));
}

/**
 * アクティブなブロック一覧を取得。
 * @returns {Object[]}
 */
function getActiveBlocks() {
  return getAllBlocks().filter(function(row) {
    return row.is_active === true || row.is_active === 'TRUE';
  });
}

/**
 * 指定日付に適用されるブロック一覧を取得。
 * 繰り返しブロック（is_recurring=TRUE）と単発ブロック（is_recurring=FALSE かつ specific_date 一致）を返す。
 *
 * @param {string} dateStr  YYYY-MM-DD
 * @param {number} dayOfWeek  0=月〜6=日（dateStr に対応する曜日）
 * @returns {Object[]}
 */
function getBlocksByDate(dateStr, dayOfWeek) {
  return getActiveBlocks().filter(function(row) {
    if (row.is_recurring === true || row.is_recurring === 'TRUE') {
      return String(row.day_of_week) === String(dayOfWeek);
    } else {
      return row.specific_date === dateStr;
    }
  });
}

// ─── 書き込み ─────────────────────────────────────────────────────────────────

/**
 * ブロックを追加する。
 *
 * @param {Object} data
 * @param {string} data.label
 * @param {string} [data.sub_label]
 * @param {number} data.day_of_week
 * @param {string} data.start_time   HH:MM
 * @param {string} data.end_time     HH:MM
 * @param {boolean} [data.is_recurring]  デフォルト false
 * @param {string} [data.specific_date]  YYYY-MM-DD（is_recurring=FALSE の場合に必須）
 * @param {boolean} [data.is_active]     デフォルト true
 * @returns {number} 追加した block_id
 */
function addBlock(data) {
  var isRecurring = data.is_recurring === true;
  if (!isRecurring && !data.specific_date) {
    throw new Error('is_recurring=FALSE の場合は specific_date が必須です。');
  }
  if (data.start_time >= data.end_time) {
    throw new Error('start_time は end_time より前である必要があります。');
  }
  return withLock(function() {
    var sheet = getSheet(BLOCKS_SHEET);
    var blockId = getNextId(sheet);
    appendRow(sheet, [
      blockId,
      data.label,
      data.sub_label     || '',
      data.day_of_week,
      data.start_time,
      data.end_time,
      isRecurring,
      data.specific_date || '',
      data.is_active !== undefined ? data.is_active : true,
      nowDateTime(),
    ]);
    return blockId;
  });
}

/**
 * ブロック情報を更新する。
 *
 * @param {number} blockId
 * @param {Object} data
 *   更新可能: label, sub_label, day_of_week, start_time, end_time,
 *             is_recurring, specific_date, is_active
 * @returns {boolean}
 */
function updateBlock(blockId, data) {
  var updatable = [
    'label', 'sub_label', 'day_of_week', 'start_time', 'end_time',
    'is_recurring', 'specific_date', 'is_active',
  ];
  return withLock(function() {
    var sheet = getSheet(BLOCKS_SHEET);
    var rowNumber = findRowById(sheet, blockId);
    if (rowNumber === -1) return false;
    updatable.forEach(function(field) {
      if (data[field] !== undefined) {
        updateCell(sheet, rowNumber, field, data[field]);
      }
    });
    return true;
  });
}

/**
 * ブロックを無効化する（is_active = FALSE）。
 * @param {number} blockId
 * @returns {boolean}
 */
function deactivateBlock(blockId) {
  return withLock(function() {
    var sheet = getSheet(BLOCKS_SHEET);
    var rowNumber = findRowById(sheet, blockId);
    if (rowNumber === -1) return false;
    updateCell(sheet, rowNumber, 'is_active', false);
    return true;
  });
}
