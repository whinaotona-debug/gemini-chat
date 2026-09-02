"use strict";

const VIEW_W = 960;
const VIEW_H = 540;
const SIZE = 36;
const GROUND = 420;
const SAVE_KEY = "hitome-scroll-v1";
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = true;

const keys = Object.create(null);
const tapped = Object.create(null);
const mouse = { x: 0, y: 0, down: false, clicked: false, moved: false };
const cam = { x: 0, y: 0 };

window.addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
  if (!keys[e.key]) tapped[e.key] = true;
  keys[e.key] = true;
});
window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});
window.addEventListener("blur", () => {
  for (const k of Object.keys(keys)) keys[k] = false;
});

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (VIEW_W / r.width),
    y: (e.clientY - r.top) * (VIEW_H / r.height),
  };
}
canvas.addEventListener("pointermove", (e) => {
  const p = canvasPos(e);
  mouse.x = p.x;
  mouse.y = p.y;
  mouse.moved = true;
});
canvas.addEventListener("pointerdown", (e) => {
  canvas.focus();
  const p = canvasPos(e);
  mouse.x = p.x;
  mouse.y = p.y;
  mouse.down = true;
  mouse.clicked = true;
});
canvas.addEventListener("pointerup", () => {
  mouse.down = false;
});

let audioCtx = null;
function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume();
}
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);
window.addEventListener("gamepadconnected", unlockAudio);

const PAD_DZ = 0.42;
const padHeld = {
  left: false,
  right: false,
  up: false,
  down: false,
  a: false,
  b: false,
  x: false,
  y: false,
  back: false,
  start: false,
};
const padEdge = {
  left: false,
  right: false,
  up: false,
  down: false,
  a: false,
  b: false,
  x: false,
  y: false,
  back: false,
  start: false,
};
let padConnected = false;

function pollGamepad() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  let g = null;
  for (let i = 0; i < list.length; i++) {
    if (list[i]) {
      g = list[i];
      break;
    }
  }
  padConnected = !!g;
  const next = {
    left: false,
    right: false,
    up: false,
    down: false,
    a: false,
    b: false,
    x: false,
    y: false,
    back: false,
    start: false,
  };
  if (g) {
    const ax = g.axes[0] || 0;
    const ay = g.axes[1] || 0;
    const pressed = (i) => !!(g.buttons[i] && g.buttons[i].pressed);
    next.left = ax < -PAD_DZ || pressed(14);
    next.right = ax > PAD_DZ || pressed(15);
    next.up = ay < -PAD_DZ || pressed(12);
    next.down = ay > PAD_DZ || pressed(13);
    next.a = pressed(1);
    next.b = pressed(0);
    next.x = pressed(3);
    next.y = pressed(2);
    next.back = pressed(8);
    next.start = pressed(9);
    if (next.a || next.start || next.left || next.right || next.up) unlockAudio();
  }
  for (const k of Object.keys(next)) {
    padEdge[k] = next[k] && !padHeld[k];
    padHeld[k] = next[k];
  }
}

