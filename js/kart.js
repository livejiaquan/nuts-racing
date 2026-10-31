// 卡丁車 + 松鼠駕駛，全部用基本幾何體拼，不需要模型檔
import * as THREE from 'three';
import { PALETTE } from './world.js';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';
import { registerEnv } from './atmos.js';

export const KART_COLORS = [
  { name: '核果橘', hex: 0xE8743B },
  { name: '森林綠', hex: 0x2E8B57 },
  { name: '天空藍', hex: 0x3F8FD6 },
  { name: '檸檬黃', hex: 0xE8C21A },
  { name: '葡萄紫', hex: 0x8E4FC0 },
  { name: '櫻花粉', hex: 0xF07AA8 }
];

const black = new THREE.MeshStandardMaterial({ color: 0x1B1B1B, roughness: 0.9 });
const metal = registerEnv(new THREE.MeshStandardMaterial({ color: 0xBFC4CC, roughness: 0.3, metalness: 0.85 }), 1.0);

let _blob = null;
export function blobTexture() {
  if (_blob) return _blob;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  _blob = new THREE.CanvasTexture(c);
  return _blob;
}

export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// 把一串已經擺好位置的 mesh 合成一個：顏色寫進頂點色，材質共用一個（省 draw call；一台車原本 42 個 mesh）
export function mergeParts(meshes, matOpts) {
  const geos = [];
  for (const m of meshes) {
    m.updateMatrix();
    const g = m.geometry.clone().applyMatrix4(m.matrix);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = m.material.color;
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g.index ? g.toNonIndexed() : g);
  }
  const out = new THREE.Mesh(mergeGeometries(geos, false), new THREE.MeshStandardMaterial({ vertexColors: true, ...matOpts }));
  out.castShadow = true; out.receiveShadow = true;
  geos.forEach(g => g.dispose());
  return out;
}

// 四款車身。style：kart 卡丁（基本款）、sport 跑車（低扁、大尾翼）、offroad 越野車（大輪胎、車頂燈）、bus 小巴（方盒子、車頂行李架）
// 車身零件都合成一個 mesh（車漆有環境反射）；輪子、排氣管、座椅、尾燈各自獨立。駕駛座是空的 group，setCharacter() 把角色放進去
export const KART_STYLES = {
  kart:    { wheelR: 0.48, wheelW: 0.5, seat: [0, 1.05, -0.45], ride: 0 },
  sport:   { wheelR: 0.42, wheelW: 0.55, seat: [0, 0.92, -0.5], ride: -0.06 },
  offroad: { wheelR: 0.62, wheelW: 0.62, seat: [0, 1.35, -0.4], ride: 0.3 },
  bus:     { wheelR: 0.46, wheelW: 0.5, seat: [0, 1.15, 0.0], ride: 0.08 }
};

