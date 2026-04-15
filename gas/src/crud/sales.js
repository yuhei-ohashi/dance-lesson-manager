/**
 * crud/sales.js — sales シート CRUD
 *
 * 列定義:
 *   A: sale_id        INTEGER (PK, 自動採番)
 *   B: sale_date      TEXT (YYYY-MM-DD)
 *   C: student_id     INTEGER (FK→students, NULL可)
 *   D: student_name   TEXT（student_id が NULL の場合の補完用）
 *   E: amount         INTEGER（円、税込）
 *   F: type           TEXT  lesson|ticket_purchase|other
 *   G: payment_status TEXT  paid|unpaid
 *   H: memo           TEXT
 *   I: lesson_id      INTEGER (FK→lessons, NULL可)
 *   J: created_at     TEXT (YYYY-MM-DD HH:MM)
 */

var SALES_SHEET = 'sales';

// ─── 参照 ─────────────────────────────────────────────────────────────────────

/**
 * 1件取得。
 * @param {number} saleId
 * @returns {Object|null}
 */
function getSale(saleId) {
  var sheet = getSheet(SALES_SHEET);
  var rowNumber = findRowById(sheet, saleId);
  if (rowNumber === -1) return null;
  return getRowAsObject(sheet, rowNumber);
}

/**
 * 全件取得。
 * @returns {Object[]}
 */
function getAllSales() {
  return getAllRows(getSheet(SALES_SHEET));
}

/**
 * 特定生徒の売上一覧を取得。
 * @param {number} studentId
 * @returns {Object[]}
 */
function getSalesByStudent(studentId) {
  return getAllSales().filter(function(row) {
    return String(row.student_id) === String(studentId);
  });
}

/**
 * 期間内の売上一覧を取得（両端含む）。
 * @param {string} fromDate  YYYY-MM-DD
 * @param {string} toDate    YYYY-MM-DD
 * @returns {Object[]}
 */
function getSalesByDateRange(fromDate, toDate) {
  return getAllSales().filter(function(row) {
    return row.sale_date >= fromDate && row.sale_date <= toDate;
  });
}

/**
 * 未払い売上一覧を取得。
 * @returns {Object[]}
 */
function getUnpaidSales() {
  return getAllSales().filter(function(row) {
    return row.payment_status === 'unpaid';
  });
}

// ─── 書き込み ─────────────────────────────────────────────────────────────────

/**
 * 売上を追加する。
 *
 * @param {Object} data
 * @param {string} data.sale_date      YYYY-MM-DD
 * @param {number|string} [data.student_id]
 * @param {string} [data.student_name]
 * @param {number} data.amount
 * @param {string} data.type           lesson|ticket_purchase|other
 * @param {string} [data.payment_status]  デフォルト 'paid'
 * @param {string} [data.memo]
 * @param {number|string} [data.lesson_id]
 * @returns {number} 追加した sale_id
 */
function addSale(data) {
  var allowedTypes = ['lesson', 'ticket_purchase', 'other'];
  if (allowedTypes.indexOf(data.type) === -1) {
    throw new Error('不正な type 値: ' + data.type);
  }
  var allowedPayment = ['paid', 'unpaid'];
  var paymentStatus = data.payment_status || 'paid';
  if (allowedPayment.indexOf(paymentStatus) === -1) {
    throw new Error('不正な payment_status 値: ' + paymentStatus);
  }
  return withLock(function() {
    var sheet = getSheet(SALES_SHEET);
    var saleId = getNextId(sheet);
    appendRow(sheet, [
      saleId,
      data.sale_date,
      data.student_id   != null ? data.student_id : '',
      data.student_name || '',
      data.amount,
      data.type,
      paymentStatus,
      data.memo         || '',
      data.lesson_id    != null ? data.lesson_id : '',
      nowDateTime(),
    ]);
    return saleId;
  });
}

/**
 * 支払いステータスを更新する（unpaid → paid）。
 * @param {number} saleId
 * @param {string} paymentStatus  'paid'|'unpaid'
 * @returns {boolean}
 */
function updateSalePaymentStatus(saleId, paymentStatus) {
  var allowed = ['paid', 'unpaid'];
  if (allowed.indexOf(paymentStatus) === -1) {
    throw new Error('不正な payment_status 値: ' + paymentStatus);
  }
  return withLock(function() {
    var sheet = getSheet(SALES_SHEET);
    var rowNumber = findRowById(sheet, saleId);
    if (rowNumber === -1) return false;
    updateCell(sheet, rowNumber, 'payment_status', paymentStatus);
    return true;
  });
}

/**
 * 売上情報を更新する（任意フィールド）。
 *
 * @param {number} saleId
 * @param {Object} data  更新可能: sale_date, student_id, student_name, amount, type, payment_status, memo, lesson_id
 * @returns {boolean}
 */
function updateSale(saleId, data) {
  var updatable = [
    'sale_date', 'student_id', 'student_name',
    'amount', 'type', 'payment_status', 'memo', 'lesson_id',
  ];
  return withLock(function() {
    var sheet = getSheet(SALES_SHEET);
    var rowNumber = findRowById(sheet, saleId);
    if (rowNumber === -1) return false;
    updatable.forEach(function(field) {
      if (data[field] !== undefined) {
        updateCell(sheet, rowNumber, field, data[field]);
      }
    });
    return true;
  });
}
