// 核果賽車 3D — 主程式
import * as THREE from 'three';
import { PALETTE, createRenderer, createScene, addSky, addClouds, addLights, followShadow, addGround, addMountains, addTrees } from './world.js';
import { ROAD_HALF, SAMPLES, buildCurve, sampleCurve, nearest, buildRoad, buildGate, placeItems, buildCornerGear, buildBridges } from './track.js';
import { buildKaohsiung } from './kaohsiung.js';
import { buildCityRoads, buildBuildings, buildStreetFurniture, buildLandmarks, buildCrosswalks, parkTreeSpots } from './city.js';
import { ROADS } from './osm_data.js';
import { KART_COLORS, buildKart, animateKart } from './kart.js';
import * as MBit from './microbit.js';
import { SFX, engineStart, engineUpdate, bgmStart, bgmSet, setMuted, isMuted, skidUpdate, audioState } from './audio.js';

// ---------- 參數（想調手感就改這裡） ----------
const TOTAL_LAPS = 2;        // 這條賽道一圈約 2 公里，2 圈剛好
const MAX_SPEED = 58;        // 公尺/秒
const BOOST_MAX = 74;
const ACCEL = 20;
const BRAKE = 55;
const DRAG = 9;
const OFFROAD_MAX = 20;
const RIVAL_COUNT = 4;

// ---------- 基本建置 ----------
const canvas = document.getElementById('cv');
const renderer = createRenderer(canvas);
const scene = createScene();
addSky(scene);
const clouds = addClouds(scene, 22);
const lights = addLights(scene);
addGround(scene);
addMountains(scene);
const curve = buildCurve();
const S = sampleCurve(curve);
buildRoad(S, scene);
buildGate(S, scene);
buildCityRoads(scene, S);
buildCrosswalks(scene, S);
buildBuildings(scene, S);
buildStreetFurniture(scene, S);
buildCornerGear(S, scene);
buildBridges(S, scene);
buildKaohsiung(scene, S);
const landmarks = buildLandmarks(scene, S);
addTrees(scene, parkTreeSpots(S));
const items = placeItems(S, scene);

const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 1600);
const UP = new THREE.Vector3(0, 1, 0);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- 車輛 ----------
function makeRacer(colorHex) {
  const k = buildKart(colorHex);
  scene.add(k.group);
  return {
    kart: k, pos: new THREE.Vector3(), vel: new THREE.Vector3(), heading: 0, speed: 0,
    steer: 0, hint: 0, lap: 1, prevIndex: 0, boost: 0, spin: 0, offroad: false,
    nuts: 0, finishTime: 0, laps: [], lapStart: 0, bounce: 0
  };
}

let playerColorIdx = 0;
let player = makeRacer(KART_COLORS[0].hex);
const rivals = [];
const rivalPalette = [0x3F8FD6, 0x8E4FC0, 0xE8C21A, 0x2E8B57, 0xF07AA8];
for (let i = 0; i < RIVAL_COUNT; i++) {
  const r = makeRacer(rivalPalette[i]);
  r.u = 0; r.lat = 0; r.targetLat = 0; r.base = 0; r.wobble = Math.random() * 10; r.name = ['藍藍', '紫紫', '黃黃', '綠綠', '粉粉'][i];
  rivals.push(r);
}

function forwardOf(h, out) { return out.set(Math.sin(h), 0, Math.cos(h)); }

function placeOnTrack(racer, index, lat, back = 0) {
  const p = S.p[index], r = S.r[index], t = S.t[index];
  racer.pos.set(p.x + r.x * lat - t.x * back, p.y, p.z + r.z * lat - t.z * back);
  racer.heading = Math.atan2(t.x, t.z);
  racer.vel.set(0, 0, 0); racer.speed = 0;
  racer.hint = nearest(S, racer.pos, -1).index; racer.prevIndex = racer.hint;
  racer.lap = back > 0 ? 0 : 1; racer.boost = 0; racer.falling = false; racer.airborne = false; racer.vy = 0; racer.spin = 0; racer.nuts = 0; racer.finishTime = 0; racer.laps = []; racer.lapStart = 0;
  racer.kart.group.position.copy(racer.pos);
  racer.kart.group.rotation.set(0, racer.heading, 0);
}

