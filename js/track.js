// 賽道：中心線曲線、路面、路肩、護欄、看板、拱門、道具
import * as THREE from 'three';
import { PALETTE, makeCanvasTexture } from './world.js';

export const ROAD_HALF = 7.5;       // 路面半寬
export const SAMPLES = 1800;        // 中心線取樣數

import { TRACK } from './osm_data.js';

export function buildCurve() {
  const pts = TRACK.map(p => new THREE.Vector3(p.x, p.y || 0, p.z));
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
}

// 預先取樣：點、切線、右向量、累積距離
export function sampleCurve(curve) {
  const up = new THREE.Vector3(0, 1, 0);
  const S = { p: [], t: [], r: [], d: [], name: [], w: [], rail: [], length: 0 };
  let acc = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const u = i / SAMPLES;
    const p = curve.getPointAt(u);
    if (p.y < 0) p.y = 0;   // 曲線在平地段會往下凹（最深 -1.3 m），凹到草地下面路就會「不見」
    const t = curve.getTangentAt(u).normalize();
    t.y = 0; t.normalize();                         // 航向只看水平
    const r = new THREE.Vector3().crossVectors(t, up).normalize();
    if (i > 0) acc += p.distanceTo(S.p[i - 1]);
    S.p.push(p); S.t.push(t); S.r.push(r); S.d.push(acc);
    // 這個取樣點屬於哪條路：找最近的控制點
    let bi = 0, bd = Infinity;
    for (let k = 0; k < TRACK.length; k++) { const dd = (TRACK[k].x - p.x) ** 2 + (TRACK[k].z - p.z) ** 2; if (dd < bd) { bd = dd; bi = k; } }
    S.name.push(TRACK[bi].n); S.w.push(TRACK[bi].w || ROAD_HALF); S.rail.push(TRACK[bi].r === 0 ? 0 : 1);
  }
  // 護欄的寬限：剛進無護欄段的前 60 個取樣（約 80 公尺）還算有護欄，免得在交界處被誤判掉下去
  S.railSoft = S.rail.slice();
  for (let i = 0; i < SAMPLES; i++) {
    if (S.rail[i]) continue;
    for (let k = 1; k <= 60; k++) if (S.rail[((i - k) % SAMPLES + SAMPLES) % SAMPLES]) { S.railSoft[i] = 1; break; }
  }
  // 路寬在路口附近平滑過渡，不要一刀切
  const raw = S.w.slice();
  for (let i = 0; i < SAMPLES; i++) {
    let acc = 0, n = 0;
    for (let k = -45; k <= 45; k++) { acc += raw[((i + k) % SAMPLES + SAMPLES) % SAMPLES]; n++; }
    S.w[i] = acc / n;
  }
  S.length = acc + S.p[SAMPLES - 1].distanceTo(S.p[0]);
  return S;
}

// 找離 pos 最近的取樣點。hint 是上一次的 index，只在附近找，省時間
export function nearest(S, pos, hint = -1, window = 60) {
  let best = -1, bestD = Infinity;
  const check = (i) => {
    const ii = ((i % SAMPLES) + SAMPLES) % SAMPLES;
    const dx = S.p[ii].x - pos.x, dz = S.p[ii].z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = ii; }
  };
  if (hint < 0) { for (let i = 0; i < SAMPLES; i += 2) check(i); }
  else { for (let i = hint - window; i <= hint + window; i++) check(i); }
  const r = S.r[best];
  const lateral = (pos.x - S.p[best].x) * r.x + (pos.z - S.p[best].z) * r.z;   // 正值在右邊
  return { index: best, lateral, point: S.p[best], tangent: S.t[best], right: r, u: best / SAMPLES, w: S.w[best] };
}

function roadTexture() {
  return makeCanvasTexture(256, 512, (g, w, h) => {
    g.fillStyle = '#474C55'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // 兩側白線
    g.fillStyle = '#FFFFFF';
    g.fillRect(8, 0, 7, h); g.fillRect(w - 15, 0, 7, h);
    // 中央虛線（奶油色）
    g.fillStyle = '#FDF6E3';
    g.fillRect(w / 2 - 4, 40, 8, 200);
  });
}

