# CHANGELOG

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
