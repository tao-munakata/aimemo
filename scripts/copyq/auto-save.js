// CopyQ 自動保存コマンド
// 設定方法: CopyQ → 環境設定 → コマンド → 追加 → スクリプト
// 「自動コマンド」にチェック、「コンテンツが一致」を空欄

var content = str(read(0));

// ---- フィルター（保存しない条件）----

// 20文字未満はスキップ（短すぎる）
if (content.length < 20) abort();

// スペースなし（1単語）はスキップ
if (!/\s/.test(content.trim())) abort();

// URLのみはスキップ（Web Clipper で対応）
if (/^https?:\/\/\S+$/.test(content.trim())) abort();

// パスワードっぽいものはスキップ（記号+英数字のみで30文字超）
if (/^[A-Za-z0-9!@#$%^&*_+\-=]{30,}$/.test(content.trim())) abort();

// ---- AIメモ窓 API へ送信 ----

var body = JSON.stringify({
    content: content,
    folder: "00_Inbox",
    ai_mode: "none",
    tags: ["clip", "copyq"]
});

var result = execute(
    "curl", "-s", "-X", "POST",
    "http://localhost:3000/api/memo",
    "-H", "Content-Type: application/json",
    "-d", body
);

// 成功時にCopyQのトレイアイコンを一瞬光らせる
if (result && result.stdout && result.stdout.indexOf('"success":true') !== -1) {
    popup("Vault に保存しました", content.slice(0, 50) + (content.length > 50 ? "..." : ""));
}