function tone(freq, dur, type, vol, slide) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type || "square";
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
  g.gain.setValueAtTime(vol || 0.07, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const sfx = {
  jump() {
    tone(560, 0.11, "square", 0.06, 340);
  },
  kick() {
    tone(240, 0.14, "sawtooth", 0.055, 140);
  },
  stomp() {
    tone(180, 0.14, "square", 0.08, 70);
    tone(520, 0.1, "square", 0.045, 820);
  },
  coin() {
    tone(980, 0.07, "square", 0.05);
    tone(1320, 0.12, "square", 0.045);
  },
  spring() {
    tone(280, 0.18, "triangle", 0.07, 920);
  },
  die() {
    tone(220, 0.38, "sawtooth", 0.07, 70);
  },
  spawn() {
    tone(480, 0.16, "triangle", 0.05, 900);
  },
  goal() {
    tone(523, 0.14, "square", 0.06);
    tone(659, 0.16, "square", 0.055);
    tone(784, 0.28, "square", 0.06);
  },
  key() {
    tone(740, 0.18, "triangle", 0.06, 1180);
  },
  check() {
    tone(620, 0.12, "square", 0.05, 880);
  },
  cannon() {
    tone(140, 0.2, "sawtooth", 0.07, 60);
  },
  buy() {
    tone(880, 0.1, "square", 0.055);
    tone(1180, 0.16, "square", 0.05);
  },
  nope() {
    tone(160, 0.12, "sawtooth", 0.05);
  },
};

function held(k) {
  return !!keys[k];
}
function tap(k) {
  return !!tapped[k];
}
function hit(x, y, w, h) {
  return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
}
function axisX() {
  let x = 0;
  if (held("ArrowLeft") || held("a") || held("A") || padHeld.left) x -= 1;
  if (held("ArrowRight") || held("d") || held("D") || padHeld.right) x += 1;
  return x;
}
function wx(n) {
  return n - cam.x;
}
function wy(n) {
  return n - cam.y;
}
function vis(x, w) {
  const s = wx(x);
  return s < VIEW_W + 80 && s + (w || 40) > -80;
}

function rr(x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function P(x, y, w, h, type) {
  return { x, y, w, h, type: type || "grass" };
}
function C(x, y) {
  return { x, y, taken: false };
}
function S(x, y) {
  return { x, y };
}
function E(x, y, minX, maxX) {
  return { x, y, w: 34, h: 34, vx: 1.15, minX, maxX, origin: x };
}

function builder() {
  const b = {
    x: 0,
    plats: [],
    coins: [],
    spikes: [],
    enemies: [],
    trees: [],
    rocks: [],
    tufts: [],
    movers: [],
    checks: [],
    springs: [],
    saws: [],
    ladders: [],
    cannons: [],
    keys: [],
    switches: [],
    winds: [],
    crushers: [],
    sign: null,
    flag: null,
    pipe: null,
    fence: null,
    hint: "",
    start() {
      this.sign = { x: this.x + 36, y: GROUND };
      return this.ground(480, { tree: true, tufts: true, coins: [220] });
    },
    ground(w, o) {
      o = o || {};
      const x = this.x;
      this.plats.push(P(x, GROUND, w, 180));
      if (o.tree) this.trees.push({ x: x + Math.min(w - 80, w * 0.72), y: GROUND });
      if (o.rock) this.rocks.push({ x: x + 90, y: GROUND });
      if (o.tufts) {
        for (let i = 50; i < w - 20; i += 150) this.tufts.push(x + i);
      }
      (o.coins || []).forEach((dx) => this.coins.push(C(x + dx, GROUND - 68)));
      (o.spikes || []).forEach((dx) => this.spikes.push(S(x + dx, GROUND)));
      if (o.enemy) this.enemies.push(E(x + 70, GROUND - 34, x + 24, x + w - 54));
      this.x += w;
      return this;
    },
    gap(w) {
      this.x += w;
      return this;
    },
    wall(h) {
      this.plats.push(P(this.x, GROUND - h, 56, h + 180, "pillar"));
      this.coins.push(C(this.x + 28, GROUND - h - 40));
      this.x += 56;
      return this;
    },
    pillar(h) {
      return this.wall(h || 220);
    },
    check() {
      this.checks.push({ x: this.x - 70, y: GROUND, got: false });
      return this;
    },
    spring() {
      this.springs.push({ x: this.x - 70, y: GROUND });
      this.coins.push(C(this.x - 50, GROUND - 180));
      return this;
    },
    crumble(w, y) {
      this.plats.push({ x: this.x, y: y || GROUND, w: w || 120, h: 20, type: "crumble", shake: 0, fallen: 0, oy: y || GROUND });
      this.x += (w || 120) + 36;
      return this;
    },
    belt(w, dir) {
      this.plats.push(P(this.x, GROUND, w, 22, dir >= 0 ? "conveyorR" : "conveyorL"));
      this.x += w;
      return this;
    },
    saw(span, y) {
      this.saws.push({
        x: this.x + 10,
        y: y == null ? GROUND - 22 : y,
        min: this.x,
        max: this.x + span,
        vx: 2.1,
        r: 20,
      });
      return this;
    },
    ladder(h) {
      this.ladders.push({ x: this.x + 8, y: GROUND - h, h: h, w: 28 });
      this.x += 40;
      return this;
    },
    cannon(dir) {
      this.cannons.push({ x: this.x + 8, y: GROUND - 46, dir: dir || 1, wait: 0 });
      this.x += 64;
      return this;
    },
    key() {
      this.keys.push({ x: this.x - 40, y: GROUND - 52, taken: false });
      return this;
    },
    gate() {
      this._gates = (this._gates || 0) + 1;
      this.plats.push({ x: this.x, y: GROUND - 150, w: 32, h: 150 + 180, type: "gate", need: this._gates });
      this.x += 32;
      return this;
    },
    switch() {
      this.switches.push({ x: this.x - 50, y: GROUND, on: false });
      return this;
    },
    toggle(w, y) {
      this.plats.push(P(this.x, y, w, 18, "toggle"));
      this.x += w + 24;
      return this;
    },
    wind(w, vx) {
      this.winds.push({ x: this.x, y: 60, w: w, h: 400, vx: vx || 2.4 });
      return this;
    },
    crusher() {
      this.crushers.push({
        x: this.x + 10,
        y: 50,
        w: 88,
        h: 64,
        minY: 50,
        maxY: GROUND - 70,
        vy: 0,
        wait: 40,
        down: true,
      });
      this.x += 110;
      return this;
    },
    moveV(w, y, span, spd) {
      const i = this.plats.length;
      this.plats.push(P(this.x, y, w, 18, "moveV"));
      this.movers.push({ i, min: y - span, max: y, axis: "y", spd: spd || 1.15 });
      this.x += w + 44;
      return this;
    },
    hopSpring() {
      return this.ground(160).spring().gap(210).ground(200, { coins: [80] });
    },
    run(n) {
      for (let i = 0; i < n; i++) {
        this.ground(360 + (i % 4) * 70, {
          coins: [140, 280].slice(0, 1 + (i % 2)),
          tufts: i % 2 === 0,
          tree: i % 5 === 0,
          rock: i % 6 === 2,
          enemy: i % 8 === 5,
        });
        if (i < n - 1) this.gap(110 + (i % 3) * 18);
      }
      return this;
    },
    kickGap(h) {
      this.gap(72);
      this.wall(h || 210);
      this.gap(74);
      return this;
    },
    step(w, rise) {
      this.plats.push(P(this.x, GROUND - rise, w, rise + 180));
      this.x += w;
      return this;
    },
    cloud(w, y) {
      this.plats.push(P(this.x, y, w, 18, "cloud"));
      this.coins.push(C(this.x + w * 0.5, y - 36));
      this.x += w + 50;
      return this;
    },
    bridge(n) {
      for (let i = 0; i < n; i++) this.plats.push(P(this.x + i * 58, GROUND, 46, 16, "wood"));
      this.x += n * 58;
      return this;
    },
    float(w, y) {
      this.plats.push(P(this.x, y, w, 22));
      this.x += w + 30;
      return this;
    },
    moveH(w, y, span, spd) {
      const i = this.plats.length;
      this.plats.push(P(this.x, y, w, 18, "moveH"));
      this.movers.push({ i, min: this.x, max: this.x + span, axis: "x", spd: spd || 1.4 });
      this.x += span + w + 40;
      return this;
    },
    end() {
      this.ground(420, { tree: true, tufts: true });
      this.flag = { x: this.x - 90, y: GROUND, color: "red" };
      this.width = this.x + 240;
      return this;
    },
    pack(name, theme) {
      return {
        name,
        theme,
        spawn: { x: 110, y: 360 },
        plats: this.plats,
        coins: this.coins,
        spikes: this.spikes,
        enemies: this.enemies,
        trees: this.trees,
        rocks: this.rocks,
        tufts: this.tufts,
        movers: this.movers,
        checks: this.checks,
        springs: this.springs,
        saws: this.saws,
        ladders: this.ladders,
        cannons: this.cannons,
        keys: this.keys,
        switches: this.switches,
        winds: this.winds,
        crushers: this.crushers,
        sign: this.sign,
        flag: this.flag,
        pipe: this.pipe,
        fence: this.fence,
        hint: this.hint,
        width: this.width || this.x + 200,
        lava: true,
      };
    },
  };
  return b;
}

function long(name, theme, fn) {
  const b = builder().start();
  fn(b);
  return b.end().pack(name, theme);
}

const STAGES = [
  long("はじまり", "day", (b) => {
    b.ground(500, { coins: [220], tufts: true, rock: true }).gap(130).ground(360, { spikes: [70, 108] });
    b.hopSpring().check();
    b.gap(120).ground(280).kickGap(200).ground(320, { tree: true }).check();
    b.ground(200).crumble(130).crumble(130).ground(260, { coins: [80] });
    b.gap(80).cloud(150, 300).ground(400, { enemy: true, tufts: true }).check();
    b.ground(180).belt(280, 1).ground(200, { coins: [60] }).gap(140).ground(300);
    b.saw(220).ground(360, { spikes: [40] }).check();
    b.hopSpring().gap(100).bridge(6).ground(500, { coins: [180], tufts: true, tree: true });
  }),
  long("ばねの丘", "day", (b) => {
    for (let i = 0; i < 6; i++) {
      b.ground(220, { tufts: i % 2 === 0 }).spring().gap(200 + (i % 3) * 20);
      b.cloud(140, 240).ground(240, { coins: [80], tree: i % 3 === 0 });
      if (i % 2 === 0) b.check();
      if (i % 3 === 1) b.kickGap(210).ground(200);
    }
    b.ground(200).spring().gap(240).ground(200).spring().gap(220).ground(700, { coins: [200, 420], tufts: true });
  }),
  long("くずれる床", "day", (b) => {
    for (let i = 0; i < 8; i++) {
      b.ground(200, { coins: [80] }).gap(40).crumble(140).crumble(120, GROUND - 40).crumble(140);
      b.ground(240, { tree: i % 2 === 0 });
      if (i % 2 === 0) b.check();
      if (i % 3 === 1) b.gap(80).cloud(140, 280).ground(200);
    }
    b.gap(100).ground(640, { coins: [180], tufts: true });
  }),
  long("ベルト", "day", (b) => {
    for (let i = 0; i < 7; i++) {
      b.ground(180).belt(320, 1).ground(160, { coins: [50] });
      b.gap(120).ground(160).belt(280, -1).ground(200, { spikes: i % 2 ? [40, 78] : [] });
      if (i % 2 === 0) b.check();
      if (i % 3 === 1) b.saw(200).ground(240, { tree: true });
    }
    b.ground(600, { coins: [200], tufts: true });
  }),
  long("かべのきほん", "day", (b) => {
    b.ground(480, { coins: [200], tufts: true });
    for (let i = 0; i < 8; i++) {
      b.kickGap(190 + (i % 3) * 24).ground(240, { coins: [80], tree: i % 3 === 0 });
      if (i % 2 === 0) b.ground(140).ladder(160).ground(200).check();
      if (i % 3 === 2) b.hopSpring();
    }
    b.ground(560, { coins: [180], tufts: true, tree: true });
  }),
  long("のこぎり", "day", (b) => {
    for (let i = 0; i < 8; i++) {
      b.ground(420, { coins: [80], tufts: true }).saw(280);
      b.gap(130).ground(280, { spikes: [30, 68] });
      if (i % 2 === 0) b.check();
      if (i % 3 === 1) b.crumble(140).ground(200, { tree: true });
    }
    b.ground(200).saw(200).gap(120).ground(640, { coins: [180], tufts: true });
  }),
  long("はしご", "dusk", (b) => {
    for (let i = 0; i < 7; i++) {
      b.ground(200).ladder(180).float(160, GROUND - 160);
      b.gap(80).ground(180).ladder(220).cloud(150, 200);
      b.ground(260, { coins: [80], tree: i % 2 === 0 });
      if (i % 2 === 0) b.check();
    }
    b.ground(600, { coins: [160], tufts: true });
  }),
  long("大砲", "dusk", (b) => {
    for (let i = 0; i < 7; i++) {
      b.ground(240, { tufts: true }).cannon(1).gap(260).ground(240, { coins: [80] });
      if (i % 2 === 0) b.check();
      if (i % 3 === 1) b.ground(180).cannon(1).gap(300).cloud(140, 250).ground(220, { tree: true });
    }
    b.ground(200).cannon(1).gap(280).ground(700, { coins: [200], tufts: true });
  }),
  long("かぎ", "dusk", (b) => {
    for (let i = 0; i < 6; i++) {
      b.ground(280, { coins: [80], tufts: true }).key().gap(80).gate().ground(280, { tree: i % 2 === 0 });
      b.gap(120).kickGap(210).ground(220);
      if (i % 2 === 0) b.check();
    }
    b.ground(200).key().crumble(140).gate().ground(640, { coins: [180], tufts: true });
  }),
  long("スイッチ", "dusk", (b) => {
    for (let i = 0; i < 6; i++) {
      b.ground(260, { tufts: true }).switch();
      b.gap(90).toggle(180, 300).toggle(160, 240);
      b.ground(240, { coins: [80] }).check();
      b.gap(120).ground(200).kickGap(220).ground(220, { tree: true });
    }
    b.ground(260).switch().gap(80).toggle(200, 280).ground(560, { coins: [160], tufts: true });
  }),
  long("かぜ", "dusk", (b) => {
    for (let i = 0; i < 7; i++) {
      b.ground(200).wind(420, i % 2 === 0 ? 2.6 : -2.2);
      b.gap(80).cloud(150, 280).ground(240, { coins: [80] });
      if (i % 2 === 0) b.check();
      if (i % 3 === 1) b.kickGap(230).ground(200, { tree: true });
    }
    b.ground(640, { coins: [180], tufts: true });
  }),
  long("つぶし岩", "dusk", (b) => {
    for (let i = 0; i < 7; i++) {
      b.ground(200).crusher().ground(220, { coins: [60] });
      b.gap(120).ground(180).crusher().ground(200, { tree: i % 2 === 0 });
      if (i % 2 === 0) b.check();
    }
    b.ground(600, { coins: [160], tufts: true });
  }),
  long("うく足場", "night", (b) => {
    for (let i = 0; i < 6; i++) {
      b.ground(200, { coins: [60] }).gap(40).moveH(140, 320, 240, 1.45);
      b.gap(30).moveV(130, 300, 140, 1.2).ground(220);
      if (i % 2 === 0) b.check();
      if (i % 3 === 1) b.crumble(120).ground(200, { tree: true });
    }
    b.ground(560, { coins: [160], tufts: true });
  }),
  long("てきふみ", "night", (b) => {
    for (let i = 0; i < 8; i++) {
      b.ground(420, { enemy: true, coins: [140, 280], tufts: true }).gap(130);
      b.ground(300, { enemy: true, spikes: i % 2 ? [40, 78] : [] });
      if (i % 2 === 0) b.check();
      if (i % 3 === 1) b.hopSpring();
    }
    b.ground(640, { enemy: true, coins: [200], tufts: true });
  }),
  long("くものみち", "night", (b) => {
    for (let i = 0; i < 7; i++) {
      b.ground(240, { tufts: true }).gap(50).cloud(160, 300).cloud(150, 230).cloud(140, 170);
      b.ground(220, { coins: [80] }).check();
      b.gap(70).moveH(140, 250, 200, 1.3).ground(200, { tree: i % 2 === 0 });
    }
    b.ground(600, { coins: [180], tufts: true });
  }),
  long("ごちゃまぜ", "night", (b) => {
    b.ground(300, { tufts: true }).hopSpring().saw(180).check();
    b.ground(180).belt(240, 1).crumble(130).kickGap(220).ground(220);
    b.ground(200).ladder(180).cloud(150, 230).cannon(1).gap(240).ground(240).check();
    b.ground(200).key().crumble(140).gate().crusher().ground(260, { enemy: true });
    b.ground(220).switch().gap(70).toggle(180, 270).wind(300, 2.2);
    b.ground(200).spring().gap(200).bridge(5).ground(500, { coins: [200], tufts: true, tree: true });
  }),
  long("よるの工場", "night", (b) => {
    for (let i = 0; i < 6; i++) {
      b.ground(180).belt(260, 1).saw(200).cannon(1).gap(220).ground(200, { coins: [80] });
      b.crumble(120).crusher().ground(220, { tree: i % 2 === 0 });
      if (i % 2 === 0) b.check();
    }
    b.ground(560, { coins: [160], tufts: true });
  }),
  long("かぜときっく", "night", (b) => {
    for (let i = 0; i < 7; i++) {
      b.ground(180).wind(280, 2.4).kickGap(240).ground(200, { coins: [70] });
      b.wind(200, -2).kickGap(260).ground(220, { tree: i % 2 === 0 });
      if (i % 2 === 0) b.check();
    }
    b.ground(560, { coins: [160], tufts: true });
  }),
  long("さいごのしかけ", "night", (b) => {
    b.hopSpring().saw(180).check();
    b.ground(160).belt(200, 1).ladder(170).cannon(1).gap(230).ground(200);
    b.ground(180).key().crumble(120).gate().crusher().check();
    b.ground(200).switch().gap(60).toggle(160, 260).wind(260, 2.3);
    b.kickGap(230).moveH(140, 280, 200, 1.4).ground(240, { enemy: true });
    b.ground(180).spring().gap(200).ground(240).check();
    b.crumble(140).saw(160).kickGap(250).ground(500, { coins: [180], tufts: true, tree: true });
  }),
  long("ゴールへ", "night", (b) => {
    b.ground(280, { coins: [120], tufts: true }).hopSpring().check();
    b.saw(180).belt(220, 1).kickGap(220).ground(200);
    b.ground(180).ladder(180).cannon(1).gap(250).cloud(140, 240).ground(220).check();
    b.ground(180).key().gap(50).gate().crusher().ground(240, { enemy: true });
    b.ground(200).switch().gap(70).toggle(180, 250).moveV(130, 300, 120, 1.2);
    b.wind(280, 2.2).crumble(130).kickGap(240).ground(240).check();
    b.gap(120).bridge(6).ground(280, { coins: [100] });
    b.ground(800, { coins: [180, 400, 620], tufts: true, tree: true });
  }),
];

let save = {
  unlocked: 1,
  best: Array(20).fill(null),
  coins: 0,
  skin: "default",
  owned: ["default"],
  accs: [],
};
try {
  const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
  if (raw) {
    save = { ...save, ...raw, best: raw.best || save.best };
    if (!Array.isArray(save.owned) || !save.owned.length) save.owned = ["default"];
    if (!save.owned.includes("default")) save.owned.unshift("default");
    if (!Array.isArray(save.accs)) save.accs = [];
    if (!save.skin) save.skin = "default";
  }
} catch {
  /* keep */
}
function persist() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}
function shopOwned(id) {
  return save.owned.indexOf(id) >= 0;
}
function hasAcc(id) {
  return save.accs.indexOf(id) >= 0;
}
function shopItem(id) {
  return SHOP.find((s) => s.id === id) || SHOP[0];
}
function skinColors() {
  const it = shopItem(save.skin);
  if (it.id === "rainbow") {
    const h = (frame * 3) % 360;
    const c = (s, l) => "hsl(" + h + "," + s + "%," + l + "%)";
    return [c(80, 62), c(70, 46), c(60, 32)];
  }
  return it.colors;
}

let mode = "select";
let selectIndex = 0;
let pauseIndex = 0;
let selectFrom = null;
let shopFocus = false;
let shopIndex = 0;
const PAUSE_ITEMS = ["つづける", "やりなおす", "ステージせんたく"];
const SHOP = [
  { id: "default", name: "ふつう", kind: "skin", cost: 0, colors: ["#5a5a64", "#3c3c46", "#2c2c34"] },
  { id: "berry", name: "いちご", kind: "skin", cost: 12, colors: ["#e85a6c", "#c43b50", "#8e2a38"] },
  { id: "sky", name: "そら", kind: "skin", cost: 12, colors: ["#6eb6e8", "#3d8ee0", "#245a9a"] },
  { id: "mint", name: "ミント", kind: "skin", cost: 18, colors: ["#7ee0b8", "#3cb88a", "#2a7a5c"] },
  { id: "grape", name: "ぶどう", kind: "skin", cost: 18, colors: ["#b48ae8", "#7a52c4", "#4a3280"] },
  { id: "lemon", name: "レモン", kind: "skin", cost: 22, colors: ["#f0d45a", "#e0b020", "#a07810"] },
  { id: "night", name: "よる", kind: "skin", cost: 30, colors: ["#3a3e58", "#222436", "#12141c"] },
  { id: "gold", name: "きん", kind: "skin", cost: 50, colors: ["#ffd76a", "#e8a020", "#b07010"] },
  { id: "rainbow", name: "にじ", kind: "skin", cost: 70, colors: ["#ff6b8a", "#7ad0ff", "#ffe066"] },
  { id: "hat", name: "ぼうし", kind: "acc", cost: 16 },
  { id: "blush", name: "ほっぺ", kind: "acc", cost: 8 },
  { id: "ribbon", name: "リボン", kind: "acc", cost: 14 },
  { id: "star", name: "ほしめ", kind: "acc", cost: 20 },
  { id: "sparkle", name: "きらきら", kind: "acc", cost: 28 },
  { id: "tail", name: "しっぽ", kind: "acc", cost: 32 },
];
let stageIndex = 0;
let stage = null;
let time = 0;
let particles = [];
let frame = 0;
let goalT = 0;
let grabbed = 0;
let spawn = { x: 110, y: 360 };

const player = {
  x: 110,
  y: 360,
  vx: 0,
  vy: 0,
  w: SIZE,
  h: SIZE,
  onGround: false,
  onWall: 0,
  lastWall: 0,
  wallCoyote: 0,
  air: 0,
  coyote: 0,
  buffer: 0,
  jumpLock: 0,
  wallLock: 0,
  cut: false,
  facing: 1,
  squish: 1,
  stretch: 1,
  blink: 0,
  dead: false,
  deadT: 0,
  invuln: 0,
  riding: null,
  keysGot: 0,
  onLadder: false,
  inCannon: 0,
};

function cloneStage(i) {
  const src = STAGES[i];
  const s = JSON.parse(JSON.stringify(src));
  s.plats.forEach((p, idx) => {
    p._i = idx;
  });
  return s;
}

function startStage(i) {
  stageIndex = i;
  stage = cloneStage(i);
  spawn = { x: stage.spawn.x, y: stage.spawn.y };
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.dead = false;
  player.deadT = 0;
  player.invuln = 0;
  player.onGround = false;
  player.onWall = 0;
  player.lastWall = 0;
  player.wallCoyote = 0;
  player.air = 0;
  player.coyote = 0;
  player.buffer = 0;
  player.jumpLock = 0;
  player.wallLock = 0;
  player.keysGot = 0;
  player.onLadder = false;
  player.inCannon = 0;
  player.facing = 1;
  player.squish = 1;
  player.stretch = 1;
  cam.x = 0;
  cam.y = 0;
  time = 0;
  goalT = 0;
  grabbed = 0;
  particles = [];
  mode = "play";
  selectFrom = null;
}

function puff(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x,
      y,
      vx: Math.random() * 2.4 - 1.2,
      vy: -Math.random() * 1.8 - 0.2,
      life: 12 + (i % 8),
      color: color || "rgba(255,255,255,0.7)",
      s: 3 + Math.random() * 4,
    });
  }
}

