// 核果賽車 3D — 主程式
import * as THREE from 'three';
import { PALETTE, createRenderer, createScene, addSky, addClouds, addLights, followShadow, addGround, addMountains, addTrees } from './world.js';
import { ROAD_HALF, SAMPLES, buildCurve, sampleCurve, nearest, buildRoad, buildGate, placeItems, buildCornerGear, buildBridges } from './track.js';
import { buildKaohsiung } from './kaohsiung.js';
import { buildCityRoads, buildBuildings, buildStreetFurniture, buildLandmarks, buildCrosswalks, parkTreeSpots, buildParkedCars, buildParkTrees } from './city.js';
import { loadModels, MODELS, cullByDistance } from './models.js';
import { ROADS } from './osm_data.js';
import { KART_COLORS, buildKart, animateKart } from './kart.js';
import * as MBit from './microbit.js';
import { SFX, engineStart, engineUpdate, bgmStart, bgmSet, setMuted, isMuted, skidUpdate, audioState } from './audio.js';
import { PostFX } from './fx.js';
import { SkidMarks } from './skid.js';

// ---------- 參數（想調手感就改這裡） ----------
const TOTAL_LAPS = 2;        // 這條賽道一圈約 2.6 公里，2 圈剛好
const MAX_SPEED = 58;        // 公尺/秒
const BOOST_MAX = 74;
const ACCEL = 20;
const BRAKE = 55;
const DRAG = 9;
const OFFROAD_MAX = 20;
const RIVAL_COUNT = 4;
const STEP = 1 / 60;         // 物理固定時步，不同電腦手感一樣
// 漂移：按住煞車（A／↓）＋轉向＋夠快就甩尾；放開依蓄力給加速
const DRIFT_MIN_SPEED = MAX_SPEED * 0.42;
const DRIFT_T1 = 0.8, DRIFT_T2 = 1.8;   // 蓄力秒數：藍火花 → 橘火花

// ---------- 基本建置 ----------
const canvas = document.getElementById('cv');
const renderer = createRenderer(canvas);
const scene = createScene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 1600);
const UP = new THREE.Vector3(0, 1, 0);
let fx = null, skid = null;
let clouds, lights, S, items, landmarks;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (fx) { const sz = renderer.getDrawingBufferSize(new THREE.Vector2()); fx.setSize(sz.x, sz.y); }
}
window.addEventListener('resize', resize);
resize();

// ---------- 載入畫面 ----------
const loadEl = { box: document.getElementById('loading'), bar: document.getElementById('load-bar'), tip: document.getElementById('load-tip'), pct: document.getElementById('load-pct') };
const TIPS = ['按住煞車進彎可以漂移，放開會加速', '核果在彎道裡會擺在內側，照著吃就是賽車線', '綠色加速板踩中央最有效', '港景高架沒有護欄，衝太快會掉下去', 'micro:bit 擺平按「校正置中」再開', '撞到三角錐會打滑，看到橘色箭頭先減速'];
async function stage(pct, text, fn) {
  if (loadEl.bar) loadEl.bar.style.width = pct + '%';
  if (loadEl.pct) loadEl.pct.textContent = text;
  await new Promise(r => setTimeout(r, 0));
  if (fn) fn();
}

// ---------- 車輛 ----------
function makeRacer(colorHex) {
  const k = buildKart(colorHex);
  scene.add(k.group);
  return {
    kart: k, pos: new THREE.Vector3(), vel: new THREE.Vector3(), heading: 0, speed: 0, prevSpeed: 0,
    steer: 0, hint: 0, lap: 1, lapMax: 1, prog: 0, prevIndex: 0, boost: 0, spin: 0, offroad: false,
    nuts: 0, finishTime: 0, laps: [], lapStart: 0,
    drift: 0, driftCharge: 0, pitch: 0, susp: 0, suspVel: 0, visYaw: 0
  };
}

let playerColorIdx = 0;
let player = null;
const rivals = [];
const rivalPalette = [0x3F8FD6, 0x8E4FC0, 0xE8C21A, 0x2E8B57, 0xF07AA8];

function forwardOf(h, out) { return out.set(Math.sin(h), 0, Math.cos(h)); }
function rightOf(h, out) { return out.set(-Math.cos(h), 0, Math.sin(h)); }

function placeOnTrack(racer, index, lat, back = 0) {
  const p = S.p[index], r = S.r[index], t = S.t[index];
  racer.pos.set(p.x + r.x * lat - t.x * back, p.y, p.z + r.z * lat - t.z * back);
  racer.heading = Math.atan2(t.x, t.z);
  racer.vel.set(0, 0, 0); racer.speed = 0; racer.prevSpeed = 0;
  racer.hint = nearest(S, racer.pos, -1).index; racer.prevIndex = racer.hint;
  // prog 是從起跑線算起、連續累計的取樣數（可負）；起跑線後面出發就是負的，過線一次等於一圈
  racer.lap = back > 0 ? 0 : 1; racer.lapMax = racer.lap; racer.prog = back > 0 ? racer.hint - SAMPLES : racer.hint;
  racer.boost = 0; racer.falling = false; racer.airborne = false; racer.vy = 0; racer.spin = 0; racer.nuts = 0; racer.finishTime = 0; racer.laps = []; racer.lapStart = 0;
  racer.drift = 0; racer.driftCharge = 0; racer.pitch = 0; racer.susp = 0; racer.suspVel = 0; racer.visYaw = 0;
  racer.kart.group.position.copy(racer.pos);
  racer.kart.group.rotation.set(0, racer.heading, 0);
}

function resetRace() {
  placeOnTrack(player, 0, 0, 10);
  rivals.forEach((r, i) => {
    const idx = 8 + Math.floor(i / 2) * 10;
    const lat = (i % 2 ? 1 : -1) * 3.2;
    placeOnTrack(r, idx, lat);
    r.u = idx / SAMPLES; r.lat = lat; r.targetLat = lat;
    r.base = MAX_SPEED * (0.80 + 0.045 * i);
  });
  for (const n of items.nuts) { n.alive = true; n.mesh.visible = true; }
  for (const c of items.cones) { c.hit = 0; c.vel = null; c.mesh.rotation.set(0, 0, 0); const p = S.p[c.index], r = S.r[c.index]; c.mesh.position.set(p.x + r.x * c.lat, p.y, p.z + r.z * c.lat); }
  if (skid) skid.clear();
  raceTime = 0; countdown = 3.99; prevLapTime = 0;
}

// ---------- 輸入 ----------
const keys = { left: false, right: false, up: false, down: false };
const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
function typing(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); }   // 在名字欄打字時不要搶走 a/d/w/s
window.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (gameState === 'title' || gameState === 'done') && !tutorialOpen()) { requestStart(); return; }
  if (typing(e)) return;
  const k = KEYMAP[e.key]; if (k) { keys[k] = true; e.preventDefault(); }
});
window.addEventListener('keyup', e => { if (typing(e)) return; const k = KEYMAP[e.key]; if (k) keys[k] = false; });

// ---------- 粒子 ----------
let _softDot = null;
function softDot() {
  if (_softDot) return _softDot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.6)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  _softDot = new THREE.CanvasTexture(c);
  return _softDot;
}

