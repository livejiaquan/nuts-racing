// 道具系統：賽道直線上有一排排道具箱，撞到就隨機抽一種道具、馬上生效。
// 要加新道具只要在 POWERUPS 加一筆：id、name（橫幅用）、color、weight（抽中機率的權重）、apply(ctx)。
// ctx 由 main.js 給：player、teleportForward(公尺, 顏色)、flashScreen(顏色)、banner(文字, 樣式)、toast、sfx、setMood、say。
import * as THREE from 'three';
import { SAMPLES } from './track.js';

export const POWERUPS = [
  {
    id: 'flash', name: '閃身步', desc: '往前瞬移一小段，像網路上那個閃身步', color: 0x59C8FF, weight: 1,
    apply(ctx) {
      ctx.sfx.whoosh(); ctx.sfx.boost();
      ctx.flashScreen('#9BE8FF');
      ctx.teleportForward(26, 0x59C8FF);   // 26 公尺：全速大約 0.45 秒的路，有感覺但不會一撿就贏
      ctx.banner('閃身步！', 'flash');
      ctx.setMood('happy', 1.0);
      ctx.say(ctx.player, '閃！');
    }
  }
];

// 依 weight 隨機抽一個
export function pickPowerup() {
  const total = POWERUPS.reduce((a, p) => a + (p.weight || 1), 0);
  let r = Math.random() * total;
  for (const p of POWERUPS) { r -= (p.weight || 1); if (r <= 0) return p; }
  return POWERUPS[POWERUPS.length - 1];
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

// 撞到道具箱：回傳抽到的道具，沒撞到回 null
export function hitItemBox(boxes, pos) {
  for (const b of boxes) {
    if (!b.alive) continue;
    if (b.pos.distanceToSquared(pos) < 2.4 * 2.4) {
      b.alive = false; b.timer = BOX_RESPAWN; b.mesh.visible = false;
      return pickPowerup();
    }
  }
  return null;
}
