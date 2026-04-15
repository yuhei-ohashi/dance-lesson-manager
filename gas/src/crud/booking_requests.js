/**
 * crud/booking_requests.js — booking_requests シート CRUD
 *
 * 列定義:
 *   A: request_id          INTEGER (PK, 自動採番)
 *   B: requested_at        TEXT (YYYY-MM-DD HH:MM)
 *   C: expires_at          TEXT (YYYY-MM-DD HH:MM)  送信+48h
 *   D: student_id          INTEGER (FK→students, NULL可)
 *   E: student_name_input  TEXT
 *   F: requested_date      TEXT (YYYY-MM-DD)
 *   G: requested_start     TEXT (HH:MM)
 *   H: requested_end       TEXT (HH:MM)
 *   I: studio_id           TEXT (FK→studios)
 *   J: status              TEXT  pending|processing|approved|rejected|expired|error
 *   K: approved_lesson_id  INTEGER (NULL可)
 *   L: approved_at         TEXT (YYYY-MM-DD HH:MM, NULL可)
 *   M: note                TEXT
 *   N: line_user_id        TEXT
 *
 * 状態遷移:
 *   pending → processing → approved
 *                       └→ rejected
 *                       └→ error
 *   pending → expired（タイマーによる自動遷移）
 */

var BOOKING_REQUESTS_SHEET = 'booking_requests';

/** expires_at 計算用: 48時間（ミリ秒） */
var BOOKING_EXPIRES_MS = 48 * 60 * 60 * 1000;

// ─── 参照 ─────────────────────────────────────────────────────────────────────

/**
 * 1件取得。見つからない場合は null を返す。
 * @param {number} requestId
 * @returns {Object|null}
 */
function getBookingRequest(requestId) {
  var sheet = getSheet(BOOKING_REQUESTS_SHEET);
  var rowNumber = findRowById(sheet, requestId);
  if (rowNumber === -1) return null;
  return getRowAsObject(sheet, rowNumber);
}

/**
 * 全件取得。
 * @returns {Object[]}
 */
function getAllBookingRequests() {
  return getAllRows(getSheet(BOOKING_REQUESTS_SHEET));
}

/**
 * 特定ステータスのリクエスト一覧を取得。
 * @param {string} status
 * @returns {Object[]}
 */
function getBookingRequestsByStatus(status) {
  return getAllBookingRequests().filter(function(row) {
    return row.status === status;
  });
}

/**
 * 承認待ち（pending）のリクエスト一覧を取得。
 * @returns {Object[]}
 */
function getPendingBookingRequests() {
  return getBookingRequestsByStatus('pending');
}

/**
 * 特定生徒のリクエスト一覧を取得。
 * @param {number} studentId
 * @returns {Object[]}
 */
function getBookingRequestsByStudent(studentId) {
  return getAllBookingRequests().filter(function(row) {
    return String(row.student_id) === String(studentId);
  });
}

// ─── 書き込み ─────────────────────────────────────────────────────────────────

/**
 * 予約リクエストを追加する（生徒LIFF → GAS doPost から呼ぶ）。
 * expires_at は自動で送信時刻+48時間にセットする。
 *
 * @param {Object} data
 * @param {number|string} [data.student_id]    LINE ID 未紐付けの場合は空文字
 * @param {string} data.student_name_input
 * @param {string} data.requested_date          YYYY-MM-DD
 * @param {string} data.requested_start         HH:MM
 * @param {string} data.requested_end           HH:MM
 * @param {string} data.studio_id
 * @param {string} [data.note]
 * @param {string} [data.line_user_id]
 * @returns {number} 追加した request_id
 */
function addBookingRequest(data) {
  return withLock(function() {
    var sheet = getSheet(BOOKING_REQUESTS_SHEET);
    var requestId = getNextId(sheet);
    var now = new Date();
    var requestedAt = formatDateTime(now);
    var expiresAt = formatDateTime(new Date(now.getTime() + BOOKING_EXPIRES_MS));
    appendRow(sheet, [
      requestId,
      requestedAt,
      expiresAt,
      data.student_id          != null ? data.student_id : '',
      data.student_name_input  || '',
      data.requested_date,
      data.requested_start,
      data.requested_end,
      data.studio_id,
      'pending',
      '',
      '',
      data.note          || '',
      data.line_user_id  || '',
    ]);
    return requestId;
  });
}

/**
 * ステータスを更新する。
 * @param {number} requestId
 * @param {string} status
 * @returns {boolean}
 */
function updateBookingRequestStatus(requestId, status) {
  var allowed = ['pending', 'processing', 'approved', 'rejected', 'expired', 'error'];
  if (allowed.indexOf(status) === -1) {
    throw new Error('不正なステータス値: ' + status);
  }
  return withLock(function() {
    var sheet = getSheet(BOOKING_REQUESTS_SHEET);
    var rowNumber = findRowById(sheet, requestId);
    if (rowNumber === -1) return false;
    updateCell(sheet, rowNumber, 'status', status);
    return true;
  });
}