class Particles {
  constructor(count, color, size, additive = false) {
    this.count = count; this.i = 0;
    this.pos = new Float32Array(count * 3);
    this.vel = []; this.life = new Float32Array(count); this.grav = new Float32Array(count);
    for (let i = 0; i < count; i++) { this.vel.push(new THREE.Vector3()); this.pos[i * 3 + 1] = -100; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ color, size, map: softDot(), transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true, alphaTest: 0.05, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(p, v, life, grav = 2) {
    const i = this.i; this.i = (this.i + 1) % this.count;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i].copy(v); this.life[i] = life; this.grav[i] = grav;
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.pos[i * 3] += this.vel[i].x * dt; this.pos[i * 3 + 1] += this.vel[i].y * dt; this.pos[i * 3 + 2] += this.vel[i].z * dt;
      this.vel[i].y += this.grav[i] * dt;
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -100;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
let flame, dust, sparkle, smoke, sparkB, sparkO;

// ---------- 遊戲狀態 ----------
let gameState = 'loading';   // loading | title | countdown | race | done
let raceTime = 0, countdown = 0, lastCount = 4, prevLapTime = 0;
let shake = 0, hitSlow = 0;
const tmpF = new THREE.Vector3(), tmpR = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpW = new THREE.Vector3();

function getInput(dt) {
  const tilt = MBit.steer(dt);
  let steer, gas, brake;
  if (tilt !== null) { steer = tilt; gas = MBit.MB.b; brake = MBit.MB.a; }   // 像開車：右手 B 油門、左手 A 煞車
  else { steer = (keys.left ? -1 : 0) + (keys.right ? 1 : 0); gas = keys.up; brake = keys.down; }
  return { steer, gas, brake };
}

function updatePlayer(dt) {
  const inp = getInput(dt);
  const p = player;
  const pct = Math.min(1, p.speed / MAX_SPEED);
  p.prevSpeed = p.speed;

  // ----- 漂移 -----
  const canDrift = Math.abs(inp.steer) > 0.35 && p.speed > DRIFT_MIN_SPEED && !p.offroad && !p.airborne && !p.falling;
  if (!p.drift && inp.brake && canDrift) {
    p.drift = inp.steer < 0 ? -1 : 1; p.driftCharge = 0;
    SFX.click();
  }
  if (p.drift) {
    const keep = inp.brake && p.speed > MAX_SPEED * 0.28 && !p.offroad && !p.airborne && !p.falling;
    if (keep) {
      p.driftCharge += dt;
      if (Math.abs(p.driftCharge - DRIFT_T1) < dt) SFX.nut();
      if (Math.abs(p.driftCharge - DRIFT_T2) < dt) SFX.boost();
    } else {
      // 放開：依蓄力給加速
      const c = p.driftCharge;
      if (c >= DRIFT_T2) { p.boost = Math.max(p.boost, 1.4); p.speed = Math.min(BOOST_MAX, p.speed + 10); SFX.boost(); SFX.whoosh(); toast('超級加速！'); showBanner('SUPER BOOST', 'boost'); }
      else if (c >= DRIFT_T1) { p.boost = Math.max(p.boost, 0.7); p.speed = Math.min(BOOST_MAX, p.speed + 5); SFX.boost(); toast('漂移加速！'); }
      p.drift = 0; p.driftCharge = 0;
    }
  }
  const drifting = p.drift !== 0;

  // ----- 轉向：高速時轉得少一點；漂移時往漂移方向多轉、還能用方向微調 -----
  let steerAmount = inp.steer * (1.0 - 0.45 * pct);
  if (drifting) steerAmount = p.drift * 0.55 + inp.steer * 0.55;
  p.steer += (steerAmount - p.steer) * Math.min(1, dt * 12);
  let turn = p.steer * (drifting ? 2.9 : 2.3) * Math.min(1, p.speed / 10);
  if (p.spin > 0) { p.spin -= dt; turn += Math.sin(p.spin * 25) * 3.5; }
  p.heading -= turn * dt;   // heading 變大是左轉，所以右轉要減

  // ----- 油門／煞車 -----
  p.braking = !!inp.brake && p.speed > 2 && !drifting;
  p.throttle = !!inp.gas;
  if (drifting) {
    p.speed -= 5 * dt;                                   // 漂移時只慢一點點
    if (inp.gas) p.speed += ACCEL * 0.5 * dt;
  } else if (inp.brake) p.speed -= BRAKE * dt;           // 煞到底會慢慢倒車（最多 -8）
  else if (inp.gas) p.speed += ACCEL * dt;
  else if (p.speed > 0) p.speed = Math.max(0, p.speed - DRAG * dt);
  else if (p.speed < 0) p.speed = Math.min(0, p.speed + DRAG * dt);
  if (p.boost > 0) { p.boost -= dt; p.speed += ACCEL * 1.6 * dt; }

  // ----- 路面判定 -----
  const n = nearest(S, p.pos, p.hint);
  p.hint = n.index;
  const absLat = Math.abs(n.lateral);
  const half = n.w;
  p.offroad = absLat > half + 0.3;
  if (p.offroad && p.speed > OFFROAD_MAX) p.speed -= 40 * dt;
  const LIMIT = half + 2.6;
  if (absLat > LIMIT && (S.railSoft[n.index] || S.p[n.index].y < 1.5) && !p.falling) {
    const push = (absLat - LIMIT) + 0.15;
    const sgn = Math.sign(n.lateral);
    p.pos.x -= n.right.x * push * sgn;
    p.pos.z -= n.right.z * push * sgn;
    const vLat = p.vel.x * n.right.x + p.vel.z * n.right.z;
    if (vLat * sgn > 0) { p.vel.x -= n.right.x * vLat; p.vel.z -= n.right.z * vLat; }
    if (p.speed > 14 && !p.wallHit) {
      p.speed *= 0.6; shake = 0.4; SFX.bump();
      const want = Math.atan2(n.tangent.x, n.tangent.z);
      let diff = want - p.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      p.heading += diff * 0.5;
      p.drift = 0; p.driftCharge = 0;
    }
    p.wallHit = true;
  } else p.wallHit = false;
  const cap = p.boost > 0 ? BOOST_MAX : MAX_SPEED;
  p.speed = Math.max(-8, Math.min(p.speed, cap));

  // ----- 速度向量有一點滑；漂移時更滑 -----
  forwardOf(p.heading, tmpF);
  tmpV.copy(tmpF).multiplyScalar(p.speed);
  const grip = p.offroad ? 3.5 : (drifting ? 2.6 : 7);
  p.vel.lerp(tmpV, 1 - Math.exp(-dt * grip));
  p.pos.addScaledVector(p.vel, dt);

  // ----- 垂直 -----
  const roadY = S.p[n.index].y;
  const onRoad = absLat <= half + 2.0;
  const edgeOk = S.railSoft[n.index] || roadY < 1.5;
  const wasAir = p.airborne;
  if (p.falling) {
    p.vy -= 30 * dt; p.pos.y += p.vy * dt;
    p.speed *= (1 - dt * 0.8);
    if (p.pos.y < -8) respawn(p, n.index);
  } else if (!onRoad && !edgeOk) {
    p.falling = true; p.vy = 0; p.airborne = true; shake = 0.6; SFX.bump(); toast('掉下去了！');
    p.drift = 0; p.driftCharge = 0;
  } else if (p.airborne) {
    p.vy -= 30 * dt; p.pos.y += p.vy * dt;
    if (p.pos.y <= roadY) { p.pos.y = roadY; p.airborne = false; p.suspVel = Math.min(0, p.vy) * 0.08; p.vy = 0; shake = Math.max(shake, 0.25); }
  } else {
    const dy = roadY - p.pos.y;
    if (dy < -0.9 && p.speed > 15) { p.airborne = true; p.vy = Math.max(0, p.speed * 0.08); toast('飛起來了！'); p.drift = 0; }
    else p.pos.y += dy * Math.min(1, dt * 14);
  }

  // ----- 圈數：累計前進量，倒車回頭再過線不會多算一圈，也不會多記一筆圈速 -----
  let di = n.index - p.prevIndex;
  if (di > SAMPLES / 2) di -= SAMPLES; else if (di < -SAMPLES / 2) di += SAMPLES;
  p.prog += di; p.prevIndex = n.index;
  const lapIdx = Math.floor(p.prog / SAMPLES) + 1;   // 0 = 還沒過起跑線，1 = 第一圈…
  if (lapIdx > p.lapMax) onLap(p, lapIdx);
  else p.lap = Math.max(0, lapIdx);

  // ----- 道具 -----
  for (const nut of items.nuts) {
    if (!nut.alive) continue;
    if (nut.mesh.position.distanceToSquared(p.pos) < 2.4 * 2.4) {
      nut.alive = false; nut.mesh.visible = false;
      p.nuts++; p.boost = Math.max(p.boost, 1.1); p.speed = Math.min(BOOST_MAX, p.speed + 6);
      SFX.nut(); toast('核果 +1');
      for (let i = 0; i < 22; i++) sparkle.emit(nut.mesh.position, tmpV2.set((Math.random() - .5) * 8, 3 + Math.random() * 5, (Math.random() - .5) * 8), 0.6);
    }
  }
  for (const c of items.cones) {
    if (c.hit > 0) continue;
    if (c.mesh.position.distanceToSquared(p.pos) < 1.9 * 1.9 && p.speed > 6) {
      c.hit = 2.5;
      c.vel = tmpF.clone().multiplyScalar(p.speed * 0.5).add(new THREE.Vector3((Math.random() - .5) * 6, 9, 0));
      c.spin = (Math.random() - .5) * 10;
      p.speed *= 0.5; p.spin = 0.45; p.boost = 0; shake = 0.5; hitSlow = 0.12; p.drift = 0;
      SFX.cone(); toast('撞到三角錐！');
    }
  }
  for (const pad of items.pads) {
    if (pad.mesh.position.distanceToSquared(p.pos) < 3.2 * 3.2 && p.boost < 0.5) {
      p.boost = 1.6; p.speed = Math.min(BOOST_MAX, p.speed + 10); SFX.boost(); SFX.whoosh(); toast('加速板！');
    }
  }

  // ----- 對手碰撞：對方也會被撞開 -----
  for (const r of rivals) {
    const d = r.pos.distanceTo(p.pos);
    if (d < 2.7) {
      tmpV2.subVectors(p.pos, r.pos).normalize().multiplyScalar((2.7 - d) * 0.6);
      p.pos.add(tmpV2);
      r.lat += (tmpV2.x * -Math.cos(r.heading) + tmpV2.z * Math.sin(r.heading)) * -1.5;
      r.bump = 0.4;
      if (p.speed > r.speed) { p.speed = Math.max(r.speed * 0.8, p.speed * 0.75); shake = Math.max(shake, 0.25); SFX.bump(); }
    }
  }

  // ----- 粒子 -----
  rightOf(p.heading, tmpR);
  if (p.boost > 0 && p.speed > 20) {
    for (let i = 0; i < 3; i++) {
      tmpV2.copy(p.pos).addScaledVector(tmpF, -2.1).add(new THREE.Vector3((Math.random() - .5) * 0.9, 0.65, 0));
      flame.emit(tmpV2, new THREE.Vector3((Math.random() - .5) * 2 - tmpF.x * 6, 1 + Math.random() * 2, (Math.random() - .5) * 2 - tmpF.z * 6), 0.35);
    }
  }
  if ((p.braking && p.speed > 18) || drifting) {
    for (let i = 0; i < (drifting ? 2 : 4); i++) {
      const side = i % 2 ? 1 : -1;
      tmpV2.copy(p.pos).addScaledVector(tmpF, -1.3).addScaledVector(tmpR, side * 1.15).add(new THREE.Vector3(0, 0.25, 0));
      smoke.emit(tmpV2, new THREE.Vector3((Math.random() - .5) * 2.5 - tmpF.x * 3, 1.2 + Math.random() * 2, (Math.random() - .5) * 2.5 - tmpF.z * 3), 0.55);
    }
  }
  if (drifting && !p.airborne) {
    // 火花從外側後輪噴出來；蓄力越久顏色越燙
    const outer = -p.drift;   // 左漂（drift=-1）外側是右輪
    tmpV2.copy(p.pos).addScaledVector(tmpF, -1.2).addScaledVector(tmpR, outer * 1.2).add(new THREE.Vector3(0, 0.15, 0));
    const sys = p.driftCharge >= DRIFT_T2 ? sparkO : (p.driftCharge >= DRIFT_T1 ? sparkB : null);
    if (sys) for (let i = 0; i < 4; i++) sys.emit(tmpV2, new THREE.Vector3((Math.random() - .5) * 4 - tmpF.x * 8 + tmpR.x * outer * 3, 1 + Math.random() * 3, (Math.random() - .5) * 4 - tmpF.z * 8 + tmpR.z * outer * 3), 0.3, -12);
  }
  if (p.offroad && p.speed > 5) {
    for (let i = 0; i < 2; i++) {
      tmpV2.copy(p.pos).addScaledVector(tmpF, -1.2).add(new THREE.Vector3((Math.random() - .5) * 2.4, 0.3, (Math.random() - .5) * 2.4));
      dust.emit(tmpV2, new THREE.Vector3((Math.random() - .5) * 3, 2 + Math.random() * 3, (Math.random() - .5) * 3), 0.7);
    }
  }

  // ----- 懸吊與車身姿態（純視覺） -----
  const accel = (p.speed - p.prevSpeed) / dt;
  const pitchTarget = Math.max(-0.09, Math.min(0.11, -accel * 0.0035)) + (p.airborne || p.falling ? -Math.max(-0.5, Math.min(0.4, p.vy * 0.03)) : 0);
  p.pitch += (pitchTarget - p.pitch) * Math.min(1, dt * 8);
  p.suspVel += (-p.susp * 160 - p.suspVel * 14) * dt;
  p.susp += p.suspVel * dt;
  const yawTarget = drifting ? p.drift * 0.32 : 0;
  p.visYaw += (yawTarget - p.visYaw) * Math.min(1, dt * 6);
  const roll = -p.steer * 0.08 - (drifting ? p.drift * 0.1 : 0);

  p.kart.group.position.copy(p.pos); p.kart.group.position.y += p.susp;
  p.kart.group.rotation.set(p.pitch, p.heading + p.visYaw, roll, 'YXZ');
  p.kart.group.updateMatrixWorld();
  animateKart(p.kart, p.speed, p.steer, dt, raceTime, p.braking || drifting);

  // ----- 輪胎痕 -----
  const marking = (drifting || (p.braking && p.speed > 18)) && !p.airborne && !p.falling && !p.offroad;
  p.kart.rearWheels.forEach((rw, i) => {
    if (marking) { tmpW.copy(rw); p.kart.group.localToWorld(tmpW); tmpW.y = roadY; skid.mark('p' + i, tmpW, tmpR, drifting ? 0.6 : 0.45); }
    else skid.lift('p' + i);
  });
}

function respawn(p, index) {
  const i = (index - 20 + SAMPLES) % SAMPLES;
  const sp = S.p[i], t = S.t[i];
  p.pos.set(sp.x, sp.y, sp.z); p.vel.set(0, 0, 0); p.speed = 0; p.vy = 0;
  p.heading = Math.atan2(t.x, t.z); p.falling = false; p.airborne = false; p.boost = 0; p.spin = 0; p.drift = 0;
  p.hint = i; p.prevIndex = i; p.prog -= (index - i + SAMPLES) % SAMPLES;   // 往回放 20 格，累計進度也要退
  forwardOf(p.heading, tmpF);
  camera.position.copy(p.pos).addScaledVector(tmpF, -9).addScaledVector(UP, 4.2);
  toast('回到賽道');
}

function onLap(p, lapIdx) {
  // 只有第一次進到新的一圈才會呼叫（lapIdx > lapMax）
  p.lap = lapIdx; p.lapMax = lapIdx;
  if (lapIdx === 1) { p.lapStart = raceTime; return; }
  const t = raceTime - p.lapStart;
  p.laps.push(t); p.lapStart = raceTime;
  if (p.lap > TOTAL_LAPS) { finishRace(); return; }
  SFX.lap();
  if (prevLapTime > 0) {
    const d = t - prevLapTime;
    showBanner((p.lap === TOTAL_LAPS ? '最後一圈！' : '第 ' + p.lap + ' 圈') + '　' + (d <= 0 ? '比上圈快 ' + Math.abs(d).toFixed(2) + ' 秒' : '比上圈慢 ' + d.toFixed(2) + ' 秒'), d <= 0 ? 'good' : 'bad');
  } else showBanner(p.lap === TOTAL_LAPS ? '最後一圈！' : '第 ' + p.lap + ' 圈', p.lap === TOTAL_LAPS ? 'final' : '');
  prevLapTime = t;
}

function updateRivals(dt) {
  const playerProg = progressOf(player);
  for (const r of rivals) {
    const myProg = r.lap * SAMPLES + r.u * SAMPLES;
    const gap = (playerProg - myProg) / SAMPLES;
    let target = r.base * (1 + Math.max(-0.08, Math.min(0.12, gap * 0.25)));
    if (r.finishTime) target = r.base * 0.6;
    if (r.bump > 0) { r.bump -= dt; target *= 0.7; }
    r.speed += (target - r.speed) * Math.min(1, dt * 1.5);

    r.wobble += dt;
    const lookIdx = (Math.floor(r.u * SAMPLES) + 30) % SAMPLES;
    let want = Math.sin(r.wobble * 0.5) * 2.5;
    for (const c of items.cones) {
      const dIdx = ((c.index - lookIdx) % SAMPLES + SAMPLES) % SAMPLES;
      if (dIdx < 40 && Math.abs(c.lat - r.lat) < 2.5) want = c.lat > r.lat ? c.lat - 3.6 : c.lat + 3.6;
    }
    const hwR = S.w[lookIdx];
    r.targetLat = Math.max(-hwR + 1.5, Math.min(hwR - 1.5, want));
    r.lat += (r.targetLat - r.lat) * Math.min(1, dt * 1.2);
    r.lat = Math.max(-hwR + 1.2, Math.min(hwR - 1.2, r.lat));

    const prevU = r.u;
    r.u = (r.u + r.speed * dt / S.length) % 1;
    if (r.u < prevU) { r.lap++; if (r.lap > TOTAL_LAPS && !r.finishTime) r.finishTime = raceTime; }

    const i = Math.floor(r.u * SAMPLES) % SAMPLES;
    const p = S.p[i], rr = S.r[i], t = S.t[i];
    r.pos.set(p.x + rr.x * r.lat, p.y, p.z + rr.z * r.lat);
    const want2 = Math.atan2(t.x, t.z);
    let diff = want2 - r.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    r.heading += diff * Math.min(1, dt * 8);
    r.steer = Math.max(-1, Math.min(1, diff * 3));
    r.kart.group.position.copy(r.pos);
    r.kart.group.rotation.set(0, r.heading, -r.steer * 0.06);
    animateKart(r.kart, r.speed, r.steer, dt, raceTime + r.wobble);
  }
}

function progressOf(p) { return p === player ? p.prog + SAMPLES : p.lap * SAMPLES + p.u * SAMPLES; }   // 兩邊同一個尺：對手從第 1 圈的起跑線算
function computeRank() {
  const mine = progressOf(player);
  let rank = 1;
  for (const r of rivals) if (progressOf(r) > mine) rank++;
  return rank;
}

function updateItems(dt) {
  for (const n of items.nuts) {
    if (!n.alive) continue;
    n.spin += dt * 2.2;
    n.mesh.rotation.y = n.spin;
    n.mesh.position.y = S.p[n.index].y + 1.15 + Math.sin(n.spin * 1.5) * 0.15;
  }
  for (const c of items.cones) {
    if (c.hit <= 0) continue;
    c.hit -= dt;
    c.vel.y -= 25 * dt;
    c.mesh.position.addScaledVector(c.vel, dt);
    c.mesh.rotation.x += c.spin * dt; c.mesh.rotation.z += c.spin * 0.7 * dt;
    const gy = S.p[c.index].y;
    if (c.mesh.position.y < gy) { c.mesh.position.y = gy; c.vel.y = Math.abs(c.vel.y) * 0.3; c.vel.x *= 0.6; c.vel.z *= 0.6; }
  }
  for (const s of items.pads) s.mesh.material.emissiveIntensity = 0.9 + Math.sin(raceTime * 6) * 0.5;
  landmarks.roofNut.rotation.y += dt * 0.6;
}

// ---------- 鏡頭 ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let titleAngle = 0;
function updateCamera(dt) {
  if (gameState === 'title' || gameState === 'loading') {
    titleAngle += dt * 0.12;
    const c = S.p[Math.floor((titleAngle * 0.06 % 1 + 1) % 1 * SAMPLES)];
    camPos.set(c.x + Math.cos(titleAngle) * 60, 30, c.z + Math.sin(titleAngle) * 60);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 2));
    camera.lookAt(c.x, 2, c.z);
    camera.fov += (60 - camera.fov) * 0.05;
    camera.updateProjectionMatrix();
    return;
  }
  const p = player;
  const pct = Math.min(1, Math.abs(p.speed) / MAX_SPEED);
  forwardOf(p.heading, tmpF); rightOf(p.heading, tmpR);
  const brakeDip = p.braking ? 1 : 0;
  camPos.copy(p.pos).addScaledVector(tmpF, -(8.5 + pct * 3.5 - brakeDip * 1.6)).addScaledVector(UP, 4.0 + pct * 0.6 - brakeDip * 0.5);
  // 轉彎與漂移時鏡頭往外甩一點，看得到車尾在滑
  const sway = p.steer * 1.2 * pct + (p.drift ? p.drift * 1.4 : 0);
  camPos.addScaledVector(tmpR, -sway);
  camera.position.lerp(camPos, 1 - Math.exp(-dt * (gameState === 'countdown' ? 2 : 6)));
  camLook.copy(p.pos).addScaledVector(tmpF, 7).addScaledVector(UP, 1.6);
  if (camera.position.y < p.pos.y + 1.2) camera.position.y = p.pos.y + 1.2;
  if (camera.position.y < 1.0) camera.position.y = 1.0;
  if (shake > 0) {
    shake -= dt;
    camera.position.x += (Math.random() - .5) * shake * 0.8;
    camera.position.y += (Math.random() - .5) * shake * 0.6;
  }
  camera.lookAt(camLook);
  const targetFov = 60 + pct * 12 + (p.boost > 0 ? 8 : 0) - (p.braking ? 4 : 0) + (p.drift ? 3 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
  camera.updateProjectionMatrix();
}

// ---------- HUD ----------
const el = {
  lap: document.getElementById('hud-lap'), time: document.getElementById('hud-time'), rank: document.getElementById('hud-rank'),
  nuts: document.getElementById('hud-nuts'), gauge: document.getElementById('gauge'),
  minimap: document.getElementById('minimap'), count: document.getElementById('countdown'), lightsBox: document.getElementById('lights'), toast: document.getElementById('toast'),
  banner: document.getElementById('banner'), boost: document.getElementById('boost-tag'), hud: document.getElementById('hud'), driftBar: document.getElementById('drift-bar'), driftFill: document.getElementById('drift-fill'),
  title: document.getElementById('title'), result: document.getElementById('result'), resultBody: document.getElementById('result-body'),
  mbState: document.getElementById('mb-state'), mbBtn: document.getElementById('mb-connect'), mbBaud: document.getElementById('mb-baud'),
  tilt: document.getElementById('tilt-needle'), street: document.getElementById('hud-street'), colorName: document.getElementById('color-name'), swatches: document.getElementById('swatches'),
  tutorial: document.getElementById('tutorial')
};
const gctx = el.gauge.getContext('2d');
const mctx = el.minimap.getContext('2d');

function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return (m > 0 ? m + ':' + (s < 10 ? '0' : '') : '') + s.toFixed(2) + (m > 0 ? '' : ' 秒');
}

let toastTimer = null;
function toast(msg) {
  el.toast.textContent = msg; el.toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1100);
}
let bannerTimer = null;
function showBanner(text, cls = '', ms = 1800) {
  el.banner.textContent = text; el.banner.className = 'show ' + cls;
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.banner.className = ''; }, ms);
}
function setLights(n, go) {
  const dots = el.lightsBox.children;
  for (let i = 0; i < dots.length; i++) dots[i].className = go ? 'on go' : (i < n ? 'on' : '');
}

