/**
 * crud/tasks.js — tasks シート CRUD
 *
 * 列定義:
 *   A: task_id    INTEGER (PK, 自動採番)
 *   B: text       TEXT
 *   C: is_urgent  BOOLEAN
 *   D: is_done    BOOLEAN
 *   E: done_at    TEXT (YYYY-MM-DD HH:MM, NULL可)
 *   F: created_at TEXT (YYYY-MM-DD HH:MM)
 */

var TASKS_SHEET = 'tasks';

// ─── 参照 ─────────────────────────────────────────────────────────────────────

/**
 * 1件取得。
 * @param {number} taskId
 * @returns {Object|null}
 */
function getTask(taskId) {
  var sheet = getSheet(TASKS_SHEET);
  var rowNumber = findRowById(sheet, taskId);
  if (rowNumber === -1) return null;
  return getRowAsObject(sheet, rowNumber);
}

/**
 * 全件取得。
 * @returns {Object[]}
 */
function getAllTasks() {
  return getAllRows(getSheet(TASKS_SHEET));
}

/**
 * 未完了タスクのみ取得（is_done=FALSE）。
 * 緊急フラグのあるものを先に並べる。
 * @returns {Object[]}
 */
function getPendingTasks() {
  return getAllTasks()
    .filter(function(row) {
      return row.is_done === false || row.is_done === 'FALSE';
    })
    .sort(function(a, b) {
      var aUrgent = a.is_urgent === true || a.is_urgent === 'TRUE' ? 0 : 1;
      var bUrgent = b.is_urgent === true || b.is_urgent === 'TRUE' ? 0 : 1;
      return aUrgent - bUrgent;
    });
}

// ─── 書き込み ─────────────────────────────────────────────────────────────────

/**
 * タスクを追加する。
 *
 * @param {Object} data
 * @param {string} data.text
 * @param {boolean} [data.is_urgent]  デフォルト false
 * @returns {number} 追加した task_id
 */
function addTask(data) {
  return withLock(function() {
    var sheet = getSheet(TASKS_SHEET);
    var taskId = getNextId(sheet);
    appendRow(sheet, [
      taskId,
      data.text,
      data.is_urgent === true,
      false,
      '',
      nowDateTime(),
    ]);
    return taskId;
  });
}

/**
 * タスクを完了にする。
 * @param {number} taskId
 * @returns {boolean}
 */
function completeTask(taskId) {
  return withLock(function() {
    var sheet = getSheet(TASKS_SHEET);
    var rowNumber = findRowById(sheet, taskId);
    if (rowNumber === -1) return false;
    updateCell(sheet, rowNumber, 'is_done', true);
    updateCell(sheet, rowNumber, 'done_at', nowDateTime());
    return true;
  });
}

/**
 * タスクを未完了に戻す。
 * @param {number} taskId
 * @returns {boolean}
 */
function reopenTask(taskId) {
  return withLock(function() {
    var sheet = getSheet(TASKS_SHEET);
    var rowNumber = findRowById(sheet, taskId);
    if (rowNumber === -1) return false;
    updateCell(sheet, rowNumber, 'is_done', false);
    updateCell(sheet, rowNumber, 'done_at', '');
    return true;
  });
}

/**
 * タスクを削除する（行ごと物理削除）。
 * @param {number} taskId
 * @returns {boolean}
 */
function deleteTask(taskId) {
  return withLock(function() {
    var sheet = getSheet(TASKS_SHEET);
    var rowNumber = findRowById(sheet, taskId);
    if (rowNumber === -1) return false;
    sheet.deleteRow(rowNumber);
    return true;
  });
}

/**
 * タスクを更新する。
 *
 * @param {number} taskId
 * @param {Object} data  更新可能: text, is_urgent
 * @returns {boolean}
 */
function updateTask(taskId, data) {
  return withLock(function() {
    var sheet = getSheet(TASKS_SHEET);
    var rowNumber = findRowById(sheet, taskId);
    if (rowNumber === -1) return false;
    if (data.text !== undefined)      updateCell(sheet, rowNumber, 'text', data.text);
    if (data.is_urgent !== undefined) updateCell(sheet, rowNumber, 'is_urgent', data.is_urgent);
    return true;
  });
}
