# スプレッドシート設計書（Phase 2）

> SSoT（Single Source of Truth）として Google スプレッドシートを使う。  
> GAS がここを読み書きし、LIFF 画面はすべて GAS 経由でデータを参照する。

---

## 全シート一覧

| # | シート名 | 役割 | 主な操作 |
|---|----------|------|---------|
| 1 | `studios` | スタジオ拠点マスタ | 参照のみ |
| 2 | `zones` | スタジオ在籍時間帯テンプレート（週繰り返し） | 読み書き |
| 3 | `zone_overrides` | 週別のゾーン特別設定 | 読み書き |
| 4 | `students` | 生徒マスタ | 読み書き |
| 5 | `ticket_types` | チケット種別マスタ（管理者のみ編集） | 参照のみ |
| 6 | `lessons` | レッスン予定（単発） | 読み書き |
| 7 | `blocks` | ブロック予定（移動・休憩など） | 読み書き |
| 8 | `booking_requests` | 生徒側からの予約リクエスト | 読み書き |
| 9 | `lesson_memos` | レッスンメモ・次回目標履歴 | 読み書き |
| 10 | `tasks` | タスク（TODO） | 読み書き |
| 11 | `sales` | 売上記録 | 読み書き |
| 12 | `notifications` | LINE通知送信履歴 | 読み書き |

---

## 各シート詳細

---

### 1. `studios` — スタジオ拠点マスタ

変更頻度：ほぼなし。拠点追加時のみ編集。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `studio_id` | TEXT (PK) | `saito` | 一意の識別子（英数字） |
| B | `short_name` | TEXT | `齊藤DG` | 画面表示用の略称 |
| C | `full_name` | TEXT | `齊藤ダンスガーデン` | 正式名称 |
| D | `color_style` | TEXT | `lime` | UI カラートークン（lime/orange/blue） |
| E | `note` | TEXT | `` | 備考 |

**初期データ:**

```
saito   | 齊藤DG | 齊藤ダンスガーデン        | lime
sendai  | 仙台SS | 仙台サテライトスタジオ    | orange
izumi   | 泉中央 | 泉中央レンタルスペース    | blue
```

---

### 2. `zones` — スタジオ在籍テンプレート（週繰り返し）

「毎週この曜日・この時間帯はこのスタジオにいる」というベーステンプレート。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `zone_id` | TEXT (PK) | `z001` | 一意のID（z + 連番） |
| B | `day_of_week` | INTEGER | `2` | 0=月, 1=火, …, 6=日 |
| C | `start_time` | TEXT (HH:MM) | `09:00` | 開始時刻 |
| D | `end_time` | TEXT (HH:MM) | `11:30` | 終了時刻 |
| E | `studio_id` | TEXT (FK→studios) | `saito` | スタジオ識別子 |
| F | `is_active` | BOOLEAN | `TRUE` | 有効/無効フラグ |
| G | `updated_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-08 10:00` | 最終更新日時 |

**制約:**
- 同一 `day_of_week` で時間帯が重複しないこと（GAS 側でバリデーション）
- `start_time` < `end_time`（文字列比較で成立する HH:MM 形式）

---

### 3. `zone_overrides` — 週別ゾーン特別設定

特定の週だけゾーンが異なる場合（休み・スタジオ変更など）に使用。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `override_id` | TEXT (PK) | `ov001` | 一意のID |
| B | `week_start_date` | TEXT (YYYY-MM-DD) | `2026-04-14` | その週の月曜日の日付（週を特定するキー） |
| C | `day_of_week` | INTEGER | `0` | 0=月〜6=日 |
| D | `start_time` | TEXT (HH:MM) | `10:00` | 開始時刻（`is_cancelled=TRUE` の場合は空欄可） |
| E | `end_time` | TEXT (HH:MM) | `13:00` | 終了時刻（`is_cancelled=TRUE` の場合は空欄可） |
| F | `studio_id` | TEXT (FK→studios) | `saito` | スタジオ識別子（`is_cancelled=TRUE` の場合は空欄可） |
| G | `note` | TEXT | `振替` | 理由・備考 |
| H | `is_cancelled` | BOOLEAN | `FALSE` | `TRUE` の場合、その週・その曜日のゾーンをすべて無効化する |
| I | `created_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-08 10:00` | 作成日時 |

