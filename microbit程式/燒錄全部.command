#!/bin/bash
# 把 方向盤.hex 燒進目前接在電腦上的每一片 micro:bit（雙擊就能跑）
# macOS 會把多片 micro:bit 掛成 /Volumes/MICROBIT、/Volumes/MICROBIT 1、/Volumes/MICROBIT 2 …
cd "$(dirname "$0")"
HEX="方向盤.hex"
n=0
for v in /Volumes/MICROBIT*; do
  [ -d "$v" ] || continue
  echo "燒錄 → $v"
  cp "$HEX" "$v/" && n=$((n+1))
done
if [ "$n" -eq 0 ]; then
  echo "沒有找到 micro:bit，確認 USB 線接好、磁碟有出現在 Finder。"
else
  echo "完成：$n 片。等板子重啟（亮一下方塊圖案）就好。"
fi
echo; read -p "按 Enter 關閉" _
