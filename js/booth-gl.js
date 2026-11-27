// WebGL filter engine for the photo booth. Same shaders run on the live preview and on the final strip.
export const FILTERS = [
  { id: 'plain', name: 'Без фильтра' },
  { id: 'digicam', name: 'Цифро\u00ADмыльница' }, // soft hyphen: breaks only when the chip is narrow
  { id: 'bw', name: 'Ч/б будка' },
  { id: 'retro', name: 'Ретро-плёнка' },
  { id: 'flash', name: 'Вспышка' },
  { id: 'golden', name: 'Золотой час' },
  { id: 'cine', name: 'Кино' }
];
// Date imprint drawn on top of some filters, like an old film camera
export const STAMPS = { digicam: 'corner', flash: 'side' };
export function stampText(kind, d = new Date()) {
  const yy = String(d.getFullYear()).slice(2), m = d.getMonth() + 1, day = d.getDate(), p2 = n => String(n).padStart(2, '0');
  return kind === 'side' ? `${m} ${day} '${yy}` : `'${yy} ${p2(m)} ${p2(day)}`;
}

const VERT = `attribute vec2 a_pos; varying vec2 v_uv;
void main(){ v_uv = vec2(a_pos.x * .5 + .5, .5 - a_pos.y * .5); gl_Position = vec4(a_pos, 0., 1.); }`;

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D u_tex; uniform vec2 u_res; uniform float u_time; uniform vec4 u_crop; uniform float u_mirror;
vec3 src(vec2 uv){ uv = clamp(uv, 0., 1.); if (u_mirror > .5) uv.x = 1. - uv.x; return texture2D(u_tex, u_crop.xy + uv * u_crop.zw).rgb; }
float luma(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float edgeAt(vec2 uv, float k){ vec2 px = k / u_res;
  float tl = luma(src(uv + vec2(-px.x, -px.y))), t = luma(src(uv + vec2(0., -px.y))), tr = luma(src(uv + vec2(px.x, -px.y)));
  float l = luma(src(uv + vec2(-px.x, 0.))), r = luma(src(uv + vec2(px.x, 0.)));
  float bl = luma(src(uv + vec2(-px.x, px.y))), b = luma(src(uv + vec2(0., px.y))), br = luma(src(uv + vec2(px.x, px.y)));
  float gx = -tl - 2. * l - bl + tr + 2. * r + br; float gy = -tl - 2. * t - tr + bl + 2. * b + br; return length(vec2(gx, gy)); }
`;

const BODY = {
  plain: `vec3 c = src(uv);`,
  digicam: `vec2 d = uv - .5; float r = dot(d, d);
    vec2 off = d * (.006 + r * .03);
    vec3 c = vec3(src(uv + off).r, src(uv).g, src(uv - off).b);
    c = (c - .5) * 1.28 + .53;
    c = mix(vec3(luma(c)), c, 1.18);
    c *= vec3(1.04, 1., .93);
    c += (hash(uv * u_res + fract(u_time) * 91.) - .5) * .1;
    c *= 1. - r * .7;`,
  // classic photo-booth strip: soft lens, silver tones, deep but not crushed blacks, fine grain
  bw: `vec2 px = 1.6 / u_res;
    vec3 s0 = src(uv);
    vec3 bl = (src(uv + vec2(px.x, 0.)) + src(uv - vec2(px.x, 0.)) + src(uv + vec2(0., px.y)) + src(uv - vec2(0., px.y))) * .25;
    vec3 s = mix(s0, bl, .35);
    float L = dot(s, vec3(.36, .5, .14));
    L = pow(L, 1.3);
    L = clamp((L - .5) * 1.38 + .5, 0., 1.);
    L = mix(L, L * L * (3. - 2. * L), .45);
    L = .025 + L * .95;
    L += (hash(uv * u_res + fract(u_time) * 37.) - .5) * .08 * (1.2 - abs(L - .5));
    float v = length((uv - .5) * vec2(1., .92)); L *= 1. - smoothstep(.3, .85, v) * .55;
    vec3 c = vec3(L) * vec3(1.01, 1., .975);`,
  // moody 70s film: a stop darker, punchy, warm brown shadows, teal highlights, faded blacks
  retro: `vec2 px = 1.4 / u_res;
    vec3 s = src(uv);
    vec3 bl = (src(uv + px) + src(uv - px) + src(uv + vec2(px.x, -px.y)) + src(uv + vec2(-px.x, px.y))) * .25;
    vec3 c = mix(s, bl, .3);
    c = pow(c, vec3(1.25)) * .92;
    c = (c - .45) * 1.35 + .45;
    float L = luma(c);
    c = mix(vec3(L), c, .78);
    c += vec3(.11, .04, -.03) * (1. - L) * (1. - L);
    c += vec3(-.06, .0, .06) * L;
    c -= max(c - .68, 0.) * .5;
    c = c * .88 + vec3(.06, .045, .04);
    c += (hash(uv * u_res + fract(u_time) * 53.) - .5) * .085;
    c *= 1. - smoothstep(.3, .82, length(uv - .5)) * .45;`,
  // point-and-shoot with flash: bright centre, green shadows, warm skin, heavy grain
  flash: `vec3 c = src(uv);
    float hot = 1. - smoothstep(0., .62, length((uv - vec2(.5, .45)) * vec2(1., 1.1)));
    c = pow(c, vec3(1.18)) * (.88 + .3 * hot);
    c = (c - .5) * 1.22 + .5;
    float L = luma(c);
    c += vec3(-.045, .05, -.005) * (1. - L);
    c += vec3(.04, .0, -.03) * L * (1. - L) * 2.;
    c *= vec3(.98, 1., 1.01);
    c -= max(c - .82, 0.) * .5;
    c = c * .95 + vec3(.01, .03, .02);
    float g = hash(uv * u_res + fract(u_time) * 71.) - .5, g2 = hash(uv * u_res * 1.7 + fract(u_time) * 13.) - .5;
    c += vec3(g) * .14 + vec3(g2, -g2, g2) * .03;
    c *= 1. - smoothstep(.3, .85, length(uv - .5)) * .6;`,
  // 90s street film at golden hour: warm, matte, creamy whites, pale cyan skies, olive shadows, fine grain
  golden: `vec2 px = 1.5 / u_res;
    vec3 s = src(uv);
    vec3 bl = (src(uv + px) + src(uv - px) + src(uv + vec2(px.x, -px.y)) + src(uv + vec2(-px.x, px.y))) * .25;
    vec3 c = mix(s, bl, .25);
    vec3 wide = vec3(0.);
    for (int i = 0; i < 8; i++) { float a = float(i) * .785; wide += src(uv + vec2(cos(a), sin(a)) * vec2(u_res.y / u_res.x, 1.) * .018); }
    wide /= 8.;
    c = pow(c, vec3(1.12));
    c *= vec3(1.08, 1.01, .87);
    c = (c - .5) * 1.06 + .5;
    float L = luma(c);
    c = mix(vec3(L), c, .9);
    c += vec3(-.02, .02, .015) * (1. - L) * (1. - L);
    c += vec3(.035, .018, -.025) * L * L;
    c -= max(c - .8, 0.) * .45;
    c = c * .93 + vec3(.045, .042, .03);
    c += max(wide - .72, 0.) * vec3(1., .62, .3) * .4;
    c += (hash(uv * u_res + fract(u_time) * 29.) - .5) * .07;
    c *= 1. - smoothstep(.35, .9, length(uv - .5)) * .32;`,
  // cinematic backlight: deep cool shadows, warm highlights, red halation and bloom, strong vignette
  cine: `vec3 base = src(uv);
    vec3 blur = vec3(0.);
    for (int i = 0; i < 12; i++) { float a = float(i) * .5236; blur += src(uv + vec2(cos(a), sin(a)) * vec2(u_res.y / u_res.x, 1.) * .022); }
    blur /= 12.;
    vec3 c = pow(base, vec3(1.35)) * .97;
    c = (c - .45) * 1.25 + .45;
    float L = luma(c);
    c = mix(c, c * vec3(.8, .97, 1.16), pow(1. - L, 1.2) * .8);
    c += vec3(.06, .025, -.04) * smoothstep(.55, 1., L);
    c += max(blur - .78, 0.) * vec3(1.1, .6, .3) * .9;
    c += (hash(uv * u_res + fract(u_time) * 47.) - .5) * .08;
    c *= 1. - smoothstep(.28, .85, length(uv - .5)) * .58;`
};

export class FilterEngine {
  constructor(canvas) {
    this.cv = canvas;
    const opts = { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false };
    this.gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    this.ok = !!this.gl;
    this.progs = {};
    if (!this.ok) { this.ctx2d = null; return; }
    const gl = this.gl;
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }
  program(id) {
    if (this.progs[id]) return this.progs[id];
    const gl = this.gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const frag = HEAD + `void main(){ vec2 uv = v_uv; ${BODY[id] || BODY.plain} gl_FragColor = vec4(clamp(c, 0., 1.), 1.); }`;
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = n => gl.getUniformLocation(p, n);
    this.progs[id] = { p, a: gl.getAttribLocation(p, 'a_pos'), u: { tex: loc('u_tex'), res: loc('u_res'), time: loc('u_time'), crop: loc('u_crop'), mirror: loc('u_mirror') } };
    return this.progs[id];
  }
  // source: video, image or canvas; draws into this.cv (whose size sets the output)
  render(source, filterId, { mirror = false, time = performance.now() / 1000 } = {}) {
    const sw = source.videoWidth || source.naturalWidth || source.width, sh = source.videoHeight || source.naturalHeight || source.height;
    if (!sw || !sh) return false;
    const W = this.cv.width, H = this.cv.height;
    const outA = W / H, inA = sw / sh;
    let cx = 0, cy = 0, cw = 1, ch = 1;
    if (inA > outA) { cw = outA / inA; cx = (1 - cw) / 2; } else { ch = inA / outA; cy = (1 - ch) / 2; }
    if (!this.ok) {
      const ctx = this.ctx2d || (this.ctx2d = this.cv.getContext('2d'));
      ctx.save();
      ctx.filter = { bw: 'grayscale(1) contrast(1.2) blur(.4px)', digicam: 'contrast(1.25) saturate(1.2)', retro: 'brightness(.88) contrast(1.25) saturate(.85) sepia(.25)', flash: 'brightness(1.08) contrast(1.15) sepia(.12) hue-rotate(-10deg)', golden: 'sepia(.3) contrast(.92) brightness(1.04) saturate(.9)', cine: 'contrast(1.35) brightness(.9) saturate(1.1)' }[filterId] || 'none';
      if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.drawImage(source, cx * sw, cy * sh, cw * sw, ch * sh, 0, 0, W, H);
      ctx.restore();
      return true;
    }
    const gl = this.gl;
    let prog;
    try { prog = this.program(filterId); } catch (e) { console.warn(e); prog = this.program('plain'); }
    gl.viewport(0, 0, W, H);
    gl.useProgram(prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(prog.a);
    gl.vertexAttribPointer(prog.a, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source); } catch (e) { return false; }
    gl.uniform1i(prog.u.tex, 0);
    gl.uniform2f(prog.u.res, W, H);
    gl.uniform1f(prog.u.time, time % 1000);
    gl.uniform4f(prog.u.crop, cx, cy, cw, ch);
    gl.uniform1f(prog.u.mirror, mirror ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }
}
