/**
 * crud/students.js — students シート CRUD
 *
 * 列定義:
 *   A: student_id       INTEGER (PK, 自動採番)
 *   B: name             TEXT
 *   C: furigana         TEXT
 *   D: line_user_id     TEXT (Phase 4 以降にセット)
 *   E: since            TEXT  例: "2024年3月"
 *   F: ticket_type_id   TEXT (FK→ticket_types)
 *   G: dances           TEXT
 *   H: color_style      TEXT
 *   I: last_lesson_date TEXT (YYYY-MM-DD, GAS が自動更新)
 *   J: is_active        BOOLEAN
 *   K: note             TEXT
 *   L: created_at       TEXT (YYYY-MM-DD HH:MM)
 *   M: updated_at       TEXT (YYYY-MM-DD HH:MM)
 *
 * last_lesson_date の更新ルール:
 *   lessons シートで student_id が一致し status='confirmed' かつ
 *   lesson_date が最大のレコードの日付をセットする。
 *   レッスン追加・ステータス変更・キャンセル時に refreshStudentLastLessonDate() を呼ぶこと。
 */

var STUDENTS_SHEET = 'students';

// ─── 参照 ─────────────────────────────────────────────────────────────────────

/**
 * 1件取得。見つからない場合は null を返す。
 * @param {number} studentId
 * @returns {Object|null}
 */
function getStudent(studentId) {
  var sheet = getSheet(STUDENTS_SHEET);
  var rowNumber = findRowById(sheet, studentId);
  if (rowNumber === -1) return null;
  return getRowAsObject(sheet, rowNumber);
}

/**
 * LINE ユーザーID で生徒を検索する。
 * @param {string} lineUserId
 * @returns {Object|null}
 */
function getStudentByLineUserId(lineUserId) {
  var found = getAllRows(getSheet(STUDENTS_SHEET)).filter(function(row) {
    return row.line_user_id === lineUserId;
  });
  return found.length > 0 ? found[0] : null;
}

/**
 * 全件取得（is_active を問わず）。
 * @returns {Object[]}
 */
function getAllStudents() {
  return getAllRows(getSheet(STUDENTS_SHEET));
}

/**
 * アクティブな生徒のみ取得（is_active = TRUE）。
 * @returns {Object[]}
 */
function getActiveStudents() {
  return getAllStudents().filter(function(row) {
    return row.is_active === true || row.is_active === 'TRUE';
  });
}

// ─── 書き込み ─────────────────────────────────────────────────────────────────

/**
 * 生徒を追加する。
 *
 * @param {Object} data
 * @param {string} data.name
 * @param {string} [data.furigana]
 * @param {string} [data.since]
 * @param {string} [data.ticket_type_id]
 * @param {string} [data.dances]
 * @param {string} [data.color_style]
 * @param {string} [data.note]
 * @returns {number} 追加した student_id
 */
function addStudent(data) {
  return withLock(function() {
    var sheet = getSheet(STUDENTS_SHEET);
    var studentId = getNextId(sheet);
    var now = nowDateTime();
    appendRow(sheet, [
      studentId,
      data.name,
      data.furigana        || '',
      '',
      data.since           || '',
      data.ticket_type_id  || '',
      data.dances          || '',
      data.color_style     || '',
      '',
      true,
      data.note            || '',
      now,
      now,
    ]);
    return studentId;
  });
}

/**
 * 生徒情報を更新する（任意フィールド）。
 *
 * @param {number} studentId
 * @param {Object} data  更新するフィールドと値のマップ
 *   更新可能: name, furigana, line_user_id, since, ticket_type_id,
 *             dances, color_style, note, is_active
 * @returns {boolean}
 */
function updateStudent(studentId, data) {
  var updatable = [
    'name', 'furigana', 'line_user_id', 'since',
    'ticket_type_id', 'dances', 'color_style', 'note', 'is_active',
  ];
  return withLock(function() {
    var sheet = getSheet(STUDENTS_SHEET);
    var rowNumber = findRowById(sheet, studentId);
    if (rowNumber === -1) return false;
    updatable.forEach(function(field) {
      if (data[field] !== undefined) {
        updateCell(sheet, rowNumber, field, data[field]);
      }
    });
    updateCell(sheet, rowNumber, 'updated_at', nowDateTime());
    return true;
  });
}

/**
 * 生徒をアーカイブする（is_active = FALSE）。
 * @param {number} studentId
 * @returns {boolean}
 */
function archiveStudent(studentId) {
  return withLock(function() {
    var sheet = getSheet(STUDENTS_SHEET);
    var rowNumber = findRowById(sheet, studentId);
    if (rowNumber === -1) return false;
    updateCell(sheet, rowNumber, 'is_active', false);
    updateCell(sheet, rowNumber, 'updated_at', nowDateTime());
    return true;
  });
}

/**
 * LINE ユーザーID を紐付ける（Phase 4 LIFF連携時に使用）。
 * @param {number} studentId
 * @param {string} lineUserId
 * @returns {boolean}
 */
function setStudentLineUserId(studentId, lineUserId) {
  return withLock(function() {
    var sheet = getSheet(STUDENTS_SHEET);
    var rowNumber = findRowById(sheet, studentId);
    if (rowNumber === -1) return false;
    updateCell(sheet, rowNumber, 'line_user_id', lineUserId);
    updateCell(sheet, rowNumber, 'updated_at', nowDateTime());
    return true;
  });
}

// ─── last_lesson_date 自動更新 ────────────────────────────────────────────────

/**
 * 生徒の last_lesson_date を再計算して更新する。
 * lessons シートの confirmed レッスンのうち最大の lesson_date をセットする。
 * ⚠️ withLock() のコールバック内で呼び出すこと（呼び出し元がロックを保持していること）。
 *
 * @param {number} studentId
 */
function refreshStudentLastLessonDate(studentId) {
  var confirmedLessons = getAllRows(getSheet(LESSONS_SHEET)).filter(function(row) {
    return (
      String(row.student_id) === String(studentId) &&
      row.status === 'confirmed'
    );
  });

  var maxDate = '';
  confirmedLessons.forEach(function(row) {
    if (row.lesson_date > maxDate) {
      maxDate = row.lesson_date;
    }
  });

  var studentsSheet = getSheet(STUDENTS_SHEET);
  var rowNumber = findRowById(studentsSheet, studentId);
  if (rowNumber === -1) return;
  updateCell(studentsSheet, rowNumber, 'last_lesson_date', maxDate);
  updateCell(studentsSheet, rowNumber, 'updated_at', nowDateTime());
}
