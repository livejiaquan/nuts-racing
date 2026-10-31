// 車庫資料：角色與車款。下一批要加角色或車款，只要在陣列裡加一筆，介面會自己長出來。
// 每筆：id（存在 localStorage 用）、name、desc（一句介紹）、icon（車庫格子裡的小圖，SVG 字串）、
//       stats（五項 1～5：speed 極速、accel 加速、handling 操控、offroad 越野、weight 重量；角色寫的是加減值）、
//       build（角色：回傳坐在駕駛座的 Object3D，回 null 就用卡丁車內建的松鼠；車款：回傳 buildKart 那種 {group, wheels, …}）
import { buildKart } from './kart.js';

export const STAT_NAMES = [['speed', '極速'], ['accel', '加速'], ['handling', '操控'], ['offroad', '越野'], ['weight', '重量']];

const ZERO = { speed: 0, accel: 0, handling: 0, offroad: 0, weight: 0 };

export const CHARACTERS = [
  {
    id: 'squirrel', name: '松鼠', desc: '核果資訊學苑的松鼠，什麼車都開得順。',
    icon: '<svg viewBox="0 0 48 48"><circle cx="24" cy="30" r="12" fill="#D98A41"/><circle cx="24" cy="18" r="10" fill="#D98A41"/><path d="M14 12 l4 -9 l4 8z M34 12 l-4 -9 l-4 8z" fill="#D98A41"/><circle cx="20" cy="17" r="1.6" fill="#1A1A1A"/><circle cx="28" cy="17" r="1.6" fill="#1A1A1A"/><circle cx="24" cy="21" r="3.5" fill="#F2C994"/><path d="M36 34 c8 -4 8 -16 0 -20 c3 8 1 14 -4 18z" fill="#B5651D"/></svg>',
    stats: { ...ZERO },
    build: () => null   // null：用 kart.js 裡內建的松鼠
  },
  {
    id: 'custom', name: '我的角色', desc: '上傳自己做的 .obj／.stl／.glb，坐在駕駛座。', upload: true,
    icon: '<svg viewBox="0 0 48 48"><path d="M24 8 v22" stroke="#FDF6E3" stroke-width="4" stroke-linecap="round"/><path d="M15 17 l9 -9 l9 9" fill="none" stroke="#FDF6E3" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 32 v6 a3 3 0 0 0 3 3 h22 a3 3 0 0 0 3 -3 v-6" fill="none" stroke="#FDF6E3" stroke-width="4" stroke-linecap="round"/></svg>',
    stats: { ...ZERO },
    build: (ctx) => ctx.driverGroup || null   // 上傳過就放上傳的，還沒上傳就先用松鼠
  }
];

export const KARTS = [
  {
    id: 'kart', name: '卡丁', desc: '什麼都行的基本款。',
    icon: '<svg viewBox="0 0 48 48"><rect x="13" y="6" width="22" height="36" rx="6" fill="#E8743B"/><rect x="18" y="18" width="12" height="12" rx="3" fill="#143D22"/><rect x="8" y="9" width="6" height="10" rx="2" fill="#1B1B1B"/><rect x="34" y="9" width="6" height="10" rx="2" fill="#1B1B1B"/><rect x="8" y="29" width="6" height="10" rx="2" fill="#1B1B1B"/><rect x="34" y="29" width="6" height="10" rx="2" fill="#1B1B1B"/></svg>',
    stats: { speed: 3, accel: 3, handling: 3, offroad: 3, weight: 3 },
    build: (colorHex) => buildKart(colorHex)
  }
];

// 角色加車款的合計，壓在 1～5
export function totalStats(ch, kart) {
  const out = {};
  for (const [k] of STAT_NAMES) out[k] = Math.max(1, Math.min(5, (kart.stats[k] || 0) + (ch.stats[k] || 0)));
  return out;
}
