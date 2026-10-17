// 核果賽車 — micro:bit 方向盤（MakeCode JavaScript 版）
//
// 用法：makecode.microbit.org 新專案 → 右上角切到 JavaScript → 整段貼上 → 下載 .hex。
// 每輪送「傾斜角,A,B,檢查碼」；檢查碼 = (abs(傾斜角) + A*7 + B*13) % 97，
// 電腦端對不上就丟掉那一行（USB 序列偶爾會掉字）。
// 迴圈裡不要加 LED 顯示，會拖慢方向盤。

serial.redirectToUSB()
serial.setBaudRate(BaudRate.BaudRate115200)

basic.showLeds(`
    . . # . .
    . # # # .
    # # # # #
    . # # # .
    . . # . .
    `)
basic.pause(400)
basic.clearScreen()

basic.forever(function () {
    const roll = input.rotation(Rotation.Roll)
    const a = input.buttonIsPressed(Button.A) ? 1 : 0
    const b = input.buttonIsPressed(Button.B) ? 1 : 0
    const c = (Math.abs(roll) + a * 7 + b * 13) % 97
    serial.writeLine("" + roll + "," + a + "," + b + "," + c)
})
