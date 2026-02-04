(() => {
  "use strict";

  // ======================
  // Part 0 - DOM + Canvas
  // ======================
  const C = document.getElementById("c");
  const CTX = C.getContext("2d", { alpha: false });

  const UI = {
    hp: document.getElementById("hp"),
    maxhp: document.getElementById("maxhp"),
    lvl: document.getElementById("lvl"),
    xp: document.getElementById("xp"),
    xpNext: document.getElementById("xpNext"),
    atk: document.getElementById("atk"),
    def: document.getElementById("def"),
    gas: document.getElementById("gas"),
    rep: document.getElementById("rep"),
    inv: document.getElementById("inv"),
    floor: document.getElementById("floor"),
    class: document.getElementById("class"),
    log: document.getElementById("log"),
  };

  const ARTDBG = {
    root: document.getElementById("artDebug"),
    toggleBtn: document.getElementById("artToggle"),
    summary: document.getElementById("artSummary"),
    missing: document.getElementById("artMissing"),
    visible: false,
    expanded: true,
  };

  // ======================
  // Part 1 - Globals
  // ======================
  let W = 1280, H = 720, TS = 26;
  const SAVE_KEY = "abyss2026_v4";

  let gameLevel = 1;
  let map = [];
  let explored = [];
  let messages = [];
  let entities = [];
  let items = [];
  let npcs = [];
  let gameOver = false, win = false;

  let meta = { wins: 0, highFloor: 0 };
  let player = null;

  const keys = Object.create(null);
  const isMobile = navigator.maxTouchPoints > 0;

  const joystick = { active:false, dx:0, dy:0, baseX:0, baseY:0, radius:0, knobR:0 };
  let buttons = [];

  let audioCtx = null;

  // ======================
  // Part 2 - Utility
  // ======================
  const rand = (a, b) => (Math.random() * (b - a + 1) | 0) + a;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function beep(freq = 440, dur = 0.08, vol = 0.14, type = "sawtooth") {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + dur);
    } catch { /* ignore */ }
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function log(msg, color = "#ccc") {
    messages.push({ t: msg, c: color });
    if (messages.length > 10) messages.shift();
    UI.log.innerHTML = messages.map(x => `<div style="color:${x.c}">${escapeHtml(x.t)}</div>`).join("");
  }

  // ======================
  // Part X - Animated Pixel Art Assets (16x16)
  // ======================
  const ASSET = {
    // Tiles
    floor:      ["assets/tiles/floor_0.png", "assets/tiles/floor_1.png"],
    wall:       ["assets/tiles/wall_0.png", "assets/tiles/wall_1.png"],
    stairsDown: ["assets/tiles/stairs_down_0.png", "assets/tiles/stairs_down_1.png"],

    // Player
    player: ["assets/tiles/player_0.png", "assets/tiles/player_1.png"],

    // Enemies
    enemyF: ["assets/tiles/enemy_fud_imp_0.png","assets/tiles/enemy_fud_imp_1.png"],
    enemyR: ["assets/tiles/enemy_rug_gremlin_0.png","assets/tiles/enemy_rug_gremlin_1.png"],
    enemyP: ["assets/tiles/enemy_pump_fiend_0.png","assets/tiles/enemy_pump_fiend_1.png"],
    enemyB: ["assets/tiles/enemy_bot_swarm_0.png","assets/tiles/enemy_bot_swarm_1.png"],
    enemyW: ["assets/tiles/enemy_whale_shade_0.png","assets/tiles/enemy_whale_shade_1.png"],

    // Items
    itemPotion: ["assets/tiles/item_potion_0.png","assets/tiles/item_potion_1.png"],
    itemGas:    ["assets/tiles/item_gas_0.png","assets/tiles/item_gas_1.png"],
    itemAtk:    ["assets/tiles/item_atk_0.png","assets/tiles/item_atk_1.png"],
    itemDef:    ["assets/tiles/item_def_0.png","assets/tiles/item_def_1.png"],
    itemXp:     ["assets/tiles/item_xp_0.png","assets/tiles/item_xp_1.png"],

    // NPCs
    npcM:   ["assets/tiles/npc_meme_lord_0.png","assets/tiles/npc_meme_lord_1.png"],
    npcBag: ["assets/tiles/npc_bagholder_0.png","assets/tiles/npc_bagholder_1.png"],
    npcA:   ["assets/tiles/npc_ape_priest_0.png","assets/tiles/npc_ape_priest_1.png"],
  };

  const GFX = {
    ready: false,
    frames: Object.create(null), // key -> [Image|null,...]
    missing: [],
    loadedCount: 0,
    totalCount: 0,
    reportedOnce: false,
  };

  function normalizeUrls(v) { return Array.isArray(v) ? v : [v]; }

  function loadImages(manifest) {
    const flat = [];
    for (const [key, val] of Object.entries(manifest)) {
      const urls = normalizeUrls(val);
      urls.forEach((url, i) => flat.push({ key, i, url }));
    }

    GFX.totalCount = flat.length;
    GFX.loadedCount = 0;
    GFX.missing = [];

    for (const [key, val] of Object.entries(manifest)) {
      const urls = normalizeUrls(val);
      GFX.frames[key] = Array.from({ length: urls.length }, () => null);
    }

    const promises = flat.map(({ key, i, url }) => new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve({ key, i, url, im, ok: true });
      im.onerror = () => resolve({ key, i, url, im: null, ok: false });
      im.src = url;
    }));

    return Promise.all(promises).then((results) => {
      for (const r of results) {
        if (r.ok) { GFX.frames[r.key][r.i] = r.im; GFX.loadedCount++; }
        else GFX.missing.push({ key: r.key, url: r.url });
      }
      GFX.ready = GFX.loadedCount > 0;

      updateArtDebugOverlay();
      log(`Loaded artwork: ${GFX.loadedCount}/${GFX.totalCount}`, (GFX.loadedCount === GFX.totalCount) ? "#0ff" : "#ff9");

      if (GFX.missing.length && !GFX.reportedOnce) {
        GFX.reportedOnce = true;
        log(`Missing art: ${GFX.missing.length} file(s). Press F1 for list.`, "#ff9");
      }
    });
  }

  // ======================
  // Part X2 - Art Debug Overlay
  // ======================
  function setArtDebugVisible(v) {
    ARTDBG.visible = !!v;
    ARTDBG.root.hidden = !ARTDBG.visible;
    if (ARTDBG.visible) updateArtDebugOverlay();
  }

  function updateArtDebugOverlay() {
    if (!ARTDBG.root) return;

    const ok = (GFX.loadedCount === GFX.totalCount);
    const status = ok ? "OK" : "MISSING";
    const statusClass = ok ? "ok" : "bad";

    ARTDBG.summary.innerHTML =
      `<span class="${statusClass}">${status}</span> ` +
      `Loaded <strong>${GFX.loadedCount}</strong> / ${GFX.totalCount} ` +
      `<button id="artExpand">${ARTDBG.expanded ? "Collapse" : "Expand"}</button>`;

    const expandBtn = document.getElementById("artExpand");
    if (expandBtn) {
      expandBtn.onclick = () => { ARTDBG.expanded = !ARTDBG.expanded; updateArtDebugOverlay(); };
    }

    if (!ARTDBG.expanded) { ARTDBG.missing.innerHTML = ""; return; }

    if (!GFX.missing.length) {
      ARTDBG.missing.innerHTML = `<div class="ok">No missing files 🎉</div>`;
      return;
    }

    ARTDBG.missing.innerHTML =
      `<div class="bad">Missing files:</div>` +
      GFX.missing.map(m => `<div>• ${escapeHtml(m.url)}</div>`).join("");
  }

  if (ARTDBG.toggleBtn) ARTDBG.toggleBtn.onclick = () => setArtDebugVisible(false);

  // ======================
  // Part X3 - Animation timing
  // ======================
  // Staggered layers so the whole screen doesn't blink in sync.
  // Feel free to tweak:
  const ANIM = {
    tilesMs: 260,   // floor/walls/stairs shimmer
    itemsMs: 180,   // items pulse
    npcMs:   230,   // npc idle
    mobMs:   150,   // enemies
    plyMs:   140,   // player
  };

  function animIndexFor(nowMs, frameCount, msPerFrame, phase = 0) {
    if (frameCount <= 1) return 0;
    const t = ((nowMs / msPerFrame) | 0) + (phase | 0);
    return ((t % frameCount) + frameCount) % frameCount;
  }

  function firstAvailableFrame(frames) {
    for (const f of frames) if (f) return f;
    return null;
  }

  function drawSpriteFrames(frames, x, y, alpha, nowMs, msPerFrame, phase) {
    if (!frames || frames.length === 0) return false;
    const idx = animIndexFor(nowMs, frames.length, msPerFrame, phase);
    const im = frames[idx] || firstAvailableFrame(frames);
    if (!im) return false;

    const old = CTX.globalAlpha;
    CTX.globalAlpha = alpha;
    CTX.drawImage(im, 0, 0, 16, 16, x, y, TS, TS);
    CTX.globalAlpha = old;
    return true;
  }

  // Sprite lookups return the frame array
  function tileFrames(ch) {
    if (ch === "#") return GFX.frames.wall;
    if (ch === ".") return GFX.frames.floor;
    if (ch === ">") return GFX.frames.stairsDown;
    return null;
  }
  function enemyFrames(ch) {
    if (ch === "f") return GFX.frames.enemyF;
    if (ch === "r") return GFX.frames.enemyR;
    if (ch === "p") return GFX.frames.enemyP;
    if (ch === "b") return GFX.frames.enemyB;
    if (ch === "w") return GFX.frames.enemyW;
    return null;
  }
  function itemFrames(ch) {
    if (ch === "!") return GFX.frames.itemPotion;
    if (ch === "$") return GFX.frames.itemGas;
    if (ch === "+") return GFX.frames.itemAtk;
    if (ch === "*") return GFX.frames.itemDef;
    if (ch === "?") return GFX.frames.itemXp;
    return null;
  }
  function npcFrames(ch) {
    if (ch === "M") return GFX.frames.npcM;
    if (ch === "B") return GFX.frames.npcBag;
    if (ch === "A") return GFX.frames.npcA;
    return null;
  }

  // ======================
  // Part 3 - Resize + Mobile layout
  // ======================
  function updateButtons() {
    const sy = H - 100, sp = 72;
    buttons.forEach((b, i) => { b.cx = W - 180; b.cy = sy - i * sp; });
  }

  function resize() {
    W = C.width = Math.min(innerWidth, 1440);
    H = C.height = Math.min(innerHeight, 820);

    TS = Math.min((W / 70) | 0, (H / 42) | 0, 30);
    TS = Math.max(TS, 14);

    joystick.radius = Math.min(130, H * 0.15);
    joystick.knobR = (joystick.radius * 0.38) | 0;
    joystick.baseX = joystick.radius * 1.5 + 30;
    joystick.baseY = H - joystick.radius * 1.5 - 30;

    buttons = [
      { id: ".", label: "WAIT", r: 65 },
      { id: "1", label: "1", r: 50 },
      { id: "2", label: "2", r: 50 },
      { id: "3", label: "3", r: 50 },
      { id: "4", label: "4", r: 50 },
      { id: "5", label: "5", r: 50 },
      { id: "t", label: "TALK", r: 65 },
      { id: "s", label: "SAVE", r: 65 },
      { id: "l", label: "LOAD", r: 65 },
      { id: "n", label: "NEW",  r: 65 },
    ];
    updateButtons();
  }

  addEventListener("resize", resize);
  resize();

  // ======================
  // Part 4 - Input
  // ======================
  function getTouch(t) {
    const r = C.getBoundingClientRect();
    return { x: (t.clientX - r.left) * W / r.width, y: (t.clientY - r.top) * H / r.height };
  }

  function updateJoy(tx, ty) {
    const dx = tx - joystick.baseX;
    const dy = ty - joystick.baseY;
    const d = Math.hypot(dx, dy);
    if (d < joystick.radius) { joystick.dx = dx / joystick.radius; joystick.dy = dy / joystick.radius; }
    else if (d) { joystick.dx = dx / d; joystick.dy = dy / d; }
  }

  function onTouchStart(e) {
    if (gameOver || win) return;
    e.preventDefault();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

    const t = getTouch(e.changedTouches[0]);

    for (const b of buttons) {
      if (Math.hypot(t.x - b.cx, t.y - b.cy) <= b.r) { keys[b.id] = true; return; }
    }

    const jd = Math.hypot(t.x - joystick.baseX, t.y - joystick.baseY);
    if (jd <= joystick.radius * 1.7) { joystick.active = true; updateJoy(t.x, t.y); }
  }

  function onTouchMove(e) {
    if (!joystick.active) return;
    e.preventDefault();
    const t = getTouch(e.touches[0]);
    updateJoy(t.x, t.y);
  }

  function onTouchEnd(e) {
    e && e.preventDefault && e.preventDefault();
    for (const b of buttons) keys[b.id] = false;
    joystick.active = false; joystick.dx = 0; joystick.dy = 0;
  }

  C.addEventListener("touchstart", onTouchStart, { passive: false });
  C.addEventListener("touchmove", onTouchMove, { passive: false });
  C.addEventListener("touchend", onTouchEnd, { passive: false });
  C.addEventListener("touchcancel", onTouchEnd, { passive: false });

  addEventListener("keydown", (e) => {
    if (e.key === "F1") { e.preventDefault(); setArtDebugVisible(!ARTDBG.visible); return; }
    if (e.repeat) return;
    keys[e.key.toLowerCase()] = true;
  });

  addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  // ======================
  // Part 5 - Save/Load/New
  // ======================
  function saveGame() {
    try {
      const payload = { v: 4, gameLevel, map, explored, player, entities, items, npcs, messages, meta };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      log("Saved to immutable chain.", "#0ff"); beep(880, 0.06, 0.12);
    } catch {
      log("Save failed (gas too high).", "#f66"); beep(120, 0.10, 0.16, "square");
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || d.v !== 4) return false;

      gameLevel = d.gameLevel;
      map = d.map;
      explored = d.explored;
      player = d.player;
      entities = d.entities || [];
      items = d.items || [];
      npcs = d.npcs || [];
      messages = d.messages || [];
      meta = d.meta || meta;

      UI.class.textContent = player.className || "Classic";
      log("Ledger restored. Still HODLing?", "#0ff"); beep(660, 0.06, 0.12);
      return true;
    } catch {
      log("Corrupted block. Can't load.", "#f88");
      return false;
    }
  }

  function newGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch {}
    gameLevel = 1;
    meta.wins = meta.wins || 0;
    meta.highFloor = Math.max(meta.highFloor || 0, gameLevel - 1);

    messages = [];
    gameOver = false; win = false;

    chooseClass(rand(0, CLASSES.length - 1));
    generateFloor();
    storyIntro();
    log("Tip: Find '>' to descend. Floor 25 = Genesis Block.", "#9f9");
  }

  // ======================
  // Part 6 - Content
  // ======================
  const CLASSES = [
    { name: "Solidity Dev", start: { hp: 35, maxhp: 35, atk: 8, def: 4, vision: 12 }, perk: "Audit: +1 vision" },
    { name: "Meme Degenerate", start: { hp: 28, maxhp: 28, atk: 10, def: 2, vision: 10 }, perk: "Pump: +20% XP sometimes" },
    { name: "Rug Survivor", start: { hp: 40, maxhp: 40, atk: 6, def: 5, vision: 11 }, perk: "Dodge: 15% chance avoid damage" },
    { name: "Whale Apprentice", start: { hp: 32, maxhp: 32, atk: 7, def: 4, vision: 11 }, perk: "Whale: start with 200 Gas" },
  ];

  function chooseClass(idx) {
    const cl = CLASSES[idx];
    player = {
      x: 0, y: 0,
      hp: cl.start.hp, maxhp: cl.start.maxhp,
      atk: cl.start.atk, def: cl.start.def,
      vision: cl.start.vision + (idx === 0 ? 1 : 0),
      lvl: 1, xp: 0, xpNext: 50,
      gas: (idx === 3) ? 200 : 0,
      rep: 0,
      className: cl.name,
      perk: cl.perk,
      inv: [],
      hotbar: [null, null, null, null, null],
    };
    UI.class.textContent = cl.name;
    log(`Class selected: ${cl.name} — ${cl.perk}`, "#0ff");
  }

  const ENEMY_TYPES = [
    { name:"FUD Imp",     ch:"f", hp:10, atk:4, def:1, xp:14, color:"#f96" },
    { name:"Rug Gremlin", ch:"r", hp:14, atk:5, def:2, xp:20, color:"#f66" },
    { name:"Pump Fiend",  ch:"p", hp:12, atk:6, def:1, xp:22, color:"#6f6" },
    { name:"Bot Swarm",   ch:"b", hp:9,  atk:3, def:0, xp:10, color:"#9cf" },
    { name:"Whale Shade", ch:"w", hp:18, atk:7, def:3, xp:34, color:"#6ff" },
  ];

  const ITEM_TYPES = [
    { name:"Health Potion", kind:"heal", amount: 14, ch:"!", color:"#ff6", hotbar:true },
    { name:"Gas Canister",  kind:"gas",  amount: 60, ch:"$", color:"#0ff", hotbar:true },
    { name:"Attack Patch",  kind:"atk",  amount: 1,  ch:"+", color:"#f6f", hotbar:false },
    { name:"Defense Patch", kind:"def",  amount: 1,  ch:"*", color:"#6ff", hotbar:false },
    { name:"Airdrop XP",    kind:"xp",   amount: 40, ch:"?", color:"#9f9", hotbar:true },
  ];

  const NPC_TYPES = [
    { name:"Meme Lord",  ch:"M", color:"#ff9", lines:["GM. Your bags are heavy.","Diamond hands or NGMI.","I sold the top (I didn't)."]},
    { name:"Bagholder",  ch:"B", color:"#ccc", lines:["It's not a loss if I don't sell.","My portfolio is a museum.","I trust the dev (I am the dev)."]},
    { name:"Ape Priest", ch:"A", color:"#9ff", lines:["Ape together strong.","Buy high, sell... never.","WAGMI, but pay the gas."]},
  ];

  const FLOOR_NAMES = ["Meme Hell","Pump Chasm","Rug Depths","FUD Abyss","WAGMI Vault"];

  // ======================
  // Part 7 - Map generation
  // ======================
  function generateFloor() {
    const WIDTH = 72, HEIGHT = 48;
    map = Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, () => "#"));
    explored = Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, () => false));
    entities = [];
    items = [];
    npcs = [];

    const rooms = [];

    function carveRoom(rx, ry, rw, rh) {
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
        if (x > 0 && x < WIDTH - 1 && y > 0 && y < HEIGHT - 1) map[y][x] = ".";
      }
      rooms.push({ x: (rx + (rw / 2)) | 0, y: (ry + (rh / 2)) | 0 });
    }

    function carveH(x1, x2, y) {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        if (x > 0 && x < WIDTH - 1 && y > 0 && y < HEIGHT - 1) map[y][x] = ".";
      }
    }
    function carveV(y1, y2, x) {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        if (x > 0 && x < WIDTH - 1 && y > 0 && y < HEIGHT - 1) map[y][x] = ".";
      }
    }

    function bsp(x, y, w, h, depth = 0) {
      const stop = (w < 10 || h < 8 || (depth > 7 && Math.random() < 0.65));
      if (stop) {
        const rw = rand(6, Math.max(6, w - 6));
        const rh = rand(6, Math.max(6, h - 6));
        const rx = x + rand(2, Math.max(2, w - rw - 3));
        const ry = y + rand(2, Math.max(2, h - rh - 3));
        carveRoom(rx, ry, rw, rh);
        return;
      }

      const splitHoriz = Math.random() < 0.5;
      const beforeRooms = rooms.length;

      if (splitHoriz) {
        const split = rand(5, h - 6);
        bsp(x, y, w, split, depth + 1);
        bsp(x, y + split, w, h - split, depth + 1);

        const r1 = rooms[beforeRooms] || { x: (x + w / 2) | 0, y: (y + split / 2) | 0 };
        const r2 = rooms[rooms.length - 1] || { x: (x + w / 2) | 0, y: (y + split + (h - split) / 2) | 0 };
        carveH(r1.x, r2.x, y + split - 1);
      } else {
        const split = rand(5, w - 6);
        bsp(x, y, split, h, depth + 1);
        bsp(x + split, y, w - split, h, depth + 1);

        const r1 = rooms[beforeRooms] || { x: (x + split / 2) | 0, y: (y + h / 2) | 0 };
        const r2 = rooms[rooms.length - 1] || { x: (x + split + (w - split) / 2) | 0, y: (y + h / 2) | 0 };
        carveV(r1.y, r2.y, x + split - 1);
      }
    }

    bsp(1, 1, WIDTH - 2, HEIGHT - 2);

    // Flood-fill connectivity: delete disconnected floor
    const seen = new Set();
    const key = (x, y) => x + "," + y;
    function flood(x, y) {
      const k = key(x, y);
      if (seen.has(k)) return;
      if (!map[y] || map[y][x] !== ".") return;
      seen.add(k);
      flood(x - 1, y); flood(x + 1, y); flood(x, y - 1); flood(x, y + 1);
    }
    if (rooms.length) flood(rooms[0].x, rooms[0].y);
    for (let y = 1; y < HEIGHT - 1; y++) for (let x = 1; x < WIDTH - 1; x++) {
      if (map[y][x] === "." && !seen.has(key(x, y))) map[y][x] = "#";
    }

    // Place player
