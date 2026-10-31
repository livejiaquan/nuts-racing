// 道具系統：賽道直線上有一排排道具箱，撞到就跑一段轉盤、抽一種道具、馬上生效（像瑪利歐賽車）。
// 要加新道具只要在 POWERUPS 加一筆：
//   id、name（橫幅與轉盤用）、color、icon（轉盤格子的 SVG）、apply(ctx)
//   weight(f)：抽中權重，f 是名次比例（0 = 第一名，1 = 最後一名）。落後的人抽到強道具的機會大，領先的人多抽到小道具
// ctx 由 main.js 給：player、teleportForward、flashScreen、banner、toast、sfx、setMood、say、boost、shield、grow、lightning、missile、banana、addNuts。
import * as THREE from 'three';
import { SAMPLES } from './track.js';

const ICON = {
  flash: '<svg viewBox="0 0 48 48"><path d="M26 4L10 28h12l-4 16 18-26H24z" fill="#9BE8FF"/></svg>',
  nut: '<svg viewBox="0 0 48 48"><path d="M24 44c-10 0-15-8-15-18 0-6 6-10 15-10s15 4 15 10c0 10-5 18-15 18z" fill="#F0A24A"/><path d="M9 20q15-9 30 0q-15 6-30 0z" fill="#5A3A1E"/></svg>',
  shield: '<svg viewBox="0 0 48 48"><path d="M24 4l16 6v12c0 10-7 18-16 22C15 40 8 32 8 22V10z" fill="#59C8FF" opacity=".9"/><path d="M24 10l10 4v8c0 7-4 12-10 15V10z" fill="#fff" opacity=".35"/></svg>',
  grow: '<svg viewBox="0 0 48 48"><path d="M24 44c-12 0-17-9-17-19 0-7 7-12 17-12s17 5 17 12c0 10-5 19-17 19z" fill="#E8743B"/><path d="M7 25q17-11 34 0q-17 7-34 0z" fill="#5A3A1E"/><circle cx="18" cy="34" r="3" fill="#fff" opacity=".7"/></svg>',
  lightning: '<svg viewBox="0 0 48 48"><path d="M28 2L8 26h13l-5 20 24-28H27z" fill="#FFD34D"/></svg>',
  missile: '<svg viewBox="0 0 48 48"><path d="M6 30l20-20 12 12-20 20z" fill="#D7262C"/><circle cx="34" cy="14" r="8" fill="#F0A24A"/><path d="M4 44l10-6-4-4z" fill="#FFB043"/></svg>',
  banana: '<svg viewBox="0 0 48 48"><path d="M10 12c-2 16 8 28 26 28 4 0 6-2 6-4-12 2-22-8-24-24 0-2-7-3-8 0z" fill="#FFD34D"/><path d="M10 12c1-3 7-2 8 0" fill="#8B6B2E"/></svg>'
};

export const POWERUPS = [
  {
    id: 'flash', name: '閃身步', color: 0x59C8FF, icon: ICON.flash, weight: f => 2,
    apply(ctx) { ctx.sfx.whoosh(); ctx.sfx.boost(); ctx.flashScreen('#9BE8FF'); ctx.teleportForward(26, 0x59C8FF); ctx.banner('閃身步！', 'flash'); ctx.setMood('happy', 1.0); ctx.say(ctx.player, '閃！'); }
  },
  {
    id: 'nuts', name: '核果雨', color: 0xF0A24A, icon: ICON.nut, weight: f => 1.5,
    apply(ctx) { ctx.addNuts(3); ctx.boost(1.2, 6); ctx.banner('核果雨！', 'nut'); ctx.setMood('happy', 1.0); ctx.say(ctx.player, '好吃！'); }
  },
  {
    id: 'shield', name: '護盾', color: 0x59C8FF, icon: ICON.shield, weight: f => 1.2 + f * 0.5,
    apply(ctx) { ctx.shield(8); ctx.banner('護盾！', 'shield'); ctx.sfx.nut(); ctx.say(ctx.player, '撞不到我'); }
  },
  {
    id: 'grow', name: '巨大核果', color: 0xE8743B, icon: ICON.grow, weight: f => 0.6 + f * 1.2,
    apply(ctx) { ctx.grow(6); ctx.banner('巨大化！', 'nut'); ctx.sfx.boost(); ctx.setMood('happy', 1.5); ctx.say(ctx.player, '讓開讓開！'); }
  },
  {
    id: 'missile', name: '核果飛彈', color: 0xD7262C, icon: ICON.missile, weight: f => 0.4 + f * 2,
    apply(ctx) { const hit = ctx.missile(); ctx.banner('核果飛彈！', 'missile'); ctx.sfx.whoosh(); ctx.setMood('focus', 1.0); if (!hit) ctx.toast('前面沒有車'); }
  },
  {
    id: 'lightning', name: '閃電', color: 0xFFD34D, icon: ICON.lightning, weight: f => f < 0.4 ? 0 : f * 1.6,   // 前段班抽不到
    apply(ctx) { ctx.lightning(3); ctx.flashScreen('#FFFFFF'); ctx.banner('閃電！', 'lightning'); ctx.sfx.cone(); ctx.sfx.boost(); ctx.say(ctx.player, '大家慢下來！'); }
  },
  {
    id: 'banana', name: '香蕉皮', color: 0xFFD34D, icon: ICON.banana, weight: f => 2 - f * 1.4,   // 領先的人丟給後面的人踩
    apply(ctx) { ctx.banana(); ctx.banner('香蕉皮！', 'nut'); ctx.sfx.click(); ctx.say(ctx.player, '小心後面'); }
  }
];

