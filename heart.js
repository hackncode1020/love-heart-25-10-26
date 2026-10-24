/* Particle Heart — made by @hack.n.code
   A beating 3D heart built from thousands of glowing particles.
   Tap → it explodes into "I LOVE YOU". Type a name → it forms inside the heart. */
(() => {
'use strict';
const Q = new URLSearchParams(location.search);
const CAP = Q.has('capture');
let seed = 20261025;
const rand = CAP ? () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; } : Math.random;
if (CAP) document.body.classList.add('cap');

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);
const mobile = matchMedia('(pointer:coarse)').matches || innerWidth < 700;
const N = CAP ? 3600 : (mobile ? 2600 : 4200);
const BEAT = 0.6;                       // seconds per heartbeat (100 bpm — a racing heart)
let W, H, DPR, S, CX, CY, R;
let mode = 'heart', name = '', backTimer = 0, flash = 0, time = 0, dragRot = 0, dragVel = 0, freeT = 0, springRamp = 1;
const rings = [], minis = [];

/* ---------- 3D heart surface: (x²+9/4y²+z²−1)³ − x²z³ − 9/80·y²z³ = 0 ---------- */
const F = (x, y, z) => { const a = x*x + 2.25*y*y + z*z - 1; return a*a*a - x*x*z*z*z - 0.1125*y*y*z*z*z; };
const HP = new Float32Array(N * 3);
(function buildHeart() {
  let minZ = 9, maxZ = -9, maxX = 0;
  for (let i = 0; i < N; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u*u);
    const dx = s * Math.cos(th), dy = s * Math.sin(th), dz = u;
    let lo = 0, hi = 0.02;
    while (F(dx*hi, dy*hi, dz*hi) < 0 && hi < 2) { lo = hi; hi += 0.02; }
    for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; F(dx*m, dy*m, dz*m) < 0 ? lo = m : hi = m; }
    let r = lo; if (rand() < 0.07) r *= 0.4 + rand() * 0.5;          // a little inner glow
    const x = dx*r, y = dy*r, z = dz*r;
    HP[i*3] = x; HP[i*3+1] = y; HP[i*3+2] = z;
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); maxX = Math.max(maxX, Math.abs(x));
  }
  const zc = (minZ + maxZ) / 2;
  for (let i = 0; i < N; i++) { HP[i*3] /= maxX; HP[i*3+1] /= maxX; HP[i*3+2] = (HP[i*3+2] - zc) / maxX; }
})();

/* ---------- 2D heart outline (for the name mode) ---------- */
const OL = new Float32Array(N * 2);
(function buildOutline() {
  const M = 2000, pts = [], cum = [0];
  for (let i = 0; i <= M; i++) { const t = i / M * Math.PI * 2;
    pts.push([16*Math.sin(t)**3, -(13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t))]); }
  for (let i = 1; i <= M; i++) cum.push(cum[i-1] + Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]));
  const L = cum[M]; let j = 0;
  for (let i = 0; i < N; i++) {
    const s = rand() * L; j = 0; let a = 0, b = M;
    while (b - a > 1) { const m = (a + b) >> 1; cum[m] < s ? a = m : b = m; }
    const p = pts[a], q = pts[b], nx = -(q[1]-p[1]), ny = q[0]-p[0], nl = Math.hypot(nx, ny) || 1;
    const g = (rand() + rand() + rand() - 1.5) * 0.55;                  // soft band
    OL[i*2] = (p[0] + nx/nl*g) / 16; OL[i*2+1] = (p[1] + 2.5 + ny/nl*g) / 16;
  }
})();

/* ---------- particles ---------- */
const P = [];
const order = [...Array(N).keys()];
for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
const rank = new Int32Array(N); order.forEach((p, k) => rank[p] = k);
for (let i = 0; i < N; i++) P.push({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, tz: 0, ti: -1,
  sz: 0.55 + rand() * 0.95, c: rand() < 0.16 ? 3 : Math.floor(rand() * 3), ph: rand() * 6.283, tw: 1.5 + rand() * 3 });

