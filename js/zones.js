// 地標與水域的保留區：街屋、背景馬路、樹都不會長進去
export const RIVER = [[-520, 170], [-420, 60], [-330, -40], [-285, -105], [-262, -180], [-300, -270], [-360, -330]];
export const RIVER_W = 46;

// 圓形保留區 {x, z, r}
export const CIRCLES = [
  { x: 560, z: -390, r: 95, name: '85大樓' },
  { x: 595, z: -190, r: 75, name: '流行音樂中心' },
  { x: -200, z: -600, r: 95, name: '巨蛋' },
  { x: -375, z: -320, r: 42, name: '美麗島站' },
  { x: 175, z: -395, r: 0, name: '駁二' },
  { x: -800, z: -60, r: 0, name: '蓮池潭' }
];
// 矩形保留區 {x1, z1, x2, z2}
export const RECTS = [
  { x1: 150, z1: -980, x2: 780, z2: -545, name: '高雄港' },
  { x1: 240, z1: -400, x2: 370, z2: -320, name: '駁二倉庫' },
  { x1: -1120, z1: -520, x2: -480, z2: 400, name: '蓮池潭' }
];

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function distToRiver(x, z) {
  let best = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) best = Math.min(best, segDist(x, z, RIVER[i][0], RIVER[i][1], RIVER[i + 1][0], RIVER[i + 1][1]));
  return best - RIVER_W / 2;
}

export function excluded(x, z, margin = 0) {
  if (distToRiver(x, z) < margin + 6) return true;
  for (const c of CIRCLES) if (c.r && Math.hypot(x - c.x, z - c.z) < c.r + margin) return true;
  for (const r of RECTS) if (x > r.x1 - margin && x < r.x2 + margin && z > r.z1 - margin && z < r.z2 + margin) return true;
  return false;
}
