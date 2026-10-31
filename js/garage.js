// 車庫資料：角色與車款。下一次要加角色或車款，只要在陣列裡加一筆，介面會自己長出來。
// 每筆：id（存在 localStorage 用）、name、desc（一句介紹）、icon（車庫格子裡的小圖，SVG 字串）、
//       stats（五項：speed 極速、accel 加速、handling 操控、offroad 越野、weight 重量。車款是 1～5 的本值，角色是加減值）、
//       build（角色：build(ctx) 回傳 characters.js 那種 { group, tail?, face? }，ctx 有 face 與 driverGroup；
//             車款：build(colorHex) 回傳 buildKart 那種 { group, wheels, driver, … }）
import { buildKart } from './kart.js';
import { buildCharacter } from './characters.js';

export const STAT_NAMES = [['speed', '極速'], ['accel', '加速'], ['handling', '操控'], ['offroad', '越野'], ['weight', '重量']];

const Z = { speed: 0, accel: 0, handling: 0, offroad: 0, weight: 0 };
const st = (o) => ({ ...Z, ...o });

export const CHARACTERS = [
  {
    id: 'squirrel', name: '松鼠', weightClass: '中', desc: '核果資訊學苑的松鼠，什麼車都開得順。',
    icon: '<svg viewBox="0 0 48 48"><circle cx="24" cy="30" r="12" fill="#D98A41"/><circle cx="24" cy="18" r="10" fill="#D98A41"/><path d="M14 12 l4 -9 l4 8z M34 12 l-4 -9 l-4 8z" fill="#D98A41"/><circle cx="20" cy="17" r="1.6" fill="#1A1A1A"/><circle cx="28" cy="17" r="1.6" fill="#1A1A1A"/><circle cx="24" cy="21" r="3.5" fill="#F2C994"/><path d="M36 34 c8 -4 8 -16 0 -20 c3 8 1 14 -4 18z" fill="#B5651D"/></svg>',
    stats: st({}), build: (ctx) => buildCharacter('squirrel', ctx.face)
  },
  {
    id: 'nutman', name: '核果人', weightClass: '輕', desc: '核果長出手腳。輕，起步快、轉彎靈活，極速普通。',
    icon: '<svg viewBox="0 0 48 48"><path d="M24 44c-10 0-15-8-15-18 0-6 6-10 15-10s15 4 15 10c0 10-5 18-15 18z" fill="#E8923A"/><path d="M9 18q15-9 30 0q-15 6-30 0z" fill="#5A3A1E"/><rect x="23" y="4" width="2" height="7" fill="#5A3A1E"/><circle cx="19" cy="27" r="2" fill="#1A1A1A"/><circle cx="29" cy="27" r="2" fill="#1A1A1A"/></svg>',
    stats: st({ speed: -1, accel: 1, handling: 1, weight: -1 }), build: (ctx) => buildCharacter('nutman', ctx.face)
  },
  {
    id: 'owl', name: '貓頭鷹', weightClass: '輕', desc: '大眼睛看得遠。輕，加速和操控好，但草地上不太行。',
    icon: '<svg viewBox="0 0 48 48"><ellipse cx="24" cy="27" rx="14" ry="17" fill="#8C7A66"/><path d="M10 12l5-8 4 9zM38 12l-5-8-4 9z" fill="#8C7A66"/><circle cx="18" cy="22" r="6" fill="#fff"/><circle cx="30" cy="22" r="6" fill="#fff"/><circle cx="18" cy="22" r="3" fill="#1A1A1A"/><circle cx="30" cy="22" r="3" fill="#1A1A1A"/><path d="M24 26l-3 5h6z" fill="#E8743B"/></svg>',
    stats: st({ accel: 1, handling: 1, offroad: -1, weight: -1 }), build: (ctx) => buildCharacter('owl', ctx.face)
  },
  {
    id: 'capybara', name: '水豚', weightClass: '重', desc: '頭上頂一顆橘子，很淡定。重，極速高、草地也穩，起步慢。',
    icon: '<svg viewBox="0 0 48 48"><rect x="8" y="14" width="32" height="26" rx="10" fill="#B07A45"/><rect x="24" y="22" width="16" height="10" rx="4" fill="#7A5330"/><circle cx="18" cy="24" r="2" fill="#1A1A1A"/><circle cx="12" cy="14" r="3" fill="#7A5330"/><circle cx="24" cy="11" r="5" fill="#FF9A2E"/><rect x="25" y="4" width="5" height="2" fill="#3C8C3C"/></svg>',
    stats: st({ speed: 1, accel: -1, offroad: 1, weight: 1 }), build: (ctx) => buildCharacter('capybara', ctx.face)
  },
  {
    id: 'bear', name: '台灣黑熊', weightClass: '重', desc: '胸口有白色 V。最重，撞不倒、極速高，轉彎要早一點。',
    icon: '<svg viewBox="0 0 48 48"><circle cx="24" cy="28" r="14" fill="#262626"/><circle cx="24" cy="17" r="11" fill="#262626"/><circle cx="14" cy="9" r="4" fill="#262626"/><circle cx="34" cy="9" r="4" fill="#262626"/><circle cx="24" cy="20" r="4" fill="#8A6A4A"/><circle cx="20" cy="15" r="1.5" fill="#fff"/><circle cx="28" cy="15" r="1.5" fill="#fff"/><path d="M17 30l7 8 7-8" fill="none" stroke="#fff" stroke-width="3"/></svg>',
    stats: st({ speed: 1, accel: -1, handling: -1, weight: 2 }), build: (ctx) => buildCharacter('bear', ctx.face)
  },
  {
    id: 'robot', name: '小機器人', weightClass: '中', desc: '會發光的面罩。起步快，不過草地會卡住。',
    icon: '<svg viewBox="0 0 48 48"><rect x="12" y="12" width="24" height="20" rx="4" fill="#BFC4CC"/><rect x="15" y="18" width="18" height="7" rx="2" fill="#3A4048"/><rect x="17" y="20" width="5" height="3" fill="#59C8FF"/><rect x="26" y="20" width="5" height="3" fill="#59C8FF"/><rect x="23" y="4" width="2" height="8" fill="#3A4048"/><circle cx="24" cy="4" r="3" fill="#E8743B"/><rect x="14" y="33" width="20" height="11" rx="3" fill="#BFC4CC"/></svg>',
    stats: st({ accel: 1, offroad: -1 }), build: (ctx) => buildCharacter('robot', ctx.face)
  },
  {
    id: 'custom', name: '我的角色', weightClass: '中', desc: '上傳自己做的 .obj／.stl／.glb，坐在駕駛座。', upload: true,
    icon: '<svg viewBox="0 0 48 48"><path d="M24 8 v22" stroke="#FDF6E3" stroke-width="4" stroke-linecap="round"/><path d="M15 17 l9 -9 l9 9" fill="none" stroke="#FDF6E3" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 32 v6 a3 3 0 0 0 3 3 h22 a3 3 0 0 0 3 -3 v-6" fill="none" stroke="#FDF6E3" stroke-width="4" stroke-linecap="round"/></svg>',
    stats: st({}),
    build: (ctx) => ctx.driverGroup ? { group: ctx.driverGroup } : buildCharacter('squirrel', ctx.face)   // 還沒上傳就先用松鼠
  }
];

