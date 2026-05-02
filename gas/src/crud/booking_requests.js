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
 *                       └→ error（GASエラー時。resetBookingRequestError で pending に戻す）
 *   pending → expired（タイマーによる自動遷移）
 */

var BOOKING_REQUESTS_SHEET = 'booking_requests';

/** expires_at 計算用: 48時間（ミリ秒） */
var BOOKING_EXPIRES_MS = 48 * 60 * 60 * 1000;

/** 承認・却下を受け付ける遷移元ステータス */
var BOOKING_ACTIONABLE_STATUSES = ['pending', 'processing'];

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
 * ステータスを更新する（内部用低レベルAPI）。
 * ⚠️ 外部から直接呼ぶことは推奨しない。状態遷移の意図が明確な
 *    approveBookingRequest / rejectBookingRequest / resetBookingRequestError /
 *    expireBookingRequests を優先して使うこと。
 *
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
 *   1. status を 'processing' に更新（二重操作防止）
 *   2. 同日時・同スタジオの confirmed レッスン重複チェック
 *   3. lessons に新規レコード追加
 *   4. approved_lesson_id / approved_at / status='approved' を更新
 *   5. students.last_lesson_date を再計算
 *   6. 生徒へ承認通知を送信（line_user_id が設定されている場合）→ notifications に記録
 *   エラー時: status を 'error' に更新（resetBookingRequestError で pending に戻せる）
 *
 * @param {number} requestId
 * @param {Object} [lessonOptions]  lessons レコードに設定する追加オプション（level, lesson_count, note）
 * @returns {{ success: boolean, lessonId?: number, reason?: string }}
 */
function approveBookingRequest(requestId, lessonOptions) {
  // ─ フェーズ1: シート操作のみ（ロック内）────────────────────────────────────
  var notifyInfo = null;

  var result = withLock(function() {
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

    if (req.student_id === '' || req.student_id == null) {
      return { success: false, reason: 'student_id が未設定です。先に生徒マスタに登録してください。' };
    }

    // processing にセット（二重操作防止）
    updateCell(sheet, rowNumber, 'status', 'processing');

    try {
      // 重複チェック
      if (hasDuplicateConfirmedLesson(req.requested_date, req.requested_start, req.studio_id)) {
        updateCell(sheet, rowNumber, 'status', 'rejected');
        return { success: false, reason: '同日時・同スタジオに confirmed なレッスンが既に存在します。' };
      }

      // lessons に追加（withLock の入れ子を避けるため直接シート操作）
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

      // students.last_lesson_date を再計算（withLock 内から呼ぶこと）
      refreshStudentLastLessonDate(req.student_id);

      // ロック解放後の通知に必要な情報を保存しておく
      if (req.line_user_id) {
        notifyInfo = {
          line_user_id:    req.line_user_id,
          student_id:      req.student_id,
          requested_date:  req.requested_date,
          requested_start: req.requested_start,
          requested_end:   req.requested_end,
          studio_id:       req.studio_id,
        };
      }

      return { success: true, lessonId: lessonId };
    } catch (e) {
      // GAS 例外発生時: status を 'error' に更新して管理者が再操作できる状態にする
      updateCell(sheet, rowNumber, 'status', 'error');
      throw e;
    }
  });

  // ─ フェーズ2: LINE 通知（ロック解放後）─────────────────────────────────────
  // シート操作と切り離すことで、通信遅延がロックに影響しないようにする。
  // 通知の失敗はログに記録するが、承認結果（result）には影響させない。
  if (result.success && notifyInfo) {
    try {
      var notifyResult = sendBookingApprovedMessage(notifyInfo.line_user_id, {
        requested_date:  notifyInfo.requested_date,
        requested_start: notifyInfo.requested_start,
        requested_end:   notifyInfo.requested_end,
        studio_id:       notifyInfo.studio_id,
      });
      if (!notifyResult.success) {
        Logger.log('承認通知の送信に失敗: ' + (notifyResult.error || '不明なエラー'));
      }
      addNotification({
        student_id:   notifyInfo.student_id,
        line_user_id: notifyInfo.line_user_id,
        type:         'booking_approved',
        related_id:   requestId,
        status:       notifyResult.success ? 'sent' : 'failed',
      });
      result.notifyStatus = notifyResult.success ? 'sent' : 'failed';
    } catch (notifyErr) {
      Logger.log('承認通知処理で例外: ' + notifyErr.message);
      result.notifyStatus = 'error';
    }
  } else if (result.success) {
    result.notifyStatus = 'skipped';
  }

  return result;
}

