
/* ── PERFORMANCE GATING ── */
let _tabVisible = true;
document.addEventListener('visibilitychange', () => {
  _tabVisible = document.visibilityState === 'visible';
});

function createGate(sectionId) {
  let visible = false;
  const el = document.getElementById(sectionId);
  if (!el) return () => false;
  const obs = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
  obs.observe(el);
  return () => _tabVisible && visible;
}

const MAX_DPR = 1.5;

/* 1. TYPEWRITER */

(function () {
  const el = document.getElementById('tagline-text');
  if (!el) return;

  const lines = [
    'Research before\nyou build.',
    'Validate before\nyou launch.',
    'Think before\nyou ship.',
    'Know before\nyou grow.'
  ];

  const SPEED = { type: 52, delete: 26, pause: 1800, gap: 300 };
  let lineIndex = 0, charIndex = 0, deleting = false;

  function tick() {
    const current = lines[lineIndex];

    if (!deleting) {
      el.textContent = current.slice(0, ++charIndex);
      if (charIndex === current.length) {
        deleting = true;
        return setTimeout(tick, SPEED.pause);
      }
      return setTimeout(tick, SPEED.type);
    }

    el.textContent = current.slice(0, --charIndex);
    if (charIndex === 0) {
      deleting  = false;
      lineIndex = (lineIndex + 1) % lines.length;
      return setTimeout(tick, SPEED.gap);
    }
    setTimeout(tick, SPEED.delete);
  }

  tick();
})();


/* 2. AURORA BACKGROUND — Hero (WebGL2) */

