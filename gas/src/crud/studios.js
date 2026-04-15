/**
 * crud/studios.js — studios シート CRUD
 *
 * 列定義:
 *   A: studio_id    TEXT (PK)
 *   B: short_name   TEXT  例: "齊藤DG"
 *   C: full_name    TEXT  例: "齊藤ダンスガーデン"
 *   D: color_style  TEXT  lime|orange|blue
 *   E: note         TEXT
 *
 * 変更頻度：ほぼなし。参照用途がメイン。
 */

var STUDIOS_SHEET = 'studios';

// ─── 参照 ─────────────────────────────────────────────────────────────────────

/**
 * studio_id で1件取得。見つからない場合は null を返す。
 * @param {string} studioId
 * @returns {Object|null}
 */
function getStudio(studioId) {
  var sheet = getSheet(STUDIOS_SHEET);
  var rowNumber = findRowById(sheet, studioId);
  if (rowNumber === -1) return null;
  return getRowAsObject(sheet, rowNumber);
}

/**
 * 全件取得。
 * @returns {Object[]}
 */
function getAllStudios() {
  return getAllRows(getSheet(STUDIOS_SHEET));
}

/**
 * studio_id の存在確認。
 * @param {string} studioId
 * @returns {boolean}
 */
function studioExists(studioId) {
  return getStudio(studioId) !== null;
}

// ─── 書き込み（拠点追加時のみ使用）──────────────────────────────────────────

/**
 * スタジオを追加する（拠点追加時のみ）。
 *
 * @param {Object} data
 * @param {string} data.studio_id    英数字の一意ID
 * @param {string} data.short_name
 * @param {string} data.full_name
 * @param {string} data.color_style  lime|orange|blue
 * @param {string} [data.note]
 */
function addStudio(data) {
  if (!data.studio_id || !data.short_name || !data.full_name || !data.color_style) {
    throw new Error('studio_id, short_name, full_name, color_style は必須です。');
  }
  return withLock(function() {
    var sheet = getSheet(STUDIOS_SHEET);
    if (findRowById(sheet, data.studio_id) !== -1) {
      throw new Error('既に存在する studio_id です: ' + data.studio_id);
    }
    appendRow(sheet, [
      data.studio_id,
      data.short_name,
      data.full_name,
      data.color_style,
      data.note || '',
    ]);
  });
}

/**
 * スタジオ情報を更新する。
 *
 * @param {string} studioId
 * @param {Object} data  更新可能: short_name, full_name, color_style, note
 * @returns {boolean}
 */
function updateStudio(studioId, data) {
  var updatable = ['short_name', 'full_name', 'color_style', 'note'];
  return withLock(function() {
    var sheet = getSheet(STUDIOS_SHEET);
    var rowNumber = findRowById(sheet, studioId);
    if (rowNumber === -1) return false;
    updatable.forEach(function(field) {
      if (data[field] !== undefined) {
        updateCell(sheet, rowNumber, field, data[field]);
      }
    });
    return true;
  });
}
