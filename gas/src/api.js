/**
 * api.js — GAS Web App エンドポイント（doGet / doPost）
 *
 * レスポンス形式:
 *   成功: { success: true,  data: <payload> }
 *   失敗: { success: false, error: { code: string, message: string } }
 *
 * エラーコード:
 *   INVALID_PARAM    — 必須パラメータ欠落・形式不正
 *   NOT_FOUND        — 指定 ID のリソースが存在しない
 *   SLOT_UNAVAILABLE — 予約枠が空いていない
 *   INTERNAL_ERROR   — 予期しない例外
 *
 * 認証:
 *   Phase 3: student_id をリクエストパラメータから直接受け取る
 *   Phase 4: LINE idToken 検証に切り替え予定
 */

// ─── レスポンスヘルパー ────────────────────────────────────────────────────────

/**
 * ContentService で JSON レスポンスを返す。
 * @param {Object} payload
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function _jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 成功レスポンスを生成する。
 * @param {*} data
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function _ok(data) {
  return _jsonResponse({ success: true, data: data });
}

/**
 * エラーレスポンスを生成する。
 * @param {string} code     INVALID_PARAM | NOT_FOUND | SLOT_UNAVAILABLE | INTERNAL_ERROR
 * @param {string} message
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function _err(code, message) {
  return _jsonResponse({ success: false, error: { code: code, message: message } });
}

// ─── パラメータバリデーションヘルパー ─────────────────────────────────────────

/**
 * 必須パラメータが存在するかチェックする。
 * 不足している場合は例外オブジェクト（{_errResponse}）をスローする。
 *
 * @param {Object}   params
 * @param {string[]} keys
 */
function _requireParams(params, keys) {
  var missing = keys.filter(function(k) {
    return params[k] === undefined || params[k] === null || params[k] === '';
  });
  if (missing.length > 0) {
    throw { _errResponse: _err('INVALID_PARAM', '必須パラメータが不足しています: ' + missing.join(', ')) };
  }
}

// ─── doGet ────────────────────────────────────────────────────────────────────

