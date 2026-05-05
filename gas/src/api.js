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
 *   生徒向け（認証なし）: availability, availability_week, booking_request
 *   管理者専用（ADMIN_SECRET 必須）: students, booking_requests, approve, reject, lessons,
 *                                    tasks, lesson_memos, sales
 *   doPost の書き込み系（approve / reject / cancel_lesson / student_add /
 *                        task_add / task_complete / task_delete /
 *                        lesson_memo_add / lesson_memo_update /
 *                        add_lesson / sale_add / sale_delete）も ADMIN_SECRET を必須とする
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
 * キー名「ADMIN_SECRET」で設定した値と、params.secret が一致しなければ
 * エラーレスポンスを例外としてスローする。
 *
 * doGet（e.parameter）・doPost（JSON body）の両方で使えるよう
 * オブジェクトの secret プロパティを参照する。
 *
 * @param {Object} params  e.parameter または JSON body
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

      // ── レッスン一覧（管理者専用） ──────────────────────────────────────────
      // レッスン情報には生徒氏名・予約日時が含まれるため管理者のみ取得可能
      // date または studentId のどちらか一方が必要
      case 'lessons': {
        _requireAdminSecret(params);
        if (params.date) {
          var result = getLessonsByDate(params.date);
          return _ok(result);
        }
        if (params.from && params.to) {
          var result = getLessonsByDateRange(params.from, params.to);
          return _ok(result);
        }
        if (params.studentId) {
          var result = getLessonsByStudent(params.studentId);
          return _ok(result);
        }
        return _err('INVALID_PARAM', 'date / from+to / studentId のいずれかを指定してください。');
      }

      // ── アクティブ生徒一覧（管理者専用） ────────────────────────────────────
      case 'students': {
        _requireAdminSecret(params);
        var result = getActiveStudents();
        return _ok(result);
      }

      // ── ブロック一覧（管理者専用） ──────────────────────────────────────────
      case 'blocks': {
        _requireAdminSecret(params);
        var result = getActiveBlocks();
        return _ok(result);
      }

      // ── 承認待ち予約リクエスト一覧（管理者専用） ────────────────────────────
      case 'booking_requests': {
        _requireAdminSecret(params);
        var result = getPendingBookingRequests();
        return _ok(result);
      }

      // ── タスク一覧（管理者専用） ─────────────────────────────────────────────
      // all=1 を渡すと完了済みも含む全件、省略時は未完了のみ
      case 'tasks': {
        _requireAdminSecret(params);
        var result = params.all === '1' ? getAllTasks() : getPendingTasks();
        return _ok(result);
      }

      // ── レッスンメモ一覧（管理者専用） ──────────────────────────────────────
      // studentId を指定すると特定生徒のメモ一覧、省略時は全件
      case 'lesson_memos': {
        _requireAdminSecret(params);
        var result = params.studentId
          ? getLessonMemosByStudent(params.studentId)
          : getAllLessonMemos();
        return _ok(result);
      }

      // ── チケット種別一覧（管理者専用） ──────────────────────────────────────
      // ticket_type_id → label / color_hex / bg_hex / count のマスターデータ
      case 'ticket_types': {
        _requireAdminSecret(params);
        var result = getAllTicketTypes();
        return _ok(result);
      }

      // ── 売上一覧（管理者専用） ───────────────────────────────────────────────
      // from / to（YYYY-MM-DD）で期間絞り込み可。省略時は全件
      case 'sales': {
        _requireAdminSecret(params);
        var result = (params.from && params.to)
          ? getSalesByDateRange(params.from, params.to)
          : getAllSales();
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

        // 管理者へ着信通知（失敗しても予約リクエスト自体は成功扱い）
        var notifyResult = sendNewBookingRequestMessage({
          student_name_input: params.student_name_input,
          requested_date:     params.requested_date,
          requested_start:    params.requested_start,
          requested_end:      params.requested_end,
          studio_id:          params.studio_id,
          note:               params.note || '',
        });

        return _ok({
          request_id:     requestId,
          notify_status:  notifyResult.skipped ? 'skipped' : (notifyResult.success ? 'sent' : 'failed'),
          notify_error:   notifyResult.error || '',
        });
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
        return _ok({ lesson_id: result.lessonId, notify_status: result.notifyStatus || 'skipped', notify_error: result.notifyError || '' });
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
        return _ok({ request_id: params.requestId, notify_status: result.notifyStatus || 'skipped', notify_error: result.notifyError || '' });
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

        // 管理者へ着信通知（失敗しても予約リクエスト自体は成功扱い）
        var notifyResult = sendNewBookingRequestMessage({
          student_name_input: body.student_name_input,
          requested_date:     body.requested_date,
          requested_start:    body.requested_start,
          requested_end:      body.requested_end,
          studio_id:          body.studio_id,
          note:               body.note || '',
        });

        return _ok({
          request_id:    requestId,
          notify_status: notifyResult.skipped ? 'skipped' : (notifyResult.success ? 'sent' : 'failed'),
          notify_error:  notifyResult.error || '',
        });
      }

      // ── 予約リクエスト承認（管理者専用）────────────────────────────────────
      case 'approve': {
        _requireAdminSecret(body);
        _requireParams(body, ['requestId']);

        // link_student_id が指定された場合は既存生徒と紐づけてから承認
        if (body.link_student_id) {
          var reqSheet = getSheet(BOOKING_REQUESTS_SHEET);
          var reqRow   = findRowById(reqSheet, body.requestId);
          if (reqRow === -1) return _err('NOT_FOUND', 'リクエストが見つかりません: ' + body.requestId);
          var reqObj = getRowAsObject(reqSheet, reqRow);
          // 既存生徒に LINE ユーザーID を紐づける
          if (reqObj.line_user_id) {
            updateStudent(Number(body.link_student_id), { line_user_id: reqObj.line_user_id });
          }
          // 予約リクエストの student_id を既存生徒IDに上書き
          updateCell(reqSheet, reqRow, 'student_id', Number(body.link_student_id));
        }

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

      // ── 予約リクエスト却下（管理者専用）────────────────────────────────────
      case 'reject': {
        _requireAdminSecret(body);
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

      // ── ブロック追加（管理者専用）───────────────────────────────────────────
      case 'block_add': {
        _requireAdminSecret(body);
        _requireParams(body, ['label', 'start_time', 'end_time']);
        var isRecurring = body.is_recurring === true || body.is_recurring === 'true';
        var blockId = addBlock({
          label:         body.label,
          sub_label:     body.sub_label     || '',
          day_of_week:   Number(body.day_of_week),
          start_time:    body.start_time,
          end_time:      body.end_time,
          is_recurring:  isRecurring,
          specific_date: body.specific_date || '',
        });
        return _ok({ block_id: blockId });
      }

      // ── ブロック削除（無効化）（管理者専用）─────────────────────────────────
      case 'block_delete': {
        _requireAdminSecret(body);
        _requireParams(body, ['blockId']);
        var ok = deactivateBlock(Number(body.blockId));
        if (!ok) return _err('NOT_FOUND', 'ブロックが見つかりません: ' + body.blockId);
        return _ok({ block_id: body.blockId });
      }

      // ── 生徒追加（管理者専用）───────────────────────────────────────────────
      case 'student_add': {
        _requireAdminSecret(body);
        _requireParams(body, ['name']);
        var studentId = addStudent({
          name:           body.name,
          ticket_type_id: body.ticket_type_id || '',
          note:           body.note           || '',
        });
        return _ok({ student_id: studentId });
      }

      // ── タスク追加（管理者専用）─────────────────────────────────────────────
      case 'task_add': {
        _requireAdminSecret(body);
        _requireParams(body, ['text']);
        var taskId = addTask({
          text:      body.text,
          is_urgent: body.is_urgent === true || body.is_urgent === 'true',
          due_date:  body.due_date || '',
        });
        return _ok({ task_id: taskId });
      }

      // ── タスク完了（管理者専用）─────────────────────────────────────────────
      case 'task_complete': {
        _requireAdminSecret(body);
        _requireParams(body, ['taskId']);
        var ok = completeTask(body.taskId);
        if (!ok) return _err('NOT_FOUND', 'タスクが見つかりません: ' + body.taskId);
        return _ok({ task_id: body.taskId });
      }

      // ── タスク削除（管理者専用）─────────────────────────────────────────────
      case 'task_delete': {
        _requireAdminSecret(body);
        _requireParams(body, ['taskId']);
        var ok = deleteTask(body.taskId);
        if (!ok) return _err('NOT_FOUND', 'タスクが見つかりません: ' + body.taskId);
        return _ok({ task_id: body.taskId });
      }

      // ── タスク更新（管理者専用）─────────────────────────────────────────────
      case 'task_update': {
        _requireAdminSecret(body);
        _requireParams(body, ['taskId']);
        var ok = updateTask(body.taskId, {
          text:      body.text,
          is_urgent: body.is_urgent !== undefined
                       ? (body.is_urgent === true || body.is_urgent === 'true')
                       : undefined,
          due_date:  body.due_date !== undefined ? (body.due_date || '') : undefined,
        });
        if (!ok) return _err('NOT_FOUND', 'タスクが見つかりません: ' + body.taskId);
        return _ok({ task_id: body.taskId });
      }

      // ── レッスンメモ追加（管理者専用）───────────────────────────────────────
      case 'lesson_memo_add': {
        _requireAdminSecret(body);
        _requireParams(body, ['student_id', 'lesson_date']);
        var memoId = addLessonMemo({
          student_id:  body.student_id,
          lesson_id:   body.lesson_id  || '',
          lesson_date: body.lesson_date,
          memo:        body.memo       || '',
          goal:        body.goal       || '',
        });
        return _ok({ memo_id: memoId });
      }

      // ── レッスンメモ更新（管理者専用）───────────────────────────────────────
      case 'lesson_memo_update': {
        _requireAdminSecret(body);
        _requireParams(body, ['memoId']);
        var ok = updateLessonMemo(body.memoId, {
          memo: body.memo,
          goal: body.goal,
        });
        if (!ok) return _err('NOT_FOUND', 'メモが見つかりません: ' + body.memoId);
        return _ok({ memo_id: body.memoId });
      }

      // ── レッスン直接追加（管理者専用）──────────────────────────────────────
      // 管理者が生徒のリクエストを通さずに直接レッスンを登録する。
      // 同日時・同スタジオで confirmed なレッスンが既に存在する場合は SLOT_UNAVAILABLE を返す。
      case 'add_lesson': {
        _requireAdminSecret(body);
        _requireParams(body, [
          'lesson_date', 'start_time', 'end_time', 'student_id', 'studio_id',
        ]);

        // addLesson() が内部で withLock を取得するため、ここでは二重ロックを避ける。
        // 重複チェックは参照のみなのでロック外で実施し、書き込みは addLesson() に委ねる。
        if (hasDuplicateConfirmedLesson(
          body.lesson_date, body.start_time, body.studio_id
        )) {
          return _err('SLOT_UNAVAILABLE',
            '同日時・同スタジオに既に確定済みのレッスンがあります。');
        }
        var lessonId = addLesson({
          lesson_date:        body.lesson_date,
          start_time:         body.start_time,
          end_time:           body.end_time,
          student_id:         body.student_id,
          studio_id:          body.studio_id,
          level:              body.level           || '',
          lesson_count:       body.lesson_count != null ? body.lesson_count : 1,
          note:               body.note            || '',
          ticket_type_id:     body.ticket_type_id  || '',
          status:             'confirmed',
        });
        return _ok({ lesson_id: lessonId });
      }

      // ── 売上追加（管理者専用）───────────────────────────────────────────────
      case 'sale_add': {
        _requireAdminSecret(body);
        _requireParams(body, ['sale_date', 'amount', 'type']);
        var saleId = addSale({
          sale_date:      body.sale_date,
          student_id:     body.student_id     || '',
          student_name:   body.student_name   || '',
          amount:         Number(body.amount),
          type:           body.type,
          payment_status: body.payment_status || 'paid',
          memo:           body.memo           || '',
          lesson_id:      body.lesson_id      || '',
        });
        return _ok({ sale_id: saleId });
      }

      // ── 売上削除（管理者専用）───────────────────────────────────────────────
      case 'sale_delete': {
        _requireAdminSecret(body);
        _requireParams(body, ['saleId']);
        var ok = deleteSale(body.saleId);
        if (!ok) return _err('NOT_FOUND', '売上が見つかりません: ' + body.saleId);
        return _ok({ sale_id: body.saleId });
      }

      // ── レッスン詳細更新（管理者専用）──────────────────────────────────────
      // 管理画面のレッスン詳細シートから level / lesson_count / note 等を更新する。
      // lessonId は必須。その他フィールドは渡したものだけ更新（省略 OK）。
      case 'lesson_update': {
        _requireAdminSecret(body);
        _requireParams(body, ['lessonId']);

        var lessonFields = {};
        if (body.level          !== undefined) lessonFields.level          = body.level;
        if (body.lesson_count   !== undefined) lessonFields.lesson_count   = Number(body.lesson_count);
        if (body.note           !== undefined) lessonFields.note           = body.note;
        if (body.studio_id      !== undefined) lessonFields.studio_id      = body.studio_id;
        if (body.start_time     !== undefined) lessonFields.start_time     = body.start_time;
        if (body.end_time       !== undefined) lessonFields.end_time       = body.end_time;
        if (body.ticket_type_id !== undefined) lessonFields.ticket_type_id = body.ticket_type_id;

        var updated = updateLesson(body.lessonId, lessonFields);
        if (!updated) return _err('NOT_FOUND', 'レッスンが見つかりません: ' + body.lessonId);
        return _ok({ lesson_id: body.lessonId });
      }

      // ── レッスンキャンセル（管理者専用）────────────────────────────────────
      case 'cancel_lesson': {
        _requireAdminSecret(body);
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
