// 城市：照 OpenStreetMap 的左營街道資料畫出其他馬路、街屋、招牌、路燈、蓮池潭、左營車站、核果資訊學苑
import * as THREE from 'three';
import { makeCanvasTexture, PALETTE, mergeCones } from './world.js';
import { ROADS } from './osm_data.js';
import { ROAD_HALF, SAMPLES, makeNutMesh } from './track.js';
import { excluded } from './zones.js';
import { MODELS, instanceModel } from './models.js';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';

const ROAD_W = { primary: 9, secondary: 8, tertiary: 6.5, residential: 5, unclassified: 4.5, living_street: 4, service: 2.6 };
export const SIDEWALK = 3.2;

// ---------- 幾何合併（把幾百棟樓併成一個 mesh，省 draw call） ----------
class Merger {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  add(geo, matrix, color) {
    const g = geo.clone().applyMatrix4(matrix);
    const p = g.attributes.position, nn = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(nn.getX(i), nn.getY(i), nn.getZ(i));
      this.uv.push(u.getX(i), u.getY(i));
      this.col.push(color.r, color.g, color.b);
    }
    const ix = g.index;
    for (let i = 0; i < ix.count; i++) this.idx.push(ix.getX(i) + this.n);
    this.n += p.count;
    g.dispose();
  }
  build(material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

// ---------- 距離工具 ----------
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t, z = az + dz * t;
  return Math.hypot(px - x, pz - z);
}

// 所有馬路線段（含賽道），之後擺房子要避開
export const allSegs = [];
export function distToRoads(x, z) {
  let best = Infinity;
  for (const s of allSegs) {
    const d = segDist(x, z, s[0], s[1], s[2], s[3]) - s[4];
    if (d < best) best = d;
  }
  return best;
}
// 到賽道「路邊」的距離（已扣掉該處路寬）
export function distToTrack(S, x, z) {
  let best = Infinity;
  for (let i = 0; i < SAMPLES; i += 3) {
    const d = Math.hypot(S.p[i].x - x, S.p[i].z - z) - S.w[i];
    if (d < best) best = d;
  }
  return best;
}

// ---------- 其他馬路（不是賽道的那些） ----------
function openStrip(pts, half, y, color) {
  const pos = [], idx = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const rx = -tz, rz = tx;    // 右向量
    pos.push(p[0] - rx * half, y, p[1] - rz * half, p[0] + rx * half, y, p[1] + rz * half);
    if (i < n - 1) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  m.receiveShadow = true;
  return m;
}

export function buildCityRoads(scene, S) {
  const roadGroup = new THREE.Group();
  for (const r of ROADS) {
    const half = ROAD_W[r.hw] || 4;
    // 切成「離賽道夠遠」的連續小段，避免和賽道路面重疊
    let run = [];
    const flush = () => {
      if (run.length >= 2) {
        roadGroup.add(openStrip(run, half + 2.2, 0.005, 0xD2CEC2));   // 人行道
        roadGroup.add(openStrip(run, half, 0.01, 0x565B64));          // 柏油
        for (let i = 0; i < run.length - 1; i++) allSegs.push([run[i][0], run[i][1], run[i + 1][0], run[i + 1][1], half + 2.2]);
      }
      run = [];
    };
    for (const p of r.pts) {
      if (distToTrack(S, p[0], p[1]) < half + 1 || excluded(p[0], p[1], 2)) flush();
      else run.push(p);
    }
    flush();
  }
  // 賽道本身也算馬路
  for (let i = 0; i < SAMPLES; i += 6) {
    const a = S.p[i], b = S.p[(i + 6) % SAMPLES];
    allSegs.push([a.x, a.z, b.x, b.z, S.w[i] + SIDEWALK, true]);
  }
  scene.add(roadGroup);
}

