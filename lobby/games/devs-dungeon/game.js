(() => {
  "use strict";
   window.__mobileMenuRects = null;

  // ======================
  // Part 0 - DOM + Canvas
  // ======================
  const C = document.getElementById("c");
  const CTX = C.getContext("2d", { alpha: false });
  CTX.imageSmoothingEnabled = false;


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
  // ======================
// Floating combat text
// ======================
let floatTexts = []; // { x,y, text, color, start, dur, rise, jitter }

function spawnFloatText(tx, ty, text, color = "#f66") {
  floatTexts.push({
    x: tx,
    y: ty,
    text: String(text),
    color,
    start: performance.now(),
    dur: 650,        // ms visible
    rise: 0.85,      // tiles to rise over duration
    jitter: (Math.random() * 0.25) - 0.125 // small horizontal variation (tiles)
  });
}

function drawFloatTexts(nowMs, ox, oy) {
  if (!floatTexts.length) return;

  // Clean old
  floatTexts = floatTexts.filter(ft => (nowMs - ft.start) < ft.dur);

  CTX.save();
  CTX.textAlign = "center";
  CTX.textBaseline = "middle";
  CTX.font = `bold ${Math.max(14, (TS * 0.55) | 0)}px "Courier New", monospace`;

  for (const ft of floatTexts) {
    const t = clamp((nowMs - ft.start) / ft.dur, 0, 1);
    const alpha = 1 - t;

    // rise in tile space
    const riseTiles = ft.rise * t;

    // world->screen
    const sx = ox + (ft.x + 0.5 + ft.jitter) * TS;
    const sy = oy + (ft.y + 0.3 - riseTiles) * TS;

    // outline for readability
    CTX.globalAlpha = alpha;
    CTX.lineWidth = Math.max(2, (TS * 0.08) | 0);
    CTX.strokeStyle = "rgba(0,0,0,0.85)";
    CTX.strokeText(ft.text, sx, sy);

    CTX.fillStyle = ft.color;
    CTX.fillText(ft.text, sx, sy);
  }

  CTX.restore();
}

  let gameOver = false, win = false;
  let deathMenuShown = false;


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
  let logOpen = false;
let invScroll = 0;
  // which inventory row is selected (0-based within the FULL inv array)
let invIndex = 0;
  // Inventory overlay touch hit-rects (set during drawInventoryOverlay)
let invUIRects = null;     // { panel, close, use, rows:[{i,x,y,w,h}] }
let invPageLines = 8;      // updated each frame from drawInventoryOverlay



  let audioCtx = null;
    // ======================
  // Gas: tactical + risk meter
  // ======================
  const GAS_CFG = {
    move: 1,      // every successful step
    attack: 3,    // when you swing at an enemy
    wait: 0,      // "." wait costs no gas 
    min: 0
  };

  function clampGas() {
    player.gas = Math.max(GAS_CFG.min, player.gas | 0);
  }

  function spendGas(amount, reason = "") {
    if (!player) return true;
    player.gas = (player.gas | 0) - (amount | 0);
    clampGas();
    return player.gas > 0;
  }

  function gasTier() {
    const g = player.gas | 0;
    // You can tune these thresholds
    if (g <= 0) return 3;      // empty: critical
    if (g <= 10) return 2;     // danger
    if (g <= 25) return 1;     // low
    return 0;                 // ok
  }

  function applyLowGasRisk() {
    const tier = gasTier();
    if (tier === 0) return;

    // tier 1: low gas -> subtle pressure
    if (tier === 1) {
      // small chance to attract attention (more enemies aggro)
      if (Math.random() < 0.12) {
        for (const e of entities) {
          if (e.hp > 0 && dist(e, player) <= 10) e.aggro = true;
        }
        log("Low gas… footsteps echo. Something notices you.", "#ff9");
      }
      return;
    }

    // tier 2: danger -> missteps can hurt
    if (tier === 2) {
      if (Math.random() < 0.18) {
        const dmg = 1 + (Math.random() < 0.35 ? 1 : 0);
        player.hp -= dmg;
        log(`Gas fumes burn your lungs (-${dmg} HP).`, "#f66");
        beep(140, 0.06, 0.12, "square");
        if (player.hp <= 0) {
          player.hp = 0;
          gameOver = true;
          log("You got rugged. GAME OVER.", "#f66");
          mobileMenuOpen = isMobile;
        }
      }
      return;
    }

    // tier 3: empty -> constant threat
    if (tier === 3) {
      // Every acted turn with 0 gas: small damage + nearby enemies instantly aggro
      const dmg = 2;
      player.hp -= dmg;
      log(`Out of gas! The Abyss drains you (-${dmg} HP).`, "#f66");
      beep(100, 0.07, 0.14, "square");

      for (const e of entities) {
        if (e.hp > 0 && dist(e, player) <= 12) e.aggro = true;
      }

      if (player.hp <= 0) {
        player.hp = 0;
        gameOver = true;
        log("You got rugged. GAME OVER.", "#f66");
        mobileMenuOpen = isMobile;
      }
    }
  }

  // ======================
  // Part 2 - Utility
  // ======================
  const rand = (a, b) => (Math.random() * (b - a + 1) | 0) + a;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function enemyCritChanceFromGas(gas) {
  // normalize 0..1 where 1 = empty gas, 0 = safe gas
  const t = clamp((GAS_SAFE - (gas | 0)) / GAS_SAFE, 0, 1);
  return ENEMY_CRIT_MAX * t;
}
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // ======================
// Gas Danger Meter tuning
// ======================
const GAS_SAFE = 120;   // at/above this: 0% crit
const GAS_EMPTY = 0;    // at/near this: max crit
const ENEMY_CRIT_MAX = 0.35; // 35% crit chance at 0 gas
const ENEMY_CRIT_MULT = 1.6; // crit damage multiplier


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

  // keep a longer history for the menu log
  if (messages.length > 100) messages.shift();

  // HUD shows ONLY the most recent message
  if (UI.log) {
    UI.log.innerHTML =
      `<div style="color:${color}">${escapeHtml(msg)}</div>`;
  }
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
    playerU: ["assets/tiles/player_u_0.png", "assets/tiles/player_u_1.png"],
playerD: ["assets/tiles/player_d_0.png", "assets/tiles/player_d_1.png"],
playerL: ["assets/tiles/player_l_0.png", "assets/tiles/player_l_1.png"],
playerR: ["assets/tiles/player_r_0.png", "assets/tiles/player_r_1.png"],


    // Enemies
    enemyF: ["assets/tiles/enemy_fud_imp_0.png","assets/tiles/enemy_fud_imp_1.png"],
    enemyR: ["assets/tiles/enemy_rug_gremlin_0.png","assets/tiles/enemy_rug_gremlin_1.png"],
    enemyP: ["assets/tiles/enemy_pump_fiend_0.png","assets/tiles/enemy_pump_fiend_1.png"],
    enemyB: ["assets/tiles/enemy_bot_swarm_0.png","assets/tiles/enemy_bot_swarm_1.png"],
    enemyW: ["assets/tiles/enemy_whale_shade_0.png","assets/tiles/enemy_whale_shade_1.png"],
        // Enemies (new tiers)
    enemyG: ["assets/tiles/enemy_gas_guzzler_0.png","assets/tiles/enemy_gas_guzzler_1.png"],
    enemyL: ["assets/tiles/enemy_liquidity_leech_0.png","assets/tiles/enemy_liquidity_leech_1.png"],
    enemyO: ["assets/tiles/enemy_oracle_wraith_0.png","assets/tiles/enemy_oracle_wraith_1.png"],
    enemyS: ["assets/tiles/enemy_slippage_horror_0.png","assets/tiles/enemy_slippage_horror_1.png"],
    enemyM: ["assets/tiles/enemy_mev_sniper_0.png","assets/tiles/enemy_mev_sniper_1.png"],
    enemyD: ["assets/tiles/enemy_dust_hoarder_0.png","assets/tiles/enemy_dust_hoarder_1.png"],
    enemyT: ["assets/tiles/enemy_bridge_troll_0.png","assets/tiles/enemy_bridge_troll_1.png"],
    enemyH: ["assets/tiles/enemy_governance_ghoul_0.png","assets/tiles/enemy_governance_ghoul_1.png"],
    enemyK: ["assets/tiles/enemy_forked_abomination_0.png","assets/tiles/enemy_forked_abomination_1.png"],
    enemyV: ["assets/tiles/enemy_validator_revenant_0.png","assets/tiles/enemy_validator_revenant_1.png"],
    enemyZ: ["assets/tiles/enemy_zk_stalker_0.png","assets/tiles/enemy_zk_stalker_1.png"],
    enemyX: ["assets/tiles/enemy_flash_loan_lich_0.png","assets/tiles/enemy_flash_loan_lich_1.png"],
    enemyC: ["assets/tiles/enemy_consensus_breaker_0.png","assets/tiles/enemy_consensus_breaker_1.png"],
    enemyY: ["assets/tiles/enemy_finality_phantom_0.png","assets/tiles/enemy_finality_phantom_1.png"],
    enemyQ: ["assets/tiles/enemy_black_swan_entity_0.png","assets/tiles/enemy_black_swan_entity_1.png"],
    enemyG2: ["assets/tiles/enemy_genesis_parasite_0.png","assets/tiles/enemy_genesis_parasite_1.png"],
        // Mini-bosses (64x64 source)
miniBoss_gas_warden:       ["assets/tiles/miniboss_gas_warden_0.png","assets/tiles/miniboss_gas_warden_1.png"],
miniBoss_slippage_brute:   ["assets/tiles/miniboss_slippage_brute_0.png","assets/tiles/miniboss_slippage_brute_1.png"],
miniBoss_liquidity_reaper: ["assets/tiles/miniboss_liquidity_reaper_0.png","assets/tiles/miniboss_liquidity_reaper_1.png"],
miniBoss_oracle_breaker:   ["assets/tiles/miniboss_oracle_breaker_0.png","assets/tiles/miniboss_oracle_breaker_1.png"],
miniBoss_mev_enforcer:     ["assets/tiles/miniboss_mev_enforcer_0.png","assets/tiles/miniboss_mev_enforcer_1.png"],
miniBoss_consensus_crusher:["assets/tiles/miniboss_consensus_crusher_0.png","assets/tiles/miniboss_consensus_crusher_1.png"],
miniBoss_finality_ravager: ["assets/tiles/miniboss_finality_ravager_0.png","assets/tiles/miniboss_finality_ravager_1.png"],
miniBoss_black_swan_herald:["assets/tiles/miniboss_black_swan_herald_0.png","assets/tiles/miniboss_black_swan_herald_1.png"],
// Bosses (128x128 source)
boss_rugpull_architect: ["assets/tiles/boss_rugpull_architect_0.png","assets/tiles/boss_rugpull_architect_1.png"],
boss_mev_hydra:         ["assets/tiles/boss_mev_hydra_0.png","assets/tiles/boss_mev_hydra_1.png"],
boss_oracle_of_ruin:    ["assets/tiles/boss_oracle_of_ruin_0.png","assets/tiles/boss_oracle_of_ruin_1.png"],
boss_finality_engine:   ["assets/tiles/boss_finality_engine_0.png","assets/tiles/boss_finality_engine_1.png"],
boss_genesis_parasite:  ["assets/tiles/boss_genesis_parasite_0.png","assets/tiles/boss_genesis_parasite_1.png"],

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
  const ENEMY_FRAME_BY_CH = {
  f: "enemyF",
  r: "enemyR",
  p: "enemyP",
  b: "enemyB",
  w: "enemyW",
  g: "enemyG",
  l: "enemyL",
  o: "enemyO",
  s: "enemyS",
  m: "enemyM",
  d: "enemyD",
  t: "enemyT",
  h: "enemyH",
  k: "enemyK",
  v: "enemyV",
  z: "enemyZ",
  x: "enemyX",
  c: "enemyC",
  y: "enemyY",
  q: "enemyQ",
  // capital G enemy (Genesis Parasite)
  G: "enemyG2",
     // Mini-boss symbols → specific named art keys
"µ": "miniBoss_gas_warden",
"¶": "miniBoss_slippage_brute",
"ß": "miniBoss_liquidity_reaper",
"Ø": "miniBoss_oracle_breaker",
"ƒ": "miniBoss_mev_enforcer",
"¢": "miniBoss_consensus_crusher",
"§": "miniBoss_finality_ravager",
"¤": "miniBoss_black_swan_herald",
// Boss symbols → specific named art keys
"Ω": "boss_rugpull_architect",
"Ψ": "boss_mev_hydra",
"Σ": "boss_oracle_of_ruin",
"Λ": "boss_finality_engine",
"Ξ": "boss_genesis_parasite",
};

function enemyFrames(ch) {
  const key = ENEMY_FRAME_BY_CH[ch];
  return key ? GFX.frames[key] : null;
}

  function enemySpriteInfo(e) {
  // frames come ONLY from ch->asset mapping (name-based keys)
  const frames = enemyFrames(e.ch);

  // defaults
  let src = SPRITE_SRC;
  let scale = 1;

  if (e.kind === "miniboss") { src = 64;  scale = 2; }
  else if (e.kind === "boss") { src = 128; scale = 4; }

  return { frames, src, scale };
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
  function playerFramesForFacing(f) {
  if (f === "up") return GFX.frames.playerU;
  if (f === "down") return GFX.frames.playerD;
  if (f === "left") return GFX.frames.playerL;
  if (f === "right") return GFX.frames.playerR;
  return GFX.frames.playerD; // safe default
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
    // Cache tight box rects for WAIT/TALK/MENU (used for draw + hit-test)
  for (const b of buttons) {
    const s = (b.r * 1.3) | 0; // square side length
    b.rect = {
      x: (b.cx - s / 2) | 0,
      y: (b.cy - s / 2) | 0,
      w: s,
      h: s
    };
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

      // 2) Allow tapping the MENU box itself to open/close
for (const b of buttons) {
  if (b.id === "m" && pointInRect(t.x, t.y, b.rect)) {
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

    // Buttons (WAIT/TALK/MENU) - tight boxes
for (const b of buttons) {
  if (pointInRect(t.x, t.y, b.rect)) {
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
  function pointInRect(px, py, r) {
  return r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
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
  function rescaleLoadedEntitiesForFloor(floor) {
  const g = (floor | 0) - 1;
  const scale = 1 + g * 0.05 + g * g * 0.001;

  const byChEnemy = Object.create(null);
  for (const t of ENEMY_TYPES) byChEnemy[t.ch] = t;

  const byChMini = Object.create(null);
  for (const t of MINI_BOSS_TYPES) byChMini[t.ch] = t;

  const byChBoss = Object.create(null);
  for (const t of BOSS_TYPES) byChBoss[t.ch] = t;

  for (const e of entities) {
    if (!e || e.hp <= 0) continue;

    const ratio = (e.maxhp > 0) ? (e.hp / e.maxhp) : 1;

    let base = null;
    if (e.kind === "boss") base = byChBoss[e.ch];
    else if (e.kind === "miniboss") base = byChMini[e.ch];
    else base = byChEnemy[e.ch];

    if (!base) continue;

    const newMax = Math.max(1, (base.hp * scale) | 0);
    e.maxhp = newMax;
    e.hp = Math.max(1, (newMax * ratio) | 0);

    e.atk = Math.max(1, (base.atk * scale) | 0);
    e.def = Math.max(0, (base.def * scale) | 0);
    e.xp  = Math.max(1, (base.xp  * scale) | 0);
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
      // --- migrate older saves ---
if (!player.facing) player.facing = "down";
if (player.step !== 0 && player.step !== 1) player.step = 0;
if (!player.stepAt) player.stepAt = 0;
      // --- migrate old inventory/hotbar items to stacks ---
function normalizeStackEntry(s) {
  if (!s) return s;

  // normalize renamed items
  if (s.kind === "heal") s.name = "Liquidity Potion";
  if (s.kind === "gas")  s.name = "Gas";
  if (s.kind === "atk")  s.name = "New Coin Patch";
  if (s.kind === "def")  s.name = "KYC Patch";
  if (s.kind === "xp")   s.name = "Mining Pick-aXP";

  if (s.qty == null) s.qty = 1;
  if (s.max == null) s.max = stackMaxForKind(s.kind);

  return s;
}

if (player.inv && Array.isArray(player.inv)) {
  player.inv = player.inv.map(normalizeStackEntry);
} else {
  player.inv = [];
}

if (player.hotbar && Array.isArray(player.hotbar)) {
  player.hotbar = player.hotbar.map(normalizeStackEntry);
} else {
  player.hotbar = [null, null, null, null, null];
}


      entities = d.entities || [];
      rescaleLoadedEntitiesForFloor(gameLevel); 
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
    deathMenuShown = false;
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
    { name: "Whale Apprentice", start: { hp: 32, maxhp: 32, atk: 7, def: 4, vision: 11 }, perk: "Whale: cheaper gas usage" },
  ];

  function chooseClass(idx) {
    const cl = CLASSES[idx];
    player = {
      x: 0, y: 0,
      facing: "down",     // "up" | "down" | "left" | "right"
      step: 0,            // 0 or 1 (which walk frame)
      stepAt: 0,          // timestamp of last step toggle
      attackAt: 0,        // timestamp of last attack
      attackDir: "down",  // direction of last attack
      hp: cl.start.hp, maxhp: cl.start.maxhp,
      atk: cl.start.atk, def: cl.start.def,
      vision: cl.start.vision + (idx === 0 ? 1 : 0),
      lvl: 1, xp: 0, xpNext: 50,
      levelUpAt: 0,
      gas: 100,
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
  // ───────── Tier 0 (Floors 1–4)
  { name:"FUD Imp",       ch:"f", hp:10, atk:4, def:1, xp:14, color:"#f96", tier:0 },
  { name:"Bot Swarm",     ch:"b", hp:9,  atk:3, def:0, xp:10, color:"#9cf", tier:0 },

  // ───────── Tier 1 (Floor 5)
  { name:"Rug Gremlin",   ch:"r", hp:14, atk:5, def:2, xp:20, color:"#f66", tier:1 },

  // ───────── Tier 2 (Floor 10)
  { name:"Pump Fiend",    ch:"p", hp:12, atk:6, def:1, xp:22, color:"#6f6", tier:2 },

  // ───────── Tier 3 (Floor 15)
  { name:"Whale Shade",   ch:"w", hp:18, atk:7, def:3, xp:34, color:"#6ff", tier:3 },

  // ───────── Tier 4 (Floor 20)
  { name:"Gas Guzzler",   ch:"g", hp:20, atk:6, def:4, xp:38, color:"#0ff", tier:4 },

  // ───────── Tier 5 (Floor 25)
  { name:"Liquidity Leech", ch:"l", hp:16, atk:8, def:2, xp:42, color:"#9f6", tier:5 },

  // ───────── Tier 6 (Floor 30)
  { name:"Oracle Wraith", ch:"o", hp:22, atk:9, def:3, xp:48, color:"#c9f", tier:6 },

  // ───────── Tier 7 (Floor 35)
  { name:"Slippage Horror", ch:"s", hp:24, atk:10, def:2, xp:54, color:"#ff9", tier:7 },

  // ───────── Tier 8 (Floor 40)
  { name:"MEV Sniper",    ch:"m", hp:18, atk:12, def:3, xp:58, color:"#f9f", tier:8 },

  // ───────── Tier 9 (Floor 45)
  { name:"Dust Hoarder",  ch:"d", hp:28, atk:8, def:5, xp:62, color:"#ccc", tier:9 },

  // ───────── Tier 10 (Floor 50)
  { name:"Bridge Troll",  ch:"t", hp:30, atk:11, def:5, xp:70, color:"#fa6", tier:10 },

  // ───────── Tier 11 (Floor 55)
  { name:"Governance Ghoul", ch:"h", hp:26, atk:13, def:4, xp:74, color:"#6fc", tier:11 },

  // ───────── Tier 12 (Floor 60)
  { name:"Forked Abomination", ch:"k", hp:34, atk:12, def:6, xp:80, color:"#f66", tier:12 },

  // ───────── Tier 13 (Floor 65)
  { name:"Validator Revenant", ch:"v", hp:32, atk:14, def:6, xp:86, color:"#9cf", tier:13 },

  // ───────── Tier 14 (Floor 70)
  { name:"Zero-Knowledge Stalker", ch:"z", hp:28, atk:16, def:5, xp:92, color:"#bff", tier:14 },

  // ───────── Tier 15 (Floor 75)
  { name:"Flash Loan Lich", ch:"x", hp:36, atk:17, def:6, xp:100, color:"#c6f", tier:15 },

  // ───────── Tier 16 (Floor 80)
  { name:"Consensus Breaker", ch:"c", hp:40, atk:16, def:8, xp:110, color:"#ff6", tier:16 },

  // ───────── Tier 17 (Floor 85)
  { name:"Finality Phantom", ch:"y", hp:38, atk:18, def:7, xp:120, color:"#6ff", tier:17 },

  // ───────── Tier 18 (Floor 90)
  { name:"Black Swan Entity", ch:"q", hp:44, atk:20, def:8, xp:140, color:"#999", tier:18 },

  // ───────── Tier 19 (Floor 95–100)
  { name:"Genesis Parasite", ch:"G", hp:52, atk:22, def:10, xp:180, color:"#fff", tier:19 },
];
  // ======================
// Boss / Mini-boss tables
// ======================

// Mini-boss every 5 floors (bigger: 64x64px art later)
const MINI_BOSS_TYPES = [
  { name:"Gas Warden",        ch:"µ", hp:55, atk:9,  def:3, xp:110, color:"#ff9" }, // 5–9
  { name:"Slippage Brute",    ch:"¶", hp:60, atk:10, def:4, xp:120, color:"#ff9" }, // 10–14
  { name:"Liquidity Reaper",  ch:"ß", hp:65, atk:11, def:4, xp:130, color:"#ff9" }, // 15–19
  { name:"Oracle Breaker",    ch:"Ø", hp:70, atk:12, def:5, xp:145, color:"#ff9" }, // 20–24
  { name:"MEV Enforcer",      ch:"ƒ", hp:75, atk:13, def:5, xp:160, color:"#ff9" }, // 25–29
  { name:"Consensus Crusher", ch:"¢", hp:80, atk:14, def:6, xp:180, color:"#ff9" }, // 30–34
  { name:"Finality Ravager",  ch:"§", hp:85, atk:15, def:6, xp:200, color:"#ff9" }, // 35–39
  { name:"Black Swan Herald", ch:"¤", hp:90, atk:16, def:7, xp:220, color:"#ff9" }, // 40–44
];

// Boss every 20 floors (bigger: 128x128px art later)
const BOSS_TYPES = [
  { name:"The Rugpull Architect", ch:"Ω", hp:160, atk:16, def:8,  xp:420,  color:"#fff" }, // 20
  { name:"The MEV Hydra",         ch:"Ψ", hp:190, atk:18, def:9,  xp:520,  color:"#fff" }, // 40
  { name:"The Oracle of Ruin",    ch:"Σ", hp:220, atk:20, def:10, xp:650,  color:"#fff" }, // 60
  { name:"The Finality Engine",   ch:"Λ", hp:260, atk:22, def:12, xp:820,  color:"#fff" }, // 80
  { name:"The Genesis Parasite",  ch:"Ξ", hp:320, atk:25, def:14, xp:1200, color:"#fff" }, // 100
];

function miniBossForFloor(floor) {
  const idx = clamp(((floor / 5) | 0) - 1, 0, MINI_BOSS_TYPES.length - 1);
  return MINI_BOSS_TYPES[idx];
}

function bossForFloor(floor) {
  const idx = clamp(((floor / 20) | 0) - 1, 0, BOSS_TYPES.length - 1);
  return BOSS_TYPES[idx];
}

  function pickEnemyTypeByFloor(floor) {
  // which tiers are unlocked?
  const maxTier = Math.floor((floor - 1) / 5);

  // enemies allowed on this floor
  const pool = ENEMY_TYPES.filter(e => e.tier <= maxTier);
  if (!pool.length) return ENEMY_TYPES[0];

  // weight newer enemies slightly higher
  const weighted = [];
  for (const e of pool) {
    const w = 1 + (e.tier * 0.6); // newer = more common
    for (let i = 0; i < w; i++) weighted.push(e);
  }

  return weighted[(Math.random() * weighted.length) | 0];
}

  function pickItemTypeByFloor(floor) {
  // Base weights (1 = normal chance)
  const weights = {
    heal: 1.0,
    gas:  1.0,
    xp:   1.0,
    atk:  0.7,
    def:  0.7
  };

  // Boost gas early, taper off
  if (floor <= 6)  weights.gas = 3.2;
  else if (floor <= 12) weights.gas = 2.0;
  else if (floor <= 20) weights.gas = 1.4;

  // Build weighted pool
  const pool = [];
  for (const it of ITEM_TYPES) {
    const w = weights[it.kind] ?? 1.0;
    const copies = Math.max(1, Math.round(w * 10)); // granularity
    for (let i = 0; i < copies; i++) pool.push(it);
  }

  return pool[(Math.random() * pool.length) | 0];
}



  const ITEM_TYPES = [
    { name:"Liquidity Potion", kind:"heal", amount: 14, ch:"!", color:"#ff6", hotbar:true },
    { name:"Gas",  kind:"gas",  amount: 60, ch:"$", color:"#0ff", hotbar:true },
    { name:"New Coin Patch",  kind:"atk",  amount: 1,  ch:"+", color:"#f6f", hotbar:false },
    { name:"KYC Patch", kind:"def",  amount: 1,  ch:"*", color:"#6ff", hotbar:false },
    { name:"Mining Pick-aXP",    kind:"xp",   amount: 40, ch:"?", color:"#9f9", hotbar:true },
  ];
  // ======================
// Stacking rules
// ======================
function stackMaxForKind(kind) {
  // tweak these however you like
  if (kind === "heal") return 9;
  if (kind === "gas")  return 9;
  if (kind === "xp")   return 9;
  if (kind === "atk")  return 9;
  if (kind === "def")  return 9;
  return 1;
}

function sameStack(a, b) {
  // define what makes items "the same stack"
  // (kind + amount is usually enough)
  return a && b && a.kind === b.kind && a.amount === b.amount;
}


  const NPC_TYPES = [
  { name:"Meme Lord",  ch:"M", color:"#ff9",
    role:"lore",
    lines:["GM. Your bags are heavy.","Diamond hands or NGMI.","I sold the top (I didn't)."]
  },
  { name:"Bagholder",  ch:"B", color:"#ccc",
    role:"trader",
    lines:["It's not a loss if I don't sell.","My portfolio is a museum.","I trust the dev (I am the dev)."]
  },
  { name:"Ape Priest", ch:"A", color:"#9ff",
    role:"buffer",
    lines:["Ape together strong.","Buy high, sell... never.","WAGMI, but pay the gas."]
  },
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
    for (const n of npcs) n.usedThisFloor = false;

    const nm = FLOOR_NAMES[(gameLevel - 1) % FLOOR_NAMES.length];
    log(`Floor ${gameLevel}: ${nm} — gas fees rising…`, "#f96");
}
 function entityFootprint(e) {
  if (!e) return 1;
  if (e.kind === "boss") return 4;      // 4x4 tiles
  if (e.kind === "miniboss") return 2;  // 2x2 tiles
  return 1;
}

function entityBlocksTile(e, tx, ty) {
  if (!e || e.hp <= 0) return false;

  const s = entityFootprint(e);
  if (s === 1) return e.x === tx && e.y === ty;

  // centered footprint, matching your centered drawing
  const half = Math.floor(s / 2);
  const left = e.x - half;
  const top  = e.y - half;
  const right = left + s - 1;
  const bottom = top + s - 1;

  return tx >= left && tx <= right && ty >= top && ty <= bottom;
}

function drawEntityFootprintGlow(e, ox, oy) {
  if (!e || e.hp <= 0) return;

  const size = entityFootprint(e);
  if (size <= 1) return;

  const half = Math.floor(size / 2);
  const left = e.x - half;
  const top  = e.y - half;

  // animation pulse
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);

  // stronger for bosses
  const maxAlpha = (e.kind === "boss") ? 0.35 : 0.25;

  // center of footprint in tile coords
  const cx = e.x + 0.5;
  const cy = e.y + 0.5;

  CTX.save();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tx = left + x;
      const ty = top + y;

      if (!explored[ty]?.[tx]) continue;

      const px = ox + tx * TS;
      const py = oy + ty * TS;

      // distance from this tile to footprint center
      const dx = (tx + 0.5) - cx;
      const dy = (ty + 0.5) - cy;
      const d  = Math.sqrt(dx * dx + dy * dy);

      // normalize distance (0 at center → 1 at edge)
      const maxD = size * 0.75;
      const t = clamp(1 - d / maxD, 0, 1);

      const a = maxAlpha * t * (0.75 + pulse * 0.25);

      // radial-ish gradient per tile
      const g = CTX.createRadialGradient(
        px + TS / 2, py + TS / 2, TS * 0.15,
        px + TS / 2, py + TS / 2, TS * 0.7
      );

      g.addColorStop(0, `rgba(255,40,40,${a})`);
      g.addColorStop(1, `rgba(255,40,40,0)`);

      CTX.fillStyle = g;
      CTX.fillRect(px, py, TS, TS);
    }
  }

  CTX.restore();
}


function getBlockingEntityAt(x, y) {
  return entities.find(e => entityBlocksTile(e, x, y)) || null;
}
  function footprintFitsAt(cx, cy, size) {
  const half = Math.floor(size / 2);
  const left = cx - half, top = cy - half;
  const right = left + size - 1, bottom = top + size - 1;

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (isWall(x, y)) return false;
      if (map[y]?.[x] !== ".") return false;
      if (getNPCAt(x, y) || getItemAt(x, y)) return false;

      // ✅ NEW: footprint may not overlap the player
      if (x === player.x && y === player.y) return false;
    }
  }
  return true;
}
function footprintFitsAt(cx, cy, size) {
  const half = Math.floor(size / 2);
  const left = cx - half, top = cy - half;
  const right = left + size - 1, bottom = top + size - 1;

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (isWall(x, y)) return false;
      if (map[y]?.[x] !== ".") return false;
      if (getNPCAt(x, y) || getItemAt(x, y)) return false;
      // IMPORTANT: don't call getEntityAt here (it will self-block during placement)
    }
  }
  return true;
}
  function footprintBounds(e) {
  const s = entityFootprint(e);
  const half = Math.floor(s / 2);
  const left = e.x - half;
  const top  = e.y - half;
  const right = left + s - 1;
  const bottom = top + s - 1;
  return { left, top, right, bottom, s };
}

// Manhattan distance from point (px,py) to the *nearest tile* in e's footprint
function distToFootprintManhattan(e, px, py) {
  const b = footprintBounds(e);
  // clamp point to footprint rectangle
  const cx = clamp(px, b.left, b.right);
  const cy = clamp(py, b.top,  b.bottom);
  return Math.abs(px - cx) + Math.abs(py - cy);
}
  // Manhattan distance from point (px,py) to the nearest tile in a footprint
// centered at (cx,cy) with size `size` (1,2,4)
function distToFootprintManhattanAt(cx, cy, size, px, py) {
  const half = Math.floor(size / 2);
  const left = cx - half;
  const top  = cy - half;
  const right = left + size - 1;
  const bottom = top + size - 1;

  const qx = clamp(px, left, right);
  const qy = clamp(py, top,  bottom);
  return Math.abs(px - qx) + Math.abs(py - qy);
}


// Same as footprintFitsAt but ALSO ensures you won't overlap other entities footprints.
// `self` is the moving entity (so it doesn't self-block)
function footprintFitsAtEntity(cx, cy, size, self) {
  const half = Math.floor(size / 2);
  const left = cx - half, top = cy - half;
  const right = left + size - 1, bottom = top + size - 1;

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (isWall(x, y)) return false;
      if (map[y]?.[x] !== ".") return false;
      if (getNPCAt(x, y) || getItemAt(x, y)) return false;

      // block if any OTHER entity footprint occupies this tile
      const blocker = entities.find(en => en !== self && entityBlocksTile(en, x, y) && en.hp > 0);
      if (blocker) return false;

      // don't step onto player
      if (x === player.x && y === player.y) return false;
    }
  }
  return true;
}


  function getEntityAt(x, y) {
  return getBlockingEntityAt(x, y);
}
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
    const itemCount  = clamp(3 + (gameLevel / 4 | 0), 2, 10);
    const npcCount   = clamp((gameLevel % 3 === 0) ? 1 : 0, 0, 2);
      

    // ---- Boss / Mini-boss spawn rules ----
// Mini-boss every 5 floors (but NOT on boss floors like 20/40/60/80/100)
const doBoss = (gameLevel % 20 === 0);
const doMini = (!doBoss && (gameLevel % 5 === 0));

if (doBoss) {
  let p = null;
for (let tries = 0; tries < 400; tries++) {
  const cand = randomFloorTile();
  if (!cand) break;
  if (
  footprintFitsAt(cand.x, cand.y, 4) &&
  distToFootprintManhattanAt(cand.x, cand.y, 4, player.x, player.y) > 5
) { p = cand; break; }
}
  if (p) {
    const t = bossForFloor(gameLevel);
    const g = gameLevel - 1;
    const scale = 1 + g * 0.05 + g * g * 0.001;

    entities.push({
      ...p,
      kind: "boss",
      name: t.name,
      ch: t.ch,                 // Ω (shows even without art)
      color: t.color,
      hp: Math.max(20, (t.hp * scale) | 0),
      maxhp: Math.max(20, (t.hp * scale) | 0),
      atk: Math.max(3, (t.atk * scale) | 0),
      def: Math.max(0, (t.def * scale) | 0),
      xp: Math.max(20, (t.xp * scale) | 0),
      aggro: true,              // bosses wake up
      animPhase: (p.x * 7 + p.y * 13 + 999) | 0,
      boss: true,               // tag for later (size/art/abilities)
    });

    log(`⚠️ ${t.name} rises from the Abyss.`, "#ff4");
  }
}

if (doMini) {
  let p = null;
for (let tries = 0; tries < 400; tries++) {
  const cand = randomFloorTile();
  if (!cand) break;
  if (
  footprintFitsAt(cand.x, cand.y, 2) &&
  distToFootprintManhattanAt(cand.x, cand.y, 2, player.x, player.y) > 5
) { p = cand; break; }
}
  if (p) {
    const t = miniBossForFloor(gameLevel);
    const g = gameLevel - 1;
    const scale = 1 + g * 0.05 + g * g * 0.001;

    entities.push({
      ...p,
      kind: "miniboss",
      name: t.name,
      ch: t.ch,                 // µ (shows even without art)
      color: t.color,
      hp: Math.max(16, (t.hp * scale) | 0),
      maxhp: Math.max(16, (t.hp * scale) | 0),
      atk: Math.max(2, (t.atk * scale) | 0),
      def: Math.max(0, (t.def * scale) | 0),
      xp: Math.max(16, (t.xp * scale) | 0),
      aggro: true,
      animPhase: (p.x * 7 + p.y * 13 + 555) | 0,
      miniboss: true,           // tag for later (size/art/abilities)
    });

    log(`⚠️ Mini-boss: ${t.name}`, "#ff9");
  }
}

const specialCount = (doBoss || doMini) ? 1 : 0;
const normalCount = Math.max(0, enemyCount - specialCount);

for (let i = 0; i < normalCount; i++) {

  let p = null;
for (let tries = 0; tries < 400; tries++) {
  const cand = randomFloorTile();
  if (!cand) break;
  const d = Math.abs(cand.x - player.x) + Math.abs(cand.y - player.y);
  if (d > 5) { p = cand; break; }
}
if (!p) break;

const t = pickEnemyTypeByFloor(gameLevel);

  const g = gameLevel - 1;
  const scale = 1 + g * 0.05 + g * g * 0.001;

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
      const t = pickItemTypeByFloor(gameLevel);
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
  function stairsLocked() {
  // Lock stairs if ANY boss/miniboss is alive on this floor
  return entities.some(e => e && e.hp > 0 && (e.kind === "boss" || e.kind === "miniboss"));
}
  function drawStairsLockOverlay(px, py) {
  // px/py are top-left of the tile (screen coords)
  CTX.save();

  // dark tint
  CTX.fillStyle = "rgba(0,0,0,0.35)";
  CTX.fillRect(px, py, TS, TS);

  // red X
  CTX.strokeStyle = "rgba(255, 60, 60, 0.95)";
  CTX.lineWidth = Math.max(2, (TS * 0.12) | 0);
  CTX.lineCap = "round";

  const pad = Math.max(4, (TS * 0.22) | 0);
  CTX.beginPath();
  CTX.moveTo(px + pad, py + pad);
  CTX.lineTo(px + TS - pad, py + TS - pad);
  CTX.moveTo(px + TS - pad, py + pad);
  CTX.lineTo(px + pad, py + TS - pad);
  CTX.stroke();

  // tiny "LOCK" label (optional but nice)
  CTX.font = `bold ${Math.max(10, (TS * 0.32) | 0)}px "Courier New", monospace`;
  CTX.textAlign = "center";
  CTX.textBaseline = "middle";
  CTX.fillStyle = "rgba(255, 220, 90, 0.95)";
  CTX.fillText("LOCK", px + TS / 2, py + TS / 2);

  CTX.restore();
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
        if (isVisible(x, y)) {
  explored[y][x] = true;

  // ✅ if the stairs are visible, ensure they become explored for minimap marker
  if (map[y]?.[x] === ">") explored[y][x] = true;
}
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
      player.levelUpAt = performance.now();
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
    if (attacker === player) {
  player.attackAt = performance.now();
  player.attackDir = player.facing;
}
    // Low gas makes you fight worse defensively (risk meter)
let lowGasPenalty = 0;
if (target === player) {
  const tier = gasTier();
  if (tier === 1) lowGasPenalty = 1;       // low
  else if (tier === 2) lowGasPenalty = 2;  // danger
  else if (tier === 3) lowGasPenalty = 3;  // empty
}
   // --- Damage calc (armor has diminishing returns so enemies don't get stuck at 1) ---
const roll = rand(-1, 2);

// apply low gas penalty to your defense (so enemies hit harder when you're low)
let effectiveDef = target.def | 0;
if (target === player) effectiveDef = Math.max(0, effectiveDef - lowGasPenalty);

// diminishing returns armor: damage scales with atk even vs high def
const baseAtk = Math.max(1, (attacker.atk | 0) + roll);
let raw = Math.max(1, Math.floor(baseAtk * (100 / (100 + effectiveDef))));


// Enemy crits scale with LOW gas
let crit = false;
if (target === player && attacker !== player) {
  const pCrit = enemyCritChanceFromGas(player.gas);
  if (Math.random() < pCrit) {
    crit = true;
    raw = Math.max(1, (raw * ENEMY_CRIT_MULT) | 0);
  }
}

target.hp -= raw;
    // ✅ floating damage number
spawnFloatText(target.x, target.y, raw, crit ? "#ff4" : "#f44");


if (attacker === player) {
  log(`You hit ${target.name} for ${raw}.`, "#ff9");
  beep(330, 0.05, 0.10);
} else {
  if (crit) {
    log(`${attacker.name} CRITS you for ${raw}! (low gas)`, "#ff4");
    beep(70, 0.10, 0.18, "square");
  } else {
    log(`${attacker.name} hits you for ${raw}.`, "#f66");
    beep(160, 0.08, 0.14, "square");
  }
}


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

  const stackMax = stackMaxForKind(it.kind);

  // Helper: try to add 1 into an array of stacks (inv or hotbar)
  function addToStacks(arr) {
    // 1) fill existing stack first
    for (const s of arr) {
      if (!s) continue;
      if (sameStack(s, it) && (s.qty | 0) < (s.max | 0)) {
        s.qty = (s.qty | 0) + 1;
        return true;
      }
    }
    return false;
  }

  // Helper: create a new stack in inventory (if space)
  function addNewInvStack() {
    if (player.inv.length >= 15) return false;
    player.inv.push({
      name: it.name,
      kind: it.kind,
      amount: it.amount,
      ch: it.ch,
      qty: 1,
      max: stackMax
    });
    return true;
  }

  // 1) If it belongs on hotbar, try hotbar stacks/empty slots first
  if (it.hotbar) {
    // fill an existing hotbar stack
    if (addToStacks(player.hotbar)) {
      log(`Picked up: ${it.name}`, "#0ff");
      beep(880, 0.05, 0.10);
      items = items.filter(x => x !== it);
      return;
    }

    // put into an empty hotbar slot (new stack)
    for (let i = 0; i < 5; i++) {
      if (!player.hotbar[i]) {
        player.hotbar[i] = {
          name: it.name,
          kind: it.kind,
          amount: it.amount,
          ch: it.ch,
          qty: 1,
          max: stackMax
        };
        log(`Picked up: ${it.name}`, "#0ff");
        beep(880, 0.05, 0.10);
        items = items.filter(x => x !== it);
        return;
      }
    }
  }

  // 2) Otherwise (or hotbar full), try inventory stacks
  if (addToStacks(player.inv) || addNewInvStack()) {
    log(`Picked up: ${it.name}`, "#0ff");
    beep(880, 0.05, 0.10);
    items = items.filter(x => x !== it);
    return;
  }

  log("Inventory full (15).", "#f96");
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
    const healed = player.hp - before;
if (healed > 0) spawnFloatText(player.x, player.y, `+${healed}`, "#6f6");
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
    it.qty = ((it.qty ?? 1) | 0) - 1;
    if (it.qty <= 0) player.hotbar[i] = null;
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

  it.qty = ((it.qty ?? 1) | 0) - 1;

  if (it.qty <= 0) {
    player.inv.splice(i, 1);
    invIndex = clamp(invIndex, 0, Math.max(0, player.inv.length - 1));
  }
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
    handleNPCRole(n);
  }
  function handleNPCRole(n) {
  if (!n || !n.role) return;

  // prevent abuse: once per floor per NPC
  if (n.usedThisFloor) {
    log(`${n.name} has nothing more to offer.`, "#aaa");
    return;
  }

  n.usedThisFloor = true;

  switch (n.role) {
    case "lore":
  revealStairsLocation();   // always stairs
  break;


    case "trader":
      npcTrade(n);
      break;

    case "buffer":
      npcBlessing(n);
      break;
  }
}
  function revealStairsLocation() {
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[0].length; x++) {
      if (map[y][x] === ">") {
        explored[y][x] = true;
        revealFog();     // refresh local visibility edges (optional but feels instant)
updateUI();      // harmless; keeps UI synced
        log("Meme Lord leaks the stair coords 👀", "#9ff");
        return;
      }
    }
  }
  log("No stairs found to reveal (weird).", "#f96");
}

function revealRandomMapHint() {
  const options = [];

  // reveal stairs location
  options.push(() => {
    for (let y = 0; y < map.length; y++)
      for (let x = 0; x < map[0].length; x++)
        if (map[y][x] === ">") explored[y][x] = true;
    log("You glimpse the path to the stairs.", "#9ff");
  });

  // reveal nearby unexplored area
  options.push(() => {
    const r = 6;
    for (let y = player.y - r; y <= player.y + r; y++)
      for (let x = player.x - r; x <= player.x + r; x++)
        if (map[y]?.[x] === ".") explored[y][x] = true;
    log("Hidden paths fade into view.", "#9ff");
  });

  options[rand(0, options.length - 1)]();
}
function npcTrade(n) {
  const cost = 25 + gameLevel * 3;
  if (player.gas < cost) {
    log("Not enough gas to trade.", "#f96");
    return;
  }

  player.gas -= cost;

  const t = ITEM_TYPES[rand(0, ITEM_TYPES.length - 1)];
  items.push({
    x: n.x,
    y: n.y,
    ...t,
    animPhase: (n.x * 5 + n.y * 11) | 0
  });

  log(`Trade complete. ${t.name} dropped.`, "#0ff");
}
function npcBlessing(n) {
  const roll = Math.random();

  // ✅ always heal a bit
  const before = player.hp;
  const healAmt = rand(6, 12);
  player.hp = Math.min(player.maxhp, player.hp + healAmt);
  const healed = player.hp - before;
  if (healed > 0) spawnFloatText(player.x, player.y, `+${healed}`, "#6f6");
  log(`Ape Priest heals you (+${healed} HP).`, "#9f9");

  // ✅ plus the old random buff
  if (roll < 0.4) {
    player.atk += 1;
    log("You feel stronger. (+3 ATK)", "#9f9");
  } else if (roll < 0.7) {
    player.def += 1;
    log("Your resolve hardens. (+3 DEF)", "#9f9");
  } else {
    player.vision += 1;
    log("Your sight expands. (+3 VISION)", "#9f9");
  }

  beep(880, 0.06, 0.12, "triangle");
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
    // set facing based on attempted move
if (dx === 1) player.facing = "right";
else if (dx === -1) player.facing = "left";
else if (dy === 1) player.facing = "down";
else if (dy === -1) player.facing = "up";

    if (gameOver || win) return false;
    const nx = player.x + dx, ny = player.y + dy;
    if (isWall(nx, ny)) { beep(100, 0.04, 0.10, "square"); return false; }
    const n = getNPCAt(nx, ny);
if (n) {
  // 1) Try to nudge the NPC into a neighboring tile
  if (tryNudgeNPC(n)) {
    log(`${n.name} steps aside.`, n.color || "#ff9");
    // continue movement (tile is now free)
  } else {
    // 2) If corridor is 1-wide, allow swapping places (prevents hard soft-lock)
    // Only swap if the player's current tile is a normal walkable floor.
    if (map[player.y]?.[player.x] === ".") {
      const px = player.x, py = player.y;
      n.x = px; n.y = py;      // NPC moves into your old spot
      // continue movement into nx,ny below
    } else {
      log("An NPC blocks the path. Press T to talk.", "#ff9");
      return false;
    }
  }
}



    const e = getEntityAt(nx, ny);
if (e && e.hp > 0) {
  spendGas(GAS_CFG.attack, "attack");
  attack(player, e);
  return true;
}

    player.x = nx; player.y = ny;
    spendGas(GAS_CFG.move, "move");

    // walk animation: flip frame on each successful move
player.step ^= 1;
player.stepAt = performance.now();


    const it = getItemAt(nx, ny);
    if (it) pickupItem(it);

    if (map[ny][nx] === ">") {
  // ✅ Lock stairs on boss/miniboss floors until defeated
  if (stairsLocked()) {
    log("The stairs are sealed. Defeat the boss to unlock them.", "#ff4");
    beep(120, 0.08, 0.16, "square");
    return true; // counts as a turn (you stepped onto the stairs tile)
  }

  if (gameLevel >= 100) {
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

    const size = entityFootprint(e);

    // Can see player? (use center LOS, good enough)
    const canSee = dist(e, player) <= 9 && lineOfSight(e.x, e.y, player.x, player.y);
    if (canSee) e.aggro = true;

    // ✅ ATTACK if player is adjacent to ANY tile in the footprint
    const mdFoot = distToFootprintManhattan(e, player.x, player.y);
    if (e.aggro && mdFoot === 1) {
      attack(e, player);
      continue;
    }

    let dx = 0, dy = 0;

    if (e.aggro) {
      const sx = Math.sign(player.x - e.x);
      const sy = Math.sign(player.y - e.y);

      // Prefer axis with bigger gap (same as before)
      if (Math.abs(player.x - e.x) > Math.abs(player.y - e.y)) {
        dx = sx;
      } else {
        dy = sy;
      }
    } else {
      if (Math.random() < 0.25) {
        dx = rand(-1, 1);
        dy = (dx === 0) ? rand(-1, 1) : 0;
      } else continue;
    }

    const nx = e.x + dx, ny = e.y + dy;

    // ✅ MOVEMENT: footprint must fit at destination
    if (size > 1) {
      // if the preferred move doesn't fit, try the other axis
      if (!footprintFitsAtEntity(nx, ny, size, e)) {
        const altX = e.x + Math.sign(player.x - e.x);
        const altY = e.y + Math.sign(player.y - e.y);

        // Try swapping axis
        if (dx !== 0) { // we tried x, try y
          if (footprintFitsAtEntity(e.x, altY, size, e)) { e.y = altY; continue; }
        } else {        // we tried y, try x
          if (footprintFitsAtEntity(altX, e.x === e.x ? e.y : e.y, size, e)) { e.x = altX; continue; }
          // (line above is awkward; do it cleanly:)
        }

        // Clean alt attempts:
        if (dx !== 0) {
          if (footprintFitsAtEntity(e.x, altY, size, e)) { e.y = altY; continue; }
        } else {
          if (footprintFitsAtEntity(altX, e.y, size, e)) { e.x = altX; continue; }
        }

        // No fit -> don't move
        continue;
      }

      // Fits -> move center
      e.x = nx; e.y = ny;
      continue;
    }

    // ---- Normal 1×1 enemies keep old rules ----
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
  mobileMenuOpen = false;   // ✅ close menu immediately
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
   // allow save/load even on death screen (menu buttons OR keyboard)
  if (keys["p"] || keys["save"]) {
    keys["p"] = false;
    keys["save"] = false;
    saveGame();
  }

  if (keys["l"] || keys["load"]) {
    keys["l"] = false;
    keys["load"] = false;
    if (!loadGame()) log("No save found.", "#aaa");
    else {
      // optional: close menu after successful load
      mobileMenuOpen = false;
      gameOver = false;
      win = false;
    }
  }
  return;
}

  let acted = false;

  // --- Toggles always allowed ---
  if (keys["m"]) { keys["m"] = false; mobileMenuOpen = !mobileMenuOpen; }
  if (keys["i"]) {
  keys["i"] = false;
  invOpen = !invOpen;
  if (invOpen) {
    mobileMenuOpen = false;
    logOpen = false;
  }
}
   if (keys["log"]) {
  keys["log"] = false;
  logOpen = !logOpen;
  mobileMenuOpen = false;
}




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
    if (keys["load"]) {
    keys["load"] = false;

    if (!loadGame()) {
      log("No save found.", "#aaa");
    } else {
      // ✅ exit death state immediately after loading
      gameOver = false;
      win = false;
      deathMenuShown = false;
      mobileMenuOpen = false;
      invOpen = false;
      logOpen = false;
      revealFog();
      updateUI();
    }
  }

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

  // low gas effects apply on YOUR acted turns
  applyLowGasRisk();

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
    const g = player.gas | 0;
const pCrit = enemyCritChanceFromGas(g);
UI.gas.textContent = g;

// tint the GAS text by danger level
if (UI.gas && UI.gas.style) {
  if (pCrit >= 0.25) UI.gas.style.color = "#ff4";      // danger
  else if (pCrit >= 0.12) UI.gas.style.color = "#ff9"; // warning
  else UI.gas.style.color = "#0ff";                    // safe
}
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
  function wrapTextLines(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";

  for (const w of words) {
    const test = line ? (line + " " + w) : w;
    if (ctx.measureText(test).width <= maxW) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
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

  const drew = drawSpriteFrames(frames, px, py, 1, nowMs, ANIM.tilesMs, phase);

  // fallback if stairs art missing
  if (!drew && ch === ">") {
    drawText(px + 4, py + 2, ">", "#ff9");
  }

  // ✅ lock indicator overlay on stairs when boss/miniboss alive
  if (ch === ">" && stairsLocked()) {
    drawStairsLockOverlay(px, py);
  }
}
    }

    // --- Boss / Mini-boss footprint glow (drawn on floor) ---
for (const e of entities) {
  if (e.hp <= 0) continue;
  if (e.kind !== "boss" && e.kind !== "miniboss") continue;

  drawEntityFootprintGlow(e, ox, oy);
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

            const baseX = ox + e.x * TS;
      const baseY = oy + e.y * TS;

      const { frames, src, scale } = enemySpriteInfo(e);
      const dw = TS * scale;
      const dh = TS * scale;

      // center big sprites on their tile
      const px = baseX + (TS - dw) / 2;
      const py = baseY + (TS - dh) / 2;

      let drew = false;
      if (frames && frames.length) {
        const idx = animIndexFor(nowMs, frames.length, ANIM.mobMs, e.animPhase || 0);
        const im = frames[idx] || firstAvailableFrame(frames);
        if (im) {
          const old = CTX.globalAlpha;
          CTX.globalAlpha = 1;
          CTX.drawImage(im, 0, 0, src, src, px, py, dw, dh);
          CTX.globalAlpha = old;
          drew = true;
        }
      }

      // ✅ fallback symbol if art missing
      if (!drew) {
        drawText(baseX + 4, baseY + 2, e.ch, e.color);
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
    const shakeMs = 80;
  const dts = nowMs - (player.attackAt || 0);
  let shx = 0, shy = 0;
  if (dts >= 0 && dts < shakeMs) {
    shx = ((Math.random() * 2 - 1) * 2) | 0;
    shy = ((Math.random() * 2 - 1) * 2) | 0;
  }

  const px = ox + player.x * TS + shx;
  const py = oy + player.y * TS + shy;


  // --- Player shadow ---
  CTX.save();
  CTX.fillStyle = "rgba(0,0,0,0.35)";
  CTX.beginPath();
  CTX.ellipse(
    px + TS / 2,
    py + TS - 4,
    TS * 0.32,
    TS * 0.14,
    0,
    0,
    Math.PI * 2
  );
  CTX.fill();
  CTX.restore();

  const frames = playerFramesForFacing(player.facing);
  const im = (frames && frames[player.step]) || firstAvailableFrame(frames);

  if (im) {
    CTX.drawImage(im, 0, 0, SPRITE_SRC, SPRITE_SRC, px, py, TS, TS);
  } else {
    drawText(px + 4, py + 2, "@", "#0f8");
  }
  // --- Level-up glow (yellow burst) ---
const LU_MS = 420;
const dtLU = nowMs - (player.levelUpAt || 0);

if (dtLU >= 0 && dtLU < LU_MS) {
  const t = dtLU / LU_MS;           // 0 → 1
  const ease = 1 - Math.pow(1 - t, 2);

  const cx = px + TS / 2;
  const cy = py + TS / 2;

  CTX.save();

  // Outer ring
  CTX.globalAlpha = 0.55 * (1 - t);
  CTX.strokeStyle = "rgba(255, 230, 90, 1)";
  CTX.lineWidth = 3;
  CTX.beginPath();
  CTX.arc(cx, cy, TS * (0.6 + ease * 1.2), 0, Math.PI * 2);
  CTX.stroke();

  // Inner glow
  CTX.globalAlpha = 0.35 * (1 - t);
  CTX.fillStyle = "rgba(255, 255, 140, 1)";
  CTX.beginPath();
  CTX.arc(cx, cy, TS * (0.35 + ease * 0.8), 0, Math.PI * 2);
  CTX.fill();

  CTX.restore();
}
  // --- Player HP bar ABOVE the sprite ---
{
  const w = TS - 4;
  const hpw = Math.max(0, (w * (player.hp / player.maxhp)) | 0);

  const barH = 5;
  const barX = px + 2;

  // keep bar inside visible world (don’t overlap top UI)
  const worldTop = isMobile ? MOBILE_TOP_UI_H : 0;
  let barY = py - (barH + 5);
  barY = Math.max(worldTop + 2, barY);

  // background
  CTX.fillStyle = "rgba(0,0,0,0.6)";
  CTX.fillRect(barX, barY, w, barH);

  // ✅ green health fill
  CTX.fillStyle = "rgba(0,255,120,0.9)";
  CTX.fillRect(barX, barY, hpw, barH);
}
  // --- Attack slash overlay (code-only) ---
const atkMs = 110; // duration of slash
const dt = nowMs - (player.attackAt || 0);
if (dt >= 0 && dt < atkMs) {
  const t = 1 - (dt / atkMs); // fades out
  CTX.save();
  CTX.globalAlpha = 0.65 * t;
  CTX.fillStyle = "rgba(0,255,200,1)";

  // position slash one tile in front of player
  let sx = px, sy = py;
  if (player.attackDir === "up") sy -= TS;
  else if (player.attackDir === "down") sy += TS;
  else if (player.attackDir === "left") sx -= TS;
  else if (player.attackDir === "right") sx += TS;

  // draw a wedge-ish slash
  CTX.translate(sx + TS/2, sy + TS/2);

  let rot = 0;
  if (player.attackDir === "up") rot = -Math.PI/2;
  if (player.attackDir === "down") rot = Math.PI/2;
  if (player.attackDir === "left") rot = Math.PI;
  if (player.attackDir === "right") rot = 0;
  CTX.rotate(rot);

  // simple “arc” slash
  CTX.beginPath();
  CTX.moveTo(-TS*0.2, -TS*0.35);
  CTX.lineTo(TS*0.45, 0);
  CTX.lineTo(-TS*0.2, TS*0.35);
  CTX.closePath();
  CTX.fill();

  CTX.restore();
}

}
        // ===== UI overlays (minimap + menu + controls) =====
    // world is clipped on mobile; UI should draw OUTSIDE the clip
    if (didClip) CTX.restore();

    // Desktop UI (menu button + dropdown)
    if (!isMobile) drawDesktopMenuUI();

    // Minimap (needs desktopMenuButtonRect to be set first)
    drawMinimap();

    // Desktop hotbar
if (!isMobile) drawDesktopHotbar();

    // Inventory overlay
if (invOpen) drawInventoryOverlay();
if (logOpen) drawLogOverlay();

// Game over / win overlay (draw BEHIND menu)
if (gameOver || win) {
  if (isMobile && !deathMenuShown) {
    mobileMenuOpen = true;
    deathMenuShown = true;
  }

  const topSafe = isMobile ? MOBILE_TOP_UI_H : 0;

  const w = Math.min(520, W - 24);
  const x = (W - w) / 2;
  const y = topSafe + 12;
  const h = 120;

  CTX.save();
  CTX.fillStyle = "rgba(0,0,0,0.75)";
  CTX.fillRect(x, y, w, h);
  CTX.strokeStyle = "rgba(0,255,120,0.25)";
  CTX.strokeRect(x, y, w, h);

  CTX.beginPath();
  CTX.rect(x, y, w, h);
  CTX.clip();

  CTX.textAlign = "center";
  CTX.textBaseline = "top";
  CTX.fillStyle = "rgba(0,255,180,0.92)";
  CTX.font = `bold 22px "Courier New", monospace`;
  CTX.fillText(win ? "YOU WIN" : "GAME OVER", x + w / 2, y + 12);

  CTX.fillStyle = "rgba(200,200,200,0.88)";
  CTX.font = `16px "Courier New", monospace`;

  const msg = isMobile
    ? "Tap MENU to load / restart / save / arcade"
    : "Press M to open MENU (load / restart / save / arcade)";

  const lines = wrapTextLines(CTX, msg, w - 24);
  let ty = y + 52;
  for (const line of lines.slice(0, 3)) {
    CTX.fillText(line, x + w / 2, ty);
    ty += 18;
  }

  CTX.restore();
  CTX.textAlign = "left";
  CTX.textBaseline = "top";
}

// Mobile controls LAST so the menu is on top
if (isMobile) drawMobileControls();
    drawFloatTexts(nowMs, ox, oy);
    requestAnimationFrame(render);
  }

  function drawMinimap() {
  if (!map || !map.length || !map[0] || !explored) return;

  const mw = 170, mh = 120;
  const x0 = W - mw - 16;

  const desktopMenuPad =
    (!isMobile && desktopMenuButtonRect && desktopMenuButtonRect.h)
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

  // base minimap shading
  CTX.fillStyle = (ch === "#") ? "rgba(0,80,40,0.25)" : "rgba(0,255,120,0.10)";
  CTX.fillRect(x0 + x * sx, y0 + y * sy, sx + 0.5, sy + 0.5);

  // ✅ stairs marker (white square) once explored (by talk OR by walking nearby)
  if (ch === ">") {
    CTX.fillStyle = "rgba(255,255,255,0.95)";
    // make it a bit chunkier than a single pixel
    const px = x0 + x * sx;
    const py = y0 + y * sy;
    CTX.fillRect(px, py, Math.max(2, sx + 0.5), Math.max(2, sy + 0.5));
  }
}

  CTX.fillStyle = "rgba(0,255,180,0.9)";
  CTX.fillRect(x0 + player.x * sx - 1, y0 + player.y * sy - 1, 3, 3);
}
  function drawDesktopHotbar() {
  if (!player || !player.hotbar) return;

  const slots = 5;
  const size = clamp((TS * 1.1) | 0, 44, 64);
  const gap = 12;

  const totalW = slots * size + (slots - 1) * gap;
  const x0 = (W - totalW) / 2;
  const y0 = H - size - 18;

  CTX.font = `bold 14px "Courier New", monospace`;
  CTX.textAlign = "center";
  CTX.textBaseline = "middle";

  for (let i = 0; i < slots; i++) {
    const x = x0 + i * (size + gap);
    const y = y0;

    // slot background
    CTX.fillStyle = "rgba(0,255,120,0.07)";
    CTX.fillRect(x, y, size, size);
    CTX.strokeStyle = "rgba(0,255,120,0.22)";
    CTX.strokeRect(x, y, size, size);

    const it = player.hotbar[i];

    if (it) {
      // draw icon
      const frames = itemFrames(it.ch);
      const im = (frames && frames[0]) || firstAvailableFrame(frames);

      if (im) {
        const pad = 6;
        const s = size - pad * 2;
        CTX.drawImage(im, 0, 0, SPRITE_SRC, SPRITE_SRC, x + pad, y + pad, s, s);
      }

      // qty badge
      const q = (it.qty ?? 1) | 0;
      if (q > 1) {
        CTX.save();
        CTX.textAlign = "right";
        CTX.textBaseline = "bottom";
        CTX.font = `bold ${Math.max(12, (size * 0.32) | 0)}px "Courier New", monospace`;

        CTX.fillStyle = "rgba(0,0,0,0.55)";
        const tx = x + size - 4;
        const ty = y + size - 3;
        const bw = Math.max(14, (String(q).length * 8) + 10);
        const bh = 16;
        CTX.fillRect(tx - bw, ty - bh, bw, bh);

        CTX.fillStyle = "rgba(0,255,200,0.95)";
        CTX.fillText(String(q), tx, ty);
        CTX.restore();
      }
    } else {
      // empty slot → show number
      CTX.fillStyle = "rgba(0,255,180,0.75)";
      CTX.fillText(String(i + 1), x + size / 2, y + size / 2);
    }
  }

  CTX.textAlign = "left";
  CTX.textBaseline = "top";
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
    CTX.fillText(
  `${i + 1}: ${it ? (it.name + (it.qty > 1 ? " x" + it.qty : "")) : "(empty)"}`,
  listX,
  yy
);

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
    CTX.fillText(
  `${idx + 1}. ${it.name}${(it.qty > 1) ? (" x" + it.qty) : ""}`,
  listX,
  yy
);
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
  function drawLogOverlay() {
  const pad = 18;
  const w = Math.min(640, W - pad * 2);
  const h = Math.min(420, H - pad * 2 - (isMobile ? MOBILE_UI_H : 0));

  const x = (W - w) / 2;
  const y = (isMobile ? MOBILE_TOP_UI_H + 12 : 16);

  CTX.fillStyle = "rgba(0,0,0,0.85)";
  CTX.fillRect(x, y, w, h);
  CTX.strokeStyle = "rgba(0,255,120,0.25)";
  CTX.strokeRect(x, y, w, h);

  CTX.font = `bold 18px "Courier New", monospace`;
  CTX.fillStyle = "rgba(0,255,180,0.9)";
  CTX.fillText("LOG", x + 14, y + 12);

  const listY = y + 44;
  const lineH = 18;
  const maxLines = ((h - 60) / lineH) | 0;

  const start = Math.max(0, messages.length - maxLines);
  const visible = messages.slice(start);

  CTX.font = `14px "Courier New", monospace`;
  for (let i = 0; i < visible.length; i++) {
    const m = visible[i];
    CTX.fillStyle = m.c || "#ccc";
    CTX.fillText(m.t, x + 14, listY + i * lineH);
  }

  // Close hint
  CTX.fillStyle = "rgba(0,255,160,0.7)";
  CTX.fillText(isMobile ? "Tap MENU to close" : "Press M to close", x + 14, y + h - 16);
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
    { k:"log",    t:"LOG"  },
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

   // D-pad (optional)
  const hasDpad = !!dpadRects;


    // ---- D-pad (only if available) ----
if (hasDpad) {
  const drawBtn = (r, label) => {
    CTX.fillStyle = "rgba(0,255,120,0.07)";
    CTX.fillRect(r.x, r.y, r.w, r.h);
    CTX.strokeStyle = "rgba(0,255,120,0.22)";
    CTX.strokeRect(r.x, r.y, r.w, r.h);
    CTX.fillStyle = "rgba(0,255,180,0.80)";
    CTX.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  };

  drawBtn(dpadRects.up, "▲");
  drawBtn(dpadRects.down, "▼");
  drawBtn(dpadRects.left, "◀");
  drawBtn(dpadRects.right, "▶");
}



    // Buttons + hotbar
    CTX.font = `bold 14px "Courier New", monospace`;
    CTX.textAlign = "center";
    CTX.textBaseline = "middle";

    // Right cluster (WAIT/TALK/MENU) - tight boxes
for (const b of buttons) {
  const hit = b.rect;
  if (!hit) continue;

  // 👇 visual box is smaller than hit box
  const vScale = 0.68; // ← THIS controls how tight it looks
  const vw = (hit.w * vScale) | 0;
  const vh = (hit.h * vScale) | 0;
  const vx = (hit.x + (hit.w - vw) / 2) | 0;
  const vy = (hit.y + (hit.h - vh) / 2) | 0;

  CTX.fillStyle = "rgba(0,255,120,0.08)";
  CTX.fillRect(vx, vy, vw, vh);

  CTX.strokeStyle = "rgba(0,255,120,0.22)";
  CTX.strokeRect(vx, vy, vw, vh);

  CTX.fillStyle = "rgba(0,255,160,0.85)";
  CTX.fillText(b.label, vx + vw / 2, vy + vh / 2);
}


   // Hotbar row (tap 1–5) — draw icon + qty
for (let i = 0; i < hotbarRects.length; i++) {
  const r = hotbarRects[i];

  // slot background
  CTX.fillStyle = "rgba(0,255,120,0.07)";
  CTX.fillRect(r.x, r.y, r.w, r.h);
  CTX.strokeStyle = "rgba(0,255,120,0.18)";
  CTX.strokeRect(r.x, r.y, r.w, r.h);

  const it = player.hotbar[i];

  if (it) {
    // draw item icon (use the same sprite frames as ground items)
    const frames = itemFrames(it.ch);
    const im = (frames && frames[0]) || firstAvailableFrame(frames);

    if (im) {
      const pad = 5;
      const size = Math.min(r.w, r.h) - pad * 2;
      CTX.drawImage(im, 0, 0, SPRITE_SRC, SPRITE_SRC, r.x + pad, r.y + pad, size, size);
    } else {
      // fallback if art missing
      CTX.fillStyle = "rgba(0,255,180,0.75)";
      CTX.fillText(String(i + 1), r.x + r.w / 2, r.y + r.h / 2);
    }

    // qty badge (only if > 1)
    const q = (it.qty ?? 1) | 0;
    if (q > 1) {
      CTX.save();
      CTX.textAlign = "right";
      CTX.textBaseline = "bottom";
      CTX.font = `bold ${Math.max(12, (TS * 0.38) | 0)}px "Courier New", monospace`;

      // tiny dark backing so it’s readable
      CTX.fillStyle = "rgba(0,0,0,0.55)";
      const tx = r.x + r.w - 4;
      const ty = r.y + r.h - 3;
      const w = Math.max(14, (String(q).length * 8) + 10);
      const h = 16;
      CTX.fillRect(tx - w, ty - h, w, h);

      CTX.fillStyle = "rgba(0,255,200,0.95)";
      CTX.fillText(String(q), tx, ty);
      CTX.restore();
    }
  } else {
    // empty slot: show slot number
    CTX.fillStyle = "rgba(0,255,180,0.75)";
    CTX.fillText(String(i + 1), r.x + r.w / 2, r.y + r.h / 2);
  }
}


    // Menu overlay (SAVE/LOAD/NEW)
    // Menu overlay (SAVE/LOAD/NEW/INVENTORY/ARCADE)
if (mobileMenuOpen && !invOpen) {
  const opts = [
    { k:"save",   t:"SAVE" },
    { k:"load",   t:"LOAD" },
    { k:"new",    t:"NEW"  },
    { k:"log",    t:"LOG"  },
    { k:"i",      t:"INVENTORY" },
    { k:"arcade", t:"ARCADE" },
  ];

  const w = 260;
  const h = 44 + opts.length * 40 + 12;

  const x = W - w - 18;
  const y = H - MOBILE_UI_H - h - 14;

  CTX.fillStyle = "rgba(0,0,0,0.72)";
  CTX.fillRect(x, y, w, h);
  CTX.strokeStyle = "rgba(0,255,120,0.25)";
  CTX.strokeRect(x, y, w, h);

  CTX.fillStyle = "rgba(0,255,180,0.85)";
  CTX.textAlign = "left";
  CTX.fillText("MENU", x + 14, y + 22);

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
      "Reach floor 100 → Genesis Block → rewrite tx#0 → escape with an immutable Lambo.",
      "GM degens. WAGMI if diamond hands. NGMI if paper hands."
    ].forEach(l => log(l, "#ff9"));
  }

  async function init() {
    await loadImages(ASSET);

    // don’t auto-open debug overlay on mobile
    if (!isMobile && GFX.missing.some(m => m.key === "floor" || m.key === "wall" || m.key === "stairsDown")) {
  setArtDebugVisible(true);
}


    if (!loadGame()) newGame();
    revealFog();
    updateUI();
    render();
  }

  setInterval(playerTurn, 40);
  init();
})();
