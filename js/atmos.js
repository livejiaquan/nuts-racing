// 大氣與時段：天空（含太陽、地平線霧靄）、環境反射貼圖（PMREM）、白天／黃昏切換、水面材質
// 做法照成熟引擎的習慣：天空用一個 shader 球，從同一個 shader 算出環境貼圖給車漆與水面反射，
// 時段只是一組參數（太陽方向、顏色、霧、曝光），切換時全部一起換。
import * as THREE from 'three';

export const PRESETS = {
  day: {
    label: '白天',
    sunEl: 48, sunAz: 215,                       // 仰角、方位（度；方位 0 = +z，順時針）
    sunColor: 0xFFF4DC, sunInt: 3.0,
    hemiSky: 0xDFF3FF, hemiGround: 0x9FB37A, hemiInt: 1.1,
    zenith: 0x2E86E6, horizon: 0xDCEFFB, ground: 0xA9C590, hazeColor: 0xFFF6E8,
    fog: 0xD9EEFA, fogNear: 320, fogFar: 1050,
    exposure: 1.18, cloud: 0xFFFFFF, tint: [1, 1, 1], envInt: 0.9
  },
  dusk: {
    label: '黃昏',
    sunEl: 13, sunAz: 262,
    sunColor: 0xFFA868, sunInt: 2.6,
    hemiSky: 0x93A4D6, hemiGround: 0x7A6050, hemiInt: 1.05,   // 背光面不要黑成一片，小朋友要看得到路
    zenith: 0x2A4686, horizon: 0xFFA560, ground: 0x6E5A44, hazeColor: 0xFFB070,
    fog: 0xE9A574, fogNear: 240, fogFar: 950,
    exposure: 1.14, cloud: 0xFFC9A6, tint: [1.05, 0.97, 0.91], envInt: 1.1
  }
};

export const ATMOS = {
  preset: 'day',
  sunDir: new THREE.Vector3(0, 1, 0),   // 指向太陽
  sky: null, skyMat: null, env: null, pmrem: null, renderer: null,
  envUsers: new Set(),                   // 需要環境反射的材質
  water: [],                             // 要流動的水面貼圖
  occluders: []                          // 會擋住太陽的大東西（鏡頭光暈用）
};

const SKY_VERT = `
  varying vec3 vPos;
  void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const SKY_FRAG = `
  uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 hazeColor; uniform vec3 sunColor;
  uniform vec3 sunDir; uniform float discOn;
  varying vec3 vPos;
  void main() {
    vec3 d = normalize(vPos);
    float h = clamp(d.y, 0.0, 1.0);
    // 天頂到地平線的漸層：靠近地平線變亮變白（空氣散射）
    vec3 sky = mix(horizon, zenith, pow(h, 0.5));
    float mu = max(dot(d, sunDir), 0.0);
    // 太陽附近的暖色光暈（Mie 前向散射），地平線附近更明顯
    float glow = pow(mu, 18.0) * 0.35 + pow(mu, 220.0) * 0.9;
    sky += hazeColor * glow * (1.0 - 0.45 * h);
    // 太陽本體：很亮，交給後製的 bloom 發光
    float disc = smoothstep(0.99935, 0.99975, mu) * discOn;
    sky += sunColor * disc * 4.0;
    // 地平線以下：環境貼圖用的地面色（畫面上會被地板蓋住）
    float below = clamp(-d.y * 6.0, 0.0, 1.0);
    sky = mix(sky, ground, below);
    gl_FragColor = vec4(sky, 1.0);
  }
