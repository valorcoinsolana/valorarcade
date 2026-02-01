const BASE_W = 900;
const BASE_H = 520;

const GAMES = [
  {
    id: "dev-bot-dodger",
    title: "Dev Bot Dodger",
    desc: "You’re a dev. Bots swarm in with scam bubbles. Dodge as long as possible.",
    tags: ["Arcade Survival", "Skill-based", "Token-gated play"],
    path: "./lobby/games/dev-bot-dodger/",
    status: "live", // live | coming_soon
  },
];

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

class LobbyScene extends Phaser.Scene {
  constructor() { super("LobbyScene"); this.scrollY = 0; this.targetScrollY = 0; }

  create() {
    this.add.rectangle(BASE_W/2, BASE_H/2, BASE_W, BASE_H, 0x0b0f14, 1);

    const dots = this.add.graphics();
    dots.fillStyle(0xffffff, 0.05);
    for (let i = 0; i < 90; i++) dots.fillCircle(Phaser.Math.Between(0, BASE_W), Phaser.Math.Between(0, BASE_H), Phaser.Math.Between(1, 2));

    this.add.text(24, 20, "VALOR Arcade", { fontFamily:"system-ui, Arial", fontSize:"34px", color:"#e6edf3" });
    this.add.text(24, 58, "Drag/scroll • Tap a card to play", { fontFamily:"system-ui, Arial", fontSize:"14px", color:"#94a3b8" });

    this.viewport = new Phaser.Geom.Rectangle(0, 92, BASE_W, BASE_H - 130);
    this.content = this.add.container(0, 0);

    const maskGfx = this.make.graphics({ x:0, y:0, add:false });
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height);
    this.content.setMask(maskGfx.createGeometryMask());

    this.add.text(24, BASE_H - 28, "Viewing is open. Some games may require holding ≥ 1 VALOR to play.", {
      fontFamily:"system-ui, Arial", fontSize:"12px", color:"#64748b"
    });

    this.buildCards();

    // wheel scroll (desktop)
    this.input.on("wheel", (_p, _go, _dx, dy) => { this.targetScrollY += dy * 0.9; this.clampScroll(); });

    // drag scroll (mobile + desktop)
    this.isDragging = false;
    this.input.on("pointerdown", (p) => {
      if (!this.viewport.contains(p.x, p.y)) return;
      this.isDragging = true;
      this.dragStartY = p.y;
      this.scrollStartY = this.targetScrollY;
    });
    this.input.on("pointermove", (p) => {
      if (!this.isDragging) return;
      this.targetScrollY = this.scrollStartY - (p.y - this.dragStartY);
      this.clampScroll();
    });
    this.input.on("pointerup", () => this.isDragging = false);
    this.input.on("pointerupoutside", () => this.isDragging = false);
  }

  buildCards() {
    this.content.removeAll(true);

    const padX = 24;
    const padY = 10;
    const cardW = 852;
    const cardH = 150;

    let y = this.viewport.y + padY;

    for (const g of GAMES) {
      const card = this.makeCard(padX, y, cardW, cardH, g);
      this.content.add(card);
      y += cardH + 14;
    }

    this.contentHeight = Math.max(0, y - this.viewport.y) + 24;
    this.scrollLimit = Math.max(0, this.contentHeight - this.viewport.height);
    this.targetScrollY = 0;
    this.scrollY = 0;
  }

  makeCard(x, y, w, h, g) {
    const c = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 1);
    bg.lineStyle(2, 0x1f2937, 1);
    bg.fillRoundedRect(0, 0, w, h, 18);
    bg.strokeRoundedRect(0, 0, w, h, 18);

    const title = this.add.text(18, 14, g.title, { fontFamily:"system-ui, Arial", fontSize:"20px", color:"#e6edf3" });
    const desc = this.add.text(18, 44, g.desc, { fontFamily:"system-ui, Arial", fontSize:"13px", color:"#cbd5e1", wordWrap:{ width:w-36 } });

    const btn = this.add.rectangle(w - 18 - 140, h - 18 - 42, 140, 42, 0x1f2937, 1).setOrigin(0,0);
    btn.setStrokeStyle(1, 0x334155, 1);
    const btnText = this.add.text(w - 18 - 70, h - 18 - 21, g.status === "live" ? "PLAY" : "SOON", {
      fontFamily:"system-ui, Arial", fontSize:"16px", color: g.status === "live" ? "#e6edf3" : "#64748b"
    }).setOrigin(0.5);

    const hit = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0).setInteractive({ useHandCursor: g.status === "live" });
    if (g.status === "live") hit.on("pointerdown", () => window.location.href = g.path);

    c.add([bg, title, desc, btn, btnText, hit]);
    return c;
  }

  clampScroll() { this.targetScrollY = clamp(this.targetScrollY, 0, this.scrollLimit); }

  update() {
    this.scrollY = Phaser.Math.Linear(this.scrollY, this.targetScrollY, 0.18);
    this.content.y = -this.scrollY;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b0f14",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: BASE_W,
    height: BASE_H,
  },
  scene: [LobbyScene],
});
