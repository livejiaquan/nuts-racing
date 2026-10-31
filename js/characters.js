// 預設角色：全部用基本幾何體拼，不需要模型檔。每隻一個 build 函式，回傳 { group, tail?, face? }：
//   group 是整隻（腳踩在 y=0，面向 +z，坐在駕駛座上大約 1.6～1.9 高）
//   tail  有的話 animateKart 會讓它晃
//   face  表情零件（玩家才做）：{ browL, browR, smile, mouthO, sweat, browY }，animateFace 會動它
// 要加新角色：寫一個 build、加進 CHAR_BUILDERS，再去 garage.js 的 CHARACTERS 加一筆。
import * as THREE from 'three';
import { PALETTE } from './world.js';
import { mesh, mergeParts } from './kart.js';

const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });
const eyeMat = M(0x1A1A1A, { roughness: 0.3 });
const whiteMat = M(0xFFFFFF, { roughness: 0.5 });

// 表情零件：放在臉的位置（headY 嘴巴高度、headZ 臉的前面、headR 臉的半徑）
function addFace(g, headY, headZ, headR = 0.42) {
  const browMat = M(0x4A2A0C);
  const browY = headY + headR * 0.55;
  const browL = mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), browMat, -0.17, browY, headZ);
  const browR = mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), browMat, 0.17, browY, headZ);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 6, 12, Math.PI), M(0x5A2A1E, { roughness: 0.8 }));
  smile.position.set(0, headY - headR * 0.5, headZ + 0.08); smile.rotation.z = Math.PI;
  const mouthO = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M(0x3A1A10));
  mouthO.position.set(0, headY - headR * 0.55, headZ + 0.1); mouthO.visible = false;
  const sweat = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M(0x59C8FF, { roughness: 0.3 }));
  sweat.position.set(headR, headY + headR * 0.35, headZ - 0.15); sweat.scale.set(0.8, 1.3, 0.8); sweat.visible = false;
  [browL, browR, smile, mouthO, sweat].forEach(m => { m.castShadow = false; m.receiveShadow = false; g.add(m); });
  return { browL, browR, smile, mouthO, sweat, browY, sweatY: sweat.position.y };
}

// 松鼠（核果資訊學苑的吉祥物）
function squirrel(face) {
  const fur = M(0xD98A41), furDark = M(0xB5651D), furLight = M(0xF2C994), scarf = M(PALETTE.forest, { roughness: 0.8 });
  const g = new THREE.Group();
  const parts = [];
  parts.push(mesh(new THREE.SphereGeometry(0.46, 14, 12), fur, 0, 0.45, 0));
  parts.push(mesh(new THREE.SphereGeometry(0.3, 12, 10), furLight, 0, 0.42, 0.25));
  const sc = mesh(new THREE.TorusGeometry(0.34, 0.1, 8, 16), scarf, 0, 0.8, 0); sc.rotation.x = Math.PI / 2; parts.push(sc);
  parts.push(mesh(new THREE.SphereGeometry(0.42, 14, 12), fur, 0, 1.2, 0.05));
  parts.push(mesh(new THREE.SphereGeometry(0.22, 10, 8), furLight, 0, 1.08, 0.36));
  parts.push(mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat, 0, 1.05, 0.56));
  for (const x of [-0.17, 0.17]) {
    parts.push(mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat, x, 1.3, 0.38));
    const ear = mesh(new THREE.ConeGeometry(0.13, 0.42, 6), fur, x * 1.6, 1.62, -0.02); ear.rotation.z = -x * 0.9; parts.push(ear);
  }
  for (const x of [-0.3, 0.3]) parts.push(mesh(new THREE.SphereGeometry(0.11, 8, 6), fur, x, 0.55, 0.55));
  g.add(mergeParts(parts, { roughness: 0.85 }));
  const tail = new THREE.Group(), tailParts = [];
  for (let i = 0; i < 6; i++) { const t = i / 5, r = 0.22 + 0.22 * Math.sin(t * Math.PI); tailParts.push(mesh(new THREE.SphereGeometry(r, 10, 8), i % 2 ? furDark : fur, 0, 0.3 + t * 1.5, -0.45 - Math.sin(t * Math.PI * 0.8) * 0.55)); }
  tail.add(mergeParts(tailParts, { roughness: 0.85 })); g.add(tail);
  return { group: g, tail, face: face ? addFace(g, 1.08, 0.40, 0.42) : null };
}