export function buildRoad(S, scene) {
  const n = SAMPLES;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const uv = new Float32Array((n + 1) * 2 * 2);
  const idx = [];
  const repeat = S.length / 18;   // 每 18 公尺重複一次貼圖
  for (let i = 0; i <= n; i++) {
    const ii = i % n;
    const p = S.p[ii], r = S.r[ii];
    const v = (S.d[ii] + (i === n ? S.length : 0)) / S.length * repeat;
    const hw = S.w[ii];
    pos.set([p.x - r.x * hw, p.y + 0.02, p.z - r.z * hw], i * 6);
    pos.set([p.x + r.x * hw, p.y + 0.02, p.z + r.z * hw], i * 6 + 3);
    uv.set([0, v], i * 4); uv.set([1, v], i * 4 + 2);
    if (i < n) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, b, c, b, d, c);   // 繞向要讓法線朝上
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const tex = roadTexture();
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const road = new THREE.Mesh(geo, mat);
  road.receiveShadow = true;
  scene.add(road);

  // 路緣（紅白相間，台灣路邊常見）＋人行道
  const curb = buildStrip(S, (i) => S.w[i], (i) => S.w[i] + 0.5, 0.14, (i) => S.rail[i] ? (Math.floor(S.d[i] / 3) % 2 ? 0xD7262C : 0xF4F1E8) : (Math.floor(S.d[i] / 3) % 2 ? 0xF2C200 : 0x1B1B1B));
  scene.add(curb);
  const walk = buildStrip(S, (i) => S.w[i] + 0.5, (i) => S.rail[i] ? S.w[i] + 3.2 : S.w[i] + 1.2, 0.12, (i) => (Math.floor(S.d[i] / 2) % 2 ? 0xC9C5BA : 0xBFBBB0));
  scene.add(walk);

  // 起跑線：黑白格
  const startIdx = 0;
  const sp = S.p[startIdx], sr = S.r[startIdx], st = S.t[startIdx];
  const W0 = S.w[0];
  const cols = 8, rows = 2, cw = (W0 * 2) / cols, ch = 1.6;
  const checker = new THREE.Group();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch),
      new THREE.MeshBasicMaterial({ color: (r + c) % 2 ? 0x1B1B1B : 0xFDF6E3 }));
    m.rotation.x = -Math.PI / 2;
    const lat = -W0 + cw * (c + 0.5);
    const lon = 2 + ch * r;
    m.position.set(sp.x + sr.x * lat + st.x * lon, sp.y + 0.04, sp.z + sr.z * lat + st.z * lon);
    const ang = Math.atan2(st.x, st.z);
    m.rotation.z = -ang;
    checker.add(m);
  }
  scene.add(checker);
  return road;
}

