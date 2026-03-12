#!/bin/bash
# 读取 Claude Code 通过 stdin 传入的 hook 事件 JSON
input=$(cat)

# 记录原始数据到日志（项目相对路径，不同机器通用）
LOG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "[$(date)] $input" >> "$LOG_DIR/hook-events.log"

# 写入临时文件，避免 curl -d "$input" 遇到特殊字符时损坏 JSON
tmpfile=$(mktemp)
printf '%s' "$input" > "$tmpfile"

# 转发到桥接服务器，记录 curl 返回结果
curl_result=$(curl -s -X POST http://127.0.0.1:3456/claude-event \
  -H "Content-Type: application/json" \
  --data @"$tmpfile" 2>&1)
echo "[$(date)] curl result: $curl_result" >> "$LOG_DIR/hook-events.log"

rm -f "$tmpfile"
exit 0