/* sprites: a soft glowing dot per colour, and a little heart */
const COLS = [[255, 40, 90], [255, 85, 140], [255, 20, 60], [255, 210, 230]];
const SPR = COLS.map(([r, g, b]) => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,245,250,1)'); gr.addColorStop(0.12, `rgba(${r},${g},${b},0.95)`);
  gr.addColorStop(0.35, `rgba(${r},${g},${b},0.28)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return c; });
const HEART_SPR = (() => { const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
  x.translate(48, 52); x.shadowColor = 'rgba(255,60,120,1)'; x.shadowBlur = 18; x.fillStyle = '#ff5c93';
  x.beginPath(); for (let i = 0; i <= 80; i++) { const t = i / 80 * Math.PI * 2;
    const px = 16*Math.sin(t)**3, py = -(13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t));
    i ? x.lineTo(px*1.9, py*1.9) : x.moveTo(px*1.9, py*1.9); } x.fill(); return c; })();
let BG;

function resize() {
  DPR = Math.min(devicePixelRatio || 1, CAP ? 2 : (mobile ? 2 : 1.75));
  W = cv.width = Math.round(innerWidth * DPR); H = cv.height = Math.round(innerHeight * DPR);
  S = Math.min(W, H); CX = W / 2; CY = H * 0.47; R = Math.min(W * 0.4, H * 0.24);
  BG = document.createElement('canvas'); BG.width = W; BG.height = H; const b = BG.getContext('2d');
  const g = b.createRadialGradient(CX, CY, 0, CX, CY, Math.hypot(W, H) * 0.6);
  g.addColorStop(0, '#3a0a1f'); g.addColorStop(0.35, '#1c0510'); g.addColorStop(1, '#060105');
  b.fillStyle = g; b.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) { const x = rand() * W, y = rand() * H, r = S * (0.004 + rand() * 0.03);
    const gg = b.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, `rgba(255,${80 + rand()*90|0},${130 + rand()*60|0},${0.03 + rand()*0.08})`);
    gg.addColorStop(1, 'rgba(255,80,140,0)'); b.fillStyle = gg; b.beginPath(); b.arc(x, y, r, 0, 7); b.fill(); }
  ctx.drawImage(BG, 0, 0);
  textCache = {}; if (name) namePts = textPoints([name], true);
  lovePts = textPoints(W < H * 0.8 ? ['I LOVE', 'YOU'] : ['I LOVE YOU'], false);
}

/* sample glowing points out of rendered text */
let textCache = {}, lovePts = [], namePts = [];
function textPoints(lines, inHeart) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const maxW = inHeart ? R * 1.18 : W * 0.86, maxH = inHeart ? R * 0.52 : H * 0.17;
  let fs = maxH; x.font = `900 ${fs}px Poppins, sans-serif`;
  const widest = Math.max(...lines.map(l => x.measureText(l).width));
  if (widest > maxW) fs *= maxW / widest;
  x.font = `900 ${fs}px Poppins, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  const lh = fs * 1.02, cy = inHeart ? CY - R * 0.12 : CY;
  lines.forEach((l, i) => x.fillText(l, CX, cy + (i - (lines.length - 1) / 2) * lh));
  const d = x.getImageData(0, 0, W, H).data, pts = [], step = Math.max(2, Math.round(fs / 34));
  for (let yy = 0; yy < H; yy += step) for (let xx = 0; xx < W; xx += step)
    if (d[(yy * W + xx) * 4 + 3] > 140) pts.push([xx, yy]);
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  pts.jit = step * 0.45; return pts;
}

/* heartbeat: lub-dub */
function pulse(t) { const p = ((t % BEAT) + BEAT) % BEAT / BEAT;
  const g = (c, w) => { const d = p - c; return Math.exp(-(d*d) / (w*w)); };
  return g(0.04, 0.06) + 0.62 * g(0.30, 0.06); }