**補足:**
- ある週に `zone_overrides` のレコードが存在する曜日は、`zones` テンプレートの代わりにこちらを使う（差分ではなく完全置換）
- `is_cancelled=TRUE` の場合はその曜日のゾーンをすべて消し、空き枠なしとして扱う（長期休暇・祝日の設定に使用）
- `is_cancelled=FALSE` の場合は `start_time`・`end_time`・`studio_id` で新しいゾーンを定義する

---

### 4. `students` — 生徒マスタ

**スコープ:** `is_active` はアーカイブフラグとして使用。退会処理フロー（チケット返金など）はこのツールの対象外。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `student_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `name` | TEXT | `田中 花子` | 氏名 |
| C | `furigana` | TEXT | `タナカ ハナコ` | ふりがな（カタカナ） |
| D | `line_user_id` | TEXT | `Uxxxxxxxx` | LINE ユーザーID（LIFF連携後に設定） |
| E | `since` | TEXT | `2024年3月` | 入会時期 |
| F | `ticket_type_id` | TEXT (FK→ticket_types) | `bundle5` | 現在のチケット種別（管理者のみ変更可） |
| G | `dances` | TEXT | `ワルツ・タンゴ` | 習っている種目（カンマ区切り可） |
| H | `color_style` | TEXT | `lime` | UI カラートークン |
| I | `last_lesson_date` | TEXT (YYYY-MM-DD) | `2026-04-08` | 最終レッスン日（GAS が自動更新する派生データ） |
| J | `is_active` | BOOLEAN | `TRUE` | 在籍中フラグ（FALSE=アーカイブ、一覧から非表示） |
| K | `note` | TEXT | `` | 管理者向け備考 |
| L | `created_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-08 10:00` | 登録日時 |
| M | `updated_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-08 10:00` | 最終更新日時 |

**`last_lesson_date` の更新ルール:**
- GAS が自動更新する派生データ。手動での変更は不要
- `lessons` テーブルで `student_id` が一致し `status='confirmed'` かつ `lesson_date` が最大のレコードの日付をセットする
- レッスン追加・ステータス変更・キャンセル時に GAS が自動で再計算する

---

### 5. `ticket_types` — チケット種別マスタ

変更頻度：ほぼなし。新種別追加時のみ**管理者が直接編集**する。生徒からの変更不可。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `ticket_type_id` | TEXT (PK) | `bundle5` | 一意のID |
| B | `label` | TEXT | `5枚` | 表示ラベル |
| C | `color_hex` | TEXT | `#6d28d9` | 文字色 |
| D | `bg_hex` | TEXT | `#ede9fe` | 背景色 |
| E | `count` | INTEGER | `5` | 枚数（単発=1, パスポート=-1=無制限） |
| F | `note` | TEXT | `` | 備考 |

**初期データ:**

```
single   | 単発        | #4b5563 | #f3f4f6 |  1
bundle3  | 3枚         | #1d4ed8 | #dbeafe |  3
bundle5  | 5枚         | #6d28d9 | #ede9fe |  5
bundle10 | 10枚        | #065f46 | #d1fae5 | 10
bundle20 | 20枚        | #9a3412 | #ffedd5 | 20
passport | パスポート  | #1e3a5f | #bfdbfe | -1
nsp      | NSP         | #4c1d95 | #ddd6fe | -1
beginner | 初心者      | #713f12 | #fef3c7 |  1
```

**スコープ:** チケット残枚数の管理はこのツールの対象外。将来のチケット管理ツール（Phase 5〜）が担当する。

---

### 6. `lessons` — レッスン予定