function buildStrip(S, aFn, bFn, y, colorFn) {
  const n = SAMPLES;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const col = new Float32Array((n + 1) * 2 * 3);
  const idx = [];
  const c = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const ii = i % n;
    const p = S.p[ii], r = S.r[ii], a = aFn(ii), b = bFn(ii);
    const yy = (y < -0.5 && p.y < 0.6) ? -3 : p.y + y;   // 底板在地面段藏到地下
    pos.set([p.x + r.x * a, yy, p.z + r.z * a], i * 6);
    pos.set([p.x + r.x * b, yy, p.z + r.z * b], i * 6 + 3);
    c.set(colorFn(ii));
    col.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    if (i < n) {
      const q = i * 2, w = i * 2 + 1, e = (i + 1) * 2, t = (i + 1) * 2 + 1;
      idx.push(q, w, e, w, t, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  // 左右兩邊都要
  const mirror = mesh.clone();
  const pos2 = pos.slice();
  for (let i = 0; i <= n; i++) {
    const ii = i % n;
    const p = S.p[ii], r = S.r[ii], a = aFn(ii), b = bFn(ii);
    const yy = (y < -0.5 && p.y < 0.6) ? -3 : p.y + y;
    pos2.set([p.x - r.x * a, yy, p.z - r.z * a], i * 6);
    pos2.set([p.x - r.x * b, yy, p.z - r.z * b], i * 6 + 3);
  }
  const geo2 = geo.clone();
  geo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
  geo2.computeVertexNormals();
  mirror.geometry = geo2;
  const g = new THREE.Group(); g.add(mesh, mirror);
  return g;
}

// 護欄：一格一格的橘白輪胎牆
export function buildBarriers(S, scene) {
  const geo = new THREE.BoxGeometry(2.0, 0.6, 0.8);
  const matA = new THREE.MeshLambertMaterial({ color: PALETTE.orange });
  const matB = new THREE.MeshLambertMaterial({ color: PALETTE.cream });
  const list = [];
  const step = 2.2, dist = ROAD_HALF + 6.8;
  let next = 0;
  for (let i = 0; i < SAMPLES; i++) {
    if (S.d[i] < next) continue;
    next += step;
    list.push(i);
  }
  const mA = new THREE.InstancedMesh(geo, matA, list.length);
  const mB = new THREE.InstancedMesh(geo, matB, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  let ia = 0, ib = 0;
  list.forEach((i, k) => {
    for (const side of [-1, 1]) {
      const r = S.r[i], t = S.t[i];
      p.set(S.p[i].x + r.x * dist * side, 0.3, S.p[i].z + r.z * dist * side);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(t.x, t.z));
      m.compose(p, q, s);
      if ((k + (side > 0 ? 1 : 0)) % 2) mA.setMatrixAt(ia++, m); else mB.setMatrixAt(ib++, m);
    }
  });
  mA.count = ia; mB.count = ib;
  for (const im of [mA, mB]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
}

// 起終點拱門（group 的局部座標：x 是橫向、z 是前進方向）
export function buildGate(S, scene) {
  const g = new THREE.Group();
  const p = S.p[0], t = S.t[0];
  const w = S.w[0] * 2 + 6;
  const pillarGeo = new THREE.BoxGeometry(1.2, 8, 1.2);
  const pillarMat = new THREE.MeshLambertMaterial({ color: PALETTE.forest });
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(pillarGeo, pillarMat);
    m.position.set((w / 2) * side, 4, 0);
    m.castShadow = true; g.add(m);
  }
  const beamTex = makeCanvasTexture(1024, 160, (c, W, H) => {
    c.fillStyle = '#FDF6E3'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#1E5631'; c.fillRect(0, 0, W, 10); c.fillRect(0, H - 10, W, 10);
    c.font = '700 84px "PingFang TC","Noto Sans TC",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('核 果 賽 車', W / 2, H / 2 - 4);
    c.fillStyle = '#E8743B';
    c.font = '700 30px sans-serif';
    c.fillText('START  /  FINISH', W / 2, H - 32);
  });
  const faceMat = new THREE.MeshLambertMaterial({ map: beamTex });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 2.2, 1.4),
    [pillarMat, pillarMat, pillarMat, pillarMat, faceMat, faceMat]);
  beam.position.y = 8.6;
  beam.castShadow = true;
  g.add(beam);
  for (let i = -3; i <= 3; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8),
      new THREE.MeshLambertMaterial({ color: i % 2 ? PALETTE.orange : PALETTE.cream, side: THREE.DoubleSide }));
    f.position.set(i * 2.6, 10.2, 0);
    g.add(f);
  }
  g.position.set(p.x + t.x * 1, 0, p.z + t.z * 1);
  g.rotation.y = Math.atan2(t.x, t.z);
  scene.add(g);
}

function billboardTexture(title, sub) {
  return makeCanvasTexture(768, 384, (c, W, H) => {
    c.fillStyle = '#FDF6E3'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#1E5631'; c.lineWidth = 22; c.strokeRect(11, 11, W - 22, H - 22);
    c.fillStyle = '#1E5631';
    c.font = '700 110px "PingFang TC","Noto Sans TC",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(title, W / 2, H / 2 - 40);
    c.fillStyle = '#E8743B';
    c.font = '700 54px "PingFang TC","Noto Sans TC",sans-serif';
    c.fillText(sub, W / 2, H / 2 + 80);
  });
}