// ---------- 街屋 ----------
const WALL_COLORS = [0xFFF4DF, 0xF6EFE6, 0xF2E3C8, 0xFFFFFF, 0xFAD9CF, 0xD9ECF7, 0xEDE7DA, 0xFFE9C2, 0xE2F0D9, 0xFBE3EE];
const SHOPS = ['早餐店', '便利商店', '手搖飲', '牛肉麵', '文具行', '小兒科診所', '藥局', '洗衣店', '水果行', '自助餐', '美髮', '滷味', '眼鏡行', '書局', '雞排', '豆漿'];
const SIGN_COLORS = ['#D7262C', '#F2B705', '#1E8E3E', '#1F5FBF', '#E8743B', '#8E4FC0'];

function windowTexture() {
  return makeCanvasTexture(256, 256, (g, W, H) => {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
    // 一層樓 = 整張貼圖高；橫向 4 公尺一格
    g.fillStyle = '#3C5A78';
    for (let x = 0; x < 4; x++) {
      g.fillRect(x * 64 + 14, 62, 36, 110);
      g.fillStyle = '#BFE0F7'; g.fillRect(x * 64 + 18, 66, 28, 40); g.fillStyle = '#3C5A78';
    }
    g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, 236, W, 20);   // 樓層線
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 6, 6);                  // (0,0) 留白，屋頂用
  });
}

function signTexture(text, color) {
  return makeCanvasTexture(512, 128, (g, W, H) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, H - 10, W, 10);
    g.fillStyle = (color === '#F2B705') ? '#222' : '#FFF';
    g.font = '700 72px "PingFang TC","Noto Sans TC",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + 4);
  });
}

