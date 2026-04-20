/**
 * availability.js — 空き枠計算ロジック
 *
 * モックアップ（student-booking.html）の getSlotStatus / getEventsForDay と
 * 同一のロジックを GAS / スプレッドシートデータで再現する。
 *
 * 依存する CRUD 関数:
 *   - getActiveZonesByDay(dayOfWeek)         zones.js
 *   - getZoneOverrideByWeekAndDay(...)       zone_overrides.js
 *   - getLessonsByDate(dateStr)              lessons.js
 *   - getBlocksByDate(dateStr, dayOfWeek)    blocks.js
 *
 * スロット単位: 30分（SLOT_DURATION_MIN）
 *
 * 曜日定義: 0=月, 1=火, 2=水, 3=木, 4=金, 5=土, 6=日（設計書に準拠）
 */

var SLOT_DURATION_MIN = 30;

// ─── 時刻ユーティリティ（内部用）────────────────────────────────────────────

/**
 * "HH:MM" → 分（数値）に変換する。
 * @param {string} hhmm
 * @returns {number}
 */
function _timeToMin(hhmm) {
  var parts = String(hhmm).split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/**
 * 分（数値）→ "HH:MM" に変換する。
 * @param {number} minutes
 * @returns {string}
 */
function _minToTime(minutes) {
  var h = Math.floor(minutes / 60);
  var m = minutes % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

// ─── 曜日計算（設計書定義: 0=月〜6=日）──────────────────────────────────────

/**
 * YYYY-MM-DD → 曜日インデックス（0=月〜6=日）を返す。
 * Utilities.formatDate で Asia/Tokyo のまま曜日を取得する。
 *
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {number}  0=月, 1=火, 2=水, 3=木, 4=金, 5=土, 6=日
 */
function _getDayOfWeek(dateStr) {
  var d = new Date(dateStr + 'T00:00:00+09:00');
  // Utilities.formatDate の 'u': ISO 8601 曜日番号（1=月〜7=日）
  var isoDay = parseInt(Utilities.formatDate(d, TZ, 'u'), 10);
  return isoDay - 1; // 1=月→0, 7=日→6
}

// ─── 有効ゾーン取得 ───────────────────────────────────────────────────────────

/**
 * 指定日に有効なゾーン一覧を返す。
 *
 * ロジック:
 *   1. zone_overrides を week_start_date + day_of_week で照合
 *   2. override が存在する場合:
 *      - is_cancelled=TRUE → 空配列（その日のゾーンなし）
 *      - is_cancelled=FALSE → override の start_time/end_time/studio_id で1件返す
 *   3. override がない場合 → zones テンプレートから day_of_week + is_active=TRUE で返す
 *
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {Object[]}  ゾーンオブジェクトの配列（空 = その日はゾーンなし）
 */
function getEffectiveZones(dateStr) {
  var dayOfWeek = _getDayOfWeek(dateStr);
  var weekStart = getWeekStartDate(dateStr);

  var override = getZoneOverrideByWeekAndDay(weekStart, dayOfWeek);
  if (override) {
    if (override.is_cancelled === true || override.is_cancelled === 'TRUE') {
      return [];
    }
    return [{
      zone_id:     override.override_id,
      day_of_week: dayOfWeek,
      start_time:  override.start_time,
      end_time:    override.end_time,
      studio_id:   override.studio_id,
      is_override: true,
    }];
  }

  return getActiveZonesByDay(dayOfWeek);
}

// ─── 占有時間帯取得 ───────────────────────────────────────────────────────────

/**
 * 指定日の占有時間帯（レッスン + ブロック）を返す。
 * キャンセル済みレッスン（status='cancelled'）は除外する。
 *
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {Array<{
 *   type: 'lesson'|'block',
 *   start_time: string,
 *   end_time: string,
 *   studio_id?: string,
 *   lesson_id?: number,
 *   student_id?: number,
 *   label?: string,
 * }>}
 */
function getOccupiedPeriods(dateStr) {
  var dayOfWeek = _getDayOfWeek(dateStr);

  var lessons = getLessonsByDate(dateStr)
    .filter(function(l) { return l.status !== 'cancelled'; })
    .map(function(l) {
      return {
        type:       'lesson',
        start_time: l.start_time,
        end_time:   l.end_time,
        studio_id:  l.studio_id,
        lesson_id:  l.lesson_id,
        student_id: l.student_id,
      };
    });

  var blocks = getBlocksByDate(dateStr, dayOfWeek).map(function(b) {
    return {
      type:       'block',
      start_time: b.start_time,
      end_time:   b.end_time,
      label:      b.label,
    };
  });

  return lessons.concat(blocks);
}

// ─── 単一スロット空き確認 ────────────────────────────────────────────────────

/**
 * 指定日・開始時刻・終了時刻のスロットが予約可能かどうかを返す。
 * LIFF から「この時間を予約したい」と送られてきた時刻の検証に使う。
 *
 * @param {string} dateStr    YYYY-MM-DD
 * @param {string} startTime  HH:MM
 * @param {string} endTime    HH:MM
 * @returns {{
 *   available: boolean,
 *   studio_id?: string,
 *   reason?: 'no-zone'|'lesson'|'block',
 *   conflictWith?: Object,
 * }}
 */
function isSlotAvailable(dateStr, startTime, endTime) {
  var slotStart = _timeToMin(startTime);
  var slotEnd   = _timeToMin(endTime);

  // ゾーン内に収まるかチェック
  var zones = getEffectiveZones(dateStr);
  var zone  = null;
  for (var i = 0; i < zones.length; i++) {
    var z = zones[i];
    if (_timeToMin(z.start_time) <= slotStart && _timeToMin(z.end_time) >= slotEnd) {
      zone = z;
      break;
    }
  }
  if (!zone) return { available: false, reason: 'no-zone' };

  // 既存レッスン・ブロックとの重複チェック
  var occupied = getOccupiedPeriods(dateStr);
  for (var j = 0; j < occupied.length; j++) {
    var o       = occupied[j];
    var oStart  = _timeToMin(o.start_time);
    var oEnd    = _timeToMin(o.end_time);
    // 重複判定: oStart < slotEnd && oEnd > slotStart
    if (oStart < slotEnd && oEnd > slotStart) {
      return { available: false, reason: o.type, conflictWith: o };
    }
  }

  return { available: true, studio_id: zone.studio_id };
}

// ─── 日次空き枠一覧 ───────────────────────────────────────────────────────────

/**
 * 指定日の全スロット一覧を返す（LIFF の日次スロット表示用）。
 *
 * ゾーン内の全時間を SLOT_DURATION_MIN（30分）単位で分割し、
 * 各スロットの空き状況を付与して返す。
 *
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {{
 *   date:        string,
 *   day_of_week: number,
 *   zones:       Object[],
 *   occupied:    Object[],
 *   slots: Array<{
 *     start_time:  string,
 *     end_time:    string,
 *     studio_id:   string,
 *     available:   boolean,
 *     reason?:     string,
 *   }>,
 * }}
 */
function getAvailability(dateStr) {
  var dayOfWeek = _getDayOfWeek(dateStr);
  var zones     = getEffectiveZones(dateStr);
  var occupied  = getOccupiedPeriods(dateStr);

  // occupied の時刻を分単位にキャッシュして毎スロットの再変換を避ける
  var occupiedMin = occupied.map(function(o) {
    return {
      start: _timeToMin(o.start_time),
      end:   _timeToMin(o.end_time),
      ref:   o,
    };
  });

  var slots = [];
  zones.forEach(function(zone) {
    var zoneEnd = _timeToMin(zone.end_time);
    var cursor  = _timeToMin(zone.start_time);

    while (cursor + SLOT_DURATION_MIN <= zoneEnd) {
      var slotEnd  = cursor + SLOT_DURATION_MIN;
      var conflict = null;

      for (var i = 0; i < occupiedMin.length; i++) {
        var o = occupiedMin[i];
        if (o.start < slotEnd && o.end > cursor) {
          conflict = o.ref;
          break;
        }
      }

      slots.push({
        start_time: _minToTime(cursor),
        end_time:   _minToTime(slotEnd),
        studio_id:  zone.studio_id,
        available:  !conflict,
        reason:     conflict ? conflict.type : null,
      });

      cursor += SLOT_DURATION_MIN;
    }
  });

  return {
    date:        dateStr,
    day_of_week: dayOfWeek,
    zones:       zones,
    occupied:    occupied,
    slots:       slots,
  };
}

// ─── 週間サマリー ─────────────────────────────────────────────────────────────

/**
 * 週間の空き枠サマリーを返す（LIFF の週カレンダー表示用）。
 * 各日の空き枠数のみを返す軽量バージョン。
 * スプレッドシートアクセスが 7日 × (zones + lessons + blocks) 回発生するため、
 * キャッシュが必要な場合は呼び出し側でまとめて処理すること。
 *
 * @param {string} weekStartDate  YYYY-MM-DD（月曜日の日付）
 * @returns {Array<{
 *   date:            string,
 *   day_of_week:     number,
 *   available_count: number,
 * }>}
 */
function getWeekAvailabilitySummary(weekStartDate) {
  var result = [];
  var base = new Date(weekStartDate + 'T00:00:00+09:00');

  for (var i = 0; i < 7; i++) {
    var d = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    var dateStr = formatDate(d);
    var avail   = getAvailability(dateStr);
    result.push({
      date:            dateStr,
      day_of_week:     i,
      available_count: avail.slots.filter(function(s) { return s.available; }).length,
    });
  }

  return result;
}

// ─── 予約リクエスト受信時のバリデーション ────────────────────────────────────

/**
 * 予約リクエストの内容がシステム上予約可能かを検証する。
 * addBookingRequest の前に呼んで、不正なリクエストを弾く。
 *
 * @param {Object} data
 * @param {string} data.requested_date   YYYY-MM-DD
 * @param {string} data.requested_start  HH:MM
 * @param {string} data.requested_end    HH:MM
 * @param {string} data.studio_id
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateBookingRequest(data) {
  var startMin = _timeToMin(data.requested_start);
  var endMin   = _timeToMin(data.requested_end);

  if (startMin >= endMin) {
    return { valid: false, reason: '開始時刻は終了時刻より前である必要があります。' };
  }
  if ((endMin - startMin) % SLOT_DURATION_MIN !== 0) {
    return { valid: false, reason: 'レッスン時間は' + SLOT_DURATION_MIN + '分単位で指定してください。' };
  }

  // 各 30分スロットが空いているかチェック
  var cursor = startMin;
  while (cursor < endMin) {
    var slotStart = _minToTime(cursor);
    var slotEnd   = _minToTime(cursor + SLOT_DURATION_MIN);
    var check     = isSlotAvailable(data.requested_date, slotStart, slotEnd);
    if (!check.available) {
      return { valid: false, reason: slotStart + '〜' + slotEnd + ' は予約不可です（' + check.reason + '）' };
    }
    // studio_id の整合性チェック
    if (check.studio_id !== data.studio_id) {
      return {
        valid: false,
        reason: slotStart + ' のスタジオ（' + check.studio_id + '）とリクエストのスタジオ（' + data.studio_id + '）が一致しません。',
      };
    }
    cursor += SLOT_DURATION_MIN;
  }

  return { valid: true };
}
