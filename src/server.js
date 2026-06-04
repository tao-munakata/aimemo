require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const VAULT_PATH = process.env.VAULT_PATH || '/vault';
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://host.docker.internal:1234/v1';
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || 'gemma-4-12b-it';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const FOLDERS = ['00_Inbox', '10_Projects', '20_AI', '30_Business', '40_Meeting', '90_Archive'];

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ---- AI処理 ----

function buildPrompt(content) {
  const today = new Date().toISOString().split('T')[0];
  return `あなたはObsidianメモの整理アシスタントです。
以下の入力テキストを構造化されたMarkdownメモに整形してください。

【入力テキスト】
${content}

【出力形式】（frontmatterから始め、他の説明文は一切出力しないこと）
---
title: （10文字以内の日本語タイトル）
tags: [推定タグ1, 推定タグ2]
date: ${today}
status: draft
links: []
---

（整形された本文）

## ✅ 抽出タスク
- [ ] タスク（期限: YYYY-MM-DD）`;
}

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const req = lib.request(
      { hostname: parsed.hostname, port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname, method: options.method || 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...options.headers } },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function formatWithLocalLLM(content) {
  const body = JSON.stringify({
    model: LM_STUDIO_MODEL,
    messages: [{ role: 'user', content: buildPrompt(content) }],
    max_tokens: 1000,
    temperature: 0.3,
  });
  try {
    const res = await httpRequest(`${LM_STUDIO_URL}/chat/completions`, {}, body);
    const json = JSON.parse(res.body);
    return json.choices?.[0]?.message?.content || content;
  } catch {
    return content;
  }
}

async function formatWithClaude(content) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildPrompt(content) }],
  });
  const res = await httpRequest('https://api.anthropic.com/v1/messages', {
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
  }, body);
  const json = JSON.parse(res.body);
  return json.content?.[0]?.text || content;
}

// ---- ファイル保存 ----

function saveToVault(folder, title, content) {
  const dir = path.join(VAULT_PATH, folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeName = title.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 50);
  const fileName = `${date}_${safeName}.md`;
  fs.writeFileSync(path.join(dir, fileName), content, 'utf8');
  return { filePath: path.join(dir, fileName), fileName };
}

function extractTitleFromFormatted(text) {
  const m = text.match(/title:\s*(.+)/);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

function extractTasksFromText(text) {
  const tasks = [];
  const pattern = /[-*]\s*\[.\]\s*(.+)/g;
  let m;
  while ((m = pattern.exec(text)) !== null) tasks.push(m[1].trim());
  return tasks;
}

// ---- エンドポイント ----

app.post('/api/memo', async (req, res) => {
  try {
    const { content, folder = '00_Inbox', ai_mode = 'none', tags = [], title = '' } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, error: 'content is required' });

    const today = new Date().toISOString().split('T')[0];
    let formattedContent = content;
    let aiSummary = null;

    if (ai_mode === 'local') {
      formattedContent = await formatWithLocalLLM(content);
      aiSummary = 'Local LLM で整形しました';
    } else if (ai_mode === 'claude') {
      formattedContent = await formatWithClaude(content);
      aiSummary = 'Claude API で整形しました';
    } else {
      const extraTags = tags.length > 0 ? tags.join(', ') : 'メモ';
      formattedContent = `---\ntitle: ${title || content.slice(0, 20)}\ntags: [${extraTags}]\ndate: ${today}\nstatus: draft\nlinks: []\n---\n\n${content}`;
    }

    const finalTitle = title || extractTitleFromFormatted(formattedContent) || content.slice(0, 20);
    const extractedTasks = extractTasksFromText(formattedContent);
    const { filePath, fileName } = saveToVault(folder, finalTitle, formattedContent);

    const vaultName = path.basename(VAULT_PATH);
    const obsidianFile = encodeURIComponent(path.join(folder, fileName).replace('.md', ''));
    const obsidianUrl = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${obsidianFile}`;

    res.json({ success: true, file_path: filePath, obsidian_url: obsidianUrl, ai_summary: aiSummary, extracted_tasks: extractedTasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/folders', (req, res) => {
  const folders = FOLDERS.filter(f => fs.existsSync(path.join(VAULT_PATH, f)));
  res.json({ folders });
});

app.get('/api/recent', (req, res) => {
  try {
    const files = [];
    for (const folder of FOLDERS) {
      const dir = path.join(VAULT_PATH, folder);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.md')) continue;
        const stat = fs.statSync(path.join(dir, f));
        files.push({ name: f, folder, mtime: stat.mtime });
      }
    }
    files.sort((a, b) => b.mtime - a.mtime);
    res.json({ files: files.slice(0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', vault: VAULT_PATH, version: '3.1.0' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AIメモ窓 v3.1.0 起動中: http://localhost:${PORT}`);
  console.log(`Vault: ${VAULT_PATH}`);
});
