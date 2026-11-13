// WebGL filter engine for the photo booth. Same shaders run on the live preview and on the final strip.
export const FILTERS = [
  { id: 'digicam', num: '01', name: 'Digital Cam' },
  { id: 'fisheye', num: '02', name: 'Fisheye' },
  { id: 'pixel', num: '03', name: 'Pixel World' },
  { id: 'dreamy', num: '04', name: 'Dreamy' },
  { id: 'comic', num: '05', name: 'Comic Print' },
  { id: 'glitch', num: '06', name: 'Glitch' },
  { id: 'blueprint', num: '07', name: 'Blueprint' },
  { id: 'bw', num: '08', name: 'Black & White' },
  { id: 'plain', num: '00', name: 'No filter' }
];

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
  fisheye: `float asp = u_res.x / u_res.y; vec2 d = uv - .5; d.x *= asp; float r = length(d);
    float R0 = length(vec2(.5 * asp, .5)); float nr = pow(r / R0, 1.75) * R0 * 1.12;
    vec2 nd = r > 0. ? d / r * nr : d; nd.x /= asp;
    vec3 c = src(.5 + nd);
    c = (c - .5) * 1.1 + .5;
    float lens = smoothstep(.56, .5, r / 1.0);
    c = mix(vec3(.02, .02, .05), c, lens);
    c += vec3(.25, .3, .5) * smoothstep(.5, .56, r) * smoothstep(.62, .56, r) * .4;`,
  pixel: `vec2 grid = vec2(80., floor(80. * u_res.y / u_res.x));
    vec2 cell = floor(uv * grid); vec2 q = (cell + .5) / grid;
    vec3 c0 = src(q);
    vec2 a = floor(cell); vec2 a2 = floor(a * .5);
    float b2a = fract(dot(a, vec2(.5, a.y * .75))); float b2b = fract(dot(a2, vec2(.5, a2.y * .75)));
    float bay = b2b * .25 + b2a;
    c0 += (bay - .5) * .16;
    vec3 P[14]; P[12]=vec3(.16,.62,.3); P[13]=vec3(.55,.85,.4); P[0]=vec3(0.); P[1]=vec3(1.); P[2]=vec3(.14,.31,.91); P[3]=vec3(.07,.1,.3); P[4]=vec3(.81,.88,1.);
    P[5]=vec3(1.,.85,.29); P[6]=vec3(1.,.55,.18); P[7]=vec3(.91,.16,.12); P[8]=vec3(1.,.6,.78); P[9]=vec3(.98,.78,.64); P[10]=vec3(.55,.36,.25); P[11]=vec3(.5,.52,.58);
    vec3 c = P[0]; float best = 9.;
    for (int i = 0; i < 14; i++) { vec3 e = c0 - P[i]; float dd = dot(e * vec3(.9, 1.2, .7), e); if (dd < best) { best = dd; c = P[i]; } }
    vec2 f = fract(uv * grid); c *= .92 + .08 * step(.1, f.x) * step(.1, f.y);`,
  dreamy: `vec3 base = src(uv); vec3 blur = vec3(0.);
    for (int i = 0; i < 24; i++) { float fi = float(i); float ang = fi * 2.39996; float rr = sqrt(fi + .5) / 4.9 * .045;
      vec2 o = vec2(cos(ang), sin(ang)) * rr; o.x *= u_res.y / u_res.x; blur += src(uv + o); }
    blur /= 24.;
    vec3 glow = max(blur - .5, 0.) * 2.4;
    vec3 c = mix(base, blur, .5) + glow * .55;
    c = c * .82 + .15;
    c *= vec3(1.05, .96, 1.05);
    c = mix(c, vec3(1., .87, .94), .14);
    float v = length(uv - .5); c = mix(c, vec3(1., .97, 1.), smoothstep(.38, .8, v) * .7);`,
  comic: `vec3 c0 = src(uv); float L = luma(c0);
    vec3 post = floor(mix(vec3(L), c0, 1.6) * 3.99) / 3.;
    post = clamp(post, 0., 1.);
    vec2 px = uv * u_res; float s = .7071; mat2 rot = mat2(s, -s, s, s);
    vec2 g = rot * px / 7.5; vec2 f = fract(g) - .5;
    float rad = sqrt(max(0., 1. - L)) * .66; float dotm = smoothstep(rad, rad - .12, length(f));
    vec3 c = mix(vec3(1.), post, .88);
    c = mix(c, c * vec3(.25, .3, .55), dotm * .6);
    float e = edgeAt(uv, 1.4);
    c = mix(c, vec3(0.), smoothstep(.22, .42, e));`,
  glitch: `float t = floor(u_time * 9.);
    float band = floor(uv.y * 28.);
    float n = hash(vec2(band, t));
    float shift = n > .8 ? (hash(vec2(t, band + 3.)) - .5) * .14 : 0.;
    vec2 uv2 = vec2(uv.x + shift, uv.y);
    float split = .007 + .014 * hash(vec2(t, 1.7));
    vec3 c = vec3(src(uv2 + vec2(split, 0.)).r, src(uv2).g, src(uv2 - vec2(split, .002)).b);
    c *= .9 + .1 * sin(uv.y * u_res.y * 1.4);
    vec2 blk = floor(uv * vec2(18., 13.));
    if (hash(blk + t * .37) > .982) c = vec3(hash(blk + 1.), hash(blk + 2.), hash(blk + 3.)) * vec3(.3, .8, 1.2);
    c = (c - .5) * 1.18 + .5;`,
  blueprint: `float L = smoothstep(.12, .88, luma(src(uv)));
    vec3 dark = vec3(.09, .2, .7); vec3 light = vec3(.93, .96, 1.);
    vec3 c = mix(dark, light, L);
    vec2 px = uv * u_res; float g = max(step(mod(px.x, 36.), 1.2), step(mod(px.y, 36.), 1.2));
    c = mix(c, vec3(1.), g * .14);
    float e = edgeAt(uv, 1.2);
    c = mix(c, light, smoothstep(.18, .4, e) * .7);`,
  bw: `float L = luma(src(uv)); L = smoothstep(.05, .95, L); L = pow(L, 1.15);
    L += (hash(uv * u_res + fract(u_time) * 37.) - .5) * .13;
    float v = length(uv - .5); L *= 1. - v * v * 1.1;
    vec3 c = vec3(L) * vec3(1., .99, .96);`
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
      ctx.filter = { bw: 'grayscale(1) contrast(1.4)', blueprint: 'grayscale(1) sepia(1) hue-rotate(180deg) saturate(3)', dreamy: 'blur(2px) brightness(1.15) saturate(.8)', digicam: 'contrast(1.25) saturate(1.2)', comic: 'contrast(1.8) saturate(1.8)', glitch: 'hue-rotate(40deg) contrast(1.3)', pixel: 'saturate(1.5)', fisheye: 'contrast(1.1)' }[filterId] || 'none';
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