export function buildBillboards(S, scene) {
  const texts = [['核果資訊學苑', '高雄校'], ['micro:bit', '自走車班'], ['Tiny:bit', '小車出動'], ['核果資訊學苑', 'STEAM 程式教育']];
  const spots = [220, 520, 790, 1050];
  spots.forEach((d, k) => {
    const i = S.d.findIndex(x => x >= d);
    if (i < 0) return;
    const side = k % 2 ? 1 : -1;
    const p = S.p[i], r = S.r[i], t = S.t[i];
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 0.5),
      new THREE.MeshLambertMaterial({ map: billboardTexture(...texts[k % texts.length]) }));
    board.position.y = 8;
    board.castShadow = true;
    g.add(board);
    for (const x of [-5, 5]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 5, 8), new THREE.MeshLambertMaterial({ color: 0x5B3A20 }));
      leg.position.set(x, 2.5, 0); leg.castShadow = true; g.add(leg);
    }
    const dist = ROAD_HALF + 14;
    g.position.set(p.x + r.x * dist * side, 0, p.z + r.z * dist * side);
    // 面向賽道
    g.lookAt(p.x, 8, p.z);
    scene.add(g);
  });
}

// 觀眾席：一排彩色方塊當人群
export function buildGrandstands(S, scene) {
  const spots = [60, 640];
  const crowdTex = makeCanvasTexture(512, 128, (c, W, H) => {
    c.fillStyle = '#2B2B2B'; c.fillRect(0, 0, W, H);
    const cols = ['#E8743B', '#FDF6E3', '#3F7FD0', '#D8B21A', '#8E4FC0', '#49A86B', '#FF6B9D'];
    for (let y = 10; y < H; y += 22) for (let x = 6; x < W; x += 14) {
      c.fillStyle = cols[Math.floor(Math.random() * cols.length)];
      c.beginPath(); c.arc(x + Math.random() * 4, y + Math.random() * 4, 5, 0, 7); c.fill();
    }
  });
  spots.forEach((d, k) => {
    const i = S.d.findIndex(x => x >= d);
    if (i < 0) return;
    const side = k % 2 ? -1 : 1;
    const p = S.p[i], r = S.r[i];
    const g = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.BoxGeometry(30, 6, 8),
      [null, null, null, null, new THREE.MeshLambertMaterial({ map: crowdTex }), new THREE.MeshLambertMaterial({ map: crowdTex })]
        .map(m => m || new THREE.MeshLambertMaterial({ color: 0x3A3A3A })));
    stand.position.y = 3; stand.rotation.x = -0.35;
    stand.castShadow = true; stand.receiveShadow = true;
    g.add(stand);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(32, 0.5, 10), new THREE.MeshLambertMaterial({ color: PALETTE.forest }));
    roof.position.set(0, 9, -1); roof.castShadow = true; g.add(roof);
    for (const x of [-15, 15]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 8), new THREE.MeshLambertMaterial({ color: 0xDDDDDD }));
      pole.position.set(x, 4.5, -4.5); g.add(pole);
    }
    const dist = ROAD_HALF + 14;
    g.position.set(p.x + r.x * dist * side, 0, p.z + r.z * dist * side);
    g.lookAt(p.x, 0, p.z);
    scene.add(g);
  });
}