/* assign every particle a target for the current mode */
const NAME_SHARE = 0.46;
function targets(t) {
  const pu = pulse(t), sc = 1 + 0.075 * pu;
  const rot = 0.5 * Math.sin(t * 0.42) + dragRot, cr = Math.cos(rot), sr = Math.sin(rot);
  const tilt = 0.18, ct = Math.cos(tilt), st = Math.sin(tilt);
  const nK = Math.floor(N * NAME_SHARE);
  for (let i = 0; i < N; i++) {
    const p = P[i];
    if (mode === 'love') {
      const q = lovePts[rank[i] % lovePts.length], j = lovePts.jit, ts = 1 + 0.025 * pu;
      p.tx = CX + (q[0] + (p.ph - 3.14) * j * 0.3 - CX) * ts; p.ty = CY + (q[1] + (p.tw - 3) * j * 0.3 - CY) * ts; p.tz = 0.85; continue;
    }
    if (mode === 'name' && rank[i] < nK && namePts.length) {
      const q = namePts[rank[i] % namePts.length], j = namePts.jit, ts = 1 + 0.03 * pu;
      p.tx = CX + (q[0] + (p.ph - 3.14) * j * 0.3 - CX) * ts; p.ty = CY + (q[1] + (p.tw - 3) * j * 0.3 - CY) * ts; p.tz = 1; p.ti = 1; continue;
    }
    p.ti = 0;
    if (mode === 'name') {                       // glowing outline, gently turning
      const ox = OL[i*2], oy = OL[i*2+1], k = 1 + 0.06 * pu * (0.6 + 0.4 * Math.sin(p.ph));
      const x3 = ox * cr * 0.25 + ox * 0.75;
      p.tx = CX + x3 * R * 1.08 * sc * k; p.ty = CY + oy * R * 1.08 * sc * k; p.tz = 0.75 + 0.25 * Math.cos(rot); continue;
    }
    let x = HP[i*3], y = HP[i*3+1], z = HP[i*3+2];
    const x1 = x * cr - y * sr, y1 = x * sr + y * cr;           // turn around the vertical axis
    const y2 = y1 * ct - z * st, z2 = y1 * st + z * ct;          // small tilt toward the viewer
    const per = 3.2 / (3.2 + y2), k = sc * (1 + 0.05 * pu * Math.sin(p.ph * 3));
    p.tx = CX + x1 * R * per * k; p.ty = CY - z2 * R * per * k; p.tz = Math.max(0, Math.min(1, 0.5 - y2 * 0.55));
  }
}

function explode(cx, cy, power) {
  for (const p of P) {
    let dx = p.x - cx, dy = p.y - cy; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const a = rand() * 6.283, sp = S * (0.7 + rand() * 1.9) * power;
    p.vx = (dx * 0.8 + Math.cos(a) * 0.45) * sp; p.vy = (dy * 0.8 + Math.sin(a) * 0.45) * sp - S * 0.15 * power;
  }
  freeT = 0.2 * power + 0.06; springRamp = 0; flash = power;
  rings.push({ x: cx, y: cy, r: S * 0.02, life: 1 });
  if (power > 0.7) rings.push({ x: cx, y: cy, r: 0, life: 1.25 });
  for (let i = 0; i < 7 * power; i++) spawnMini(cx, cy, true);
  sfx.boom(power);
}

function spawnMini(x, y, burst) {
  minis.push({ x, y, s: S * (0.016 + rand() * 0.028), burst: !!burst,
    vy: -S * (0.05 + rand() * 0.09) * (burst ? 4 : 1), vx: burst ? (rand() - 0.5) * S * 1.6 : 0,
    a: 0.12 + rand() * 0.33, ph: rand() * 6.283, life: burst ? 0.9 + rand() * 0.5 : 1 });
}

function setMode(m, burstPower = 0.55) {
  if (m === mode) return; mode = m;
  explode(CX, CY, burstPower);
  if (m === 'love') backTimer = 3.6;
}

/* ---------- simulation + drawing ---------- */
function step(dt) {
  time += dt;
  if (backTimer > 0 && (backTimer -= dt) <= 0) setMode(name ? 'name' : 'heart', 0.5);
  dragRot += dragVel * dt; dragVel *= Math.exp(-3 * dt); dragRot *= Math.exp(-0.6 * dt);
  targets(time);
  freeT -= dt; if (freeT <= 0) springRamp = Math.min(1, springRamp + dt / 0.5);
  const k = 95 * springRamp * springRamp, c = 2 * Math.sqrt(Math.max(k, 1)) * 0.78, drag = Math.exp(-(freeT > 0 ? 2.4 : 0.6) * dt);
  for (const p of P) {
    p.vx = (p.vx + ((p.tx - p.x) * k - p.vx * c) * dt) * drag; p.vy = (p.vy + ((p.ty - p.y) * k - p.vy * c) * dt) * drag;
    if (ptr.on && ptr.moving) { const dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx*dx + dy*dy, rr = S * 0.09;
      if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1, f = (1 - d / rr) * S * 9 * dt; p.vx += dx / d * f * 60; p.vy += dy / d * f * 60; } }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (let i = minis.length - 1; i >= 0; i--) { const m = minis[i];
    m.y += m.vy * dt; m.x += (m.vx + Math.sin(time * 1.3 + m.ph) * S * 0.03) * dt; m.vx *= Math.exp(-1.5 * dt);
    if (m.burst) { m.life -= dt; m.vy *= Math.exp(-0.8 * dt); m.vy -= S * 0.02 * dt; if (m.life <= 0) minis.splice(i, 1); }
    else if (m.y < -m.s * 2) { m.y = H + m.s * 2; m.x = rand() * W; } }
  for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.r += S * 1.1 * dt * r.life; r.life -= dt * 1.4; if (r.life <= 0) rings.splice(i, 1); }
  flash *= Math.exp(-5 * dt);
}

