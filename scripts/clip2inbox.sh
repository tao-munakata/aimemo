#!/bin/bash
# クリップボードの内容を Obsidian 00_Inbox に保存する

CONTENT=$(pbpaste)

if [ -z "$CONTENT" ]; then
  osascript -e 'display notification "クリップボードが空です" with title "AIメモ窓"'
  exit 1
fi

RESPONSE=$(curl -s -X POST http://localhost:3000/api/memo \
  -H "Content-Type: application/json" \
  -d "{\"content\": $(python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' <<< "$CONTENT"), \"folder\": \"00_Inbox\"}")

SUCCESS=$(echo "$RESPONSE" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("success","false"))' 2>/dev/null)

if [ "$SUCCESS" = "True" ] || [ "$SUCCESS" = "true" ]; then
  PREVIEW=$(echo "$CONTENT" | head -c 40 | tr '\n' ' ')
  osascript -e "display notification \"📥 ${PREVIEW}...\" with title \"Inboxに保存しました\""
else
  osascript -e 'display notification "保存失敗。AIメモ窓が起動しているか確認してください" with title "AIメモ窓 エラー"'
fi