const start = rooms[0] || { x: 2, y: 2 };
player.x = start.x;
player.y = start.y;

// Pick stairs on a CONNECTED tile: farthest '.' from start using the flood-fill set "seen"
let best = { x: start.x, y: start.y, d: -1 };
for (const k of seen) {
  const [xs, ys] = k.split(",");
  const x = xs | 0, y = ys | 0;
  if (map[y][x] !== ".") continue;
  const d = Math.abs(x - start.x) + Math.abs(y - start.y);
  if (d > best.d) best = { x, y, d };
}

// Fallback if something weird happens
const sx = (best.d >= 0) ? best.x : Math.max(2, map[0].length - 3);
const sy = (best.d >= 0) ? best.y : Math.max(2, map.length - 3);

// Ensure stairs aren't on the player
if (sx === player.x && sy === player.y) {
  if (map[sy]?.[sx + 1] === ".") map[sy][sx + 1] = ">";
  else if (map[sy + 1]?.[sx] === ".") map[sy + 1][sx] = ">";
  else map[sy][sx] = ">";
} else {
  map[sy][sx] = ">";
}

spawnContent();


    const nm = FLOOR_NAMES[(gameLevel - 1) % FLOOR_NAMES.length];
    log(`Floor ${gameLevel}: ${nm} — gas fees rising…`, "#f96");
  }

  function getEntityAt(x, y) { return entities.find(e => e.x === x && e.y === y && e.hp > 0) || null; }
  function getNPCAt(x, y) { return npcs.find(n => n.x === x && n.y === y) || null; }
  function getItemAt(x, y) { return items.find(it => it.x === x && it.y === y) || null; }

  function randomFloorTile() {
    for (let i = 0; i < 3000; i++) {
      const y = rand(1, map.length - 2);
      const x = rand(1, map[0].length - 2);
      if (map[y][x] === "." && !getEntityAt(x, y) && !getNPCAt(x, y) && !getItemAt(x, y) && (x !== player.x || y !== player.y)) {
        return { x, y };
      }
    }
    return null;
  }

  function spawnContent() {
    const enemyCount = clamp(6 + gameLevel * 2, 8, 40);
    const itemCount  = clamp(5 + (gameLevel / 2 | 0), 6, 18);
    const npcCount   = clamp((gameLevel % 3 === 0) ? 1 : 0, 0, 2);

    for (let i = 0; i < enemyCount; i++) {
      const p = randomFloorTile();
      if (!p) break;
      const t = ENEMY_TYPES[rand(0, ENEMY_TYPES.length - 1)];
      const scale = 1 + (gameLevel - 1) * 0.06;
      const animPhase = (p.x * 7 + p.y * 13 + i * 3) | 0;

      entities.push({
        ...p,
        name: t.name,
        ch: t.ch,
        color: t.color,
        hp: Math.max(6, (t.hp * scale) | 0),
        maxhp: Math.max(6, (t.hp * scale) | 0),
        atk: Math.max(1, (t.atk * scale) | 0),
        def: Math.max(0, (t.def * scale) | 0),
        xp: Math.max(6, (t.xp * scale) | 0),
        aggro: false,
        animPhase,
      });
    }

    for (let i = 0; i < itemCount; i++) {
      const p = randomFloorTile();
      if (!p) break;
      const t = ITEM_TYPES[rand(0, ITEM_TYPES.length - 1)];
      const animPhase = (p.x * 5 + p.y * 11 + i * 2) | 0; // de-sync pulses
      items.push({ ...p, ...t, animPhase });
    }

    for (let i = 0; i < npcCount; i++) {
      const p = randomFloorTile();
      if (!p) break;
      const t = NPC_TYPES[rand(0, NPC_TYPES.length - 1)];
      const animPhase = (p.x * 3 + p.y * 9 + i * 4) | 0;  // de-sync idles
      npcs.push({ ...p, ...t, animPhase });
    }
  }

  // ======================
  // Part 8 - Gameplay
  // ======================
  function isWall(x, y) { const row = map[y]; return !row || row[x] === "#"; }

  function lineOfSight(ax, ay, bx, by) {
    let x0 = ax, y0 = ay, x1 = bx, y1 = by;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = (x0 < x1) ? 1 : -1;
    const sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    while (true) {
      if (x0 === x1 && y0 === y1) return true;
      if (!(x0 === ax && y0 === ay) && isWall(x0, y0)) return false;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx)  { err += dx; y0 += sy; }
    }
  }

  function isVisible(x, y) {
    return dist(player, { x, y }) <= player.vision + 0.75 && lineOfSight(player.x, player.y, x, y);
  }

  function revealFog() {
    const r = player.vision;
    for (let y = Math.max(0, player.y - r - 1); y <= Math.min(map.length - 1, player.y + r + 1); y++) {
      for (let x = Math.max(0, player.x - r - 1); x <= Math.min(map[0].length - 1, player.x + r + 1); x++) {
        if (isVisible(x, y)) explored[y][x] = true;
      }
    }
  }

  function gainXP(amount) {
    if (player.className === "Meme Degenerate" && Math.random() < 0.20) amount = (amount * 1.2) | 0;
    player.xp += amount;
    log(`+${amount} XP`, "#9f9");
    beep(740, 0.05, 0.10);
    while (player.xp >= player.xpNext) {
      player.xp -= player.xpNext;
      player.lvl++;
      player.xpNext = (player.xpNext * 1.25) | 0;
      player.maxhp += rand(3, 6);
      player.hp = player.maxhp;
      player.atk += (Math.random() < 0.7) ? 1 : 0;
      player.def += (Math.random() < 0.5) ? 1 : 0;
      if (Math.random() < 0.4) player.vision++;
      log(`LEVEL UP! You are now lvl ${player.lvl}.`, "#0ff");
      beep(990, 0.08, 0.14);
    }
  }

  function attack(attacker, target) {
    if (target === player && player.className === "Rug Survivor" && Math.random() < 0.15) {
      log("Dodge! You avoided the hit.", "#6ff");
      beep(520, 0.05, 0.10, "triangle");
      return 0;
    }
    const raw = Math.max(1, attacker.atk - target.def + rand(-1, 2));
    target.hp -= raw;
    if (attacker === player) { log(`You hit ${target.name} for ${raw}.`, "#ff9"); beep(330, 0.05, 0.10); }
    else { log(`${attacker.name} hits you for ${raw}.`, "#f66"); beep(160, 0.08, 0.14, "square"); }

    if (target.hp <= 0) {
      if (target === player) {
        gameOver = true;
        log("You got rugged. GAME OVER.", "#f66");
        beep(90, 0.20, 0.18, "square");
      } else {
        target.hp = 0;
        log(`${target.name} rekt.`, "#9f9");
        gainXP(target.xp);
        player.gas += rand(2, 10);
        if (Math.random() < 0.18) {
          const t = ITEM_TYPES[rand(0, ITEM_TYPES.length - 1)];
          items.push({ x: target.x, y: target.y, ...t, animPhase: (target.x*5 + target.y*11) | 0 });
          log(`${target.name} dropped ${t.name}.`, "#0ff");
        }
      }
    }
    return raw;
  }

  function pickupItem(it) {
    if (!it) return;
    if (player.inv.length >= 15) { log("Inventory full (15).", "#f96"); return; }
    let placed = false;
    if (it.hotbar) for (let i = 0; i < 5; i++) if (!player.hotbar[i]) {
      player.hotbar[i] = { name: it.name, kind: it.kind, amount: it.amount, ch: it.ch };
      placed = true; break;
    }
    if (!placed) player.inv.push({ name: it.name, kind: it.kind, amount: it.amount, ch: it.ch });
    log(`Picked up: ${it.name}`, "#0ff"); beep(880, 0.05, 0.10);
    items = items.filter(x => x !== it);
  }

  function useItem(slotIndex) {
    const idx = slotIndex | 0;
    if (idx < 0 || idx > 4) return;
    const it = player.hotbar[idx];
    if (!it) { log(`Hotbar ${idx+1} is empty.`, "#aaa"); return; }

    if (it.kind === "heal") {
      const before = player.hp;
      player.hp = Math.min(player.maxhp, player.hp + it.amount);
      log(`Healed ${player.hp - before}.`, "#9f9");
      beep(640, 0.06, 0.10, "triangle");
    } else if (it.kind === "gas") {
      player.gas += it.amount;
      log(`+${it.amount} Gas.`, "#0ff");
      beep(880, 0.05, 0.10);
    } else if (it.kind === "xp") {
      gainXP(it.amount);
    } else {
      log("That item is not usable from hotbar.", "#f96");
    }

    player.hotbar[idx] = null;
  }

  function talkNearest() {
    let best = null;
    for (const n of npcs) {
      const d = Math.abs(n.x - player.x) + Math.abs(n.y - player.y);
      if (d <= 2 && (!best || d < best.d)) best = { n, d };
    }
    if (!best) { log("No NPC nearby.", "#aaa"); return; }
    const n = best.n;
    const line = n.lines[rand(0, n.lines.length - 1)];
    log(`${n.name}: "${line}"`, n.color);
    player.rep += rand(-1, 2);
    if (Math.random() < 0.25) player.gas += rand(1, 8);
    beep(520, 0.04, 0.10, "triangle");
  }

  function tryMove(dx, dy) {
    if (gameOver || win) return false;
    const nx = player.x + dx, ny = player.y + dy;
    if (isWall(nx, ny)) { beep(100, 0.04, 0.10, "square"); return false; }
    if (getNPCAt(nx, ny)) { log("An NPC blocks the path. Press T to talk.", "#ff9"); return false; }

    const e = getEntityAt(nx, ny);
    if (e && e.hp > 0) { attack(player, e); return true; }

    player.x = nx; player.y = ny;

    const it = getItemAt(nx, ny);
    if (it) pickupItem(it);

    if (map[ny][nx] === ">") {
      if (gameLevel >= 25) {
        win = true;
        meta.wins = (meta.wins || 0) + 1;
        log("GENESIS BLOCK FOUND. You escaped with an immutable Lambo.", "#0ff");
        beep(1040, 0.20, 0.14);
      } else {
        gameLevel++;
        meta.highFloor = Math.max(meta.highFloor || 0, gameLevel);
        log(`Descending... Floor ${gameLevel}`, "#f96");
        beep(520, 0.08, 0.12);
        generateFloor();
      }
      return true;
    }
    return true;
  }

  function enemyTurn() {
    for (const e of entities) {
      if (e.hp <= 0) continue;

      const canSee = dist(e, player) <= 9 && lineOfSight(e.x, e.y, player.x, player.y);
      if (canSee) e.aggro = true;

      let dx = 0, dy = 0;

      if (e.aggro) {
        const sx = Math.sign(player.x - e.x);
        const sy = Math.sign(player.y - e.y);
        const md = Math.abs(player.x - e.x) + Math.abs(player.y - e.y);
        if (md === 1) { attack(e, player); continue; }

        if (Math.abs(player.x - e.x) > Math.abs(player.y - e.y)) {
          dx = sx;
          if (isWall(e.x + dx, e.y) || getEntityAt(e.x + dx, e.y) || getNPCAt(e.x + dx, e.y)) { dx = 0; dy = sy; }
        } else {
          dy = sy;
          if (isWall(e.x, e.y + dy) || getEntityAt(e.x, e.y + dy) || getNPCAt(e.x, e.y + dy)) { dx = sx; dy = 0; }
        }
      } else {
        if (Math.random() < 0.25) {
          dx = rand(-1, 1);
          dy = (dx === 0) ? rand(-1, 1) : 0;
        } else continue;
      }

      const nx = e.x + dx, ny = e.y + dy;
      if (nx === player.x && ny === player.y) { attack(e, player); continue; }
      if (!isWall(nx, ny) && !getEntityAt(nx, ny) && !getNPCAt(nx, ny) && map[ny][nx] !== ">") {
        e.x = nx; e.y = ny;
      }
    }
  }

  // ======================
  // Part 9 - Turn loop
  // ======================
  function getMoveFromInput() {
    if (joystick.active) {
      const ax = joystick.dx, ay = joystick.dy;
      const th = 0.33;
      if (Math.abs(ax) > Math.abs(ay)) { if (ax > th) return { dx: 1, dy: 0 }; if (ax < -th) return { dx: -1, dy: 0 }; }
      else { if (ay > th) return { dx: 0, dy: 1 }; if (ay < -th) return { dx: 0, dy: -1 }; }
    }
    if (keys["arrowup"] || keys["w"] || keys["k"]) return { dx: 0, dy: -1 };
    if (keys["arrowdown"] || keys["s"] || keys["j"]) return { dx: 0, dy: 1 };
    if (keys["arrowleft"] || keys["a"] || keys["h"]) return { dx: -1, dy: 0 };
    if (keys["arrowright"] || keys["d"] || keys["l"]) return { dx: 1, dy: 0 };
    return null;
  }

  let lastActionAt = 0;

  function playerTurn() {
    const now = performance.now();
    if (now - lastActionAt < 95) return;

    if (gameOver || win) {
      if (keys["n"]) { keys["n"] = false; newGame(); }
      return;
    }

    let acted = false;

    for (let i = 1; i <= 5; i++) if (keys[String(i)]) { keys[String(i)] = false; useItem(i - 1); acted = true; }
    if (keys["t"]) { keys["t"] = false; talkNearest(); acted = true; }

    if (keys["p"]) { keys["p"] = false; saveGame(); }

    if (keys["l"]) { keys["l"] = false; if (!loadGame()) log("No save found.", "#aaa"); }
    if (keys["n"]) { keys["n"] = false; newGame(); acted = true; }
    if (keys["."]) { keys["."] = false; log("You wait.", "#aaa"); acted = true; }

    const mv = getMoveFromInput();
    if (!acted && mv) acted = tryMove(mv.dx, mv.dy);

    if (acted) {
      lastActionAt = now;
      revealFog();
      enemyTurn();
      revealFog();
      if (Math.random() < 0.06) saveGame();
    }

    updateUI();
  }

  function updateUI() {
    UI.hp.textContent = Math.max(0, player.hp | 0);
    UI.maxhp.textContent = player.maxhp | 0;
    UI.lvl.textContent = player.lvl | 0;
    UI.xp.textContent = player.xp | 0;
    UI.xpNext.textContent = player.xpNext | 0;
    UI.atk.textContent = player.atk | 0;
    UI.def.textContent = player.def | 0;
    UI.gas.textContent = player.gas | 0;
    UI.rep.textContent = player.rep | 0;
    UI.floor.textContent = gameLevel | 0;
    UI.inv.textContent = (player.inv.length + player.hotbar.filter(Boolean).length) | 0;
  }

  // ======================
  // Part 10 - Render
  // ======================
  function drawText(x, y, s, color = "#0f8", align="left") {
    CTX.fillStyle = color;
    CTX.textAlign = align;
    CTX.fillText(s, x, y);
  }

  function render() {
    const nowMs = performance.now();

    CTX.fillStyle = "#000";
    CTX.fillRect(0, 0, W, H);

    if (!player || !map.length) { requestAnimationFrame(render); return; }

    const ox = (W / 2) - player.x * TS;
    const oy = (H / 2) - player.y * TS;

    CTX.fillStyle = "rgba(0,40,0,0.12)";
    CTX.fillRect(0, 0, W, H);

    const y0 = clamp(((0 - oy) / TS | 0) - 2, 0, map.length - 1);
    const y1 = clamp(((H - oy) / TS | 0) + 2, 0, map.length - 1);
    const x0 = clamp(((0 - ox) / TS | 0) - 2, 0, map[0].length - 1);
    const x1 = clamp(((W - ox) / TS | 0) + 2, 0, map[0].length - 1);

    // fallback font
    CTX.font = `${(TS * 0.9) | 0}px "Courier New", monospace`;
    CTX.textBaseline = "top";

    // Tiles
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!explored[y][x]) continue;

      const vis = isVisible(x, y);
      const ch = map[y][x];
      const px = ox + x * TS;
      const py = oy + y * TS;

      // underlay shading
      if (ch === "#") CTX.fillStyle = vis ? "rgba(10,60,20,0.85)" : "rgba(8,20,12,0.60)";
      else CTX.fillStyle = vis ? "rgba(0,15,0,0.7)" : "rgba(0,8,0,0.45)";
      CTX.fillRect(px, py, TS, TS);

      if (vis) {
        const frames = tileFrames(ch);
        const phase = (x * 3 + y * 5) & 7; // de-sync tiles
        if (!drawSpriteFrames(frames, px, py, 1, nowMs, ANIM.tilesMs, phase) && ch === ">") {
          drawText(px + 4, py + 2, ">", "#ff9");
        }
      }
    }

    // Items (pulse)
    for (const it of items) {
      if (!explored[it.y]?.[it.x]) continue;
      if (!isVisible(it.x, it.y)) continue;
      const px = ox + it.x * TS;
      const py = oy + it.y * TS;
      const frames = itemFrames(it.ch);
      const phase = it.animPhase || ((it.x * 5 + it.y * 11) & 7);
      if (!drawSpriteFrames(frames, px, py, 1, nowMs, ANIM.itemsMs, phase)) {
        drawText(px + 4, py + 2, it.ch, it.color);
      }
    }

    // NPCs (idle)
    for (const n of npcs) {
      if (!explored[n.y]?.[n.x]) continue;
      if (!isVisible(n.x, n.y)) continue;
      const px = ox + n.x * TS;
      const py = oy + n.y * TS;
      const frames = npcFrames(n.ch);
      const phase = n.animPhase || ((n.x * 3 + n.y * 9) & 7);
      if (!drawSpriteFrames(frames, px, py, 1, nowMs, ANIM.npcMs, phase)) {
        drawText(px + 4, py + 2, n.ch, n.color);
      }
    }

    // Enemies (animated)
    for (const e of entities) {
      if (e.hp <= 0) continue;
      if (!explored[e.y]?.[e.x]) continue;
      if (!isVisible(e.x, e.y)) continue;

      const px = ox + e.x * TS;
      const py = oy + e.y * TS;

      const frames = enemyFrames(e.ch);
      if (!drawSpriteFrames(frames, px, py, 1, nowMs, ANIM.mobMs, e.animPhase || 0)) {
        drawText(px + 4, py + 2, e.ch, e.color);
      }

      const w = TS - 4;
      const hpw = Math.max(0, (w * (e.hp / e.maxhp)) | 0);
      CTX.fillStyle = "rgba(0,0,0,0.6)";
      CTX.fillRect(px + 2, py + TS - 6, w, 4);
      CTX.fillStyle = "rgba(255,80,80,0.9)";
      CTX.fillRect(px + 2, py + TS - 6, hpw, 4);
    }

    // Player (animated)
    {
      const px = ox + player.x * TS;
      const py = oy + player.y * TS;

      CTX.fillStyle = "rgba(0,255,160,0.12)";
      CTX.fillRect(px - 3, py - 3, TS + 6, TS + 6);

      if (!drawSpriteFrames(GFX.frames.player, px, py, 1, nowMs, ANIM.plyMs, 0)) {
        drawText(px + 4, py + 2, "@", "#0f8");
      }
    }

    drawMinimap();
    if (isMobile) drawMobileControls();

    if (gameOver || win) {
      CTX.fillStyle = "rgba(0,0,0,0.55)";
      CTX.fillRect(0, 0, W, H);
      CTX.font = `${Math.max(18, (TS * 1.2) | 0)}px "Courier New", monospace`;
      CTX.textBaseline = "middle";
      CTX.textAlign = "center";
      drawText(W/2, H/2 - 20, gameOver ? "YOU GOT RUGGED" : "GENESIS BLOCK CLEARED", gameOver ? "#f66" : "#0ff", "center");
      CTX.font = `${Math.max(14, (TS * 0.8) | 0)}px "Courier New", monospace`;
      drawText(W/2, H/2 + 16, "Press N to restart", "#ff9", "center");
      CTX.textAlign = "left";
      CTX.textBaseline = "top";
    }

    requestAnimationFrame(render);
  }

  function drawMinimap() {
    const mw = 170, mh = 120;
    const x0 = W - mw - 16;
    const y0 = 16;

    CTX.fillStyle = "rgba(0,20,0,0.65)";
    CTX.fillRect(x0, y0, mw, mh);
    CTX.strokeStyle = "rgba(0,255,120,0.35)";
    CTX.strokeRect(x0, y0, mw, mh);

    const sx = mw / map[0].length;
    const sy = mh / map.length;

    for (let y = 0; y < map.length; y++) for (let x = 0; x < map[0].length; x++) {
      if (!explored[y][x]) continue;
      const ch = map[y][x];
      CTX.fillStyle = (ch === "#") ? "rgba(0,80,40,0.25)" : "rgba(0,255,120,0.10)";
      CTX.fillRect(x0 + x * sx, y0 + y * sy, sx + 0.5, sy + 0.5);
    }

    CTX.fillStyle = "rgba(0,255,180,0.9)";
    CTX.fillRect(x0 + player.x * sx - 1, y0 + player.y * sy - 1, 3, 3);
  }

  function drawMobileControls() {
    const bx = joystick.baseX;
    const by = joystick.baseY;

    CTX.fillStyle = "rgba(0,255,120,0.08)";
    CTX.beginPath(); CTX.arc(bx, by, joystick.radius, 0, Math.PI*2); CTX.fill();
    CTX.strokeStyle = "rgba(0,255,120,0.25)";
    CTX.beginPath(); CTX.arc(bx, by, joystick.radius, 0, Math.PI*2); CTX.stroke();

    const kx = bx + joystick.dx * (joystick.radius - joystick.knobR);
    const ky = by + joystick.dy * (joystick.radius - joystick.knobR);
    CTX.fillStyle = "rgba(0,255,160,0.18)";
    CTX.beginPath(); CTX.arc(kx, ky, joystick.knobR, 0, Math.PI*2); CTX.fill();
    CTX.strokeStyle = "rgba(0,255,160,0.35)";
    CTX.beginPath(); CTX.arc(kx, ky, joystick.knobR, 0, Math.PI*2); CTX.stroke();

    CTX.font = `bold 14px "Courier New", monospace`;
    CTX.textAlign = "center";
    CTX.textBaseline = "middle";

    for (const b of buttons) {
      CTX.fillStyle = "rgba(0,255,120,0.09)";
      CTX.beginPath(); CTX.arc(b.cx, b.cy, b.r, 0, Math.PI*2); CTX.fill();
      CTX.strokeStyle = "rgba(0,255,120,0.25)";
      CTX.beginPath(); CTX.arc(b.cx, b.cy, b.r, 0, Math.PI*2); CTX.stroke();
      CTX.fillStyle = "rgba(0,255,160,0.65)";
      CTX.fillText(b.label, b.cx, b.cy);
    }

    CTX.textAlign = "left";
    CTX.textBaseline = "top";
  }

  // ======================
  // Part 11 - Story + Init
  // ======================
  function storyIntro() {
    [
      "2026 — Dev, you got rugged again. Rugpull.eth 3.0 stole your life savings.",
      "Glitched wallet → sucked into the chain. Now you're in the Abyss.",
      "Reach floor 25 → Genesis Block → rewrite tx#0 → escape with an immutable Lambo.",
      "GM degens. WAGMI if diamond hands. NGMI if paper hands."
    ].forEach(l => log(l, "#ff9"));
  }

  async function init() {
    await loadImages(ASSET);
    if (GFX.missing.length) setArtDebugVisible(true);
    if (!loadGame()) newGame();
    revealFog();
    updateUI();
    render();
  }

  setInterval(playerTurn, 40);
  init();
})();