export function buildBuildings(scene, S) {
  const winTex = windowTexture();
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const wallMat = new THREE.MeshLambertMaterial({ map: winTex, vertexColors: true });
  const merger = new Merger();
  const occupied = new Set();
  const cell = (x, z) => Math.round(x / 9) + ',' + Math.round(z / 9);
  const signs = SHOPS.map((t, i) => ({ tex: signTexture(t, SIGN_COLORS[i % SIGN_COLORS.length]), mats: [] }));
  const tankGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.4, 10);
  const tanks = [];
  const aoList = [];   // 每棟樓底下一塊暗角貼圖，讓房子「坐」在地上
  const color = new THREE.Color();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);

  let count = 0;
  const COMM = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h', 'building-i', 'building-j', 'building-k', 'building-l', 'building-m', 'building-n'];
  const SKY = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e'];
  const HOUSE = ['building-type-a', 'building-type-b', 'building-type-c', 'building-type-d', 'building-type-e', 'building-type-f', 'building-type-g', 'building-type-h', 'building-type-i', 'building-type-j', 'building-type-k', 'building-type-l'];
  const useModels = !!MODELS['building-a'];
  const slots = {};   // 模型名 → 實例清單
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const tryPlace = (x, z, ang, nearTrack) => {
    const cx = x, cz = z;
    if (occupied.has(cell(cx, cz))) return;
    if (excluded(cx, cz, 8)) return;
    if (useModels) {
      // 靠賽道：商業街屋；遠處：住宅與少量高樓
      let name;
      const r = Math.random();
      if (nearTrack) name = pick(COMM);
      else if (r < 0.12) name = pick(SKY);
      else if (r < 0.55) name = pick(HOUSE);
      else name = pick(COMM);
      const m = MODELS[name]; if (!m) return;
      const targetW = name.startsWith('building-skyscraper') ? 16 + Math.random() * 6 : (name.startsWith('building-type') ? 10 + Math.random() * 3 : 9 + Math.random() * 5);
      const sc = targetW / Math.max(m.size.x, 0.01);
      const w = m.size.x * sc, d = m.size.z * sc, h = m.size.y * sc;
      if (distToRoads(cx, cz) < d / 2 + 0.5) return;
      occupied.add(cell(cx, cz));
      // Kenney 的店面在 +z，ang 原本讓 -z 朝馬路，所以轉半圈
      const rotY = ang + Math.PI;
      (slots[name] = slots[name] || []).push({ x: cx, z: cz, rotY, scale: sc });
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      if (nearTrack && Math.random() < 0.5) {
        const sg = signs[Math.floor(Math.random() * signs.length)];
        const local = new THREE.Vector3(0, Math.min(h - 1.2, 3.2), d / 2 + 0.12).applyQuaternion(q).add(new THREE.Vector3(cx, 0, cz));
        sg.mats.push({ pos: local, q: q.clone(), sw: Math.min(w - 1, 7), sh: 1.8, flip: false });
      }
      aoList.push({ x: cx, z: cz, w: w + 3.2, d: d + 3.2, q: q.clone() });
      if (!name.startsWith('building-type') && Math.random() < 0.5) {
        const t = new THREE.Vector3((Math.random() - .5) * (w - 3), h + 0.7, (Math.random() - .5) * (d - 3)).applyQuaternion(q).add(new THREE.Vector3(cx, 0, cz));
        tanks.push(t);
      }
      count++;
      return;
    }
    const w = 9 + Math.random() * 6, d = 9 + Math.random() * 7;
    const floors = nearTrack ? 2 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 6);
    const h = floors * 3.2;
    if (distToRoads(cx, cz) < d / 2 + 0.5) return;
    occupied.add(cell(cx, cz));
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      if (i >= 8 && i < 16) { uv.setXY(i, 0.01, 0.01); continue; }   // 頂與底
      const along = (i < 8) ? d : w;
      uv.setXY(i, uv.getX(i) * along / 4, uv.getY(i) * floors);
    }
    color.setHex(WALL_COLORS[Math.floor(Math.random() * WALL_COLORS.length)]);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    v.set(cx, h / 2, cz);
    m4.compose(v, q, sc);
    merger.add(geo, m4, color);
    geo.dispose();
    // 招牌：面向馬路那一面（局部 -z 是朝馬路，因為 ang 由道路法線算）
    if (nearTrack || Math.random() < 0.35) {
      const s = signs[Math.floor(Math.random() * signs.length)];
      const sw = Math.min(w - 1, 8), sh = 2;
      const local = new THREE.Vector3(0, 2.6, -d / 2 - 0.08).applyQuaternion(q).add(new THREE.Vector3(cx, 0, cz));
      s.mats.push({ pos: local, q: q.clone(), sw, sh });
    }
    aoList.push({ x: cx, z: cz, w: w + 3.2, d: d + 3.2, q: q.clone() });
    // 屋頂水塔
    if (Math.random() < 0.6) {
      const t = new THREE.Vector3((Math.random() - .5) * (w - 3), h + 0.7, (Math.random() - .5) * (d - 3)).applyQuaternion(q).add(new THREE.Vector3(cx, 0, cz));
      tanks.push(t);
    }
    count++;
  };

  // 沿每條馬路兩側放房子
  for (const s of allSegs) {
    const [ax, az, bx, bz, half] = s;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 6) continue;
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    const rx = -tz, rz = tx;
    const nearTrack = !!s[5];
    for (let dAlong = 7; dAlong < len - 5; dAlong += 13 + Math.random() * 4) {
      for (const side of [-1, 1]) {
        const depth = 12;
        const x = ax + tx * dAlong + rx * side * (half + 0.6 + depth / 2);
        const z = az + tz * dAlong + rz * side * (half + 0.6 + depth / 2);
        // 面向馬路：局部 -z 指向馬路 → 旋轉讓 -z = -side*r
        const ang = Math.atan2(rx * side, rz * side);
        tryPlace(x, z, ang, nearTrack);
      }
    }
  }
  // 賽道兩旁的商店街：allSegs 裡的賽道段只有 8 公尺長，上面的迴圈擺不進房子，所以沿賽道另外走一遍
  for (let d = 30; d < S.length - 20; d += 15 + Math.random() * 4) {
    const i = S.d.findIndex(x => x >= d);
    if (i < 0 || S.p[i].y > 1) continue;                  // 高架段下面不蓋
    const p = S.p[i], r = S.r[i];
    for (const side of [-1, 1]) {
      if (side === 1 && d < 60) continue;                  // 起點右邊是核果資訊學苑
      const off = S.w[i] + SIDEWALK + 2.5 + 6;             // 讓出人行道、路燈和彎道指示牌，房子深度約 12
      tryPlace(p.x + r.x * off * side, p.z + r.z * off * side, Math.atan2(r.x * side, r.z * side), true);
    }
  }
  if (useModels) { for (const name of Object.keys(slots)) instanceModel(scene, name, slots[name]); }
  else scene.add(merger.build(wallMat));

  // 招牌（每種文字一個 InstancedMesh）
  const signGeo = new THREE.PlaneGeometry(1, 1);
  for (const s of signs) {
    if (!s.mats.length) continue;
    const im = new THREE.InstancedMesh(signGeo, new THREE.MeshLambertMaterial({ map: s.tex, side: THREE.DoubleSide }), s.mats.length);
    s.mats.forEach((p, i) => {
      // 平面預設朝 +z，要朝馬路（局部 -z）所以再轉 180 度
      const qq = p.flip === false ? p.q.clone() : p.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      m4.compose(p.pos, qq, new THREE.Vector3(p.sw, p.sh, 1));
      im.setMatrixAt(i, m4);
    });
    scene.add(im);
  }
  // 底部暗角
  if (aoList.length) {
    const aoTex = makeCanvasTexture(128, 128, (g, W, H) => {
      g.clearRect(0, 0, W, H);
      // 中心一塊實心，往外漸淡（方形版的柔影）
      for (let k = 0; k < 10; k++) {
        const inset = 10 + k * 4.5;
        g.fillStyle = 'rgba(0,0,0,' + (0.045) + ')';
        g.beginPath(); g.roundRect(inset, inset, W - inset * 2, H - inset * 2, 10); g.fill();
      }
    });
    const aoGeo = new THREE.PlaneGeometry(1, 1);
    const aoIm = new THREE.InstancedMesh(aoGeo, new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, opacity: 0.9 }), aoList.length);
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    aoList.forEach((a, i) => {
      const qq = a.q.clone().multiply(flat);
      m4.compose(new THREE.Vector3(a.x, 0.035, a.z), qq, new THREE.Vector3(a.w, a.d, 1));
      aoIm.setMatrixAt(i, m4);
    });
    aoIm.renderOrder = 1;
    scene.add(aoIm);
  }
  // 水塔
  if (tanks.length) {
    const im = new THREE.InstancedMesh(tankGeo, new THREE.MeshLambertMaterial({ color: 0xC8C8C8 }), tanks.length);
    tanks.forEach((p, i) => { m4.compose(p, new THREE.Quaternion(), sc); im.setMatrixAt(i, m4); });
    im.castShadow = true; scene.add(im);
  }
  return count;
}