let gaugeNeedle = 0;
function drawGauge() {
  const W = el.gauge.width, H = el.gauge.height;
  gctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H - 44, R = 70;
  const kmh = Math.abs(player.speed) * 2.2, maxK = 170;
  const pct = Math.min(1, kmh / maxK);
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  gctx.lineWidth = 11; gctx.lineCap = 'butt';
  gctx.strokeStyle = 'rgba(253,246,227,.16)';
  gctx.beginPath(); gctx.arc(cx, cy, R, a0, a1); gctx.stroke();
  const seg = (f0, f1, color) => { gctx.strokeStyle = color; gctx.beginPath(); gctx.arc(cx, cy, R, a0 + (a1 - a0) * f0, a0 + (a1 - a0) * f1); gctx.stroke(); };
  seg(0, 0.6, '#49A86B'); seg(0.6, 0.82, '#E8C21A'); seg(0.82, 1, '#D7262C');
  gctx.strokeStyle = 'rgba(253,246,227,.85)'; gctx.lineWidth = 2;
  gctx.fillStyle = 'rgba(253,246,227,.8)'; gctx.font = '10px "Russo One",ui-monospace,monospace'; gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
  for (let k = 0; k <= maxK; k += 10) {
    const a = a0 + (a1 - a0) * (k / maxK), major = k % 50 === 0;
    const r1 = R - 8, r2 = major ? R - 18 : R - 13;
    gctx.beginPath(); gctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); gctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); gctx.stroke();
    if (major) gctx.fillText(String(k), cx + Math.cos(a) * (R - 29), cy + Math.sin(a) * (R - 29));
  }
  gaugeNeedle += (pct - gaugeNeedle) * 0.25;
  const an = a0 + (a1 - a0) * gaugeNeedle;
  gctx.strokeStyle = player.boost > 0 ? '#FF9A3C' : '#FF3B3B'; gctx.lineWidth = 3; gctx.lineCap = 'round';
  gctx.beginPath(); gctx.moveTo(cx - Math.cos(an) * 10, cy - Math.sin(an) * 10); gctx.lineTo(cx + Math.cos(an) * (R - 16), cy + Math.sin(an) * (R - 16)); gctx.stroke();
  gctx.fillStyle = '#FDF6E3'; gctx.beginPath(); gctx.arc(cx, cy, 5, 0, 7); gctx.fill();
  const gear = player.speed < 1 ? 'N' : Math.min(6, 1 + Math.floor(kmh / 28));
  gctx.fillStyle = 'rgba(253,246,227,.7)'; gctx.font = '700 9px sans-serif'; gctx.fillText('GEAR', cx - 30, cy + 2);
  gctx.fillStyle = '#FDF6E3'; gctx.font = '18px "Russo One",ui-monospace,monospace'; gctx.fillText(String(gear), cx - 30, cy + 16);
  gctx.font = '26px "Russo One",ui-monospace,monospace'; gctx.textAlign = 'right'; gctx.fillText(String(Math.round(kmh)), cx + 30, cy + 14);
  gctx.font = '700 9px sans-serif'; gctx.fillStyle = 'rgba(253,246,227,.7)'; gctx.textAlign = 'left'; gctx.fillText('km/h', cx + 34, cy + 16); gctx.textAlign = 'center';
  const lamp = (x, on, color, text) => {
    gctx.fillStyle = on ? color : 'rgba(253,246,227,.12)';
    gctx.beginPath(); gctx.arc(x, H - 9, 5, 0, 7); gctx.fill();
    if (on) { gctx.shadowColor = color; gctx.shadowBlur = 10; gctx.fill(); gctx.shadowBlur = 0; }
    gctx.fillStyle = on ? '#FFF' : 'rgba(253,246,227,.5)'; gctx.font = '700 10px sans-serif'; gctx.fillText(text, x + 24, H - 9);
  };
  lamp(18, player.throttle && gameState === 'race', '#49E07A', '油門');
  lamp(76, player.braking, '#FF3B3B', '煞車');
  lamp(134, player.boost > 0 || player.drift !== 0, player.drift ? '#59C8FF' : '#FF9A3C', player.drift ? '漂移' : '加速');
  const lit = Math.round(pct * 25);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const i = (4 - r) * 5 + c;
    gctx.fillStyle = i < lit ? '#FF3B3B' : 'rgba(255,59,59,.15)';
    gctx.fillRect(W - 34 + c * 6, 6 + r * 6, 4, 4);
  }
}