function resetRace() {
  // 玩家在起跑線後面，對手排在前面的格子
  placeOnTrack(player, 0, 0, 10);
  rivals.forEach((r, i) => {
    const idx = 8 + Math.floor(i / 2) * 10;
    const lat = (i % 2 ? 1 : -1) * 3.2;
    placeOnTrack(r, idx, lat);
    r.u = idx / SAMPLES; r.lat = lat; r.targetLat = lat;
    r.base = MAX_SPEED * (0.80 + 0.045 * i);
    r.lapU = r.u;
  });
  for (const n of items.nuts) { n.alive = true; n.mesh.visible = true; }
  for (const c of items.cones) { c.hit = 0; c.vel = null; c.mesh.rotation.set(0, 0, 0); const p = S.p[c.index], r = S.r[c.index]; c.mesh.position.set(p.x + r.x * c.lat, p.y, p.z + r.z * c.lat); }
  raceTime = 0; countdown = 3.99;
}

// ---------- 輸入 ----------
const keys = { left: false, right: false, up: false, down: false };
const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
window.addEventListener('keydown', e => { const k = KEYMAP[e.key]; if (k) { keys[k] = true; e.preventDefault(); } if (e.key === 'Enter' && gameState !== 'race' && gameState !== 'countdown') startRace(); });
window.addEventListener('keyup', e => { const k = KEYMAP[e.key]; if (k) keys[k] = false; });

// ---------- 粒子（排氣火焰、草地灰塵） ----------
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
  constructor(count, color, size) {
    this.count = count; this.i = 0;
    this.pos = new Float32Array(count * 3);
    this.vel = []; this.life = new Float32Array(count);
    for (let i = 0; i < count; i++) { this.vel.push(new THREE.Vector3()); this.pos[i * 3 + 1] = -100; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ color, size, map: softDot(), transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true, alphaTest: 0.05 });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(p, v, life) {
    const i = this.i; this.i = (this.i + 1) % this.count;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i].copy(v); this.life[i] = life;
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.pos[i * 3] += this.vel[i].x * dt; this.pos[i * 3 + 1] += this.vel[i].y * dt; this.pos[i * 3 + 2] += this.vel[i].z * dt;
      this.vel[i].y += 2 * dt;
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -100;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
const flame = new Particles(140, 0xFFB347, 0.9);
const dust = new Particles(160, 0xC9B98A, 1.1);
const sparkle = new Particles(80, 0xFFF1A8, 0.7);
const smoke = new Particles(160, 0xE8E6E0, 1.6);

