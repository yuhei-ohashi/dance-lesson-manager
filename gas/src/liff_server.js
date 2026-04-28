/**
 * liff_server.js — LIFF クライアント向けサーバーサイド関数
 *
 * LIFF HTML（liff.html）は GAS HtmlService で配信される。
 * クライアント側 JS から google.script.run.<関数名>() で呼び出す。
 *
 * 注意:
 *   - 引数・戻り値はシリアライズ可能なプリミティブ・オブジェクト・配列のみ可。
 *   - Date オブジェクトは文字列として渡すこと。
 *   - 例外は withFailureHandler でクライアント側に伝わる。
 */

// ─── 週間空き枠サマリー ────────────────────────────────────────────────────────

/**
 * 週間の各日ごとの空き枠数を返す（カレンダー表示用）。
 *
 * @param {string} weekStartDate  YYYY-MM-DD（月曜日の日付）
 * @returns {Array<{
 *   date:            string,
 *   day_of_week:     number,
 *   available_count: number,
 * }>}
 */
function liffGetWeekAvailability(weekStartDate) {
  return getWeekAvailabilitySummary(weekStartDate);
}

// ─── 日次スロット一覧 ──────────────────────────────────────────────────────────

/**
 * 指定日の 30 分スロット一覧と空き状況を返す（スロット選択画面用）。
 *
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {{
 *   date:        string,
 *   day_of_week: number,
 *   zones:       Object[],
 *   occupied:    Object[],
 *   slots: Array<{
 *     start_time: string,
 *     end_time:   string,
 *     studio_id:  string,
 *     available:  boolean,
 *     reason:     string|null,
 *   }>,
 * }}
 */
function liffGetDayAvailability(dateStr) {
  return getAvailability(dateStr);
}

// ─── 予約リクエスト作成 ────────────────────────────────────────────────────────

/**
 * 予約リクエストを作成し、結果を返す。
 *
 * バリデーション（スロット空き確認）を行ってから addBookingRequest を呼ぶ。
 *
 * @param {{
 *   student_name_input: string,
 *   requested_date:     string,
 *   requested_start:    string,
 *   requested_end:      string,
 *   studio_id:          string,
 *   note?:              string,
 *   line_user_id?:      string,
 * }} params
 * @returns {{ success: boolean, requestId?: string, error?: string }}
 */
function liffCreateBookingRequest(params) {
  try {
    if (!params.student_name_input || params.student_name_input.trim() === '') {
      return { success: false, error: 'お名前が入力されていません。' };
    }

    var validation = validateBookingRequest({
      requested_date:  params.requested_date,
      requested_start: params.requested_start,
      requested_end:   params.requested_end,
      studio_id:       params.studio_id,
    });
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    var requestId = addBookingRequest({
      student_id:         '',
      student_name_input: params.student_name_input.trim(),
      requested_date:     params.requested_date,
      requested_start:    params.requested_start,
      requested_end:      params.requested_end,
      studio_id:          params.studio_id,
      note:               params.note  || '',
      line_user_id:       params.line_user_id || '',
    });

    return { success: true, requestId: requestId };

  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}