export function buildKart(colorHex, { style = 'kart' } = {}) {
  const st = KART_STYLES[style] || KART_STYLES.kart;
  const body = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45, metalness: 0.15 });
  const bodyDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex).multiplyScalar(0.7), roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9FD8F0, roughness: 0.2 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xFFE066, roughness: 0.4 });
  const g = new THREE.Group();
  const r = st.ride;
  const shell = [];
  const box = (w, h, d, mat, x, y, z) => shell.push(mesh(new THREE.BoxGeometry(w, h, d), mat, x, y + r, z));
  if (style === 'sport') {
    box(2.1, 0.3, 3.9, bodyDark, 0, 0.42, 0);
    box(1.6, 0.36, 2.4, body, 0, 0.7, -0.2);
    box(1.2, 0.3, 1.6, body, 0, 0.62, 1.6);
    const nose = mesh(new THREE.ConeGeometry(0.6, 1.0, 4), body, 0, 0.6 + r, 2.6); nose.rotation.x = Math.PI / 2; nose.rotation.y = Math.PI / 4; shell.push(nose);
    box(2.6, 0.1, 0.55, body, 0, 0.36, 2.3);                   // 前翼
    box(2.6, 0.1, 0.7, body, 0, 1.55, -1.9);                   // 大尾翼
    box(0.1, 0.8, 0.5, bodyDark, -1.0, 1.15, -1.9); box(0.1, 0.8, 0.5, bodyDark, 1.0, 1.15, -1.9);
    box(1.0, 0.5, 0.06, new THREE.MeshStandardMaterial({ color: 0xFDF6E3 }), 0, 0.9, -2.0);
    box(0.5, 0.06, 1.2, bodyDark, -0.9, 0.9, -0.3); box(0.5, 0.06, 1.2, bodyDark, 0.9, 0.9, -0.3);   // 側裙
  } else if (style === 'offroad') {
    box(2.1, 0.4, 3.4, bodyDark, 0, 0.55, 0);
    box(1.7, 0.6, 2.3, body, 0, 0.95, -0.1);
    box(1.4, 0.45, 1.1, body, 0, 0.88, 1.5);
    box(2.3, 0.1, 0.4, bodyDark, 0, 0.5, 2.0);                 // 保險桿
    for (const [x, z] of [[-1.15, 1.2], [1.15, 1.2], [-1.2, -1.2], [1.2, -1.2]]) box(0.75, 0.3, 1.5, bodyDark, x, 1.15, z);   // 擋泥板
    box(0.08, 0.9, 0.08, bodyDark, -0.7, 1.7, -1.1); box(0.08, 0.9, 0.08, bodyDark, 0.7, 1.7, -1.1);   // 防滾架（駕駛後面）
    box(1.6, 0.1, 0.12, bodyDark, 0, 2.15, -1.1);              // 車頂燈架
    for (const x of [-0.5, 0, 0.5]) box(0.28, 0.2, 0.2, yellow, x, 2.3, -1.08);   // 車頂燈
    box(0.9, 0.5, 0.06, new THREE.MeshStandardMaterial({ color: 0xFDF6E3 }), 0, 1.05, -1.75);
  } else if (style === 'bus') {
    // 敞篷觀光小巴：車廂矮、前面一片擋風玻璃，後半段有車頂和行李架，駕駛坐在露天的位置
    box(2.0, 0.3, 3.6, bodyDark, 0, 0.45, 0);
    box(1.9, 0.9, 3.5, body, 0, 1.0, 0);
    box(1.95, 0.3, 1.2, glass, 0, 1.15, 0.6);                   // 側窗
    box(1.5, 0.5, 0.08, glass, 0, 1.7, 1.0);                    // 擋風玻璃
    box(1.9, 0.08, 1.4, body, 0, 2.05, -1.05);                  // 後半段車頂
    box(0.08, 0.62, 0.08, bodyDark, -0.9, 1.75, -0.4); box(0.08, 0.62, 0.08, bodyDark, 0.9, 1.75, -0.4);
    box(0.08, 0.62, 0.08, bodyDark, -0.9, 1.75, -1.7); box(0.08, 0.62, 0.08, bodyDark, 0.9, 1.75, -1.7);
    for (const z of [-1.6, -1.05, -0.5]) box(1.7, 0.08, 0.08, bodyDark, 0, 2.15, z);   // 行李架
    box(0.9, 0.3, 0.5, yellow, 0, 2.25, -1.05);                 // 架上一個箱子
    box(0.9, 0.5, 0.06, new THREE.MeshStandardMaterial({ color: 0xFDF6E3 }), 0, 0.95, -1.82);
  } else {
    box(2.0, 0.35, 3.4, bodyDark, 0, 0.45, 0);
    box(1.5, 0.45, 2.2, body, 0, 0.78, -0.2);
    box(1.1, 0.4, 1.3, body, 0, 0.72, 1.45);
    const noseTip = mesh(new THREE.ConeGeometry(0.55, 0.9, 4), body, 0, 0.72 + r, 2.3); noseTip.rotation.x = Math.PI / 2; noseTip.rotation.y = Math.PI / 4; shell.push(noseTip);
    box(2.4, 0.12, 0.5, body, 0, 0.42, 2.1);
    box(2.2, 0.12, 0.6, body, 0, 1.45, -1.75);
    box(0.12, 0.6, 0.5, bodyDark, -0.9, 1.15, -1.75); box(0.12, 0.6, 0.5, bodyDark, 0.9, 1.15, -1.75);
    box(0.9, 0.5, 0.06, new THREE.MeshStandardMaterial({ color: 0xFDF6E3 }), 0, 1.0, -2.0);
  }
  const shellMesh = mergeParts(shell, { roughness: 0.3, metalness: 0.5 });
  registerEnv(shellMesh.material, 0.8);
  g.add(shellMesh);
  // 排氣管
  const tailZ = style === 'sport' ? -2.15 : style === 'bus' ? -1.95 : -1.95;
  for (const x of [-0.45, 0.45]) { const ex = mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.7, 8), metal, x, 0.62 + r, tailZ); ex.rotation.x = Math.PI / 2; g.add(ex); }
  // 座椅與方向盤（小巴的在車廂裡，從外面看不太到，也照放）
  const seat = st.seat;
  g.add(mesh(new THREE.BoxGeometry(1.0, 0.7, 0.3), black, 0, seat[1] + 0.15, seat[2] - 0.65));
  const wheelRing = mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 16), black, 0, seat[1] + 0.2, seat[2] + 1.0); wheelRing.rotation.x = -Math.PI / 3; g.add(wheelRing);
  const col = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), metal, 0, seat[1], seat[2] + 1.2); col.rotation.x = Math.PI / 3; g.add(col);
  // 尾燈（煞車會亮）
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xFF2A2A, emissive: 0xFF1E1E, emissiveIntensity: 0.15, roughness: 0.4 });
  const lz = style === 'sport' ? -1.96 : style === 'bus' ? -1.77 : -1.76, ly = (style === 'bus' ? 0.75 : 0.62) + r;
  [mesh(new THREE.BoxGeometry(0.42, 0.22, 0.08), lightMat, -0.8, ly, lz), mesh(new THREE.BoxGeometry(0.42, 0.22, 0.08), lightMat, 0.8, ly, lz)].forEach(l => g.add(l));
  const brakeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xFF3030, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  brakeGlow.scale.set(3.2, 1.2, 1); brakeGlow.position.set(0, ly, lz - 0.25); g.add(brakeGlow);

  // 輪子
  const wheelGeo = new THREE.CylinderGeometry(st.wheelR, st.wheelR, st.wheelW, 14);
  const hubGeo = new THREE.CylinderGeometry(st.wheelR * 0.55, st.wheelR * 0.55, st.wheelW + 0.02, 8);
  const wheels = [], front = [];
  for (const [x, z, isFront] of [[-1.15, 1.2, true], [1.15, 1.2, true], [-1.2, -1.2, false], [1.2, -1.2, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, st.wheelR, z);
    const w = mesh(wheelGeo, black); w.rotation.z = Math.PI / 2;
    const h = mesh(hubGeo, metal); h.rotation.z = Math.PI / 2;
    const spin = new THREE.Group(); spin.add(w, h);
    pivot.add(spin);
    g.add(pivot);
    wheels.push(spin);
    if (isFront) front.push(pivot);
  }

  // 車底柔影（接觸陰影）：讓車子貼在地上，不會像浮著
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5.0), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.6, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; blob.renderOrder = 1;
  g.add(blob);

  // 駕駛座：setCharacter() 把角色放進來
  const driver = new THREE.Group();
  driver.position.set(seat[0], seat[1], seat[2]);
  g.add(driver);

  return { group: g, wheels, front, driver, character: null, lightMat, brakeGlow, blob, color: new THREE.Color(colorHex), style,
    rearWheels: [new THREE.Vector3(-1.2, 0, -1.2), new THREE.Vector3(1.2, 0, -1.2)] };
}

