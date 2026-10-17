# micro:bit 方向盤程式

這裡的東西是要燒進每一片 micro:bit 的。上課前把全部板子燒好。

| 檔案 | 用途 |
|---|---|
| `方向盤.hex` | 燒錄用成品。拖進 MICROBIT 磁碟就好，或雙擊 `燒錄全部.command` 一次燒所有接著的板子 |
| `燒錄全部.command` | 雙擊：把 `方向盤.hex` 複製到每個 `/Volumes/MICROBIT*`。多片板子用 USB hub 一起接 |
| `方向盤.py` | 原始碼（MicroPython）。改完用 `uflash 方向盤.py 輸出資料夾` 重新產生 .hex |
| `方向盤_makecode.ts` | 同樣功能的 MakeCode 版，想給學生看積木或改程式時用 |
| `橋接程式.py` | 電腦端：讀 USB 序列埠轉成瀏覽器串流。`pip install pyserial` 後 `python3 橋接程式.py` |

燒好的板子開機會亮一下方塊圖案再熄掉，之後每秒送約 50 筆「傾斜角,A,B,檢查碼」到 USB 序列埠（115200）。檢查碼對不上的行會被丟掉（USB 序列實測約一成會掉字），所以**舊版沒有檢查碼的 .hex 不能用，全部板子要重燒**。遊戲裡 **B 是油門（右手）、A 是煞車（左手）**，像開車一樣。
迴圈裡故意不點 LED，點了會變鈍。

micro:bit V2 已實機驗證（2026-10-17）。V1 沒試過。

## 一次燒很多片

1. 全部用 USB hub 接上電腦，等 Finder 出現 MICROBIT、MICROBIT 1、MICROBIT 2 …
2. 雙擊 `燒錄全部.command`（第一次 macOS 可能擋，右鍵 → 打開）。
3. 每片會重啟、亮一下方塊圖案，就燒好了。
