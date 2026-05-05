/**
 * setupZones — ゾーン一括設定（一回限り実行）
 *
 * 既存ゾーンを全無効化し、以下のゾーンを新規追加する:
 *   月: 10:00-18:00 齊藤DG
 *   火: 10:00-13:30 齊藤DG / 14:30-18:00 仙台SS
 *   水: 10:00-18:00 仙台SS
 *   木: 10:00-18:00 仙台SS
 *   金: 12:30-18:00 泉中央
 *   土: 10:00-18:00 仙台SS
 */
function setupZones() {
  var sheet = getSheet('zones');
  var now   = nowDateTime();

  // 1. 既存ゾーンを全て無効化
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var isActiveCol = 6; // F列 = is_active（1始まり）
    sheet.getRange(2, isActiveCol, lastRow - 1, 1).setValue(false);
    Logger.log('既存ゾーン ' + (lastRow - 1) + ' 件を無効化しました');
  }

  // 2. 新ゾーンを追加
  var zones = [
    // [day_of_week, start_time, end_time, studio_id]
    [0, '10:00', '18:00', 'saito'],   // 月: 齊藤DG
    [1, '10:00', '13:30', 'saito'],   // 火前半: 齊藤DG
    [1, '14:30', '18:00', 'sendai'],  // 火後半: 仙台SS
    [2, '10:00', '18:00', 'sendai'],  // 水: 仙台SS
    [3, '10:00', '18:00', 'sendai'],  // 木: 仙台SS
    [4, '12:30', '18:00', 'izumi'],   // 金: 泉中央
    [5, '10:00', '18:00', 'sendai'],  // 土: 仙台SS
  ];

  var zoneRows = zones.map(function(z, i) {
    var num = lastRow + i; // 単純連番でzoneIdを生成
    var zoneId = 'z' + String(num).padStart(3, '0');
    return [zoneId, z[0], z[1], z[2], z[3], true, now];
  });

  sheet.getRange(lastRow + 1, 1, zoneRows.length, 7).setValues(zoneRows);
  Logger.log('新ゾーン ' + zoneRows.length + ' 件を追加しました');
  Logger.log('✅ setupZones 完了');
}

/**
 * init.js — スプレッドシート初期化スクリプト（一回限り実行）
 *
 * 実行方法：
 *   GAS エディタで initializeSpreadsheet() を選択し「実行」をクリックする。
 *
 * ⚠️ 注意：
 *   基本的に最初の1回だけ実行すること。
 *   2回目以降の実行はヘッダー行・書式設定を再適用するが、
 *   studios / ticket_types の初期データはスキップ（既存行がある場合）。
 */

/**
 * スプレッドシートを初期化する（12シート作成 + 初期データ投入）
 */
function initializeSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 各シートのスキーマ定義
  // textColIndices: 「書式なしテキスト」に設定する列のインデックス（0始まり）
  var schemas = [
    {
      name: 'studios',
      headers: ['studio_id', 'short_name', 'full_name', 'color_style', 'note'],
      textColIndices: [],
    },
    {
      name: 'zones',
      headers: ['zone_id', 'day_of_week', 'start_time', 'end_time', 'studio_id', 'is_active', 'updated_at'],
      textColIndices: [2, 3, 6], // start_time, end_time, updated_at
    },
    {
      name: 'zone_overrides',
      headers: ['override_id', 'week_start_date', 'day_of_week', 'start_time', 'end_time', 'studio_id', 'note', 'is_cancelled', 'created_at'],
      textColIndices: [1, 3, 4, 8], // week_start_date, start_time, end_time, created_at
    },
    {
      name: 'students',
      headers: ['student_id', 'name', 'furigana', 'line_user_id', 'since', 'ticket_type_id', 'dances', 'color_style', 'last_lesson_date', 'is_active', 'note', 'created_at', 'updated_at'],
      textColIndices: [8, 11, 12], // last_lesson_date, created_at, updated_at
    },
    {
      name: 'ticket_types',
      headers: ['ticket_type_id', 'label', 'color_hex', 'bg_hex', 'count', 'note'],
      textColIndices: [],
    },
    {
      name: 'lessons',
      headers: ['lesson_id', 'lesson_date', 'start_time', 'end_time', 'student_id', 'studio_id', 'level', 'lesson_count', 'booking_request_id', 'status', 'note', 'created_at', 'updated_at'],
      textColIndices: [1, 2, 3, 11, 12], // lesson_date, start_time, end_time, created_at, updated_at
    },
    {
      name: 'blocks',
      headers: ['block_id', 'label', 'sub_label', 'day_of_week', 'start_time', 'end_time', 'is_recurring', 'specific_date', 'is_active', 'created_at'],
      textColIndices: [4, 5, 7, 9], // start_time, end_time, specific_date, created_at
    },
    {
      name: 'booking_requests',
      headers: ['request_id', 'requested_at', 'expires_at', 'student_id', 'student_name_input', 'requested_date', 'requested_start', 'requested_end', 'studio_id', 'status', 'approved_lesson_id', 'approved_at', 'note', 'line_user_id'],
      textColIndices: [1, 2, 5, 6, 7, 11], // requested_at, expires_at, requested_date, requested_start, requested_end, approved_at
    },
    {
      name: 'lesson_memos',
      headers: ['memo_id', 'student_id', 'lesson_id', 'lesson_date', 'memo', 'goal', 'created_at', 'updated_at'],
      textColIndices: [3, 6, 7], // lesson_date, created_at, updated_at
    },
    {
      name: 'tasks',
      headers: ['task_id', 'text', 'is_urgent', 'is_done', 'done_at', 'created_at'],
      textColIndices: [4, 5], // done_at, created_at
    },
    {
      name: 'sales',
      headers: ['sale_id', 'sale_date', 'student_id', 'student_name', 'amount', 'type', 'payment_status', 'memo', 'lesson_id', 'created_at'],
      textColIndices: [1, 9], // sale_date, created_at
    },
    {
      name: 'notifications',
      headers: ['notification_id', 'student_id', 'line_user_id', 'type', 'related_id', 'sent_at', 'status'],
      textColIndices: [5], // sent_at
    },
  ];

  Logger.log('=== スプレッドシート初期化開始 ===');

  _setupSheets(ss, schemas);
  _removeDefaultSheet(ss);
  _insertInitialData(ss);

  SpreadsheetApp.flush();
  Logger.log('=== ✅ 初期化完了 ===');
}