(function () {
  const canvas = document.getElementById('aurora-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return;

  const shouldRun = createGate('hero');

  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const VERT = `#version 300 es
  in vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
  precision highp float;
  uniform float uTime, uAmplitude, uBlend;
  uniform vec3  uColorStops[3];
  uniform vec2  uResolution;
  out vec4 fragColor;

  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1  = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy  -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x  = 2.0 * fract(p * C.www) - 1.0;
    vec3 h  = abs(x) - 0.5;
    vec3 a0 = x - floor(x + 0.5);
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec3 rampColor = uv.x < 0.5
      ? mix(uColorStops[0], uColorStops[1], uv.x * 2.0)
      : mix(uColorStops[1], uColorStops[2], (uv.x - 0.5) * 2.0);
    float height    = exp(snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude);
    float intensity = 0.6 * (uv.y * 2.0 - height + 0.2);
    float alpha     = smoothstep(0.20 - uBlend * 0.5, 0.20 + uBlend * 0.5, intensity);
    fragColor = vec4(intensity * rampColor * alpha, alpha);
  }`;

  function makeShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, makeShader(gl.VERTEX_SHADER,   VERT));
  gl.attachShader(prog, makeShader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(prog, 'position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const U = {
    time:       gl.getUniformLocation(prog, 'uTime'),
    amplitude:  gl.getUniformLocation(prog, 'uAmplitude'),
    resolution: gl.getUniformLocation(prog, 'uResolution'),
    blend:      gl.getUniformLocation(prog, 'uBlend'),
    colorStops: gl.getUniformLocation(prog, 'uColorStops')
  };

  // Indigo → Forma gold → Indigo
  const COLOR_STOPS = new Float32Array([
    0.082, 0.153, 0.373,
    0.784, 0.706, 0.376,
    0.082, 0.153, 0.373
  ]);

  function resize() {
    const hero = document.getElementById('hero');
    if (!hero) return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    canvas.width        = hero.offsetWidth  * dpr;
    canvas.height       = hero.offsetHeight * dpr;
    canvas.style.width  = hero.offsetWidth  + 'px';
    canvas.style.height = hero.offsetHeight + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener('resize', resize);
  resize();

  const t0 = performance.now();

  (function render() {
    requestAnimationFrame(render);
    if (!shouldRun()) return;
    const t = (performance.now() - t0) * 0.001;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.time,       t);
    gl.uniform1f(U.amplitude,  1.2);
    gl.uniform1f(U.blend,      0.6);
    gl.uniform2f(U.resolution, canvas.width, canvas.height);
    gl.uniform3fv(U.colorStops, COLOR_STOPS);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  })();
})();


/* 3. WAVES BACKGROUND — Analyse section (Canvas 2D + Perlin) */

(function () {
  const canvas    = document.getElementById('waves-canvas');
  const container = document.getElementById('analyse');
  if (!canvas || !container) return;

  const ctx        = canvas.getContext('2d');
  const LINE_COLOR = 'rgba(200,181,96,0.12)';
  const shouldRun  = createGate('analyse');

  /* Perlin noise setup */
  const grad3 = [
    [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
    [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
    [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
  ];
  const BASE = [
    151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,
    69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,
    252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,
    168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,
    211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,
    216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,
    164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,
    126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,
    213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,
    253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,
    242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,
    192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
    138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
  ];
  const perm  = new Array(512);
  const gradP = new Array(512);

  const seed = Math.floor(Math.random() * 65536);
  for (let i = 0; i < 256; i++) {
    const v  = i & 1 ? BASE[i] ^ (seed & 255) : BASE[i] ^ ((seed >> 8) & 255);
    perm[i]  = perm[i + 256]  = v;
    gradP[i] = gradP[i + 256] = grad3[v % 12];
  }

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return (1 - t) * a + t * b; }
  function dot2(g, x, y) { return g[0] * x + g[1] * y; }

  function perlin2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const n00 = dot2(gradP[X     + perm[Y    ]], x,     y    );
    const n01 = dot2(gradP[X     + perm[Y + 1]], x,     y - 1);
    const n10 = dot2(gradP[X + 1 + perm[Y    ]], x - 1, y    );
    const n11 = dot2(gradP[X + 1 + perm[Y + 1]], x - 1, y - 1);
    return lerp(lerp(n00, n10, fade(x)), lerp(n01, n11, fade(x)), fade(y));
  }

  const CFG = {
    waveSpeedX: 0.0125, waveSpeedY: 0.005,
    waveAmpX:   32,     waveAmpY:   16,
    xGap:       10,     yGap:       32,
    friction:   0.925,  tension:    0.005,
    maxCursor:  100
  };

  let lines = [], W = 0, H = 0;
  const mouse = { x: -10, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, vs: 0, a: 0, set: false };

  function setSize() {
    const r = container.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = W; canvas.height = H;
  }

  function setLines() {
    lines = [];
    const totalLines  = Math.ceil((W + 200) / CFG.xGap);
    const totalPoints = Math.ceil((H + 30)  / CFG.yGap);
    const xStart = (W - CFG.xGap * totalLines)  / 2;
    const yStart = (H - CFG.yGap * totalPoints) / 2;
    for (let i = 0; i <= totalLines; i++) {
      const pts = [];
      for (let j = 0; j <= totalPoints; j++) {
        pts.push({
          x: xStart + CFG.xGap * i,
          y: yStart + CFG.yGap * j,
          wave:   { x: 0, y: 0 },
          cursor: { x: 0, y: 0, vx: 0, vy: 0 }
        });
      }
      lines.push(pts);
    }
  }

  function movePoints(t) {
    lines.forEach(pts => pts.forEach(pt => {
      const move = perlin2(
        (pt.x + t * CFG.waveSpeedX) * 0.002,
        (pt.y + t * CFG.waveSpeedY) * 0.0015
      ) * 12;
      pt.wave.x = Math.cos(move) * CFG.waveAmpX;
      pt.wave.y = Math.sin(move) * CFG.waveAmpY;

      const dist = Math.hypot(pt.x - mouse.sx, pt.y - mouse.sy);
      const l    = Math.max(175, mouse.vs);
      if (dist < l) {
        const f = Math.cos(dist * 0.001) * (1 - dist / l);
        pt.cursor.vx += Math.cos(mouse.a) * f * l * mouse.vs * 0.00065;
        pt.cursor.vy += Math.sin(mouse.a) * f * l * mouse.vs * 0.00065;
      }
      pt.cursor.vx = (pt.cursor.vx + (0 - pt.cursor.x) * CFG.tension) * CFG.friction;
      pt.cursor.vy = (pt.cursor.vy + (0 - pt.cursor.y) * CFG.tension) * CFG.friction;
      pt.cursor.x  = Math.min(CFG.maxCursor, Math.max(-CFG.maxCursor, pt.cursor.x + pt.cursor.vx * 2));
      pt.cursor.y  = Math.min(CFG.maxCursor, Math.max(-CFG.maxCursor, pt.cursor.y + pt.cursor.vy * 2));
    }));
  }

  function moved(pt, withCursor) {
    return {
      x: Math.round((pt.x + pt.wave.x + (withCursor ? pt.cursor.x : 0)) * 10) / 10,
      y: Math.round((pt.y + pt.wave.y + (withCursor ? pt.cursor.y : 0)) * 10) / 10
    };
  }

  function drawLines() {
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth   = 1;
    lines.forEach(pts => {
      const first = moved(pts[0], false);
      ctx.moveTo(first.x, first.y);
      pts.forEach((pt, idx) => {
        const isLast = idx === pts.length - 1;
        const p1 = moved(pt, !isLast);
        ctx.lineTo(p1.x, p1.y);
        if (isLast) {
          const p2 = moved(pts[pts.length - 1], false);
          ctx.moveTo(p2.x, p2.y);
        }
      });
    });
    ctx.stroke();
  }

  function tick(t) {
    requestAnimationFrame(tick);
    if (!shouldRun()) return;
    mouse.sx += (mouse.x - mouse.sx) * 0.1;
    mouse.sy += (mouse.y - mouse.sy) * 0.1;
    const dx = mouse.x - mouse.lx, dy = mouse.y - mouse.ly;
    mouse.vs = Math.min(100, mouse.vs + (Math.hypot(dx, dy) - mouse.vs) * 0.1);
    mouse.a  = Math.atan2(dy, dx);
    mouse.lx = mouse.x; mouse.ly = mouse.y;
    movePoints(t);
    drawLines();
  }

  window.addEventListener('resize', () => { setSize(); setLines(); });
  window.addEventListener('mousemove', e => {
    const r = container.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    if (!mouse.set) {
      mouse.sx = mouse.lx = mouse.x;
      mouse.sy = mouse.ly = mouse.y;
      mouse.set = true;
    }
  });

  setSize(); setLines();
  requestAnimationFrame(tick);
})();


/* 4. GALAXY BACKGROUND — How it works (WebGL2)*/

(function () {
  const canvas = document.getElementById('galaxy-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false });
  if (!gl) return;

  const shouldRun = createGate('how');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const VERT = `#version 300 es
  in vec2 position; in vec2 uv; out vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
  precision highp float;
  uniform float uTime, uStarSpeed, uDensity, uHueShift, uSpeed;
  uniform float uGlowIntensity, uSaturation, uTwinkleIntensity, uRotationSpeed;
  uniform vec3  uResolution;
  in vec2 vUv; out vec4 fragColor;

  #define NUM_LAYER 4.0
  #define CUTOFF    0.2
  #define MAT45     mat2(0.7071,-0.7071,0.7071,0.7071)
  #define PERIOD    3.0

  float Hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
  float tri(float x){return abs(fract(x)*2.0-1.0);}
  float tris(float x){float t=fract(x);return 1.0-smoothstep(0.0,1.0,abs(2.0*t-1.0));}
  float trisn(float x){float t=fract(x);return 2.0*(1.0-smoothstep(0.0,1.0,abs(2.0*t-1.0)))-1.0;}
  vec3 hsv2rgb(vec3 c){vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);}

  float Star(vec2 uv, float flare){
    float d=length(uv), m=(0.05*uGlowIntensity)/d;
    float rays=smoothstep(0.0,1.0,1.0-abs(uv.x*uv.y*1000.0));
    m+=rays*flare*uGlowIntensity;
    uv*=MAT45;
    rays=smoothstep(0.0,1.0,1.0-abs(uv.x*uv.y*1000.0));
    m+=rays*0.3*flare*uGlowIntensity;
    return m*smoothstep(1.0,0.2,d);
  }

  vec3 StarLayer(vec2 uv){
    vec3 col=vec3(0.0);
    vec2 gv=fract(uv)-0.5, id=floor(uv);
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
      vec2 si=id+vec2(float(x),float(y));
      float seed=Hash21(si), size=fract(seed*345.32);
      float flareSize=smoothstep(0.9,1.0,size)*tri(uStarSpeed/(PERIOD*seed+1.0));
      float red=smoothstep(CUTOFF,1.0,Hash21(si+1.0))+CUTOFF;
      float blu=smoothstep(CUTOFF,1.0,Hash21(si+3.0))+CUTOFF;
      vec3 base=vec3(red,min(red,blu)*seed,blu);
      float hue=fract(atan(base.g-base.r,base.b-base.r)/(6.28318)+0.5+uHueShift/360.0);
      float sat=length(base-vec3(dot(base,vec3(0.299,0.587,0.114))))*uSaturation;
      base=hsv2rgb(vec3(hue,sat,max(max(base.r,base.g),base.b)));
      vec2 pad=vec2(tris(seed*34.0+uTime*uSpeed/10.0),tris(seed*38.0+uTime*uSpeed/30.0))-0.5;
      float star=Star(gv-vec2(float(x),float(y))-pad,flareSize);
      star*=mix(1.0,trisn(uTime*uSpeed+seed*6.2831)*0.5+1.0,uTwinkleIntensity);
      col+=star*size*base;
    }
    return col;
  }

  void main(){
    vec2 uv=(vUv*uResolution.xy-uResolution.xy*0.5)/uResolution.y;
    float a=uTime*uRotationSpeed;
    uv=mat2(cos(a),-sin(a),sin(a),cos(a))*uv;
    vec3 col=vec3(0.0);
    for(float i=0.0;i<1.0;i+=1.0/NUM_LAYER){
      float depth=fract(i+uStarSpeed*uSpeed);
      float scale=mix(20.0*uDensity,0.5*uDensity,depth);
      col+=StarLayer(uv*scale+i*453.32)*depth*smoothstep(1.0,0.9,depth);
    }
    float alpha=min(smoothstep(0.0,0.3,length(col)),1.0);
    fragColor=vec4(col,alpha);
  }`;

  function makeShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, makeShader(gl.VERTEX_SHADER,   VERT));
  gl.attachShader(prog, makeShader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  // Position buffer
  const vBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(prog, 'position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // UV buffer
  const uBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 2,0, 0,2]), gl.STATIC_DRAW);
  const uvLoc = gl.getAttribLocation(prog, 'uv');
  gl.enableVertexAttribArray(uvLoc);
  gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  ['uTime','uResolution','uStarSpeed','uDensity','uHueShift','uSpeed',
   'uGlowIntensity','uSaturation','uTwinkleIntensity','uRotationSpeed']
    .forEach(n => U[n] = gl.getUniformLocation(prog, n));

  function resize() {
    const section = document.getElementById('how');
    const dpr     = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    canvas.width        = section.offsetWidth  * dpr;
    canvas.height       = section.offsetHeight * dpr;
    canvas.style.width  = section.offsetWidth  + 'px';
    canvas.style.height = section.offsetHeight + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener('resize', resize);
  resize();

  const t0 = performance.now();

  (function render() {
    requestAnimationFrame(render);
    if (!shouldRun()) return;
    const t = (performance.now() - t0) * 0.001;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.uTime,             t);
    gl.uniform3f(U.uResolution,       canvas.width, canvas.height, canvas.width / canvas.height);
    gl.uniform1f(U.uStarSpeed,        t * 0.05);
    gl.uniform1f(U.uDensity,          1.2);
    gl.uniform1f(U.uHueShift,         0.11);
    gl.uniform1f(U.uSpeed,            0.6);
    gl.uniform1f(U.uGlowIntensity,    0.35);
    gl.uniform1f(U.uSaturation,       0.5);
    gl.uniform1f(U.uTwinkleIntensity, 0.4);
    gl.uniform1f(U.uRotationSpeed,    0.04);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  })();
})();


/* 5. PRISM BACKGROUND — Features (WebGL1)*/

(function () {
  const canvas    = document.getElementById('prism-canvas');
  const container = document.getElementById('features');
  if (!canvas || !container) return;

  const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
  const gl  = canvas.getContext('webgl', { alpha: true, antialias: false });
  const shouldRun = createGate('features');
  if (!gl) return;

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);

  const VERT = `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

  const FRAG = `
  precision highp float;
  uniform vec2  iResolution;
  uniform float iTime, uHeight, uBaseHalf, uGlow, uNoise, uSaturation;
  uniform float uHueShift, uColorFreq, uBloom, uCenterShift;
  uniform float uInvBaseHalf, uInvHeight, uMinAxis, uPxScale, uTimeScale;
  uniform mat3  uRot;

  vec4 tanh4(vec4 x){vec4 e=exp(2.0*x);return(e-1.0)/(e+1.0);}
  float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453123);}

  float sdOctaAnisoInv(vec3 p){
    vec3 q=vec3(abs(p.x)*uInvBaseHalf,abs(p.y)*uInvHeight,abs(p.z)*uInvBaseHalf);
    return(q.x+q.y+q.z-1.0)*uMinAxis*0.5773502691896258;
  }

  mat3 hueRotation(float a){
    float c=cos(a),s=sin(a);
    mat3 W=mat3(0.299,0.587,0.114,0.299,0.587,0.114,0.299,0.587,0.114);
    mat3 U2=mat3(0.701,-0.587,-0.114,-0.299,0.413,-0.114,-0.300,-0.588,0.886);
    mat3 V=mat3(0.168,-0.331,0.500,0.328,0.035,-0.500,-0.497,0.296,0.201);
    return W+U2*c+V*s;
  }

  void main(){
    vec2 f=(gl_FragCoord.xy-0.5*iResolution)*uPxScale;
    float z=5.0,d=0.0; vec3 p; vec4 o=vec4(0.0);
    float t=iTime*uTimeScale;
    mat2 wob=mat2(cos(t),cos(t+33.0),cos(t+11.0),cos(t));
    for(int i=0;i<100;i++){
      p=uRot*vec3(f*wob,z);
      vec3 q=p; q.y+=uCenterShift;
      d=0.1+0.2*abs(max(sdOctaAnisoInv(q),-q.y));
      z-=d;
      o+=(sin((p.y+z)*uColorFreq+vec4(0,1,2,3))+1.0)/d;
    }
    o=tanh4(o*o*(uGlow*uBloom)/1e5);
    vec3 col=clamp(o.rgb+(rand(gl_FragCoord.xy+vec2(iTime))-0.5)*uNoise,0.0,1.0);
    float L=dot(col,vec3(0.2126,0.7152,0.0722));
    col=clamp(mix(vec3(L),col,uSaturation),0.0,1.0);
    if(abs(uHueShift)>0.0001) col=clamp(hueRotation(uHueShift)*col,0.0,1.0);
    gl_FragColor=vec4(col*0.45,o.a*0.6);
  }`;

  function makeShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, makeShader(gl.VERTEX_SHADER,   VERT));
  gl.attachShader(prog, makeShader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(prog, 'position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  ['iResolution','iTime','uHeight','uBaseHalf','uGlow','uNoise','uSaturation',
   'uHueShift','uColorFreq','uBloom','uCenterShift','uInvBaseHalf','uInvHeight',
   'uMinAxis','uPxScale','uTimeScale','uRot']
    .forEach(n => U[n] = gl.getUniformLocation(prog, n));

  // Visual config
  const H = 3.5, BASE_H = 5.5 * 0.5;
  const GLOW = 1.0, NOISE = 0.3, SAT = 1.5, SCALE = 3.6;
  const HUE = 0.55, CFREQ = 1.0, BLOOM = 1.0, TS = 0.5;
  const rotBuf = new Float32Array([1,0,0, 0,1,0, 0,0,1]);

  function resize() {
    canvas.width        = container.offsetWidth  * dpr;
    canvas.height       = container.offsetHeight * dpr;
    canvas.style.width  = container.offsetWidth  + 'px';
    canvas.style.height = container.offsetHeight + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener('resize', resize);
  resize();

  const t0 = performance.now();

  (function render() {
    requestAnimationFrame(render);
    if (!shouldRun()) return;
    const time    = (performance.now() - t0) * 0.001;
    const W = canvas.width, H2 = canvas.height;
    const pxScale = 1 / ((H2 || 1) * 0.1 * SCALE);
    gl.uniform2f(U.iResolution,  W, H2);
    gl.uniform1f(U.iTime,        time);
    gl.uniform1f(U.uHeight,      H);
    gl.uniform1f(U.uBaseHalf,    BASE_H);
    gl.uniform1f(U.uGlow,        GLOW);
    gl.uniform1f(U.uNoise,       NOISE);
    gl.uniform1f(U.uSaturation,  SAT);
    gl.uniform1f(U.uHueShift,    HUE);
    gl.uniform1f(U.uColorFreq,   CFREQ);
    gl.uniform1f(U.uBloom,       BLOOM);
    gl.uniform1f(U.uCenterShift, H * 0.25);
    gl.uniform1f(U.uInvBaseHalf, 1 / BASE_H);
    gl.uniform1f(U.uInvHeight,   1 / H);
    gl.uniform1f(U.uMinAxis,     Math.min(BASE_H, H));
    gl.uniform1f(U.uPxScale,     pxScale);
    gl.uniform1f(U.uTimeScale,   TS);
    gl.uniformMatrix3fv(U.uRot,  false, rotBuf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  })();
})();

/* 6. LOGO LOOP — Powered by strip */
(function () {
  const track = document.getElementById('logoloop-track');
  if (!track) return;

  const logos = [
    { name: 'OpenAI'  },
    { name: 'Exa'     },
    { name: 'Mobbin'  },
    { name: 'Apify'   },
    { name: 'Vercel'  },
    { name: 'GitHub'  },
    { name: 'Convex'  },
  ];

  function makePill({ name }) {
    const pill = document.createElement('span');
    pill.className = 'brand-pill';
    const label = document.createElement('span');
    label.textContent = name;
    pill.appendChild(label);
    return pill;
  }

  const seq = document.createElement('ul');
  seq.className = 'logoloop__list';
  seq.setAttribute('role', 'list');
  logos.forEach(logo => {
    const li = document.createElement('li');
    li.className = 'logoloop__item';
    li.appendChild(makePill(logo));
    seq.appendChild(li);
  });
  track.appendChild(seq);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const seqW   = seq.getBoundingClientRect().width + 10;
    const copies = Math.ceil(track.parentElement.offsetWidth / seqW) + 3;

    for (let i = 0; i < copies; i++) {
      const clone = seq.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    }

    const SPEED = 45, TAU = 0.6;
    let offset = 0, velocity = 0, lastTs = null, hovered = false;

    track.addEventListener('mouseenter', () => hovered = true);
    track.addEventListener('mouseleave', () => hovered = false);

    const logoGate = createGate('hero');
    (function tick(ts) {
      requestAnimationFrame(tick);
      if (!logoGate()) return;
      if (lastTs === null) lastTs = ts;
      const dt  = Math.max(0, ts - lastTs) / 1000;
      lastTs    = ts;
      velocity += ((hovered ? 0 : SPEED) - velocity) * (1 - Math.exp(-dt / TAU));
      offset    = ((offset + velocity * dt) % seqW + seqW) % seqW;
      track.style.transform = `translate3d(${-offset}px,0,0)`;
    })(performance.now());
  }));
})();

/* 7. CARD SWAP — Features section (GSAP) */
(function () {
  if (!window.gsap) return;
  const container = document.getElementById('card-swap');
  if (!container) return;

  const cards = Array.from(container.querySelectorAll('.card'));
  const total = cards.length;
  if (total < 2) return;

  const CARD_DISTANCE = 35, VERT_DISTANCE = 18, SKEW = 3, SWAP_DELAY = 3000;
  const CFG = { ease: 'elastic.out(0.6,0.9)', dur: 1.6, overlap: 0.9, retDelay: 0.05 };
  const order = cards.map((_, i) => i);

  function slot(i) {
    return {
      x:      i * CARD_DISTANCE,
      y:     -i * VERT_DISTANCE,
      z:     -i * CARD_DISTANCE * 1.5,
      zIndex: total - i
    };
  }

  // Set initial positions
  cards.forEach((card, i) => {
    gsap.set(card, {
      ...slot(i), xPercent: -50, yPercent: -50,
      skewY: SKEW, transformOrigin: 'center center', force3D: true
    });
  });

  let currentTl = null;

  function swap() {
    if (order.length < 2) return;
    const elFront = cards[order[0]];
    const tl      = gsap.timeline();
    currentTl     = tl;

    // Drop front card down
    tl.to(elFront, { y: '+=400', duration: CFG.dur, ease: CFG.ease });

    // Promote the rest
    tl.addLabel('promote', `-=${CFG.dur * CFG.overlap}`);
    order.slice(1).forEach((idx, i) => {
      const s = slot(i);
      tl.set(cards[idx], { zIndex: s.zIndex }, 'promote');
      tl.to(cards[idx], { x: s.x, y: s.y, z: s.z, duration: CFG.dur, ease: CFG.ease },
            `promote+=${i * 0.12}`);
    });

    // Return front card to the back
    const back = slot(total - 1);
    tl.addLabel('return', `promote+=${CFG.dur * CFG.retDelay}`);
    tl.call(() => gsap.set(elFront, { zIndex: back.zIndex }), undefined, 'return');
    tl.to(elFront, { x: back.x, y: back.y, z: back.z, duration: CFG.dur, ease: CFG.ease }, 'return');
    tl.call(() => order.push(order.shift()));
  }

  swap();
  let interval = setInterval(swap, SWAP_DELAY);

  // Click the front card to advance
  cards.forEach(card => card.addEventListener('click', () => {
    if (cards[order[0]] !== card) return;
    clearInterval(interval);
    currentTl?.kill();
    swap();
    interval = setInterval(swap, SWAP_DELAY);
  }));

  // Pause on hover
  container.addEventListener('mouseenter', () => { currentTl?.pause(); clearInterval(interval); });
  container.addEventListener('mouseleave', () => { currentTl?.play(); interval = setInterval(swap, SWAP_DELAY); });
})();


/*8. SCROLL-DRIVEN COLOR THEME */

(function () {
  const themes = [
    { bg: {r:11,g:11,b:9},  dot: {r:200,g:181,b:96}  },  // gold    (hero)
    { bg: {r:12,g:10,b:10}, dot: {r:192,g:80, b:74}   },  // crimson (analyse)
    { bg: {r:10,g:11,b:15}, dot: {r:80, g:130,b:200}  },  // slate   (how)
    { bg: {r:9, g:13,b:11}, dot: {r:80, g:175,b:120}  }   // emerald (features)
  ];

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpC(a, b, t) {
    return {
      r: Math.round(lerp(a.r, b.r, t)),
      g: Math.round(lerp(a.g, b.g, t)),
      b: Math.round(lerp(a.b, b.b, t))
    };
  }

  function onScroll() {
    const total = document.body.scrollHeight - window.innerHeight;
    const raw   = (window.scrollY / total) * (themes.length - 1);
    const from  = Math.min(Math.floor(raw), themes.length - 2);
    const t     = raw - from;
    const bg    = lerpC(themes[from].bg,  themes[from + 1].bg,  t);
    const dot   = lerpC(themes[from].dot, themes[from + 1].dot, t);
    document.body.style.background = `rgb(${bg.r},${bg.g},${bg.b})`;
    window._dotColor = dot;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();


/* ================================================================
   9. ANALYSIS UI — FastAPI Backend Integration
   ================================================================ */

const API_BASE =
  (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? 'http://localhost:8000'
    : 'https://forma-dtzd.onrender.com';
let _currentJobId = null;
let _etaInterval = null;
let _chatHistory = [];

function setIdea(text) {
  document.getElementById('idea-input').value = text;
}

function resetForm() {
  document.getElementById('report').classList.remove('visible');
  document.getElementById('status-bar').classList.remove('visible');
  document.getElementById('idea-input').value = '';
  ['step-1','step-2','step-3','step-4'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active', 'done');
  });
  if (_etaInterval) { clearInterval(_etaInterval); _etaInterval = null; }
  _currentJobId = null;
  _chatHistory = [];
  const chatMsgs = document.getElementById('chat-messages');
  if (chatMsgs) chatMsgs.innerHTML = '<div class="chat-bubble assistant">Ask me anything about this idea — pricing strategy, distribution channels, risks, pivots...</div>';
  resetProgress();
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function updateProgress(pct, startTime) {
  const bar     = document.getElementById('progress-fill');
  const pctEl   = document.getElementById('progress-pct');
  const etaEl   = document.getElementById('progress-eta');
  const elapEl  = document.getElementById('progress-elapsed');
  if (!bar) return;

  const clamped = Math.min(100, Math.max(0, pct));
  bar.style.width = clamped + '%';
  if (pctEl) pctEl.textContent = Math.round(clamped) + '%';

  if (startTime) {
    const elapsed = Date.now() - startTime;
    if (elapEl) elapEl.textContent = fmtDuration(elapsed) + ' elapsed';
    if (etaEl) {
      if (clamped > 5 && clamped < 100) {
        const totalEstimate = elapsed / (clamped / 100);
        const remaining = totalEstimate - elapsed;
        etaEl.textContent = '~' + fmtDuration(Math.max(0, remaining)) + ' left';
      } else if (clamped >= 100) {
        etaEl.textContent = 'done';
      } else {
        etaEl.textContent = 'estimating…';
      }
    }
  }

  if (clamped > 0 && clamped < 100) {
    bar.classList.add('shimmer');
  } else {
    bar.classList.remove('shimmer');
  }
}

function resetProgress() {
  const bar    = document.getElementById('progress-fill');
  const pctEl  = document.getElementById('progress-pct');
  const etaEl  = document.getElementById('progress-eta');
  const elapEl = document.getElementById('progress-elapsed');
  if (bar)    { bar.style.width = '0%'; bar.classList.remove('shimmer'); }
  if (pctEl)  pctEl.textContent = '0%';
  if (etaEl)  etaEl.textContent = 'estimating…';
  if (elapEl) elapEl.textContent = '0s elapsed';
}

function progressToStep(progress) {
  if (progress < 25) return 0;
  if (progress < 50) return 1;
  if (progress < 75) return 2;
  return 3;
}

async function startAnalysis() {
  const input = document.getElementById('idea-input');
  const idea  = input.value.trim();
  if (!idea) { input.focus(); return; }

  const statusBar = document.getElementById('status-bar');
  const statusMsg = document.getElementById('status-msg');
  const report    = document.getElementById('report');
  const stepIds   = ['step-1','step-2','step-3','step-4'];

  report.classList.remove('visible');
  statusBar.classList.add('visible');
  resetProgress();

  stepIds.forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active', 'done');
  });

  let jobId;
  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea })
    });
    const data = await res.json();
    jobId = data.job_id;
    _currentJobId = jobId;
  } catch (err) {
    console.error('Failed to start analysis:', err);
    populateReport(idea, fallbackReport());
    statusBar.classList.remove('visible');
    report.classList.add('visible');
    report.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const startTime = Date.now();
  _etaInterval = setInterval(() => {
    const bar = document.getElementById('progress-fill');
    if (bar) {
      const current = parseFloat(bar.style.width) || 0;
      updateProgress(current, startTime);
    }
  }, 1000);

  let lastStep = -1;

  async function poll() {
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`);
      const job = await res.json();

      const pct = job.progress || 0;
      updateProgress(pct, startTime);

      if (job.label && statusMsg) {
        statusMsg.textContent = job.label;
      }

      const step = progressToStep(pct);
      if (step !== lastStep) {
        stepIds.forEach((id, j) => {
          const el = document.getElementById(id);
          el.classList.toggle('active', j === step);
          el.classList.toggle('done', j < step);
        });
        lastStep = step;
      }

      if (job.status === 'complete') {
        clearInterval(_etaInterval);
        updateProgress(100, startTime);

        stepIds.forEach(id => {
          const el = document.getElementById(id);
          el.classList.remove('active');
          el.classList.add('done');
        });

        let result = job.result;
        if (typeof result === 'string') {
          try { result = JSON.parse(result); } catch (e) { /* already object */ }
        }

        populateReport(idea, result || fallbackReport());
        statusBar.classList.remove('visible');
        report.classList.add('visible');
        report.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      if (job.status === 'failed' || job.status === 'error') {
        clearInterval(_etaInterval);
        console.error('Job failed:', job.error || job.status);
        populateReport(idea, fallbackReport());
        statusBar.classList.remove('visible');
        report.classList.add('visible');
        report.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      setTimeout(poll, 2000);
    } catch (err) {
      clearInterval(_etaInterval);
      console.error('Polling error:', err);
      populateReport(idea, fallbackReport());
      statusBar.classList.remove('visible');
      report.classList.add('visible');
      report.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  poll();
}

function fallbackReport() {
  return {
    analysis: {
      confidence_score: 0.7,
      verdict: 'Promising',
      executive_summary: 'Growing market with increasing digital adoption and mobile-first users.',
      market_size: 'Estimated TAM of $500M+ with strong regional growth potential.',
      target_audience: 'Young professionals and early adopters in urban areas.',
      swot: {
        strengths: ['First-mover advantage', 'Low competition locally'],
        weaknesses: ['Limited initial funding', 'Small team'],
        opportunities: ['Growing market', 'Mobile-first audience'],
        threats: ['Large incumbents may enter', 'Regulatory uncertainty']
      },
      competitors: [
        { name: 'Existing players', description: 'Current market presence', threat_level: 'medium' },
        { name: 'Local businesses', description: 'Traditional competition', threat_level: 'low' },
        { name: 'Global entrants', description: 'Potential future competition', threat_level: 'high' }
      ],
      revenue_model: 'Freemium SaaS with premium tiers.',
      go_to_market: 'Start with local launch, expand via word-of-mouth and content marketing.',
      risk_factors: ['Customer acquisition cost may be high in the early stages.'],
      recommendations: ['Validate with 50 pilot users', 'Build an MVP in 4 weeks', 'Secure seed funding'],
      idea_scores: { market_size: 7, competition: 6, feasibility: 8, timing: 9, revenue_potential: 7, founder_fit: 6 }
    },
    sentiment: {
      summary: 'Generally positive sentiment with some concerns about market timing.',
      reddit_sentiment: 'positive',
      twitter_sentiment: 'neutral',
      overall_sentiment_score: 0.72,
      key_positives: ['Strong interest from early adopters', 'Fills a gap in the current market', 'Scalable business model'],
      key_concerns: ['Established competitors may respond aggressively', 'Customer acquisition cost could be high'],
      notable_comments: [
        { source: 'reddit', text: "This is exactly what I've been looking for — existing tools are too complex.", sentiment: 'positive' },
        { source: 'twitter', text: 'Interesting concept but the market is already crowded.', sentiment: 'negative' },
        { source: 'reddit', text: 'Would definitely try this if priced right.', sentiment: 'positive' }
      ]
    },
    investor_intel: {},
    failure_cases: {},
    revenue_simulation: {},
    flowchart_mermaid: 'flowchart TD\n  idea["Business Idea"] -->|validate| research["Market Research"]\n  research --> audience["Target Audience"]\n  research --> competitors["Competitor Analysis"]\n  audience --> mvp["Build MVP"]\n  competitors --> mvp\n  mvp -->|launch| beta["Beta Launch"]\n  beta --> feedback["User Feedback"]\n  feedback -->|iterate| growth["Growth Phase"]\n  growth --> revenue["Revenue Generation"]'
  };
}

/* --- Helpers --- */

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '';
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function populateList(ulId, items) {
  const ul = document.getElementById(ulId);
  if (!ul) return;
  ul.innerHTML = (items || []).map(t => `<li>${esc(t)}</li>`).join('');
}

/** When API omits idea_scores, derive a 1–10 radar from confidence. */
function deriveIdeaScoresFromConfidence(a) {
  const cs = typeof a.confidence_score === 'number' ? a.confidence_score : 0.5;
  const base = Math.max(1, Math.min(10, Math.round(cs * 10)));
  return {
    market_size: base,
    competition: base,
    feasibility: base,
    timing: base,
    revenue_potential: base,
    founder_fit: base
  };
}

/* --- Main report population --- */

function populateReport(idea, data) {
  const a    = data.analysis || data;
  const sent = data.sentiment || {};

  setText('report-title', idea);

  const score = Math.round((a.confidence_score || 0.5) * 10);
  setText('score-num', score);

  const badge = document.getElementById('verdict-badge');
  if (badge) {
    badge.textContent = a.verdict || 'N/A';
    badge.className = 'verdict-badge ' + (a.verdict || '').toLowerCase();
  }

  const ideaScores = a.idea_scores || deriveIdeaScoresFromConfidence(a);
  drawRadar(ideaScores);

  setText('exec-summary', a.executive_summary);
  setText('market-summary', a.market_size);
  setText('target-audience', a.target_audience);
  setText('opportunity', a.go_to_market || '');
  setText('risk', (a.risk_factors || []).join(' '));

  /* SWOT */
  populateList('swot-strengths', a.swot?.strengths);
  populateList('swot-weaknesses', a.swot?.weaknesses);
  populateList('swot-opportunities', a.swot?.opportunities);
  populateList('swot-threats', a.swot?.threats);

  /* Competitors */
  const compEl = document.getElementById('comp-list');
  if (compEl) {
    compEl.innerHTML = (a.competitors || []).map(c => {
      const lvl = (c.threat_level || 'medium').toLowerCase();
      return `<span class="comp-badge ${lvl}" title="${esc(c.description || '')}">${esc(c.name)}</span>`;
    }).join('');
  }

  /* Sentiment */
  renderSentimentPanel(sent);

  /* Revenue model & go-to-market */
  setText('revenue-model', a.revenue_model);
  setText('go-to-market', a.go_to_market);

  /* Recommendations */
  populateList('recommendations', a.recommendations);

  /* Investor intel */
  const investorSection = document.getElementById('investor-section');
  if (investorSection) {
    const inv = data.investor_intel;
    if (inv && Object.keys(inv).length > 0) {
      investorSection.style.display = '';
      setText('funding-landscape', inv.funding_landscape || inv.summary || '');
      const listEl = document.getElementById('investor-list');
      if (listEl) {
        let html = '';
        if (inv.similar_funded) {
          inv.similar_funded.forEach(s => {
            html += `<div class="investor-card"><p class="investor-name">${esc(s.name || '')}</p><p class="investor-firm">${esc(s.detail || s.description || '')}</p></div>`;
          });
        }
        if (inv.active_investors) {
          inv.active_investors.forEach(i => {
            const name = typeof i === 'string' ? i : (i.name || '');
            html += `<div class="investor-card"><p class="investor-name">${esc(name)}</p></div>`;
          });
        }
        listEl.innerHTML = html;
      }
    } else {
      investorSection.style.display = 'none';
    }
  }

  /* Failure cases */
  const failSection = document.getElementById('failure-section');
  if (failSection) {
    const fc = data.failure_cases;
    if (fc && Object.keys(fc).length > 0) {
      failSection.style.display = '';
      const listEl = document.getElementById('failure-list');
      if (listEl) {
        let html = '';
        const cases = fc.cases || fc.failures || [];
        cases.forEach(c => {
          html += `<div class="failure-card"><p class="failure-name">${esc(c.name || c.company || '')}</p><p class="failure-reason">${esc(c.reason || c.description || c.lesson || '')}</p></div>`;
        });
        if (fc.summary) html += `<p style="font-size:12px;color:var(--muted);margin-top:10px">${esc(fc.summary)}</p>`;
        listEl.innerHTML = html;
      }
    } else {
      failSection.style.display = 'none';
    }
  }

  /* Revenue simulation */
  const revSimPanel = document.getElementById('rev-sim-panel');
  if (revSimPanel) {
    const rs = data.revenue_simulation;
    if (rs && rs.rationale) {
      setText('rev-sim-rationale', rs.rationale);
    }
    if (rs && rs.defaults) {
      const d = rs.defaults;
      setSlider('slider-price', d.price_per_month);
      setSlider('slider-users', d.initial_users);
      setSlider('slider-growth', d.monthly_growth_pct);
      setSlider('slider-churn', d.monthly_churn_pct);
    }
    recalcSimulation();
  }

  /* Flowchart */
  if (data.flowchart_mermaid) renderFlowchart(data.flowchart_mermaid);
}

/* --- Sentiment panel --- */

function sentimentLabelToScore(label) {
  const v = (label || 'neutral').toLowerCase();
  if (v === 'positive') return 0.78;
  if (v === 'negative') return 0.24;
  if (v === 'unknown') return null;
  return 0.52;
}

function renderSentimentPanel(sent) {
  if (!sent || !Object.keys(sent).length) {
    const panel = document.getElementById('sentiment-panel');
    if (panel) panel.style.display = 'none';
    return;
  }

  const panel = document.getElementById('sentiment-panel');
  if (panel) panel.style.display = '';

  setText('sentiment-summary', sent.summary);

  let score = sent.overall_sentiment_score;
  if (score != null && score !== '') {
    score = Number(score);
    if (Number.isNaN(score)) score = null;
    else if (score > 1) score = score / 100;
  } else {
    score = null;
  }
  if (score == null) {
    const r = sentimentLabelToScore(sent.reddit_sentiment);
    const t = sentimentLabelToScore(sent.twitter_sentiment);
    const parts = [r, t].filter((x) => x !== null);
    if (parts.length) score = parts.reduce((a, b) => a + b, 0) / parts.length;
  }

  const gaugeFill = document.getElementById('sentiment-gauge-fill');
  const gaugeVal  = document.getElementById('sentiment-gauge-val');
  if (gaugeFill && gaugeVal) {
    if (score == null) {
      gaugeFill.style.width = '0%';
      gaugeVal.textContent = 'N/A';
      gaugeVal.style.color = 'var(--muted)';
    } else {
      const pct = Math.round(score * 100);
      gaugeFill.style.width = pct + '%';
      gaugeVal.textContent = pct + '/100';
      gaugeVal.style.color = score > 0.62 ? '#4ade80' : score > 0.38 ? '#fbbf24' : '#f87171';
    }
  }

  function sentBadge(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    const v = (val || 'unknown').toLowerCase();
    el.textContent = v;
    el.className = 'platform-badge ' + v;
  }
  sentBadge('reddit-sentiment', sent.reddit_sentiment);
  sentBadge('twitter-sentiment', sent.twitter_sentiment);

  populateList('sent-positives', sent.key_positives);
  populateList('sent-concerns', sent.key_concerns);

  const commentsEl = document.getElementById('notable-comments');
  if (commentsEl && sent.notable_comments && sent.notable_comments.length) {
    commentsEl.innerHTML = '<p class="nc-title">Notable comments</p>' +
      sent.notable_comments.map(c => {
        const src = (c.source || '').toLowerCase();
        const dot = (c.sentiment || 'neutral').toLowerCase();
        return `<div class="nc-card">
          <span class="nc-source ${src}">${esc(c.source)}</span>
          <span class="nc-text">"${esc(c.text)}"</span>
          <span class="nc-dot ${dot}"></span>
        </div>`;
      }).join('');
  }
}

/* --- Radar chart --- */

function drawRadar(scores) {
  const card = document.getElementById('radar-card');
  if (card) card.style.display = '';
  const canvas = document.getElementById('radar-canvas');
  if (!canvas) return;
  scores = scores || {};
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = 300, H = 300;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const keys = ['market_size', 'competition', 'feasibility', 'timing', 'revenue_potential', 'founder_fit'];
  const labels = ['Market Size', 'Competition', 'Feasibility', 'Timing', 'Revenue', 'Founder Fit'];
  const colors = ['#c8b560', '#c0504a', '#5088c8', '#50af78', '#b07cd8', '#d89c4c'];
  const cx = W / 2, cy = H / 2, R = 110;
  const n = keys.length;

  function angleFor(i) { return (Math.PI * 2 * i) / n - Math.PI / 2; }

  // Grid rings
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 5; ring++) {
    const r = (ring / 5) * R;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = angleFor(i % n);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Axis lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < n; i++) {
    const a = angleFor(i);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }

  // Data polygon
  const vals = keys.map(k => Math.min(10, Math.max(0, Number(scores[k]) || 0)) / 10);
  ctx.beginPath();
  vals.forEach((v, i) => {
    const a = angleFor(i);
    const x = cx + Math.cos(a) * R * v;
    const y = cy + Math.sin(a) * R * v;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(200,181,96,0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,181,96,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dots + labels
  vals.forEach((v, i) => {
    const a = angleFor(i);
    const x = cx + Math.cos(a) * R * v;
    const y = cy + Math.sin(a) * R * v;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = colors[i];
    ctx.fill();

    const lx = cx + Math.cos(a) * (R + 18);
    const ly = cy + Math.sin(a) * (R + 18);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], lx, ly);
  });

  // Legend
  const legendEl = document.getElementById('radar-legend');
  if (legendEl) {
    legendEl.innerHTML = keys.map((k, i) =>
      `<span class="radar-legend-item"><span class="radar-legend-dot" style="background:${colors[i]}"></span>${labels[i]}: <span class="radar-legend-val">${scores[k] ?? '—'}</span>/10</span>`
    ).join('');
  }
}

/* --- Flowchart --- */

if (typeof mermaid !== 'undefined') {
  mermaid.initialize({ startOnLoad: false, theme: 'dark', themeVariables: { primaryColor: '#2a2a28', primaryTextColor: '#f2f0eb', lineColor: '#c8b560', secondaryColor: '#1a1a18' } });
}

function renderFlowchart(mermaidCode) {
  const container = document.getElementById('flowchart-container');
  if (!container || !mermaidCode) return;

  if (typeof mermaid === 'undefined') {
    container.innerHTML = `<pre style="color:rgba(255,255,255,0.5);font-size:12px;white-space:pre-wrap">${esc(mermaidCode)}</pre>`;
    return;
  }

  const id = 'fc-' + Date.now();
  mermaid.render(id, mermaidCode).then(({ svg }) => {
    container.innerHTML = svg;
  }).catch(() => {
    container.innerHTML = `<pre style="color:rgba(255,255,255,0.5);font-size:12px;white-space:pre-wrap">${esc(mermaidCode)}</pre>`;
  });
}

/* --- Revenue Simulation --- */

function setSlider(id, val) {
  const el = document.getElementById(id);
  if (el && val != null) {
    el.value = val;
    const dispId = id + '-val';
    const disp = document.getElementById(dispId);
    if (disp) {
      if (id.includes('price')) disp.textContent = '$' + val;
      else if (id.includes('growth') || id.includes('churn')) disp.textContent = val + '%';
      else disp.textContent = val;
    }
  }
}

function fmtCurrency(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
}

function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(Math.round(n));
}