1 件 = 1 レッスン枠。単発（特定日付）で管理する。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `lesson_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `lesson_date` | TEXT (YYYY-MM-DD) | `2026-04-09` | レッスン日 |
| C | `start_time` | TEXT (HH:MM) | `09:00` | 開始時刻 |
| D | `end_time` | TEXT (HH:MM) | `10:00` | 終了時刻 |
| E | `student_id` | INTEGER (FK→students) | `1` | 生徒ID |
| F | `studio_id` | TEXT (FK→studios) | `saito` | スタジオID |
| G | `level` | TEXT | `初級` | レベル（初級/中級/上級） |
| H | `lesson_count` | INTEGER | `1` | 予定コマ数（実際の予定値を保持。キャンセル時も変更しない） |
| I | `booking_request_id` | INTEGER (FK→booking_requests) | `3` | 予約リクエスト由来の場合にセット（NULL可） |
| J | `status` | TEXT | `confirmed` | `pending` / `confirmed` / `cancelled`（下記状態遷移参照） |
| K | `note` | TEXT | `` | 備考 |
| L | `created_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-08 10:00` | 作成日時 |
| M | `updated_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-08 10:00` | 最終更新日時 |

**`status` 状態遷移:**

```
pending ──→ confirmed  （管理者が確定操作）
confirmed ──→ cancelled（管理者がキャンセル操作）
```

| status | 意味 | チケット計上 |
|--------|------|------------|
| `pending` | 承認済みだが未確定（将来の予約確定フロー用） | しない |
| `confirmed` | レッスン確定 | する（将来チケット管理ツールが参照） |
| `cancelled` | キャンセル済み | しない |

**キャンセルの扱い:**
- キャンセルは `status='cancelled'` のみで表現する
- `lesson_count` はキャンセル時も**変更しない**（予定していたコマ数を記録として保持）

---

### 7. `blocks` — ブロック予定

移動・昼休憩・プライベートなど、レッスン以外の時間枠。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `block_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `label` | TEXT | `移動` | ブロック名 |
| C | `sub_label` | TEXT | `仙台SS → 齊藤DG` | サブラベル（経路など） |
| D | `day_of_week` | INTEGER | `1` | 0=月〜6=日（繰り返しの基準曜日） |
| E | `start_time` | TEXT (HH:MM) | `12:00` | 開始時刻 |
| F | `end_time` | TEXT (HH:MM) | `12:30` | 終了時刻 |
| G | `is_recurring` | BOOLEAN | `FALSE` | 毎週繰り返すか |
| H | `specific_date` | TEXT (YYYY-MM-DD) | `` | 単発の場合の日付（`is_recurring=FALSE` の場合に必須、`TRUE` の場合は空欄） |
| I | `is_active` | BOOLEAN | `TRUE` | 有効フラグ |
| J | `created_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-08 10:00` | 作成日時 |

**補足:**
- `is_recurring=TRUE` の場合：`day_of_week` で毎週適用。`specific_date` は空欄
- `is_recurring=FALSE` の場合：`specific_date` で特定の1日のみ適用。`day_of_week` は `specific_date` から導出するため参考値

---

### 8. `booking_requests` — 予約リクエスト

生徒側 LIFF から送られてくるリクエスト。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `request_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `requested_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-08 10:32` | リクエスト送信日時 |
| C | `expires_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-10 10:32` | 有効期限（送信から48時間後。期限超過で自動的に `expired` に遷移） |
| D | `student_id` | INTEGER (FK→students) | `1` | 生徒ID（LINE IDで特定、NULL=未登録） |
| E | `student_name_input` | TEXT | `田中 花子` | 生徒が入力した名前 |
| F | `requested_date` | TEXT (YYYY-MM-DD) | `2026-04-09` | 希望日 |
| G | `requested_start` | TEXT (HH:MM) | `10:00` | 希望開始時刻 |
| H | `requested_end` | TEXT (HH:MM) | `10:30` | 希望終了時刻 |
| I | `studio_id` | TEXT (FK→studios) | `saito` | 希望スタジオ |
| J | `status` | TEXT | `pending` | 下記状態遷移参照 |
| K | `approved_lesson_id` | INTEGER (FK→lessons) | `` | 承認時に作成されたレッスンID（NULL可） |
| L | `approved_at` | TEXT (YYYY-MM-DD HH:MM) | `` | 承認日時（NULL可） |
| M | `note` | TEXT | `` | 管理者メモ |
| N | `line_user_id` | TEXT | `Uxxxxxxxx` | リクエスト元の LINE ユーザーID |

**`status` 状態遷移:**

```
pending ──→ processing ──→ approved
                       └──→ rejected
                       └──→ error（GASエラー時。再承認操作で pending に戻す）