function draw() {
  const pu = pulse(time);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = freeT > 0 || springRamp < 0.35 ? 0.4 : 1; ctx.drawImage(BG, 0, 0); ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  // the heart's warm halo, swelling with each beat
  const hr = R * (1.75 + 0.18 * pu), g = ctx.createRadialGradient(CX, CY, 0, CX, CY, hr);
  g.addColorStop(0, `rgba(255,40,100,${0.07 + 0.07 * pu})`); g.addColorStop(0.5, `rgba(255,30,80,${0.03 + 0.03 * pu})`); g.addColorStop(1, 'rgba(255,30,80,0)');
  ctx.fillStyle = g; ctx.fillRect(CX - hr, CY - hr, hr * 2, hr * 2);
  for (const m of minis) { const s = m.s * (1 + 0.15 * pu);
    ctx.globalAlpha = m.burst ? Math.max(0, Math.min(1, m.life)) * 0.8 : m.a; ctx.drawImage(HEART_SPR, m.x - s, m.y - s, s * 2, s * 2); }
  const base = S * 0.021, txt = mode === 'love';
  for (const p of P) {
    const tw = 0.8 + 0.3 * Math.sin(time * p.tw + p.ph), z = p.tz;
    const s = base * p.sz * tw * (0.65 + 0.55 * z) * (txt || p.ti === 1 ? 0.78 : 1);
    ctx.globalAlpha = txt || p.ti === 1 ? 0.25 + 0.6 * z : 0.3 + 0.7 * z; ctx.drawImage(SPR[p.ti === 1 ? 3 : p.c], p.x - s / 2, p.y - s / 2, s, s);
  }
  for (const r of rings) { ctx.globalAlpha = Math.max(0, r.life) * 0.7; ctx.strokeStyle = '#ff6fa0'; ctx.lineWidth = S * 0.012 * r.life;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.283); ctx.stroke(); }
  if (flash > 0.02) { const fr = S * 0.9, fg = ctx.createRadialGradient(CX, CY, 0, CX, CY, fr);
    fg.addColorStop(0, `rgba(255,230,240,${0.85 * flash})`); fg.addColorStop(0.3, `rgba(255,80,140,${0.35 * flash})`); fg.addColorStop(1, 'rgba(255,60,120,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

/* ---------- sound (off until asked for) ---------- */
const sfx = { on: false, ac: null, last: -1,
  ensure() { if (!this.ac) this.ac = new (window.AudioContext || window.webkitAudioContext)(); },
  thump(v) { if (!this.on) return; const a = this.ac, t = a.currentTime, o = a.createOscillator(), gn = a.createGain();
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.9 * v, t + 0.012); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(gn).connect(a.destination); o.start(t); o.stop(t + 0.25); },
  boom(v) { if (!this.on) return; const a = this.ac, t = a.currentTime, len = a.sampleRate * 0.7 | 0, b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), gn = a.createGain(); s.buffer = b; f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.6); gn.gain.value = 0.5 * v;
    s.connect(f).connect(gn).connect(a.destination); s.start(t); this.thump(1.2); } };
$('snd').addEventListener('click', e => { e.stopPropagation(); sfx.ensure(); sfx.on = !sfx.on; $('snd').textContent = sfx.on ? '🔊' : '🔇'; if (sfx.ac.state === 'suspended') sfx.ac.resume(); });

