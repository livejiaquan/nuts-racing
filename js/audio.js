// 音效：全部用 WebAudio 合成，不需要音檔
let AC = null, master = null, muted = false;
function ctx() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 1; master.connect(AC.destination);
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function out() { ctx(); return master; }
export function setMuted(m) { muted = m; try { out().gain.setTargetAtTime(m ? 0 : 1, ctx().currentTime, 0.05); } catch (e) {} }
export function isMuted() { return muted; }
export function audioState() { return { ctx: AC ? AC.state : 'none', bgmStep: bgm ? bgm.step : -1, bgmMode: bgm ? bgm.mode : null, engine: !!eng }; }

export function beep(freq, dur, delay = 0, type = 'square', vol = 0.08) {
  try {
    const ac = ctx();
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(out());
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) {}
}

export const SFX = {
  countdown: () => beep(523, 0.12),
  go: () => { beep(784, 0.1); beep(1046, 0.25, 0.1); },
  nut: () => { beep(880, 0.07, 0, 'square', 0.06); beep(1320, 0.09, 0.06, 'square', 0.06); },
  boost: () => { beep(300, 0.3, 0, 'sawtooth', 0.05); beep(600, 0.3, 0.05, 'sawtooth', 0.04); },
  cone: () => beep(140, 0.18, 0, 'square', 0.1),
  bump: () => beep(200, 0.12, 0, 'square', 0.07),
  lap: () => { beep(1046, 0.1); beep(1318, 0.14, 0.1); },
  finish: () => { beep(784, 0.12); beep(1046, 0.12, 0.12); beep(1318, 0.12, 0.24); beep(1568, 0.35, 0.36); },
  click: () => beep(660, 0.06, 0, 'square', 0.04),
  cheer: () => noiseBurst(1.6, 0.12, 1800),
  whoosh: () => noiseBurst(0.35, 0.08, 900)
};

// 噪音：歡呼、風聲
function noiseBurst(dur, vol, cutoff) {
  try {
    const ac = ctx();
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = cutoff; f.Q.value = 0.7;
    const g = ac.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(out()); src.start();
  } catch (e) {}
}

// 輪胎摩擦聲：轉彎太猛時
let skid = null;
export function skidUpdate(on) {
  try {
    const ac = ctx();
    if (!skid) {
      const n = ac.sampleRate * 2, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 2.5;
      const g = ac.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(out()); src.start();
      skid = { g };
    }
    skid.g.gain.setTargetAtTime(on ? 0.05 : 0, ac.currentTime, 0.08);
  } catch (e) {}
}

// 背景音樂：WebAudio 寫的小曲子，沒有音檔。title 慢一點、race 快一點
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];          // 五聲音階，怎麼排都好聽
const BASS = [0, 0, 5, 5, 7, 7, 3, 3];
let bgm = null;
export function bgmStart() {
  try {
    const ac = ctx();
    if (bgm) return;
    const g = ac.createGain(); g.gain.value = 0.0; g.connect(out());
    bgm = { g, mode: 'title', step: 0, next: ac.currentTime + 0.1, timer: null };
    const root = 220;
    const note = (semi, t, dur, type, vol) => {
      const o = ac.createOscillator(), e = ac.createGain();
      o.type = type; o.frequency.value = root * Math.pow(2, semi / 12);
      e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol, t + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(e); e.connect(g); o.start(t); o.stop(t + dur + 0.05);
    };
    const tick = () => {
      const race = bgm.mode === 'race';
      const bpm = race ? 150 : 96, beat = 60 / bpm, sub = beat / 2;
      // 分頁切到背景時 setTimeout 會被放慢，回來不要把漏掉的音一次全放，直接接到現在
      if (bgm.next < ac.currentTime - 0.3) bgm.next = ac.currentTime + 0.05;
      while (bgm.next < ac.currentTime + 0.4) {
        const s = bgm.step, t = bgm.next;
        const bar = Math.floor(s / 8) % 4;
        // 旋律：每半拍一個音，隨 step 在音階上跳
        const mel = SCALE[(s * 3 + bar * 2 + Math.floor(s / 16)) % SCALE.length] + 12;
        if (s % 2 === 0 || race) note(mel, t, sub * 0.9, 'square', race ? 0.05 : 0.035);
        // 低音：每拍
        if (s % 2 === 0) note(BASS[(s / 2) % 8] - 12, t, beat * 0.8, 'triangle', 0.07);
        // 鼓：hi-hat 每半拍、kick 每拍
        if (race) { const o = ac.createOscillator(), e = ac.createGain(); o.type = 'square'; o.frequency.value = 6000; e.gain.setValueAtTime(0.012, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); o.connect(e); e.connect(g); o.start(t); o.stop(t + 0.05); }
        if (s % 2 === 0) { const o = ac.createOscillator(), e = ac.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); e.gain.setValueAtTime(race ? 0.09 : 0.05, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.14); o.connect(e); e.connect(g); o.start(t); o.stop(t + 0.15); }
        bgm.step++; bgm.next += sub;
      }
      bgm.timer = setTimeout(tick, 120);
    };
    tick();
    g.gain.setTargetAtTime(0.5, ac.currentTime, 0.5);
  } catch (e) {}
}
export function bgmSet(mode) { if (bgm) bgm.mode = mode; }

// 引擎：兩個振盪器疊在一起，音高跟速度走
let eng = null;
export function engineStart() {
  try {
    const ac = ctx();
    if (eng) return;
    const g = ac.createGain(); g.gain.value = 0;
    const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 110;
    const g2 = ac.createGain(); g2.gain.value = 0.35;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(out());
    o1.start(); o2.start();
    eng = { g, o1, o2, lp };
  } catch (e) {}
}

export function engineUpdate(speedPct, on) {
  if (!eng) return;
  const ac = ctx();
  const f = 48 + speedPct * 170;
  eng.o1.frequency.setTargetAtTime(f, ac.currentTime, 0.06);
  eng.o2.frequency.setTargetAtTime(f * 2.01, ac.currentTime, 0.06);
  eng.lp.frequency.setTargetAtTime(600 + speedPct * 1400, ac.currentTime, 0.1);
  eng.g.gain.setTargetAtTime(on ? 0.03 + speedPct * 0.035 : 0, ac.currentTime, 0.12);
}
