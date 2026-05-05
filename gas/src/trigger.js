/**
 * trigger.js — GAS コールドスタート対策
 *
 * 【仕組み】
 *   GAS は一定時間（約15〜20分）使われないとインスタンスが破棄され、
 *   次のアクセス時に起動し直す「コールドスタート」が発生する（3〜10秒の遅延）。
 *   5分おきに keepWarm() を自動実行することでインスタンスを温かく保つ。
 *
 * 【初回セットアップ手順】
 *   1. GAS スクリプトエディタを開く
 *      https://script.google.com/home → このプロジェクトを選択
 *   2. 関数選択ドロップダウンで「setupKeepWarmTrigger」を選ぶ
 *   3. 「実行」ボタンを押す（1回だけでOK）
 *   4. トリガー一覧（左メニュー「トリガー」）に
 *      「keepWarm / 時間ベース / 5分おき」が追加されれば完了
 *
 * 【消費する実行時間の目安】
 *   5分おき × 24時間 = 288回/日
 *   keepWarm 1回あたり約0.5秒 → 約2〜3分/日
 *   無料上限 90分/日 に対して約 3% — 問題なし
 */

/**
 * 5分おきに自動実行される軽量 ping 関数。
 * SpreadsheetApp に触れることで GAS インスタンスを起動状態に保つ。
 * 処理内容は最小限にして実行時間を抑える。
 */
function keepWarm() {
  SpreadsheetApp.getActiveSpreadsheet(); // インスタンスを起こすだけ
}

/**
 * 5分おきのトリガーを登録する。
 * 初回に1回だけ手動実行する。2回以上実行すると重複トリガーが作られるので注意。
 * 既存トリガーがある場合は先に削除してから実行すること。
 */
function setupKeepWarmTrigger() {
  // 既存の keepWarm トリガーをすべて削除してから再登録（重複防止）
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'keepWarm') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('keepWarm')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('keepWarm トリガーを5分おきで登録しました。');
}