// 核果人：核果 logo 長出手腳
function nutman(face) {
  const body = M(0xE8923A), cap = M(0x5A3A1E, { roughness: 0.5 }), limb = M(0xB5651D);
  const g = new THREE.Group(); const parts = [];
  const b = mesh(new THREE.SphereGeometry(0.5, 16, 14), body, 0, 0.95, 0); b.scale.set(1, 1.15, 1); parts.push(b);
  const c = mesh(new THREE.SphereGeometry(0.52, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), cap, 0, 1.12, 0); parts.push(c);
  parts.push(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), cap, 0, 1.72, 0));
  for (const x of [-0.17, 0.17]) parts.push(mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat, x, 0.95, 0.47));
  for (const x of [-0.5, 0.5]) { const a = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6), limb, x * 1.1, 0.7, 0.2); a.rotation.z = -x * 1.2; a.rotation.x = -0.6; parts.push(a); }
  for (const x of [-0.2, 0.2]) parts.push(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6), limb, x, 0.25, 0.1));
  g.add(mergeParts(parts, { roughness: 0.6 }));
  return { group: g, face: face ? addFace(g, 0.82, 0.44, 0.5) : null };
}

// 貓頭鷹
function owl(face) {
  const fe = M(0x8C7A66), feLight = M(0xD9CBB0), beak = M(0xE8743B);
  const g = new THREE.Group(); const parts = [];
  const b = mesh(new THREE.SphereGeometry(0.5, 16, 14), fe, 0, 0.75, 0); b.scale.set(0.9, 1.3, 0.9); parts.push(b);
  const belly = mesh(new THREE.SphereGeometry(0.34, 12, 10), feLight, 0, 0.6, 0.25); belly.scale.set(1, 1.3, 0.6); parts.push(belly);
  for (const x of [-0.19, 0.19]) { parts.push(mesh(new THREE.SphereGeometry(0.17, 10, 8), whiteMat, x, 1.18, 0.38)); parts.push(mesh(new THREE.SphereGeometry(0.09, 8, 6), eyeMat, x, 1.18, 0.52)); const tuft = mesh(new THREE.ConeGeometry(0.1, 0.35, 5), fe, x * 2.2, 1.55, 0); tuft.rotation.z = -x * 1.5; parts.push(tuft); }
  const bk = mesh(new THREE.ConeGeometry(0.08, 0.22, 5), beak, 0, 1.0, 0.5); bk.rotation.x = Math.PI / 2; parts.push(bk);
  for (const x of [-0.5, 0.5]) { const w = mesh(new THREE.SphereGeometry(0.22, 10, 8), fe, x, 0.7, 0); w.scale.set(0.5, 1.4, 0.8); parts.push(w); }
  g.add(mergeParts(parts, { roughness: 0.9 }));
  return { group: g, face: face ? addFace(g, 0.98, 0.46, 0.4) : null };
}

// 水豚：頭上頂一顆橘子
function capybara(face) {
  const fur = M(0xB07A45), furDark = M(0x7A5330), orange = M(0xFF9A2E, { roughness: 0.5 }), leaf = M(0x3C8C3C);
  const g = new THREE.Group(); const parts = [];
  const b = mesh(new THREE.SphereGeometry(0.5, 16, 14), fur, 0, 0.6, -0.05); b.scale.set(1.1, 1, 1.2); parts.push(b);
  const h = mesh(new THREE.BoxGeometry(0.7, 0.62, 0.8), fur, 0, 1.2, 0.15); parts.push(h);
  parts.push(mesh(new THREE.BoxGeometry(0.5, 0.36, 0.3), furDark, 0, 1.08, 0.6));
  for (const x of [-0.2, 0.2]) { parts.push(mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMat, x, 1.3, 0.56)); parts.push(mesh(new THREE.SphereGeometry(0.1, 8, 6), furDark, x * 1.7, 1.5, -0.05)); parts.push(mesh(new THREE.SphereGeometry(0.04, 6, 5), eyeMat, x * 0.6, 1.02, 0.76)); }
  parts.push(mesh(new THREE.SphereGeometry(0.17, 10, 8), orange, 0.1, 1.65, 0.05));
  parts.push(mesh(new THREE.BoxGeometry(0.12, 0.03, 0.2), leaf, 0.15, 1.82, 0.05));
  for (const x of [-0.3, 0.3]) parts.push(mesh(new THREE.SphereGeometry(0.11, 8, 6), fur, x, 0.5, 0.5));
  g.add(mergeParts(parts, { roughness: 0.9 }));
  return { group: g, face: face ? addFace(g, 1.17, 0.57, 0.36) : null };
}

