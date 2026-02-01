const W = 800, H = 450;

class Demo extends Phaser.Scene {
  create() {
    this.add.rectangle(W/2, H/2, W, H, 0x0b0f14, 1);
    this.add.text(W/2, H/2 - 10, "Dev Bot Dodger", { fontFamily:"system-ui, Arial", fontSize:"36px", color:"#e6edf3" }).setOrigin(0.5);
    this.add.text(W/2, H/2 + 30, "Game code goes here next.", { fontFamily:"system-ui, Arial", fontSize:"14px", color:"#94a3b8" }).setOrigin(0.5);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b0f14",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
  scene: [Demo],
});
