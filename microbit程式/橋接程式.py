#!/usr/bin/env python3
"""核果賽車 — micro:bit 橋接程式（同時也是本機遊戲伺服器）

做兩件事：
1. 把 micro:bit 的序列埠資料轉成瀏覽器可以直接收的串流（Server-Sent Events）。
2. 把上一層的遊戲資料夾當網站伺服，所以一個指令就能在本機玩：
       pip install pyserial
       python3 橋接程式.py                 # 自動找 /dev/cu.usbmodem* 或 COMx
   然後用任何瀏覽器開 http://127.0.0.1:9413 ，按「用橋接程式連」。不用跳裝置選擇視窗，Safari／Firefox 也行。

   指定序列埠與速率：python3 橋接程式.py /dev/cu.usbmodem1202 9600

線上版（https 網址）也可以按「用橋接程式連」接這支程式，但 Chrome 會先問「允許存取本機網路」，要按允許；
其他瀏覽器可能直接擋掉，擋掉就改用「連接 micro:bit」或開 http://127.0.0.1:9413 玩本機版。

開著不要關，Ctrl+C 結束。
"""
import sys, glob, threading, time, json, os, mimetypes
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

GAME_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # 上一層 = 遊戲資料夾

try:
    import serial
except ImportError:
    print("需要 pyserial：pip install pyserial"); sys.exit(1)

PORT_HTTP = 9413
latest = {"line": "", "t": 0.0, "count": 0, "bad": 0, "port": None, "error": None}
dbg = {"sse_iter": 0, "sse_sent": 0}


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
    """找 micro:bit 的序列埠；沒接就回 None（之後每 3 秒再找一次）"""
    cands = glob.glob("/dev/cu.usbmodem*") + glob.glob("/dev/ttyACM*")
    if sys.platform == "win32":
        try:
            from serial.tools import list_ports
            cands += [p.device for p in list_ports.comports() if "mbed" in (p.description or "").lower() or "micro:bit" in (p.description or "").lower() or "usb serial" in (p.description or "").lower()]
        except Exception:
            pass
    return cands[0] if cands else None


def reader(port, baud):
    auto = port is None
    while True:
        try:
            if auto:
                port = find_port()
                if not port:
                    latest["error"] = "找不到 micro:bit，確認 USB 線接好（會自動再找）"
                    latest["port"] = None
                    time.sleep(3)
                    continue
            s = serial.Serial(port, baud, timeout=1)
            latest["port"] = port; latest["error"] = None
            print(f"[bridge] 已連 {port} @ {baud}", flush=True)
            # 注意：不要對板子寫任何東西（Ctrl-C／Ctrl-D 之類）。實測 micro:bit V2 收到之後 USB 序列會整個啞掉，要重燒才會回來。
            s.reset_input_buffer()
            s.timeout = 0.05
            buf = b""
            last_ok = time.time()
            while True:
                chunk = s.read(512)          # 一次讀一塊再自己切行，比 readline 穩
                if time.time() - last_ok > 5:
                    # 5 秒沒資料：把序列埠關掉重開（micro:bit 的 USB 序列偶爾會卡住，重開常常就回來）
                    latest["error"] = "板子沒送資料，重新開序列埠中…（還是沒反應就換 USB 線／插孔，或重燒 方向盤.hex）"
                    print("[bridge] 5 秒沒資料，重開序列埠", flush=True)
                    raise OSError("no data, reopening")
                if not chunk:
                    continue
                buf += chunk
                while b"\n" in buf:
                    raw, buf = buf.split(b"\n", 1)
                    line = raw.decode("utf-8", "ignore").strip()
                    if not line:
                        continue
                    if valid(line):
                        latest["line"] = line; latest["t"] = time.time(); latest["count"] += 1; last_ok = time.time(); latest["error"] = None
                    else:
                        latest["bad"] += 1
                if len(buf) > 200:
                    buf = b""
        except Exception as e:
            if "reopening" not in str(e):
                latest["error"] = str(e)
                print(f"[bridge] 序列埠錯誤：{e}，3 秒後重試", flush=True)
                time.sleep(3)
            else:
                time.sleep(0.5)
            latest["port"] = None
            try:
                s.close()
            except Exception:
                pass


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):  # 安靜
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")   # Chrome：https 頁面存取本機網路要這個
        self.send_header("Cache-Control", "no-cache")

    def do_OPTIONS(self):   # Chrome 的本機網路預檢
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def _static(self, path):
        """伺服遊戲資料夾裡的檔案（index.html、js、lib、microbit程式）"""
        from urllib.parse import unquote
        rel = unquote(path.split("?")[0]).lstrip("/") or "index.html"
        full = os.path.normpath(os.path.join(GAME_DIR, rel))
        if not full.startswith(GAME_DIR) or not os.path.isfile(full):
            self.send_response(404); self._cors(); self.end_headers(); return
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if full.endswith(".js"): ctype = "text/javascript"
        with open(full, "rb") as f: data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") else ""))
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/tilt"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self._cors()
            self.end_headers()
            last = -1
            try:
                while True:
                    dbg["sse_iter"] += 1
                    if latest["count"] != last:
                        last = latest["count"]
                        self.wfile.write(f"data: {latest['line']}\n\n".encode())
                        dbg["sse_sent"] += 1
                    time.sleep(0.01)
            except (BrokenPipeError, ConnectionResetError, OSError):
                return
            except Exception as e:
                print("[bridge] SSE 錯誤：", repr(e)); return
        elif self.path.startswith("/status"):
            body = json.dumps({"port": latest["port"], "error": latest["error"], "count": latest["count"], "bad": latest["bad"],
                               "age_ms": int((time.time() - latest["t"]) * 1000) if latest["t"] else None,
                               "line": latest["line"], "dbg": dbg}, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._cors()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self._static(self.path)


if __name__ == "__main__":
    port = sys.argv[1] if len(sys.argv) > 1 else None   # 沒指定就自動找，拔掉再插也會自己接回來
    baud = int(sys.argv[2]) if len(sys.argv) > 2 else 115200
    if not port and not find_port():
        print("[bridge] 現在找不到 micro:bit，先開著，插上去會自動接。")
    threading.Thread(target=reader, args=(port, baud), daemon=True).start()
    print(f"[bridge] 遊戲：http://127.0.0.1:{PORT_HTTP}/   （開了之後按「用橋接程式連」）")
    print(f"[bridge] 狀態：http://127.0.0.1:{PORT_HTTP}/status")
    ThreadingHTTPServer(("127.0.0.1", PORT_HTTP), H).serve_forever()
