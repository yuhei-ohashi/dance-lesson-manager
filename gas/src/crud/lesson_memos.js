/**
 * crud/lesson_memos.js — lesson_memos シート CRUD
 *
 * 列定義:
 *   A: memo_id     INTEGER (PK, 自動採番)
 *   B: student_id  INTEGER (FK→students)
 *   C: lesson_id   INTEGER (FK→lessons, NULL可)
 *   D: lesson_date TEXT (YYYY-MM-DD)
 *   E: memo        TEXT
 *   F: goal        TEXT
 *   G: created_at  TEXT (YYYY-MM-DD HH:MM)
 *   H: updated_at  TEXT (YYYY-MM-DD HH:MM)
 */

var LESSON_MEMOS_SHEET = 'lesson_memos';

// ─── 参照 ─────────────────────────────────────────────────────────────────────

/**
 * 1件取得。
 * @param {number} memoId
 * @returns {Object|null}
 */
function getLessonMemo(memoId) {
  var sheet = getSheet(LESSON_MEMOS_SHEET);
  var rowNumber = findRowById(sheet, memoId);
  if (rowNumber === -1) return null;
  return getRowAsObject(sheet, rowNumber);
}

/**
 * 全件取得。
 * @returns {Object[]}
 */
function getAllLessonMemos() {
  return getAllRows(getSheet(LESSON_MEMOS_SHEET));
}

/**
 * 特定生徒のメモ一覧を取得（lesson_date 降順）。
 * @param {number} studentId
 * @returns {Object[]}
 */
function getLessonMemosByStudent(studentId) {
  return getAllLessonMemos()
    .filter(function(row) {
      return String(row.student_id) === String(studentId);
    })
    .sort(function(a, b) {
      return b.lesson_date > a.lesson_date ? 1 : -1;
    });
}

/**
 * 特定レッスンに紐づくメモを取得。
 * @param {number} lessonId
 * @returns {Object|null}
 */
function getLessonMemoByLesson(lessonId) {
  var found = getAllLessonMemos().filter(function(row) {
    return String(row.lesson_id) === String(lessonId);
  });
  return found.length > 0 ? found[0] : null;
}

// ─── 書き込み ─────────────────────────────────────────────────────────────────

/**
 * レッスンメモを追加する。
 *
 * @param {Object} data
 * @param {number} data.student_id
 * @param {number|string} [data.lesson_id]  NULL可
 * @param {string} data.lesson_date          YYYY-MM-DD
 * @param {string} [data.memo]
 * @param {string} [data.goal]
 * @returns {number} 追加した memo_id
 */
function addLessonMemo(data) {
  return withLock(function() {
    var sheet = getSheet(LESSON_MEMOS_SHEET);
    var memoId = getNextId(sheet);
    var now = nowDateTime();
    appendRow(sheet, [
      memoId,
      data.student_id,
      data.lesson_id != null ? data.lesson_id : '',
      data.lesson_date,
      data.memo  || '',
      data.goal  || '',
      now,
      now,
    ]);
    return memoId;
  });
}

/**
 * レッスンメモを更新する。
 *
 * @param {number} memoId
 * @param {Object} data  更新可能: memo, goal
 * @returns {boolean}
 */
function updateLessonMemo(memoId, data) {
  return withLock(function() {
    var sheet = getSheet(LESSON_MEMOS_SHEET);
    var rowNumber = findRowById(sheet, memoId);
    if (rowNumber === -1) return false;
    if (data.memo !== undefined) updateCell(sheet, rowNumber, 'memo', data.memo);
    if (data.goal !== undefined) updateCell(sheet, rowNumber, 'goal', data.goal);
    updateCell(sheet, rowNumber, 'updated_at', nowDateTime());
    return true;
  });
}