// ---------- 遊戲狀態 ----------
let gameState = 'title';   // title | countdown | race | done
let raceTime = 0, countdown = 0, lastCount = 4;
let shake = 0;
const tmpF = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

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

  // 轉向：高速時轉得少一點，低速時幾乎不轉
  const steerAmount = inp.steer * (1.0 - 0.45 * pct);
  p.steer += (steerAmount - p.steer) * Math.min(1, dt * 12);
  let turn = p.steer * 2.3 * Math.min(1, p.speed / 10);
  if (p.spin > 0) { p.spin -= dt; turn += Math.sin(p.spin * 25) * 3.5; }
  p.heading -= turn * dt;   // heading 變大是左轉，所以右轉要減

  // 油門／煞車
  p.braking = !!inp.brake && p.speed > 2;
  p.throttle = !!inp.gas;
  if (inp.brake) p.speed -= BRAKE * dt;                       // 煞到底會慢慢倒車（最多 -8）
  else if (inp.gas) p.speed += ACCEL * dt;
  else if (p.speed > 0) p.speed = Math.max(0, p.speed - DRAG * dt);   // 放開油門只會滑到停，不會倒退
  else if (p.speed < 0) p.speed = Math.min(0, p.speed + DRAG * dt);
  if (p.boost > 0) { p.boost -= dt; p.speed += ACCEL * 1.6 * dt; }

  // 路面判定
  const n = nearest(S, p.pos, p.hint);
  p.hint = n.index;
  const absLat = Math.abs(n.lateral);
  const half = n.w;
  p.offroad = absLat > half + 0.3;
  if (p.offroad && p.speed > OFFROAD_MAX) p.speed -= 40 * dt;
  const LIMIT = half + 2.6;   // 可以騎上人行道一點點，再過去就是店面
  if (absLat > LIMIT && (S.railSoft[n.index] || S.p[n.index].y < 1.5) && !p.falling) {   // 寬限區也有隱形牆，不會懸空
    // 撞護欄：推回界線內，速度向量的橫向分量歸零
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
    }
    p.wallHit = true;
  } else p.wallHit = false;
  const cap = p.boost > 0 ? BOOST_MAX : MAX_SPEED;
  p.speed = Math.max(-8, Math.min(p.speed, cap));

  // 速度向量有一點滑，彎道才有漂移感
  forwardOf(p.heading, tmpF);
  tmpV.copy(tmpF).multiplyScalar(p.speed);
  const grip = p.offroad ? 3.5 : 7;
  p.vel.lerp(tmpV, 1 - Math.exp(-dt * grip));
  p.pos.addScaledVector(p.vel, dt);

  // 垂直：路面抬高就跟著爬；路面突然往下（跳台）或衝出無護欄高架就用重力
  const roadY = S.p[n.index].y;
  const onRoad = absLat <= half + 2.0;                          // 路肩之內、再多一點都還算在路上
  const edgeOk = S.railSoft[n.index] || roadY < 1.5;             // 有護欄或在地面就不會掉
  if (p.falling) {
    p.vy -= 30 * dt; p.pos.y += p.vy * dt;
    p.speed *= (1 - dt * 0.8);
    if (p.pos.y < -8) respawn(p, n.index);
  } else if (!onRoad && !edgeOk) {
    p.falling = true; p.vy = 0; p.airborne = true; shake = 0.6; SFX.bump(); toast('掉下去了！');
    p.fallInfo = { index: n.index, lat: +n.lateral.toFixed(2), half: +half.toFixed(2), rail: S.rail[n.index], railSoft: S.railSoft[n.index], roadY: +roadY.toFixed(1), name: S.name[n.index] };
  } else if (p.airborne) {
    p.vy -= 30 * dt; p.pos.y += p.vy * dt;
    if (p.pos.y <= roadY) { p.pos.y = roadY; p.airborne = false; p.vy = 0; shake = Math.max(shake, 0.25); }
  } else {
    const dy = roadY - p.pos.y;
    if (dy < -0.9 && p.speed > 15) { p.airborne = true; p.vy = Math.max(0, p.speed * 0.08); toast('飛起來了！'); }   // 路面突然往下 → 起跳
    else p.pos.y += dy * Math.min(1, dt * 14);
  }

  // 圈數
  if (p.prevIndex > SAMPLES * 0.85 && n.index < SAMPLES * 0.15) onLap(p);
  else if (p.prevIndex < SAMPLES * 0.15 && n.index > SAMPLES * 0.85) p.lap = Math.max(0, p.lap - 1);   // 倒車回去不算
  p.prevIndex = n.index;

  // 道具
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
      p.speed *= 0.5; p.spin = 0.45; p.boost = 0; shake = 0.5;
      SFX.cone(); toast('撞到三角錐！');
    }
  }
  for (const pad of items.pads) {
    if (pad.mesh.position.distanceToSquared(p.pos) < 3.2 * 3.2 && p.boost < 0.5) {
      p.boost = 1.6; p.speed = Math.min(BOOST_MAX, p.speed + 10); SFX.boost(); SFX.whoosh(); toast('加速板！');
    }
  }

  // 對手碰撞
  for (const r of rivals) {
    const d = r.pos.distanceTo(p.pos);
    if (d < 2.7) {
      tmpV2.subVectors(p.pos, r.pos).normalize().multiplyScalar((2.7 - d) * 0.6);
      p.pos.add(tmpV2); r.pos.sub(tmpV2);
      if (p.speed > r.speed) { p.speed = Math.max(r.speed * 0.8, p.speed * 0.75); shake = Math.max(shake, 0.25); SFX.bump(); }
    }
  }

  // 粒子
  if (p.boost > 0 && p.speed > 20) {
    for (let i = 0; i < 3; i++) {
      tmpV2.copy(p.pos).addScaledVector(tmpF, -2.1).add(new THREE.Vector3((Math.random() - .5) * 0.9, 0.65, 0));
      flame.emit(tmpV2, new THREE.Vector3((Math.random() - .5) * 2 - tmpF.x * 6, 1 + Math.random() * 2, (Math.random() - .5) * 2 - tmpF.z * 6), 0.35);
    }
  }
  if (p.braking && p.speed > 18) {
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1;
      tmpV2.copy(p.pos).addScaledVector(tmpF, -1.3).add(new THREE.Vector3(-Math.cos(p.heading) * side * 1.15, 0.25, Math.sin(p.heading) * side * 1.15));
      smoke.emit(tmpV2, new THREE.Vector3((Math.random() - .5) * 2.5 - tmpF.x * 3, 1.2 + Math.random() * 2, (Math.random() - .5) * 2.5 - tmpF.z * 3), 0.55);
    }
  }
  if (p.offroad && p.speed > 5) {
    for (let i = 0; i < 2; i++) {
      tmpV2.copy(p.pos).addScaledVector(tmpF, -1.2).add(new THREE.Vector3((Math.random() - .5) * 2.4, 0.3, (Math.random() - .5) * 2.4));
      dust.emit(tmpV2, new THREE.Vector3((Math.random() - .5) * 3, 2 + Math.random() * 3, (Math.random() - .5) * 3), 0.7);
    }
  }

  // 套到模型
  p.kart.group.position.copy(p.pos);
  p.kart.group.rotation.set(0, p.heading, 0);
  p.kart.group.rotation.z = -p.steer * 0.08;
  p.kart.group.rotation.x = p.airborne || p.falling ? -Math.max(-0.5, Math.min(0.4, p.vy * 0.03)) : 0;
  animateKart(p.kart, p.speed, p.steer, dt, raceTime, p.braking);
}

