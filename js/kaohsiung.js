// 高雄地標：85 大樓、流行音樂中心、高雄港（貨櫃、起重機、海）、駁二倉庫、巨蛋、美麗島站光之穹頂、愛河、旗津燈塔
import * as THREE from 'three';
import { makeCanvasTexture, PALETTE, mergeCones } from './world.js';
import { RIVER, RIVER_W } from './zones.js';

function lam(color) { return new THREE.MeshLambertMaterial({ color }); }
function box(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }

// 玻璃帷幕貼圖：藍灰底＋窗格
function glassTexture(base = '#6E8FAF', win = '#2E4660', cols = 6, rows = 10) {
  const t = makeCanvasTexture(256, 512, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    const cw = W / cols, rh = H / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      g.fillStyle = (Math.random() < 0.8) ? win : '#DCE9F5';
      g.fillRect(c * cw + 3, r * rh + 3, cw - 6, rh - 6);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function label(text, color, w, h, px = 72) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: makeCanvasTexture(512, 128, (g, W, H) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    g.fillStyle = '#FFF'; g.font = '700 ' + px + 'px "PingFang TC","Noto Sans TC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + 4);
  }), side: THREE.DoubleSide }));
}

// ---------- 85 大樓（東帝士）：兩隻腳 + 中央高塔 + 尖頂 ----------
function tuntex(scene, x, z) {
  const g = new THREE.Group();
  const tex = glassTexture('#7C98B8', '#27405C', 5, 12);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const legTex = glassTexture('#8AA3BF', '#2E4A66', 4, 12); const legMat = new THREE.MeshLambertMaterial({ map: legTex });
  for (const sx of [-34, 34]) {
    const leg = box(36, 170, 44, legMat, sx, 85, 0);
    leg.geometry.attributes.uv.array.forEach((_, i, a) => { if (i % 2) a[i] *= 14; });
    g.add(leg);
  }
  const tower = box(44, 300, 44, mat, 0, 80 + 150, 0);
  tower.geometry.attributes.uv.array.forEach((_, i, a) => { if (i % 2) a[i] *= 26; });
  g.add(tower);
  // 腳跟塔之間的連接板
  g.add(box(104, 20, 44, mat, 0, 180, 0));
  // 塔頂收窄 + 尖頂
  g.add(box(30, 30, 30, mat, 0, 245 + 150 + 0, 0));
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.4, 60, 8), lam(0xDDE3E8)); spire.position.y = 395 + 30; g.add(spire);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(2.5, 10, 8), new THREE.MeshStandardMaterial({ color: 0xFF4040, emissive: 0xFF2020, emissiveIntensity: 1 })); tip.position.y = 456; g.add(tip);
  // 裙樓
  g.add(box(130, 16, 90, lam(0xC9CED4), 0, 8, 0));
  const s = label('85 大樓', '#1F3A5A', 60, 12, 80); s.position.set(0, 24, 46); g.add(s);
  g.position.set(x, 0, z);
  scene.add(g);
}

// ---------- 高雄流行音樂中心：一叢六角柱 ----------
function musicCenter(scene, x, z) {
  const g = new THREE.Group();
  const colors = [0xF3F6F8, 0xDCE9F5, 0xC7DDF0, 0xEAF1F7];
  const spots = [[0, 0, 44], [26, 10, 30], [-24, 14, 24], [10, -28, 36], [-18, -22, 18], [34, -18, 22], [-36, -6, 14], [8, 30, 20]];
  for (const [dx, dz, h] of spots) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(12, 14, h, 6), lam(colors[Math.floor(Math.random() * colors.length)]));
    m.position.set(dx, h / 2, dz); m.rotation.y = Math.random(); m.castShadow = true; g.add(m);
  }
  // 低矮的波浪棚
  for (let i = 0; i < 9; i++) {
    const h = 10 + Math.sin(i * 0.9) * 6;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, h, 6), lam(0xF6F8FA));
    m.position.set(-50 + i * 13, h / 2, 48); g.add(m);
  }
  const s = label('高雄流行音樂中心', '#2F6FB0', 46, 9, 56); s.position.set(0, 12, -48); g.add(s);
  g.position.set(x, 0, z); scene.add(g);
}