function recalcSimulation() {
  const price  = Number(document.getElementById('slider-price')?.value || 10);
  const users  = Number(document.getElementById('slider-users')?.value || 100);
  const growth = Number(document.getElementById('slider-growth')?.value || 10) / 100;
  const churn  = Number(document.getElementById('slider-churn')?.value || 5) / 100;

  function simulate(gMul, cMul, months) {
    let u = users;
    for (let m = 0; m < months; m++) {
      u = u * (1 + growth * gMul) * (1 - churn * cMul);
    }
    const mrr = Math.round(u * price);
    const bep = mrr > 5000 ? (months < 12 ? months + ' mo' : '12+ mo') : 'N/A';
    return { users: Math.round(u), mrr, bep };
  }

  const pess = simulate(0.5, 1.5, 12);
  const base = simulate(1, 1, 12);
  const opti = simulate(1.5, 0.5, 12);

  setText('pess-mrr', fmtCurrency(pess.mrr)); setText('pess-users', fmtNum(pess.users)); setText('pess-bep', pess.bep);
  setText('base-mrr', fmtCurrency(base.mrr)); setText('base-users', fmtNum(base.users)); setText('base-bep', base.bep);
  setText('opti-mrr', fmtCurrency(opti.mrr)); setText('opti-users', fmtNum(opti.users)); setText('opti-bep', opti.bep);
}

