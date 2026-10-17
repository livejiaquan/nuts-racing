// micro:bit 方向盤：USB 序列埠（Web Serial）
// micro:bit 端每行送 "roll,a,b"，roll 是左右傾斜角度（度），a/b 是按鈕 0/1

export const MB = {
  port: null, reader: null, connected: false,
  baud: 115200,
  rawRoll: 0, zero: 0,
  steer: 0,            // 平滑後 -1..1
  a: false, b: false,
  lastData: 0, buf: '',
  mode: null,           // 'serial' | 'bridge'
  es: null,
  status: '未連線（用鍵盤開車）'
};

// 橋接模式：讀本機 microbit_bridge.py 送出的 SSE 串流，不需要瀏覽器的裝置選擇視窗
export async function connectBridge(url = 'http://127.0.0.1:9413/tilt') {
  if (MB.connected) { await disconnect(); return; }
  const r = await fetch(url.replace('/tilt', '/status'), { cache: 'no-store' }).catch(() => null);
  if (!r || !r.ok) throw new Error(location.protocol === 'https:' ? '連不到本機橋接程式：確認 橋接程式.py 有在跑，Chrome 跳「允許存取本機網路」要按允許；不行就改用「連接 micro:bit」' : '找不到橋接程式，先執行 python3 橋接程式.py');
  const info = await r.json();
  if (info.error) throw new Error('橋接程式讀不到 micro:bit：' + info.error);
  MB.es = new EventSource(url);
  MB.es.onmessage = (e) => parse(e.data);
  MB.es.onerror = () => { if (MB.connected) MB.status = '橋接中斷，確認 microbit_bridge.py 還在跑'; };
  MB.connected = true; MB.mode = 'bridge';
  MB.status = '橋接已連（' + (info.port || '') + '），等待資料…';
}

export const serialAvailable = ('serial' in navigator);

export async function connect() {
  if (MB.connected) { await disconnect(); return; }
  MB.port = await navigator.serial.requestPort({});
  await MB.port.open({ baudRate: MB.baud, dataBits: 8, stopBits: 1, parity: 'none', bufferSize: 1024 });
  MB.connected = true; MB.mode = 'serial';
  MB.status = '已連線，等待資料…';
  readLoop();
}

export async function disconnect() {
  MB.connected = false; MB.mode = null;
  try { if (MB.es) { MB.es.close(); MB.es = null; } } catch (e) {}
  try { if (MB.reader) { await MB.reader.cancel(); MB.reader.releaseLock(); } } catch (e) {}
  try { if (MB.port) await MB.port.close(); } catch (e) {}
  MB.reader = null; MB.port = null;
  MB.steer = 0; MB.a = MB.b = false;
  MB.status = '未連線（用鍵盤開車）';
}

async function readLoop() {
  const dec = new TextDecoder();
  try {
    MB.reader = MB.port.readable.getReader();
    while (MB.connected) {
      const { value, done } = await MB.reader.read();
      if (done) break;
      MB.buf += dec.decode(value, { stream: true });
      let i;
      while ((i = MB.buf.indexOf('\n')) >= 0) {
        const line = MB.buf.slice(0, i).trim();
        MB.buf = MB.buf.slice(i + 1);
        if (line) parse(line);
      }
      if (MB.buf.length > 400) MB.buf = '';
    }
  } catch (err) {
    if (MB.connected) MB.status = '讀取中斷：' + (err && err.message ? err.message : err);
  }
}

// 一行是 "roll,a,b,c"，c 是檢查碼 (abs(roll)+a*7+b*13)%97。
// USB 序列實測約一成的行會掉字，對不上檢查碼就整行丟掉，沿用上一筆有效狀態。
MB.good = 0; MB.bad = 0;
function parse(line) {
  const parts = line.split(',');
  if (parts.length !== 4) { MB.bad++; return; }
  const r = parseInt(parts[0], 10), a = parts[1], b = parts[2], c = parseInt(parts[3], 10);
  if (!Number.isFinite(r) || !Number.isFinite(c) || (a !== '0' && a !== '1') || (b !== '0' && b !== '1')) { MB.bad++; return; }
  if ((Math.abs(r) + (a === '1' ? 7 : 0) + (b === '1' ? 13 : 0)) % 97 !== c) { MB.bad++; return; }
  MB.rawRoll = r; MB.a = a === '1'; MB.b = b === '1';
  MB.lastData = performance.now(); MB.good++;
}

export function zero() { MB.zero = MB.rawRoll; }

export function toggleBaud() {
  MB.baud = MB.baud === 115200 ? 9600 : 115200;
  return MB.baud;
}

// 傾斜 → 轉向。死區 + 範圍 + 曲線 + 時間一致的低通濾波，手感就靠這裡
export const TILT = { dead: 4, range: 32, curve: 1.4, smooth: 14 };

export function steer(dt) {
  if (!MB.connected) return null;
  if (performance.now() - MB.lastData > 700) {
    MB.status = '已連線，但收不到資料（檢查 micro:bit 程式）';
    return null;
  }
  const d = MB.rawRoll - MB.zero;
  const sign = d < 0 ? -1 : 1;
  let mag = Math.abs(d);
  mag = mag < TILT.dead ? 0 : Math.min(1, (mag - TILT.dead) / (TILT.range - TILT.dead));
  mag = Math.pow(mag, TILT.curve);
  const target = sign * mag;
  const k = 1 - Math.exp(-dt * TILT.smooth);
  MB.steer += (target - MB.steer) * k;
  MB.status = '方向盤連線中　傾斜 ' + Math.round(d) + '°';
  return MB.steer;
}