pending ──→ expired（48時間経過でGASタイマーが自動遷移）
```

| status | 意味 |
|--------|------|
| `pending` | 承認待ち |
| `processing` | 承認処理中（GASが書き込み中。二重操作防止） |
| `approved` | 承認済み・レッスン確定 |
| `rejected` | 却下 |
| `expired` | 期限切れ（GASタイマーが自動遷移） |
| `error` | 処理失敗（GASがエラー終了した場合） |

**未登録生徒フロー（`student_id=NULL` の場合）:**
- 管理者が `student_name_input` を確認し、手動で `students` マスタに登録
- 登録後に `student_id` をセットして承認操作を行う
- Phase 4（LINE LIFF連携）以降は `line_user_id` による自動紐付けに移行する

---

### 9. `lesson_memos` — レッスンメモ・次回目標

生徒ごと・日付ごとのメモ履歴。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `memo_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `student_id` | INTEGER (FK→students) | `1` | 生徒ID |
| C | `lesson_id` | INTEGER (FK→lessons) | `1` | 対応するレッスンID（NULL可） |
| D | `lesson_date` | TEXT (YYYY-MM-DD) | `2026-04-08` | レッスン日 |
| E | `memo` | TEXT | `ワルツのナチュラルターンで軸がブレる。` | レッスンメモ（本文） |
| F | `goal` | TEXT | `ナチュラルターンの軸固め。` | 次回目標 |
| G | `created_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-08 22:00` | 作成日時 |
| H | `updated_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-08 22:00` | 最終更新日時 |

---

### 10. `tasks` — タスク（TODO）

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `task_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `text` | TEXT | `山田さんの5月大会エントリー確認` | タスク内容 |
| C | `is_urgent` | BOOLEAN | `TRUE` | 緊急フラグ |
| D | `is_done` | BOOLEAN | `FALSE` | 完了フラグ |
| E | `done_at` | TEXT (YYYY-MM-DD HH:MM) | `` | 完了日時（NULL可） |
| F | `created_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-08 10:00` | 作成日時 |

---

### 11. `sales` — 売上記録

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `sale_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `sale_date` | TEXT (YYYY-MM-DD) | `2026-04-08` | 売上日 |
| C | `student_id` | INTEGER (FK→students) | `1` | 生徒ID（NULL可：現金等の場合） |
| D | `student_name` | TEXT | `田中 花子` | 生徒名（`student_id` が NULL の場合の補完用） |
| E | `amount` | INTEGER | `5000` | 金額（円、税込） |
| F | `type` | TEXT | `lesson` | 売上種別：`lesson`（レッスン都度払い）/ `ticket_purchase`（チケット購入）/ `other`（その他） |
| G | `payment_status` | TEXT | `paid` | 支払い状況：`paid`（支払い済み）/ `unpaid`（未払い） |
| H | `memo` | TEXT | `月謝` | 備考（支払い方法・種別など） |
| I | `lesson_id` | INTEGER (FK→lessons) | `` | 紐づくレッスンID（NULL可） |
| J | `created_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-08 10:00` | 作成日時 |

---

### 12. `notifications` — LINE通知送信履歴

LINE Messaging API での通知結果を記録する。二重送信防止・失敗時の再送に使用。  
将来のチケット管理ツールからの通知も同じシートで一元管理する。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `notification_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `student_id` | INTEGER (FK→students) | `1` | 通知対象の生徒ID |
| C | `line_user_id` | TEXT | `Uxxxxxxxx` | 通知先 LINE ユーザーID |
| D | `type` | TEXT | `booking_approved` | 通知種別（下記参照） |
| E | `related_id` | INTEGER | `3` | 関連するレコードのID（`booking_requests.request_id` など） |
| F | `sent_at` | TEXT (YYYY-MM-DD HH:MM) | `2026-04-08 11:00` | 送信日時 |
| G | `status` | TEXT | `sent` | `sent`（送信成功）/ `failed`（送信失敗） |

**`type` の値:**

| type | 説明 |
|------|------|
| `booking_approved` | 予約リクエスト承認通知 |
| `booking_rejected` | 予約リクエスト却下通知 |
| `booking_expired` | 予約リクエスト期限切れ通知 |
| `lesson_cancelled` | レッスンキャンセル通知 |
| `ticket_updated` | チケット残枚数変更通知（将来のチケット管理ツールが使用） |

---

## 予約フロー仕様

### 予約リクエスト〜レッスン確定フロー

```
[生徒 LIFF]
  → 空き枠を確認（GASが zones + zone_overrides + lessons + blocks を読んで計算）
  → 空き枠をタップして予約リクエスト送信

