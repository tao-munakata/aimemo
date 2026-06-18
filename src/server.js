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
const VAULT_NAME = process.env.VAULT_NAME || path.basename(process.env.VAULT_PATH || 'obsidian');
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://host.docker.internal:1234/v1';
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || 'gemma-4-12b-it';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const FOLDERS = ['00_Inbox', '10_Projects', '20_AI', '30_Business', '40_Meeting', '50_Personal', '90_Archive'];

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

    const obsidianFile = encodeURIComponent(path.join(folder, fileName).replace('.md', ''));
    const obsidianUrl = `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${obsidianFile}`;

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

app.get('/api/clips', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const dir = path.join(VAULT_PATH, '00_Inbox');
    if (!fs.existsSync(dir)) return res.json({ clips: [] });
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        const raw = fs.readFileSync(full, 'utf8');
        const bodyMatch = raw.match(/---[\s\S]*?---\s*([\s\S]*)/);
        const preview = (bodyMatch ? bodyMatch[1] : raw).trim().slice(0, 120).replace(/\n/g, ' ');
        return { name: f, mtime: stat.mtime, preview };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);
    res.json({ clips: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', vault: VAULT_PATH, version: '3.3.0' }));

// ---- Vault コマンド ----

function classifyInboxFile(filename) {
  if (/your_secret_here/.test(filename)) return 'DELETE';
  if (/^[-\s]+\.md$/.test(filename)) return 'DELETE';
  if (/週[\s　]予定|仁亭|つたや旅館/.test(filename)) return '40_Meeting';
  if (/RIKB|鍵管理|neko-service|AffiBase|アフィリエイト|A8\.net|アクセストレード|FANZA|DMM|JAST|アダルトグッズ|防犯カメラ|現場調査|エアコン工事|Gaussian|見取り図|サステナブル建築|153\.126|kuneome/.test(filename)) return '10_Projects';
  if (/車椅子|Magic Mobility|XT4|CR Expo|補装具|介護保険|展示会|中国国際福祉|4輪駆動型|特許|フルリモート|業務委託|圧倒的勝者|進捗管理ツール|VLプラン|チェックリスト/.test(filename)) return '30_Business';
  if (/男性性|女性性|セックス|愛と性|愛花|はなさん|DIAさん|おはにゃん|タオルケット|おかあ|ブルックサイド|ケーキ|iCloud|温泉|なごみの湯|乳首|セフレ|人妻|気分転換|頭の切り替え|男は多く|はどめ規定|膣内射精|宗像|かのん|来週の|おはようございます|那須塩原/.test(filename)) return '50_Personal';
  return '20_AI';
}

app.get('/api/vault/stats', (req, res) => {
  try {
    const stats = {};
    for (const folder of FOLDERS) {
      const dir = path.join(VAULT_PATH, folder);
      stats[folder] = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).length
        : 0;
    }
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vault/ingest', (req, res) => {
  try {
    const inboxDir = path.join(VAULT_PATH, '00_Inbox');
    if (!fs.existsSync(inboxDir)) return res.json({ moved: {}, deleted: 0, total: 0 });

    const files = fs.readdirSync(inboxDir).filter(f => f.endsWith('.md'));
    const moved = { '10_Projects': 0, '20_AI': 0, '30_Business': 0, '40_Meeting': 0, '50_Personal': 0 };
    let deleted = 0;

    for (const file of files) {
      const dest = classifyInboxFile(file);
      const src = path.join(inboxDir, file);
      if (dest === 'DELETE') {
        fs.unlinkSync(src);
        deleted++;
      } else {
        const destDir = path.join(VAULT_PATH, dest);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        const destPath = path.join(destDir, file);
        if (!fs.existsSync(destPath)) {
          fs.renameSync(src, destPath);
        } else {
          fs.unlinkSync(src);
        }
        moved[dest] = (moved[dest] || 0) + 1;
      }
    }

    const total = Object.values(moved).reduce((a, b) => a + b, 0) + deleted;
    res.json({ success: true, moved, deleted, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vault/brief', (req, res) => {
  try {
    const stats = {};
    for (const folder of FOLDERS) {
      const dir = path.join(VAULT_PATH, folder);
      stats[folder] = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).length
        : 0;
    }

    const recentFiles = [];
    for (const folder of ['10_Projects', '20_AI', '30_Business']) {
      const dir = path.join(VAULT_PATH, folder);
      if (!fs.existsSync(dir)) continue;
      fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .forEach(f => {
          const stat = fs.statSync(path.join(dir, f));
          recentFiles.push({ name: f, folder, mtime: stat.mtime });
        });
    }
    recentFiles.sort((a, b) => b.mtime - a.mtime);

    const today = new Date().toISOString().split('T')[0];
    const dailyExists = fs.existsSync(path.join(VAULT_PATH, `${today}.md`));

    res.json({ stats, recentTop5: recentFiles.slice(0, 5), today, dailyExists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vault/review', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const dailyPath = path.join(VAULT_PATH, `${today}.md`);
    const existed = fs.existsSync(dailyPath);

    if (!existed) {
      const content = `---\ntitle: ${today} デイリーノート\ndate: ${today}\ntags: [daily, review]\nstatus: active\nlinks: []\n---\n\n## 今日のタスク\n\n- [ ] \n\n## メモ\n\n`;
      fs.writeFileSync(dailyPath, content, 'utf8');
    }

    const stats = {};
    for (const folder of FOLDERS) {
      const dir = path.join(VAULT_PATH, folder);
      stats[folder] = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).length
        : 0;
    }

    res.json({ success: true, dailyCreated: !existed, dailyPath: `${today}.md`, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vault/lint', (req, res) => {
  try {
    const titleRe = /^title:\s*(.+)$/m;
    const titleMap = {};
    const duplicates = [];

    for (const folder of FOLDERS.filter(f => f !== '00_Inbox' && f !== '90_Archive')) {
      const dir = path.join(VAULT_PATH, folder);
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
        try {
          const raw = fs.readFileSync(path.join(dir, file), 'utf8').slice(0, 300);
          const m = raw.match(titleRe);
          const title = m ? m[1].trim().slice(0, 40) : null;
          if (!title) continue;
          if (!titleMap[title]) { titleMap[title] = []; }
          titleMap[title].push(`${folder}/${file}`);
        } catch { /* skip */ }
      }
    }

    for (const [title, files] of Object.entries(titleMap)) {
      if (files.length >= 2) duplicates.push({ title, count: files.length, files });
    }
    duplicates.sort((a, b) => b.count - a.count);

    const inboxCount = fs.existsSync(path.join(VAULT_PATH, '00_Inbox'))
      ? fs.readdirSync(path.join(VAULT_PATH, '00_Inbox')).filter(f => f.endsWith('.md')).length
      : 0;

    res.json({ duplicateGroups: duplicates.length, duplicateFiles: duplicates.reduce((a, d) => a + d.count, 0), top10: duplicates.slice(0, 10), inboxCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AIメモ窓 v3.1.0 起動中: http://localhost:${PORT}`);
  console.log(`Vault: ${VAULT_PATH}`);
});