// ---------- 道具 ----------
// 核果：照核果資訊學苑的 logo 做——扁平、兩色橘身、深咖啡光滑殼斗、白色描邊，不走寫實
export function makeNutMesh() {
  const g = new THREE.Group();
  // 果身：圓潤蛋形，底部微尖
  const prof = [];
  const N = 20;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = 0.92 * Math.pow(Math.sin(Math.min(1, t * 1.06) * Math.PI / 2), 0.62);
    prof.push(new THREE.Vector2(Math.max(0.02, r), -0.95 + t * 1.65));
  }
  const bodyGeo = new THREE.LatheGeometry(prof, 36);
  // 兩色：用頂點色做左橘右淡（logo 是左深右淺）
  const pos = bodyGeo.attributes.position, col = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(0xF59A3C), cB = new THREE.Color(0xFFD9A3), cc = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.smoothstep(pos.getX(i), -0.6, 0.6);
    cc.copy(cA).lerp(cB, k); col.set([cc.r, cc.g, cc.b], i * 3);
  }
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // Lambert＋自發光：背光面也亮，像 logo 那種平塗感
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xE08A38, emissiveIntensity: 0.4 }));
  // 殼斗：光滑深咖啡，像一頂帽子
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.0, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.44),
    new THREE.MeshLambertMaterial({ color: 0x6B4324, emissive: 0x3A2212, emissiveIntensity: 0.45 }));
  cap.position.y = 0.2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.07, 10, 36), new THREE.MeshStandardMaterial({ color: 0x4E321A, roughness: 0.9 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.32;
  // 蒂頭
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.42, 8), new THREE.MeshStandardMaterial({ color: 0x4E321A, roughness: 1 }));
  stem.position.set(0.05, 1.3, 0); stem.rotation.z = -0.15;
  // 白色描邊（反向外殼），和 logo 一樣有一圈白邊
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0xFFFBF0, side: THREE.BackSide });
  for (const [geo, y, sc] of [[bodyGeo, 0, 1.13], [cap.geometry, 0.2, 1.12]]) {
    const o = new THREE.Mesh(geo, outlineMat); o.position.y = y; o.scale.setScalar(sc); g.add(o);
  }
  // 柔和光暈，讓道具在路上一眼看到（比之前小、淡）
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xFFD080, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(3.4, 3.4, 1); glow.position.y = 0.2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 1.2, 36),
    new THREE.MeshBasicMaterial({ color: 0xFFE2A0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -1.05;
  g.add(body, cap, rim, stem, glow, ring);
  g.traverse(o => { if (o.isMesh && o.material !== outlineMat) o.castShadow = true; });
  return g;
}
let _glow = null;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,230,160,0.9)'); grad.addColorStop(0.4, 'rgba(255,200,100,0.35)'); grad.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c); return _glow;
}

export function makeConeMesh() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.3), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  base.position.y = 0.06;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 10), new THREE.MeshStandardMaterial({ color: 0xFF8A2A, emissive: 0x8A2E00, emissiveIntensity: 0.45, roughness: 0.6 }));
  cone.position.y = 0.85;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.4, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xFFFFFF, emissiveIntensity: 0.5 }));
  ring.position.y = 1.0;
  g.add(base, cone, ring);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeBoostPad() {
  const tex = makeCanvasTexture(256, 256, (c, W, H) => {
    c.fillStyle = '#1E5631'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#7CFF8A';
    for (let k = 0; k < 3; k++) {
      const y = 50 + k * 70;
      c.beginPath(); c.moveTo(40, y + 40); c.lineTo(128, y - 10); c.lineTo(216, y + 40);
      c.lineTo(216, y + 60); c.lineTo(128, y + 12); c.lineTo(40, y + 60); c.closePath(); c.fill();
    }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 5),
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0x3BFF7A, emissiveMap: tex, emissiveIntensity: 1.0, roughness: 0.5 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  return m;
}

// 把道具擺到賽道上。回傳 {nuts, cones, pads}
// 找彎道：看前後 24 個取樣的航向差
export function findCorners(S) {
  const turn = new Float32Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const a = S.t[(i - 24 + SAMPLES) % SAMPLES], b = S.t[(i + 24) % SAMPLES];
    turn[i] = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);   // 正：左轉；負：右轉
  }
  const corners = [];
  let inC = false, start = 0, sum = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const strong = Math.abs(turn[i]) > 0.28;
    if (strong && !inC) { inC = true; start = i; sum = 0; }
    if (inC) sum += turn[i];
    if (!strong && inC) { inC = false; corners.push({ start, end: i, dir: Math.sign(sum), apex: Math.floor((start + i) / 2) }); }
  }
  return { turn, corners };
}