function kill(force) {
  if (player.dead || mode !== "play") return;
  if (!force && player.invuln > 0) return;
  player.dead = true;
  player.deadT = 0;
  player.vy = -6.5;
  player.vx = -player.facing * 2;
  puff(player.x + player.w / 2, player.y + player.h / 2, 10, "rgba(80,80,90,0.6)");
  sfx.die();
}

function wallKick(dir, plat) {
  const away = dir || player.onWall || player.lastWall || player.facing;
  const input = axisX();
  const toward = input === away;
  player.onWall = 0;
  player.wallCoyote = 0;
  player.wallLock = 12;
  player.onGround = false;
  player.coyote = 0;
  player.buffer = 0;
  player.jumpLock = 8;
  player.cut = false;
  player.air = 6;
  player.stretch = 1.2;
  player.squish = 0.84;
  puff(player.x + (away > 0 ? player.w : 0), player.y + player.h * 0.45, 8, "rgba(255,255,255,0.85)");
  sfx.kick();
  player.vy = toward ? -11.5 : -10.6;
  player.vx = -away * (toward ? 3.5 : 7.2);
  player.facing = -away;
  player.x -= away * 6;
}

function doJump() {
  player.vy = -10.3;
  player.onGround = false;
  player.coyote = 0;
  player.buffer = 0;
  player.jumpLock = 8;
  player.cut = false;
  player.stretch = 1.18;
  player.squish = 0.86;
  puff(player.x + player.w / 2, player.y + player.h, 5, "rgba(255,255,255,0.65)");
  sfx.jump();
}

function uiConfirm() {
  return tap("Enter") || tap(" ") || padEdge.a;
}
function uiBack() {
  return tap("Escape") || padEdge.b;
}
function uiPick() {
  return uiConfirm() || uiBack() || tap("Enter") || tap(" ");
}
function uiPauseTap() {
  return tap("p") || tap("P") || padEdge.x;
}
function jumpWanted() {
  return tap(" ") || tap("w") || tap("W") || tap("Escape") || padEdge.a || padEdge.b;
}
function jumpDown() {
  return held(" ") || held("w") || held("W") || held("Escape") || padHeld.a || padHeld.b;
}

