# ダンスレッスン予約・管理自動化ツール

フリーランスの社交ダンス講師向けに、予約管理・生徒メモ・タスク管理をスマホ一台で完結させる専用ツール。

## 開発フェーズ

| フェーズ | 内容 | 状態 |
|---------|------|------|
| Phase 1 | 管理者用画面モックアップ（HTML） | ✅ 完了 |
| Phase 2 | スプレッドシート設計（SSoT） | 🔜 次のステップ |
| Phase 3 | GAS バックエンド実装 | 🔜 予定 |
| Phase 4 | LINE LIFF 連携 | 🔜 予定 |

## 技術スタック

- **フロントエンド**: HTML / Tailwind CSS（LIFF画面）
- **バックエンド**: Google Apps Script（GAS）
- **データ管理**: Google スプレッドシート（SSoT）
- **通知**: LINE 公式アカウント / LIFF

## システム構成（4つのパーツ）

```
[LIFF画面（生徒・自分）]
       ↓ 操作
[Google Apps Script] ← SSoT → [Googleスプレッドシート]
       ↓ 通知
[LINE公式アカウント / 管理用LIFF]
```

## ディレクトリ構成

```
dance-lesson-manager/
├── mockup/
│   └── index.html       # 管理者用画面モックアップ
├── gas/                 # GAS実装（Phase 3〜）
├── .claude/             # AI開発スキル・設計メモ（Phase 3〜）
└── README.md
```

## 対象スタジオ

- **@泉スタジオ**（青）
- **@旭ヶ丘スタジオ**（緑）