// ---------- 路燈與行道樹（沿賽道人行道） ----------
export function buildStreetFurniture(scene, S) {
  const lampSpots = [];
  for (let d = 12; d < S.length - 10; d += 26) { const i = S.d.findIndex(x => x >= d); if (i >= 0) lampSpots.push(i); }
  const treeSpots = [];
  for (let d = 25; d < S.length - 10; d += 26) { const i = S.d.findIndex(x => x >= d); if (i >= 0 && S.p[i].y < 1) treeSpots.push(i); }

  if (MODELS['light-curved']) {
    const lamps = [], trees = [], treesS = [];
    for (const i of lampSpots) for (const side of [-1, 1]) {
      const p = S.p[i], r = S.r[i];
      const off = S.w[i] + 2.4;
      // 燈臂（模型的 -z）要朝馬路
      lamps.push({ x: p.x + r.x * off * side, y: p.y, z: p.z + r.z * off * side, rotY: Math.atan2(r.x * side, r.z * side), scale: 7 / MODELS['light-curved'].size.y });
    }
    // 每個模型都可能單獨載不到（網路不穩），用到前都要再確認一次
    if (MODELS['tree-large'] && MODELS['tree-small']) for (const i of treeSpots) for (const side of [-1, 1]) {
      if (!S.rail[i]) continue;
      const p = S.p[i], r = S.r[i];
      const off = S.w[i] + 2.6;
      const big = Math.random() < 0.6;
      (big ? trees : treesS).push({ x: p.x + r.x * off * side, y: p.y, z: p.z + r.z * off * side, rotY: Math.random() * 6.28, scale: (big ? 7.5 : 5.5) / MODELS[big ? 'tree-large' : 'tree-small'].size.y * (0.85 + Math.random() * 0.3) });
    }
    instanceModel(scene, 'light-curved', lamps);
    instanceModel(scene, 'tree-large', trees);
    instanceModel(scene, 'tree-small', treesS);
    // 斑馬線口的紅綠燈
    const tl = [];
    let prev = S.name[0];
    if (MODELS['traffic-light']) for (let i = 1; i < SAMPLES; i++) {
      if (S.name[i] === prev) continue; prev = S.name[i];
      const idx = Math.max(0, i - 32);
      for (const side of [-1, 1]) {
        const p = S.p[idx], r = S.r[idx];
        const off = S.w[idx] + 1.6;
        tl.push({ x: p.x + r.x * off * side, y: p.y, z: p.z + r.z * off * side, rotY: Math.atan2(r.x * side, r.z * side), scale: 5.2 / MODELS['traffic-light'].size.y });
      }
    }
    instanceModel(scene, 'traffic-light', tl);
    return;
  }
  // 沒模型時的陽春版
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 8);
  const armGeo = new THREE.BoxGeometry(0.16, 0.16, 2.2);
  const headGeo = new THREE.BoxGeometry(0.5, 0.25, 0.9);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x6E7378 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xFFF2C2, emissive: 0xFFE9A8, emissiveIntensity: 0.6 });
  const n = lampSpots.length * 2;
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, n);
  const arms = new THREE.InstancedMesh(armGeo, poleMat, n);
  const heads = new THREE.InstancedMesh(headGeo, headMat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  let k = 0;
  for (const i of lampSpots) for (const side of [-1, 1]) {
    const p = S.p[i], r = S.r[i], t = S.t[i];
    const off = S.w[i] + 2.4;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(t.x, t.z) + (side > 0 ? Math.PI / 2 : -Math.PI / 2));
    v.set(p.x + r.x * off * side, p.y + 3.5, p.z + r.z * off * side); m4.compose(v, q, sc); poles.setMatrixAt(k, m4);
    v.set(p.x + r.x * (off - 1.0) * side, p.y + 6.9, p.z + r.z * (off - 1.0) * side); m4.compose(v, q, sc); arms.setMatrixAt(k, m4);
    v.set(p.x + r.x * (off - 2.0) * side, p.y + 6.85, p.z + r.z * (off - 2.0) * side); m4.compose(v, q, sc); heads.setMatrixAt(k, m4);
    k++;
  }
  for (const im of [poles, arms, heads]) { im.castShadow = true; scene.add(im); }
}