// 換駕駛：c 是 characters.js build 出來的 { group, tail?, face? }，或上傳角色包成 { group }
export function setCharacter(k, c) {
  k.driver.clear();
  k.character = c || null;
  if (c) k.driver.add(c.group);
}

// 輪子轉、前輪跟著方向、尾巴晃、角色依轉向傾斜
export function animateKart(k, speed, steer, dt, t, braking = false) {
  if (k.lightMat) {
    const target = braking ? 2.6 : 0.15;
    k.lightMat.emissiveIntensity += (target - k.lightMat.emissiveIntensity) * Math.min(1, dt * 18);
    k.brakeGlow.material.opacity += ((braking ? 0.55 : 0) - k.brakeGlow.material.opacity) * Math.min(1, dt * 18);
  }
  for (const w of k.wheels) w.rotation.x += speed * dt / 0.48;
  for (const f of k.front) f.rotation.y = -steer * 0.45;
  const c = k.character;
  if (c) {
    c.group.rotation.z = steer * 0.18;
    if (c.tail) c.tail.rotation.x = Math.sin(t * 9) * 0.12 * (0.3 + Math.min(1, Math.abs(speed) / 20));
  }
}

// 表情：mood 是 normal／happy／ouch／focus／worried，glance 是回頭看的方向（-1 左、1 右、0 正前）
// 只動眉毛的高度與角度、嘴巴的大小、汗滴的顯示；整隻角色轉身代表回頭看
const MOODS = {
  normal:  { browY: 0, browTilt: 0,     smile: 1.0, o: false, sweat: false },
  happy:   { browY: 0.04, browTilt: 0,  smile: 1.6, o: false, sweat: false },
  ouch:    { browY: 0.03, browTilt: 0.5, smile: 0,  o: true,  sweat: true },
  focus:   { browY: -0.03, browTilt: -0.45, smile: 0.35, o: false, sweat: false },
  worried: { browY: 0.03, browTilt: 0.4, smile: 0.5, o: false, sweat: true }
};
export function animateFace(k, mood, glance, dt) {
  const c = k.character; if (!c) return;
  const a = Math.min(1, dt * 10);
  c.group.rotation.y += (glance * 0.8 - c.group.rotation.y) * Math.min(1, dt * 6);   // 回頭看，但臉還看得到一半
  const f = c.face; if (!f) return;
  const m = MOODS[mood] || MOODS.normal;
  f.browL.position.y += (f.browY + m.browY - f.browL.position.y) * a;
  f.browR.position.y = f.browL.position.y;
  f.browL.rotation.z += (m.browTilt - f.browL.rotation.z) * a;    // 正：內側往上（委屈）；負：內側往下（認真）
  f.browR.rotation.z = -f.browL.rotation.z;
  const sc = Math.max(0.01, m.smile);
  f.smile.scale.x += (sc - f.smile.scale.x) * a; f.smile.scale.y += (sc - f.smile.scale.y) * a;
  f.smile.visible = m.smile > 0.05;
  f.mouthO.visible = m.o; f.sweat.visible = m.sweat;
  if (m.sweat) f.sweat.position.y = f.sweatY - (performance.now() % 700) / 700 * 0.12;   // 汗滴慢慢往下滑
}
