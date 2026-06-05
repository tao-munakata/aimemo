# AIメモ窓（ひらめきポスト）
SNS、Webで情報を入手している方には使いやすいと思います。
　コピーするだけで自動保存、Web　Clipperでそのまま取り込み、 
Obsidian Vault へ即座に保存し、Claude API で自動整形します。（LLMは文字化けで一旦中断）
---

## システム構成

```
ブラウザ（http://localhost:3000）
    ↓ HTTP POST
Docker コンテナ（Node.js / Express）
    ↓ bind mount
Obsidian Vault（~/Documents/ObsidianVault/）
```

---

## インストール手順

### 必須ソフトウェア

| ソフトウェア | バージョン | 用途 |
|---|---|---|
| Docker Desktop | v24 以上 | コンテナ実行基盤 |
| Obsidian | 最新版 | 知識管理・Vault 本体 |
| Docker Compose | v2 以上 | サービス定義・自動起動管理 |

### 1. Obsidian のインストールと Vault 登録

1. [https://obsidian.md/download](https://obsidian.md/download) からダウンロードしてインストール
2. Obsidian を起動 → **「Open folder as vault」**
3. `~/Documents/ObsidianVault/` を選択

> ⚠️ **注意：Vault 名とフォルダ名を一致させてください**
>
> `obsidian://open?vault=ObsidianVault` の `vault=` パラメータは Obsidian に登録した **Vault 名**（= フォルダ名）と完全一致する必要があります。  
> 異なる場合は「Obsidianで開く」ボタンが 404 になります。  
> `.env` の `VAULT_NAME` を Obsidian の Vault 名に合わせて変更してください。

### 2. リポジトリのクローン

```bash
git clone https://github.com/tao-munakata/aimemo.git
cd aimemo
```

### 3. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集します：

```env
VAULT_PATH=/Users/あなたのユーザー名/Documents/ObsidianVault
VAULT_NAME=ObsidianVault        # Obsidian に登録した Vault 名と一致させる
AI_MODE=none
LM_STUDIO_URL=http://host.docker.internal:1234/v1
LM_STUDIO_MODEL=gemma-4-12b-it
ANTHROPIC_API_KEY=              # Claude API を使う場合のみ設定
PORT=3000
```

> ⚠️ **`.env` は絶対に Git にコミットしないでください**  
> `.gitignore` で除外済みですが、`ANTHROPIC_API_KEY` が含まれるため取り扱いに注意してください。

### 4. Docker コンテナの起動

```bash
docker compose up -d
```

ブラウザで `http://localhost:3000` を開き、右上に **「オンライン (3.1.0)」** と表示されれば起動完了です。

> ⚠️ **Docker Desktop を先に起動してください**  
> Docker Desktop が起動していない状態で `docker compose up` を実行するとエラーになります。  
> Mac 再起動後に自動起動させるには、**システム設定 → 一般 → ログイン項目** に Docker.app を追加してください。

---

## AI 処理モードの設定

### Local LLM（LM Studio）

1. [https://lmstudio.ai](https://lmstudio.ai) からダウンロードしてインストール
2. LM Studio → **Developer（`<>` アイコン）** → モデルを選択 → **「Start Server」**
3. `.env` の `LM_STUDIO_MODEL` をロードしたモデル名に設定
4. AIメモ窓で「LOCAL LLM」を選択して保存

> ⚠️ **LM Studio の Local Server は AIメモ窓より先に起動してください**  
> Docker コンテナ内から `host.docker.internal:1234` 経由で接続します。  
> LM Studio が起動していない場合、Local LLM モードはタイムアウトします（Raw 保存にフォールバックしません）。

### Claude API

1. [https://console.anthropic.com](https://console.anthropic.com) で API キーを取得
2. `.env` の `ANTHROPIC_API_KEY` に設定
3. `docker compose restart` で再起動
4. AIメモ窓で「CLAUDE API」を選択して保存

---

## Web Clipper のインストール

Web ページや YouTube を Vault に保存するブラウザ拡張機能です。

- **Chrome / Opera：** [Chrome Web Store からインストール](https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf)
- インストール後、拡張機能の設定で **Vault 名** を `ObsidianVault` に設定してください

---

## よく使うコマンド

```bash
# 起動
docker compose up -d

# 停止
docker compose down

# ログ確認
docker compose logs -f

# 再ビルド（src/ 変更時のみ必要）
docker compose up -d --build

# Claude Code × Vault（第2の脳）
cd ~/Documents/ObsidianVault && claude
```

## Claude Code コマンド（Vault 内で使用）

| コマンド | 内容 |
|---|---|
| `ingest` | 00_Inbox を自動整理・分類・リンク生成 |
| `review` | デイリーノート生成・TODO 提示 |
| `lint` | Vault 健全性チェック（月1回推奨） |
| `brief` | 現在のコンテキストサマリー |

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| 右上が「オフライン」 | Docker コンテナ未起動 | `docker compose up -d` |
| 「Obsidianで開く」が 404 | VAULT_NAME が Obsidian の Vault 名と不一致 | `.env` の `VAULT_NAME` を確認・修正後 `docker compose up -d` |
| Local LLM がタイムアウト | LM Studio の Local Server が未起動 | LM Studio → Developer → Start Server |
| ポート 3000 が使用中 | 別プロセスが占有 | `lsof -ti :3000 \| xargs kill -9` |