/* ---------- input ---------- */
const ptr = { on: false, moving: false, x: 0, y: 0, sx: 0, sy: 0, t0: 0, lx: 0 };
cv.addEventListener('pointerdown', e => { Object.assign(ptr, { on: true, moving: false, x: e.clientX * DPR, y: e.clientY * DPR, sx: e.clientX, sy: e.clientY, lx: e.clientX, t0: performance.now() }); });
addEventListener('pointermove', e => { if (!ptr.on) return; ptr.x = e.clientX * DPR; ptr.y = e.clientY * DPR;
  if (Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > 9) ptr.moving = true;
  if (ptr.moving) { dragVel = (e.clientX - ptr.lx) * 0.35; dragRot += (e.clientX - ptr.lx) * 0.006; } ptr.lx = e.clientX; });
addEventListener('pointerup', e => { if (ptr.on && !ptr.moving && performance.now() - ptr.t0 < 400) tap(e.clientX, e.clientY); ptr.on = false; ptr.moving = false; });
addEventListener('pointercancel', () => { ptr.on = false; });

let hinted = false;
function tap(x, y) {
  if (!hinted) { hinted = true; $('hint').style.opacity = 0; }
  if (document.activeElement === $('name')) $('name').blur();
  if (mode === 'love') { backTimer = 0; mode = name ? 'name' : 'heart'; explode(x * DPR, y * DPR, 0.8); return; }
  mode = 'love'; backTimer = 3.6; explode(x * DPR, y * DPR, 1);
}
function setName(v) {
  v = (v || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 12);
  if (!v) { toast('Type a name first 💘'); return; }
  name = v; namePts = textPoints(name.includes(' ') && name.length > 7 ? name.split(' ').slice(0, 2) : [name], true);
  backTimer = 0; mode = 'name'; explode(CX, CY, 0.75);
  if (!CAP) { const u = new URL(location.href); u.searchParams.set('name', name); history.replaceState(null, '', u); }
  $('hint').textContent = 'now send it to them 💌'; $('hint').style.opacity = 1;
}
$('nameForm').addEventListener('submit', e => { e.preventDefault(); $('name').blur(); setName($('name').value); });
['pointerdown', 'pointerup'].forEach(ev => $('nameForm').addEventListener(ev, e => e.stopPropagation()));
$('share').addEventListener('click', async e => {
  e.stopPropagation(); const u = new URL(location.href.split('?')[0]); if (name) u.searchParams.set('name', name);
  const data = { title: 'Particle Heart 💘', text: name ? `I made this for you, ${name} ❤️` : 'Type your person\'s name in this heart ❤️', url: u.toString() };
  try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(data.url); toast('Link copied 💌'); } } catch (_) {}
});
let toastT; function toast(m) { const t = $('toast'); t.textContent = m; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => t.style.opacity = 0, 1600); }

/* ---------- start ---------- */
let lastBeat = -1;
function frame(dt) { step(dt);
  const b = Math.floor(time / BEAT); if (b !== lastBeat) { lastBeat = b; if (mode !== 'love') sfx.thump(0.8); }
  draw(); }
function scatter() { for (const p of P) { p.x = rand() * W; p.y = rand() * H; p.vx = (rand() - .5) * S * 0.2; p.vy = (rand() - .5) * S * 0.2; } freeT = 0.15; springRamp = 0; }

addEventListener('resize', () => { const ow = W, oh = H; resize(); for (const p of P) { p.x *= W / ow; p.y *= H / oh; } });
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => document.fonts.load('900 40px Poppins')).catch(() => {}).then(() => {
  resize(); scatter();
  for (let i = 0; i < (mobile ? 16 : 24); i++) spawnMini(rand() * W, rand() * H, false);
  const qn = Q.get('name'); if (qn) { $('name').value = qn.toUpperCase().slice(0, 12); name = $('name').value; namePts = textPoints([name], true); mode = 'name'; }
  if (CAP) {
    window.__step = (dt, n = 1) => { for (let i = 0; i < n; i++) { const sub = Math.ceil(dt / (1 / 60)); for (let s = 0; s < sub; s++) step(dt / sub); } draw(); };
    window.__tap = (x, y) => tap(x, y);
    window.__type = v => { $('name').value = v; };
    window.__submit = () => { $('go').classList.add('press'); setTimeout(() => $('go').classList.remove('press'), 160); setName($('name').value); };
    window.__mode = () => mode; window.__setTime = t => { time = t; };
    window.__ready = true; return;
  }
  let last = performance.now();
  const loop = now => { const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
})();