// 台灣黑熊：胸口白 V
function bear(face) {
  const fur = M(0x262626), muzzle = M(0x8A6A4A);
  const g = new THREE.Group(); const parts = [];
  parts.push(mesh(new THREE.SphereGeometry(0.5, 16, 14), fur, 0, 0.55, 0));
  parts.push(mesh(new THREE.SphereGeometry(0.44, 16, 14), fur, 0, 1.25, 0.05));
  parts.push(mesh(new THREE.SphereGeometry(0.2, 10, 8), muzzle, 0, 1.12, 0.38));
  parts.push(mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat, 0, 1.17, 0.56));
  for (const x of [-0.17, 0.17]) { parts.push(mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMat, x, 1.33, 0.4)); parts.push(mesh(new THREE.SphereGeometry(0.14, 8, 6), fur, x * 2, 1.6, -0.05)); }
  for (const x of [-1, 1]) { const v = mesh(new THREE.BoxGeometry(0.08, 0.34, 0.06), whiteMat, x * 0.12, 0.72, 0.47); v.rotation.z = x * 0.6; parts.push(v); }
  for (const x of [-0.35, 0.35]) parts.push(mesh(new THREE.SphereGeometry(0.13, 8, 6), fur, x, 0.55, 0.52));
  g.add(mergeParts(parts, { roughness: 0.95 }));
  return { group: g, face: face ? addFace(g, 1.12, 0.46, 0.44) : null };
}

// 小機器人：方頭、發亮面罩、天線
function robot(face) {
  const metal = M(0xBFC4CC, { roughness: 0.35, metalness: 0.6 }), dark = M(0x3A4048, { roughness: 0.5 }), glow = M(0x59C8FF, { emissive: 0x59C8FF, emissiveIntensity: 0.9, roughness: 0.3 }), orange = M(0xE8743B, { roughness: 0.5 });
  const g = new THREE.Group(); const parts = [];
  parts.push(mesh(new THREE.BoxGeometry(0.8, 0.7, 0.6), metal, 0, 0.5, 0));
  parts.push(mesh(new THREE.BoxGeometry(0.76, 0.66, 0.66), metal, 0, 1.25, 0));
  parts.push(mesh(new THREE.BoxGeometry(0.6, 0.26, 0.06), dark, 0, 1.3, 0.34));
  for (const x of [-0.15, 0.15]) parts.push(mesh(new THREE.BoxGeometry(0.14, 0.12, 0.04), glow, x, 1.3, 0.38));
  parts.push(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), dark, 0, 1.72, 0));
  parts.push(mesh(new THREE.SphereGeometry(0.08, 8, 6), orange, 0, 1.9, 0));
  for (const x of [-0.5, 0.5]) { const a = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6), dark, x, 0.6, 0.25); a.rotation.x = -1.0; parts.push(a); parts.push(mesh(new THREE.BoxGeometry(0.2, 0.5, 0.3), metal, x * 0.95, 0.45, 0)); }
  parts.push(mesh(new THREE.BoxGeometry(0.3, 0.18, 0.04), orange, 0, 0.55, 0.32));
  g.add(mergeParts(parts, { roughness: 0.4, metalness: 0.3 }));
  return { group: g, face: face ? addFace(g, 1.1, 0.36, 0.38) : null };
}

export const CHAR_BUILDERS = { squirrel, nutman, owl, capybara, bear, robot };
export const CHAR_IDS = Object.keys(CHAR_BUILDERS);
export function buildCharacter(id, face = false) {
  const b = CHAR_BUILDERS[id] || squirrel;
  const c = b(face);
  c.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
  if (c.face) for (const k of ['browL', 'browR', 'smile', 'mouthO', 'sweat']) c.face[k].castShadow = false;
  c.builtIn = true;   // 內建角色：換掉時可以把幾何釋放掉（上傳的模型不是）
  return c;
}
