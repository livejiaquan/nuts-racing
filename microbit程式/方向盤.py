# 核果賽車 — micro:bit 方向盤（MicroPython 版）
#
# 每 20ms 把「傾斜角,A鍵,B鍵,檢查碼」從 USB 序列埠送出。
# 檢查碼 = (abs(傾斜角) + A*7 + B*13) % 97，電腦端對不上就丟掉那一行，
# 因為實測 USB 序列偶爾會掉字（約 1 成的行會缺字元），沒有檢查碼時按鍵狀態會閃動。
#
# 燒錄：拖 方向盤.hex 進 MICROBIT 磁碟，或雙擊 燒錄全部.command。
# 改了這個檔要重新產生 .hex：uflash 方向盤.py 輸出資料夾
#
# 開機亮一下菱形，之後 LED 全暗（迴圈裡不點 LED，才不會拖慢）。

from microbit import *
import math

display.show(Image.DIAMOND)
sleep(300)
display.clear()

while True:
    x = accelerometer.get_x()
    z = accelerometer.get_z()
    roll = int(math.degrees(math.atan2(x, -z if z < 0 else z)))
    a = 1 if button_a.is_pressed() else 0
    b = 1 if button_b.is_pressed() else 0
    c = (abs(roll) + a * 7 + b * 13) % 97
    print("%d,%d,%d,%d" % (roll, a, b, c))
    sleep(18)