const mini = { base: null, sx: 1, sz: 1, ox: 0, oz: 0 };
function buildMinimap() {
  const W = el.minimap.width, H = el.minimap.height;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of S.p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const pad = 16;
  minX -= 120; maxX += 120; minZ -= 120; maxZ += 120;
  const sc2 = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
  mini.sx = sc2; mini.sz = sc2; mini.ox = pad - minX * sc2 + ((W - pad * 2) - (maxX - minX) * sc2) / 2; mini.oz = pad - minZ * sc2 + ((H - pad * 2) - (maxZ - minZ) * sc2) / 2;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(253,246,227,.28)'; g.lineWidth = 2;
  for (const r of ROADS) { g.beginPath(); r.pts.forEach((p, i) => { const x = p[0] * sc2 + mini.ox, y = p[1] * sc2 + mini.oz; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
  g.strokeStyle = 'rgba(253,246,227,.95)'; g.lineWidth = 8; path(g); g.stroke();
  g.strokeStyle = '#E8743B'; g.lineWidth = 5; path(g); g.stroke();
  const s0 = S.p[0];
  g.fillStyle = '#FDF6E3'; g.beginPath(); g.arc(s0.x * sc2 + mini.ox, s0.z * sc2 + mini.oz, 4, 0, 7); g.fill();
  mini.base = c;
  function path(g) { g.beginPath(); S.p.forEach((p, i) => { const x = p.x * sc2 + mini.ox, y = p.z * sc2 + mini.oz; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); }
}
function drawMinimap() {
  const W = el.minimap.width, H = el.minimap.height;
  mctx.clearRect(0, 0, W, H);
  mctx.drawImage(mini.base, 0, 0);
  for (const r of rivals) {
    mctx.fillStyle = '#' + r.kart.group.children[1].material.color.getHexString();
    mctx.beginPath(); mctx.arc(r.pos.x * mini.sx + mini.ox, r.pos.z * mini.sz + mini.oz, 4, 0, 7); mctx.fill();
  }
  const px = player.pos.x * mini.sx + mini.ox, pz = player.pos.z * mini.sz + mini.oz;
  mctx.fillStyle = '#FDF6E3'; mctx.beginPath(); mctx.arc(px, pz, 7, 0, 7); mctx.fill();
  mctx.fillStyle = '#E8743B'; mctx.beginPath(); mctx.arc(px, pz, 5, 0, 7); mctx.fill();
}

function updateHUD() {
  el.lap.textContent = Math.max(1, Math.min(player.lap, TOTAL_LAPS)) + ' / ' + TOTAL_LAPS;
  el.time.textContent = fmt(raceTime);
  el.rank.innerHTML = computeRank() + '<small>/' + (RIVAL_COUNT + 1) + '</small>';
  el.nuts.textContent = player.nuts;
  el.street.textContent = S.name[player.hint] || '';
  el.boost.classList.toggle('show', player.boost > 0);
  document.getElementById('vignette').classList.toggle('show', player.boost > 0 && !(fx && fx.enabled));
  // 漂移蓄力條
  const d = player.drift !== 0;
  el.driftBar.classList.toggle('show', d);
  if (d) {
    const c = player.driftCharge;
    el.driftFill.style.width = Math.min(100, c / DRIFT_T2 * 100) + '%';
    el.driftFill.className = c >= DRIFT_T2 ? 'orange' : (c >= DRIFT_T1 ? 'blue' : '');
  }
  drawGauge(); drawMinimap();
  el.mbState.textContent = MBit.MB.status;
  el.mbBtn.textContent = MBit.MB.connected ? '中斷連線' : '連接 micro:bit';
  el.tilt.style.left = (50 + MBit.MB.steer * 46) + '%';
}

// ---------- 流程 ----------
const TUT_KEY = 'nuts-racing-tutorial-v1';
function tutorialOpen() { return !el.tutorial.classList.contains('hide'); }
function requestStart() {
  let seen = false;
  try { seen = !!localStorage.getItem(TUT_KEY); } catch (e) {}
  if (!seen) { el.tutorial.classList.remove('hide'); SFX.click(); return; }
  startRace();
}
function closeTutorial() {
  try { localStorage.setItem(TUT_KEY, '1'); } catch (e) {}
  el.tutorial.classList.add('hide');
  startRace();
}

function startRace() {
  resetRace();
  gameState = 'countdown'; lastCount = 4;
  el.title.classList.add('hide'); el.result.classList.add('hide');
  el.hud.classList.remove('hide');
  setLights(0, false);
  document.getElementById('mb-panel').classList.add('dim');
  engineStart(); bgmStart(); bgmSet('race');
  SFX.click();
  autoQ.t = 0; autoQ.frames = 0; autoQ.done = autoQ.done || quality !== 'high';
}

const BOARD_KEY = 'nuts-racing-board-v1';
function loadBoard() { try { return JSON.parse(localStorage.getItem(BOARD_KEY) || '[]'); } catch (e) { return []; } }
function saveBoard(b) { try { localStorage.setItem(BOARD_KEY, JSON.stringify(b.slice(0, 10))); } catch (e) {} }
function playerName() { return (document.getElementById('player-name').value || '').trim() || '無名賽車手'; }
function renderBoard(elm, highlight) {
  const b = loadBoard();
  if (!b.length) { elm.innerHTML = '<div class="tiny">還沒有人跑完，你來當第一個</div>'; return; }
  elm.innerHTML = '<table>' + b.map((r, i) => '<tr class="' + (highlight && r.t === highlight.t && r.name === highlight.name ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + r.name.replace(/</g, '&lt;') + '</td><td>' + fmt(r.t) + '</td><td class="tiny">' + r.date + '</td></tr>').join('') + '</table>';
}

function finishRace() {
  player.finishTime = raceTime;
  const entry = { name: playerName(), t: +raceTime.toFixed(2), date: new Date().toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }), nuts: player.nuts, mb: MBit.MB.connected ? 1 : 0 };
  const board = loadBoard(); board.push(entry); board.sort((a, b) => a.t - b.t); saveBoard(board);
  const myRank = board.findIndex(r => r === entry) + 1;
  gameState = 'done';
  SFX.finish(); bgmSet('title');
  const rank = computeRank();
  const rows = [{ name: '你', time: player.finishTime, prog: progressOf(player), me: true, color: '#' + KART_COLORS[playerColorIdx].hex.toString(16).padStart(6, '0') }];
  for (const r of rivals) rows.push({ name: r.name, time: r.finishTime, prog: progressOf(r), color: '#' + r.kart.group.children[1].material.color.getHexString() });
  rows.sort((a, b) => (a.time && b.time) ? a.time - b.time : (a.time ? -1 : b.time ? 1 : b.prog - a.prog));
  const best = Math.min(...player.laps);
  el.resultBody.innerHTML =
    '<div class="big"><span>' + rank + '</span>第 ' + rank + ' 名</div>' +
    '<div class="total">總時間 ' + fmt(player.finishTime) + '</div>' +
    '<div class="sub">最快單圈 ' + fmt(best) + '　吃到核果 ' + player.nuts + ' 顆</div>' +
    '<table>' + rows.map((r, i) => '<tr class="' + (r.me ? 'me' : '') + '" style="animation-delay:' + (i * 0.12) + 's"><td>' + (i + 1) + '</td><td><i style="background:' + r.color + '"></i>' + r.name + '</td><td>' + (r.time ? fmt(r.time) : '還在跑') + '</td></tr>').join('') + '</table>' +
    '<div class="laps">' + player.laps.map((t, i) => '第' + (i + 1) + '圈 ' + fmt(t)).join('　') + '</div>' +
    (myRank && myRank <= 10 ? '<div class="newbest">班級排行榜 第 ' + myRank + ' 名' + (myRank === 1 ? '　新紀錄！' : '') + '</div>' : '') +
    '<div class="tip">把名次和時間報給老師登記積分</div>';
  renderBoard(document.getElementById('board-result'), entry);
  if (myRank === 1) SFX.cheer();
  el.result.classList.remove('hide');
  el.hud.classList.add('hide');
  document.getElementById('mb-panel').classList.remove('dim');
}

function backToTitle() {
  gameState = 'title';
  renderBoard(document.getElementById('board-title'));
  el.result.classList.add('hide'); el.hud.classList.add('hide');
  el.title.classList.remove('hide');
  resetRace();
}

function buildSwatches() {
  el.swatches.innerHTML = '';
  KART_COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (i === playerColorIdx ? ' on' : '');
    b.style.background = '#' + c.hex.toString(16).padStart(6, '0');
    b.title = c.name;
    b.addEventListener('click', () => { setPlayerColor(i); SFX.click(); });
    el.swatches.appendChild(b);
  });
  el.colorName.textContent = KART_COLORS[playerColorIdx].name;
}
function setPlayerColor(i) {
  playerColorIdx = i;
  scene.remove(player.kart.group);
  const old = player;
  player = makeRacer(KART_COLORS[i].hex);
  player.pos.copy(old.pos); player.heading = old.heading; player.hint = old.hint;
  player.kart.group.position.copy(player.pos); player.kart.group.rotation.y = player.heading;
  buildSwatches();
}

// ---------- 畫質 ----------
let quality = 'high';
const autoQ = { t: 0, frames: 0, done: false };
function setQuality(q) {
  quality = q;
  const high = q === 'high';
  renderer.shadowMap.enabled = high;
  renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 1.5) : 1);
  if (fx) fx.enabled = high;
  scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } });
  resize();
  document.getElementById('btn-quality').textContent = high ? '畫質：高' : '畫質：低';
}