[GAS - doPost]
  1. LINE IDトークンを検証（verify エンドポイント）
  2. LockService.getScriptLock() を取得
  3. booking_requests に追加（status='pending', expires_at=送信+48h）
  4. LockService を解放
  5. 管理者に LINE 通知を送信

[管理者]
  → 承認操作

[GAS - 承認処理]
  1. LockService.getScriptLock() を取得
  2. booking_requests.status を 'processing' に更新
  3. 同日時・同スタジオで status='confirmed' な lessons が存在しないかチェック
     → 存在する場合：status='rejected' にして終了（重複承認防止）
  4. lessons に新規レコード追加
  5. booking_requests.approved_lesson_id をセット
  6. booking_requests.status を 'approved' に、approved_at を現在日時にセット
  7. students.last_lesson_date を再計算・更新
  8. LockService を解放
  9. 生徒に承認通知を送信（notifications に記録）

エラー時: status を 'error' に更新して終了。管理者が再操作可能。
```

### 重複予約防止ルール

承認処理 GAS は以下の条件で承認を拒否する：
- **同じ `lesson_date` + `start_time` + `studio_id`** で `status='confirmed'` な `lessons` レコードが存在する場合

この確認と書き込みは `LockService.getScriptLock()` の中でアトミックに実行する。

---

## エンティティ関係図（概略）

```
studios ──────────────────────────────┐
  │                                   │
  ├── zones (曜日ごとのテンプレート)   │
  │     └── zone_overrides            │
  │          (週別上書き / is_cancelled)│
  │                                   │
  └── lessons ←── booking_requests ←── [生徒LIFF]
        │  └── lesson_memos           │
        │                             │
students ────┤             notifications ←─ (booking / lesson イベント)
  └── ticket_types (管理者のみ編集)

tasks   (独立)
sales ──── students (任意)
blocks  (独立、ゾーン内に表示)
```

---

## GAS 実装上の注意

### 1. TIME / DATE 型はテキストで保存する

Google スプレッドシートの `getValues()` は TIME/DATE 型セルを JavaScript の `Date` オブジェクト（1899-12-30 基準のエポック）として返す。これを避けるため、**全シートの時刻・日付セルのフォーマットは「書式なしテキスト（Plain text）」に統一する**。

```javascript
// GAS 内での日時整形（必ずこれを使う）
Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm")
Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd")
Utilities.formatDate(new Date(), "Asia/Tokyo", "HH:mm")

