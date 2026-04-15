/**
 * crud/notifications.js — notifications シート CRUD
 *
 * 列定義:
 *   A: notification_id  INTEGER (PK, 自動採番)
 *   B: student_id       INTEGER (FK→students)
 *   C: line_user_id     TEXT
 *   D: type             TEXT  booking_approved|booking_rejected|booking_expired|lesson_cancelled|ticket_updated
 *   E: related_id       INTEGER（関連レコードのID）
 *   F: sent_at          TEXT (YYYY-MM-DD HH:MM)
 *   G: status           TEXT  sent|failed
 *
 * 用途:
 *   二重送信防止・失敗時の再送確認に使用する。
 *   将来のチケット管理ツールからの通知も同じシートで一元管理する。
 */

var NOTIFICATIONS_SHEET = 'notifications';

/** 有効な通知種別 */
var NOTIFICATION_TYPES = [
  'booking_approved',
  'booking_rejected',
  'booking_expired',
  'lesson_cancelled',
  'ticket_updated',
];

// ─── 参照 ─────────────────────────────────────────────────────────────────────

/**
 * 1件取得。
 * @param {number} notificationId
 * @returns {Object|null}
 */
function getNotification(notificationId) {
  var sheet = getSheet(NOTIFICATIONS_SHEET);
  var rowNumber = findRowById(sheet, notificationId);
  if (rowNumber === -1) return null;
  return getRowAsObject(sheet, rowNumber);
}

/**
 * 全件取得。
 * @returns {Object[]}
 */
function getAllNotifications() {
  return getAllRows(getSheet(NOTIFICATIONS_SHEET));
}

/**
 * 特定生徒への通知一覧を取得。
 * @param {number} studentId
 * @returns {Object[]}
 */
function getNotificationsByStudent(studentId) {
  return getAllNotifications().filter(function(row) {
    return String(row.student_id) === String(studentId);
  });
}

/**
 * 関連IDと種別で送信済み通知を検索する（二重送信防止チェック用）。
 * @param {string} type
 * @param {number} relatedId
 * @returns {Object|null}
 */
function findSentNotification(type, relatedId) {
  var found = getAllNotifications().filter(function(row) {
    return (
      row.type       === type &&
      String(row.related_id) === String(relatedId) &&
      row.status     === 'sent'
    );
  });
  return found.length > 0 ? found[0] : null;
}

// ─── 書き込み ─────────────────────────────────────────────────────────────────

/**
 * 通知履歴を記録する。
 * LINE Messaging API 送信後に呼ぶこと。
 *
 * @param {Object} data
 * @param {number} data.student_id
 * @param {string} data.line_user_id
 * @param {string} data.type         NOTIFICATION_TYPES のいずれか
 * @param {number} data.related_id
 * @param {string} [data.status]     'sent'|'failed'、デフォルト 'sent'
 * @returns {number} 追加した notification_id
 */
function addNotification(data) {
  if (NOTIFICATION_TYPES.indexOf(data.type) === -1) {
    throw new Error('不正な通知種別: ' + data.type);
  }
  var status = data.status || 'sent';
  if (status !== 'sent' && status !== 'failed') {
    throw new Error('不正な status 値: ' + status);
  }
  return withLock(function() {
    var sheet = getSheet(NOTIFICATIONS_SHEET);
    var notificationId = getNextId(sheet);
    appendRow(sheet, [
      notificationId,
      data.student_id,
      data.line_user_id,
      data.type,
      data.related_id,
      nowDateTime(),
      status,
    ]);
    return notificationId;
  });
}

/**
 * 通知ステータスを更新する（failed → sent の再送記録など）。
 * @param {number} notificationId
 * @param {string} status  'sent'|'failed'
 * @returns {boolean}
 */
function updateNotificationStatus(notificationId, status) {
  if (status !== 'sent' && status !== 'failed') {
    throw new Error('不正な status 値: ' + status);
  }
  return withLock(function() {
    var sheet = getSheet(NOTIFICATIONS_SHEET);
    var rowNumber = findRowById(sheet, notificationId);
    if (rowNumber === -1) return false;
    updateCell(sheet, rowNumber, 'status', status);
    if (status === 'sent') {
      updateCell(sheet, rowNumber, 'sent_at', nowDateTime());
    }
    return true;
  });
}