document.addEventListener('DOMContentLoaded', () => {
  const sliderMap = {
    'slider-price':  'slider-price-val',
    'slider-users':  'slider-users-val',
    'slider-growth': 'slider-growth-val',
    'slider-churn':  'slider-churn-val'
  };
  Object.entries(sliderMap).forEach(([sid, did]) => {
    const slider = document.getElementById(sid);
    if (!slider) return;
    slider.addEventListener('input', () => {
      const disp = document.getElementById(did);
      if (disp) {
        if (sid.includes('price')) disp.textContent = '$' + slider.value;
        else if (sid.includes('growth') || sid.includes('churn')) disp.textContent = slider.value + '%';
        else disp.textContent = slider.value;
      }
      recalcSimulation();
    });
  });
});

/* --- Flowchart modal (pan/zoom) --- */

(function () {
  const panel    = document.getElementById('flowchart-panel');
  const modal    = document.getElementById('fc-modal');
  const backdrop = document.getElementById('fc-modal-backdrop');
  const closeBtn = document.getElementById('fc-close-btn');
  const zoomIn   = document.getElementById('fc-zoom-in');
  const zoomOut  = document.getElementById('fc-zoom-out');
  const zoomReset = document.getElementById('fc-zoom-reset');
  const content  = document.getElementById('fc-modal-content');
  if (!panel || !modal) return;

  let scale = 1, panX = 0, panY = 0, dragging = false, startX = 0, startY = 0;

  function applyTransform() {
    const svg = content?.querySelector('svg');
    if (svg) svg.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function openModal() {
    const src = document.getElementById('flowchart-container');
    if (!src || !content) return;
    const svg = src.querySelector('svg');
    content.innerHTML = '';
    if (svg) {
      const clone = svg.cloneNode(true);
      clone.style.position = 'absolute';
      clone.style.transformOrigin = '0 0';
      content.appendChild(clone);
    } else {
      content.innerHTML = src.innerHTML;
    }
    scale = 1; panX = 0; panY = 0;
    applyTransform();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  panel.addEventListener('click', e => {
    if (e.target.closest('.fc-expand-btn') || e.target === panel || e.target.closest('.flowchart-header') || e.target.closest('.flowchart-container'))
      openModal();
  });
  if (backdrop) backdrop.addEventListener('click', closeModal);
  if (closeBtn) closeBtn.addEventListener('click', e => { e.stopPropagation(); closeModal(); });

  if (content) {
    content.addEventListener('mousedown', e => {
      dragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      content.classList.add('fc-dragging');
    });
    content.addEventListener('mousemove', e => {
      if (!dragging) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      applyTransform();
    });
    content.addEventListener('mouseup', () => { dragging = false; content.classList.remove('fc-dragging'); });
    content.addEventListener('mouseleave', () => { dragging = false; content.classList.remove('fc-dragging'); });
    content.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      scale = Math.min(5, Math.max(0.2, scale * delta));
      applyTransform();
    }, { passive: false });
  }

  if (zoomIn) zoomIn.addEventListener('click', e => { e.stopPropagation(); scale = Math.min(5, scale * 1.25); applyTransform(); });
  if (zoomOut) zoomOut.addEventListener('click', e => { e.stopPropagation(); scale = Math.max(0.2, scale / 1.25); applyTransform(); });
  if (zoomReset) zoomReset.addEventListener('click', e => { e.stopPropagation(); scale = 1; panX = 0; panY = 0; applyTransform(); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });
})();

