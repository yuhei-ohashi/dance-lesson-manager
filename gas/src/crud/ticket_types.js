/**
 * crud/ticket_types.js — ticket_types シート CRUD
 *
 * 列定義:
 *   A: ticket_type_id  TEXT (PK)  例: "bundle5"
 *   B: label           TEXT       例: "5枚"
 *   C: color_hex       TEXT       例: "#6d28d9"
 *   D: bg_hex          TEXT       例: "#ede9fe"
 *   E: count           INTEGER    枚数（パスポート/NSP=-1=無制限）
 *   F: note            TEXT
 *
 * 変更頻度：ほぼなし。管理者が直接編集する。
 * チケット残枚数の管理はこのツールの対象外（Phase 5〜）。
 */

var TICKET_TYPES_SHEET = 'ticket_types';

// ─── 参照 ─────────────────────────────────────────────────────────────────────

/**
 * ticket_type_id で1件取得。見つからない場合は null を返す。
 * @param {string} ticketTypeId
 * @returns {Object|null}
 */
function getTicketType(ticketTypeId) {
  var sheet = getSheet(TICKET_TYPES_SHEET);
  var rowNumber = findRowById(sheet, ticketTypeId);
  if (rowNumber === -1) return null;
  return getRowAsObject(sheet, rowNumber);
}

/**
 * 全件取得。
 * @returns {Object[]}
 */
function getAllTicketTypes() {
  return getAllRows(getSheet(TICKET_TYPES_SHEET));
}

/**
 * ticket_type_id の存在確認。
 * @param {string} ticketTypeId
 * @returns {boolean}
 */
function ticketTypeExists(ticketTypeId) {
  return getTicketType(ticketTypeId) !== null;
}

// ─── 書き込み（新種別追加時のみ管理者が使用）────────────────────────────────

/**
 * チケット種別を追加する（新種別追加時のみ）。
 *
 * @param {Object} data
 * @param {string} data.ticket_type_id
 * @param {string} data.label
 * @param {string} data.color_hex
 * @param {string} data.bg_hex
 * @param {number} data.count   -1=無制限
 * @param {string} [data.note]
 */
function addTicketType(data) {
  if (!data.ticket_type_id || !data.label || !data.color_hex || !data.bg_hex) {
    throw new Error('ticket_type_id, label, color_hex, bg_hex は必須です。');
  }
  return withLock(function() {
    var sheet = getSheet(TICKET_TYPES_SHEET);
    if (findRowById(sheet, data.ticket_type_id) !== -1) {
      throw new Error('既に存在する ticket_type_id です: ' + data.ticket_type_id);
    }
    appendRow(sheet, [
      data.ticket_type_id,
      data.label,
      data.color_hex,
      data.bg_hex,
      data.count != null ? data.count : 1,
      data.note || '',
    ]);
  });
}

/**
 * チケット種別を更新する。
 *
 * @param {string} ticketTypeId
 * @param {Object} data  更新可能: label, color_hex, bg_hex, count, note
 * @returns {boolean}
 */
function updateTicketType(ticketTypeId, data) {
  var updatable = ['label', 'color_hex', 'bg_hex', 'count', 'note'];
  return withLock(function() {
    var sheet = getSheet(TICKET_TYPES_SHEET);
    var rowNumber = findRowById(sheet, ticketTypeId);
    if (rowNumber === -1) return false;
    updatable.forEach(function(field) {
      if (data[field] !== undefined) {
        updateCell(sheet, rowNumber, field, data[field]);
      }
    });
    return true;
  });
}