// ---------- 背景馬路上停放的車（Kenney Car Kit） ----------
export function buildParkedCars(scene, S) {
  const CARS = ['sedan', 'taxi', 'van', 'suv', 'hatchback-sports', 'delivery', 'police', 'truck'].filter(n => MODELS[n]);   // 載不到的車款就不擺
  if (!CARS.length) return;
  const lists = {};
  for (const s of allSegs) {
    if (s[5]) continue;                       // 賽道不停車
    const [ax, az, bx, bz, half] = s;
    if (half < 6) continue;                   // 小巷不停
    const len = Math.hypot(bx - ax, bz - az);
    const tx = (bx - ax) / len, tz = (bz - az) / len, rx = -tz, rz = tx;
    for (let d = 8; d < len - 6; d += 26) {
      if (Math.random() > 0.55) continue;
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = ax + tx * d + rx * side * (half - 3.4), z = az + tz * d + rz * side * (half - 3.4);
      if (excluded(x, z, 2) || distToTrack(S, x, z) < 6) continue;
      const name = CARS[Math.floor(Math.random() * CARS.length)];
      (lists[name] = lists[name] || []).push({ x, y: 0, z, rotY: Math.atan2(tx, tz) + (side > 0 ? Math.PI : 0), scale: 4.4 / MODELS[name].size.z });
    }
  }
  for (const name of Object.keys(lists)) instanceModel(scene, name, lists[name]);
}