// ─── 内部関数 ─────────────────────────────────────────────────────────────────

/**
 * スキーマ定義に従って各シートを作成・設定する
 */
function _setupSheets(ss, schemas) {
  var existingNames = ss.getSheets().map(function(s) { return s.getName(); });

  schemas.forEach(function(schema) {
    var sheet;
    if (existingNames.indexOf(schema.name) !== -1) {
      sheet = ss.getSheetByName(schema.name);
      Logger.log('[SKIP] シート "' + schema.name + '" は既存のため再利用します');
    } else {
      sheet = ss.insertSheet(schema.name);
      Logger.log('[NEW]  シート "' + schema.name + '" を作成しました');
    }

    _setHeaders(sheet, schema.headers);
    _setTextFormat(sheet, schema.textColIndices);
  });
}

/**
 * シートの1行目にヘッダーを設定し、スタイルを適用する
 */
function _setHeaders(sheet, headers) {
  var range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  range.setFontWeight('bold');
  range.setBackground('#f3f4f6');
  range.setFontColor('#374151');

  // ヘッダー行を固定
  sheet.setFrozenRows(1);
}

/**
 * 指定した列インデックスの列全体を「書式なしテキスト」に設定する
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number[]} colIndices - 0始まりの列インデックス
 */
function _setTextFormat(sheet, colIndices) {
  var maxRows = sheet.getMaxRows();
  colIndices.forEach(function(idx) {
    // 列アルファベット（A〜Z）に依存しない列番号指定（1始まり）で列全体を選択
    sheet.getRange(1, idx + 1, maxRows, 1).setNumberFormat('@');
  });
}

/**
 * デフォルトで存在する「シート1」を削除する。
 * 他にシートが存在し、かつ「シート1」が空（ヘッダー行もデータ行もない）場合のみ削除。
 */
function _removeDefaultSheet(ss) {
  var defaultSheet = ss.getSheetByName('シート1');
  if (!defaultSheet) return;
  if (ss.getSheets().length <= 1) return;
  // データが存在する場合は削除しない（誤削除防止）
  if (defaultSheet.getLastRow() > 0) {
    Logger.log('[SKIP] シート「シート1」にデータが存在するため削除をスキップしました');
    return;
  }
  ss.deleteSheet(defaultSheet);
  Logger.log('[DEL]  デフォルトシート「シート1」を削除しました');
}

/**
 * studios と ticket_types に初期データを投入する
 */
function _insertInitialData(ss) {
  Logger.log('--- 初期データ投入 ---');

  // studios
  var studiosSheet = ss.getSheetByName('studios');
  if (studiosSheet.getLastRow() <= 1) {
    var studiosData = [
      ['saito',  '齊藤DG', '齊藤ダンスガーデン',    'lime',   ''],
      ['sendai', '仙台SS', '仙台サテライトスタジオ', 'orange', ''],
      ['izumi',  '泉中央', '泉中央レンタルスペース', 'blue',   ''],
    ];
    studiosSheet.getRange(2, 1, studiosData.length, studiosData[0].length).setValues(studiosData);
    Logger.log('[OK]   studios: ' + studiosData.length + ' 件を投入');
  } else {
    Logger.log('[SKIP] studios: データが既に存在するためスキップ');
  }

  // ticket_types
  var ticketSheet = ss.getSheetByName('ticket_types');
  if (ticketSheet.getLastRow() <= 1) {
    var ticketData = [
      ['single',   '単発',       '#4b5563', '#f3f4f6',  1, ''],
      ['bundle3',  '3枚',        '#1d4ed8', '#dbeafe',  3, ''],
      ['bundle5',  '5枚',        '#6d28d9', '#ede9fe',  5, ''],
      ['bundle10', '10枚',       '#065f46', '#d1fae5', 10, ''],
      ['bundle20', '20枚',       '#9a3412', '#ffedd5', 20, ''],
      ['passport', 'パスポート', '#1e3a5f', '#bfdbfe', -1, ''],
      ['nsp',      'NSP',        '#4c1d95', '#ddd6fe', -1, ''],
      ['beginner', '初心者',     '#713f12', '#fef3c7',  1, ''],
    ];
    ticketSheet.getRange(2, 1, ticketData.length, ticketData[0].length).setValues(ticketData);
    Logger.log('[OK]   ticket_types: ' + ticketData.length + ' 件を投入');
  } else {
    Logger.log('[SKIP] ticket_types: データが既に存在するためスキップ');
  }
}