/**
 * リクエストを却下する。
 * pending または processing のリクエストのみ却下できる。
 *
 * @param {number} requestId
 * @param {string} [note]  却下理由
 * @returns {{ success: boolean, reason?: string }}
 */
function rejectBookingRequest(requestId, note) {
  // ─ フェーズ1: シート操作のみ（ロック内）────────────────────────────────────
  var notifyInfo = null;

  var result = withLock(function() {
    var sheet = getSheet(BOOKING_REQUESTS_SHEET);
    var rowNumber = findRowById(sheet, requestId);
    if (rowNumber === -1) return { success: false, reason: 'リクエストが見つかりません: ' + requestId };

    var req = getRowAsObject(sheet, rowNumber);
    if (BOOKING_ACTIONABLE_STATUSES.indexOf(req.status) === -1) {
      return {
        success: false,
        reason: '却下できない状態です（現在のステータス: ' + req.status + '）',
      };
    }

    updateCell(sheet, rowNumber, 'status', 'rejected');
    if (note) {
      updateCell(sheet, rowNumber, 'note', note);
    }

    // ロック解放後の通知に必要な情報を保存しておく
    if (req.line_user_id) {
      notifyInfo = {
        line_user_id: req.line_user_id,
        student_id:   req.student_id,
      };
    }

    return { success: true };
  });

  // ─ フェーズ2: LINE 通知（ロック解放後）─────────────────────────────────────
  // 通知の失敗はログに記録するが、却下結果（result）には影響させない。
  if (result.success && notifyInfo) {
    try {
      var notifyResult = sendBookingRejectedMessage(notifyInfo.line_user_id, note || '');
      if (!notifyResult.success) {
        Logger.log('却下通知の送信に失敗: ' + (notifyResult.error || '不明なエラー'));
      }
      addNotification({
        student_id:   notifyInfo.student_id,
        line_user_id: notifyInfo.line_user_id,
        type:         'booking_rejected',
        related_id:   requestId,
        status:       notifyResult.success ? 'sent' : 'failed',
      });
      result.notifyStatus = notifyResult.success ? 'sent' : 'failed';
    } catch (notifyErr) {
      Logger.log('却下通知処理で例外: ' + notifyErr.message);
      result.notifyStatus = 'error';
    }
  } else if (result.success) {
    result.notifyStatus = 'skipped';
  }

  return result;
}

/**
 * error または processing ステータスのリクエストを pending に戻す（再承認操作）。
 * - error: GAS 例外後のリカバリ
 * - processing: GAS がタイムアウト等で途中終了した場合のリカバリ
 *
 * @param {number} requestId
 * @returns {boolean}
 */
function resetBookingRequestError(requestId) {
  return withLock(function() {
    var sheet = getSheet(BOOKING_REQUESTS_SHEET);
    var rowNumber = findRowById(sheet, requestId);
    if (rowNumber === -1) return false;
    var req = getRowAsObject(sheet, rowNumber);
    if (req.status !== 'error' && req.status !== 'processing') return false;
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
    rows.forEach(function(row, i) {
      if (row.status === 'pending' && row.expires_at && row.expires_at <= now) {
        // getAllRows はヘッダー行を除くインデックスのため +2 で行番号に変換
        var rowNumber = i + 2;
        updateCell(sheet, rowNumber, 'status', 'expired');
        count++;
      }
    });
    return count;
  });
}

/**
 * リクエストの student_id を更新する（未登録生徒フロー用）。
 * pending 状態のリクエストのみ更新できる。
 *
 * @param {number} requestId
 * @param {number} studentId
 * @returns {boolean}
 */
function setBookingRequestStudentId(requestId, studentId) {
  return withLock(function() {
    var sheet = getSheet(BOOKING_REQUESTS_SHEET);
    var rowNumber = findRowById(sheet, requestId);
    if (rowNumber === -1) return false;
    var req = getRowAsObject(sheet, rowNumber);
    if (req.status !== 'pending') return false;
    updateCell(sheet, rowNumber, 'student_id', studentId);
    return true;
  });
}