function respawn(p, index) {
  const i = (index - 20 + SAMPLES) % SAMPLES;
  const sp = S.p[i], t = S.t[i];
  p.pos.set(sp.x, sp.y, sp.z); p.vel.set(0, 0, 0); p.speed = 0; p.vy = 0;
  p.heading = Math.atan2(t.x, t.z); p.falling = false; p.airborne = false; p.boost = 0; p.spin = 0;
  p.hint = i; p.prevIndex = i;
  forwardOf(p.heading, tmpF);
  camera.position.copy(p.pos).addScaledVector(tmpF, -9).addScaledVector(UP, 4.2);
  toast('回到賽道');
}

function onLap(p) {
  if (p.lap === 0) { p.lap = 1; p.lapStart = raceTime; return; }   // 從起跑線後面出發，第一次過線才正式開始計圈
  const t = raceTime - p.lapStart;
  p.laps.push(t); p.lapStart = raceTime; p.lap++;
  if (p.lap > TOTAL_LAPS) finishRace();
  else { toast(p.lap === TOTAL_LAPS ? '最後一圈！　上一圈 ' + fmt(t) : '第 ' + p.lap + ' 圈　上一圈 ' + fmt(t)); SFX.lap(); }
}

function updateRivals(dt) {
  const playerProg = progressOf(player);
  for (const r of rivals) {
    // 橡皮筋：落後就快一點，領先太多就慢一點
    const myProg = r.lap * SAMPLES + r.u * SAMPLES;
    const gap = (playerProg - myProg) / SAMPLES;   // 以圈為單位
    let target = r.base * (1 + Math.max(-0.08, Math.min(0.12, gap * 0.25)));
    if (r.finishTime) target = r.base * 0.6;
    r.speed += (target - r.speed) * Math.min(1, dt * 1.5);

    // 閃障礙、吃核果的小 AI
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
    r.kart.group.rotation.set(0, r.heading, 0);
    animateKart(r.kart, r.speed, r.steer, dt, raceTime + r.wobble);
  }
}