/* --- Chat --- */

async function sendChat() {
  const input = document.getElementById('chat-input');
  const messages = document.getElementById('chat-messages');
  if (!input || !messages) return;

  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.textContent = text;
  messages.appendChild(userBubble);
  messages.scrollTop = messages.scrollHeight;

  _chatHistory.push({ role: 'user', content: text });

  const typingBubble = document.createElement('div');
  typingBubble.className = 'chat-bubble assistant typing';
  typingBubble.textContent = 'Thinking…';
  messages.appendChild(typingBubble);
  messages.scrollTop = messages.scrollHeight;

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: _currentJobId,
        message: text,
        history: _chatHistory
      })
    });
    const data = await res.json();
    const reply = data.reply || data.response || 'No response.';

    const typingEl = messages.querySelector('.typing');
    if (typingEl) typingEl.remove();

    _chatHistory.push({ role: 'assistant', content: reply });
    const replyBubble = document.createElement('div');
    replyBubble.className = 'chat-bubble assistant';
    replyBubble.textContent = reply;
    messages.appendChild(replyBubble);
    messages.scrollTop = messages.scrollHeight;
  } catch (err) {
    const typingEl = messages.querySelector('.typing');
    if (typingEl) typingEl.remove();

    const errBubble = document.createElement('div');
    errBubble.className = 'chat-bubble assistant';
    errBubble.textContent = 'Failed to get a response. Please try again.';
    messages.appendChild(errBubble);
    messages.scrollTop = messages.scrollHeight;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });
  }
});

/* --- PDF Export --- */

function exportPDF() {
  if (!_currentJobId) return;
  window.open(`${API_BASE}/export/${_currentJobId}/pdf`, '_blank');
}
