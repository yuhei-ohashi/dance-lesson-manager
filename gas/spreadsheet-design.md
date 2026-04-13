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
| 5 | `ticket_types` | チケット種別マスタ | 参照のみ |
| 6 | `lessons` | レッスン予定（単発） | 読み書き |
| 7 | `blocks` | ブロック予定（移動・休憩など） | 読み書き |
| 8 | `booking_requests` | 生徒側からの予約リクエスト | 読み書き |
| 9 | `lesson_memos` | レッスンメモ・次回目標履歴 | 読み書き |
| 10 | `tasks` | タスク（TODO） | 読み書き |
| 11 | `sales` | 売上記録 | 読み書き |

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
| C | `start_time` | TIME | `09:00` | 開始時刻（HH:MM） |
| D | `end_time` | TIME | `11:30` | 終了時刻（HH:MM） |
| E | `studio_id` | TEXT (FK→studios) | `saito` | スタジオ識別子 |
| F | `is_active` | BOOLEAN | `TRUE` | 有効/無効フラグ |
| G | `updated_at` | DATETIME | `2026-04-08 10:00` | 最終更新日時 |

**制約:**
- 同一 `day_of_week` で時間帯が重複しないこと（GAS 側でバリデーション）
- `start_time` < `end_time`

---

### 3. `zone_overrides` — 週別ゾーン特別設定

特定の週だけゾーンが異なる場合（休み・スタジオ変更など）に使用。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `override_id` | TEXT (PK) | `ov001` | 一意のID |
| B | `week_start_date` | DATE | `2026-04-14` | その週の月曜日の日付（週を特定するキー） |
| C | `day_of_week` | INTEGER | `0` | 0=月〜6=日 |
| D | `start_time` | TIME | `10:00` | 開始時刻 |
| E | `end_time` | TIME | `13:00` | 終了時刻 |
| F | `studio_id` | TEXT (FK→studios) | `saito` | スタジオ識別子 |
| G | `note` | TEXT | `振替` | 理由・備考 |
| H | `created_at` | DATETIME | `2026-04-08 10:00` | 作成日時 |

**補足:** ある週に `zone_overrides` のレコードが存在する曜日は、`zones` テンプレートの代わりにこちらを使う（差分ではなく完全置換）。

---

### 4. `students` — 生徒マスタ

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `student_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `name` | TEXT | `田中 花子` | 氏名 |
| C | `furigana` | TEXT | `タナカ ハナコ` | ふりがな（カタカナ） |
| D | `line_user_id` | TEXT | `Uxxxxxxxx` | LINE ユーザーID（LIFF連携後に設定） |
| E | `since` | TEXT | `2024年3月` | 入会時期 |
| F | `ticket_type_id` | TEXT (FK→ticket_types) | `bundle5` | 現在のチケット種別 |
| G | `dances` | TEXT | `ワルツ・タンゴ` | 習っている種目（カンマ区切り可） |
| H | `color_style` | TEXT | `lime` | UI カラートークン |
| I | `last_lesson_date` | DATE | `2026-04-08` | 最終レッスン日 |
| J | `is_active` | BOOLEAN | `TRUE` | 在籍中フラグ |
| K | `note` | TEXT | `` | 管理者向け備考 |
| L | `created_at` | DATETIME | `2026-04-08 10:00` | 登録日時 |
| M | `updated_at` | DATETIME | `2026-04-08 10:00` | 最終更新日時 |

---

### 5. `ticket_types` — チケット種別マスタ

変更頻度：ほぼなし。新種別追加時のみ編集。

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

---

### 6. `lessons` — レッスン予定

1 件 = 1 レッスン枠。単発（特定日付）で管理する。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `lesson_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `lesson_date` | DATE | `2026-04-09` | レッスン日（YYYY-MM-DD） |
| C | `start_time` | TIME | `09:00` | 開始時刻 |
| D | `end_time` | TIME | `10:00` | 終了時刻 |
| E | `student_id` | INTEGER (FK→students) | `1` | 生徒ID |
| F | `studio_id` | TEXT (FK→studios) | `saito` | スタジオID |
| G | `level` | TEXT | `初級` | レベル（初級/中級/上級） |
| H | `lesson_count` | INTEGER | `1` | 消費コマ数（0=キャンセル） |
| I | `booking_request_id` | INTEGER (FK→booking_requests) | `3` | 予約リクエスト由来の場合にセット（NULL可） |
| J | `status` | TEXT | `confirmed` | `confirmed` / `cancelled` / `pending` |
| K | `note` | TEXT | `` | 備考 |
| L | `created_at` | DATETIME | `2026-04-08 10:00` | 作成日時 |
| M | `updated_at` | DATETIME | `2026-04-08 10:00` | 最終更新日時 |

---

### 7. `blocks` — ブロック予定

