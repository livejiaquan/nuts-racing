// 後製：MSAA 渲染目標 → 亮部萃取 → 模糊 → 合成
// 合成這一道一次做完：發光、速度感（邊緣徑向模糊、速度線）、加速色散、太陽鏡頭光暈、暗角、調色。
// 自己寫的輕量版，不用額外套件；關掉時直接畫到螢幕，零成本。
import * as THREE from 'three';

const VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BRIGHT = `
uniform sampler2D tex; uniform float threshold; uniform float knee;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tex, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float soft = clamp((l - threshold + knee) / (2.0 * knee), 0.0, 1.0);
  soft = soft * soft;
  float w = max(soft, step(threshold, l));
  gl_FragColor = vec4(c * w, 1.0);
}
`;

const BLUR = `
uniform sampler2D tex; uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tex, vUv).rgb * 0.227;
  s += texture2D(tex, vUv + dir * 1.385).rgb * 0.316;
  s += texture2D(tex, vUv - dir * 1.385).rgb * 0.316;
  s += texture2D(tex, vUv + dir * 3.231).rgb * 0.070;
  s += texture2D(tex, vUv - dir * 3.231).rgb * 0.070;
  gl_FragColor = vec4(s, 1.0);
}
`;

const COMPOSITE = `
uniform sampler2D scene; uniform sampler2D bloom;
uniform float bloomStrength; uniform float vignette; uniform float boostGlow;
uniform float speed; uniform float time; uniform float aspect;
uniform vec3 sunUv;        // x, y：太陽在畫面上的位置；z：可見度
uniform vec3 tint;
varying vec2 vUv;

vec3 ghost(vec2 uv, vec2 c, float r, vec3 col) {
  float d = length((uv - c) * vec2(aspect, 1.0));
  return col * smoothstep(r, r * 0.5, d);
}

void main() {
  vec2 d = vUv - 0.5;
  float rad = length(d * vec2(aspect, 1.0));
  // 速度感：畫面邊緣沿著徑向拉糊，中間保持清楚（賽車遊戲的標準做法）；自己的車在畫面下方偏中，那一圈也要保持清楚
  float radCar = length((vUv - vec2(0.5, 0.3)) * vec2(aspect, 1.0));
  float sm = speed * smoothstep(0.12, 0.65, rad) * smoothstep(0.22, 0.6, radCar);
  vec3 c;
  if (sm > 0.002) {
    vec2 dir = d * sm * 0.05;
    c  = texture2D(scene, vUv).rgb * 0.30;
    c += texture2D(scene, vUv - dir * 0.4).rgb * 0.20;
    c += texture2D(scene, vUv - dir * 0.8).rgb * 0.17;
    c += texture2D(scene, vUv - dir * 1.2).rgb * 0.13;
    c += texture2D(scene, vUv - dir * 1.6).rgb * 0.11;
    c += texture2D(scene, vUv - dir * 2.0).rgb * 0.09;
  } else c = texture2D(scene, vUv).rgb;
  // 加速時紅藍往外錯開一點（色散）
  if (boostGlow > 0.002) {
    vec2 off = d * boostGlow * 0.007;
    c.r = mix(c.r, texture2D(scene, vUv + off).r, 0.85);
    c.b = mix(c.b, texture2D(scene, vUv - off).b, 0.85);
  }
  c += texture2D(bloom, vUv).rgb * bloomStrength;
  // 速度線：從中心往外飛的細短線，只出現在邊緣、只在很快的時候
  float sl = smoothstep(0.55, 1.0, speed);
  if (sl > 0.002) {
    float ang = atan(d.y, d.x * aspect);
    float a = (ang / 6.2831853 + 0.5) * 64.0;
    float id = floor(a), fr = fract(a);
    float thin = smoothstep(0.40, 0.5, fr) * smoothstep(0.60, 0.5, fr);
    float rnd = fract(sin(id * 12.9898) * 43758.5453);
    float along = rad * 5.0 - time * (5.0 + rnd * 7.0) - rnd * 9.0;
    float line = step(0.84, fract(along)) * step(0.5, rnd) * thin;
    c += vec3(1.0, 0.98, 0.92) * line * sl * smoothstep(0.28, 0.72, rad) * 0.55;
  }
  // 太陽鏡頭光暈：幾個沿著「太陽 → 畫面中心」排列的光斑，加一條橫向光條
  if (sunUv.z > 0.002) {
    vec2 su = sunUv.xy; vec2 v = 0.5 - su;
    vec3 f = vec3(0.0);
    f += ghost(vUv, su,            0.13,  vec3(1.0, 0.92, 0.75)) * 0.30;
    f += ghost(vUv, su + v * 0.55, 0.035, vec3(1.0, 0.62, 0.30)) * 0.22;
    f += ghost(vUv, su + v * 0.9,  0.06,  vec3(0.55, 0.80, 1.0)) * 0.16;
    f += ghost(vUv, su + v * 1.35, 0.025, vec3(1.0, 0.85, 0.40)) * 0.28;
    f += ghost(vUv, su + v * 1.8,  0.09,  vec3(0.60, 1.0, 0.72)) * 0.10;
    f += vec3(1.0, 0.85, 0.65) * exp(-abs(vUv.y - su.y) * 90.0) * exp(-abs(vUv.x - su.x) * 2.5) * 0.30;
    c += f * sunUv.z;
  }
  // 一點點對比與飽和，讓顏色跳出來；時段的色調
  c = (c - 0.5) * 1.06 + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.12);
  c *= tint;
  // 暗角；加速時邊緣泛橘
  float v = smoothstep(0.85, 0.35, length(d) * 1.3);
  c *= mix(1.0 - vignette, 1.0, v);
  // 加速的橘光從很外圈慢慢進來，不要在平坦的天空上畫出一個圓
  float vb = smoothstep(0.25, 1.05, rad * 1.25);
  c += vec3(1.0, 0.55, 0.2) * boostGlow * vb * 0.3;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.enabled = true;
    const w = 2, h = 2;
    const type = THREE.HalfFloatType;
    this.rt = new THREE.WebGLRenderTarget(w, h, { type, samples: 4, colorSpace: THREE.LinearSRGBColorSpace });
    this.rt.texture.minFilter = THREE.LinearFilter;
    this.rtA = new THREE.WebGLRenderTarget(w, h, { type });
    this.rtB = new THREE.WebGLRenderTarget(w, h, { type });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.brightMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BRIGHT, uniforms: { tex: { value: null }, threshold: { value: 1.15 }, knee: { value: 0.35 } }, depthTest: false, depthWrite: false, toneMapped: false });
    this.blurMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BLUR, uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false, toneMapped: false });
    this.compMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COMPOSITE, uniforms: {
      scene: { value: null }, bloom: { value: null }, bloomStrength: { value: 0.55 }, vignette: { value: 0.32 }, boostGlow: { value: 0 },
      speed: { value: 0 }, time: { value: 0 }, aspect: { value: 1 }, sunUv: { value: new THREE.Vector3(0.5, 0.5, 0) }, tint: { value: new THREE.Vector3(1, 1, 1) }
    }, depthTest: false, depthWrite: false });
    this.setSize(renderer.domElement.width, renderer.domElement.height);
  }
  setSize(w, h) {
    this.rt.setSize(w, h);
    const bw = Math.max(1, Math.floor(w / 4)), bh = Math.max(1, Math.floor(h / 4));
    this.rtA.setSize(bw, bh); this.rtB.setSize(bw, bh);
    this.bw = bw; this.bh = bh;
    this.compMat.uniforms.aspect.value = w / Math.max(1, h);
  }
  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }
  // opts：{ boostGlow, speed, time, sun: Vector3(x, y, 可見度), tint: [r,g,b] }；也接受舊的單一數字（boostGlow）
  render(opts = 0) {
    if (typeof opts === 'number') opts = { boostGlow: opts };
    const r = this.renderer;
    if (!this.enabled) { r.setRenderTarget(null); r.render(this.scene, this.camera); return; }
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    // 亮部 → A
    this.brightMat.uniforms.tex.value = this.rt.texture;
    this.pass(this.brightMat, this.rtA);
    // 模糊 A → B → A（兩次，更柔）
    for (let i = 0; i < 2; i++) {
      this.blurMat.uniforms.tex.value = this.rtA.texture; this.blurMat.uniforms.dir.value.set(1 / this.bw, 0);
      this.pass(this.blurMat, this.rtB);
      this.blurMat.uniforms.tex.value = this.rtB.texture; this.blurMat.uniforms.dir.value.set(0, 1 / this.bh);
      this.pass(this.blurMat, this.rtA);
    }
    const u = this.compMat.uniforms;
    u.scene.value = this.rt.texture;
    u.bloom.value = this.rtA.texture;
    u.boostGlow.value = opts.boostGlow || 0;
    u.speed.value = opts.speed || 0;
    u.time.value = opts.time || 0;
    if (opts.sun) u.sunUv.value.copy(opts.sun); else u.sunUv.value.z = 0;
    if (opts.tint) u.tint.value.set(opts.tint[0], opts.tint[1], opts.tint[2]);
    this.pass(this.compMat, null);
  }
}
