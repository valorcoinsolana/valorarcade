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
const SPRITE_SRC = 32; // source pixel size of artwork (was 16)
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

    // D-pad (touch)
  const dpad = {
    active: false,
    dir: null, // "up" | "down" | "left" | "right"
    cx: 0, cy: 0,
    size: 0,
    btn: 0,
    gap: 0
  };

  let dpadRects = null; // {up,down,left,right} each {x,y,w,h}
  let buttons = [];

  let desktopMenuButtonRect = null;
let desktopMenuRects = null;



  // ✅ Mobile safe areas
  let MOBILE_UI_H = 0;             // reserved bottom for on-canvas controls
  let MOBILE_TOP_UI_H = 0;         // reserved top for HTML text box
  let MOBILE_CAMERA_Y_OFFSET = 0;  // small camera nudge

  // ✅ Compressed mobile controls
  let mobileMenuOpen = false;
  let hotbarRects = []; // [{slot,x,y,w,h}]
  let invOpen = false;
let invScroll = 0;
  // which inventory row is selected (0-based within the FULL inv array)
let invIndex = 0;
  // Inventory overlay touch hit-rects (set during drawInventoryOverlay)
let invUIRects = null;     // { panel, close, use, rows:[{i,x,y,w,h}] }
let invPageLines = 8;      // updated each frame from drawInventoryOverlay



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
  const ANIM = {
  tilesMs: 420,  // floor/walls/stairs
  itemsMs: 320,  // potions, gas, etc
  npcMs:   380,
  mobMs:   260,  // enemies
  plyMs:   240,  // player
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
    CTX.drawImage(im, 0, 0, SPRITE_SRC, SPRITE_SRC, x, y, TS, TS);
    CTX.globalAlpha = old;
    return true;
  }

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
  // Part 3 - Resize + Mobile layout (COMPRESSED CONTROLS)
  // ======================
  function updateButtons() {
  const bottomTop = H - MOBILE_UI_H;

  // ----------------------
  // 1) Right-side buttons: WAIT / TALK / MENU (horizontal, anchored right)
  // ----------------------
  const r = (buttons[0] ? buttons[0].r : 42);
  const pad = 14;

  // place them near the bottom of the reserved UI zone
  const btnY = H - r - pad;
  const gap = (r * 2) + 12; // spacing between circle centers

  const menuX = W - r - pad;
  if (buttons[2]) { buttons[2].cx = menuX;         buttons[2].cy = btnY; } // MENU
  if (buttons[1]) { buttons[1].cx = menuX - gap;   buttons[1].cy = btnY; } // TALK
  if (buttons[0]) { buttons[0].cx = menuX - gap*2; buttons[0].cy = btnY; } // WAIT


  // ----------------------
  // 2) Hotbar: shift right to avoid D-pad AND shrink if needed
  // ----------------------
  hotbarRects = [];
  const slots = 5;
  const hotPad = 10;

  // D-pad right edge + padding = "do not start before this"
  const dpadRightEdge = dpad.cx + dpad.size * 0.5;
  const minX = isMobile ? (dpadRightEdge + 22) : 14;
  const maxX = W - 14;

  // available width for hotbar after avoiding D-pad
  const availW = Math.max(120, maxX - minX);
  let size = Math.floor((availW - (slots - 1) * hotPad) / slots);

  // clamp so it doesn't get tiny or huge
  size = clamp(size, 40, 56);

  const totalW = slots * size + (slots - 1) * hotPad;

  // hotbar sits near the TOP of the bottom UI zone
  const y = bottomTop + 12;

  // startX tries to center within available space, but never enters D-pad area
  let startX = minX + Math.max(0, (availW - totalW) / 2);

  // final clamp to screen
  startX = clamp(startX, 14, W - totalW - 14);

  for (let i = 0; i < slots; i++) {
    hotbarRects.push({
      slot: i,
      x: startX + i * (size + hotPad),
      y,
      w: size,
      h: size
    });
  }
}

  function resize() {
    W = C.width = Math.min(innerWidth, 1440);
    H = C.height = Math.min(innerHeight, 820);

    TS = Math.min((W / 30) | 0, (H / 18) | 0, 72);
TS = Math.max(TS, 30);

       // Compact D-pad bottom-left
    dpad.size = Math.min(170, Math.max(120, (Math.min(W, H) * 0.30) | 0));
    dpad.btn  = (dpad.size * 0.30) | 0;   // each arrow button size
    dpad.gap  = (dpad.size * 0.06) | 0;

    const margin = Math.max(18, TS);
    dpad.cx = margin + dpad.size * 0.5;
    dpad.cy = H - margin - dpad.size * 0.5 - (isMobile ? 18 : 0);

    // Precompute rects (up/down/left/right)
    const b = dpad.btn, g = dpad.gap;
    const cx = dpad.cx, cy = dpad.cy;
    dpadRects = {
  up: {
    x: cx - b / 2,
    y: cy - (b + g) - b / 2,
    w: b,
    h: b
  },
  down: {
    x: cx - b / 2,
    y: cy + (b + g) - b / 2,
    w: b,
    h: b
  },
  left: {
    x: cx - (b + g) - b / 2,
    y: cy - b / 2,
    w: b,
    h: b
  },
  right: {
    x: cx + (b + g) - b / 2,
    y: cy - b / 2,
    w: b,
    h: b
  }
};

        if (isMobile) {
      MOBILE_TOP_UI_H = Math.min(H * 0.26, 210);

      const dpadH = dpad.size + 24;
      const hotbarH = 56 + 28; // hotbar + padding
      const rightBtnH = 42 * 3 + 72; // 3 buttons + gaps

      MOBILE_UI_H = Math.min(
        H * 0.40,
        Math.max(dpadH, hotbarH, rightBtnH)
      );

      MOBILE_CAMERA_Y_OFFSET = (MOBILE_UI_H * 0.18) | 0;
    } else {
      MOBILE_TOP_UI_H = 0;
      MOBILE_UI_H = 0;
      MOBILE_CAMERA_Y_OFFSET = 0;
    }


    // Compressed mobile buttons
    const r = clamp((TS * 1.6) | 0, 30, 42); // smaller on small screens
buttons = [
  { id: ".", label: "WAIT", r },
  { id: "t", label: "TALK", r },
  { id: "m", label: "MENU", r },
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

  function onTouchStart(e) {
  // On death/win, still allow MENU + menu option taps (restart/arcade/etc)
  // but block movement, hotbar, dpad, etc.
  const dead = (gameOver || win);

    e.preventDefault();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

    const t = getTouch(e.changedTouches[0]);
        // If dead/win: only allow tapping MENU button + menu options
    if (dead) {
      // 1) Menu option taps when menu open
      if (window.__mobileMenuRects && mobileMenuOpen) {
        for (const r of window.__mobileMenuRects) {
          if (t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h) {
            keys[r.key] = true;
            return;
          }
        }
      }

      // 2) Allow tapping the MENU circle itself to open/close
      for (const b of buttons) {
        if (b.id === "m" && Math.hypot(t.x - b.cx, t.y - b.cy) <= b.r) {
          keys["m"] = true;
          return;
        }
      }

      // swallow all other touches while dead
      return;
    }

        // Inventory overlay taps (mobile)
    if (invOpen && invUIRects) {
      // hit helper
      const hit = (r) => r && (t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h);

      // Close
      if (hit(invUIRects.close)) { keys["i"] = true; return; }

      // Use
      if (hit(invUIRects.use)) { keys["enter"] = true; return; }

      // Tap a row to select
      if (invUIRects.rows && invUIRects.rows.length) {
        for (const rr of invUIRects.rows) {
          if (hit(rr)) {
            invIndex = rr.i | 0;
            return;
          }
        }
      }

      // If tapped inside panel, swallow input so you don't move/act underneath
      if (hit(invUIRects.panel)) return;
    }
    


    // Hotbar taps 1–5
    for (const r of hotbarRects) {
      if (t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h) {
        keys[String(r.slot + 1)] = true;
        return;
      }
    }

    // Menu option taps (save/load/new) when menu open
    if (window.__mobileMenuRects && mobileMenuOpen) {
      for (const r of window.__mobileMenuRects) {
        if (t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h) {
          keys[r.key] = true;
          return;
        }
      }
    }

    // Buttons (WAIT/TALK/MENU)
    for (const b of buttons) {
      if (Math.hypot(t.x - b.cx, t.y - b.cy) <= b.r) {
        keys[b.id] = true;
        return;
      }
    }

        // D-pad press
    if (dpadRects) {
      const hit = (r) => (t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h);
      if (hit(dpadRects.up))    { dpad.active = true; dpad.dir = "up"; return; }
      if (hit(dpadRects.down))  { dpad.active = true; dpad.dir = "down"; return; }
      if (hit(dpadRects.left))  { dpad.active = true; dpad.dir = "left"; return; }
      if (hit(dpadRects.right)) { dpad.active = true; dpad.dir = "right"; return; }
    }

  }

    function onTouchMove(e) {
    if (!dpad.active || !dpadRects) return;
    e.preventDefault();

    const t = getTouch(e.touches[0]);
    const hit = (r) => (t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h);

    if (hit(dpadRects.up)) dpad.dir = "up";
    else if (hit(dpadRects.down)) dpad.dir = "down";
    else if (hit(dpadRects.left)) dpad.dir = "left";
    else if (hit(dpadRects.right)) dpad.dir = "right";
    else dpad.dir = null;
  }


    function onTouchEnd(e) {
    e && e.preventDefault && e.preventDefault();
    for (const b of buttons) keys[b.id] = false;

    dpad.active = false;
    dpad.dir = null;
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
  function getMouse(e) {
  const r = C.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}

function inRect(p, r) {
  return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

C.addEventListener("mousedown", (e) => {
  const p = getMouse(e);

  // allow menu button even when dead/win
  if (!isMobile && inRect(p, desktopMenuButtonRect)) {
    keys["m"] = true;
    e.preventDefault();
    return;
  }

  if (gameOver || win) return;

  // click menu items
  if (!isMobile && mobileMenuOpen && desktopMenuRects) {
    for (const r of desktopMenuRects) {
      if (inRect(p, r)) {
        keys[r.key] = true;
        e.preventDefault();
        return;
      }
    }
  }
});



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

    const start = rooms[0] || { x: 2, y: 2 };
    player.x = start.x;
    player.y = start.y;

    let best = { x: start.x, y: start.y, d: -1 };
    for (const k of seen) {
      const [xs, ys] = k.split(",");
      const x = xs | 0, y = ys | 0;
      if (map[y][x] !== ".") continue;
      const d = Math.abs(x - start.x) + Math.abs(y - start.y);
      if (d > best.d) best = { x, y, d };
    }

    const sx = (best.d >= 0) ? best.x : Math.max(2, map[0].length - 3);
    const sy = (best.d >= 0) ? best.y : Math.max(2, map.length - 3);

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
      const animPhase = (p.x * 5 + p.y * 11 + i * 2) | 0;
      items.push({ ...p, ...t, animPhase });
    }

    for (let i = 0; i < npcCount; i++) {
      const p = randomFloorTile();
      if (!p) break;
      const t = NPC_TYPES[rand(0, NPC_TYPES.length - 1)];
      const animPhase = (p.x * 3 + p.y * 9 + i * 4) | 0;
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
        mobileMenuOpen = isMobile;
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
  if (player.inv.length >= 15) {
    log("Inventory full (15).", "#f96");
    return;
  }

  let placed = false;

  // auto-place usable items into hotbar
  if (it.hotbar) {
    for (let i = 0; i < 5; i++) {
      if (!player.hotbar[i]) {
        player.hotbar[i] = {
          name: it.name,
          kind: it.kind,
          amount: it.amount,
          ch: it.ch
        };
        placed = true;
        break;
      }
    }
  }

  if (!placed) {
    player.inv.push({
      name: it.name,
      kind: it.kind,
      amount: it.amount,
      ch: it.ch
    });
  }

  log(`Picked up: ${it.name}`, "#0ff");
  beep(880, 0.05, 0.10);
  items = items.filter(x => x !== it);
}

// ======================
// Item usage (shared)
// ======================
// ======================
// Item usage (shared)
// ======================
function applyItem(it) {
  if (!it) return false;

  if (it.kind === "heal") {
    const before = player.hp;
    player.hp = Math.min(player.maxhp, player.hp + it.amount);
    log(`Healed ${player.hp - before}.`, "#9f9");
    beep(640, 0.06, 0.10, "triangle");
    return true;
  }

  if (it.kind === "gas") {
    player.gas += it.amount;
    log(`+${it.amount} Gas.`, "#0ff");
    beep(880, 0.05, 0.10);
    return true;
  }

  if (it.kind === "xp") {
    gainXP(it.amount);
    return true;
  }

  if (it.kind === "atk") {
    player.atk += it.amount;
    log(`ATK +${it.amount}.`, "#f6f");
    beep(520, 0.05, 0.10, "triangle");
    return true;
  }

  if (it.kind === "def") {
    player.def += it.amount;
    log(`DEF +${it.amount}.`, "#6ff");
    beep(520, 0.05, 0.10, "triangle");
    return true;
  }

  log("That item can't be used.", "#f96");
  return false;
}


// ======================
// Hotbar usage (1–5)
// ======================
function useHotbarItem(slotIndex) {
  const i = slotIndex | 0;
  if (i < 0 || i > 4) return;

  const it = player.hotbar[i];
  if (!it) {
    log(`Hotbar ${i + 1} is empty.`, "#aaa");
    return;
  }

  if (applyItem(it)) {
    player.hotbar[i] = null;
  }
}

// ======================
// Inventory usage
// ======================
function useInventoryItem(index) {
  const i = index | 0;
  const it = player.inv[i];
  if (!it) { log("No item selected.", "#aaa"); return; }

  if (!applyItem(it)) return;

  // remove used item
  player.inv.splice(i, 1);

  // keep cursor valid
  invIndex = clamp(invIndex, 0, Math.max(0, player.inv.length - 1));
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
  function tryNudgeNPC(n) {
  if (!n) return false;

  // try random-ish order so it feels less robotic
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = dirs[i]; dirs[i] = dirs[j]; dirs[j] = tmp;
  }

  for (const [dx, dy] of dirs) {
    const tx = n.x + dx, ty = n.y + dy;

    // must be a walkable floor tile
    if (isWall(tx, ty)) continue;
    if (map[ty]?.[tx] !== ".") continue;        // don't step onto stairs '>' etc
    if (getEntityAt(tx, ty)) continue;
    if (getNPCAt(tx, ty)) continue;
    if (getItemAt(tx, ty)) continue;
    if (tx === player.x && ty === player.y) continue;

    n.x = tx; n.y = ty;
    return true;
  }
  return false;
}


  function tryMove(dx, dy) {
    if (gameOver || win) return false;
    const nx = player.x + dx, ny = player.y + dy;
    if (isWall(nx, ny)) { beep(100, 0.04, 0.10, "square"); return false; }
    const n = getNPCAt(nx, ny);
if (n) {
  // Let NPC step aside if possible (prevents corridor soft-lock)
  if (tryNudgeNPC(n)) {
    log(`${n.name} steps aside.`, n.color || "#ff9");
    // continue movement (tile is now free)
  } else {
    log("An NPC blocks the path. Press T to talk.", "#ff9");
    return false;
  }
}


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
    // D-pad (touch)
    if (dpad.active && dpad.dir) {
      if (dpad.dir === "up") return { dx: 0, dy: -1 };
      if (dpad.dir === "down") return { dx: 0, dy: 1 };
      if (dpad.dir === "left") return { dx: -1, dy: 0 };
      if (dpad.dir === "right") return { dx: 1, dy: 0 };
    }

    if (keys["arrowup"] || keys["w"] || keys["k"]) return { dx: 0, dy: -1 };
    if (keys["arrowdown"] || keys["s"] || keys["j"]) return { dx: 0, dy: 1 };
    if (keys["arrowleft"] || keys["a"] || keys["h"]) return { dx: -1, dy: 0 };
    if (keys["arrowright"] || keys["d"] || keys["l"]) return { dx: 1, dy: 0 };
    return null;
  }

  let lastActionAt = 0;

 function playerTurn() {
  // If menu is open, only allow menu actions + toggles (M / I)
if (mobileMenuOpen) {
  if (!(keys["save"] || keys["load"] || keys["new"] || keys["n"] || keys["arcade"] || keys["m"] || keys["i"])) {
    return;
  }
}

 // Inventory navigation (when open)
if (invOpen) {
  const total = player.inv.length;

  if (keys["arrowup"] || keys["k"]) {
    keys["arrowup"] = false; keys["k"] = false;
    invIndex--;
  }
  if (keys["arrowdown"] || keys["j"]) {
    keys["arrowdown"] = false; keys["j"] = false;
    invIndex++;
  }

  invIndex = clamp(invIndex, 0, Math.max(0, total - 1));

    // keep scroll roughly following selection (page size matches drawn overlay)
  const page = Math.max(3, invPageLines | 0);
  invScroll = clamp(invIndex - 1, 0, Math.max(0, total - page));

}


  const now = performance.now();
  if (now - lastActionAt < 95) return;

  if (gameOver || win) {
  // allow MENU toggle while dead
  if (keys["m"]) { keys["m"] = false; mobileMenuOpen = !mobileMenuOpen; }

  // allow restart via key OR menu item
  if (keys["n"] || keys["new"]) {
    keys["n"] = false;
    keys["new"] = false;
    newGame();
    return;
  }

  // allow arcade return via menu item
  if (keys["arcade"]) {
    keys["arcade"] = false;
    location.href = "https://valorcoinsolana.github.io/valorarcade/";
    return;
  }

  // optional: allow save/load even on death screen
  if (keys["save"]) { keys["save"] = false; saveGame(); }
  if (keys["load"]) { keys["load"] = false; if (!loadGame()) log("No save found.", "#aaa"); }

  return;
}

  let acted = false;

  // --- Toggles always allowed ---
  if (keys["m"]) { keys["m"] = false; mobileMenuOpen = !mobileMenuOpen; }
  if (keys["i"]) { keys["i"] = false; invOpen = !invOpen; }

  if (invOpen) {
  // Use item: Enter or Space (desktop)
  if (keys["enter"] || keys[" "]) {
    keys["enter"] = false;
    keys[" "] = false;
    useInventoryItem(invIndex);
  }

  updateUI();
  return;
}


  // Hotbar use (tap 1–5 or keyboard 1–5)
  for (let i = 1; i <= 5; i++) {
    if (keys[String(i)]) {
      keys[String(i)] = false;
      useHotbarItem(i - 1); // was useItem()
      acted = true;
    }
  }

  if (keys["t"]) { keys["t"] = false; talkNearest(); acted = true; }

  // Desktop hotkeys
  if (keys["p"]) { keys["p"] = false; saveGame(); }
  if (keys["l"]) { keys["l"] = false; if (!loadGame()) log("No save found.", "#aaa"); }
  if (keys["n"]) { keys["n"] = false; newGame(); acted = true; }

  // Mobile menu actions (virtual keys)
  if (keys["save"]) { keys["save"] = false; saveGame(); }
  if (keys["load"]) { keys["load"] = false; if (!loadGame()) log("No save found.", "#aaa"); }
  if (keys["new"])  { keys["new"]  = false; newGame(); acted = true; }
   if (keys["arcade"]) {
  keys["arcade"] = false;
  // Return to Arcade hub
  location.href = "https://valorcoinsolana.github.io/valorarcade/";
  return;
}


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

    // Safe world viewport: between top HTML UI and bottom touch UI
    const topSafe = isMobile ? MOBILE_TOP_UI_H : 0;
    const bottomSafe = isMobile ? MOBILE_UI_H : 0;
    const safeH = Math.max(120, H - topSafe - bottomSafe);

    const cx = W / 2;
    const cy = topSafe + safeH / 2 - MOBILE_CAMERA_Y_OFFSET;

    const ox = cx - player.x * TS;
    const oy = cy - player.y * TS;

    CTX.fillStyle = "rgba(0,40,0,0.12)";
    CTX.fillRect(0, 0, W, H);

    // Clip world so it does NOT render under top HTML UI or bottom controls
    let didClip = false;
    if (isMobile) {
      didClip = true;
      CTX.save();
      CTX.beginPath();
      CTX.rect(0, MOBILE_TOP_UI_H, W, H - MOBILE_TOP_UI_H - MOBILE_UI_H);
      CTX.clip();
    }

    const y0 = clamp(((topSafe - oy) / TS | 0) - 2, 0, map.length - 1);
    const y1 = clamp((((topSafe + safeH) - oy) / TS | 0) + 2, 0, map.length - 1);
    const x0 = clamp(((0 - ox) / TS | 0) - 2, 0, map[0].length - 1);
    const x1 = clamp(((W - ox) / TS | 0) + 2, 0, map[0].length - 1);

    CTX.font = `${(TS * 0.9) | 0}px "Courier New", monospace`;
    CTX.textBaseline = "top";

    // Tiles
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!explored[y][x]) continue;

      const vis = isVisible(x, y);
      const ch = map[y][x];
      const px = ox + x * TS;
      const py = oy + y * TS;

      if (ch === "#") CTX.fillStyle = vis ? "rgba(10,60,20,0.85)" : "rgba(8,20,12,0.60)";
      else CTX.fillStyle = vis ? "rgba(0,15,0,0.7)" : "rgba(0,8,0,0.45)";
      CTX.fillRect(px, py, TS, TS);

      if (vis) {
        const frames = tileFrames(ch);
        const phase = (x * 3 + y * 5) & 7;
        if (!drawSpriteFrames(frames, px, py, 1, nowMs, ANIM.tilesMs, phase) && ch === ">") {
          drawText(px + 4, py + 2, ">", "#ff9");
        }
      }
    }

    // Items
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

    // NPCs
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

    // Enemies
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

        // --- enemy HP bar ABOVE the sprite ---
  const w = TS - 4;
  const hpw = Math.max(0, (w * (e.hp / e.maxhp)) | 0);

  const barH = 4;
  const barX = px + 2;

  // keep bar inside visible world (don’t overlap top UI)
  const worldTop = isMobile ? MOBILE_TOP_UI_H : 0;
  let barY = py - (barH + 3);
  barY = Math.max(worldTop + 2, barY);

  CTX.fillStyle = "rgba(0,0,0,0.6)";
  CTX.fillRect(barX, barY, w, barH);

  CTX.fillStyle = "rgba(255,80,80,0.9)";
  CTX.fillRect(barX, barY, hpw, barH);

    }

    // Player
    {
      const px = ox + player.x * TS;
      const py = oy + player.y * TS;

      CTX.fillStyle = "rgba(0,255,160,0.12)";
      CTX.fillRect(px - 3, py - 3, TS + 6, TS + 6);

      if (!drawSpriteFrames(GFX.frames.player, px, py, 1, nowMs, ANIM.plyMs, 0)) {
        drawText(px + 4, py + 2, "@", "#0f8");
      }
    }
        // ===== UI overlays (minimap + menu + controls) =====
    // world is clipped on mobile; UI should draw OUTSIDE the clip
    if (didClip) CTX.restore();

    // Desktop UI (menu button + dropdown)
    if (!isMobile) drawDesktopMenuUI();

    // Minimap (needs desktopMenuButtonRect to be set first)
    drawMinimap();

    // Inventory overlay
    if (invOpen) drawInventoryOverlay();

    // Mobile controls (dpad/hotbar/buttons/menu overlay)
    if (isMobile) drawMobileControls();

    requestAnimationFrame(render);

    requestAnimationFrame(render);
  }

  function drawMinimap() {
  const mw = 170, mh = 120;
  const x0 = W - mw - 16;

  const desktopMenuPad = (!isMobile && desktopMenuButtonRect)
    ? (desktopMenuButtonRect.h + 12)
    : 0;

  const y0 = isMobile
    ? (MOBILE_TOP_UI_H + 12)
    : (16 + desktopMenuPad);

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


  function drawInventoryOverlay() {
  const pad = 18;
  const w = Math.min(560, W - pad * 2);
  const h = Math.min(460, H - pad * 2 - (isMobile ? MOBILE_UI_H : 0));

  const x = (W - w) / 2;
  const y = (isMobile ? MOBILE_TOP_UI_H + 12 : 16);

  // panel
  CTX.fillStyle = "rgba(0,0,0,0.82)";
  CTX.fillRect(x, y, w, h);
  CTX.strokeStyle = "rgba(0,255,120,0.25)";
  CTX.strokeRect(x, y, w, h);

  // Title
  CTX.font = `bold 18px "Courier New", monospace`;
  CTX.fillStyle = "rgba(0,255,180,0.9)";
  CTX.textAlign = "left";
  CTX.textBaseline = "top";
  CTX.fillText("INVENTORY", x + 14, y + 12);

  // Hint line
  CTX.font = `14px "Courier New", monospace`;
  CTX.fillStyle = "rgba(0,255,160,0.70)";
  CTX.fillText(isMobile ? "Tap item → USE. Tap CLOSE to exit." : "↑/↓ (or J/K), Enter/Space to use, I to close", x + 14, y + 34);

  // Layout
  const listX = x + 14;
  const listY = y + 62;
  const lineH = 22;

  // Reserve bottom area for buttons (especially on mobile)
  const btnAreaH = isMobile ? 58 : 44;
  const listH = Math.max(120, (h - 62 - btnAreaH - 12));
  const maxLines = Math.max(3, (listH / lineH) | 0);

  invPageLines = maxLines;

  // Hotbar preview (non-selectable)
  const hotbarLines = 5;
  CTX.font = `bold 15px "Courier New", monospace`;
  CTX.fillStyle = "rgba(0,255,180,0.85)";
  CTX.fillText("HOTBAR", listX, listY - 2);

  CTX.font = `14px "Courier New", monospace`;
  for (let i = 0; i < hotbarLines; i++) {
    const it = player.hotbar[i];
    const yy = listY + (i + 1) * lineH;
    CTX.fillStyle = "rgba(0,255,160,0.70)";
    CTX.fillText(`${i + 1}: ${it ? it.name : "(empty)"}`, listX, yy);
  }

  // Inventory header
  const invHeaderY = listY + (hotbarLines + 2) * lineH;
  CTX.font = `bold 15px "Courier New", monospace`;
  CTX.fillStyle = "rgba(0,255,180,0.85)";
  CTX.fillText("BAG", listX, invHeaderY);

  // Inventory rows start
  const rowsY0 = invHeaderY + lineH;
  const rowsH = (y + h - btnAreaH - 12) - rowsY0;
  const invMaxLines = Math.max(1, (rowsH / lineH) | 0);

  // Scroll and clamp selection
  const total = player.inv.length;
  invIndex = clamp(invIndex, 0, Math.max(0, total - 1));
  invScroll = clamp(invScroll, 0, Math.max(0, total - invMaxLines));

  // If empty inventory
  if (total === 0) {
    CTX.font = `14px "Courier New", monospace`;
    CTX.fillStyle = "rgba(200,200,200,0.75)";
    CTX.fillText("(empty)", listX, rowsY0 + 4);
  }

  // Build touch rects for visible rows
  const rows = [];
  const rowW = w - 28;
  for (let li = 0; li < invMaxLines; li++) {
    const idx = invScroll + li;
    if (idx >= total) break;

    const yy = rowsY0 + li * lineH;

    // highlight selected
    if (idx === invIndex) {
      CTX.fillStyle = "rgba(0,255,120,0.12)";
      CTX.fillRect(listX - 6, yy - 2, rowW, lineH);
      CTX.strokeStyle = "rgba(0,255,180,0.25)";
      CTX.strokeRect(listX - 6, yy - 2, rowW, lineH);
    }

    const it = player.inv[idx];
    CTX.font = `16px "Courier New", monospace`;
    CTX.fillStyle = (idx === invIndex) ? "rgba(0,255,200,0.95)" : "rgba(0,255,160,0.85)";
    CTX.fillText(`${idx + 1}. ${it.name}`, listX, yy);

    rows.push({ i: idx, x: listX - 6, y: yy - 2, w: rowW, h: lineH });
  }

  // Simple scrollbar (inventory only)
  if (total > invMaxLines) {
    const trackX = x + w - 10;
    const trackY = rowsY0;
    const trackH = invMaxLines * lineH;

    CTX.fillStyle = "rgba(0,255,120,0.14)";
    CTX.fillRect(trackX, trackY, 4, trackH);

    const thumbH = Math.max(18, (trackH * (invMaxLines / total)) | 0);
    const thumbY = trackY + ((trackH - thumbH) * (invScroll / (total - invMaxLines)));
    CTX.fillStyle = "rgba(0,255,180,0.55)";
    CTX.fillRect(trackX, thumbY, 4, thumbH);
  }

  // Bottom buttons: USE + CLOSE
  const btnY = y + h - btnAreaH;
  const btnPad = 12;
  const btnH = isMobile ? 44 : 32;
  const btnW = ((w - btnPad * 3) / 2) | 0;

  const useRect = { x: x + btnPad, y: btnY + (btnAreaH - btnH) / 2, w: btnW, h: btnH };
  const closeRect = { x: x + btnPad * 2 + btnW, y: useRect.y, w: btnW, h: btnH };

  // USE
  CTX.fillStyle = "rgba(0,255,120,0.10)";
  CTX.fillRect(useRect.x, useRect.y, useRect.w, useRect.h);
  CTX.strokeStyle = "rgba(0,255,120,0.22)";
  CTX.strokeRect(useRect.x, useRect.y, useRect.w, useRect.h);
  CTX.fillStyle = "rgba(0,255,180,0.85)";
  CTX.font = `bold 16px "Courier New", monospace`;
  CTX.textAlign = "center";
  CTX.textBaseline = "middle";
  CTX.fillText("USE", useRect.x + useRect.w / 2, useRect.y + useRect.h / 2);

  // CLOSE
  CTX.fillStyle = "rgba(0,255,120,0.06)";
  CTX.fillRect(closeRect.x, closeRect.y, closeRect.w, closeRect.h);
  CTX.strokeStyle = "rgba(0,255,120,0.16)";
  CTX.strokeRect(closeRect.x, closeRect.y, closeRect.w, closeRect.h);
  CTX.fillStyle = "rgba(0,255,160,0.75)";
  CTX.fillText("CLOSE", closeRect.x + closeRect.w / 2, closeRect.y + closeRect.h / 2);

  // Publish touch rects
  invUIRects = {
    panel: { x, y, w, h },
    use: useRect,
    close: closeRect,
    rows
  };

  // restore defaults
  CTX.textAlign = "left";
  CTX.textBaseline = "top";
}

function drawDesktopMenuUI() {
  // Small top-right MENU button
  const btnW = 120, btnH = 30;
  const x = W - btnW - 16;
  const y = 16;

  desktopMenuButtonRect = { x, y, w: btnW, h: btnH };

  CTX.fillStyle = "rgba(0,0,0,0.55)";
  CTX.fillRect(x, y, btnW, btnH);
  CTX.strokeStyle = "rgba(0,255,120,0.22)";
  CTX.strokeRect(x, y, btnW, btnH);
  CTX.font = `bold 14px "Courier New", monospace`;
  CTX.fillStyle = "rgba(0,255,180,0.85)";
  CTX.textAlign = "center";
  CTX.textBaseline = "middle";
  CTX.fillText("MENU (M)", x + btnW / 2, y + btnH / 2);

  // Menu overlay when open
  if (!mobileMenuOpen) {
    desktopMenuRects = null;
    CTX.textAlign = "left";
    CTX.textBaseline = "top";
    return;
  }

  const opts = [
    { k:"save",   t:"SAVE" },
    { k:"load",   t:"LOAD" },
    { k:"new",    t:"NEW"  },
    { k:"i",      t:"INVENTORY" },
    { k:"n",      t:"RESTART" },
    { k:"arcade", t:"ARCADE" },
  ];

  const rowH = 36;
  const headerH = 44;
  const innerPad = 14;

  const mw = 280;
  const mh = headerH + opts.length * rowH + innerPad; // ✅ dynamic height

  const mx = W - mw - 16;
  const my = y + btnH + 10;

  CTX.fillStyle = "rgba(0,0,0,0.72)";
  CTX.fillRect(mx, my, mw, mh);
  CTX.strokeStyle = "rgba(0,255,120,0.25)";
  CTX.strokeRect(mx, my, mw, mh);

  CTX.font = `bold 16px "Courier New", monospace`;
  CTX.fillStyle = "rgba(0,255,180,0.85)";
  CTX.textAlign = "left";
  CTX.textBaseline = "top";
  CTX.fillText("MENU", mx + 14, my + 14);

  const rowY0 = my + 44;

  desktopMenuRects = opts.map((o, idx) => ({
    key: o.k,
    x: mx + 14,
    y: rowY0 + idx * rowH,
    w: mw - 28,
    h: 30,
    label: o.t
  }));

  CTX.font = `14px "Courier New", monospace`;
  for (const rr of desktopMenuRects) {
    CTX.fillStyle = "rgba(0,255,120,0.06)";
    CTX.fillRect(rr.x, rr.y, rr.w, rr.h);
    CTX.strokeStyle = "rgba(0,255,120,0.16)";
    CTX.strokeRect(rr.x, rr.y, rr.w, rr.h);
    CTX.fillStyle = "rgba(0,255,180,0.80)";
    CTX.fillText(rr.label, rr.x + 10, rr.y + 8);
  }

  CTX.textAlign = "left";
  CTX.textBaseline = "top";
}



  function drawMobileControls() {
  CTX.font = `bold 14px "Courier New", monospace`;
  CTX.textAlign = "center";
  CTX.textBaseline = "middle";

  // D-pad
  if (!dpadRects) return;


    const drawBtn = (r, label) => {
      CTX.fillStyle = "rgba(0,255,120,0.07)";
      CTX.fillRect(r.x, r.y, r.w, r.h);
      CTX.strokeStyle = "rgba(0,255,120,0.22)";
      CTX.strokeRect(r.x, r.y, r.w, r.h);
      CTX.fillStyle = "rgba(0,255,180,0.80)";
      CTX.fillText(label, r.x + r.w/2, r.y + r.h/2);
    };

    drawBtn(dpadRects.up, "▲");
    drawBtn(dpadRects.down, "▼");
    drawBtn(dpadRects.left, "◀");
    drawBtn(dpadRects.right, "▶");


    // Buttons + hotbar
    CTX.font = `bold 14px "Courier New", monospace`;
    CTX.textAlign = "center";
    CTX.textBaseline = "middle";

    // Right cluster (WAIT/TALK/MENU)
    for (const b of buttons) {
      CTX.fillStyle = "rgba(0,255,120,0.08)";
      CTX.beginPath(); CTX.arc(b.cx, b.cy, b.r, 0, Math.PI*2); CTX.fill();
      CTX.strokeStyle = "rgba(0,255,120,0.22)";
      CTX.beginPath(); CTX.arc(b.cx, b.cy, b.r, 0, Math.PI*2); CTX.stroke();
      CTX.fillStyle = "rgba(0,255,160,0.75)";
      CTX.fillText(b.label, b.cx, b.cy);
    }

    // Hotbar row (tap 1–5)
    for (let i = 0; i < hotbarRects.length; i++) {
      const r = hotbarRects[i];
      CTX.fillStyle = "rgba(0,255,120,0.07)";
      CTX.fillRect(r.x, r.y, r.w, r.h);
      CTX.strokeStyle = "rgba(0,255,120,0.18)";
      CTX.strokeRect(r.x, r.y, r.w, r.h);

      CTX.fillStyle = "rgba(0,255,180,0.75)";
      CTX.fillText(String(i + 1), r.x + r.w / 2, r.y + r.h / 2);
    }

    // Menu overlay (SAVE/LOAD/NEW)
    if (mobileMenuOpen) {
      const w = 260, h = 170;
      const x = W - w - 18;
      const y = H - MOBILE_UI_H - h - 14;

      CTX.fillStyle = "rgba(0,0,0,0.72)";
      CTX.fillRect(x, y, w, h);
      CTX.strokeStyle = "rgba(0,255,120,0.25)";
      CTX.strokeRect(x, y, w, h);

      CTX.fillStyle = "rgba(0,255,180,0.85)";
      CTX.textAlign = "left";
      CTX.fillText("MENU", x + 14, y + 22);

     const opts = [
  { k:"save",   t:"SAVE" },
  { k:"load",   t:"LOAD" },
  { k:"new",    t:"NEW"  },
  { k:"i",      t:"INVENTORY" },
  { k:"arcade", t:"ARCADE" },
];


      const rowY0 = y + 44;
      const rowH = 40;

      window.__mobileMenuRects = opts.map((o, idx) => ({
        key: o.k,
        x: x + 14,
        y: rowY0 + idx * rowH,
        w: w - 28,
        h: 32,
        label: o.t
      }));

      for (const rr of window.__mobileMenuRects) {
        CTX.fillStyle = "rgba(0,255,120,0.06)";
        CTX.fillRect(rr.x, rr.y, rr.w, rr.h);
        CTX.strokeStyle = "rgba(0,255,120,0.16)";
        CTX.strokeRect(rr.x, rr.y, rr.w, rr.h);
        CTX.fillStyle = "rgba(0,255,180,0.8)";
        CTX.fillText(rr.label, rr.x + 10, rr.y + 16);
      }

      CTX.textAlign = "center";
    } else {
      window.__mobileMenuRects = null;
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

    // don’t auto-open debug overlay on mobile
    if (!isMobile && GFX.missing.length) setArtDebugVisible(true);

    if (!loadGame()) newGame();
    revealFog();
    updateUI();
    render();
  }

  setInterval(playerTurn, 40);
  init();
})();