// ---------- 主迴圈：物理固定 60Hz，畫面跟著螢幕 ----------
let last = performance.now(), acc = 0;
function physicsStep(dt) {
  if (gameState === 'countdown') {
    countdown -= dt;
    const n = Math.ceil(countdown);
    if (n !== lastCount) {
      lastCount = n;
      if (n > 0) { el.count.textContent = n; setLights((4 - n) * 2 - 1, false); SFX.countdown(); }
      else { el.count.textContent = 'GO!'; setLights(5, true); SFX.go(); }
      el.count.classList.remove('pop'); void el.count.offsetWidth; el.count.classList.add('pop');
    }
    if (countdown <= -0.7) { gameState = 'race'; raceTime = 0; player.lapStart = 0; el.count.textContent = ''; setLights(0, false); }
    MBit.steer(dt);
  } else if (gameState === 'race') {
    raceTime += dt;
    updatePlayer(dt);
    updateRivals(dt);
    updateItems(dt);
  } else if (gameState === 'done') {
    updateRivals(dt); updateItems(dt);
  } else {
    updateItems(dt); MBit.steer(dt);
  }
}

function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.1) dt = 0.1;
  if (hitSlow > 0) { hitSlow -= dt; dt *= 0.35; }   // 撞到東西的一瞬間慢動作

  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 4) { physicsStep(STEP); acc -= STEP; steps++; }
  if (steps === 4) acc = 0;

  if (gameState === 'countdown' || gameState === 'done') animateKart(player.kart, 0, 0, dt, now / 1000);

  flame.update(dt); dust.update(dt); sparkle.update(dt); smoke.update(dt); sparkB.update(dt); sparkO.update(dt);
  skid.update();
  for (const c of clouds.children) { c.position.x += c.userData.speed * dt * 2; if (c.position.x > 900) c.position.x = -900; }
  updateCamera(dt);
  cullByDistance(camera.position);
  followShadow(lights.sun, (gameState === 'title' || gameState === 'loading') ? camera.position : player.pos);
  engineUpdate(Math.min(1, Math.abs(player.speed) / MAX_SPEED), gameState === 'race');
  skidUpdate(gameState === 'race' && (player.drift !== 0 || (Math.abs(player.steer) > 0.55 && player.speed > MAX_SPEED * 0.55) || (player.braking && player.speed > 20)) && !player.offroad);
  if (gameState !== 'title') updateHUD(); else { el.mbState.textContent = MBit.MB.status; el.mbBtn.textContent = MBit.MB.connected ? '中斷連線' : '連接 micro:bit'; }

  // 自動畫質：比賽開始 2 秒後量 3 秒，跑不到 45 fps 就自動降
  if (gameState === 'race' && !autoQ.done) {
    autoQ.t += dt; if (autoQ.t > 2) autoQ.frames++;
    if (autoQ.t > 5) { autoQ.done = true; const fps = autoQ.frames / 3; if (fps < 45) { setQuality('low'); toast('這台電腦跑不順，已自動調低畫質'); } }
  }

  fx.render(player.boost > 0 ? Math.min(1, player.boost) : 0);
  requestAnimationFrame(frame);
}