export function placeItems(S, scene) {
  const nuts = [], cones = [], pads = [];
  const nutProto = makeNutMesh();
  const coneProto = makeConeMesh();
  const { turn, corners } = findCorners(S);

  // 核果：每 20 公尺一顆。直路左右交錯，彎道擺在內側（引導走賽車線）
  for (let d = 40, k = 0; d < S.length - 20; d += 20, k++) {
    const i = S.d.findIndex(x => x >= d);
    const hw = S.w[i];
    let lat = Math.sin(k * 1.3) * (hw - 2.4);
    if (Math.abs(turn[i]) > 0.2) lat = -Math.sign(turn[i]) * (hw - 3.0) * 0.7;   // 左轉時內側在左（負）
    const m = nutProto.clone();
    m.scale.set(0.95, 0.95, 0.95);
    const p = S.p[i], r = S.r[i];
    m.position.set(p.x + r.x * lat, p.y + 1.15, p.z + r.z * lat);
    scene.add(m);
    nuts.push({ mesh: m, alive: true, index: i, lat, spin: Math.random() * 6 });
  }
  // 三角錐：直路上每 90 公尺一組（不擋正中間）；彎道前 40 公尺做減速彎（chicane）
  const putCone = (i, lat) => {
    const m = coneProto.clone();
    m.position.set(S.p[i].x + S.r[i].x * lat, S.p[i].y, S.p[i].z + S.r[i].z * lat);
    scene.add(m); cones.push({ mesh: m, index: i, lat, hit: 0, vel: null });
  };
  for (let d = 150, k = 0; d < S.length - 60; d += 90, k++) {
    const i = S.d.findIndex(x => x >= d);
    if (Math.abs(turn[i]) > 0.15) continue;
    const hw = S.w[i];
    const lats = [-hw + 2, -2.8, 2.8, hw - 2];
    putCone(i, lats[k % 4]);
    if (k % 2 === 0) putCone(Math.min(SAMPLES - 1, i + 14), lats[(k + 2) % 4]);
  }
  for (const c of corners) {
    const i0 = (c.start - 40 + SAMPLES) % SAMPLES;
    const hw = S.w[i0];
    // 兩排錯開的錐，逼你左右閃一下
    putCone(i0, -hw * 0.45); putCone((i0 + 10) % SAMPLES, hw * 0.45); putCone((i0 + 20) % SAMPLES, -hw * 0.45);
  }
  // 加速板：每個彎道出口 20 公尺處一塊
  for (const c of corners) {
    const i = (c.end + 20) % SAMPLES;
    const m = makeBoostPad();
    const p = S.p[i], t = S.t[i];
    m.scale.set(S.w[i] / 7.5, 1, 1);
    m.position.set(p.x, p.y + 0.06, p.z);
    m.rotation.z = -Math.atan2(t.x, t.z);
    scene.add(m);
    pads.push({ mesh: m, index: i, lat: 0 });
  }
  return { nuts, cones, pads, corners };
}

// 橋：路面高於地面的地方加欄杆、橋墩、橋面側板
export function buildBridges(S, scene) {
  const railGeo = new THREE.BoxGeometry(0.25, 1.1, 1.0);
  const railMat = new THREE.MeshLambertMaterial({ color: 0xE8E4DA });
  const pierGeo = new THREE.CylinderGeometry(1.6, 1.8, 1, 12);
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9A9A96 });
  const rails = [], piers = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  // 橋面側板（用 strip 做，顏色灰）
  // 高架的底板與側板（深灰），讓它看起來是一條厚厚的高架橋
  scene.add(buildStrip(S, (i) => -S.w[i] - 3.4, (i) => S.w[i] + 3.4, -0.9, () => 0x6E6B66));
  for (let i = 0; i < SAMPLES; i++) {
    const y = S.p[i].y;
    if (y < 0.4) continue;
    if (i % 3 === 0 && S.rail[i]) for (const sd of [-1, 1]) {
      const off = S.w[i] + 3.2;
      v.set(S.p[i].x + S.r[i].x * off * sd, y + 0.65, S.p[i].z + S.r[i].z * off * sd);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(S.t[i].x, S.t[i].z));
      m4.compose(v, q, sc); rails.push(m4.clone());
    }
    if (i % 60 === 0 && y > 2) for (const sd of [-0.55, 0.55]) {
      v.set(S.p[i].x + S.r[i].x * S.w[i] * sd, y / 2 - 0.3, S.p[i].z + S.r[i].z * S.w[i] * sd);
      m4.compose(v, new THREE.Quaternion(), new THREE.Vector3(1, y + 0.6, 1)); piers.push(m4.clone());
    }
  }
  if (rails.length) { const im = new THREE.InstancedMesh(railGeo, railMat, rails.length); rails.forEach((m, k) => im.setMatrixAt(k, m)); im.castShadow = true; scene.add(im); }
  if (piers.length) { const im = new THREE.InstancedMesh(pierGeo, pierMat, piers.length); piers.forEach((m, k) => im.setMatrixAt(k, m)); im.castShadow = true; scene.add(im); }
}

