// 世界：渲染器、場景、天空、光、遠山、雲、樹
import * as THREE from 'three';

export const PALETTE = {
  cream: 0xFDF6E3,
  forest: 0x1E5631,
  forestDark: 0x143D22,
  orange: 0xE8743B,
  grass: 0x5FAF5A,
  grassDark: 0x4E9A4A,
  asphalt: 0x3B3F46,
  sky: 0x8FD3FF,
  horizon: 0xE6F6FF,
  treeA: 0x3DAA5C,
  treeB: 0x62CF72,
  trunk: 0x7A4E2D,
  mountain: 0xA3D4B0,
  mountainFar: 0xC9E6D3
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoft 每個像素要多採樣好幾次，教室電腦吃不消
  renderer.toneMapping = THREE.NeutralToneMapping;   // ACES 會把顏色壓灰，Neutral 比較鮮
  renderer.toneMappingExposure = 1.18;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(0xD9EEFA, 320, 1050);
  return scene;
}

// 天空：大球體上用 shader 畫漸層，另加太陽
export function addSky(scene) {
  const geo = new THREE.SphereGeometry(1900, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3FA6F2) },
      mid: { value: new THREE.Color(PALETTE.sky) },
      bottom: { value: new THREE.Color(PALETTE.horizon) }
    },
    vertexShader: `
      varying vec3 vPos;
      void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 c = h < 0.0 ? bottom : (h < 0.25 ? mix(bottom, mid, h / 0.25) : mix(mid, top, (h - 0.25) / 0.75));
        gl_FragColor = vec4(c, 1.0);
      }
    `
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -10;
  scene.add(sky);

  // 太陽
  const sunTex = radialTexture('#FFF6D5', 'rgba(255,246,213,0)');
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true }));
  sun.scale.set(520, 520, 1);
  sun.position.set(-1000, 760, -1200);
  scene.add(sun);
  return sky;
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, inner); grad.addColorStop(0.35, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const blobs = [[120, 150, 70], [200, 120, 90], [300, 130, 95], [390, 155, 70], [250, 170, 80]];
  for (const [x, y, r] of blobs) {
    const grad = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function addClouds(scene, count = 18) {
  const tex = cloudTexture();
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.92, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m);
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const r = 900 + Math.random() * 500;
    s.position.set(Math.cos(a) * r, 220 + Math.random() * 160, Math.sin(a) * r);
    const w = 260 + Math.random() * 220;
    s.scale.set(w, w * 0.5, 1);
    s.userData.speed = 0.4 + Math.random() * 0.6;
    group.add(s);
  }
  scene.add(group);
  return group;
}

export function addLights(scene) {
  const hemi = new THREE.HemisphereLight(0xDFF3FF, 0x9FB37A, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xFFF6E0, 3.0);
  sun.position.set(-120, 180, -80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 500;
  const d = 90;
  sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
  sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}

// 影子相機跟著車走，才不會整張地圖都要算影子；sunDir 是太陽方向（白天／黃昏不同）
export function followShadow(sun, target, sunDir = null) {
  if (sunDir) sun.position.copy(target).addScaledVector(sunDir, 230);
  else sun.position.set(target.x - 120, 180, target.z - 80);
  sun.target.position.copy(target);
  sun.target.updateMatrixWorld();
}

export function addGround(scene) {
  // 草地底色 + 大格淡紋理
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#BFCC9E'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(150,175,115,0.5)' : 'rgba(215,225,185,0.45)';
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillRect(x, y, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(230, 230);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);
  return ground;
}

// 把一堆 non-indexed 幾何合成一個（只有 position／normal／uv）
export function mergeCones(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return geo;
}

export function addMountains(scene) {
  const group = new THREE.Group();
  // 每一圈山合成一個幾何（一個 draw call）
  const mk = (r, h, color, n, yOff) => {
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    const geos = [];
    const tmp = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const rr = r + (Math.random() - 0.5) * 60;
      const hh = h * (0.6 + Math.random() * 0.8);
      const geo = new THREE.ConeGeometry(70 + Math.random() * 90, hh, 5 + Math.floor(Math.random() * 3)).toNonIndexed();
      tmp.position.set(Math.cos(a) * rr, hh / 2 + yOff, Math.sin(a) * rr);
      tmp.rotation.y = Math.random() * Math.PI;
      tmp.updateMatrix(); geos.push(geo.applyMatrix4(tmp.matrix));
    }
    group.add(new THREE.Mesh(mergeCones(geos), mat));
  };
  mk(1250, 130, PALETTE.mountain, 30, -6);
  mk(1500, 200, PALETTE.mountainFar, 26, -10);
  scene.add(group);
  return group;
}

// 低多邊形樹，用 InstancedMesh 一次畫完
export function addTrees(scene, positions) {
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 2.2, 6);
  const crownGeo = new THREE.ConeGeometry(2.2, 5.2, 7);
  const crown2Geo = new THREE.ConeGeometry(1.6, 3.6, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.trunk });
  const crownMat = new THREE.MeshLambertMaterial({ color: PALETTE.treeA, flatShading: true });
  const crown2Mat = new THREE.MeshLambertMaterial({ color: PALETTE.treeB, flatShading: true });

  const n = positions.length;
  const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
  const crown = new THREE.InstancedMesh(crownGeo, crownMat, n);
  const crown2 = new THREE.InstancedMesh(crown2Geo, crown2Mat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  positions.forEach((pos, i) => {
    const sc = 0.8 + Math.random() * 0.8;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
    s.set(sc, sc, sc);
    p.set(pos.x, pos.y + 1.1 * sc, pos.z); m.compose(p, q, s); trunk.setMatrixAt(i, m);
    p.set(pos.x, pos.y + (2.2 + 2.6) * sc, pos.z); m.compose(p, q, s); crown.setMatrixAt(i, m);
    p.set(pos.x, pos.y + (2.2 + 4.6) * sc, pos.z); m.compose(p, q, s); crown2.setMatrixAt(i, m);
  });
  for (const im of [trunk, crown, crown2]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
  return { trunk, crown, crown2 };
}

export function makeCanvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
