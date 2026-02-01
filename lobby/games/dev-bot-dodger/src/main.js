// Dev Bot Dodger - Phaser 3
// Start Menu -> Play -> Game Over
// Drop-in for: lobby/games/dev-bot-dodger/src/main.js

const W = 800;
const H = 450;

// Assets
const SPRITES_KEY = "devBotSprites";
const SPRITES_URL = new URL("./assets/sprites/dev-bot-sprites.png", import.meta.url).toString();
 // relative to this file on GitHub Pages
const FRAME = 16; // 16x16 frames

// Bubble behavior (sporadic)
const BUBBLE_CHANCE = 0.45;        // % of bots that have bubbles at all
const BUBBLE_ON_MS = [900, 1600];  // bubble visible duration range
const BUBBLE_OFF_MS = [900, 2400]; // hidden duration range

const SCAM_LINES = [
  "Link wallet to claim",
  "Urgent: wallet compromised",
  "Send 0.5 SOL to verify",
  "AirDrop ending soon",
  "Click to mint for free",
  "Support here: dm admin",
  "Your account is flagged",
  "Claim rewards now",
  "We need your seed phrase",
  "Verify to unlock access",
];

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function randItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pad2(n) { return String(n).padStart(2, "0"); }
function normalize(x, y) {
  const d = Math.hypot(x, y) || 1;
  return [x / d, y / d];
}

class DevBotDodger extends Phaser.Scene {
  constructor() {
    super("DevBotDodger");
    this.state = "MENU"; // MENU | PLAY | GAMEOVER
  }

  preload() {
    this.load.on("loaderror", (file) => console.error("ASSET LOAD ERROR:", file.src));
    // Sprite sheet: rows = dev / scam / admin / verified
    // columns: idle0 idle1 move0 move1 move2 move3  (6 frames across)
    this.load.spritesheet(SPRITES_KEY, SPRITES_URL, {
      frameWidth: FRAME,
      frameHeight: FRAME,
      margin: 0,
      spacing: 0,
    });
  }

  create() {
    // Pixel art crispness
    this.cameras.main.setRoundPixels(true);
    if (this.textures?.get?.(SPRITES_KEY)) {
      this.textures.get(SPRITES_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Animations (safe to call once; Phaser ignores duplicates if keys match)
    this.createAnimationsOnce();

    // Background
    this.add.rectangle(W / 2, H / 2, W, H, 0x0b0f14, 1);

    // Subtle dots
    const dots = this.add.graphics();
    dots.fillStyle(0xffffff, 0.05);
    for (let i = 0; i < 90; i++) {
      dots.fillCircle(
        Phaser.Math.Between(0, W),
        Phaser.Math.Between(0, H),
        Phaser.Math.Between(1, 2)
      );
    }

    // HUD (always present)
    this.titleText = this.add.text(16, 10, "Dev Bot Dodger", {
      fontFamily: "system-ui, Arial",
      fontSize: "18px",
      color: "#e6edf3",
    });

    this.timeText = this.add.text(16, 34, "Uptime: 00:00", {
      fontFamily: "system-ui, Arial",
      fontSize: "14px",
      color: "#cbd5e1",
    });

    this.hintText = this.add.text(W - 16, 12, "WASD/Arrows • Touch joystick", {
      fontFamily: "system-ui, Arial",
      fontSize: "12px",
      color: "#64748b",
    }).setOrigin(1, 0);

    // Player (sprite)
    this.player = this.add.sprite(W / 2, H / 2, SPRITES_KEY, this.frameAt("dev", 0))
      .setOrigin(0.5, 0.5);
    this.player.setScale(2); // 16px -> 32px on screen
    this.playerSpeed = 220;
    this.playerVel = { x: 0, y: 0 }; // used for prediction

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D,R,H,ENTER,SPACE");

    // Enemies
    this.bots = [];
    this.maxBots = 35;

    // Difficulty / spawning (only active in PLAY)
    this.startTime = 0;
    this.elapsedSeconds = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 1200; // updated in update()

    // Touch joystick (only used in PLAY)
    this.joy = this.createJoystick();

    // UI layers
    this.menuUI = this.buildMenuUI();
    this.gameOverUI = this.buildGameOverUI();

    // Keep UI above bots always
    this.menuUI.setDepth(1000);
    this.gameOverUI.setDepth(1000);

    // Global pointer handler
    this.input.on("pointerdown", (p) => {
      if (this.state === "GAMEOVER") {
        if (!this.isPointerOnButton(p)) this.restartToMenu(false);
      }
    });

    // Keyboard shortcuts
    this.keys.ENTER.on("down", () => this.onPrimaryAction());
    this.keys.SPACE.on("down", () => this.onPrimaryAction());
    this.keys.H.on("down", () => {
      if (this.state === "MENU") this.toggleHowTo();
    });
    this.keys.R.on("down", () => {
      if (this.state === "GAMEOVER") this.restartToMenu(false);
    });

    // Start at menu
    this.enterMenu();
  }

  // ---------- SPRITES / ANIMS ----------

  // Row indices in the sheet
  // dev row, scam bot row, admin bot row, verified bot row
  rowIndex(type) {
    if (type === "dev") return 0;
    if (type === "scam") return 1;
    if (type === "admin") return 2;
    if (type === "verified") return 3;
    return 1;
  }

  // column 0..5 (idle0 idle1 move0..move3)
  frameAt(type, col) {
    const row = this.rowIndex(type);
    return row * 6 + col;
  }

  createAnimationsOnce() {
    const mk = (key, frames, frameRate, repeat) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: frames.map((f) => ({ key: SPRITES_KEY, frame: f })),
        frameRate,
        repeat,
      });
    };

