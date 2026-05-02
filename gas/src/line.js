/**
 * line.js — LINE Messaging API ラッパー
 *
 * チャンネルアクセストークンは GAS スクリプトプロパティに保存する。
 * キー名: LINE_CHANNEL_ACCESS_TOKEN
 *
 * 設定方法:
 *   GAS エディタ → プロジェクトの設定 → スクリプトプロパティ →
 *   「プロパティを追加」→ キー: LINE_CHANNEL_ACCESS_TOKEN / 値: <トークン文字列>
 *
 * 使用する LINE API:
 *   Push Message API — 特定ユーザーへメッセージを送信する
 *   https://developers.line.biz/ja/reference/messaging-api/#send-push-message
 */

var LINE_API_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

// ─── トークン取得 ──────────────────────────────────────────────────────────────

/**
 * スクリプトプロパティからチャンネルアクセストークンを取得する。
 * 設定されていない場合は例外をスロー。
 *
 * @returns {string}
 */
function _getLineToken() {
  var token = PropertiesService
    .getScriptProperties()
    .getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) {
    throw new Error(
      'LINE_CHANNEL_ACCESS_TOKEN がスクリプトプロパティに設定されていません。' +
      'GAS エディタ → プロジェクトの設定 → スクリプトプロパティ から設定してください。'
    );
  }
  return token;
}

// ─── 基本送信関数 ──────────────────────────────────────────────────────────────

/**
 * 指定ユーザーへ Push メッセージを送信する。
 * LINE Messaging API の Push Message エンドポイントを呼び出す。
 *
 * @param {string}   lineUserId  送信先の LINE ユーザー ID（"U" で始まる文字列）
 * @param {Object[]} messages    LINE メッセージオブジェクトの配列（最大 5 件）
 * @returns {{ success: boolean, error?: string }}
 */
function sendLinePushMessage(lineUserId, messages) {
  if (!lineUserId) {
    return { success: false, error: 'lineUserId が空です。' };
  }

  var token;
  try {
    token = _getLineToken();
  } catch (e) {
    return { success: false, error: e.message };
  }

  var payload = JSON.stringify({
    to:       lineUserId,
    messages: messages,
  });

  var options = {
    method:      'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
    },
    payload:            payload,
    muteHttpExceptions: true,
  };

  try {
    var response = UrlFetchApp.fetch(LINE_API_PUSH_URL, options);
    var statusCode = response.getResponseCode();

    if (statusCode === 200) {
      return { success: true };
    }

    // レスポンスボディに LINE API のエラー詳細が含まれる
    var body = '';
    try { body = response.getContentText(); } catch (_) {}

    return {
      success: false,
      error:   'LINE API エラー (HTTP ' + statusCode + '): ' + body,
    };
  } catch (e) {
    return { success: false, error: 'LINE API 呼び出し失敗: ' + e.message };
  }
}

// ─── 通知メッセージ定義 ────────────────────────────────────────────────────────

/**
 * 予約承認通知を送信する。
 *
 * @param {string} lineUserId
 * @param {Object} info
 * @param {string} info.requested_date   YYYY-MM-DD
 * @param {string} info.requested_start  HH:MM
 * @param {string} info.requested_end    HH:MM
 * @param {string} info.studio_id        スタジオID
 * @returns {{ success: boolean, error?: string }}
 */
function sendBookingApprovedMessage(lineUserId, info) {
  var studioLabel = _studioLabel(info.studio_id);
  var text =
    '予約が確定しました！\n\n' +
    '📅 日付：' + info.requested_date + '\n' +
    '⏰ 時間：' + info.requested_start + '〜' + info.requested_end + '\n' +
    '🏢 スタジオ：' + studioLabel + '\n\n' +
    'ご予約いただきありがとうございます。\n' +
    '当日お会いできるのを楽しみにしております！';

  return sendLinePushMessage(lineUserId, [{ type: 'text', text: text }]);
}

/**
 * 予約不可通知を送信する。
 *
 * @param {string} lineUserId
 * @param {string} [note]  使用しない（将来の拡張のため引数として保持）
 * @returns {{ success: boolean, error?: string }}
 */
function sendBookingRejectedMessage(lineUserId, note) {
  var text =
    '🙇 ご予約リクエストについてご連絡いたします。\n\n' +
    '誠に恐れ入りますが、ご希望の日時でのご対応が\n' +
    '難しい状況となっております。\n\n' +
    'ご不便をおかけして大変申し訳ございません。\n' +
    '別の日程でのご希望がございましたら、\n' +
    'お気軽にお知らせください。';

  return sendLinePushMessage(lineUserId, [{ type: 'text', text: text }]);
}

// ─── スタジオ名変換（内部用）──────────────────────────────────────────────────

/**
 * studio_id を表示名に変換する。
 * @param {string} studioId
 * @returns {string}
 */
function _studioLabel(studioId) {
  var map = {
    saito:  '齊藤ダンスガーデン',
    sendai: '仙台サテライトスタジオ',
    izumi:  '西塚ダンスアートアカデミー',
  };
  return map[studioId] || studioId;
}