function progressOf(p) { return p.lap * SAMPLES + (p === player ? p.hint : p.u * SAMPLES); }
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
    n.mesh.position.y = S.p[n.index].y + 1.3 + Math.sin(n.spin * 1.5) * 0.18;
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
  if (gameState === 'title') {
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
  forwardOf(p.heading, tmpF);
  const brakeDip = p.braking ? 1 : 0;
  camPos.copy(p.pos).addScaledVector(tmpF, -(8.5 + pct * 3.5 - brakeDip * 1.6)).addScaledVector(UP, 4.0 + pct * 0.6 - brakeDip * 0.5);
  camPos.x += -Math.sin(p.heading + Math.PI / 2) * p.steer * 1.2 * pct;
  camPos.z += -Math.cos(p.heading + Math.PI / 2) * p.steer * 1.2 * pct;
  camera.position.lerp(camPos, 1 - Math.exp(-dt * (gameState === 'countdown' ? 2 : 6)));
  camLook.copy(p.pos).addScaledVector(tmpF, 7).addScaledVector(UP, 1.6);
  if (camera.position.y < p.pos.y + 1.2) camera.position.y = p.pos.y + 1.2;   // 掉落時鏡頭跟著掉，但不要低於車
  if (camera.position.y < 1.0) camera.position.y = 1.0;
  if (shake > 0) {
    shake -= dt;
    camera.position.x += (Math.random() - .5) * shake * 0.8;
    camera.position.y += (Math.random() - .5) * shake * 0.6;
  }
  camera.lookAt(camLook);
  const targetFov = 60 + pct * 12 + (p.boost > 0 ? 8 : 0) - (p.braking ? 4 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
  camera.updateProjectionMatrix();
}

// ---------- HUD ----------
const el = {
  lap: document.getElementById('hud-lap'), time: document.getElementById('hud-time'), rank: document.getElementById('hud-rank'),
  nuts: document.getElementById('hud-nuts'), speedNum: document.getElementById('speed-num'), gauge: document.getElementById('gauge'),
  minimap: document.getElementById('minimap'), count: document.getElementById('countdown'), toast: document.getElementById('toast'),
  boost: document.getElementById('boost-tag'), hud: document.getElementById('hud'),
  title: document.getElementById('title'), result: document.getElementById('result'), resultBody: document.getElementById('result-body'),
  mbState: document.getElementById('mb-state'), mbBtn: document.getElementById('mb-connect'), mbBaud: document.getElementById('mb-baud'),
  tilt: document.getElementById('tilt-needle'), street: document.getElementById('hud-street'), colorName: document.getElementById('color-name'), swatches: document.getElementById('swatches')
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

function drawGauge() {
  const W = el.gauge.width, H = el.gauge.height;
  gctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H - 44, R = 70;
  const kmh = Math.abs(player.speed) * 2.2, maxK = 170;
  const pct = Math.min(1, kmh / maxK);
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  // 底弧
  gctx.lineWidth = 11; gctx.lineCap = 'butt';
  gctx.strokeStyle = 'rgba(253,246,227,.16)';
  gctx.beginPath(); gctx.arc(cx, cy, R, a0, a1); gctx.stroke();
  // 色帶：綠 → 黃 → 紅
  const seg = (f0, f1, color) => { gctx.strokeStyle = color; gctx.beginPath(); gctx.arc(cx, cy, R, a0 + (a1 - a0) * f0, a0 + (a1 - a0) * f1); gctx.stroke(); };
  seg(0, 0.6, '#49A86B'); seg(0.6, 0.82, '#E8C21A'); seg(0.82, 1, '#D7262C');
  // 刻度
  gctx.strokeStyle = 'rgba(253,246,227,.85)'; gctx.lineWidth = 2;
  gctx.fillStyle = 'rgba(253,246,227,.8)'; gctx.font = '700 10px ui-monospace,monospace'; gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
  for (let k = 0; k <= maxK; k += 10) {
    const a = a0 + (a1 - a0) * (k / maxK), major = k % 50 === 0;
    const r1 = R - 8, r2 = major ? R - 18 : R - 13;
    gctx.beginPath(); gctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); gctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); gctx.stroke();
    if (major) gctx.fillText(String(k), cx + Math.cos(a) * (R - 29), cy + Math.sin(a) * (R - 29));
  }
  // 指針（有一點慣性）
  gaugeNeedle += (pct - gaugeNeedle) * 0.25;
  const an = a0 + (a1 - a0) * gaugeNeedle;
  gctx.strokeStyle = player.boost > 0 ? '#FF9A3C' : '#FF3B3B'; gctx.lineWidth = 3; gctx.lineCap = 'round';
  gctx.beginPath(); gctx.moveTo(cx - Math.cos(an) * 10, cy - Math.sin(an) * 10); gctx.lineTo(cx + Math.cos(an) * (R - 16), cy + Math.sin(an) * (R - 16)); gctx.stroke();
  gctx.fillStyle = '#FDF6E3'; gctx.beginPath(); gctx.arc(cx, cy, 5, 0, 7); gctx.fill();
  // 檔位
  const gear = player.speed < 1 ? 'N' : Math.min(6, 1 + Math.floor(kmh / 28));
  gctx.fillStyle = 'rgba(253,246,227,.7)'; gctx.font = '700 9px sans-serif'; gctx.fillText('GEAR', cx - 30, cy + 2);
  gctx.fillStyle = '#FDF6E3'; gctx.font = '900 18px ui-monospace,monospace'; gctx.fillText(String(gear), cx - 30, cy + 16);
  gctx.font = '900 24px ui-monospace,monospace'; gctx.textAlign = 'right'; gctx.fillText(String(Math.round(kmh)), cx + 30, cy + 14);
  gctx.font = '700 9px sans-serif'; gctx.fillStyle = 'rgba(253,246,227,.7)'; gctx.textAlign = 'left'; gctx.fillText('km/h', cx + 34, cy + 16); gctx.textAlign = 'center';
  // 燈：油門 / 煞車 / 加速
  const lamp = (x, on, color, text) => {
    gctx.fillStyle = on ? color : 'rgba(253,246,227,.12)';
    gctx.beginPath(); gctx.arc(x, H - 9, 5, 0, 7); gctx.fill();
    if (on) { gctx.shadowColor = color; gctx.shadowBlur = 10; gctx.fill(); gctx.shadowBlur = 0; }
    gctx.fillStyle = on ? '#FFF' : 'rgba(253,246,227,.5)'; gctx.font = '700 10px sans-serif'; gctx.fillText(text, x + 24, H - 9);
  };
  lamp(18, player.throttle && gameState === 'race', '#49E07A', '油門');
  lamp(76, player.braking, '#FF3B3B', '煞車');
  lamp(134, player.boost > 0, '#FF9A3C', '加速');
  // micro:bit 5x5 小燈（右上角縮小版）
  const lit = Math.round(pct * 25);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const i = (4 - r) * 5 + c;
    gctx.fillStyle = i < lit ? '#FF3B3B' : 'rgba(255,59,59,.15)';
    gctx.fillRect(W - 34 + c * 6, 6 + r * 6, 4, 4);
  }
}
let gaugeNeedle = 0;

