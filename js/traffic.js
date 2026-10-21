// 背景車流：Kenney 的車在左營的背景馬路上來回開，讓城市像活的。只是裝飾，不會撞到玩家。
// 每種車一個 InstancedMesh，每幀更新矩陣；車走到路的盡頭就掉頭。
import * as THREE from 'three';
import { MODELS } from './models.js';
import { distToTrack } from './city.js';

const CARS = ['sedan', 'taxi', 'van', 'suv', 'hatchback-sports', 'delivery', 'police', 'truck'];
const cars = [];        // {run, d, dir, speed, lane, sc, name, slot, seg}
const meshes = {};      // name → InstancedMesh
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0);

function prepRun(run) {
  const pts = run.pts, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1], half: run.half };
}

// runs：city.js 的 CITY_RUNS（[{pts, half}]）；S：賽道取樣，用來避開跨過賽道的路
export function buildTraffic(scene, runs, S, maxCars = 48) {
  const names = CARS.filter(n => MODELS[n]);
  if (!names.length || !runs.length) return 0;
  const good = [];
  for (const r0 of runs) {
    if (r0.half < 4.5) continue;                    // 小巷不跑車
    const r = prepRun(r0);
    if (r.len < 90) continue;
    // 每 12 公尺抽查一次，太靠近賽道的路不放車（背景路本來就切過賽道附近，但長直段可能跨過去）
    let ok = true;
    for (let d = 0; d <= r.len && ok; d += 12) { const [x, z] = posAt(r, d); if (distToTrack(S, x, z) < 14) ok = false; }
    if (ok) good.push(r);
  }
  good.sort(() => Math.random() - 0.5);
  const per = {};
  for (const r of good) {
    if (cars.length >= maxCars) break;
    const n = Math.min(3, Math.max(1, Math.floor(r.len / 110)));
    for (let k = 0; k < n && cars.length < maxCars; k++) {
      const name = names[Math.floor(Math.random() * names.length)];
      const dir = Math.random() < 0.5 ? 1 : -1;
      cars.push({ run: r, d: Math.random() * r.len, dir, speed: 7 + Math.random() * 6, lane: r.half - 2.6, sc: 4.4 / MODELS[name].size.z, name, slot: (per[name] = (per[name] || 0) + 1) - 1, seg: 0 });
    }
  }
  for (const name of Object.keys(per)) {
    const m = MODELS[name];
    const im = new THREE.InstancedMesh(m.geo, m.mat, per[name]);
    im.frustumCulled = false; im.castShadow = true; im.receiveShadow = false;
    scene.add(im); meshes[name] = im;
  }
  updateTraffic(0);
  return cars.length;
}

function posAt(r, d) {
  const cum = r.cum, pts = r.pts;
  let i = 0; while (i < cum.length - 2 && cum[i + 1] < d) i++;
  const segLen = Math.max(1e-6, cum[i + 1] - cum[i]);
  const t = Math.max(0, Math.min(1, (d - cum[i]) / segLen));
  const a = pts[i], b = pts[i + 1];
  const tx = (b[0] - a[0]) / segLen, tz = (b[1] - a[1]) / segLen;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, tx, tz];
}

export function updateTraffic(dt) {
  for (const c of cars) {
    c.d += c.speed * c.dir * dt;
    if (c.d >= c.run.len - 6) { c.d = c.run.len - 6; c.dir = -1; }
    else if (c.d <= 6) { c.d = 6; c.dir = 1; }
    const [x, z, tx, tz] = posAt(c.run, c.d);
    // 靠右行駛：右向量 = (-tz, tx)，方向反過來時右邊也反過來
    const rx = -tz * c.dir, rz = tx * c.dir;
    const m = MODELS[c.name];
    p.set(x + rx * c.lane, -m.min.y * c.sc + 0.02, z + rz * c.lane);
    q.setFromAxisAngle(axis, Math.atan2(tx * c.dir, tz * c.dir));
    s.set(c.sc, c.sc, c.sc);
    m4.compose(p, q, s);
    meshes[c.name].setMatrixAt(c.slot, m4);
  }
  for (const name of Object.keys(meshes)) meshes[name].instanceMatrix.needsUpdate = true;
}
export function trafficCount() { return cars.length; }
