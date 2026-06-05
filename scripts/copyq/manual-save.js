// CopyQ 手動保存コマンド
// 設定方法: CopyQ → 環境設定 → コマンド → 追加 → スクリプト
// ショートカット: Ctrl+Shift+V（任意）
// 「アイテムメニューに表示」にチェック

var content = str(read(0));

if (!content || content.trim().length === 0) {
    popup("エラー", "クリップボードが空です");
    abort();
}

var body = JSON.stringify({
    content: content,
    folder: "00_Inbox",
    ai_mode: "none",
    tags: ["clip", "copyq", "manual"]
});

var result = execute(
    "curl", "-s", "-X", "POST",
    "http://localhost:3000/api/memo",
    "-H", "Content-Type: application/json",
    "-d", body
);

if (result && result.stdout && result.stdout.indexOf('"success":true') !== -1) {
    popup("✅ Vault に保存しました", content.slice(0, 80) + (content.length > 80 ? "..." : ""));
} else {
    popup("❌ 保存失敗", "AIメモ窓が起動しているか確認してください\nhttp://localhost:3000");
}