/**
 * 承認処理（予約フローのコア）。
 * 以下をアトミックに実行する:
 *   1. status を 'processing' に更新
 *   2. 同日時・同スタジオの confirmed レッスン重複チェック
 *   3. lessons に新規レコード追加
 *   4. approved_lesson_id / approved_at / status='approved' を更新
 *   5. students.last_lesson_date を再計算
 *
 * @param {number} requestId
 * @param {Object} [lessonOptions]  addLesson に渡す追加オプション（level, lesson_count, note）
 * @returns {{ success: boolean, lessonId?: number, reason?: string }}
 */
function approveBookingRequest(requestId, lessonOptions) {
  return withLock(function() {
    var sheet = getSheet(BOOKING_REQUESTS_SHEET);
    var rowNumber = findRowById(sheet, requestId);
    if (rowNumber === -1) {
      return { success: false, reason: 'リクエストが見つかりません: ' + requestId };
    }

    var req = getRowAsObject(sheet, rowNumber);

    if (req.status !== 'pending') {
      return {
        success: false,
        reason: 'pending 以外のリクエストは承認できません（現在のステータス: ' + req.status + '）',
      };
    }

    if (!req.student_id) {
      return { success: false, reason: 'student_id が未設定です。先に生徒マスタに登録してください。' };
    }

    // processing にセット（二重操作防止）
    updateCell(sheet, rowNumber, 'status', 'processing');

    // 重複チェック
    if (hasDuplicateConfirmedLesson(req.requested_date, req.requested_start, req.studio_id)) {
      updateCell(sheet, rowNumber, 'status', 'rejected');
      return { success: false, reason: '同日時・同スタジオに confirmed なレッスンが既に存在します。' };
    }

    // lessons に追加（withLock の入れ子を避けるため内部から直接シート操作）
    var lessonsSheet = getSheet(LESSONS_SHEET);
    var lessonId = getNextId(lessonsSheet);
    var now = nowDateTime();
    var opts = lessonOptions || {};
    appendRow(lessonsSheet, [
      lessonId,
      req.requested_date,
      req.requested_start,
      req.requested_end,
      req.student_id,
      req.studio_id,
      opts.level         || '',
      opts.lesson_count  != null ? opts.lesson_count : 1,
      requestId,
      'confirmed',
      opts.note          || '',
      now,
      now,
    ]);

    // booking_requests を更新
    updateCell(sheet, rowNumber, 'approved_lesson_id', lessonId);
    updateCell(sheet, rowNumber, 'approved_at', now);
    updateCell(sheet, rowNumber, 'status', 'approved');

    // students.last_lesson_date を再計算
    refreshStudentLastLessonDate(req.student_id);

    return { success: true, lessonId: lessonId };
  });
}

/**
 * リクエストを却下する。
 * @param {number} requestId
 * @param {string} [note]  却下理由
 * @returns {boolean}
 */
function rejectBookingRequest(requestId, note) {
  return withLock(function() {
    var sheet = getSheet(BOOKING_REQUESTS_SHEET);
    var rowNumber = findRowById(sheet, requestId);
    if (rowNumber === -1) return false;
    updateCell(sheet, rowNumber, 'status', 'rejected');
    if (note) {
      updateCell(sheet, rowNumber, 'note', note);
    }
    return true;
  });
}

/**
 * error ステータスのリクエストを pending に戻す（再承認操作）。
 * @param {number} requestId
 * @returns {boolean}
 */
function resetBookingRequestError(requestId) {
  return withLock(function() {
    var sheet = getSheet(BOOKING_REQUESTS_SHEET);
    var rowNumber = findRowById(sheet, requestId);
    if (rowNumber === -1) return false;
    var req = getRowAsObject(sheet, rowNumber);
    if (req.status !== 'error') return false;
    updateCell(sheet, rowNumber, 'status', 'pending');
    return true;
  });
}

/**
 * 有効期限切れリクエストを一括で expired に更新する。
 * GAS タイムトリガーから呼び出す想定。
 * @returns {number} 更新件数
 */
function expireBookingRequests() {
  return withLock(function() {
    var sheet = getSheet(BOOKING_REQUESTS_SHEET);
    var now = nowDateTime();
    var rows = getAllRows(sheet);
    var count = 0;
    rows.forEach(function(row) {
      if (row.status === 'pending' && row.expires_at && row.expires_at <= now) {
        var rowNumber = findRowById(sheet, row.request_id);
        if (rowNumber !== -1) {
          updateCell(sheet, rowNumber, 'status', 'expired');
          count++;
        }
      }
    });
    return count;
  });
}

/**
 * リクエストの student_id を更新する（未登録生徒フロー用）。
 * @param {number} requestId
 * @param {number} studentId
 * @returns {boolean}
 */
function setBookingRequestStudentId(requestId, studentId) {
  return withLock(function() {
    var sheet = getSheet(BOOKING_REQUESTS_SHEET);
    var rowNumber = findRowById(sheet, requestId);
    if (rowNumber === -1) return false;
    updateCell(sheet, rowNumber, 'student_id', studentId);
    return true;
  });
}