// ---------- 公園樹（Kenney）----------
export function buildParkTrees(scene, spots) {
  if (!MODELS['tree-large'] || !MODELS['tree-small']) return false;
  const big = [], small = [];
  for (const sp of spots) {
    const b = Math.random() < 0.55;
    (b ? big : small).push({ x: sp.x, y: sp.y, z: sp.z, rotY: Math.random() * 6.28, scale: (b ? 8 : 5.5) / MODELS[b ? 'tree-large' : 'tree-small'].size.y * (0.8 + Math.random() * 0.5) });
  }
  instanceModel(scene, 'tree-large', big); instanceModel(scene, 'tree-small', small);
  return true;
}

// ---------- 地標 ----------
export function buildLandmarks(scene, S) {
  // 蓮池潭（在翠華路西側）
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 48),
    new THREE.MeshStandardMaterial({ color: 0x4FA3D1, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }));
  lake.rotation.x = -Math.PI / 2; lake.scale.set(290, 430, 1); lake.position.set(-800, 0.02, -60);
  scene.add(lake);
  // 龍虎塔：兩座小塔
  for (const [x, z, c] of [[-640, 40, 0xE8743B], [-610, 60, 0xE8C21A]]) {
    const g = new THREE.Group();
    for (let f = 0; f < 5; f++) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(5 - f * 0.6, 5.4 - f * 0.6, 4, 8), new THREE.MeshLambertMaterial({ color: 0xF2E6C8 }));
      body.position.y = 2 + f * 5; g.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(6.6 - f * 0.6, 1.6, 8), new THREE.MeshLambertMaterial({ color: c }));
      roof.position.y = 4.8 + f * 5; g.add(roof);
    }
    g.position.set(x, 0, z); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(g);
  }
  // 左營車站（高鐵／台鐵）
  const stationTex = makeCanvasTexture(1024, 256, (g, W, H) => {
    g.fillStyle = '#DDE3E8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5B7A99'; for (let x = 20; x < W; x += 60) g.fillRect(x, 40, 40, 170);
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 8, 8);
  });
  stationTex.wrapS = THREE.RepeatWrapping; stationTex.repeat.set(6, 1);
  const station = new THREE.Mesh(new THREE.BoxGeometry(280, 24, 60), new THREE.MeshLambertMaterial({ map: stationTex }));
  station.position.set(-150, 12, -700); station.castShadow = true; scene.add(station);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(300, 2, 72), new THREE.MeshLambertMaterial({ color: 0x8FA3B5 }));
  roof.position.set(-150, 25, -700); scene.add(roof);
  const stSign = new THREE.Mesh(new THREE.PlaneGeometry(90, 10), new THREE.MeshLambertMaterial({ map: signTexture('左營車站', '#1F5FBF') }));
  stSign.position.set(-150, 20, -669.9); scene.add(stSign);

  // 半屏山（西北邊的長條山）
  const mMat = new THREE.MeshLambertMaterial({ color: 0x8FBF9F, flatShading: true });
  const hills = [], tmp = new THREE.Object3D();
  for (let i = 0; i < 9; i++) {
    const h = 70 + Math.random() * 50;
    tmp.position.set(-1000 + i * 110, h / 2 - 4, -900 + Math.sin(i) * 60); tmp.rotation.y = Math.random(); tmp.updateMatrix();
    hills.push(new THREE.ConeGeometry(90 + Math.random() * 40, h, 6).toNonIndexed().applyMatrix4(tmp.matrix));
  }
  scene.add(new THREE.Mesh(mergeCones(hills), mMat));

  // 核果資訊學苑：在起點旁邊
  const i0 = 2, p = S.p[i0], r = S.r[i0], t = S.t[i0];
  const side = 1;
  const g = new THREE.Group();
  const bw = 26, bh = 13, bd = 16;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), new THREE.MeshLambertMaterial({ color: 0xFDF6E3 }));
  body.position.y = bh / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.4, 2.4, bd + 0.4), new THREE.MeshLambertMaterial({ color: PALETTE.forest }));
  band.position.y = 4; g.add(band);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.2), new THREE.MeshLambertMaterial({ map: makeCanvasTexture(1024, 240, (c, W, H) => {
    c.fillStyle = '#1E5631'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#FDF6E3'; c.font = '700 120px "PingFang TC","Noto Sans TC",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('核果資訊學苑', W / 2 + 40, H / 2 - 20);
    c.fillStyle = '#E8743B'; c.font = '700 52px "PingFang TC","Noto Sans TC",sans-serif'; c.fillText('高 雄 校 ｜ STEAM 程式教育', W / 2 + 40, H / 2 + 76);
  }) }));
  sign.position.set(0, 9.5, -bd / 2 - 0.1); g.add(sign);
  const logo = makeNutMesh(); logo.scale.set(3.2, 3.2, 3.2); logo.position.set(-9, 9.6, -bd / 2 - 1.2); g.add(logo);
  const roofNut = makeNutMesh(); roofNut.scale.set(4.5, 4.5, 4.5); roofNut.position.set(0, bh + 2.2, 0); g.add(roofNut);
  // 校門口的小廣場
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(bw + 10, 8), new THREE.MeshLambertMaterial({ color: 0xD8D2C4 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.03, -bd / 2 - 4); plaza.receiveShadow = true; g.add(plaza);
  const off = S.w[i0] + SIDEWALK + bd / 2 + 4;
  g.position.set(p.x + r.x * off * side + t.x * 14, 0, p.z + r.z * off * side + t.z * 14);
  g.rotation.y = Math.atan2(r.x * side, r.z * side) + Math.PI;   // 招牌面朝馬路
  scene.add(g);
  return { school: g, roofNut };
}