// ---------- 高雄港：海、貨櫃、橋式起重機、燈塔 ----------
function harbor(scene) {
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(640, 440),
    new THREE.MeshStandardMaterial({ color: 0x3E8FC2, roughness: 0.2, metalness: 0.05 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(465, 0.0, -765); scene.add(sea);
  // 碼頭岸壁
  scene.add(box(640, 2, 20, lam(0xA8A49A), 465, 0.5, -555));
  // 貨櫃堆
  const cgeo = new THREE.BoxGeometry(12, 2.6, 2.4);
  const ccols = [0xD7262C, 0x1F5FBF, 0x2E8B57, 0xE8C21A, 0xE8743B, 0x8E4FC0, 0x5A5A5A];
  const mats = ccols.map(c => lam(c));
  const per = ccols.map(() => []);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  for (let row = 0; row < 7; row++) for (let col = 0; col < 14; col++) {
    const stack = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < stack; k++) {
      v.set(230 + col * 14, 1.3 + k * 2.6 + 1, -575 - row * 3.2 - Math.floor(row / 2) * 6);
      q.identity(); m4.compose(v, q, sc);
      per[Math.floor(Math.random() * ccols.length)].push(m4.clone());
    }
  }
  per.forEach((list, i) => { if (!list.length) return; const im = new THREE.InstancedMesh(cgeo, mats[i], list.length); list.forEach((m, k) => im.setMatrixAt(k, m)); im.castShadow = true; scene.add(im); });
  // 橋式起重機（三座）
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const orange = lam(0xE8743B);
    for (const [lx, lz] of [[-14, -10], [14, -10], [-14, 10], [14, 10]]) g.add(box(2.4, 48, 2.4, orange, lx, 24, lz));
    g.add(box(32, 3, 24, orange, 0, 48, 0));
    g.add(box(2.2, 3, 90, orange, -10, 52, -30));
    g.add(box(2.2, 3, 90, orange, 10, 52, -30));
    g.add(box(24, 2, 2, orange, 0, 50, -72));
    g.add(box(4, 42, 4, lam(0xF2F0EA), 0, 70, 2));
    g.add(box(10, 4, 8, lam(0x3A3A3A), 0, 44, 8));
    g.position.set(300 + i * 110, 0, -620); scene.add(g);
  }
  // 旗津燈塔
  const lh = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 16, 12), lam(0xF7F5F0)); base.position.y = 8; lh.add(base);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 3, 12), new THREE.MeshStandardMaterial({ color: 0xFFF2A8, emissive: 0xFFE07A, emissiveIntensity: 0.8 })); top.position.y = 17.5; lh.add(top);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4, 3, 12), lam(0xD7262C)); roof.position.y = 20.5; lh.add(roof);
  lh.position.set(720, 0, -600); lh.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(lh);
  // 渡輪
  const ferry = new THREE.Group();
  ferry.add(box(26, 3, 9, lam(0xF2F0EA), 0, 1.5, 0)); ferry.add(box(18, 3, 7, lam(0xE8743B), 0, 4.5, 0)); ferry.add(box(10, 2.4, 5, lam(0xF2F0EA), 0, 7, 0));
  ferry.position.set(620, 0, -700); ferry.rotation.y = 0.5; scene.add(ferry);
}

// ---------- 駁二倉庫 ----------
function pier2(scene) {
  const colors = [0x3C8C8C, 0xC98A2F, 0xA04A3A, 0x6B7B8C];
  const tex = makeCanvasTexture(512, 128, (g, W, H) => {
    g.fillStyle = '#E8E0D0'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1E5631'; g.font = '700 96px "PingFang TC","Noto Sans TC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('駁 二 藝 術 特 區', W / 2, H / 2 + 4);
  });
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const c = colors[i % colors.length];
    g.add(box(46, 8, 14, lam(c), 0, 4, 0));
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 46, 3, 1), lam(0x8A8A86)); roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.position.y = 8; roof.scale.set(1, 1, 0.55); g.add(roof);
    g.add(box(6, 6, 0.4, lam(0x2B2B2B), -12, 3, 7.2)); g.add(box(6, 6, 0.4, lam(0x2B2B2B), 12, 3, 7.2));
    g.position.set(306, 0, -336 - i * 17); scene.add(g);
  }
  const s = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  s.position.set(306, 13, -322); scene.add(s);
  // 大公仔（駁二的工人）
  const doll = new THREE.Group();
  doll.add(box(6, 9, 4, lam(0x2E6DB4), 0, 4.5, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(3, 14, 12), lam(0xF2C994)); head.position.y = 11.5; doll.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 1.6, 14), lam(0xE8C21A)); hat.position.y = 14; doll.add(hat);
  doll.add(box(1.8, 7, 1.8, lam(0x2E6DB4), -4.4, 5, 0)); doll.add(box(1.8, 7, 1.8, lam(0x2E6DB4), 4.4, 5, 0));
  doll.position.set(272, 0, -318); doll.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(doll);
}

// ---------- 高雄巨蛋 ----------
function arena(scene, x, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(74, 78, 12, 40), lam(0xB9BEC4)); base.position.y = 6; g.add(base);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(72, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xF2F4F6, roughness: 0.5, metalness: 0.3 }));
  dome.scale.set(1, 0.5, 1); dome.position.y = 12; g.add(dome);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(76, 1.6, 8, 48), lam(0x1F5FBF)); ring.rotation.x = Math.PI / 2; ring.position.y = 13; g.add(ring);
  const s = label('高雄巨蛋', '#1F5FBF', 50, 10, 70); s.position.set(0, 10, 82); g.add(s);
  g.position.set(x, 0, z); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(g);
}

