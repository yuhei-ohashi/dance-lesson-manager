# スプレッドシート セットアップ手順書（Phase 3 - STEP 1）

> この手順書に従って Google スプレッドシートを手動でセットアップする。
> 完了後、GAS からこのスプレッドシートを読み書きできる状態になる。

---

## 所要時間の目安

約 30〜45 分

---

## 事前準備

- Google アカウントにログインした状態で作業する
- PC のブラウザ（Chrome 推奨）で操作する

---

## 手順 1：スプレッドシートを新規作成する

1. ブラウザで [Google スプレッドシート](https://sheets.google.com) を開く
2. 左上の **「空白」** をクリックして新規作成
3. 左上のタイトル欄（「無題のスプレッドシート」）をクリックし、以下の名前に変更する

```
ダンスレッスン管理
```

---

## 手順 2：タイムゾーンを Asia/Tokyo に設定する

> ⚠️ この設定を忘れると日付・時刻がズレるバグが発生する。必ず最初に行うこと。

1. メニューの **「ファイル」** → **「設定」** をクリック
2. 「全般」タブの **「タイムゾーン」** プルダウンを開く
3. `(GMT+09:00) Tokyo` を選択する
4. **「設定を保存」** をクリック

---

## 手順 3：12 枚のシートを作成する

デフォルトで「シート1」が1枚ある状態から始まる。
以下の手順で合計 12 枚のシートを作成する。

### シートのリスト（作成順）

| # | シート名 |
|---|---------|
| 1 | `studios` |
| 2 | `zones` |
| 3 | `zone_overrides` |
| 4 | `students` |
| 5 | `ticket_types` |
| 6 | `lessons` |
| 7 | `blocks` |
| 8 | `booking_requests` |
| 9 | `lesson_memos` |
| 10 | `tasks` |
| 11 | `sales` |
| 12 | `notifications` |

### シートの作成方法

1. 画面下の **「シート1」タブを右クリック** → **「名前を変更」** → `studios` と入力して Enter
2. 画面下の **「＋」ボタン** をクリックして新しいシートを追加
3. 追加されたシートタブを右クリック → 「名前を変更」 → シート名を入力
4. 2〜3 を繰り返して 12 枚すべて作成する

---

## 手順 4：各シートにヘッダー行を入力する

各シートの **1行目** に以下の列名を入力する。
**すべて半角英字・アンダースコアで入力すること**（コピー＆ペーストを推奨）。

---

### シート 1：`studios`

A1 から順に右方向へ入力：

```
studio_id	short_name	full_name	color_style	note
```

---

### シート 2：`zones`

```
zone_id	day_of_week	start_time	end_time	studio_id	is_active	updated_at
```

---

### シート 3：`zone_overrides`

```
override_id	week_start_date	day_of_week	start_time	end_time	studio_id	note	is_cancelled	created_at
```

---

### シート 4：`students`

```
student_id	name	furigana	line_user_id	since	ticket_type_id	dances	color_style	last_lesson_date	is_active	note	created_at	updated_at
```

---

### シート 5：`ticket_types`

```
ticket_type_id	label	color_hex	bg_hex	count	note
```

---

### シート 6：`lessons`

```
lesson_id	lesson_date	start_time	end_time	student_id	studio_id	level	lesson_count	booking_request_id	status	note	created_at	updated_at
```

---

### シート 7：`blocks`

```
block_id	label	sub_label	day_of_week	start_time	end_time	is_recurring	specific_date	is_active	created_at
```

---

### シート 8：`booking_requests`

```
request_id	requested_at	expires_at	student_id	student_name_input	requested_date	requested_start	requested_end	studio_id	status	approved_lesson_id	approved_at	note	line_user_id
```

---

### シート 9：`lesson_memos`

```
memo_id	student_id	lesson_id	lesson_date	memo	goal	created_at	updated_at
```

---

### シート 10：`tasks`

```
task_id	text	is_urgent	is_done	done_at	created_at
```

---

### シート 11：`sales`

```
sale_id	sale_date	student_id	student_name	amount	type	payment_status	memo	lesson_id	created_at
```

---

### シート 12：`notifications`

```
notification_id	student_id	line_user_id	type	related_id	sent_at	status
```

---

## 手順 5：日付・時刻列のセルフォーマットを「書式なしテキスト」に設定する

> ⚠️ この設定を忘れると GAS が日付を `Date` オブジェクト（数値）として読んでしまい、正しく処理できなくなる。

対象列を選択 → `書式` メニュー → `数字` → `書式なしテキスト` の順にクリックする。

**操作手順（1列ごとに繰り返す）：**
1. 対象の列ヘッダー（A, B, C…）をクリックして列全体を選択
2. メニュー **「表示形式」** → **「数字」** → **「書式なしテキスト」** をクリック

> 「表示形式」メニューが見当たらない場合は「Format」メニューを探す（言語設定による）。

---

### 各シートの対象列一覧

#### `studios`
対象なし（すべてテキストのため設定不要）

---

#### `zones`
| 列 | カラム名 | 型 |
|----|----------|-----|
| C | `start_time` | HH:MM |
| D | `end_time` | HH:MM |
| G | `updated_at` | YYYY-MM-DD HH:MM |

---

#### `zone_overrides`
| 列 | カラム名 | 型 |
|----|----------|-----|
| B | `week_start_date` | YYYY-MM-DD |
| D | `start_time` | HH:MM |
| E | `end_time` | HH:MM |
| I | `created_at` | YYYY-MM-DD HH:MM |

---

#### `students`
| 列 | カラム名 | 型 |
|----|----------|-----|
| I | `last_lesson_date` | YYYY-MM-DD |
| L | `created_at` | YYYY-MM-DD HH:MM |
| M | `updated_at` | YYYY-MM-DD HH:MM |

---

#### `ticket_types`
対象なし（すべてテキスト・数値のため設定不要）

---

#### `lessons`
| 列 | カラム名 | 型 |
|----|----------|-----|
| B | `lesson_date` | YYYY-MM-DD |
| C | `start_time` | HH:MM |
| D | `end_time` | HH:MM |
| L | `created_at` | YYYY-MM-DD HH:MM |
| M | `updated_at` | YYYY-MM-DD HH:MM |

---

#### `blocks`
| 列 | カラム名 | 型 |
|----|----------|-----|
| E | `start_time` | HH:MM |
| F | `end_time` | HH:MM |
| H | `specific_date` | YYYY-MM-DD |
| J | `created_at` | YYYY-MM-DD HH:MM |

---

#### `booking_requests`
| 列 | カラム名 | 型 |
|----|----------|-----|
| B | `requested_at` | YYYY-MM-DD HH:MM |
| C | `expires_at` | YYYY-MM-DD HH:MM |
| F | `requested_date` | YYYY-MM-DD |
| G | `requested_start` | HH:MM |
| H | `requested_end` | HH:MM |
| L | `approved_at` | YYYY-MM-DD HH:MM |

---

#### `lesson_memos`
| 列 | カラム名 | 型 |
|----|----------|-----|
| D | `lesson_date` | YYYY-MM-DD |
| G | `created_at` | YYYY-MM-DD HH:MM |
| H | `updated_at` | YYYY-MM-DD HH:MM |

---

#### `tasks`
| 列 | カラム名 | 型 |
|----|----------|-----|
| E | `done_at` | YYYY-MM-DD HH:MM |
| F | `created_at` | YYYY-MM-DD HH:MM |

---

#### `sales`
| 列 | カラム名 | 型 |
|----|----------|-----|
| B | `sale_date` | YYYY-MM-DD |
| J | `created_at` | YYYY-MM-DD HH:MM |

---

#### `notifications`
| 列 | カラム名 | 型 |
|----|----------|-----|
| F | `sent_at` | YYYY-MM-DD HH:MM |

---

## 手順 6：初期データを入力する

以下の 2 シートには初期データを手入力する。

---

### `studios`（3 行）

2 行目から順に入力（1 行目はヘッダー）：

| A (studio_id) | B (short_name) | C (full_name) | D (color_style) | E (note) |
|---------------|----------------|---------------|-----------------|----------|
| `saito` | `齊藤DG` | `齊藤ダンスガーデン` | `lime` | |
| `sendai` | `仙台SS` | `仙台サテライトスタジオ` | `orange` | |
| `izumi` | `泉中央` | `泉中央レンタルスペース` | `blue` | |

---

### `ticket_types`（8 行）

| A (ticket_type_id) | B (label) | C (color_hex) | D (bg_hex) | E (count) | F (note) |
|--------------------|-----------|---------------|------------|-----------|----------|
| `single` | `単発` | `#4b5563` | `#f3f4f6` | `1` | |
| `bundle3` | `3枚` | `#1d4ed8` | `#dbeafe` | `3` | |
| `bundle5` | `5枚` | `#6d28d9` | `#ede9fe` | `5` | |
| `bundle10` | `10枚` | `#065f46` | `#d1fae5` | `10` | |
| `bundle20` | `20枚` | `#9a3412` | `#ffedd5` | `20` | |
| `passport` | `パスポート` | `#1e3a5f` | `#bfdbfe` | `-1` | |
| `nsp` | `NSP` | `#4c1d95` | `#ddd6fe` | `-1` | |
| `beginner` | `初心者` | `#713f12` | `#fef3c7` | `1` | |

---

## 手順 7：スプレッドシート ID をメモする

GAS からこのスプレッドシートに接続するために **スプレッドシート ID** が必要。

1. ブラウザのアドレスバーを確認する
2. URL の形式：`https://docs.google.com/spreadsheets/d/【ここがID】/edit#gid=0`
3. `d/` と `/edit` の間の文字列をコピーしてメモしておく

例：
```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
                                        ↑ここがスプレッドシートID
```

> このIDは STEP 2（GAS プロジェクトのセットアップ）で使用する。

---

## セットアップ完了チェックリスト

- [ ] スプレッドシートのタイムゾーンを `Asia/Tokyo` に設定した
- [ ] 12 枚のシートを作成し、それぞれ正しい名前をつけた
- [ ] 各シートの 1 行目にヘッダー行を入力した
- [ ] 全シートの日付・時刻列を「書式なしテキスト」に設定した
- [ ] `studios` シートに 3 件の初期データを入力した
- [ ] `ticket_types` シートに 8 件の初期データを入力した
- [ ] スプレッドシート ID をメモした

---

## 次のステップ

STEP 2：GAS プロジェクトのセットアップ（clasp によるローカル開発環境構築）へ進む。