// ---------- 開機：分段建場景，進度條有東西動 ----------
const KENNEY = (() => {
  const L = [];
  const add = (dir, names) => names.forEach(n => L.push([n, 'assets/kenney/' + dir + '/' + n + '.glb']));
  add('commercial', ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h', 'building-i', 'building-j', 'building-k', 'building-l', 'building-m', 'building-n', 'building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e']);
  add('suburban', ['building-type-a', 'building-type-b', 'building-type-c', 'building-type-d', 'building-type-e', 'building-type-f', 'building-type-g', 'building-type-h', 'building-type-i', 'building-type-j', 'building-type-k', 'building-type-l', 'tree-large', 'tree-small']);
  add('roads', ['light-curved', 'traffic-light', 'construction-barrier', 'electricity-pole']);
  add('cars', ['sedan', 'taxi', 'van', 'suv', 'hatchback-sports', 'delivery', 'police', 'truck']);
  return L;
})();

async function boot() {
  try { await bootStages(); }
  catch (err) {
    // 任何一步失敗都要讓學生看得到，不要卡在進度條
    console.error(err);
    if (loadEl.bar) loadEl.bar.style.background = '#D7262C';
    if (loadEl.pct) loadEl.pct.textContent = '載入失敗：' + (err && err.message ? err.message : err);
    if (loadEl.tip) loadEl.tip.textContent = '請重新整理頁面再試一次（Shift 加重新整理）。還是不行就換 Chrome 或 Edge。';
  }
}

async function bootStages() {
  await stage(3, '載入模型（Kenney，CC0）', null);
  await loadModels(KENNEY, (f) => { if (loadEl.bar) loadEl.bar.style.width = (3 + f * 30) + '%'; });
  await stage(34, '天空與光線', () => { addSky(scene); clouds = addClouds(scene, 22); lights = addLights(scene); addGround(scene); addMountains(scene); });
  await stage(40, '鋪賽道', () => { const curve = buildCurve(); S = sampleCurve(curve); buildRoad(S, scene); buildGate(S, scene); });
  await stage(48, '畫左營的馬路', () => { buildCityRoads(scene, S); buildCrosswalks(scene, S); });
  await stage(60, '蓋街屋與招牌', () => { buildBuildings(scene, S); buildStreetFurniture(scene, S); buildParkedCars(scene, S); });
  await stage(68, '彎道、高架、橋', () => { buildCornerGear(S, scene); buildBridges(S, scene); });
  await stage(76, '85 大樓、港口、愛河', () => { buildKaohsiung(scene, S); landmarks = buildLandmarks(scene, S); const spots = parkTreeSpots(S); if (!buildParkTrees(scene, spots)) addTrees(scene, spots); });
  await stage(84, '放核果與道具', () => {
    items = placeItems(S, scene);
    flame = new Particles(140, 0xFFB347, 0.9); dust = new Particles(160, 0xC9B98A, 1.1); sparkle = new Particles(80, 0xFFF1A8, 0.7); smoke = new Particles(160, 0xE8E6E0, 1.6);
    sparkB = new Particles(160, 0x59C8FF, 0.55, true); sparkO = new Particles(160, 0xFFB043, 0.6, true);
    skid = new SkidMarks(scene);
  });
  await stage(92, '車子進場', () => {
    player = makeRacer(KART_COLORS[0].hex);
    for (let i = 0; i < RIVAL_COUNT; i++) {
      const r = makeRacer(rivalPalette[i]);
      r.u = 0; r.lat = 0; r.targetLat = 0; r.base = 0; r.wobble = Math.random() * 10; r.bump = 0; r.name = ['藍藍', '紫紫', '黃黃', '綠綠', '粉粉'][i];
      rivals.push(r);
    }
    resetRace(); buildMinimap(); buildSwatches();
    fx = new PostFX(renderer, scene, camera); resize();
  });
  await stage(100, '好了', null);
  gameState = 'title';
  loadEl.box.classList.add('hide');
  renderBoard(document.getElementById('board-title'));
  requestAnimationFrame(frame);
}

// ---------- 按鈕 ----------
document.getElementById('btn-start').addEventListener('click', requestStart);
document.getElementById('tut-go').addEventListener('click', closeTutorial);
document.getElementById('tut-skip').addEventListener('click', closeTutorial);
document.getElementById('btn-clear-board').addEventListener('click', () => { if (confirm('清掉這台電腦的排行榜？')) { saveBoard([]); renderBoard(document.getElementById('board-title')); } });
try { document.getElementById('player-name').value = localStorage.getItem('nuts-racing-name') || ''; } catch (e) {}
document.getElementById('player-name').addEventListener('change', e => { try { localStorage.setItem('nuts-racing-name', e.target.value); } catch (err) {} });
document.getElementById('btn-again').addEventListener('click', startRace);
document.getElementById('btn-title').addEventListener('click', backToTitle);
document.getElementById('btn-quality').addEventListener('click', () => { setQuality(quality === 'high' ? 'low' : 'high'); autoQ.done = true; });

const ONLINE = location.protocol === 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
if (ONLINE) {
  document.getElementById('mb-hint').textContent = '傾斜轉彎，B 油門、A 煞車。Chrome／Edge 按「連接 micro:bit」選 mbed Serial Port（最簡單）。電腦有跑橋接程式的話也可以按「用橋接程式連」。板子要先燒好程式（標題畫面有下載）。';
}
const mbPanel = document.getElementById('mb-panel');
function setMbCollapsed(c) { mbPanel.classList.toggle('collapsed', c); document.getElementById('mb-toggle').textContent = c ? '展開' : '收起'; }
document.getElementById('mb-head').addEventListener('click', () => setMbCollapsed(!mbPanel.classList.contains('collapsed')));
setMbCollapsed(window.innerWidth < 980);

const btnMute = document.getElementById('btn-mute');
btnMute.addEventListener('click', () => { setMuted(!isMuted()); btnMute.textContent = isMuted() ? '音效：關' : '音效：開'; });
window.addEventListener('pointerdown', () => { bgmStart(); bgmSet(gameState === 'race' ? 'race' : 'title'); }, { once: true });
window.addEventListener('keydown', () => { bgmStart(); bgmSet(gameState === 'race' ? 'race' : 'title'); }, { once: true });

el.mbBtn.disabled = !MBit.serialAvailable;
if (!MBit.serialAvailable) { MBit.MB.status = '這個瀏覽器沒有 Web Serial，請用「橋接」'; }
el.mbBtn.addEventListener('click', async () => { try { await MBit.connect(); } catch (err) { MBit.MB.status = '連線失敗：' + (err && err.message ? err.message : err); } });
document.getElementById('mb-bridge').addEventListener('click', async () => { try { await MBit.connectBridge(); } catch (err) { MBit.MB.status = (err && err.message ? err.message : String(err)); } });
document.getElementById('mb-zero').addEventListener('click', () => { MBit.zero(); toast('方向盤已置中'); });
el.mbBaud.addEventListener('click', () => { el.mbBaud.textContent = String(MBit.toggleBaud()); toast('序列速率改成 ' + MBit.MB.baud + '，請重新連接'); });

if (loadEl.tip) loadEl.tip.textContent = '小提示：' + TIPS[Math.floor(Math.random() * TIPS.length)];
boot();

// 除錯口（測試用）：window.__game
window.__game = { audioState, get player() { return player; }, keys, get S() { return S; }, rivals, get items() { return items; }, get state() { return gameState; }, get time() { return raceTime; }, computeRank, nearest, startRace, setQuality, get fx() { return fx; }, step(n = 1) { for (let i = 0; i < n; i++) physicsStep(STEP); }, render() { updateCamera(STEP); cullByDistance(camera.position); updateHUD(); fx.render(0); } };
