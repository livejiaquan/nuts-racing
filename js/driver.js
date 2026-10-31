// 自訂角色：學生上傳自己的 3D 檔（OBJ／STL／GLB），坐在駕駛座取代松鼠
// 檔案只在瀏覽器裡讀，不會上傳到任何地方；存在這台電腦的 IndexedDB，下次開還在
import * as THREE from 'three';
import { OBJLoader } from '../lib/addons/loaders/OBJLoader.js';
import { STLLoader } from '../lib/addons/loaders/STLLoader.js';
import { GLTFLoader } from '../lib/addons/loaders/GLTFLoader.js';

export const DRIVER_MAX_TRIS = 100000;   // 超過就拒絕：一個 Tinkercad 高精細 STL 可以比整個街區還重
const DRIVER_HEIGHT = 1.7;               // 角色站起來的高度（松鼠含耳朵約 1.8）
const DRIVER_MAX_WIDTH = 2.2;            // 太寬會超出車身

function extOf(name) { return (name.split('.').pop() || '').toLowerCase(); }

// 把檔案內容解析成 Object3D。回傳 { inner, tris, colorMats }
// colorMats：沒有自帶顏色的材質（OBJ、STL），之後可以用色票改顏色
export async function parseDriver(name, buffer, colorHex) {
  const ext = extOf(name);
  let inner;
  const colorMats = [];
  const mkMat = (vertexColors = false) => { const m = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.75, metalness: 0.05, vertexColors }); colorMats.push(m); return m; };
  if (ext === 'stl') {
    const geo = new STLLoader().parse(buffer);
    geo.deleteAttribute('normal'); geo.computeVertexNormals();   // 檔案裡的法線常常是 0（會變全黑），一律重算
    inner = new THREE.Mesh(geo, mkMat(!!geo.attributes.color));
  } else if (ext === 'obj') {
    inner = new OBJLoader().parse(new TextDecoder().decode(buffer));
    // OBJ 的顏色在 .mtl 裡，學生通常只會拖一個 .obj 進來，所以一律用色票的顏色；有頂點色就用頂點色
    inner.traverse(o => { if (o.isMesh) { if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); o.material = mkMat(!!o.geometry.attributes.color); } });
  } else if (ext === 'glb' || ext === 'gltf') {
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buffer, '', res, rej));
    inner = gltf.scene;
    inner.traverse(o => {
      if (!o.isMesh) return;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();   // 沒法線會變黑
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(m => {
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        // glTF 沒寫 metallicFactor 時預設是 1（全金屬），場景裡沒有環境貼圖就會變成灰黑一片、看不到顏色。
        // 沒有金屬貼圖的一律壓回非金屬，顏色才會像 Tinkercad 裡看到的那樣
        if ('metalness' in m && !m.metalnessMap) m.metalness = Math.min(m.metalness, 0.1);
        if ('roughness' in m && !m.roughnessMap) m.roughness = Math.max(0.5, Math.min(m.roughness, 0.9));
        m.needsUpdate = true;
      });
    });
  } else {
    throw new Error('只支援 .obj、.stl、.glb 檔');
  }
  let tris = 0;
  inner.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry;
    tris += Math.round((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
    o.castShadow = true; o.receiveShadow = false;
    o.frustumCulled = false;   // 車子一直在畫面裡，省得每幀算
  });
  if (tris === 0) throw new Error('這個檔案裡沒有模型');
  if (tris > DRIVER_MAX_TRIS) throw new Error('模型太細了（' + Math.round(tris / 10000) + ' 萬個三角形，上限 ' + DRIVER_MAX_TRIS / 10000 + ' 萬）。匯出時把精細度調低再試');
  return { inner, tris, colorMats };
}

// 猜模型的方向：STL（Tinkercad、3D 列印）幾乎都是 Z 朝上，比 Y 高就先轉成 Y 朝上；OBJ、GLB 通常已經是 Y 朝上
export function guessRot(inner, name) {
  const rot = { x: 0, y: 0 };
  if (extOf(name) !== 'stl') return rot;
  inner.updateMatrixWorld(true);
  _box.setFromObject(inner); _box.getSize(_size);
  if (_size.z > _size.y) rot.x = 3;   // 繞 X 轉 -90 度：Z 變成 Y
  return rot;
}

// 把 inner 放進一個 group：置中、腳踩在 y=0、縮到駕駛座大小。rot 是學生手動轉的方向（x、y 各幾個 90 度）
const _box = new THREE.Box3(), _size = new THREE.Vector3(), _center = new THREE.Vector3();
export function fitDriver(group, rot = { x: 0, y: 0 }) {
  const inner = group.children[0];
  if (!inner) return;
  inner.position.set(0, 0, 0); inner.scale.setScalar(1);
  inner.rotation.set(rot.x * Math.PI / 2, rot.y * Math.PI / 2, 0);
  inner.updateMatrixWorld(true);
  _box.setFromObject(inner);
  if (_box.isEmpty()) return;
  _box.getSize(_size); _box.getCenter(_center);
  let s = DRIVER_HEIGHT / Math.max(1e-6, _size.y);
  const w = Math.max(_size.x, _size.z) * s;
  if (w > DRIVER_MAX_WIDTH) s *= DRIVER_MAX_WIDTH / w;
  inner.scale.setScalar(s);
  inner.position.set(-_center.x * s, -_box.min.y * s, -_center.z * s);
}

// ---------- 存在瀏覽器（IndexedDB） ----------
const DB = 'nuts-racing', STORE = 'driver', KEY = 'current';
function openDB() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('no idb'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idb(mode, fn) {
  try {
    const db = await openDB();
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  } catch (e) { return null; }   // 無痕模式、舊瀏覽器：不存就算了
}
export function saveDriver(rec) { return idb('readwrite', st => st.put(rec, KEY)); }     // rec = { name, buffer, color, rot }
export function loadSavedDriver() { return idb('readonly', st => st.get(KEY)); }
export function clearSavedDriver() { return idb('readwrite', st => st.delete(KEY)); }