// 小地圖：先把賽道畫成底圖，每幀只畫車
const mini = { base: null, sx: 1, sz: 1, ox: 0, oz: 0 };
function buildMinimap() {
  const W = el.minimap.width, H = el.minimap.height;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of S.p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const pad = 16;
  const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
  mini.sx = sc; mini.sz = sc; mini.ox = pad - minX * sc + ((W - pad * 2) - (maxX - minX) * sc) / 2; mini.oz = pad - minZ * sc + ((H - pad * 2) - (maxZ - minZ) * sc) / 2;
  // 小地圖範圍要含整個街區
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
buildMinimap();
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
  el.rank.textContent = '第 ' + computeRank() + ' 名';
  el.nuts.textContent = player.nuts;
  el.street.textContent = S.name[player.hint] || '';

  el.boost.classList.toggle('show', player.boost > 0);
  document.getElementById('vignette').classList.toggle('show', player.boost > 0);
  drawGauge(); drawMinimap();
  // micro:bit 面板
  el.mbState.textContent = MBit.MB.status;
  el.mbBtn.textContent = MBit.MB.connected ? '中斷連線' : '連接 micro:bit';
  el.tilt.style.left = (50 + MBit.MB.steer * 46) + '%';
}

// ---------- 流程 ----------
function startRace() {
  resetRace();
  gameState = 'countdown'; lastCount = 4;
  el.title.classList.add('hide'); el.result.classList.add('hide');
  el.hud.classList.remove('hide');
  document.getElementById('mb-panel').classList.add('dim');
  engineStart(); bgmStart(); bgmSet('race');
  SFX.click();
}

