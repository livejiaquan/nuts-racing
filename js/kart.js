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
const fur = new THREE.MeshStandardMaterial({ color: 0xD98A41, roughness: 0.85 });
const furDark = new THREE.MeshStandardMaterial({ color: 0xB5651D, roughness: 0.85 });
const furLight = new THREE.MeshStandardMaterial({ color: 0xF2C994, roughness: 0.9 });
const scarf = new THREE.MeshStandardMaterial({ color: PALETTE.forest, roughness: 0.8 });
const eye = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.3 });

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

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// 把一串已經擺好位置的 mesh 合成一個：顏色寫進頂點色，材質共用一個（省 draw call；一台車原本 42 個 mesh）
function mergeParts(meshes, matOpts) {
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

export function buildKart(colorHex) {
  const body = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45, metalness: 0.15 });
  const bodyDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex).multiplyScalar(0.7), roughness: 0.6 });
  const g = new THREE.Group();

  // 底盤與車身（車頭朝 +z）：這些不會動的車身零件合成一個 mesh
  const shell = [];
  shell.push(mesh(new THREE.BoxGeometry(2.0, 0.35, 3.4), bodyDark, 0, 0.45, 0));
  shell.push(mesh(new THREE.BoxGeometry(1.5, 0.45, 2.2), body, 0, 0.78, -0.2));
  // 車頭鼻錐
  shell.push(mesh(new THREE.BoxGeometry(1.1, 0.4, 1.3), body, 0, 0.72, 1.45));
  const noseTip = mesh(new THREE.ConeGeometry(0.55, 0.9, 4), body, 0, 0.72, 2.3);
  noseTip.rotation.x = Math.PI / 2; noseTip.rotation.y = Math.PI / 4;
  shell.push(noseTip);
  // 前翼
  shell.push(mesh(new THREE.BoxGeometry(2.4, 0.12, 0.5), body, 0, 0.42, 2.1));
  // 尾翼
  shell.push(mesh(new THREE.BoxGeometry(2.2, 0.12, 0.6), body, 0, 1.45, -1.75));
  shell.push(mesh(new THREE.BoxGeometry(0.12, 0.6, 0.5), bodyDark, -0.9, 1.15, -1.75));
  shell.push(mesh(new THREE.BoxGeometry(0.12, 0.6, 0.5), bodyDark, 0.9, 1.15, -1.75));
  // 車號牌
  shell.push(mesh(new THREE.BoxGeometry(0.9, 0.5, 0.06), new THREE.MeshStandardMaterial({ color: 0xFDF6E3 }), 0, 1.0, -2.0));
  // 車漆：金屬感高一點、粗糙度低一點，再加天空的環境反射，才像烤漆
  const shellMesh = mergeParts(shell, { roughness: 0.3, metalness: 0.5 });
  registerEnv(shellMesh.material, 0.8);
  g.add(shellMesh);
  // 排氣管
  for (const x of [-0.45, 0.45]) {
    const ex = mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.7, 8), metal, x, 0.62, -1.95);
    ex.rotation.x = Math.PI / 2; g.add(ex);
  }
  // 座椅與方向盤
  g.add(mesh(new THREE.BoxGeometry(1.0, 0.7, 0.3), black, 0, 1.2, -1.1));
  const wheelRing = mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 16), black, 0, 1.25, 0.55);
  wheelRing.rotation.x = -Math.PI / 3; g.add(wheelRing);
  const col = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), metal, 0, 1.05, 0.75);
  col.rotation.x = Math.PI / 3; g.add(col);
  // 尾燈（煞車會亮）
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xFF2A2A, emissive: 0xFF1E1E, emissiveIntensity: 0.15, roughness: 0.4 });
  const lights = [mesh(new THREE.BoxGeometry(0.42, 0.22, 0.08), lightMat, -0.8, 0.62, -1.76), mesh(new THREE.BoxGeometry(0.42, 0.22, 0.08), lightMat, 0.8, 0.62, -1.76)];
  lights.forEach(l => g.add(l));
  const brakeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xFF3030, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  brakeGlow.scale.set(3.2, 1.2, 1); brakeGlow.position.set(0, 0.62, -2.0); g.add(brakeGlow);

  // 輪子
  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.5, 14);
  const hubGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.52, 8);
  const wheels = [], front = [];
  for (const [x, z, isFront] of [[-1.15, 1.2, true], [1.15, 1.2, true], [-1.2, -1.2, false], [1.2, -1.2, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.48, z);
    const w = mesh(wheelGeo, black); w.rotation.z = Math.PI / 2;
    const h = mesh(hubGeo, metal); h.rotation.z = Math.PI / 2;
    const spin = new THREE.Group(); spin.add(w, h);
    pivot.add(spin);
    g.add(pivot);
    wheels.push(spin);
    if (isFront) front.push(pivot);
  }

  // 松鼠駕駛
  const sq = new THREE.Group();
  sq.position.set(0, 1.05, -0.45);
  const sqParts = [];
  sqParts.push(mesh(new THREE.SphereGeometry(0.46, 14, 12), fur, 0, 0.45, 0));            // 身體
  sqParts.push(mesh(new THREE.SphereGeometry(0.3, 12, 10), furLight, 0, 0.42, 0.25));     // 肚子
  const sc = mesh(new THREE.TorusGeometry(0.34, 0.1, 8, 16), scarf, 0, 0.8, 0); sc.rotation.x = Math.PI / 2; sqParts.push(sc);  // 圍巾
  sqParts.push(mesh(new THREE.SphereGeometry(0.42, 14, 12), fur, 0, 1.2, 0.05));         // 頭
  sqParts.push(mesh(new THREE.SphereGeometry(0.22, 10, 8), furLight, 0, 1.08, 0.36));    // 口鼻
  sqParts.push(mesh(new THREE.SphereGeometry(0.07, 8, 6), eye, 0, 1.05, 0.56));           // 鼻子
  for (const x of [-0.17, 0.17]) {
    sqParts.push(mesh(new THREE.SphereGeometry(0.07, 8, 6), eye, x, 1.3, 0.38));        // 眼睛
    const ear = mesh(new THREE.ConeGeometry(0.13, 0.42, 6), fur, x * 1.6, 1.62, -0.02);
    ear.rotation.z = -x * 0.9; sqParts.push(ear);
  }
  // 手
  for (const x of [-0.3, 0.3]) sqParts.push(mesh(new THREE.SphereGeometry(0.11, 8, 6), fur, x, 0.55, 0.55));
  sq.add(mergeParts(sqParts, { roughness: 0.85 }));   // 松鼠本體合成一個 mesh
  // 大尾巴：一串球排成弧線（整條一起晃，所以也能合成一個）
  const tail = new THREE.Group();
  const tailParts = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const r = 0.22 + 0.22 * Math.sin(t * Math.PI);
    tailParts.push(mesh(new THREE.SphereGeometry(r, 10, 8), i % 2 ? furDark : fur,
      0, 0.3 + t * 1.5, -0.45 - Math.sin(t * Math.PI * 0.8) * 0.55));
  }
  tail.add(mergeParts(tailParts, { roughness: 0.85 }));
  sq.add(tail);
  g.add(sq);

  // 車底柔影（接觸陰影）：讓車子貼在地上，不會像浮著
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5.0), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.6, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; blob.renderOrder = 1;
  g.add(blob);

  return { group: g, wheels, front, squirrel: sq, tail, lightMat, brakeGlow, blob, color: new THREE.Color(colorHex),
    rearWheels: [new THREE.Vector3(-1.2, 0, -1.2), new THREE.Vector3(1.2, 0, -1.2)] };
}

// 輪子轉、前輪跟著方向、尾巴晃、車身依轉向傾斜
export function animateKart(k, speed, steer, dt, t, braking = false) {
  if (k.lightMat) {
    const target = braking ? 2.6 : 0.15;
    k.lightMat.emissiveIntensity += (target - k.lightMat.emissiveIntensity) * Math.min(1, dt * 18);
    k.brakeGlow.material.opacity += ((braking ? 0.55 : 0) - k.brakeGlow.material.opacity) * Math.min(1, dt * 18);
  }
  for (const w of k.wheels) w.rotation.x += speed * dt / 0.48;
  for (const f of k.front) f.rotation.y = -steer * 0.45;
  k.squirrel.rotation.z = steer * 0.18;
  k.tail.rotation.x = Math.sin(t * 9) * 0.12 * (0.3 + Math.min(1, Math.abs(speed) / 20));
}