function isCloud(p) {
  return p.type === "cloud" || p.type === "wood" || p.type === "moveH" || p.type === "moveV" || p.type === "crumble" || p.type === "conveyorL" || p.type === "conveyorR" || p.type === "toggle";
}
function platLive(p) {
  if (!p) return false;
  if (p.type === "crumble" && p.fallen > 10) return false;
  if (p.type === "gate" && player.keysGot >= (p.need || 1)) return false;
  if (p.type === "toggle" && !(stage.switches || []).some((sw) => sw.on)) return false;
  return true;
}

function overlapXY(x, y, w, h, p) {
  return x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y;
}

function collideX(oldY) {
  let sideHit = 0;
  let hitPlat = null;
  for (const p of stage.plats) {
    if (!platLive(p)) continue;
    if (isCloud(p)) continue;
    if (!overlapXY(player.x, oldY, player.w, player.h, p)) continue;
    if (player.x + player.w / 2 < p.x + p.w / 2) {
      player.x = p.x - player.w - 1.5;
      sideHit = 1;
    } else {
      player.x = p.x + p.w + 1.5;
      sideHit = -1;
    }
    player.vx = 0;
    hitPlat = p;
  }
  return { sideHit, hitPlat };
}

function collideY(oldY, sidePlat) {
  player.onGround = false;
  player.riding = null;
  const oldBottom = oldY + player.h;
  for (const p of stage.plats) {
    if (!platLive(p)) continue;
    if (!overlap(player, p)) continue;
    if (sidePlat && p === sidePlat) continue;
    const cloud = isCloud(p);
    const fromAbove = player.vy >= -0.05 && oldBottom <= p.y + 0.25;
    if (cloud && !fromAbove) continue;
    if (fromAbove) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.onGround = true;
      player.riding = p;
    } else if (!cloud && player.vy < 0 && oldY >= p.y + p.h - 0.5) {
      player.y = p.y + p.h;
      player.vy = 0;
    }
  }
}

function updateMovers() {
  for (const m of stage.movers || []) {
    const p = stage.plats[m.i];
    if (!p) continue;
    if (m.axis === "x") {
      p.x += m.spd;
      if (p.x < m.min || p.x > m.max) m.spd *= -1;
    } else {
      p.y += m.spd;
      if (p.y < m.min || p.y > m.max) m.spd *= -1;
    }
  }
}

function updateGimmicks() {
  for (const p of stage.plats) {
    if (p.type !== "crumble") continue;
    if (player.riding === p && !p.fallen) {
      p.shake += 1;
      if (p.shake > 32) p.fallen = 1;
    } else if (!p.fallen && p.shake > 0) p.shake -= 1;
    if (p.fallen) {
      p.fallen += 1;
      p.y = (p.oy || GROUND) + p.fallen * 5;
      if (p.fallen > 90) {
        p.fallen = 0;
        p.shake = 0;
        p.y = p.oy || GROUND;
      }
    }
  }

  player.onLadder = false;
  for (const l of stage.ladders || []) {
    if (!overlap(player, { x: l.x, y: l.y, w: 28, h: l.h })) continue;
    const climb = held("ArrowUp") || held("w") || held("W") || held("ArrowDown") || padHeld.up || padHeld.down;
    if (climb || player.onLadder) {
      player.onLadder = true;
      player.x += (l.x - 4 - player.x) * 0.25;
      if (held("ArrowUp") || held("w") || held("W") || padHeld.up) player.vy = -3.1;
      else if (held("ArrowDown") || padHeld.down) player.vy = 3.1;
      else player.vy = 0;
      player.air = 0;
      player.coyote = 6;
    }
  }

  for (const c of stage.cannons || []) {
    if (player.inCannon > 0) break;
    if (overlap(player, { x: c.x, y: c.y, w: 48, h: 48 })) {
      player.inCannon = 16;
      player.x = c.x + 8;
      player.y = c.y + 6;
      player.vx = 0;
      player.vy = 0;
    }
  }
  if (player.inCannon > 0) {
    player.inCannon -= 1;
    player.vx = 0;
    player.vy = 0;
    if (player.inCannon === 0) {
      const can = (stage.cannons || []).find((c) => Math.abs(c.x - player.x) < 80) || { dir: 1 };
      player.vx = (can.dir || 1) * 11.5;
      player.vy = -6.5;
      player.cut = false;
      player.jumpLock = 10;
      player.facing = can.dir || 1;
      puff(player.x + 18, player.y + 18, 10, "rgba(255,200,80,0.8)");
      sfx.cannon();
    }
  }

  for (const k of stage.keys || []) {
    if (k.taken) continue;
    if (overlap(player, { x: k.x - 10, y: k.y - 10, w: 28, h: 28 })) {
      k.taken = true;
      player.keysGot += 1;
      puff(k.x, k.y, 10, "rgba(255,210,70,0.9)");
      sfx.key();
    }
  }

  for (const sw of stage.switches || []) {
    if (overlap(player, { x: sw.x, y: sw.y - 16, w: 40, h: 18 }) && player.vy >= 0) {
      if (!sw.on) puff(sw.x + 16, sw.y - 10, 8, "rgba(80,220,120,0.8)");
      sw.on = true;
    }
  }

  for (const w of stage.winds || []) {
    if (overlap(player, w)) player.vx += w.vx * 0.12;
  }

  for (const s of stage.saws || []) {
    s.x += s.vx;
    if (s.x < s.min || s.x > s.max) s.vx *= -1;
    const dx = player.x + player.w / 2 - s.x;
    const dy = player.y + player.h / 2 - s.y;
    if (dx * dx + dy * dy < (s.r + 16) * (s.r + 16)) kill();
  }

  for (const cr of stage.crushers || []) {
    if (cr.wait > 0) {
      cr.wait -= 1;
    } else if (cr.down) {
      cr.y += 7;
      if (cr.y >= cr.maxY) {
        cr.y = cr.maxY;
        cr.down = false;
        cr.wait = 22;
      }
    } else {
      cr.y -= 3;
      if (cr.y <= cr.minY) {
        cr.y = cr.minY;
        cr.down = true;
        cr.wait = 50;
      }
    }
    if (overlap(player, cr)) kill();
  }
}