// NG：UTC変換で日付がずれる
new Date("2026-04-09").toISOString()  // 使用禁止
```

スプレッドシートのタイムゾーン設定は必ず `Asia/Tokyo` に固定すること（ファイル → 設定 → タイムゾーン）。

### 2. PK 採番と排他制御（LockService）

スプレッドシートには `AUTO_INCREMENT` がないため、全書き込み処理で `LockService.getScriptLock()` による排他制御を必須とする。

**排他制御が必要なシート（書き込み全操作）:**
- `booking_requests`（複数生徒の同時送信）
- `lessons`（承認フローでの追加）
- `students`（last_lesson_date の更新含む）
- `sales`
- `tasks`
- `lesson_memos`
- `notifications`

```javascript
// 必須パターン
const lock = LockService.getScriptLock();
lock.waitLock(10000);
try {
  // 読み込み → 処理 → 書き込み をここに書く
} finally {
  lock.releaseLock();
}
```

### 3. LINE ID トークンの検証

LIFF から GAS Web API を呼ぶ際、クライアントが送信する `line_user_id` を直接信頼してはならない。`idToken` を GAS に送り、LINE Login の verify エンドポイントで検証した `sub` フィールドの値のみを `line_user_id` として採用する。

```
検証エンドポイント: https://api.line.me/oauth2/v2.1/verify
パラメータ: id_token=<クライアントから受け取ったトークン>&client_id=<チャネルID>
レスポンスの sub フィールド = 正規の line_user_id
```

---

## 設計上の判断メモ

### レッスンは単発管理
- 「毎週このレッスン」という繰り返しはしない
- 週ごとに GAS が `zones` を読んで「空き枠」を計算し、予約リクエストが承認されたら `lessons` に1件追加する

### ゾーンは2層構造
- `zones` = 毎週繰り返すベーステンプレート
- `zone_overrides` = 特定の週だけ異なる場合（完全置換）。`is_cancelled=TRUE` でゾーンを消すことも可能
- モックの `_weekZoneOverrides` ロジックをそのまま踏襲

### 売上の生徒名冗長化
- `student_id` が NULL の場合でも記録できるよう `student_name` 列を持つ
- 将来的に生徒をアーカイブしても売上履歴が残る

### LINE ユーザーID の扱い
- `students.line_user_id` は Phase 4（LIFF連携）で確定する
- Phase 3 時点では NULL のまま運用可能

### チケット管理のスコープ
- チケット残枚数の計算・消費・購入フローはこのツールの対象外
- 将来のチケット管理ツール（Phase 5〜）が担当する
- `students.ticket_type_id` は種別の表示のみに使用する

### is_active（アーカイブ）
- 退会処理フロー（チケット返金・自動キャンセルなど）は実装しない
- `is_active=FALSE` にするだけで生徒一覧から非表示にする「アーカイブ機能」として使う

---

## 将来追加予定シート（チケット管理ツール Phase 5〜）

> 以下のシートは**現在のスプレッドシートに追加するだけ**で今のツールと連携できる設計にしている。

### `student_tickets` — 生徒ごとのチケット残枚数

| 列 | カラム名 | 型 | 説明 |
|----|----------|----|------|
| A | `student_id` | INTEGER (FK→students) | 生徒ID（1行1生徒） |
| B | `remaining` | INTEGER | 現在の残り枚数 |
| C | `updated_at` | TEXT (YYYY-MM-DD HH:MM) | 最終更新日時 |

### `ticket_logs` — チケット増減履歴

| 列 | カラム名 | 型 | 説明 |
|----|----------|----|------|
| A | `log_id` | INTEGER (PK) | 自動採番 |
| B | `student_id` | INTEGER (FK→students) | 生徒ID |
| C | `change` | INTEGER | 増減値（+5=購入、-1=消費など） |
| D | `reason` | TEXT | 理由：`purchase`（購入）/ `lesson`（レッスン消費）/ `adjustment`（手動調整） |
| E | `note` | TEXT | 備考 |
| F | `lesson_id` | INTEGER (FK→lessons, NULL可) | レッスン消費の場合に紐付け |
| G | `notified_at` | TEXT (YYYY-MM-DD HH:MM) | 生徒への LINE 通知送信日時（NULL=未送信） |
| H | `created_at` | TEXT (YYYY-MM-DD HH:MM) | 作成日時 |

**チケット管理ツールの想定機能:**
- 生徒側 LIFF：残り枚数の確認（購入リクエストは不要）
- 管理者：残枚数の確認・増減操作・年内レッスン受講回数の確認
- 増減時に生徒へ LINE 自動通知（`notifications` シートに記録）
- 受講回数は `lessons` シートの `status='confirmed'` を集計して算出

---

## 次のステップ（Phase 3 に向けて）

- [ ] 実際の Google スプレッドシートを作成し、上記12シートと列を作る（セルフォーマットは「書式なしテキスト」に統一）
- [ ] スプレッドシートのタイムゾーンを `Asia/Tokyo` に設定する
- [ ] GAS プロジェクトを作成し `appsscript.json` を設置
- [ ] 日時ユーティリティ関数（`Utilities.formatDate` ラッパー）を最初に実装する
- [ ] 各シートを操作するライブラリ関数（CRUD）を実装
- [ ] `zones` → 空き枠計算ロジックを GAS で再現（モックの `getSlotStatus()` 相当）
- [ ] 予約リクエスト受信 → 管理者 LINE 通知の実装
- [ ] GASタイマー（時間ベーストリガー）で `booking_requests` の期限切れ処理を実装