移動・昼休憩・プライベートなど、レッスン以外の時間枠。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `block_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `label` | TEXT | `移動` | ブロック名 |
| C | `sub_label` | TEXT | `仙台SS → 齊藤DG` | サブラベル（経路など） |
| D | `day_of_week` | INTEGER | `1` | 0=月〜6=日（繰り返しの基準曜日） |
| E | `start_time` | TIME | `12:00` | 開始時刻 |
| F | `end_time` | TIME | `12:30` | 終了時刻 |
| G | `is_recurring` | BOOLEAN | `FALSE` | 毎週繰り返すか |
| H | `specific_date` | DATE | `` | 単発の場合の日付（NULL可）。`is_recurring=FALSE` の場合に使用 |
| I | `is_active` | BOOLEAN | `TRUE` | 有効フラグ |
| J | `created_at` | DATETIME | `2026-04-08 10:00` | 作成日時 |

**補足:** `is_recurring=TRUE` の場合は `day_of_week` で毎週適用。`is_recurring=FALSE` の場合は `specific_date` + `day_of_week` の組み合わせで特定の1日のみ適用。

---

### 8. `booking_requests` — 予約リクエスト

生徒側 LIFF から送られてくるリクエスト。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `request_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `requested_at` | DATETIME | `2026-04-08 10:32` | リクエスト送信日時 |
| C | `student_id` | INTEGER (FK→students) | `1` | 生徒ID（LINE IDで特定、NULL=未登録） |
| D | `student_name_input` | TEXT | `田中 花子` | 生徒が入力した名前 |
| E | `requested_date` | DATE | `2026-04-09` | 希望日 |
| F | `requested_start` | TIME | `10:00` | 希望開始時刻 |
| G | `requested_end` | TIME | `10:30` | 希望終了時刻 |
| H | `studio_id` | TEXT (FK→studios) | `saito` | 希望スタジオ |
| I | `status` | TEXT | `pending` | `pending` / `approved` / `rejected` |
| J | `approved_lesson_id` | INTEGER (FK→lessons) | `` | 承認時に作成されたレッスンID（NULL可） |
| K | `note` | TEXT | `` | 管理者メモ |
| L | `line_user_id` | TEXT | `Uxxxxxxxx` | リクエスト元の LINE ユーザーID |

---

### 9. `lesson_memos` — レッスンメモ・次回目標

生徒ごと・日付ごとのメモ履歴。

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `memo_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `student_id` | INTEGER (FK→students) | `1` | 生徒ID |
| C | `lesson_id` | INTEGER (FK→lessons) | `1` | 対応するレッスンID（NULL可） |
| D | `lesson_date` | DATE | `2026-04-08` | レッスン日 |
| E | `memo` | TEXT | `ワルツのナチュラルターンで軸がブレる。` | レッスンメモ（本文） |
| F | `goal` | TEXT | `ナチュラルターンの軸固め。` | 次回目標 |
| G | `created_at` | DATETIME | `2026-04-08 22:00` | 作成日時 |
| H | `updated_at` | DATETIME | `2026-04-08 22:00` | 最終更新日時 |

---

### 10. `tasks` — タスク（TODO）

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `task_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `text` | TEXT | `山田さんの5月大会エントリー確認` | タスク内容 |
| C | `is_urgent` | BOOLEAN | `TRUE` | 緊急フラグ |
| D | `is_done` | BOOLEAN | `FALSE` | 完了フラグ |
| E | `done_at` | DATETIME | `` | 完了日時（NULL可） |
| F | `created_at` | DATETIME | `2026-04-08 10:00` | 作成日時 |

---

### 11. `sales` — 売上記録

| 列 | カラム名 | 型 | 例 | 説明 |
|----|----------|----|----|------|
| A | `sale_id` | INTEGER (PK) | `1` | 自動採番 |
| B | `sale_date` | DATE | `2026-04-08` | 売上日 |
| C | `student_id` | INTEGER (FK→students) | `1` | 生徒ID（NULL可：現金等の場合） |
| D | `student_name` | TEXT | `田中 花子` | 生徒名（student_id が NULL の場合の補完用） |
| E | `amount` | INTEGER | `5000` | 金額（円、税込） |
| F | `memo` | TEXT | `月謝` | 備考（支払い方法・種別など） |
| G | `lesson_id` | INTEGER (FK→lessons) | `` | 紐づくレッスンID（NULL可） |
| H | `created_at` | DATETIME | `2026-04-08 10:00` | 作成日時 |

---

## エンティティ関係図（概略）

```
studios ──────────────────────────────┐
  │                                   │
  ├── zones (曜日ごとのテンプレート)   │
  │     └── zone_overrides (週別上書き)│
  │                                   │
  └── lessons ←── booking_requests ←── [生徒LIFF]
        │  └── lesson_memos
        │
students ────┤
  └── ticket_types

tasks   (独立)
sales ──── students (任意)
blocks  (独立、ゾーン内に表示)
```

---

## 設計上の判断メモ

### レッスンは単発管理
- 「毎週このレッスン」という繰り返しはしない
- 週ごとに GAS が `zones` を読んで「空き枠」を計算し、予約リクエストが承認されたら `lessons` に1件追加する

### ゾーンは2層構造
- `zones` = 毎週繰り返すベーステンプレート
- `zone_overrides` = 特定の週だけ異なる場合（完全置換）
- モックの `_weekZoneOverrides` ロジックをそのまま踏襲

### 売上の生徒名冗長化
- `student_id` が NULL の場合でも記録できるよう `student_name` 列を持つ
- 将来的に生徒が退会しても売上履歴が残る

### LINE ユーザーID の扱い
- `students.line_user_id` は Phase 4（LIFF連携）で確定する
- Phase 3 時点では NULL のまま運用可能

---

## 次のステップ（Phase 3 に向けて）

- [ ] 実際の Google スプレッドシートを作成し、上記シートと列を作る
- [ ] GAS プロジェクトを作成し `appsscript.json` を設置
- [ ] 各シートを操作するライブラリ関数（CRUD）を実装
- [ ] `zones` → 空き枠計算ロジックを GAS で再現（モックの `getSlotStatus()` 相当）
- [ ] 予約リクエスト受信 → 管理者 LINE 通知の実装