`;

function dirFrom(el, az) {
  const e = THREE.MathUtils.degToRad(el), a = THREE.MathUtils.degToRad(az);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).normalize();
}

export function buildAtmosphere(scene, renderer) {
  const geo = new THREE.SphereGeometry(1400, 48, 24);   // 要比鏡頭的 far（1600）近，不然會被裁掉
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() },
      hazeColor: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, discOn: { value: 1 }
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  ATMOS.sky = sky; ATMOS.skyMat = mat; ATMOS.renderer = renderer;
  ATMOS.pmrem = new THREE.PMREMGenerator(renderer);
  ATMOS.pmrem.compileEquirectangularShader();
  return sky;
}

// 用同一個天空 shader 算一張環境貼圖（反射用）。太陽圓盤關掉，不然反射裡會有一顆白點閃
function rebuildEnv() {
  if (!ATMOS.pmrem) return;
  const envScene = new THREE.Scene();
  const m = ATMOS.skyMat.clone();
  m.uniforms.discOn.value = 0;
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), m));
  const old = ATMOS.env;
  ATMOS.env = ATMOS.pmrem.fromScene(envScene, 0.04, 1, 500).texture;
  m.dispose();
  if (old) old.dispose();
  for (const mat of ATMOS.envUsers) { mat.envMap = ATMOS.env; mat.needsUpdate = true; }
}

export function registerEnv(material, intensity = 1) {
  material.envMap = ATMOS.env; material.envMapIntensity = intensity * (PRESETS[ATMOS.preset].envInt || 1);
  material.userData.envBase = intensity;
  ATMOS.envUsers.add(material);
  return material;
}

// 切時段：天空、太陽方向與顏色、半球光、霧、曝光、雲的顏色、環境貼圖一起換
export function setTimeOfDay(name, ctx) {
  const P = PRESETS[name] || PRESETS.day;
  ATMOS.preset = PRESETS[name] ? name : 'day';
  ATMOS.sunDir.copy(dirFrom(P.sunEl, P.sunAz));
  const u = ATMOS.skyMat.uniforms;
  u.zenith.value.setHex(P.zenith); u.horizon.value.setHex(P.horizon); u.ground.value.setHex(P.ground);
  u.hazeColor.value.setHex(P.hazeColor); u.sunColor.value.setHex(P.sunColor); u.sunDir.value.copy(ATMOS.sunDir);
  if (ctx) {
    const { scene, renderer, lights, clouds } = ctx;
    if (scene && scene.fog) { scene.fog.color.setHex(P.fog); scene.fog.near = P.fogNear; scene.fog.far = P.fogFar; }
    if (scene) scene.background = new THREE.Color(P.horizon);
    if (renderer) renderer.toneMappingExposure = P.exposure;
    if (lights) {
      lights.sun.color.setHex(P.sunColor); lights.sun.intensity = P.sunInt;
      lights.hemi.color.setHex(P.hemiSky); lights.hemi.groundColor.setHex(P.hemiGround); lights.hemi.intensity = P.hemiInt;
    }
    if (clouds) for (const c of clouds.children) c.material.color.setHex(P.cloud);
  }
  rebuildEnv();
  for (const mat of ATMOS.envUsers) mat.envMapIntensity = (mat.userData.envBase || 1) * (P.envInt || 1);
  return P;
}

// 太陽在螢幕上的位置（0..1）與可見度，給後製畫鏡頭光暈
const _v = new THREE.Vector3(), _fwd = new THREE.Vector3();
const _ray = new THREE.Raycaster();
let _occ = 0, _occCount = 0;
export function sunOnScreen(camera, out) {
  // 先確定太陽在鏡頭前方（在後方時投影座標會翻到畫面上，不能只看 z）
  camera.getWorldDirection(_fwd);
  const inFront = _fwd.dot(ATMOS.sunDir) > 0.05;
  _v.copy(camera.position).addScaledVector(ATMOS.sunDir, 1500).project(camera);
  out.x = _v.x * 0.5 + 0.5; out.y = _v.y * 0.5 + 0.5;
  let vis = inFront ? 1 : 0;
  // 快出畫面時淡掉
  vis *= THREE.MathUtils.smoothstep(0.5 - Math.abs(out.x - 0.5), 0, 0.25) * THREE.MathUtils.smoothstep(0.5 - Math.abs(out.y - 0.5), 0, 0.25);
  // 每 4 幀射一條線看太陽有沒有被大樓、山擋住
  if (vis > 0) {
    if ((_occCount++ & 3) === 0) {
      _ray.set(camera.position, ATMOS.sunDir); _ray.far = 2500;
      const list = ATMOS.occluders.filter(o => o.visible !== false);
      let hit = false;
      try { hit = _ray.intersectObjects(list, true).length > 0; } catch (e) { hit = false; }
      _occ = hit ? 1 : 0;
    }
    vis *= 1 - _occ;
  }
  out.z = vis;
  return out;
}

// ---------- 水面：法線貼圖流動 + 天空反射 ----------
let _waterNormal = null;
function waterNormalTexture() {
  if (_waterNormal) return _waterNormal;
  const N = 256, h = new Float32Array(N * N);
  // 幾組不同方向的正弦波疊起來，像風吹的細浪
  const waves = [[1, 0.3, 7.0, 0.5], [0.2, 1, 11.0, 0.3], [-0.7, 0.6, 17.0, 0.2], [0.5, -0.9, 29.0, 0.12], [-0.3, -0.4, 43.0, 0.08]];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const [dx, dy, f, a] of waves) v += Math.sin((x * dx + y * dy) / N * Math.PI * 2 * f) * a;
    h[y * N + x] = v;
  }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const l = h[y * N + ((x - 1 + N) % N)], r = h[y * N + ((x + 1) % N)], u = h[((y - 1 + N) % N) * N + x], d = h[((y + 1) % N) * N + x];
    const nx = (l - r) * 1.6, ny = (u - d) * 1.6, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    const i = (y * N + x) * 4;
    data[i] = (nx / len * 0.5 + 0.5) * 255; data[i + 1] = (ny / len * 0.5 + 0.5) * 255; data[i + 2] = (nz / len * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
  _waterNormal = t;
  return t;
}

// color：水色；sizeX/sizeY：這塊水在世界裡的尺寸（公尺），用來讓波紋大小一致
export function makeWaterMaterial(color, sizeX, sizeY) {
  const n = waterNormalTexture().clone();
  n.repeat.set(sizeX / 24, sizeY / 24); n.needsUpdate = true;   // 一塊貼圖 24 公尺，波紋才不會細得像雜訊
  n.userData.speed = 1.1 / 24;   // 每秒流 1.1 公尺
  ATMOS.water.push(n);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.14, metalness: 0.06, normalMap: n, normalScale: new THREE.Vector2(0.42, 0.42) });
  registerEnv(mat, 1.0);
  return mat;
}
export function updateWater(dt) {
  for (const n of ATMOS.water) { n.offset.x += n.userData.speed * dt * 0.7; n.offset.y += n.userData.speed * dt * 0.4; }
}
