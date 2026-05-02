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
 *   UNAUTHORIZED     — 管理者シークレットが不正・未指定
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

// ─── 管理者認証ヘルパー ────────────────────────────────────────────────────────

/**
 * 管理者シークレットを検証する。
 *
 * GAS スクリプトプロパティ（Script Properties）に
 * キー名「ADMIN_SECRET」で設定した値と、クエリパラメータ secret が一致しなければ
 * エラーレスポンスを例外としてスローする。
 *
 * 呼び出し側は try/catch の中で使うこと（doGet の catch で自動的に捕捉される）。
 *
 * @param {Object} params  e.parameter
 */
function _requireAdminSecret(params) {
  var props  = PropertiesService.getScriptProperties();
  var secret = props.getProperty('ADMIN_SECRET') || '';
  if (!secret || params.secret !== secret) {
    throw { _errResponse: _err('UNAUTHORIZED', '認証に失敗しました。管理者のみアクセスできます。') };
  }
}

// ─── LINE ユーザー ID → 生徒 ID 解決ヘルパー ──────────────────────────────────

/**
 * LINE ユーザーID から student_id を解決する（Phase 4-B コア処理）。
 *
 * 処理の流れ:
 *   1. lineUserId が空 → '' を返す（未ログインや取得失敗の場合）
 *   2. students シートを検索して既存の紐づきを確認
 *   3. 見つかれば その student_id を返す
 *   4. 見つからなければ仮登録して新しい student_id を返す
 *
 * 「仮登録」とは:
 *   is_active=true の生徒レコードを作り、line_user_id を紐づけた状態で保存すること。
 *   name は LIFF で入力した名前（nameInput）をそのまま使う。
 *   講師が後でスプレッドシートから正式な情報（ふりがな・チケット種別など）を追記できる。
 *
 * @param {string} lineUserId   LINE ユーザーID（空文字の場合は '' を返す）
 * @param {string} nameInput    LIFF の名前入力欄の値（仮登録時に使用）
 * @returns {number|string}     student_id（見つからず仮登録も失敗した場合は ''）
 */
function _resolveStudentId(lineUserId, nameInput) {
  if (!lineUserId) return '';
  try {
    var result = findOrCreateStudentByLineUserId(lineUserId, nameInput);
    return result.studentId;
  } catch (e) {
    // 生徒解決に失敗しても予約リクエスト自体は受け付ける（空のまま保存）
    Logger.log('_resolveStudentId エラー: ' + e.message);
    return '';
  }
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
 * クエリパラメータなし（action 省略）:
 *   → LIFF 予約ページ（liff.html）を HtmlService で返す
 *
 * クエリパラメータ:
 *   action=availability         + date=YYYY-MM-DD
 *   action=availability_week    + weekStartDate=YYYY-MM-DD
 *   action=lessons              + date=YYYY-MM-DD  または  studentId=<id>
 *   action=students
 *   action=booking_requests
 *
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.Content.TextOutput|GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action || '';

  // action なし → LIFF 予約ページを返す
  //
  // HtmlService.createTemplateFromFile('liff') は gas/src/liff.html を読み込み、
  // <?= LIFF_ID ?> などのテンプレート変数を置き換えてから HTML として返す。
  //
  // LIFF_ID は GAS スクリプトプロパティ（Script Properties）に
  // キー名「LIFF_ID」で設定しておくこと。
  if (!action) {
    var props  = PropertiesService.getScriptProperties();
    var liffId = props.getProperty('LIFF_ID') || '';
    var tmpl   = HtmlService.createTemplateFromFile('liff');
    tmpl.LIFF_ID  = liffId;
    // LIFF HTML から fetch() で API を呼ぶための URL を注入する
    tmpl.API_URL  = ScriptApp.getService().getUrl();
    return tmpl.evaluate()
      .setTitle('レッスン予約 | ダンス手帳')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  try {
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

      // ── アクティブ生徒一覧（管理者専用） ────────────────────────────────────
      case 'students': {
        _requireAdminSecret(params);
        var result = getActiveStudents();
        return _ok(result);
      }

      // ── 承認待ち予約リクエスト一覧（管理者専用） ────────────────────────────
      case 'booking_requests': {
        _requireAdminSecret(params);
        var result = getPendingBookingRequests();
        return _ok(result);
      }

      // ── LIFF からの予約リクエスト作成（GET 版）─────────────────────────────
      // fetch() の POST は GAS の 302 リダイレクト仕様で body が失われるため、
      // LIFF クライアントからは GET クエリパラメータで送信する。
      case 'booking_request': {
        _requireParams(params, [
          'student_name_input',
          'requested_date',
          'requested_start',
          'requested_end',
          'studio_id',
        ]);

        var validation = validateBookingRequest({
          requested_date:  params.requested_date,
          requested_start: params.requested_start,
          requested_end:   params.requested_end,
          studio_id:       params.studio_id,
        });
        if (!validation.valid) {
          return _err('SLOT_UNAVAILABLE', validation.reason);
        }

        // Phase 4-B: line_user_id で既存生徒を検索 or 仮登録して student_id を自動セット
        var studentId = _resolveStudentId(
          params.line_user_id || '',
          params.student_name_input
        );

        var requestId = addBookingRequest({
          student_id:         studentId,
          student_name_input: params.student_name_input,
          requested_date:     params.requested_date,
          requested_start:    params.requested_start,
          requested_end:      params.requested_end,
          studio_id:          params.studio_id,
          note:               params.note          || '',
          line_user_id:       params.line_user_id  || '',
        });

        return _ok({ request_id: requestId });
      }

      // ── 予約リクエスト承認（管理者専用・GET 版）────────────────────────────
      // POST は GAS リダイレクト仕様で body が失われることがあるため
      // 管理画面からは GET クエリパラメータで操作する。
      case 'approve': {
        _requireAdminSecret(params);
        _requireParams(params, ['requestId']);

        var lessonOptions = {};
        if (params.level        ) lessonOptions.level        = params.level;
        if (params.lesson_count ) lessonOptions.lesson_count = params.lesson_count;
        if (params.note         ) lessonOptions.note         = params.note;

        var result = approveBookingRequest(params.requestId, lessonOptions);
        if (!result.success) {
          var code = result.reason && result.reason.indexOf('見つかりません') !== -1
            ? 'NOT_FOUND'
            : 'SLOT_UNAVAILABLE';
          return _err(code, result.reason);
        }
        return _ok({ lesson_id: result.lessonId, notify_status: result.notifyStatus || 'skipped' });
      }

      // ── 予約リクエスト却下（管理者専用・GET 版）────────────────────────────
      case 'reject': {
        _requireAdminSecret(params);
        _requireParams(params, ['requestId']);

        var result = rejectBookingRequest(params.requestId, params.note || '');
        if (!result.success) {
          var code = result.reason && result.reason.indexOf('見つかりません') !== -1
            ? 'NOT_FOUND'
            : 'INVALID_PARAM';
          return _err(code, result.reason);
        }
        return _ok({ request_id: params.requestId, notify_status: result.notifyStatus || 'skipped' });
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

        // Phase 4-B: line_user_id で既存生徒を検索 or 仮登録して student_id を自動セット
        var resolvedStudentId = (body.student_id != null && body.student_id !== '')
          ? body.student_id
          : _resolveStudentId(body.line_user_id || '', body.student_name_input);

        var requestId = addBookingRequest({
          student_id:         resolvedStudentId,
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
