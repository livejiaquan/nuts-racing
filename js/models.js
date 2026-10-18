// Kenney 模型（CC0）：載入 GLB、合併成單一幾何體、以 InstancedMesh 大量擺放
// 素材：assets/kenney/*（City Kit Commercial / Suburban / Roads、Car Kit），授權見同資料夾 License_*.txt
import * as THREE from 'three';
import { GLTFLoader } from '../lib/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';

const loader = new GLTFLoader();
export const MODELS = {};   // name → { geo, mat, size, min, max }

// 把一個 GLB 的所有 mesh 合併成一個幾何體（Kenney 每包共用一張貼圖，材質可以共用）
function flatten(gltf) {
  const geos = [];
  let mat = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    // 只留 position / normal / uv，不同 mesh 的屬性才對得起來
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (g.index) geos.push(g.toNonIndexed()); else geos.push(g);
    if (!mat) mat = Array.isArray(o.material) ? o.material[0] : o.material;
  });
  if (!geos.length) return null;
  const merged = mergeGeometries(geos, false);
  merged.computeBoundingBox();
  const bb = merged.boundingBox;
  const size = new THREE.Vector3().subVectors(bb.max, bb.min);
  // 材質：用原本的貼圖，改成 Lambert 省效能，並確保貼圖色彩空間正確
  const m = new THREE.MeshLambertMaterial({ map: mat && mat.map ? mat.map : null, color: mat && mat.color ? mat.color.clone() : new THREE.Color(0xffffff) });
  if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.map.anisotropy = 4; }
  return { geo: merged, mat: m, size, min: bb.min.clone(), max: bb.max.clone() };
}

export function loadModels(list, onProgress) {
  let done = 0;
  return Promise.all(list.map(([name, url]) => new Promise((resolve) => {
    loader.load(url, (gltf) => {
      MODELS[name] = flatten(gltf);
      done++; if (onProgress) onProgress(done / list.length);
      resolve();
    }, undefined, (err) => { console.warn('模型載不到', url, err); done++; if (onProgress) onProgress(done / list.length); resolve(); });
  })));
}

// 擺一批同款模型：items = [{x, y, z, rotY, scale}]
// 依 160 公尺方格分組，每組一個 InstancedMesh，鏡頭外、太遠的整組不畫（三角形數從 370 萬降到幾十萬）
export const CHUNKS = [];
const CHUNK = 200;
export function instanceModel(scene, name, items, opts = {}) {
  const m = MODELS[name];
  if (!m || !items.length) return null;
  const groups = {};
  for (const it of items) {
    const key = Math.floor(it.x / CHUNK) + ',' + Math.floor(it.z / CHUNK);
    (groups[key] = groups[key] || []).push(it);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const out = [];
  for (const key of Object.keys(groups)) {
    const list = groups[key];
    const im = new THREE.InstancedMesh(m.geo, m.mat, list.length);
    let cx = 0, cz = 0;
    list.forEach((it, i) => {
      const sc = it.scale || 1;
      q.setFromAxisAngle(axis, it.rotY || 0);
      p.set(it.x, (it.y || 0) - m.min.y * sc, it.z);
      s.set(sc, sc, sc);
      m4.compose(p, q, s);
      im.setMatrixAt(i, m4);
      cx += it.x; cz += it.z;
    });
    im.castShadow = opts.castShadow !== false;
    im.userData.shadow = im.castShadow;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    im.frustumCulled = true;
    im.userData.center = new THREE.Vector3(cx / list.length, 0, cz / list.length);
    im.userData.far = opts.far || 620;
    scene.add(im);
    CHUNKS.push(im);
    out.push(im);
  }
  return out;
}

// 每幀呼叫：離鏡頭太遠的方格關掉（霧已經快看不到了）
// shadowPos 是影子相機跟著的點（玩家）：方格中心離它 120 公尺（加方格半對角線）以外就不投影，陰影相機半寬只有 90 公尺，投了也看不到
const _tmp = new THREE.Vector3();
const SHADOW_DIST = 120 + CHUNK * 0.71;
export function cullByDistance(camPos, shadowPos = camPos) {
  for (const im of CHUNKS) {
    _tmp.copy(im.userData.center); _tmp.y = camPos.y;
    im.visible = _tmp.distanceTo(camPos) < im.userData.far + CHUNK * 0.75;
    if (im.visible) { _tmp.y = shadowPos.y; im.castShadow = im.userData.shadow && _tmp.distanceTo(shadowPos) < SHADOW_DIST; }
  }
}

// 以「目標寬度」算縮放：Kenney 的模型單位小，要放大到公尺
export function scaleToWidth(name, targetWidth) {
  const m = MODELS[name];
  if (!m) return 1;
  const w = Math.max(m.size.x, m.size.z);
  return targetWidth / Math.max(0.001, w);
}
export function scaleToHeight(name, targetHeight) {
  const m = MODELS[name];
  if (!m) return 1;
  return targetHeight / Math.max(0.001, m.size.y);
}