    // Dev
    mk("dev-idle", [this.frameAt("dev", 0), this.frameAt("dev", 1)], 3, -1);
    mk("dev-move", [this.frameAt("dev", 2), this.frameAt("dev", 3), this.frameAt("dev", 4), this.frameAt("dev", 5)], 8, -1);

    // Scam bot
    mk("scam-idle", [this.frameAt("scam", 0), this.frameAt("scam", 1)], 3, -1);
    mk("scam-move", [this.frameAt("scam", 2), this.frameAt("scam", 3), this.frameAt("scam", 4), this.frameAt("scam", 5)], 8, -1);

    // Admin bot
    mk("admin-idle", [this.frameAt("admin", 0), this.frameAt("admin", 1)], 3, -1);
    mk("admin-move", [this.frameAt("admin", 2), this.frameAt("admin", 3), this.frameAt("admin", 4), this.frameAt("admin", 5)], 8, -1);

    // Verified bot
    mk("verified-idle", [this.frameAt("verified", 0), this.frameAt("verified", 1)], 3, -1);
    mk("verified-move", [this.frameAt("verified", 2), this.frameAt("verified", 3), this.frameAt("verified", 4), this.frameAt("verified", 5)], 8, -1);
  }

  // ---------- MENU / GAMEOVER UI ----------

  buildMenuUI() {
    const ui = this.add.container(0, 0);

    const panel = this.add.rectangle(W / 2, H / 2, 520, 260, 0x0f172a, 0.96);
    panel.setStrokeStyle(2, 0x1f2937, 1);

    const title = this.add.text(W / 2, H / 2 - 92, "DEV BOT DODGER", {
      fontFamily: "system-ui, Arial",
      fontSize: "34px",
      color: "#e6edf3",
    }).setOrigin(0.5);

    const subtitle = this.add.text(W / 2, H / 2 - 52, "Dodge scam bots as long as possible.", {
      fontFamily: "system-ui, Arial",
      fontSize: "14px",
      color: "#cbd5e1",
    }).setOrigin(0.5);

    const playBtn = this.makeButton(W / 2, H / 2 + 6, 220, 44, "PLAY", () => this.startGame());
    const howBtn = this.makeButton(W / 2, H / 2 + 62, 220, 38, "HOW TO PLAY", () => this.toggleHowTo(), true);

    const howPanel = this.add.container(0, 0).setVisible(false);
    const howBox = this.add.rectangle(W / 2, H / 2 + 24, 520, 260, 0x0b0f14, 0.96);
    howBox.setStrokeStyle(2, 0x334155, 1);

    const howTitle = this.add.text(W / 2, H / 2 - 82, "How to Play", {
      fontFamily: "system-ui, Arial",
      fontSize: "22px",
      color: "#e6edf3",
    }).setOrigin(0.5);

    const howText = this.add.text(
      W / 2,
      H / 2 - 38,
      "• Move: WASD / Arrow Keys\n• Mobile: touch left side for joystick\n• Survive: avoid bots + scam bubbles\n• Score: time survived\n\nTip: Keep moving. Don’t get cornered.",
      {
        fontFamily: "system-ui, Arial",
        fontSize: "14px",
        color: "#cbd5e1",
        align: "left",
        lineSpacing: 6,
      }
    ).setOrigin(0.5, 0);

    const closeBtn = this.makeButton(W / 2, H / 2 + 130, 220, 40, "BACK", () => this.toggleHowTo());

    howPanel.add([howBox, howTitle, howText, closeBtn]);

    ui.add([panel, title, subtitle, playBtn, howBtn, howPanel]);

    ui._howPanel = howPanel;
    ui._buttons = [playBtn, howBtn, closeBtn];
    return ui;
  }

  buildGameOverUI() {
    const ui = this.add.container(0, 0).setVisible(false);

    const panel = this.add.rectangle(W / 2, H / 2, 520, 240, 0x0f172a, 0.96);
    panel.setStrokeStyle(2, 0x1f2937, 1);

    const title = this.add.text(W / 2, H / 2 - 70, "YOU GOT RUGGED.", {
      fontFamily: "system-ui, Arial",
      fontSize: "32px",
      color: "#e6edf3",
    }).setOrigin(0.5);

    const score = this.add.text(W / 2, H / 2 - 30, "", {
      fontFamily: "system-ui, Arial",
      fontSize: "14px",
      color: "#cbd5e1",
    }).setOrigin(0.5);

    const retryBtn = this.makeButton(W / 2, H / 2 + 26, 220, 44, "RETRY", () => this.restartToMenu(false));
    const hint = this.add.text(W / 2, H / 2 + 78, "Press R • Tap anywhere • Enter/Space", {
      fontFamily: "system-ui, Arial",
      fontSize: "12px",
      color: "#64748b",
    }).setOrigin(0.5);

    ui.add([panel, title, score, retryBtn, hint]);
    ui._scoreText = score;
    ui._buttons = [retryBtn];
    return ui;
  }

  makeButton(cx, cy, w, h, label, onClick, subtle = false) {
    const c = this.add.container(cx, cy);

    const bg = this.add.rectangle(0, 0, w, h, subtle ? 0x111827 : 0x1f2937, 1);
    bg.setStrokeStyle(1, subtle ? 0x334155 : 0x475569, 1);

    const text = this.add.text(0, 0, label, {
      fontFamily: "system-ui, Arial",
      fontSize: subtle ? "14px" : "16px",
      color: subtle ? "#cbd5e1" : "#e6edf3",
    }).setOrigin(0.5);

    const hit = this.add.rectangle(0, 0, w, h, 0x000000, 0).setInteractive({ useHandCursor: true });

    hit.on("pointerover", () => bg.setFillStyle(subtle ? 0x0f172a : 0x334155, 1));
    hit.on("pointerout", () => bg.setFillStyle(subtle ? 0x111827 : 0x1f2937, 1));
    hit.on("pointerdown", onClick);

    c.add([bg, text, hit]);
    c._w = w; c._h = h;
    return c;
  }

  isPointerOnButton(p) {
    const buttons = [];
    if (this.menuUI && this.menuUI.visible) buttons.push(...this.menuUI._buttons);
    if (this.gameOverUI && this.gameOverUI.visible) buttons.push(...this.gameOverUI._buttons);
    for (const b of buttons) {
      const left = b.x - b._w / 2;
      const right = b.x + b._w / 2;
      const top = b.y - b._h / 2;
      const bottom = b.y + b._h / 2;
      if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) return true;
    }
    return false;
  }

  toggleHowTo() {
    const how = this.menuUI._howPanel;
    how.setVisible(!how.visible);
  }

  onPrimaryAction() {
    if (this.state === "MENU") {
      if (this.menuUI._howPanel.visible) this.toggleHowTo();
      else this.startGame();
    } else if (this.state === "GAMEOVER") {
      this.restartToMenu(false);
    }
  }

  enterMenu() {
    this.state = "MENU";
    this.menuUI.setVisible(true);
    this.gameOverUI.setVisible(false);

    this.clearBots();
    this.player.setPosition(W / 2, H / 2);
    this.player.setAlpha(1);
    this.player.play("dev-idle", true);
    this.player.setTint(0xffffff);

    this.elapsedSeconds = 0;
    this.timeText.setText("Uptime: 00:00");
  }

  startGame() {
    this.state = "PLAY";
    this.menuUI.setVisible(false);
    this.gameOverUI.setVisible(false);
    this.menuUI._howPanel.setVisible(false);

    this.clearBots();
    this.player.setPosition(W / 2, H / 2);
    this.player.setAlpha(1);
    this.player.play("dev-idle", true);
    this.player.setTint(0xffffff);

    this.startTime = this.time.now;
    this.elapsedSeconds = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 1200;
    this.timeText.setText("Uptime: 00:00");
  }

  restartToMenu(showMenu = true) {
    if (showMenu) this.enterMenu();
    else this.startGame();
  }

  // ---------- JOYSTICK ----------

  createJoystick() {
    const base = this.add.circle(90, H - 90, 44, 0x111827, 0.6).setVisible(false);
    base.setStrokeStyle(2, 0x334155, 0.8);

    const knob = this.add.circle(90, H - 90, 18, 0x1f2937, 0.8).setVisible(false);
    knob.setStrokeStyle(2, 0x475569, 0.9);

    const joy = {
      active: false,
      pointerId: null,
      cx: 90,
      cy: H - 90,
      radius: 44,
      dx: 0,
      dy: 0,
      base,
      knob,
    };

    this.input.on("pointerdown", (p) => {
      if (this.state !== "PLAY") return;
      if (p.x > W * 0.55) return;

      joy.active = true;
      joy.pointerId = p.id;
      joy.cx = clamp(p.x, 60, W - 60);
      joy.cy = clamp(p.y, 60, H - 60);
      joy.base.setPosition(joy.cx, joy.cy).setVisible(true);
      joy.knob.setPosition(joy.cx, joy.cy).setVisible(true);
      joy.dx = 0; joy.dy = 0;
    });

    this.input.on("pointermove", (p) => {
      if (!joy.active) return;
      if (p.id !== joy.pointerId) return;

      const vx = p.x - joy.cx;
      const vy = p.y - joy.cy;
      const len = Math.hypot(vx, vy) || 1;

      const max = joy.radius;
      const sx = vx * Math.min(1, max / len);
      const sy = vy * Math.min(1, max / len);

      joy.knob.setPosition(joy.cx + sx, joy.cy + sy);

      joy.dx = clamp(sx / max, -1, 1);
      joy.dy = clamp(sy / max, -1, 1);
    });

    const endJoy = (p) => {
      if (!joy.active) return;
      if (p.id !== joy.pointerId) return;
      joy.active = false;
      joy.pointerId = null;
      joy.base.setVisible(false);
      joy.knob.setVisible(false);
      joy.dx = 0; joy.dy = 0;
    };

    this.input.on("pointerup", endJoy);
    this.input.on("pointerupoutside", endJoy);

    return joy;
  }

  // ---------- ENEMIES ----------

  randomBotType() {
    // Equal chance across the 3 styles
    const r = Math.random();
    if (r < 1 / 3) return "scam";
    if (r < 2 / 3) return "admin";
    return "verified";
  }

  spawnBot(speedBoost) {
    if (this.bots.length >= this.maxBots) return;

    const side = Phaser.Math.Between(0, 3);
    let x, y;

    if (side === 0) { x = -20; y = Phaser.Math.Between(0, H); }
    if (side === 1) { x = W + 20; y = Phaser.Math.Between(0, H); }
    if (side === 2) { x = Phaser.Math.Between(0, W); y = -20; }
    if (side === 3) { x = Phaser.Math.Between(0, W); y = H + 20; }

    const botType = this.randomBotType();

    const bot = this.add.sprite(x, y, SPRITES_KEY, this.frameAt(botType, 0))
      .setOrigin(0.5, 0.5);
    bot.setScale(2);
    bot.play(`${botType}-idle`, true);

    const hasBubble = Math.random() < BUBBLE_CHANCE;

    let bubble = null;
    let bobTween = null;

    if (hasBubble) {
      bubble = this.add.text(x, y - 26, randItem(SCAM_LINES), {
        fontFamily: "system-ui, Arial",
        fontSize: "12px",
        color: "#e6edf3",
        backgroundColor: "rgba(15,23,42,0.85)",
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
      }).setOrigin(0.5);

      bubble.setStroke("#0b0f14", 4);

      const startVisible = Math.random() < 0.5;
      bubble.setAlpha(startVisible ? 1 : 0);
      bubble.setScale(1);

      bobTween = this.tweens.add({
        targets: bubble,
        y: bubble.y - 6,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
      });
    }

    // Bot personality for steering (prevents clumping)
    const personality = {
      sepWeight: Phaser.Math.FloatBetween(0.9, 1.6),
      chaseWeight: Phaser.Math.FloatBetween(0.7, 1.2),
      strafeWeight: Phaser.Math.FloatBetween(0.0, 0.9),
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      predict: Phaser.Math.FloatBetween(0.0, 0.35),
    };

    this.bots.push({
      bot,
      botType,
      bubble,
      bobTween,
      speed: 70 + speedBoost,
      hasBubble,
      bubbleNextAt: hasBubble ? (this.time.now + Phaser.Math.Between(300, 1200)) : 0,
      personality,
      lastX: x,
      lastY: y,
    });
  }

  clearBots() {
    for (const b of this.bots) {
      if (b.bobTween) b.bobTween.stop();
      if (b.bot) b.bot.destroy();
      if (b.bubble) b.bubble.destroy();
    }
    this.bots = [];
  }

  // ---------- GAME LOOP ----------

  update(time, delta) {
    if (this.state !== "PLAY") return;

    // Time survived
    this.elapsedSeconds = Math.max(0, Math.floor((time - this.startTime) / 1000));
    const mm = Math.floor(this.elapsedSeconds / 60);
    const ss = this.elapsedSeconds % 60;
    this.timeText.setText(`Uptime: ${pad2(mm)}:${pad2(ss)}`);

    // Difficulty ramp
    const t = this.elapsedSeconds;
    this.spawnInterval = clamp(1200 - t * 6, 450, 1200);
    const speedBoost = clamp(t * 1.0, 0, 140);

    // Spawn bots
    this.spawnTimer += delta;
    while (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer -= this.spawnInterval;
      this.spawnBot(speedBoost);
    }

    // Player movement input
    let ix = 0, iy = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) ix -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) ix += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) iy -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) iy += 1;

    if (this.joy && this.joy.active) { ix += this.joy.dx; iy += this.joy.dy; }

    const len = Math.hypot(ix, iy);
    if (len > 0) { ix /= len; iy /= len; }

    // Track player velocity for prediction
    this.playerVel.x = ix * this.playerSpeed;
    this.playerVel.y = iy * this.playerSpeed;

    const dt = delta / 1000;

    // Apply movement
    const nextX = clamp(this.player.x + ix * this.playerSpeed * dt, 12, W - 12);
    const nextY = clamp(this.player.y + iy * this.playerSpeed * dt, 12, H - 12);

    // Flip sprite based on direction
    if (Math.abs(ix) > 0.05) this.player.setFlipX(ix < 0);

    // Animate idle/move
    const moving = Math.hypot(ix, iy) > 0.05;
    if (moving) this.player.play("dev-move", true);
    else this.player.play("dev-idle", true);

    this.player.setPosition(nextX, nextY);

    // Bots steer + collision
    const sepRadius = 42;

    for (const b of this.bots) {
      // Predict target a bit ahead
      const pr = b.personality?.predict ?? 0;
      const targetX = this.player.x + this.playerVel.x * pr;
      const targetY = this.player.y + this.playerVel.y * pr;

      // Chase direction
      let vx = targetX - b.bot.x;
      let vy = targetY - b.bot.y;
      [vx, vy] = normalize(vx, vy);

      // Strafe
      let sx = -vy;
      let sy = vx;
      const sdir = b.personality?.strafeDir ?? 1;
      sx *= sdir; sy *= sdir;

      // Separation
      let ax = 0, ay = 0;
      for (const o of this.bots) {
        if (o === b) continue;
        const ox = b.bot.x - o.bot.x;
        const oy = b.bot.y - o.bot.y;
        const dist = Math.hypot(ox, oy);
        if (dist > 0 && dist < sepRadius) {
          const push = (sepRadius - dist) / sepRadius;
          ax += (ox / dist) * push;
          ay += (oy / dist) * push;
        }
      }
      [ax, ay] = normalize(ax, ay);

      const chaseW = b.personality?.chaseWeight ?? 1;
      const strafeW = b.personality?.strafeWeight ?? 0.4;
      const sepW = b.personality?.sepWeight ?? 1.2;

      let mx = vx * chaseW + sx * strafeW + ax * sepW;
      let my = vy * chaseW + sy * strafeW + ay * sepW;
      [mx, my] = normalize(mx, my);

      const prevX = b.bot.x;
      const prevY = b.bot.y;

      b.bot.x += mx * b.speed * dt;
      b.bot.y += my * b.speed * dt;

      // Bot animation switching
      const bdx = b.bot.x - prevX;
      if (Math.abs(bdx) > 0.02) b.bot.setFlipX(bdx < 0);

      const botMoving = (Math.abs(b.bot.x - prevX) + Math.abs(b.bot.y - prevY)) > 0.02;
      if (botMoving) b.bot.play(`${b.botType}-move`, true);
      else b.bot.play(`${b.botType}-idle`, true);

      // Bubble follow + sporadic show/hide
      if (b.hasBubble && b.bubble) {
        b.bubble.x = b.bot.x;
        b.bubble.y = b.bot.y - 28;

        if (time >= b.bubbleNextAt && !b.bubble._cycleBusy) {
          b.bubble._cycleBusy = true;

          if (b.bubble.alpha < 0.05) {
            b.bubble.setText(randItem(SCAM_LINES));
            b.bubble.setScale(0.96);

            this.tweens.add({
              targets: b.bubble,
              alpha: 1,
              scale: 1,
              duration: 180,
              ease: "Back.Out",
              onComplete: () => {
                b.bubble._cycleBusy = false;
                b.bubbleNextAt = time + Phaser.Math.Between(BUBBLE_ON_MS[0], BUBBLE_ON_MS[1]);
              },
            });
          } else {
            this.tweens.add({
              targets: b.bubble,
              alpha: 0,
              scale: 0.98,
              duration: 160,
              ease: "Sine.In",
              onComplete: () => {
                b.bubble._cycleBusy = false;
                b.bubbleNextAt = time + Phaser.Math.Between(BUBBLE_OFF_MS[0], BUBBLE_OFF_MS[1]);
              },
            });
          }
        }
      }

      // Collision (still simple AABB-ish)
      const hit = Math.abs(this.player.x - b.bot.x) < 16 && Math.abs(this.player.y - b.bot.y) < 16;
      if (hit) {
        this.gameOver();
        break;
      }
    }
  }

  gameOver() {
    if (this.state === "GAMEOVER") return;
    this.state = "GAMEOVER";

    // Tint player orange
    this.player.setTint(0xf97316);
    this.player.play("dev-idle", true);

    const mm = Math.floor(this.elapsedSeconds / 60);
    const ss = this.elapsedSeconds % 60;
    this.gameOverUI._scoreText.setText(`Uptime survived: ${pad2(mm)}:${pad2(ss)}`);

    this.gameOverUI.setVisible(true);

    // Fade bots/bubbles behind overlay
    for (const b of this.bots) {
      this.tweens.add({
        targets: [b.bot, b.bubble].filter(Boolean),
        alpha: 0.25,
        duration: 180,
        ease: "Sine.Out",
      });
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b0f14",
  render: {
    pixelArt: true,
    antialias: false,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: W,
    height: H,
  },
  scene: [DevBotDodger],
});
