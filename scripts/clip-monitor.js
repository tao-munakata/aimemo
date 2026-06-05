#!/usr/bin/env node
// クリップボード監視デーモン — CopyQ不要、pbpasteポーリング方式
// 起動: node scripts/clip-monitor.js
// 自動起動: ~/Library/LaunchAgents/com.aimemo.clipmonitor.plist

const { execSync, exec } = require('child_process');
const https = require('https');
const http = require('http');

const API_URL = 'http://localhost:3000/api/memo';
const INTERVAL_MS = 1000;
const MIN_LENGTH = 15;

let lastClip = '';
let lastSaveTime = 0;
const DEDUP_MS = 3000; // 同じ内容を3秒以内に二重保存しない

function getClipboard() {
  try {
    // osascriptでテキスト限定取得（RTF等の文字化け防止）
    const buf = execSync('osascript -e "get the clipboard as text"', { encoding: 'buffer', timeout: 2000 });
    return buf.toString('utf8').trim();
  } catch {
    return '';
  }
}

function shouldSkip(text) {
  const t = text.trim();
  if (t.length < MIN_LENGTH) return true;
  if (/^https?:\/\/\S+$/.test(t)) return true;           // URLのみ
  if (/^[A-Za-z0-9!@#$%^&*_+\-=]{30,}$/.test(t)) return true; // パスワードっぽい

  // 文字化け検出: 置換文字(U+FFFD)が10%超なら破棄
  const replacements = (t.match(/�/g) || []).length;
  if (replacements / t.length > 0.1) {
    console.log(`[スキップ] 文字化け検出 (置換文字率 ${Math.round(replacements/t.length*100)}%)`);
    return true;
  }
  return false;
}

function notify(message) {
  const safe = message.replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 60);
  exec(`osascript -e 'display notification "${safe}" with title "ひらめきポスト" subtitle "クリップ保存"'`);
}

function postToAPI(content) {
  const body = JSON.stringify({
    content,
    folder: '00_Inbox',
    ai_mode: 'none',
    tags: ['clip', 'auto'],
  });

  const url = new URL(API_URL);
  const options = {
    hostname: url.hostname,
    port: url.port || 3000,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.success) {
          const preview = content.slice(0, 40).replace(/\n/g, ' ');
          notify(preview);
          console.log(`[保存] ${new Date().toLocaleTimeString('ja-JP')} — ${preview}`);
        }
      } catch { /* ignore parse error */ }
    });
  });

  req.on('error', (e) => {
    console.error(`[エラー] API接続失敗: ${e.message} (AIメモ窓は起動していますか?)`);
  });

  req.write(body);
  req.end();
}

function check() {
  const clip = getClipboard();
  if (!clip || clip === lastClip) return;

  const now = Date.now();
  if (now - lastSaveTime < DEDUP_MS) return;

  if (shouldSkip(clip)) {
    lastClip = clip;
    return;
  }

  lastClip = clip;
  lastSaveTime = now;
  postToAPI(clip);
}

console.log(`ひらめきポスト クリップ監視 起動 (${INTERVAL_MS}ms間隔)`);
console.log(`保存先: ${API_URL}`);
setInterval(check, INTERVAL_MS);
