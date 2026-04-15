/**
 * crud/lessons.js — lessons シート CRUD
 *
 * 列定義:
 *   A: lesson_id        INTEGER (PK, 自動採番)
 *   B: lesson_date      TEXT (YYYY-MM-DD)
 *   C: start_time       TEXT (HH:MM)
 *   D: end_time         TEXT (HH:MM)
 *   E: student_id       INTEGER (FK→students)
 *   F: studio_id        TEXT (FK→studios)
 *   G: level            TEXT
 *   H: lesson_count     INTEGER
 *   I: booking_request_id  INTEGER (NULL可)
 *   J: status           TEXT  pending|confirmed|cancelled
 *   K: note             TEXT
 *   L: created_at       TEXT (YYYY-MM-DD HH:MM)
 *   M: updated_at       TEXT (YYYY-MM-DD HH:MM)
 */

var LESSONS_SHEET = 'lessons';

// ─── 参照 ─────────────────────────────────────────────────────────────────────

/**
 * 1件取得。見つからない場合は null を返す。
 * @param {number} lessonId
 * @returns {Object|null}
 */
function getLesson(lessonId) {
  var sheet = getSheet(LESSONS_SHEET);
  var rowNumber = findRowById(sheet, lessonId);
  if (rowNumber === -1) return null;
  return getRowAsObject(sheet, rowNumber);
}

/**
 * 全件取得。
 * @returns {Object[]}
 */
function getAllLessons() {
  return getAllRows(getSheet(LESSONS_SHEET));
}

/**
 * 特定生徒のレッスン一覧を取得。
 * @param {number} studentId
 * @returns {Object[]}
 */
function getLessonsByStudent(studentId) {
  return getAllLessons().filter(function(row) {
    return String(row.student_id) === String(studentId);
  });
}

/**
 * 特定日付のレッスン一覧を取得。
 * @param {string} lessonDate  YYYY-MM-DD
 * @returns {Object[]}
 */
function getLessonsByDate(lessonDate) {
  return getAllLessons().filter(function(row) {
    return row.lesson_date === lessonDate;
  });
}

/**
 * 期間内のレッスン一覧を取得（両端含む）。
 * @param {string} fromDate  YYYY-MM-DD
 * @param {string} toDate    YYYY-MM-DD
 * @returns {Object[]}
 */
function getLessonsByDateRange(fromDate, toDate) {
  return getAllLessons().filter(function(row) {
    return row.lesson_date >= fromDate && row.lesson_date <= toDate;
  });
}

/**
 * 重複チェック: 同日時・同スタジオで confirmed なレッスンが存在するか。
 * ⚠️ withLock() のコールバック内で呼び出すこと。
 *
 * @param {string} lessonDate
 * @param {string} startTime
 * @param {string} studioId
 * @param {number} [excludeLessonId]  更新時に自分自身を除外する場合に指定
 * @returns {boolean}
 */
function hasDuplicateConfirmedLesson(lessonDate, startTime, studioId, excludeLessonId) {
  return getAllLessons().some(function(row) {
    if (excludeLessonId && String(row.lesson_id) === String(excludeLessonId)) {
      return false;
    }
    return (
      row.lesson_date === lessonDate &&
      row.start_time  === startTime  &&
      row.studio_id   === studioId   &&
      row.status      === 'confirmed'
    );
  });
}

// ─── 書き込み ─────────────────────────────────────────────────────────────────

/**
 * レッスンを追加する。
 * status のデフォルトは 'confirmed'。
 *
 * @param {Object} data
 * @param {string} data.lesson_date
 * @param {string} data.start_time
 * @param {string} data.end_time
 * @param {number} data.student_id
 * @param {string} data.studio_id
 * @param {string} [data.level]
 * @param {number} [data.lesson_count]
 * @param {number|string} [data.booking_request_id]
 * @param {string} [data.status]
 * @param {string} [data.note]
 * @returns {number} 追加した lesson_id
 */
function addLesson(data) {
  return withLock(function() {
    var sheet = getSheet(LESSONS_SHEET);
    var lessonId = getNextId(sheet);
    var now = nowDateTime();
    appendRow(sheet, [
      lessonId,
      data.lesson_date,
      data.start_time,
      data.end_time,
      data.student_id,
      data.studio_id,
      data.level        || '',
      data.lesson_count != null ? data.lesson_count : 1,
      data.booking_request_id != null ? data.booking_request_id : '',
      data.status       || 'confirmed',
      data.note         || '',
      now,
      now,
    ]);
    return lessonId;
  });
}

/**
 * レッスンのステータスを更新する。
 * 許可される遷移: pending→confirmed、confirmed→cancelled
 *
 * @param {number} lessonId
 * @param {string} status  'pending'|'confirmed'|'cancelled'
 * @returns {boolean} 更新成功したか
 */
function updateLessonStatus(lessonId, status) {
  var allowed = ['pending', 'confirmed', 'cancelled'];
  if (allowed.indexOf(status) === -1) {
    throw new Error('不正なステータス値: ' + status);
  }
  return withLock(function() {
    var sheet = getSheet(LESSONS_SHEET);
    var rowNumber = findRowById(sheet, lessonId);
    if (rowNumber === -1) return false;
    var now = nowDateTime();
    updateCell(sheet, rowNumber, 'status', status);
    updateCell(sheet, rowNumber, 'updated_at', now);
    return true;
  });
}

/**
 * レッスンをキャンセルする。
 * status を 'cancelled' にセット。lesson_count は変更しない。
 *
 * @param {number} lessonId
 * @returns {boolean}
 */
function cancelLesson(lessonId) {
  return updateLessonStatus(lessonId, 'cancelled');
}

/**
 * レッスン情報を更新する（任意フィールド）。
 *
 * @param {number} lessonId
 * @param {Object} data  更新するフィールドと値のマップ
 *   更新可能: lesson_date, start_time, end_time, student_id, studio_id,
 *             level, lesson_count, note, status
 * @returns {boolean}
 */
function updateLesson(lessonId, data) {
  var updatable = [
    'lesson_date', 'start_time', 'end_time', 'student_id', 'studio_id',
    'level', 'lesson_count', 'note', 'status',
  ];
  return withLock(function() {
    var sheet = getSheet(LESSONS_SHEET);
    var rowNumber = findRowById(sheet, lessonId);
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