// ---------- 斑馬線：賽道轉進另一條路的地方 ----------
export function buildCrosswalks(scene, S) {
  // 全部條紋合成一個幾何、一個 draw call
  const mat = new THREE.MeshBasicMaterial({ color: 0xF4F1E8 });
  const stripeGeo = new THREE.PlaneGeometry(1.0, 3.4);
  const geos = [];
  const tmp = new THREE.Object3D();
  let prev = S.name[0];
  for (let i = 1; i < SAMPLES; i++) {
    if (S.name[i] === prev) continue;
    prev = S.name[i];
    const idx = Math.max(0, i - 25);
    const p = S.p[idx], r = S.r[idx], t = S.t[idx];
    const kk = Math.floor((S.w[idx] - 0.8) / 1.35);
    for (let k = -kk; k <= kk; k++) {
      tmp.rotation.set(-Math.PI / 2, 0, -Math.atan2(t.x, t.z));
      tmp.position.set(p.x + r.x * k * 1.35, 0.035, p.z + r.z * k * 1.35);
      tmp.updateMatrix();
      geos.push(stripeGeo.clone().applyMatrix4(tmp.matrix));
    }
  }
  if (!geos.length) return;
  const merged = mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  scene.add(new THREE.Mesh(merged, mat));
}

// ---------- 零星樹：公園與湖邊 ----------
export function parkTreeSpots(S, count = 260) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 30) {
    tries++;
    let x, z;
    if (Math.random() < 0.55) { const a = Math.random() * Math.PI * 2, rr = 300 + Math.random() * 90; x = -800 + Math.cos(a) * rr * 1.0; z = -60 + Math.sin(a) * rr * 1.45; }
    else { x = -500 + Math.random() * 1200; z = -500 + Math.random() * 1100; }
    if (distToRoads(x, z) < 4 || excluded(x, z, 3)) continue;
    if (distToTrack(S, x, z) < 5) continue;
    if (Math.hypot((x + 800) / 290, (z + 60) / 430) < 1.02) continue;   // 湖裡不種樹
    out.push({ x, y: 0, z });
  }
  return out;
}
