#!/usr/bin/env python3
"""核果賽車 — micro:bit 橋接程式

把 micro:bit 的序列埠資料轉成瀏覽器可以直接收的串流（Server-Sent Events），
遊戲按「用橋接程式連」就能收到，不用瀏覽器跳裝置選擇視窗，Safari／Firefox 也能用。

用法：
    pip install pyserial
    python3 microbit_bridge.py            # 自動找 /dev/cu.usbmodem* 或 COMx
    python3 microbit_bridge.py /dev/cu.usbmodem1202 115200

開著不要關，遊戲那邊按「用橋接程式連」。Ctrl+C 結束。
"""
import sys, glob, threading, time, json
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

try:
    import serial
except ImportError:
    print("需要 pyserial：pip install pyserial"); sys.exit(1)

PORT_HTTP = 9413
latest = {"line": "", "t": 0.0, "count": 0, "bad": 0, "port": None, "error": None}


def valid(line):
    """檢查「roll,a,b,c」的檢查碼，USB 序列偶爾掉字，壞行直接丟"""
    p = line.split(",")
    if len(p) != 4 or p[1] not in ("0", "1") or p[2] not in ("0", "1"):
        return False
    try:
        r, c = int(p[0]), int(p[3])
    except ValueError:
        return False
    return (abs(r) + int(p[1]) * 7 + int(p[2]) * 13) % 97 == c


def find_port():
    cands = glob.glob("/dev/cu.usbmodem*") + glob.glob("/dev/ttyACM*") + [f"COM{i}" for i in range(3, 20)]
    return cands[0] if cands else None


def reader(port, baud):
    while True:
        try:
            s = serial.Serial(port, baud, timeout=1)
            latest["port"] = port; latest["error"] = None
            print(f"[bridge] 已連 {port} @ {baud}")
            s.reset_input_buffer()
            while True:
                raw = s.readline()
                if not raw:
                    continue
                line = raw.decode("utf-8", "ignore").strip()
                if not line:
                    continue
                if valid(line):
                    latest["line"] = line; latest["t"] = time.time(); latest["count"] += 1
                else:
                    latest["bad"] += 1
        except Exception as e:
            latest["error"] = str(e)
            print(f"[bridge] 序列埠錯誤：{e}，3 秒後重試")
            time.sleep(3)


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):  # 安靜
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")

    def do_GET(self):
        if self.path.startswith("/tilt"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self._cors()
            self.end_headers()
            last = -1
            try:
                while True:
                    if latest["count"] != last:
                        last = latest["count"]
                        self.wfile.write(f"data: {latest['line']}\n\n".encode())
                        self.wfile.flush()
                    time.sleep(0.01)
            except (BrokenPipeError, ConnectionResetError):
                return
        else:
            body = json.dumps({"port": latest["port"], "error": latest["error"], "count": latest["count"], "bad": latest["bad"],
                               "age_ms": int((time.time() - latest["t"]) * 1000) if latest["t"] else None,
                               "line": latest["line"]}, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._cors()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)


if __name__ == "__main__":
    port = sys.argv[1] if len(sys.argv) > 1 else find_port()
    baud = int(sys.argv[2]) if len(sys.argv) > 2 else 115200
    if not port:
        print("找不到 micro:bit 的序列埠，確認 USB 線接好。"); sys.exit(1)
    threading.Thread(target=reader, args=(port, baud), daemon=True).start()
    print(f"[bridge] http://127.0.0.1:{PORT_HTTP}/tilt  （遊戲按「用橋接程式連」）")
    ThreadingHTTPServer(("127.0.0.1", PORT_HTTP), H).serve_forever()
