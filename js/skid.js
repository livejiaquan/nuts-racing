// 輪胎痕：環狀緩衝的四邊形條帶，漂移與重煞車時在路面留下黑痕
import * as THREE from 'three';

export class SkidMarks {
  constructor(scene, maxQuads = 1200) {
    this.max = maxQuads; this.i = 0;
    this.pos = new Float32Array(maxQuads * 6 * 3);
    this.col = new Float32Array(maxQuads * 6 * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const mat = new THREE.MeshBasicMaterial({ color: 0x14110E, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.prev = {};   // 每個輪子上一個點
    this.dirty = false;
  }
  // key：輪子代號；p：輪胎接地點；right：車的右向量；alpha：深淺
  mark(key, p, right, alpha = 0.55, width = 0.36) {
    const prev = this.prev[key];
    this.prev[key] = { x: p.x, y: p.y, z: p.z, rx: right.x, rz: right.z };
    if (!prev) return;
    if (Math.hypot(p.x - prev.x, p.z - prev.z) > 4) return;   // 跳太遠（重生）就不要連
    const q = this.i; this.i = (this.i + 1) % this.max;
    const hw = width / 2, y = p.y + 0.05;
    const ax = prev.x - prev.rx * hw, az = prev.z - prev.rz * hw, bx = prev.x + prev.rx * hw, bz = prev.z + prev.rz * hw;
    const cx = p.x - right.x * hw, cz = p.z - right.z * hw, dx = p.x + right.x * hw, dz = p.z + right.z * hw;
    const py = prev.y + 0.05;
    const v = [ax, py, az, bx, py, bz, cx, y, cz, bx, py, bz, dx, y, dz, cx, y, cz];
    this.pos.set(v, q * 18);
    for (let k = 0; k < 6; k++) this.col.set([1, 1, 1, alpha], q * 24 + k * 4);
    this.dirty = true;
  }
  lift(key) { delete this.prev[key]; }
  update() {
    if (!this.dirty) return;
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.dirty = false;
  }
  clear() {
    this.pos.fill(0); this.col.fill(0); this.prev = {}; this.dirty = true; this.update();
  }
}
