// 後製：MSAA 渲染目標 → 亮部萃取 → 模糊 → 合成（淡發光、暗角、一點點對比）
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
varying vec2 vUv;
void main() {
  vec3 c = texture2D(scene, vUv).rgb;
  c += texture2D(bloom, vUv).rgb * bloomStrength;
  // 一點點對比與飽和，讓顏色跳出來
  c = (c - 0.5) * 1.06 + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.12);
  // 暗角；加速時邊緣泛橘
  vec2 d = vUv - 0.5;
  float v = smoothstep(0.85, 0.35, length(d) * 1.3);
  c *= mix(1.0 - vignette, 1.0, v);
  c += vec3(1.0, 0.55, 0.2) * boostGlow * (1.0 - v) * 0.35;
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
    this.compMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COMPOSITE, uniforms: { scene: { value: null }, bloom: { value: null }, bloomStrength: { value: 0.55 }, vignette: { value: 0.32 }, boostGlow: { value: 0 } }, depthTest: false, depthWrite: false });
    this.setSize(renderer.domElement.width, renderer.domElement.height);
  }
  setSize(w, h) {
    this.rt.setSize(w, h);
    const bw = Math.max(1, Math.floor(w / 4)), bh = Math.max(1, Math.floor(h / 4));
    this.rtA.setSize(bw, bh); this.rtB.setSize(bw, bh);
    this.bw = bw; this.bh = bh;
  }
  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }
  render(boostGlow = 0) {
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
    this.compMat.uniforms.scene.value = this.rt.texture;
    this.compMat.uniforms.bloom.value = this.rtA.texture;
    this.compMat.uniforms.boostGlow.value = boostGlow;
    this.pass(this.compMat, null);
  }
}