function updatePlay() {
  time += 1 / 60;
  if (mode === "goal") {
    goalT += 1;
    return;
  }
  if (player.dead) {
    player.deadT += 1;
    player.vy += 0.5;
    player.x += player.vx;
    player.y += player.vy;
    if (player.deadT > 32) {
      player.x = spawn.x;
      player.y = spawn.y;
      player.vx = 0;
      player.vy = 0;
      player.dead = false;
      player.deadT = 0;
      player.invuln = 180;
      player.facing = 1;
      player.onWall = 0;
      player.wallLock = 0;
      cam.x = Math.max(0, spawn.x - VIEW_W * 0.38);
      sfx.spawn();
    }
    return;
  }

  updateMovers();
  const input = axisX();
  if (input) player.facing = input;

  const accel = player.onGround ? 0.36 : 0.28;
  const max = 5.25;
  if (input && player.wallLock === 0) {
    player.vx += input * accel;
    if (player.vx > max) player.vx = max;
    if (player.vx < -max) player.vx = -max;
  } else if (player.onGround) {
    player.vx *= 0.955;
    if (Math.abs(player.vx) < 0.04) player.vx = 0;
  } else {
    player.vx *= 0.988;
  }

  if (player.onGround) player.coyote = 9;
  else if (player.coyote > 0) player.coyote -= 1;
  if (jumpWanted()) player.buffer = 12;
  else if (player.buffer > 0) player.buffer -= 1;

  const canWall = !player.onGround && (player.onWall || player.wallCoyote > 0);
  if (player.buffer && canWall && player.wallLock === 0) {
    wallKick(player.onWall || player.lastWall, null);
  } else if (player.buffer && (player.onGround || player.coyote > 0)) {
    doJump();
  }

  const oldY = player.y;
  player.x += player.vx;
  const { sideHit, hitPlat } = collideX(oldY);
  player.y += player.vy;
  collideY(oldY, sideHit ? hitPlat : null);

  if (sideHit && !player.onGround && player.air > 4 && player.wallLock === 0) {
    player.onWall = sideHit;
    player.lastWall = sideHit;
    player.wallCoyote = 16;
    wallKick(sideHit, hitPlat);
  }

  let wall = 0;
  const probeL = { x: player.x - 5, y: player.y + 6, w: 7, h: player.h - 12 };
  const probeR = { x: player.x + player.w - 2, y: player.y + 6, w: 7, h: player.h - 12 };
  for (const p of stage.plats) {
    if (!platLive(p) || isCloud(p)) continue;
    if (overlap(probeL, p)) wall = -1;
    if (overlap(probeR, p)) wall = 1;
  }
  if (!player.onGround && wall) {
    player.onWall = wall;
    player.lastWall = wall;
    player.wallCoyote = 16;
    if (player.vy > 1.2) player.vy = 1.15;
  } else {
    player.onWall = 0;
    if (player.wallCoyote > 0) player.wallCoyote -= 1;
  }

  player.vy += player.onLadder || player.inCannon > 0 ? 0 : player.onWall ? 0.16 : 0.46;
  if (player.vy > 12.5) player.vy = 12.5;
  if (!jumpDown() && player.vy < -3.4 && !player.cut && player.jumpLock === 0) {
    player.vy *= 0.56;
    player.cut = true;
  }
  if (player.jumpLock > 0) player.jumpLock -= 1;
  if (player.wallLock > 0) player.wallLock -= 1;
  if (player.onGround) player.air = 0;
  else player.air += 1;

  if (player.riding && (player.riding.type === "moveH" || player.riding.type === "moveV")) {
    const m = (stage.movers || []).find((mm) => stage.plats[mm.i] === player.riding);
    if (m && m.axis === "x") player.x += m.spd;
    if (m && m.axis === "y" && player.onGround) player.y += m.spd;
  }
  if (player.riding && player.riding.type === "conveyorR") player.x += 2.35;
  if (player.riding && player.riding.type === "conveyorL") player.x -= 2.35;

  updateGimmicks();

  if (player.onGround) {
    player.stretch += (1 - player.stretch) * 0.28;
    player.squish += (1 - player.squish) * 0.28;
  } else if (player.vy < 0) {
    player.stretch += (1.14 - player.stretch) * 0.14;
    player.squish += (0.88 - player.squish) * 0.14;
  } else {
    player.stretch += (0.92 - player.stretch) * 0.12;
    player.squish += (1.08 - player.squish) * 0.12;
  }

  if (player.y > VIEW_H + 40) kill(true);

  if (hasAcc("sparkle") && frame % 3 === 0 && (Math.abs(player.vx) > 0.4 || Math.abs(player.vy) > 0.4)) {
    puff(player.x + player.w / 2, player.y + player.h / 2, 1, "rgba(255,230,120,0.7)");
  }

  if (player.invuln > 0) player.invuln -= 1;

  for (const s of stage.spikes) {
    if (overlap(player, { x: s.x + 6, y: s.y - 26, w: 24, h: 26 })) kill();
  }
  for (const e of stage.enemies) {
    if (e.dead) continue;
    e.x += e.vx;
    if (e.x < e.minX || e.x > e.maxX) e.vx *= -1;
    if (!overlap(player, e)) continue;
    const stomp =
      player.vy >= 0 &&
      player.y + player.h - Math.max(player.vy, 0) <= e.y + e.h * 0.62;
    if (stomp) {
      e.dead = true;
      player.vy = -9.2;
      player.cut = false;
      player.onGround = false;
      puff(e.x + 16, e.y, 10, "rgba(226,59,58,0.75)");
      sfx.stomp();
    } else kill();
  }
  for (const c of stage.coins) {
    if (c.taken) continue;
    if (overlap(player, { x: c.x - 16, y: c.y - 16, w: 32, h: 32 })) {
      c.taken = true;
      grabbed += 1;
      save.coins += 1;
      persist();
      puff(c.x, c.y, 9, "rgba(255,210,70,0.85)");
      sfx.coin();
    }
  }
  for (const k of stage.checks || []) {
    if (overlap(player, { x: k.x - 10, y: k.y - 88, w: 36, h: 88 })) {
      if (!k.got) {
        puff(k.x + 8, k.y - 50, 10, "rgba(120,230,90,0.8)");
        sfx.check();
      }
      k.got = true;
      spawn = { x: k.x - 20, y: GROUND - SIZE };
    }
  }
  for (const s of stage.springs || []) {
    if (overlap(player, { x: s.x, y: s.y - 18, w: 44, h: 20 }) && player.vy > 0.4) {
      player.vy = -15.4;
      player.onGround = false;
      player.cut = false;
      player.jumpLock = 6;
      player.stretch = 1.22;
      player.squish = 0.82;
      sfx.spring();
    }
  }
  const f = stage.flag;
  if (overlap(player, { x: f.x - 6, y: f.y - 88, w: 28, h: 88 })) {
    mode = "goal";
    goalT = 0;
    const t = Math.round(time * 100) / 100;
    if (save.best[stageIndex] == null || t < save.best[stageIndex]) save.best[stageIndex] = t;
    save.unlocked = Math.max(save.unlocked, stageIndex + 2);
    persist();
    sfx.goal();
  }

  if (player.blink > 0) player.blink -= 1;
  else if (Math.random() < 0.01) player.blink = 7;
  if (player.onGround && Math.abs(player.vx) > 1.6 && frame % 6 === 0) {
    puff(player.x + player.w / 2, player.y + player.h, 1, "rgba(255,255,255,0.45)");
  }

  const px = player.x + player.w / 2;
  const sx = px - cam.x;
  const keepL = VIEW_W * 0.34;
  const keepR = VIEW_W * 0.46;
  let target = cam.x;
  if (sx > keepR) target = px - keepR;
  if (sx < keepL) target = px - keepL;
  cam.x += (target - cam.x) * 0.2;
  const maxX = Math.max(0, (stage.width || VIEW_W) - VIEW_W);
  if (cam.x < 0) cam.x = 0;
  if (cam.x > maxX) cam.x = maxX;
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= 1;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function themeColors() {
  const t = stage ? stage.theme : "day";
  if (t === "night") {
    return { sky0: "#1e2a58", sky1: "#3a3f78", sky2: "#5a5088", sun: "#e8e4c8", mountA: "#2a3358", mountB: "#3b4570" };
  }
  if (t === "dusk") {
    return { sky0: "#f3b27a", sky1: "#f0c48a", sky2: "#87c4d8", sun: "#ffe1a0", mountA: "#9aa7b8", mountB: "#b7c0c8" };
  }
  return { sky0: "#8ec8f4", sky1: "#b5e3fb", sky2: "#d8f2ff", sun: "#fff6c8", mountA: "#9fb4c4", mountB: "#c5d0d6" };
}

function drawSky() {
  const c = themeColors();
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, c.sky0);
  g.addColorStop(0.45, c.sky1);
  g.addColorStop(1, c.sky2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  for (let i = 0; i < 7; i++) ctx.fillRect(0, 38 + i * 34, VIEW_W, 10);

  const sunX = 760 - cam.x * 0.05;
  const sunY = stage && stage.theme === "night" ? 92 : 108;
  const glow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 120);
  glow.addColorStop(0, c.sun);
  glow.addColorStop(0.35, "rgba(255,246,200,0.45)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 52, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  const ox = -cam.x * 0.12;
  [[80, 70, 190, 22], [340, 48, 240, 18], [560, 92, 170, 16], [820, 60, 180, 18]].forEach(([x, y, w, h]) => {
    rr(x + ox, y, w, h, h / 2);
    ctx.fill();
  });

  const mx = -cam.x * 0.22;
  ctx.fillStyle = c.mountB;
  ctx.beginPath();
  ctx.moveTo(mx - 40, 430);
  const span = Math.ceil(((stage && stage.width) || 4000) / 140) + 10;
  for (let i = 0; i < span; i++) ctx.lineTo(mx + i * 140, 240 + ((i * 37) % 90));
  ctx.lineTo(mx + span * 140, 430);
  ctx.fill();
  ctx.fillStyle = c.mountA;
  ctx.beginPath();
  ctx.moveTo(mx - 80, 450);
  for (let i = 0; i < span; i++) ctx.lineTo(mx + i * 150, 280 + ((i * 53) % 80));
  ctx.lineTo(mx + span * 150, 450);
  ctx.fill();

  const lg = ctx.createLinearGradient(0, 478, 0, VIEW_H);
  lg.addColorStop(0, "#ff6a42");
  lg.addColorStop(1, "#c01e28");
  ctx.fillStyle = lg;
  ctx.fillRect(0, 478, VIEW_W, 62);
  ctx.fillStyle = "rgba(255,180,80,0.35)";
  ctx.fillRect(0, 478, VIEW_W, 6);
}

function drawPlat(p) {
  if (!vis(p.x, p.w)) return;
  const x = wx(p.x);
  const y = wy(p.y);
  if (p.type === "cloud") {
    const g = ctx.createLinearGradient(x, y, x, y + 20);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#d7e8f8");
    ctx.fillStyle = g;
    rr(x, y - 4, p.w, 22, 11);
    ctx.fill();
    return;
  }
  if (p.type === "wood") {
    ctx.fillStyle = "#6b4424";
    ctx.beginPath();
    ctx.arc(x + p.w / 2, y + 8, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a5a30";
    ctx.beginPath();
    ctx.arc(x + p.w / 2, y + 8, 11, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (p.type === "crumble") {
    const ox = p.shake ? Math.sin(p.shake * 1.4) * 2 : 0;
    ctx.globalAlpha = p.fallen ? Math.max(0.15, 1 - p.fallen / 70) : 1;
    ctx.fillStyle = "#c4a06a";
    rr(x + ox, y, p.w, 18, 6);
    ctx.fill();
    ctx.fillStyle = "#a07840";
    for (let i = 10; i < p.w - 8; i += 22) ctx.fillRect(x + ox + i, y + 5, 10, 3);
    ctx.globalAlpha = 1;
    return;
  }
  if (p.type === "conveyorL" || p.type === "conveyorR") {
    ctx.fillStyle = "#4a5568";
    rr(x, y, p.w, 20, 6);
    ctx.fill();
    ctx.fillStyle = "#7dd3fc";
    const dir = p.type === "conveyorR" ? 1 : -1;
    const off = ((frame * 2 * dir) % 18 + 18) % 18;
    for (let i = -8; i < p.w; i += 18) {
      ctx.fillRect(x + i + off, y + 6, 10, 8);
    }
    return;
  }
  if (p.type === "gate") {
    if (player.keysGot >= (p.need || 1)) return;
    ctx.fillStyle = "#c9a227";
    ctx.fillRect(x, y, p.w, Math.min(p.h, 160));
    ctx.fillStyle = "#7a1f1f";
    ctx.fillRect(x + 10, y + 50, 12, 16);
    return;
  }
  if (p.type === "toggle") {
    const on = (stage.switches || []).some((sw) => sw.on);
    ctx.globalAlpha = on ? 1 : 0.22;
    ctx.fillStyle = on ? "#7ee0a8" : "#9aa7b8";
    rr(x, y, p.w, 18, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  if (p.type === "moveH" || p.type === "moveV") {
    ctx.fillStyle = "#d4a017";
    rr(x, y - 2, p.w, 20, 8);
    ctx.fill();
    ctx.fillStyle = "#fff3a0";
    ctx.fillRect(x + 8, y + 4, p.w - 16, 4);
    return;
  }
  const dirt = ctx.createLinearGradient(x, y, x, y + p.h);
  dirt.addColorStop(0, "#d7a05a");
  dirt.addColorStop(1, "#b0783c");
  ctx.fillStyle = dirt;
  ctx.fillRect(x, y + 16, p.w, Math.max(18, p.h - 16));
  ctx.fillStyle = "#a86c34";
  for (let i = 8; i < p.w; i += 26) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + 28);
    ctx.lineTo(x + i + 10, y + 40);
    ctx.lineTo(x + i + 4, y + 52);
    ctx.lineTo(x + i - 6, y + 40);
    ctx.fill();
  }
  const grass = ctx.createLinearGradient(x, y, x, y + 20);
  grass.addColorStop(0, "#9ee45c");
  grass.addColorStop(1, "#6dbb3c");
  ctx.fillStyle = grass;
  ctx.fillRect(x, y, p.w, 18);
  ctx.fillStyle = "#b6f07a";
  ctx.fillRect(x, y, p.w, 5);
}

function drawTuft(x, gy) {
  if (!vis(x, 24)) return;
  const sx = wx(x);
  const sy = wy(gy);
  ctx.fillStyle = "#7ad44a";
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + 6, sy - 14);
  ctx.lineTo(sx + 10, sy);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx + 8, sy);
  ctx.lineTo(sx + 16, sy - 18);
  ctx.lineTo(sx + 20, sy);
  ctx.fill();
}
function drawRock(r) {
  if (!vis(r.x, 34)) return;
  const x = wx(r.x);
  const gy = wy(r.y);
  ctx.fillStyle = "#b8b4b0";
  ctx.beginPath();
  ctx.moveTo(x, gy);
  ctx.lineTo(x + 10, gy - 16);
  ctx.lineTo(x + 28, gy - 12);
  ctx.lineTo(x + 34, gy);
  ctx.fill();
}
function drawTree(t) {
  if (!vis(t.x, 70)) return;
  const x = wx(t.x);
  const gy = wy(t.y);
  ctx.fillStyle = "#8a5a32";
  rr(x + 18, gy - 70, 18, 70, 4);
  ctx.fill();
  const g = ctx.createLinearGradient(x, gy - 150, x, gy - 50);
  g.addColorStop(0, "#8ee45a");
  g.addColorStop(1, "#4fa832");
  ctx.fillStyle = g;
  rr(x - 6, gy - 148, 62, 54, 16);
  ctx.fill();
  rr(x + 8, gy - 108, 54, 48, 16);
  ctx.fill();
}
function drawSpike(s) {
  if (!vis(s.x, 36)) return;
  const x = wx(s.x);
  const y = wy(s.y);
  const g = ctx.createLinearGradient(x, y - 36, x, y);
  g.addColorStop(0, "#ff7a70");
  g.addColorStop(1, "#e23b3a");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x + 18, y - 36);
  ctx.lineTo(x + 36, y);
  ctx.lineTo(x, y);
  ctx.fill();
}
function drawCoin(c) {
  if (c.taken || !vis(c.x, 32)) return;
  const x = wx(c.x);
  const y = wy(c.y + Math.sin(frame * 0.08 + c.x) * 4);
  ctx.fillStyle = "rgba(255,210,60,0.28)";
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, 16);
  g.addColorStop(0, "#ffe98a");
  g.addColorStop(0.6, "#ffc44d");
  g.addColorStop(1, "#e09220");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff3a8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.stroke();
}
function drawEnemy(e) {
  if (e.dead || !vis(e.x, 34)) return;
  const x = wx(e.x);
  const y = wy(e.y);
  ctx.fillStyle = "#e23b3a";
  rr(x, y, e.w, e.h, 7);
  ctx.fill();
  ctx.fillStyle = "#ffd24a";
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 4);
  ctx.lineTo(x + 11, y - 8);
  ctx.lineTo(x + 16, y + 4);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x + e.w / 2, y + 14, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(x + e.w / 2 + (e.vx > 0 ? 2 : -2), y + 14, 3.4, 0, Math.PI * 2);
  ctx.fill();
}
function drawFlag(f, color) {
  if (!f || !vis(f.x, 50)) return;
  const x = wx(f.x);
  const y = wy(f.y);
  ctx.fillStyle = "#c5c8cc";
  ctx.fillRect(x, y - 92, 6, 92);
  const wave = Math.sin(frame * 0.12) * 4;
  ctx.fillStyle = color || f.color || "#ff4d4a";
  ctx.beginPath();
  ctx.moveTo(x + 6, y - 90);
  ctx.lineTo(x + 48 + wave, y - 76);
  ctx.lineTo(x + 6, y - 58);
  ctx.fill();
}
function drawSpring(s) {
  if (!vis(s.x, 44)) return;
  const x = wx(s.x);
  const y = wy(s.y);
  ctx.fillStyle = "#2f7fe0";
  rr(x, y - 16, 48, 18, 7);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 10, y - 4);
  ctx.lineTo(x + 24, y - 14);
  ctx.lineTo(x + 38, y - 4);
  ctx.stroke();
}
function drawSaw(s) {
  if (!vis(s.x, 50)) return;
  const x = wx(s.x);
  const y = wy(s.y);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(frame * 0.28);
  ctx.fillStyle = "#8a8f98";
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 ? s.r : s.r * 0.62;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#4b5563";
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function drawLadder(l) {
  if (!vis(l.x, 28)) return;
  const x = wx(l.x);
  const y = wy(l.y);
  ctx.strokeStyle = "#c48a3a";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + l.h);
  ctx.moveTo(x + 22, y);
  ctx.lineTo(x + 22, y + l.h);
  ctx.stroke();
  ctx.lineWidth = 3;
  for (let i = 8; i < l.h; i += 16) {
    ctx.beginPath();
    ctx.moveTo(x, y + i);
    ctx.lineTo(x + 22, y + i);
    ctx.stroke();
  }
}
function drawCannon(c) {
  if (!vis(c.x, 50)) return;
  const x = wx(c.x);
  const y = wy(c.y);
  ctx.fillStyle = "#5b6570";
  rr(x, y, 48, 46, 8);
  ctx.fill();
  ctx.fillStyle = "#2d343c";
  ctx.fillRect(x + 36, y + 12, 22, 20);
  ctx.fillStyle = "#e8c44a";
  ctx.beginPath();
  ctx.arc(x + 18, y + 22, 8, 0, Math.PI * 2);
  ctx.fill();
}
function drawKey(k) {
  if (k.taken || !vis(k.x, 24)) return;
  const x = wx(k.x);
  const y = wy(k.y + Math.sin(frame * 0.1) * 3);
  ctx.fillStyle = "#ffd24a";
  ctx.beginPath();
  ctx.arc(x + 6, y + 6, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + 12, y + 4, 14, 5);
  ctx.fillRect(x + 22, y + 4, 4, 10);
}
function drawSwitch(sw) {
  if (!vis(sw.x, 40)) return;
  const x = wx(sw.x);
  const y = wy(sw.y);
  ctx.fillStyle = sw.on ? "#3ddc84" : "#e24b4a";
  rr(x, y - (sw.on ? 8 : 14), 40, sw.on ? 10 : 16, 5);
  ctx.fill();
}
function drawWind(w) {
  if (!vis(w.x, w.w)) return;
  ctx.fillStyle = "rgba(180,230,255,0.12)";
  ctx.fillRect(wx(w.x), wy(w.y), w.w, w.h);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 5; i++) {
    const px = wx(w.x + ((frame * w.vx * 3 + i * 70) % w.w + w.w) % w.w);
    ctx.fillRect(px, wy(w.y + 40 + i * 50), 18, 3);
  }
}
function drawCrusher(cr) {
  if (!vis(cr.x, cr.w)) return;
  const x = wx(cr.x);
  const y = wy(cr.y);
  ctx.fillStyle = "#6b7280";
  rr(x, y, cr.w, cr.h, 8);
  ctx.fill();
  ctx.fillStyle = "#ef4444";
  for (let i = 8; i < cr.w - 6; i += 14) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + cr.h);
    ctx.lineTo(x + i + 6, y + cr.h + 10);
    ctx.lineTo(x + i + 12, y + cr.h);
    ctx.fill();
  }
}
function drawSign(s) {
  if (!s || !vis(s.x, 80)) return;
  const x = wx(s.x);
  const y = wy(s.y);
  ctx.fillStyle = "#8a5a30";
  ctx.fillRect(x + 28, y - 48, 8, 48);
  ctx.fillStyle = "#e2b87a";
  rr(x, y - 86, 78, 46, 6);
  ctx.fill();
  ctx.fillStyle = "#3c3c44";
  rr(x + 10, y - 76, 18, 18, 4);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x + 19, y - 67, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(x + 19, y - 67, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a241c";
  ctx.fillRect(x + 36, y - 70, 16, 6);
  ctx.beginPath();
  ctx.moveTo(x + 50, y - 62);
  ctx.lineTo(x + 66, y - 67);
  ctx.lineTo(x + 50, y - 78);
  ctx.fill();
}

function drawPlayerAt(px, py, w, h, facing, opts) {
  opts = opts || {};
  const cols = skinColors();
  const body = ctx.createLinearGradient(px, py, px, py + h);
  body.addColorStop(0, cols[0]);
  body.addColorStop(0.45, cols[1]);
  body.addColorStop(1, cols[2]);
  ctx.fillStyle = body;
  rr(px, py, w, h, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  rr(px + 4, py + 3, w - 8, h * 0.28, 6);
  ctx.fill();
  if (hasAcc("tail") && !opts.noAcc) {
    ctx.fillStyle = cols[1];
    ctx.beginPath();
    ctx.moveTo(px + (facing > 0 ? 4 : w - 4), py + h * 0.55);
    ctx.quadraticCurveTo(px + (facing > 0 ? -14 : w + 14), py + h * 0.2, px + (facing > 0 ? -6 : w + 6), py + h * 0.05);
    ctx.quadraticCurveTo(px + (facing > 0 ? -10 : w + 10), py + h * 0.45, px + (facing > 0 ? 6 : w - 6), py + h * 0.62);
    ctx.fill();
  }
  if (hasAcc("hat") && !opts.noAcc) {
    ctx.fillStyle = "#c43b50";
    ctx.beginPath();
    ctx.moveTo(px + w * 0.12, py + 4);
    ctx.lineTo(px + w * 0.5, py - 16);
    ctx.lineTo(px + w * 0.88, py + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fffef8";
    ctx.beginPath();
    ctx.arc(px + w * 0.5, py - 16, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (hasAcc("ribbon") && !opts.noAcc) {
    ctx.fillStyle = "#ff6b8a";
    ctx.beginPath();
    ctx.moveTo(px + w * 0.5, py + 8);
    ctx.lineTo(px + w * 0.22, py - 2);
    ctx.lineTo(px + w * 0.42, py + 10);
    ctx.lineTo(px + w * 0.5, py + 6);
    ctx.lineTo(px + w * 0.58, py + 10);
    ctx.lineTo(px + w * 0.78, py - 2);
    ctx.closePath();
    ctx.fill();
  }
  const cx = px + w / 2;
  const cy = py + h / 2;
  ctx.fillStyle = "#fffef8";
  ctx.beginPath();
  ctx.arc(cx, cy, 11.5, 0, Math.PI * 2);
  ctx.fill();
  const lookX = facing * 2.2;
  const lookY = opts.lookY || 0;
  if (hasAcc("star")) {
    ctx.fillStyle = "#17171c";
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const r = i % 2 === 0 ? 6.2 : 3.1;
      const x = cx + lookX + Math.cos(a) * r;
      const y = cy + lookY + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = "#17171c";
    ctx.beginPath();
    ctx.arc(cx + lookX, cy + lookY, 5.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx + lookX - 1.8, cy + lookY - 2.1, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  if (hasAcc("blush") && !opts.noAcc) {
    ctx.fillStyle = "rgba(255,110,130,0.45)";
    ctx.beginPath();
    ctx.ellipse(cx - 11, cy + 8, 4.5, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 11, cy + 8, 4.5, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer() {
  const w = player.w * player.squish;
  const h = player.h * player.stretch;
  const x = wx(player.x + (player.w - w) / 2);
  const y = wy(player.y + player.h - h);
  ctx.save();
  if (player.dead) ctx.globalAlpha = 0.72;
  else if (player.invuln > 0 && Math.floor(player.invuln / 6) % 2 === 0) ctx.globalAlpha = 0.38;
  const lookY = player.vy > 3 ? 2.2 : player.vy < -2 ? -1.6 : 0;
  if (player.blink > 3) {
    drawPlayerAt(x, y, w, h, player.facing, { lookY: 0 });
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.stroke();
  } else {
    drawPlayerAt(x, y, w, h, player.facing, { lookY });
  }
  ctx.restore();
}

function drawHud() {
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  rr(18, 16, 120, 40, 14);
  ctx.fill();
  ctx.fillStyle = "#ffc44d";
  ctx.beginPath();
  ctx.arc(36, 36, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 22px Nunito, sans-serif";
  ctx.fillText(String(save.coins), 58, 43);
  ctx.fillStyle = "rgba(20,24,32,0.38)";
  rr(VIEW_W - 168, 16, 148, 42, 16);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "700 12px Nunito, sans-serif";
  ctx.fillText("Time", VIEW_W - 150, 32);
  ctx.font = "800 20px Nunito, sans-serif";
  ctx.fillText(time.toFixed(2), VIEW_W - 150, 52);
  drawIconBtn(18, 478, 48, "home", hit(18, 478, 48, 48));
  drawIconBtn(76, 478, 48, "reset", hit(76, 478, 48, 48));
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "700 16px 'M PLUS Rounded 1c', sans-serif";
  ctx.fillText(stageIndex + 1 + " / 20  " + stage.name + (padConnected ? "   パッド" : ""), 140, 510);
  if ((stage.keys || []).length) {
    ctx.fillStyle = "rgba(255,210,70,0.9)";
    ctx.font = "800 16px Nunito, sans-serif";
    ctx.fillText("鍵 " + player.keysGot + "/" + stage.keys.length, 140, 488);
  }
}

function drawIconBtn(x, y, s, kind, hover) {
  ctx.fillStyle = hover ? "#5aa8f0" : "#3d8ee0";
  rr(x, y, s, s, 10);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2.4;
  if (kind === "home") {
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 26);
    ctx.lineTo(x + s / 2, y + 12);
    ctx.lineTo(x + s - 12, y + 26);
    ctx.stroke();
    ctx.fillRect(x + 18, y + 26, 12, 10);
  } else {
    ctx.beginPath();
    ctx.arc(x + s / 2, y + s / 2, 11, 0.4, Math.PI * 1.6);
    ctx.stroke();
  }
}

function drawSelect() {
  stage = { theme: "day" };
  drawSky();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  rr(48, 22, VIEW_W - 96, 78, 20);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 30px 'M PLUS Rounded 1c', sans-serif";
  ctx.fillText("プラットフォーマー", 72, 58);
  ctx.font = "700 14px 'M PLUS Rounded 1c', sans-serif";
  ctx.fillText("スティックで選ぶ　Bで決定", 74, 82);
  ctx.fillStyle = "#ffc44d";
  ctx.beginPath();
  ctx.arc(820, 50, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 20px Nunito, sans-serif";
  ctx.fillText(String(save.coins), 838, 57);

  const shop = { x: 48, y: 112, w: VIEW_W - 96, h: 54 };
  if (mouse.moved && hit(shop.x, shop.y, shop.w, shop.h)) shopFocus = true;
  const shopOn = shopFocus || hit(shop.x, shop.y, shop.w, shop.h);
  ctx.fillStyle = shopOn ? "#ffe08a" : "rgba(255,210,80,0.92)";
  rr(shop.x, shop.y, shop.w, shop.h, 16);
  ctx.fill();
  if (shopFocus) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    rr(shop.x - 3, shop.y - 3, shop.w + 6, shop.h + 6, 18);
    ctx.stroke();
  }
  ctx.fillStyle = "#3a2a10";
  ctx.font = "800 24px 'M PLUS Rounded 1c', sans-serif";
  ctx.fillText("ショップ　コインでスキンを買う", shop.x + 28, shop.y + 36);
  if (mouse.clicked && hit(shop.x, shop.y, shop.w, shop.h)) {
    shopFocus = true;
    mode = "shop";
    shopIndex = 0;
  }

  const ox = 48;
  const oy = 180;
  const bw = 164;
  const bh = 64;
  const gap = 14;
  for (let i = 0; i < 20; i++) {
    const x = ox + (i % 5) * (bw + gap);
    const y = oy + Math.floor(i / 5) * (bh + gap);
    const open = i < save.unlocked;
    if ((mouse.clicked || mouse.moved) && hit(x, y, bw, bh)) {
      selectIndex = i;
      shopFocus = false;
    }
    const hover = open && !shopFocus && i === selectIndex;
    ctx.fillStyle = open ? (hover ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.78)") : "rgba(40,50,60,0.28)";
    rr(x, y, bw, bh, 14);
    ctx.fill();
    if (!shopFocus && i === selectIndex) {
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 4;
      rr(x - 3, y - 3, bw + 6, bh + 6, 16);
      ctx.stroke();
    }
    ctx.fillStyle = open ? "#3a4450" : "rgba(255,255,255,0.45)";
    ctx.font = "800 16px 'M PLUS Rounded 1c', sans-serif";
    ctx.fillText(i + 1 + "  " + STAGES[i].name, x + 12, y + 28);
    ctx.font = "700 12px Nunito, sans-serif";
    ctx.fillText(save.best[i] != null ? save.best[i].toFixed(2) + "s" : open ? "—" : "??", x + 12, y + 50);
    if (mouse.clicked && open && hit(x, y, bw, bh)) startStage(i);
  }
}

function shopCardRect(i) {
  const cols = 5;
  const x = 40 + (i % cols) * 184;
  const y = 168 + Math.floor(i / cols) * 118;
  return { x, y, w: 172, h: 106 };
}

function drawShop() {
  stage = { theme: "day" };
  drawSky();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  rr(80, 28, VIEW_W - 160, 72, 20);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 32px 'M PLUS Rounded 1c', sans-serif";
  ctx.fillText("ショップ", 120, 74);
  ctx.font = "700 14px 'M PLUS Rounded 1c', sans-serif";
  ctx.fillText("Aで買う／つける　Bでもどる", 280, 72);
  ctx.fillStyle = "#ffc44d";
  ctx.beginPath();
  ctx.arc(760, 64, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 22px Nunito, sans-serif";
  ctx.fillText(String(save.coins), 780, 72);

  const cur = SHOP[shopIndex] || SHOP[0];
  const oldSkin = save.skin;
  const oldAccs = save.accs.slice();
  if (cur.kind === "skin") save.skin = cur.id;
  else if (!(shopOwned(cur.id) && hasAcc(cur.id)) && !hasAcc(cur.id)) save.accs = oldAccs.concat([cur.id]);
  drawPlayerAt(540, 40, 36, 36, 1, {});
  save.skin = oldSkin;
  save.accs = oldAccs;

  for (let i = 0; i < SHOP.length; i++) {
    const it = SHOP[i];
    const r = shopCardRect(i);
    if (hit(r.x, r.y, r.w, r.h) && (mouse.moved || mouse.clicked)) shopIndex = i;
    const on = i === shopIndex;
    const got = shopOwned(it.id);
    ctx.fillStyle = on ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.78)";
    rr(r.x, r.y, r.w, r.h, 14);
    ctx.fill();
    if (on) {
      ctx.strokeStyle = "#5aa8f0";
      ctx.lineWidth = 3;
      rr(r.x - 1, r.y - 1, r.w + 2, r.h + 2, 15);
      ctx.stroke();
    }
    if (it.kind === "skin") {
      ctx.fillStyle = it.colors[1];
      rr(r.x + 14, r.y + 16, 28, 28, 6);
      ctx.fill();
    } else {
      ctx.fillStyle = "#5aa8f0";
      rr(r.x + 14, r.y + 16, 28, 28, 8);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "800 11px 'M PLUS Rounded 1c', sans-serif";
      ctx.fillText("＋", r.x + 22, r.y + 35);
    }
    ctx.fillStyle = "#3a4450";
    ctx.font = "800 16px 'M PLUS Rounded 1c', sans-serif";
    ctx.fillText(it.name, r.x + 50, r.y + 32);
    ctx.font = "700 13px Nunito, sans-serif";
    if (!got) {
      ctx.fillStyle = save.coins >= it.cost ? "#c48a10" : "#c45a5a";
      ctx.fillText(it.cost === 0 ? "無料" : it.cost + " コイン", r.x + 50, r.y + 56);
    } else if (it.kind === "skin") {
      ctx.fillStyle = save.skin === it.id ? "#3d8ee0" : "#5a6a78";
      ctx.fillText(save.skin === it.id ? "そうび中" : "持ってる", r.x + 50, r.y + 56);
    } else {
      ctx.fillStyle = hasAcc(it.id) ? "#3d8ee0" : "#5a6a78";
      ctx.fillText(hasAcc(it.id) ? "つけてる" : "持ってる", r.x + 50, r.y + 56);
    }
    ctx.fillStyle = "rgba(60,70,80,0.55)";
    ctx.font = "700 11px 'M PLUS Rounded 1c', sans-serif";
    ctx.fillText(it.kind === "skin" ? "スキン" : "アクセ", r.x + 14, r.y + 88);
    if (mouse.clicked && hit(r.x, r.y, r.w, r.h)) confirmShop();
  }
}

function confirmShop() {
  const it = SHOP[shopIndex];
  if (!it) return;
  padEdge.a = false;
  if (!shopOwned(it.id)) {
    if (save.coins < it.cost) {
      sfx.nope();
      return;
    }
    save.coins -= it.cost;
    save.owned.push(it.id);
    if (it.kind === "skin") save.skin = it.id;
    else if (!hasAcc(it.id)) save.accs.push(it.id);
    persist();
    sfx.buy();
    return;
  }
  if (it.kind === "skin") save.skin = it.id;
  else if (hasAcc(it.id)) save.accs = save.accs.filter((a) => a !== it.id);
  else save.accs.push(it.id);
  persist();
  sfx.buy();
}

function drawGoal() {
  ctx.fillStyle = "rgba(10,16,32,0.38)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  rr(230, 150, 500, 210, 22);
  ctx.fill();
  ctx.fillStyle = "#2c3540";
  ctx.font = "800 42px 'M PLUS Rounded 1c', sans-serif";
  ctx.fillText("ゴール！", 360, 220);
  ctx.font = "700 20px 'M PLUS Rounded 1c', sans-serif";
  ctx.fillText("タイム  " + time.toFixed(2) + " 秒", 360, 262);
  ctx.fillText("コイン  +" + grabbed, 360, 292);
  ctx.fillStyle = "#4a90d8";
  ctx.font = "700 16px 'M PLUS Rounded 1c', sans-serif";
  ctx.fillText(stageIndex < 19 ? "Aで次のステージ　Bでもどる" : "全クリア！ Bでホーム", 330, 330);
}

function drawWorld() {
  drawSky();
  drawSign(stage.sign);
  for (const t of stage.trees || []) drawTree(t);
  for (const p of stage.plats) drawPlat(p);
  for (const x of stage.tufts || []) drawTuft(x, GROUND);
  for (const r of stage.rocks || []) drawRock(r);
  for (const s of stage.spikes) drawSpike(s);
  for (const c of stage.coins) drawCoin(c);
  for (const e of stage.enemies) drawEnemy(e);
  for (const l of stage.ladders || []) drawLadder(l);
  for (const c of stage.cannons || []) drawCannon(c);
  for (const k of stage.keys || []) drawKey(k);
  for (const sw of stage.switches || []) drawSwitch(sw);
  for (const w of stage.winds || []) drawWind(w);
  for (const s of stage.saws || []) drawSaw(s);
  for (const cr of stage.crushers || []) drawCrusher(cr);
  for (const k of stage.checks || []) drawFlag(k, k.got ? "#7be05a" : "#5ad24a");
  for (const s of stage.springs || []) drawSpring(s);
  drawFlag(stage.flag, "#ff4d4a");
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life / 16);
    ctx.fillRect(wx(p.x), wy(p.y), p.s, p.s);
    ctx.globalAlpha = 1;
  }
  drawPlayer();
  drawHud();
}

function drawPause() {
  ctx.fillStyle = "rgba(10,16,32,0.45)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  rr(270, 108, 420, 318, 22);
  ctx.fill();
  ctx.fillStyle = "#2c3540";
  ctx.font = "800 32px 'M PLUS Rounded 1c', sans-serif";
  ctx.fillText("ポーズ", 318, 158);
  ctx.font = "700 14px 'M PLUS Rounded 1c', sans-serif";
  ctx.fillStyle = "rgba(60,70,80,0.7)";
  ctx.fillText("スティックで選ぶ　Aで決定　Bでもどる", 318, 186);
  for (let i = 0; i < PAUSE_ITEMS.length; i++) {
    const x = 310;
    const y = 210 + i * 62;
    const over = hit(x, y, 340, 52);
    if (over) pauseIndex = i;
    const on = i === pauseIndex;
    ctx.fillStyle = on ? "#5aa8f0" : "rgba(80,96,112,0.16)";
    rr(x, y, 340, 52, 14);
    ctx.fill();
    ctx.fillStyle = on ? "#fff" : "#3a4450";
    ctx.font = "800 20px 'M PLUS Rounded 1c', sans-serif";
    ctx.fillText(PAUSE_ITEMS[i], x + 22, y + 34);
    if (mouse.clicked && over) confirmPause();
  }
}

function confirmPause() {
  padEdge.a = false;
  if (pauseIndex === 0) {
    mode = "play";
    return;
  }
  if (pauseIndex === 1) {
    startStage(stageIndex);
    return;
  }
  selectFrom = "pause";
  mode = "select";
}

function openPause() {
  pauseIndex = 0;
  mode = "pause";
  padEdge.x = false;
  padEdge.a = false;
  padEdge.b = false;
}

function handleUi() {
  if (mode === "select") {
    if (shopFocus) {
      if (tap("ArrowDown") || padEdge.down) shopFocus = false;
      if (uiPick()) {
        padEdge.a = false;
        padEdge.b = false;
        mode = "shop";
        shopIndex = 0;
        return;
      }
    } else {
      if (tap("ArrowLeft") || padEdge.left) selectIndex = Math.max(0, selectIndex - 1);
      if (tap("ArrowRight") || padEdge.right) selectIndex = Math.min(19, selectIndex + 1);
      if (tap("ArrowUp") || padEdge.up) {
        if (selectIndex < 5) shopFocus = true;
        else selectIndex = Math.max(0, selectIndex - 5);
      }
      if (tap("ArrowDown") || padEdge.down) selectIndex = Math.min(19, selectIndex + 5);
      if (uiPick()) {
        if (selectIndex < save.unlocked) {
          padEdge.a = false;
          padEdge.b = false;
          startStage(selectIndex);
        }
        return;
      }
    }
  }
  if (mode === "shop") {
    const cols = 5;
    if (tap("ArrowLeft") || padEdge.left) shopIndex = Math.max(0, shopIndex - 1);
    if (tap("ArrowRight") || padEdge.right) shopIndex = Math.min(SHOP.length - 1, shopIndex + 1);
    if (tap("ArrowUp") || padEdge.up) shopIndex = Math.max(0, shopIndex - cols);
    if (tap("ArrowDown") || padEdge.down) shopIndex = Math.min(SHOP.length - 1, shopIndex + cols);
    if (uiConfirm()) {
      confirmShop();
      return;
    }
    if (uiBack()) {
      padEdge.b = false;
      mode = "select";
      shopFocus = true;
      return;
    }
  }
  if (mode === "pause") {
    if (tap("ArrowUp") || padEdge.up || tap("ArrowLeft") || padEdge.left) pauseIndex = (pauseIndex + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length;
    if (tap("ArrowDown") || padEdge.down || tap("ArrowRight") || padEdge.right) pauseIndex = (pauseIndex + 1) % PAUSE_ITEMS.length;
    if (uiConfirm()) {
      confirmPause();
      return;
    }
    if (uiBack() || uiPauseTap()) {
      padEdge.b = false;
      padEdge.x = false;
      mode = "play";
      return;
    }
  }
  if (mode === "play") {
    if (uiPauseTap() || (mouse.clicked && hit(18, 478, 48, 48))) {
      openPause();
      return;
    }
    if ((mouse.clicked && hit(76, 478, 48, 48)) || tap("r") || tap("R") || padEdge.y) {
      padEdge.y = false;
      startStage(stageIndex);
    }
  }
  if (mode === "goal") {
    if (uiConfirm()) {
      padEdge.a = false;
      if (stageIndex < 19) startStage(stageIndex + 1);
      else mode = "select";
      return;
    }
    if (uiBack() || (mouse.clicked && hit(18, 478, 48, 48))) {
      padEdge.b = false;
      selectFrom = null;
      mode = "select";
    }
  }
}

function tick() {
  pollGamepad();
  handleUi();
  if (mode === "select") {
    stage = { theme: "day" };
    drawSelect();
  } else if (mode === "shop") {
    drawShop();
  } else if (mode === "pause") {
    drawWorld();
    drawPause();
  } else {
    updatePlay();
    updateParticles();
    drawWorld();
    if (mode === "goal") drawGoal();
  }
  for (const k of Object.keys(tapped)) tapped[k] = false;
  mouse.clicked = false;
  mouse.moved = false;
  frame += 1;
}

let acc = 0;
let last = performance.now();
function loop(now) {
  acc += Math.min(50, now - last);
  last = now;
  while (acc >= 1000 / 60) {
    tick();
    acc -= 1000 / 60;
  }
  requestAnimationFrame(loop);
}
canvas.focus();
requestAnimationFrame(loop);