const BOARD_KEY = 'nuts-racing-board-v1';
function loadBoard() { try { return JSON.parse(localStorage.getItem(BOARD_KEY) || '[]'); } catch (e) { return []; } }
function saveBoard(b) { try { localStorage.setItem(BOARD_KEY, JSON.stringify(b.slice(0, 10))); } catch (e) {} }
function playerName() { return (document.getElementById('player-name').value || '').trim() || '無名賽車手'; }
function renderBoard(el, highlight) {
  const b = loadBoard();
  if (!b.length) { el.innerHTML = '<div class="tiny">還沒有人跑完，你來當第一個</div>'; return; }
  el.innerHTML = '<table>' + b.map((r, i) => '<tr class="' + (highlight && r.t === highlight.t && r.name === highlight.name ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + r.name.replace(/</g, '&lt;') + '</td><td>' + fmt(r.t) + '</td><td class="tiny">' + r.date + '</td></tr>').join('') + '</table>';
}

function finishRace() {
  player.finishTime = raceTime;
  // 記進本機排行榜（同一台電腦共用，給班上比時間用）
  const entry = { name: playerName(), t: +raceTime.toFixed(2), date: new Date().toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }), nuts: player.nuts, mb: MBit.MB.connected ? 1 : 0 };
  const board = loadBoard(); board.push(entry); board.sort((a, b) => a.t - b.t); saveBoard(board);
  const myRank = board.findIndex(r => r === entry) + 1;
  gameState = 'done';
  SFX.finish(); bgmSet('title');
  const rank = computeRank();
  // 排行榜：已完賽的照時間，沒完賽的照進度
  const rows = [{ name: '你', time: player.finishTime, prog: progressOf(player), me: true, color: '#' + KART_COLORS[playerColorIdx].hex.toString(16).padStart(6, '0') }];
  for (const r of rivals) rows.push({ name: r.name, time: r.finishTime, prog: progressOf(r), color: '#' + r.kart.group.children[1].material.color.getHexString() });
  rows.sort((a, b) => (a.time && b.time) ? a.time - b.time : (a.time ? -1 : b.time ? 1 : b.prog - a.prog));
  const best = Math.min(...player.laps);
  el.resultBody.innerHTML =
    '<div class="big">第 <span>' + rank + '</span> 名</div>' +
    '<div class="total">總時間 ' + fmt(player.finishTime) + '</div>' +
    '<div class="sub">最快單圈 ' + fmt(best) + '　吃到核果 ' + player.nuts + ' 顆</div>' +
    '<table>' + rows.map((r, i) => '<tr class="' + (r.me ? 'me' : '') + '"><td>' + (i + 1) + '</td><td><i style="background:' + r.color + '"></i>' + r.name + '</td><td>' + (r.time ? fmt(r.time) : '還在跑') + '</td></tr>').join('') + '</table>' +
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

// 選車色
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
buildSwatches();

document.getElementById('btn-start').addEventListener('click', startRace);
renderBoard(document.getElementById('board-title'));
document.getElementById('btn-clear-board').addEventListener('click', () => { if (confirm('清掉這台電腦的排行榜？')) { saveBoard([]); renderBoard(document.getElementById('board-title')); } });
try { document.getElementById('player-name').value = localStorage.getItem('nuts-racing-name') || ''; } catch (e) {}
document.getElementById('player-name').addEventListener('change', e => { try { localStorage.setItem('nuts-racing-name', e.target.value); } catch (err) {} });
document.getElementById('btn-again').addEventListener('click', startRace);
document.getElementById('btn-title').addEventListener('click', backToTitle);

// 線上版（https 的網址）不能連本機橋接程式，把那顆鈕藏起來
const ONLINE = location.protocol === 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
if (ONLINE) {
  document.getElementById('mb-bridge').classList.add('hide');
  document.getElementById('mb-hint').textContent = '傾斜轉彎，B 油門、A 煞車。用 Chrome 或 Edge 按「連接 micro:bit」，選 mbed Serial Port。板子要先燒好程式（標題畫面有下載）。';
}

// micro:bit 面板收合：視窗窄的時候預設收起，免得蓋住開始鈕
const mbPanel = document.getElementById('mb-panel');
function setMbCollapsed(c) { mbPanel.classList.toggle('collapsed', c); document.getElementById('mb-toggle').textContent = c ? '展開' : '收起'; }
document.getElementById('mb-head').addEventListener('click', () => setMbCollapsed(!mbPanel.classList.contains('collapsed')));
setMbCollapsed(window.innerWidth < 980);

