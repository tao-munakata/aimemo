#!/usr/bin/env node
/**
 * Notion → Obsidian Vault 移行スクリプト
 * 使い方: NOTION_TOKEN=secret_xxx node scripts/notion-to-obsidian.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const VAULT_PATH = process.env.VAULT_PATH || '/Users/tao/Documents/ObsidianVault';
const OUTPUT_FOLDER = path.join(VAULT_PATH, '00_Inbox');
const DELAY_MS = 350; // Notion API rate limit 対策

if (!NOTION_TOKEN) {
  console.error('❌ NOTION_TOKEN が設定されていません');
  console.error('   export NOTION_TOKEN=secret_xxx && node scripts/notion-to-obsidian.js');
  process.exit(1);
}

// ---- Notion API ----

function notionRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.notion.com',
      path: `/v1/${endpoint}`,
      method,
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { reject(new Error(`Parse error: ${d.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---- 全ページ取得（ページネーション対応）----

async function fetchAllPages() {
  const pages = [];
  let cursor = undefined;
  let page = 1;

  console.log('📋 Notionのページ一覧を取得中...');

  while (true) {
    const body = {
      filter: { value: 'page', property: 'object' },
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    };

    const res = await notionRequest('POST', 'search', body);

    if (res.object === 'error') {
      throw new Error(`Notion API エラー: ${res.message}`);
    }

    const filtered = res.results.filter(p => p.object === 'page');
    pages.push(...filtered);
    process.stdout.write(`\r  取得済み: ${pages.length} 件 (ページ ${page})`);

    if (!res.has_more) break;
    cursor = res.next_cursor;
    page++;
    await sleep(DELAY_MS);
  }

  console.log(`\n✅ 合計 ${pages.length} 件のページを検出`);
  return pages;
}

// ---- ブロックコンテンツ取得 ----

async function fetchBlocks(blockId) {
  const blocks = [];
  let cursor = undefined;

  while (true) {
    const endpoint = `blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const res = await notionRequest('GET', endpoint);
    if (res.object === 'error') return blocks;
    blocks.push(...(res.results || []));
    if (!res.has_more) break;
    cursor = res.next_cursor;
    await sleep(DELAY_MS);
  }
  return blocks;
}

// ---- ブロック → Markdown 変換 ----

function richTextToMd(richText) {
  if (!richText?.length) return '';
  return richText.map(t => {
    let s = t.plain_text || '';
    if (t.annotations?.bold) s = `**${s}**`;
    if (t.annotations?.italic) s = `*${s}*`;
    if (t.annotations?.code) s = `\`${s}\``;
    if (t.annotations?.strikethrough) s = `~~${s}~~`;
    if (t.href) s = `[${s}](${t.href})`;
    return s;
  }).join('');
}

function blockToMd(block, depth = 0) {
  const indent = '  '.repeat(depth);
  const rt = t => richTextToMd(t);
  const type = block.type;
  const b = block[type] || {};

  switch (type) {
    case 'paragraph':
      return rt(b.rich_text) || '';
    case 'heading_1':
      return `# ${rt(b.rich_text)}`;
    case 'heading_2':
      return `## ${rt(b.rich_text)}`;
    case 'heading_3':
      return `### ${rt(b.rich_text)}`;
    case 'bulleted_list_item':
      return `${indent}- ${rt(b.rich_text)}`;
    case 'numbered_list_item':
      return `${indent}1. ${rt(b.rich_text)}`;
    case 'to_do':
      return `${indent}- [${b.checked ? 'x' : ' '}] ${rt(b.rich_text)}`;
    case 'quote':
      return `> ${rt(b.rich_text)}`;
    case 'code':
      return `\`\`\`${b.language || ''}\n${rt(b.rich_text)}\n\`\`\``;
    case 'callout':
      return `> ${b.icon?.emoji || '💡'} ${rt(b.rich_text)}`;
    case 'divider':
      return '---';
    case 'toggle':
      return `**${rt(b.rich_text)}**`;
    case 'image': {
      const url = b.type === 'external' ? b.external?.url : b.file?.url;
      const caption = rt(b.caption);
      return url ? `![${caption || 'image'}](${url})` : '';
    }
    case 'bookmark':
      return `[${rt(b.caption) || b.url}](${b.url})`;
    case 'link_preview':
      return `[${b.url}](${b.url})`;
    case 'table_of_contents':
      return '';
    case 'column_list':
    case 'column':
      return '';
    default:
      return rt(b.rich_text || []);
  }
}

async function blocksToMarkdown(blocks, depth = 0) {
  const lines = [];
  for (const block of blocks) {
    const line = blockToMd(block, depth);
    if (line !== undefined) lines.push(line);

    // 子ブロックを再帰取得
    if (block.has_children) {
      await sleep(DELAY_MS);
      const children = await fetchBlocks(block.id);
      const childMd = await blocksToMarkdown(children, depth + 1);
      if (childMd) lines.push(childMd);
    }
  }
  return lines.join('\n');
}

// ---- タイトル取得 ----

function getTitle(page) {
  const props = page.properties || {};
  for (const key of ['title', 'Title', 'Name', 'name', '名前', 'タイトル']) {
    const p = props[key];
    if (p?.title?.length) return p.title.map(t => t.plain_text).join('');
  }
  // フォールバック: プロパティの最初の title 型
  for (const p of Object.values(props)) {
    if (p?.type === 'title' && p.title?.length) {
      return p.title.map(t => t.plain_text).join('');
    }
  }
  return '無題';
}

// ---- ファイル保存 ----

function safeFileName(title, date) {
  const safe = title.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_').slice(0, 60);
  return `${date}_${safe}.md`;
}

function buildFrontmatter(title, date, notionUrl) {
  return `---
title: "${title.replace(/"/g, "'")}"
date: ${date}
tags: [notion-import]
status: draft
links: []
source: ${notionUrl}
---\n\n`;
}

// ---- メイン処理 ----

async function main() {
  if (!fs.existsSync(OUTPUT_FOLDER)) {
    fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
  }

  const pages = await fetchAllPages();
  let saved = 0, skipped = 0, errors = 0;

  console.log(`\n📝 Markdownに変換して ${OUTPUT_FOLDER} へ保存中...\n`);

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const title = getTitle(page);
    const createdAt = (page.created_time || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const fileName = safeFileName(title, createdAt);
    const filePath = path.join(OUTPUT_FOLDER, fileName);

    // すでに存在する場合はスキップ
    if (fs.existsSync(filePath)) {
      process.stdout.write(`\r  [${i + 1}/${pages.length}] スキップ: ${title.slice(0, 30)}`);
      skipped++;
      continue;
    }

    process.stdout.write(`\r  [${i + 1}/${pages.length}] 変換中: ${title.slice(0, 30)}...`);

    try {
      await sleep(DELAY_MS);
      const blocks = await fetchBlocks(page.id);
      const body = await blocksToMarkdown(blocks);
      const frontmatter = buildFrontmatter(title, createdAt, page.url);
      const content = frontmatter + `# ${title}\n\n` + (body || '*（本文なし）*');
      fs.writeFileSync(filePath, content, 'utf8');
      saved++;
    } catch (err) {
      errors++;
      fs.writeFileSync(filePath,
        buildFrontmatter(title, createdAt, page.url) +
        `# ${title}\n\n> ⚠️ 取得エラー: ${err.message}`,
        'utf8');
    }
  }

  console.log(`\n\n✅ 移行完了！`);
  console.log(`   保存: ${saved} 件`);
  console.log(`   スキップ（既存）: ${skipped} 件`);
  console.log(`   エラー: ${errors} 件`);
  console.log(`\n📂 保存先: ${OUTPUT_FOLDER}`);
  console.log(`💡 次: cd ~/Documents/ObsidianVault && claude → "ingest" で自動整理`);
}

main().catch(err => {
  console.error('\n❌ 致命的エラー:', err.message);
  process.exit(1);
});