const kartIcon = (body, extra = '') => '<svg viewBox="0 0 48 48">' + body + '<rect x="8" y="9" width="6" height="10" rx="2" fill="#1B1B1B"/><rect x="34" y="9" width="6" height="10" rx="2" fill="#1B1B1B"/><rect x="8" y="29" width="6" height="10" rx="2" fill="#1B1B1B"/><rect x="34" y="29" width="6" height="10" rx="2" fill="#1B1B1B"/>' + extra + '</svg>';

export const KARTS = [
  {
    id: 'kart', name: '卡丁', desc: '什麼都行的基本款。',
    icon: kartIcon('<rect x="13" y="6" width="22" height="36" rx="6" fill="#E8743B"/><rect x="18" y="18" width="12" height="12" rx="3" fill="#143D22"/>'),
    stats: { speed: 3, accel: 3, handling: 3, offroad: 3, weight: 3 },
    build: (colorHex) => buildKart(colorHex, { style: 'kart' })
  },
  {
    id: 'sport', name: '跑車', desc: '直線最快，彎道要會漂移，草地很慢。',
    icon: kartIcon('<path d="M16 4h16l4 10v26a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V14z" fill="#E8743B"/><rect x="18" y="16" width="12" height="10" rx="3" fill="#143D22"/><rect x="9" y="38" width="30" height="5" rx="2" fill="#C45C25"/>'),
    stats: { speed: 5, accel: 2, handling: 2, offroad: 1, weight: 3 },
    build: (colorHex) => buildKart(colorHex, { style: 'sport' })
  },
  {
    id: 'offroad', name: '越野車', desc: '大輪胎，衝出路面也不怕，加速好。',
    icon: '<svg viewBox="0 0 48 48"><rect x="12" y="7" width="24" height="34" rx="7" fill="#E8743B"/><rect x="17" y="17" width="14" height="12" rx="3" fill="#143D22"/><rect x="5" y="7" width="8" height="13" rx="3" fill="#1B1B1B"/><rect x="35" y="7" width="8" height="13" rx="3" fill="#1B1B1B"/><rect x="5" y="28" width="8" height="13" rx="3" fill="#1B1B1B"/><rect x="35" y="28" width="8" height="13" rx="3" fill="#1B1B1B"/><rect x="15" y="11" width="18" height="3" rx="1" fill="#FFE066"/></svg>',
    stats: { speed: 2, accel: 4, handling: 3, offroad: 5, weight: 4 },
    build: (colorHex) => buildKart(colorHex, { style: 'offroad' })
  },
  {
    id: 'bus', name: '小巴', desc: '最重，撞人不吃虧，起步慢。',
    icon: kartIcon('<rect x="12" y="4" width="24" height="40" rx="5" fill="#E8743B"/><rect x="15" y="8" width="18" height="8" rx="2" fill="#9FD8F0"/><rect x="15" y="20" width="18" height="16" rx="2" fill="#C45C25"/><rect x="19" y="23" width="10" height="6" rx="1" fill="#FFE066"/>'),
    stats: { speed: 4, accel: 1, handling: 2, offroad: 2, weight: 5 },
    build: (colorHex) => buildKart(colorHex, { style: 'bus' })
  }
];

// 角色加車款的合計，壓在 1～5
export function totalStats(ch, kart) {
  const out = {};
  for (const [k] of STAT_NAMES) out[k] = Math.max(1, Math.min(5, (kart.stats[k] || 0) + (ch.stats[k] || 0)));
  return out;
}