/**
 * GET リクエストを処理する（参照系）。
 *
 * クエリパラメータ:
 *   action=availability         + date=YYYY-MM-DD
 *   action=availability_week    + weekStartDate=YYYY-MM-DD
 *   action=lessons              + date=YYYY-MM-DD  または  studentId=<id>
 *   action=students
 *   action=booking_requests
 *
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action || '';

    switch (action) {

      // ── 日次空き枠一覧 ──────────────────────────────────────────────────────
      case 'availability': {
        _requireParams(params, ['date']);
        var result = getAvailability(params.date);
        return _ok(result);
      }

      // ── 週間空き枠サマリー ──────────────────────────────────────────────────
      case 'availability_week': {
        _requireParams(params, ['weekStartDate']);
        var result = getWeekAvailabilitySummary(params.weekStartDate);
        return _ok(result);
      }

      // ── レッスン一覧 ────────────────────────────────────────────────────────
      // date または studentId のどちらか一方が必要
      case 'lessons': {
        if (params.date) {
          var result = getLessonsByDate(params.date);
          return _ok(result);
        }
        if (params.studentId) {
          var result = getLessonsByStudent(params.studentId);
          return _ok(result);
        }
        return _err('INVALID_PARAM', 'date または studentId のいずれかを指定してください。');
      }

      // ── アクティブ生徒一覧 ──────────────────────────────────────────────────
      case 'students': {
        var result = getActiveStudents();
        return _ok(result);
      }

      // ── 承認待ち予約リクエスト一覧 ──────────────────────────────────────────
      case 'booking_requests': {
        var result = getPendingBookingRequests();
        return _ok(result);
      }

      default:
        return _err('INVALID_PARAM', '不明な action です: ' + action);
    }

  } catch (ex) {
    if (ex && ex._errResponse) return ex._errResponse;
    return _err('INTERNAL_ERROR', ex.message || String(ex));
  }
}

// ─── doPost ───────────────────────────────────────────────────────────────────

/**
 * POST リクエストを処理する（書き込み系）。
 *
 * リクエストボディ (JSON):
 *   { action: 'booking_request', student_id, student_name_input,
 *     requested_date, requested_start, requested_end, studio_id, note?, line_user_id? }
 *   { action: 'approve', requestId, level?, lesson_count?, note? }
 *   { action: 'reject',  requestId, note? }
 *   { action: 'cancel_lesson', lessonId }
 *
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (_) {
        return _err('INVALID_PARAM', 'リクエストボディが JSON として解析できません。');
      }
    }

    var action = body.action || '';

    switch (action) {

      // ── 予約リクエスト作成 ──────────────────────────────────────────────────
      case 'booking_request': {
        _requireParams(body, [
          'student_name_input',
          'requested_date',
          'requested_start',
          'requested_end',
          'studio_id',
        ]);

        var validation = validateBookingRequest({
          requested_date:  body.requested_date,
          requested_start: body.requested_start,
          requested_end:   body.requested_end,
          studio_id:       body.studio_id,
        });
        if (!validation.valid) {
          return _err('SLOT_UNAVAILABLE', validation.reason);
        }

        var requestId = addBookingRequest({
          student_id:         body.student_id          != null ? body.student_id : '',
          student_name_input: body.student_name_input,
          requested_date:     body.requested_date,
          requested_start:    body.requested_start,
          requested_end:      body.requested_end,
          studio_id:          body.studio_id,
          note:               body.note               || '',
          line_user_id:       body.line_user_id        || '',
        });

        return _ok({ request_id: requestId });
      }

      // ── 予約リクエスト承認 ──────────────────────────────────────────────────
      case 'approve': {
        _requireParams(body, ['requestId']);

        var lessonOptions = {};
        if (body.level        !== undefined) lessonOptions.level        = body.level;
        if (body.lesson_count !== undefined) lessonOptions.lesson_count = body.lesson_count;
        if (body.note         !== undefined) lessonOptions.note         = body.note;

        var result = approveBookingRequest(body.requestId, lessonOptions);
        if (!result.success) {
          // 「見つからない」か「枠の問題」かをメッセージで大まかに分類
          var code = result.reason && result.reason.indexOf('見つかりません') !== -1
            ? 'NOT_FOUND'
            : 'SLOT_UNAVAILABLE';
          return _err(code, result.reason);
        }
        return _ok({ lesson_id: result.lessonId });
      }

      // ── 予約リクエスト却下 ──────────────────────────────────────────────────
      case 'reject': {
        _requireParams(body, ['requestId']);

        var result = rejectBookingRequest(body.requestId, body.note || '');
        if (!result.success) {
          var code = result.reason && result.reason.indexOf('見つかりません') !== -1
            ? 'NOT_FOUND'
            : 'INVALID_PARAM';
          return _err(code, result.reason);
        }
        return _ok({ request_id: body.requestId });
      }

      // ── レッスンキャンセル ──────────────────────────────────────────────────
      case 'cancel_lesson': {
        _requireParams(body, ['lessonId']);

        var lesson = getLesson(body.lessonId);
        if (!lesson) {
          return _err('NOT_FOUND', 'レッスンが見つかりません: ' + body.lessonId);
        }

        var cancelled = cancelLesson(body.lessonId);
        if (!cancelled) {
          return _err('INTERNAL_ERROR', 'レッスンのキャンセルに失敗しました: ' + body.lessonId);
        }
        return _ok({ lesson_id: body.lessonId });
      }

      default:
        return _err('INVALID_PARAM', '不明な action です: ' + action);
    }

  } catch (ex) {
    if (ex && ex._errResponse) return ex._errResponse;
    return _err('INTERNAL_ERROR', ex.message || String(ex));
  }
}
