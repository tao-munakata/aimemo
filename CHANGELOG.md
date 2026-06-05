# CHANGELOG

## [v3.2.0] - 2026-06-06

### 新機能
- **クリップボード監視デーモン** (`scripts/clip-monitor.js`)
  - CopyQ不要・pbpaste/osascriptベースのネイティブ実装（画面フラッシュなし）
  - コピー即時 → `00_Inbox` 自動保存 → macOS通知
  - 文字化け検出フィルター（置換文字率10%超はスキップ）
  - 重複防止（3秒デバウンス）・短文/URLのみ/パスワード類は自動除外
  - macOS起動時に自動スタート（`~/Library/LaunchAgents/com.aimemo.clipmonitor.plist`）
- **クリップ履歴API** (`GET /api/clips`)
  - `00_Inbox` の最新30件をプレビュー付きで返す
- **ひらめきポスト UI 強化**
  - クリップ履歴エリア追加（5秒自動更新・ライブドット表示）
  - Local LLM選択肢を削除（当面Claude API / Rawのみ）

### 変更
- LM Studio依存を `.env` でコメントアウト（再有効化可能）
- server.js バージョン表記 → `3.2.0`

---

## [v3.1.3] - 2026-06-05

### 運用完了
- Notion 751件移行・事前分類・ingest 完了（00_Inbox = 0件）
- Vault 合計 775件で稼働開始
- Web Clipper（Chrome拡張）設定・動作確認済み
- Notion は今後使用しない（AIメモ窓 + Web Clipper に一本化）

---

## [v3.1.2] - 2026-06-05

### 新機能
- **Notion → Obsidian 一括移行スクリプト** (`scripts/notion-to-obsidian.js`)
  - Notion API でページネーション対応（100件/回）
  - 見出し・箇条書き・コード・画像・リンクを Markdown に変換
  - frontmatter（title / date / tags / source URL）を自動付与
  - 重複スキップ対応（再実行安全）
  - 実績：772件検出・751件保存・エラー0件
- **事前分類スクリプト** (`scripts/pre-classify.js`)
  - キーワードマッチで 00_Inbox → 各フォルダへ高速振り分け
  - 764件中507件を自動分類（20_AI: 226件 / 30_Business: 109件 / 40_Meeting: 88件 / 10_Projects: 85件）
  - AI不要・即時完了

---

## [v3.1.1] - 2026-06-05

### バグ修正
- **「Obsidianで開く」ボタンが表示されない問題を修正**
  - `el.style.display = ''` → `display = 'block'` に変更
  - CSS の `display: none` に上書きが効いていなかった
- **obsidian:// URLの vault 名が `vault` になる問題を修正**
  - Docker コンテナ内の `VAULT_PATH=/vault`（マウントポイント）から `basename` を取得していたため不正な名前になっていた
  - `VAULT_NAME` 環境変数を独立させて正しい Vault 名を渡すよう変更

### 改善
- **Web Clipper リンクを修正**
  - 無効なフォーラムURL → Chrome Web Store の正しいURLに変更
  - `https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf`
- **フロントエンドのホットリロード対応**
  - `public/` ディレクトリを Docker volume にマウント
  - HTML/JS/CSS 変更時にコンテナ再ビルド不要（ブラウザ強制リロードのみで反映）
- **Vault パスを推奨パスに変更**
  - `/Users/tao/ai/obsidian` → `~/Documents/ObsidianVault/`（設計書推奨パス）

### 環境変数の追加
| 変数名 | 説明 | デフォルト値 |
|---|---|---|
| `VAULT_NAME` | Obsidian に登録した Vault 名（フォルダ名と一致させる） | `ObsidianVault` |

---

## [v0.1.0] - 2026-06-05

### 新規リリース（v3.1.0 設計書ベース）
- Docker Compose によるコンテナ化（launchd 廃止・OS 非依存設計）
- Node.js/Express バックエンド（`src/server.js`）
- フロントエンド UI（クイック入力・長文・音声入力・AI切替）
- AI 処理モード：Local LLM（LM Studio）/ Claude API / Raw 保存
- Obsidian protocol URL 生成（`obsidian://open`）
- API エンドポイント：`POST /api/memo` / `GET /api/folders` / `GET /api/recent` / `GET /health`
- `restart: always` による Mac 再起動後の自動起動
