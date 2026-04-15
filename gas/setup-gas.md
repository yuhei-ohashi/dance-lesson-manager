# GAS プロジェクト セットアップ手順書（Phase 3 - STEP 2）

> clasp を使ってローカルで GAS コードを編集し、Google に push する環境を構築する。

---

## 所要時間の目安

約 15〜20 分

---

## 前提条件

- STEP 1（スプレッドシートのセットアップ）が完了していること
- スプレッドシート ID をメモしていること
- Node.js がインストール済みであること（`node --version` で確認）

---

## ローカル環境の構成

```
gas/
├── src/                    ← GAS にアップロードするソースコード置き場
│   ├── appsscript.json     ← GAS プロジェクト設定（clasp が参照）
│   └── *.js                ← 実装ファイル（今後追加していく）
├── .clasp.json             ← clasp 設定（scriptId を記入する）
├── .claspignore            ← push 対象外のファイル
├── appsscript.json         ← 参照用コピー（gas/ 直下）
├── setup-spreadsheet.md    ← STEP 1 手順書
└── setup-gas.md            ← この手順書
```

---

## 手順 1：Google Apps Script API を有効にする

clasp を使うためには Google アカウント側で API を有効にする必要がある。

1. [https://script.google.com/home/usersettings](https://script.google.com/home/usersettings) を開く
2. **「Google Apps Script API」** のトグルを **オン** にする

> 既にオンになっている場合はスキップ。

---

## 手順 2：clasp でログインする

ターミナルで以下を実行：

```bash
clasp login
```

ブラウザが自動で開き、Google アカウントの認証画面が表示される。
使用する Google アカウントでログインし、「許可」をクリックする。

> 成功すると `~/.clasprc.json` に認証情報が保存される。

---

## 手順 3：GAS プロジェクトをスプレッドシートに紐付けて作成する

スプレッドシートに紐付いた GAS プロジェクトを作成する。

```bash
cd /Users/yuhei/src/dance-lesson-manager/gas
clasp create --type sheets --title "ダンスレッスン管理 GAS" --parentId <スプレッドシートID>
```

`<スプレッドシートID>` は STEP 1 手順 7 でメモした値に置き換える。

**実行例：**
```bash
clasp create --type sheets --title "ダンスレッスン管理 GAS" --parentId 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

成功すると以下のメッセージが表示される：
```
Created new Google Sheet: https://drive.google.com/...
Created new script: https://script.google.com/d/<scriptId>/edit
```

> ⚠️ `clasp create` は `.clasp.json` を自動生成するが、`rootDir` が設定されない。
> 次の手順 4 で手動修正が必要。

---

## 手順 4：`.clasp.json` を編集する

`clasp create` が生成した `.clasp.json` を以下の内容に書き換える：

```json
{
  "scriptId": "<手順3で取得した scriptId>",
  "rootDir": "./src"
}
```

`scriptId` は `clasp create` の出力 URL の `d/` と `/edit` の間の文字列：
```
https://script.google.com/d/【ここが scriptId】/edit
```

> `rootDir: "./src"` を設定することで、`gas/src/` 以下のファイルだけが push される。

---

## 手順 5：動作確認（push → ブラウザで確認）

```bash
cd /Users/yuhei/src/dance-lesson-manager/gas
clasp push
```

成功すると：
```
└─ src/appsscript.json
Pushed 1 files.
```

ブラウザで GAS エディタを開いて確認：
```bash
clasp open
```

---

## 手順 6：便利なコマンド一覧

| コマンド | 説明 |
|---------|------|
| `clasp push` | ローカルの `src/` を GAS にアップロード |
| `clasp pull` | GAS の内容をローカルに取得 |
| `clasp open` | ブラウザで GAS エディタを開く |
| `clasp deployments` | デプロイ一覧を確認 |
| `clasp deploy` | 新しいバージョンをデプロイ |

---

## セットアップ完了チェックリスト

- [ ] Google Apps Script API を有効にした
- [ ] `clasp login` でログイン済み
- [ ] `clasp create` でプロジェクトを作成した
- [ ] `.clasp.json` の `scriptId` と `rootDir` を設定した
- [ ] `clasp push` が成功した
- [ ] `clasp open` でブラウザに GAS エディタが表示された

---

## 次のステップ

STEP 3：基盤ユーティリティの実装（日時・LockService・シート操作の共通関数）へ進む。
