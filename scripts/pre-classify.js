#!/usr/bin/env node
/**
 * Notion移行ファイルの事前分類スクリプト
 * キーワードマッチで 00_Inbox → 各フォルダへ振り分け
 * 使い方: node scripts/pre-classify.js
 */

const fs = require('fs');
const path = require('path');

const VAULT = process.env.VAULT_PATH || '/Users/tao/Documents/ObsidianVault';
const INBOX = path.join(VAULT, '00_Inbox');

const RULES = [
  {
    folder: '20_AI',
    keywords: ['claude', 'chatgpt', 'gpt', 'llm', 'openai', 'anthropic', 'gemini',
               'copilot', 'cursor', 'lm studio', 'ollama', 'mcp', 'エージェント',
               'プロンプト', '機械学習', 'ファインチューニング', 'ベクター', 'rag',
               'n8n', 'langchain', 'ai一人', 'aiソロ', '自立型', '自律型',
               'claude code', 'codex', 'whisper', 'stable diffusion'],
  },
  {
    folder: '10_Projects',
    keywords: ['patent', '特許', 'iot', 'ai名刺', 'patent-navi', 'patentnavi',
               '案件', 'プロジェクト', 'システム開発', 'アプリ開発', 'サービス開発',
               'mvp', 'リリース', 'ローンチ'],
  },
  {
    folder: '30_Business',
    keywords: ['営業', '事業化', '収益', '売上', 'マネタイズ', '価格', '料金',
               'サービス化', 'saas', 'スタートアップ', '起業', '資金調達',
               'マーケティング', 'sns', 'x集客', 'note', 'ブログ', 'アフィリ',
               '1億', '稼ぐ', 'マネタイズ', '副業', 'フリーランス'],
  },
  {
    folder: '40_Meeting',
    keywords: ['会議', '議事録', 'ミーティング', '打ち合わせ', '相談', 'mtr',
               'zoom', 'meet', '打合'],
  },
];

function classify(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some(kw => text.includes(kw.toLowerCase()))) {
      return rule.folder;
    }
  }
  return null; // 分類不能 → 00_Inbox に残す
}

function safeMove(src, destFolder) {
  const destDir = path.join(VAULT, destFolder);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(src));
  // 同名ファイルが存在する場合はサフィックスを付ける
  if (fs.existsSync(dest)) {
    const ext = path.extname(src);
    const base = path.basename(src, ext);
    const newDest = path.join(destDir, `${base}_notion${ext}`);
    fs.renameSync(src, newDest);
    return newDest;
  }
  fs.renameSync(src, dest);
  return dest;
}

function main() {
  const files = fs.readdirSync(INBOX).filter(f => f.endsWith('.md'));
  console.log(`📂 00_Inbox: ${files.length} 件を分類中...\n`);

  const counts = { '10_Projects': 0, '20_AI': 0, '30_Business': 0, '40_Meeting': 0, inbox: 0 };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(INBOX, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // frontmatter から title を抽出
    const titleMatch = content.match(/^title:\s*"?(.+?)"?\s*$/m);
    const title = titleMatch ? titleMatch[1] : file;

    const folder = classify(title, content);
    process.stdout.write(`\r  [${i + 1}/${files.length}] ${folder || '00_Inbox'}: ${title.slice(0, 30)}...`);

    if (folder) {
      safeMove(filePath, folder);
      counts[folder]++;
    } else {
      counts.inbox++;
    }
  }

  console.log('\n\n✅ 事前分類完了！\n');
  console.log(`  20_AI        : ${counts['20_AI']} 件`);
  console.log(`  10_Projects  : ${counts['10_Projects']} 件`);
  console.log(`  30_Business  : ${counts['30_Business']} 件`);
  console.log(`  40_Meeting   : ${counts['40_Meeting']} 件`);
  console.log(`  00_Inbox(残) : ${counts.inbox} 件\n`);
  console.log(`💡 次: cd ~/Documents/ObsidianVault && claude → "ingest" で残りを整理`);
}

main();