// 依名次比例 f 抽一個；lastId 是上一次抽到的，盡量不要連續兩次一樣
export function pickPowerup(f = 0.5, lastId = null) {
  const pool = POWERUPS.map(p => ({ p, w: Math.max(0, p.weight ? p.weight(f) : 1) })).filter(x => x.w > 0);
  const draw = () => { const total = pool.reduce((a, x) => a + x.w, 0); let r = Math.random() * total; for (const x of pool) { r -= x.w; if (r <= 0) return x.p; } return pool[pool.length - 1].p; };
  let pu = draw();
  if (lastId && pu.id === lastId && pool.length > 1) pu = draw();
  return pu;
}

// ---------- 道具箱 ----------
const BOX_ROWS = 4;        // 幾排
const BOX_PER_ROW = 3;     // 一排幾個（橫跨路面）
export const BOX_RESPAWN = 8;   // 撿走幾秒後長回來

function questionTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#FDF6E3'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#1E5631'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
  g.fillStyle = '#E8743B'; g.font = '900 86px "Russo One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 找直線：避開彎道前後 40 個取樣和起跑線附近，把剩下的路切成一段段，挑最長的 BOX_ROWS 段、各在中間放一排
export function buildItemBoxes(S, scene, corners) {
  const bad = new Uint8Array(SAMPLES);
  for (const c of corners) for (let i = c.start - 40; i <= c.end + 40; i++) bad[((i % SAMPLES) + SAMPLES) % SAMPLES] = 1;
  for (let i = -30; i < 80; i++) bad[((i % SAMPLES) + SAMPLES) % SAMPLES] = 1;
  const runs = [];
  let start = -1;
  for (let i = 0; i <= SAMPLES; i++) {
    const ok = i < SAMPLES && !bad[i];
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) { runs.push({ start, len: i - start }); start = -1; }
  }
  runs.sort((a, b) => b.len - a.len);
  const rowIdx = runs.slice(0, BOX_ROWS).map(r => r.start + Math.floor(r.len / 2)).sort((a, b) => a - b);
  const tex = questionTexture();
  const geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0x59C8FF, emissiveMap: tex, emissiveIntensity: 0.6, roughness: 0.3, transparent: true, opacity: 0.92 });
  const boxes = [];
  for (const i of rowIdx) {
    const hw = S.w[i];
    for (let j = 0; j < BOX_PER_ROW; j++) {
      const lat = (j - (BOX_PER_ROW - 1) / 2) * hw * 0.55;
      const p = S.p[i], r = S.r[i];
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false; m.receiveShadow = false;
      const pos = new THREE.Vector3(p.x + r.x * lat, p.y + 1.3, p.z + r.z * lat);
      m.position.copy(pos);
      scene.add(m);
      boxes.push({ mesh: m, pos, index: i, alive: true, timer: 0, phase: Math.random() * 6 });
    }
  }
  boxes.mat = mat;
  return boxes;
}

export function resetItemBoxes(boxes) {
  for (const b of boxes) { b.alive = true; b.timer = 0; b.mesh.visible = true; b.mesh.scale.setScalar(1); }
}

// 旋轉、上下浮、彩虹發光；撿走的過幾秒彈回來
const _c = new THREE.Color();
export function updateItemBoxes(boxes, dt, t) {
  if (boxes.mat) boxes.mat.emissive.copy(_c.setHSL((t * 0.25) % 1, 0.9, 0.55));
  for (const b of boxes) {
    if (!b.alive) {
      b.timer -= dt;
      if (b.timer <= 0) { b.alive = true; b.mesh.visible = true; b.mesh.scale.setScalar(0.01); }
      continue;
    }
    const m = b.mesh;
    if (m.scale.x < 1) m.scale.setScalar(Math.min(1, m.scale.x + dt * 3));
    m.rotation.y = t * 1.6 + b.phase; m.rotation.x = Math.sin(t * 1.1 + b.phase) * 0.5;
    m.position.y = b.pos.y + Math.sin(t * 2 + b.phase) * 0.2;
  }
}

// 撞到道具箱：回傳那顆箱子，沒撞到回 null（抽哪種道具由 main.js 依名次決定）
export function hitItemBox(boxes, pos) {
  for (const b of boxes) {
    if (!b.alive) continue;
    if (b.pos.distanceToSquared(pos) < 2.4 * 2.4) {
      b.alive = false; b.timer = BOX_RESPAWN; b.mesh.visible = false;
      return b;
    }
  }
  return null;
}

// 香蕉皮的模型：一截彎彎的黃色圓管
export function makeBanana() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.16, 8, 14, Math.PI * 1.1), new THREE.MeshStandardMaterial({ color: 0xFFD34D, roughness: 0.6 }));
  m.rotation.x = Math.PI / 2; m.rotation.z = Math.PI; m.position.y = 0.2; m.castShadow = true;
  g.add(m);
  return g;
}

// 核果飛彈的模型：橘色發光球
export function makeMissile() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshStandardMaterial({ color: 0xF0A24A, emissive: 0xFF7A1A, emissiveIntensity: 1.2, roughness: 0.4 }));
  m.castShadow = false;
  return m;
}