// ---------- 美麗島站 光之穹頂 ----------
function formosa(scene, x, z) {
  const g = new THREE.Group();
  const tex = makeCanvasTexture(512, 256, (gg, W, H) => {
    const cols = ['#E8743B', '#F2B705', '#2E8B57', '#1F5FBF', '#8E4FC0', '#D7262C', '#49A8D8'];
    for (let i = 0; i < 300; i++) { gg.fillStyle = cols[i % cols.length]; gg.beginPath(); gg.arc(Math.random() * W, Math.random() * H, 10 + Math.random() * 22, 0, 7); gg.fill(); }
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(26, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.4),
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0xFFFFFF, emissiveMap: tex, emissiveIntensity: 0.35, transparent: true, opacity: 0.92, roughness: 0.2 }));
  dome.position.y = 2; g.add(dome);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(27, 28, 3, 32), lam(0xDADFE4)); ring.position.y = 1.5; g.add(ring);
  const s = label('美麗島站', '#D7262C', 30, 6, 64); s.position.set(0, 6, 30); g.add(s);
  g.position.set(x, 0, z); scene.add(g);
}

// ---------- 愛河：河道、河岸步道、河上的船與燈 ----------
function loveRiver(scene) {
  const strip = (half, y, color, rough) => {
    const pos = [], idx = [];
    const n = RIVER.length;
    for (let i = 0; i < n; i++) {
      const p = RIVER[i], a = RIVER[Math.max(0, i - 1)], b = RIVER[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const rx = -tz, rz = tx;
      pos.push(p[0] - rx * half, y, p[1] - rz * half, p[0] + rx * half, y, p[1] + rz * half);
      if (i < n - 1) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: rough < 0.5 ? 0.1 : 0 }));
    m.receiveShadow = true; return m;
  };
  scene.add(strip(RIVER_W / 2 + 9, 0.012, 0xCFC8B8, 0.9));   // 河岸步道
  scene.add(strip(RIVER_W / 2, 0.02, 0x3F8FC4, 0.18));       // 河水
  // 船
  for (let i = 1; i < RIVER.length - 1; i += 2) {
    const p = RIVER[i], q = RIVER[i + 1];
    const g = new THREE.Group();
    g.add(box(9, 1.4, 3.4, lam(0xF2F0EA), 0, 0.9, 0)); g.add(box(5, 1.6, 2.6, lam(0xE8743B), -0.5, 2.3, 0));
    g.position.set(p[0] + (Math.random() - .5) * 10, 0, p[1] + (Math.random() - .5) * 10); g.rotation.y = Math.atan2(q[0] - p[0], q[1] - p[1]) + Math.PI / 2;
    scene.add(g);
  }
  // 河邊路燈
  // 燈桿、燈頭各一個 InstancedMesh（原本一支一個 mesh，約 150 個 draw call）
  const lampGeo = new THREE.CylinderGeometry(0.12, 0.16, 5, 6), lampMat = lam(0x6E7378);
  const headGeo = new THREE.SphereGeometry(0.5, 8, 6), headMat = new THREE.MeshStandardMaterial({ color: 0xFFF2C2, emissive: 0xFFE9A8, emissiveIntensity: 0.7 });
  const poles = [], heads = [];
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 10; d < len; d += 22) {
      const t = d / len, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      let tx = b[0] - a[0], tz = b[1] - a[1]; tx /= len; tz /= len; const rx = -tz, rz = tx;
      for (const sd of [-1, 1]) {
        const off = RIVER_W / 2 + 5;
        poles.push(m4.makeTranslation(x + rx * off * sd, 2.5, z + rz * off * sd).clone());
        heads.push(m4.makeTranslation(x + rx * off * sd, 5.2, z + rz * off * sd).clone());
      }
    }
  }
  for (const [geo, mat, list] of [[lampGeo, lampMat, poles], [headGeo, headMat, heads]]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, k) => im.setMatrixAt(k, m));
    scene.add(im);
  }
}

// ---------- 壽山 ----------
function shoushan(scene) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x6FA97F, flatShading: true });
  const hills = [], tmp = new THREE.Object3D();
  for (let i = 0; i < 7; i++) {
    const h = 90 + Math.random() * 70;
    tmp.position.set(760 + Math.cos(i * 1.1) * 120, h / 2 - 6, 260 + i * 95); tmp.rotation.y = Math.random(); tmp.updateMatrix();
    hills.push(new THREE.ConeGeometry(110 + Math.random() * 60, h, 7).toNonIndexed().applyMatrix4(tmp.matrix));
  }
  scene.add(new THREE.Mesh(mergeCones(hills), mat));
}

export function buildKaohsiung(scene, S) {
  tuntex(scene, 560, -390);
  musicCenter(scene, 595, -190);
  harbor(scene);
  pier2(scene);
  arena(scene, -200, -600);
  formosa(scene, -375, -320);
  loveRiver(scene);
  shoushan(scene);
}