// 彎道外側的輪胎牆與方向指示牌
export function buildCornerGear(S, scene) {
  const { corners } = findCorners(S);
  const tireGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.42, 12);
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x1E1E1E });
  const tireMatW = new THREE.MeshLambertMaterial({ color: 0xF4F1E8 });
  const mats = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const chevronTex = makeCanvasTexture(512, 256, (g, W, H) => {
    g.fillStyle = '#E8743B'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#FFFFFF';
    for (let k = 0; k < 3; k++) { const x = 70 + k * 150; g.beginPath(); g.moveTo(x, 40); g.lineTo(x + 70, 128); g.lineTo(x, 216); g.lineTo(x + 40, 216); g.lineTo(x + 110, 128); g.lineTo(x + 40, 40); g.closePath(); g.fill(); }
  });
  for (const c of corners) {
    const outer = c.dir > 0 ? 1 : -1;   // 左轉外側在右（正）
    const span = ((c.end - c.start) % SAMPLES + SAMPLES) % SAMPLES;
    for (let k = 0; k < span; k += 6) {
      const i = (c.start + k) % SAMPLES;
      const p = S.p[i], r = S.r[i], off = S.w[i] + 1.1;
      for (let h = 0; h < 2; h++) {
        v.set(p.x + r.x * off * outer, p.y + 0.21 + h * 0.42, p.z + r.z * off * outer);
        q.identity(); m4.compose(v, q, sc);
        mats.push({ m: m4.clone(), white: (Math.floor(i / 6) + h) % 3 === 0 });
      }
    }
    // 指示牌在彎心外側
    const a = c.apex, p = S.p[a], r = S.r[a];
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshLambertMaterial({ map: chevronTex, side: THREE.DoubleSide }));
    sign.position.set(p.x + r.x * (S.w[a] + 4.5) * outer, 2.6, p.z + r.z * (S.w[a] + 4.5) * outer);
    sign.lookAt(S.p[(a - 60 + SAMPLES) % SAMPLES].x, 2.6, S.p[(a - 60 + SAMPLES) % SAMPLES].z);
    if (c.dir < 0) sign.scale.x = -1;   // 右轉的箭頭要朝右
    scene.add(sign);
    for (const x of [-2.6, 2.6]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x555555 }));
      leg.position.copy(sign.position); leg.position.y = 0.6; leg.translateX(x); scene.add(leg);
    }
  }
  const black = mats.filter(x => !x.white), white = mats.filter(x => x.white);
  for (const [list, mat] of [[black, tireMat], [white, tireMatW]]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(tireGeo, mat, list.length);
    list.forEach((x, i) => im.setMatrixAt(i, x.m));
    im.castShadow = true; scene.add(im);
  }
  return corners;
}

// 樹的位置：隨機撒在賽道外圍，不壓到路
export function treeSpots(S, count = 420) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 20) {
    tries++;
    const x = -300 + Math.random() * 600, z = -270 + Math.random() * 380;
    const n = nearest(S, { x, z }, -1);
    const dx = x - n.point.x, dz = z - n.point.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ROAD_HALF + 9 || dist > 95) continue;
    out.push({ x, y: 0, z });
  }
  return out;
}