// 靜音
const btnMute = document.getElementById('btn-mute');
btnMute.addEventListener('click', () => { setMuted(!isMuted()); btnMute.textContent = isMuted() ? '音效：關' : '音效：開'; });
// 第一次點畫面就把音訊叫醒（瀏覽器規定要有使用者動作）
window.addEventListener('pointerdown', () => { bgmStart(); bgmSet(gameState === 'race' ? 'race' : 'title'); }, { once: true });
window.addEventListener('keydown', () => { bgmStart(); bgmSet(gameState === 'race' ? 'race' : 'title'); }, { once: true });

// 畫質
let hq = true;
document.getElementById('btn-quality').addEventListener('click', (e) => {
  hq = !hq;
  renderer.shadowMap.enabled = hq;
  renderer.setPixelRatio(hq ? Math.min(window.devicePixelRatio, 1.5) : 1);
  scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } });
  e.target.textContent = hq ? '畫質：高' : '畫質：低';
});

// micro:bit 面板
el.mbBtn.disabled = !MBit.serialAvailable;
if (!MBit.serialAvailable) { MBit.MB.status = '這個瀏覽器沒有 Web Serial，請用「橋接」'; }
el.mbBtn.addEventListener('click', async () => { try { await MBit.connect(); } catch (err) { MBit.MB.status = '連線失敗：' + (err && err.message ? err.message : err); } });
document.getElementById('mb-bridge').addEventListener('click', async () => { try { await MBit.connectBridge(); } catch (err) { MBit.MB.status = (err && err.message ? err.message : String(err)); } });
document.getElementById('mb-zero').addEventListener('click', () => { MBit.zero(); toast('方向盤已置中'); });
el.mbBaud.addEventListener('click', () => { el.mbBaud.textContent = String(MBit.toggleBaud()); toast('序列速率改成 ' + MBit.MB.baud + '，請重新連接'); });

// ---------- 主迴圈 ----------
let last = performance.now();
resetRace();
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;

  if (gameState === 'countdown') {
    countdown -= dt;
    const n = Math.ceil(countdown);
    if (n !== lastCount) { lastCount = n; if (n > 0) { el.count.textContent = n; SFX.countdown(); } else { el.count.textContent = 'GO!'; SFX.go(); } el.count.classList.add('pop'); setTimeout(() => el.count.classList.remove('pop'), 50); }
    if (countdown <= -0.7) { gameState = 'race'; raceTime = 0; player.lapStart = 0; el.count.textContent = ''; }
    MBit.steer(dt);
    animateKart(player.kart, 0, 0, dt, now / 1000);
  } else if (gameState === 'race') {
    raceTime += dt;
    updatePlayer(dt);
    updateRivals(dt);
    updateItems(dt);
  } else if (gameState === 'done') {
    updateRivals(dt); updateItems(dt);
    animateKart(player.kart, 0, 0, dt, now / 1000);
  } else {
    updateItems(dt); MBit.steer(dt);
  }

  flame.update(dt); dust.update(dt); sparkle.update(dt); smoke.update(dt);
  for (const c of clouds.children) { c.position.x += c.userData.speed * dt * 2; if (c.position.x > 900) c.position.x = -900; }
  updateCamera(dt);
  followShadow(lights.sun, gameState === 'title' ? camera.position : player.pos);
  engineUpdate(Math.min(1, Math.abs(player.speed) / MAX_SPEED), gameState === 'race');
  skidUpdate(gameState === 'race' && ((Math.abs(player.steer) > 0.55 && player.speed > MAX_SPEED * 0.55) || (player.braking && player.speed > 20)) && !player.offroad);
  if (gameState !== 'title') updateHUD(); else { el.mbState.textContent = MBit.MB.status; el.mbBtn.textContent = MBit.MB.connected ? '中斷連線' : '連接 micro:bit'; }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.getElementById('loading').classList.add('hide');

// 除錯口（測試用）：window.__game
window.__game = { audioState, get player() { return player; }, keys, S, rivals, items, get state() { return gameState; }, get time() { return raceTime; }, computeRank, nearest, startRace };
