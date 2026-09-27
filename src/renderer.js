/* Original, procedural artwork for Ashveil. All coordinates are CSS pixels. */
const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const noise = (x, y = 0, seed = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
};
const ellipse = (c, x, y, rx, ry, fill, stroke) => {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
  }
};
const polygon = (c, points, fill, stroke) => {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
  }
};
const line = (c, points, color, width = 1) => {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.stroke();
};

export class DungeonRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.width = 1;
    this.height = 1;
    this.tileW = 49;
    this.tileH = 24.5;
    this.camera = null;
    this.textures = [];
    this.floor = null;
    this.map = null;
    this.walls = [];
    this.time = 0;
    this.heroStride = 0;
    this.heroMoving = false;
    this.lastHeroPosition = null;
    this.resize();
    this.makeTextures();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width),
      height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (width !== this.width || height !== this.height || dpr !== this.dpr) {
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  project(x, y) {
    return { x: (x - y) * this.tileW, y: (x + y) * this.tileH };
  }

  screen(x, y) {
    const p = this.project(x, y);
    return {
      x: p.x - this.camera.x + this.width * 0.5,
      y: p.y - this.camera.y + this.height * 0.48,
    };
  }

  screenToWorld(clientX, clientY, game) {
    const rect = this.canvas.getBoundingClientRect();
    const camera = this.camera || this.project(game.player.x, game.player.y);
    const x = (clientX - rect.left - this.width * 0.5 + camera.x) / this.tileW;
    const y = (clientY - rect.top - this.height * 0.48 + camera.y) / this.tileH;
    return { x: (x + y) / 2, y: (y - x) / 2 };
  }

  makeTextures() {
    for (let variant = 0; variant < 12; variant++) {
      const tile = document.createElement("canvas");
      tile.width = 104;
      tile.height = 60;
      const c = tile.getContext("2d");
      c.translate(52, 28);
      const value = 57 + (variant % 5) * 3;
      const base = `rgb(${value + 11},${value + 10},${value + 5})`;
      polygon(
        c,
        [
          [0, -24.5],
          [49, 0],
          [0, 24.5],
          [-49, 0],
        ],
        base,
      );
      c.save();
      c.clip();
      const wash = c.createLinearGradient(-49, -20, 40, 24);
      wash.addColorStop(0, "#a3987630");
      wash.addColorStop(1, "#161d20aa");
      c.fillStyle = wash;
      c.fillRect(-50, -26, 100, 54);
      // Hand-cut paving stones and their recessed mortar lines.
      for (let q = -2; q <= 2; q++) {
        line(
          c,
          [
            [-49, q * 14 - 24],
            [49, q * 14 + 25],
          ],
          "#202627a8",
          1.7,
        );
        line(
          c,
          [
            [-49, q * 14 - 23],
            [49, q * 14 + 26],
          ],
          "#aca58a23",
          0.8,
        );
      }
      for (let q = -2; q <= 2; q++) {
        const k = q * 23 + (variant % 2) * 9;
        line(
          c,
          [
            [k - 28, 26],
            [k + 72, -24],
          ],
          "#20252675",
          1.3,
        );
      }
      for (let i = 0; i < 85; i++) {
        const x = noise(i, variant) * 100 - 50,
          y = noise(i, variant, 1) * 50 - 25;
        c.fillStyle = i % 4 ? "#c7c0a314" : "#080e102a";
        c.fillRect(
          x,
          y,
          1 + noise(i, variant, 2) * 4,
          0.4 + noise(i, variant, 3),
        );
      }
      if (variant % 3 === 0) {
        const x = (variant - 5) * 3;
        line(
          c,
          [
            [x - 5, -14],
            [x + 1, -5],
            [x - 3, 1],
            [x + 7, 9],
            [x + 4, 14],
          ],
          "#181e20aa",
          1.2,
        );
        line(
          c,
          [
            [x - 3, 1],
            [x - 14, 4],
            [x - 19, 2],
          ],
          "#181e2080",
          0.8,
        );
      }
      if (variant % 4 === 1) {
        for (let i = 0; i < 15; i++) {
          ellipse(
            c,
            5 + noise(i, variant) * 25,
            -2 + noise(i, variant, 3) * 13,
            2 + noise(i) * 3,
            1.2,
            "#73806418",
          );
        }
      }
      c.restore();
      line(
        c,
        [
          [-48, 0],
          [0, -24],
          [48, 0],
        ],
        "#b2aa8623",
        1,
      );
      line(
        c,
        [
          [-48, 1],
          [0, 24],
          [48, 1],
        ],
        "#121a1da8",
        1.4,
      );
      this.textures.push(tile);
    }
  }

  prepareMap(map) {
    if (this.map === map) return;
    this.map = map;
    this.walls = [];
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y]?.[x]) continue;
        const adjacent = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ].some(([dx, dy]) => map.tiles[y + dy]?.[x + dx]);
        if (adjacent)
          this.walls.push({
            x: x + 0.5,
            y: y + 0.5,
            type: "wall",
            variant: Math.floor(noise(x, y) * 10),
          });
      }
  }

  render(game, dt = 1 / 60) {
    this.resize();
    this.prepareMap(game.map);
    this.time = game.time;
    const travel = this.lastHeroPosition
      ? Math.hypot(
          game.player.x - this.lastHeroPosition.x,
          game.player.y - this.lastHeroPosition.y,
        )
      : 0;
    this.heroMoving = travel > 0.0005 && travel < 2;
    if (this.heroMoving) this.heroStride += travel * 9;
    this.lastHeroPosition = { x: game.player.x, y: game.player.y };
    const c = this.ctx,
      w = this.width,
      h = this.height;
    const desired = this.project(game.player.x, game.player.y);
    if (!this.camera || this.floor !== game.floor) {
      this.camera = { ...desired };
      this.floor = game.floor;
    }
    const lerp = 1 - Math.exp(-Math.min(dt, 0.1) * 9);
    this.camera.x += (desired.x - this.camera.x) * lerp;
    this.camera.y += (desired.y - this.camera.y) * lerp;
    c.fillStyle = "#151c1e";
    c.fillRect(0, 0, w, h);
    const ambient = c.createRadialGradient(
      w * 0.53,
      h * 0.4,
      0,
      w * 0.5,
      h * 0.45,
      Math.max(w, h) * 0.72,
    );
    ambient.addColorStop(0, "#303c3c");
    ambient.addColorStop(0.5, "#212d2e");
    ambient.addColorStop(1, "#111719");
    c.fillStyle = ambient;
    c.fillRect(0, 0, w, h);
    this.drawFloor(game);
    this.drawGroundLighting(game);
    this.drawExit(game);
    this.drawGroundMarks(game);
    for (const loot of game.loot)
      if (!loot.collected) this.drawLoot(loot, false, game);
    for (const e of game.effects)
      if (e.type === "dash" || e.type === "death") this.drawEffect(e, game);
    const objects = [
      ...this.walls,
      ...game.map.decor.map((d) => ({ ...d, decor: true })),
      ...game.enemies
        .filter((e) => !e.dead)
        .map((e) => ({ ...e, enemy: true })),
      { ...game.player, hero: true },
    ];
    objects.sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const obj of objects) {
      const p = this.screen(obj.x, obj.y);
      if (p.x < -130 || p.y < -90 || p.x > w + 130 || p.y > h + 150) continue;
      c.save();
      c.translate(p.x, p.y);
      if (obj.hero) this.drawHero(c, game.player, game);
      else if (obj.enemy) this.drawEnemy(c, obj, game);
      else if (obj.type === "wall") this.drawWall(c, obj, game);
      else this.drawDecor(c, obj, game);
      c.restore();
    }
    for (const e of game.effects)
      if (e.type !== "dash" && e.type !== "death") this.drawEffect(e, game);
    this.drawAtmosphere(game);
    for (const loot of game.loot)
      if (!loot.collected) this.drawLoot(loot, true, game);
    this.drawFloatingTexts(game);
    this.drawVignette(game);
  }

  drawFloor(game) {
    const c = this.ctx,
      { map } = game;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        if (!map.tiles[y][x]) continue;
        const p = this.screen(x + 0.5, y + 0.5);
        if (
          p.x < -55 ||
          p.y < -35 ||
          p.x > this.width + 55 ||
          p.y > this.height + 35
        )
          continue;
        // A deep stone foundation remains visible at broken platform edges.
        if (!map.tiles[y + 1]?.[x] || !map.tiles[y]?.[x + 1]) {
          polygon(
            c,
            [
              [p.x - 49, p.y],
              [p.x, p.y + 24],
              [p.x + 49, p.y],
              [p.x + 49, p.y + 13],
              [p.x, p.y + 39],
              [p.x - 49, p.y + 13],
            ],
            "#202626",
            "#131c1d",
          );
        }
        const variant = Math.floor(
          noise(x, y, game.seed) * this.textures.length,
        );
        c.drawImage(this.textures[variant], p.x - 52, p.y - 28);
        if (noise(x, y, 88) > 0.94) {
          c.save();
          c.translate(p.x, p.y);
          c.scale(1, 0.5);
          ellipse(c, 0, 0, 14, 13, "#311f1e54");
          ellipse(c, 14, 10, 5, 4, "#361f2044");
          c.restore();
        }
      }
  }

  drawGroundLighting(game) {
    const c = this.ctx;
    const lights = game.map.decor.filter((d) => d.type === "brazier");
    for (const light of lights) {
      const p = this.screen(light.x, light.y);
      if (
        p.x < -250 ||
        p.x > this.width + 250 ||
        p.y < -250 ||
        p.y > this.height + 250
      )
        continue;
      c.save();
      c.translate(p.x, p.y);
      c.scale(1, 0.6);
      const glow = c.createRadialGradient(0, -15, 0, 0, 0, 205);
      glow.addColorStop(0, "#f1a15339");
      glow.addColorStop(0.35, "#df85321b");
      glow.addColorStop(1, "#d5893d00");
      c.fillStyle = glow;
      c.fillRect(-210, -210, 420, 420);
      c.restore();
    }
    const p = this.screen(game.player.x, game.player.y);
    const glow = c.createRadialGradient(p.x, p.y - 24, 5, p.x, p.y, 200);
    glow.addColorStop(0, "#ded0a211");
    glow.addColorStop(1, "#b5bba400");
    c.fillStyle = glow;
    c.fillRect(p.x - 200, p.y - 200, 400, 400);
  }

  drawGroundMarks(game) {
    const c = this.ctx;
    const spawn = this.screen(game.map.spawn.x, game.map.spawn.y);
    c.save();
    c.translate(spawn.x, spawn.y);
    c.scale(1, 0.5);
    c.strokeStyle = "#c9b99831";
    c.lineWidth = 1.1;
    c.beginPath();
    c.arc(0, 0, 79, 0, TAU);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 70, 0, TAU);
    c.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      line(
        c,
        [
          [Math.cos(a) * 64, Math.sin(a) * 64],
          [Math.cos(a) * 74, Math.sin(a) * 74],
        ],
        "#b1a58a38",
        1.5,
      );
    }
    polygon(
      c,
      [
        [0, -54],
        [12, -12],
        [49, 0],
        [12, 12],
        [0, 54],
        [-12, 12],
        [-49, 0],
        [-12, -12],
      ],
      "#99948009",
      "#c0b29923",
    );
    c.restore();
  }

  drawWall(c, obj, game) {
    const nearHero =
      Math.hypot(obj.x - game.player.x, obj.y - game.player.y) < 2.1;
    const inFront = obj.x + obj.y > game.player.x + game.player.y;
    let height = 57 + (obj.variant % 3) * 12;
    if (inFront) height = nearHero ? 13 : 29 + (obj.variant % 3) * 5;
    const tw = this.tileW,
      th = this.tileH;
    ellipse(c, 8, 5, 52, 22, "#0712154a");
    polygon(
      c,
      [
        [-tw, -height],
        [0, th - height],
        [0, th + 4],
        [-tw, 4],
      ],
      "#303936",
      "#1c2625",
    );
    polygon(
      c,
      [
        [0, th - height],
        [tw, -height],
        [tw, 4],
        [0, th + 4],
      ],
      "#232e2d",
      "#192322",
    );
    for (let row = 15; row < height; row += 16) {
      line(
        c,
        [
          [-tw, -height + row],
          [0, th - height + row],
          [tw, -height + row],
        ],
        "#101b1c80",
        2,
      );
      line(
        c,
        [
          [-tw, -height + row + 1.5],
          [0, th - height + row + 1.5],
          [tw, -height + row + 1.5],
        ],
        "#89917a21",
        0.7,
      );
      for (const side of [-1, 1]) {
        const x = side * (row % 32 ? 20 : 34);
        const y = th - Math.abs(x) / 2 - height + row;
        line(
          c,
          [
            [x, y - 14],
            [x, y],
          ],
          "#172121",
          1.5,
        );
      }
    }
    // Shallow pointed alcoves are carved into a few surviving wall sections.
    // Transform the flat relief onto a vertical isometric face.
    if (height > 50 && obj.variant % 3 === 0) {
      c.save();
      const side = obj.variant % 2 ? -1 : 1;
      c.transform(side, 0.5, 0, 1, -tw * side, -height);
      c.beginPath();
      c.moveTo(12, height - 7);
      c.lineTo(12, 27);
      c.bezierCurveTo(12, 19, 24, 15, 24, 9);
      c.bezierCurveTo(24, 15, 36, 19, 36, 27);
      c.lineTo(36, height - 7);
      c.closePath();
      c.fillStyle = "#152321b0";
      c.fill();
      c.strokeStyle = "#8290794d";
      c.lineWidth = 2;
      c.stroke();
      line(
        c,
        [
          [17, height - 8],
          [17, 29],
          [24, 20],
          [31, 29],
          [31, height - 8],
        ],
        "#405348a0",
        1,
      );
      line(
        c,
        [
          [24, 25],
          [24, height - 10],
        ],
        "#72806b55",
        1,
      );
      line(
        c,
        [
          [13, height - 6],
          [36, height - 6],
        ],
        "#96a08455",
        2,
      );
      c.restore();
    }
    for (let i = 0; i < 12; i++) {
      const x = noise(i, obj.x, obj.y) * 86 - 43;
      const y =
        th -
        Math.abs(x) * 0.5 -
        height +
        5 +
        noise(i, obj.y, obj.x) * (height - 10);
      line(
        c,
        [
          [x, y],
          [x + 2 + noise(i) * 5, y + (x < 0 ? 1 : -1)],
        ],
        i % 3 ? "#9ca18c13" : "#101c1c39",
        0.8,
      );
    }
    const top = c.createLinearGradient(-40, -height, 42, -height + 26);
    top.addColorStop(0, "#737767");
    top.addColorStop(0.45, "#5b6257");
    top.addColorStop(1, "#414e46");
    polygon(
      c,
      [
        [0, -th - height],
        [tw, -height],
        [0, th - height],
        [-tw, -height],
      ],
      top,
      "#86887148",
    );
    line(
      c,
      [
        [-tw + 2, -height],
        [0, th - height],
        [tw - 1, -height],
      ],
      "#92958046",
      1.5,
    );
    if (obj.variant % 2) {
      polygon(
        c,
        [
          [-20, -height - 8],
          [-5, -height - 14],
          [15, -height - 4],
          [8, -height + 5],
          [-3, -height + 8],
        ],
        "#37453bb0",
      );
      line(
        c,
        [
          [-5, -height - 14],
          [2, -height - 4],
          [-7, -height + 8],
          [0, -height + 24],
        ],
        "#283831",
        2,
      );
    }
    if (height > 50 && obj.variant === 4) {
      polygon(
        c,
        [
          [-14, -height - 6],
          [8, -height + 5],
          [8, -13],
          [-3, -24],
          [-14, -20],
        ],
        "#5e302c",
        "#2b2925",
      );
      line(
        c,
        [
          [-3, -height + 3],
          [-3, -29],
        ],
        "#9a745044",
        1.5,
      );
    }
  }

  drawDecor(c, d, game) {
    const t = game.time;
    if (d.type === "brazier") {
      ellipse(c, 2, 3, 22, 10, "#07101488");
      polygon(
        c,
        [
          [-15, -1],
          [0, 7],
          [16, -1],
          [0, -9],
        ],
        "#4b5148",
        "#272c27",
      );
      line(
        c,
        [
          [-7, -2],
          [-5, -26],
        ],
        "#1d2524",
        4,
      );
      line(
        c,
        [
          [7, -2],
          [5, -26],
        ],
        "#353c31",
        4,
      );
      polygon(
        c,
        [
          [-13, -33],
          [13, -33],
          [8, -24],
          [-7, -24],
        ],
        "#332b24",
        "#907451",
      );
      ellipse(c, 0, -33, 14, 6, "#ad6030", "#c29759");
      const glow = c.createRadialGradient(0, -47, 2, 0, -47, 67);
      glow.addColorStop(0, "#ffd08b44");
      glow.addColorStop(0.4, "#e4913c18");
      glow.addColorStop(1, "#db943b00");
      c.fillStyle = glow;
      c.fillRect(-70, -117, 140, 140);
      for (let i = 0; i < 4; i++) {
        const sway = Math.sin(t * 7 + i * 3 + d.x) * 3;
        c.beginPath();
        c.moveTo(-9 + i * 4, -33);
        c.bezierCurveTo(
          -14 + i * 5,
          -44,
          sway + i * 3 - 7,
          -47,
          sway + i * 3 - 5,
          -64 - Math.sin(t * 9 + i) * 6,
        );
        c.bezierCurveTo(sway + 6 + i, -51, 14 - i * 3, -36, 6 - i, -33);
        c.closePath();
        c.fillStyle = ["#bb572c", "#ec933d", "#ffcb68", "#ffe5a5"][i];
        c.fill();
      }
      for (let i = 0; i < 5; i++) {
        const phase = (t * 0.65 + i / 5 + noise(d.x, d.y)) % 1;
        c.globalAlpha = (1 - phase) * 0.7;
        ellipse(
          c,
          Math.sin(phase * 9 + i) * 12,
          -49 - phase * 43,
          0.7,
          1.6,
          "#fbc576",
        );
      }
      c.globalAlpha = 1;
    } else if (d.type === "pillar") {
      ellipse(c, 6, 3, 31, 14, "#08111480");
      polygon(
        c,
        [
          [0, -15],
          [24, -3],
          [0, 10],
          [-24, -3],
        ],
        "#6b7162",
        "#262f2a",
      );
      polygon(
        c,
        [
          [-14, -64],
          [0, -56],
          [0, 2],
          [-14, -5],
        ],
        "#565e51",
        "#303b32",
      );
      polygon(
        c,
        [
          [0, -56],
          [14, -64],
          [14, -5],
          [0, 2],
        ],
        "#343f36",
      );
      line(
        c,
        [
          [-9, -56],
          [-9, -9],
        ],
        "#96988242",
        2,
      );
      line(
        c,
        [
          [-4, -54],
          [-4, -5],
        ],
        "#202f2b80",
        2,
      );
      polygon(
        c,
        [
          [-19, -68],
          [-2, -77],
          [16, -70],
          [20, -65],
          [0, -55],
        ],
        "#7b7b67",
        "#4c584a",
      );
      polygon(
        c,
        [
          [-19, -68],
          [0, -58],
          [0, -51],
          [-19, -60],
        ],
        "#5b6656",
      );
      polygon(
        c,
        [
          [0, -58],
          [20, -66],
          [20, -59],
          [0, -51],
        ],
        "#3b4b3e",
      );
      line(
        c,
        [
          [7, -46],
          [3, -35],
          [9, -21],
          [4, -11],
        ],
        "#1d2c2780",
        1.3,
      );
    } else if (d.type === "bones") {
      ellipse(c, 0, 1, 19, 8, "#13202050");
      line(
        c,
        [
          [-18, -2],
          [7, 7],
        ],
        "#a8a18a",
        2.4,
      );
      line(
        c,
        [
          [-11, 9],
          [10, -5],
        ],
        "#827f70",
        2,
      );
      ellipse(c, 9, -4, 6, 5, "#c5b99a", "#655f51");
      ellipse(c, 7, -5, 1.3, 1.5, "#333b33");
      ellipse(c, 11, -4, 1.3, 1.5, "#333b33");
      polygon(
        c,
        [
          [7, -1],
          [12, -1],
          [11, 2],
          [7, 1],
        ],
        "#aca38b",
      );
    } else if (d.type === "grave") {
      ellipse(c, 1, 3, 21, 9, "#0f19195e");
      polygon(
        c,
        [
          [-13, 0],
          [-12, -29],
          [-8, -36],
          [0, -39],
          [9, -32],
          [12, -25],
          [11, 0],
        ],
        "#62695c",
        "#2d3c33",
      );
      polygon(
        c,
        [
          [12, -25],
          [17, -28],
          [17, -3],
          [11, 0],
        ],
        "#3c4a3f",
      );
      line(
        c,
        [
          [-2, -30],
          [-2, -10],
        ],
        "#26382d",
        2,
      );
      line(
        c,
        [
          [-7, -24],
          [4, -24],
        ],
        "#293a30",
        2,
      );
      line(
        c,
        [
          [-8, -3],
          [8, -3],
        ],
        "#9b9b7940",
        1.5,
      );
    } else if (d.type === "banner") {
      line(
        c,
        [
          [0, 0],
          [0, -78],
        ],
        "#544f3d",
        3,
      );
      line(
        c,
        [
          [-17, -69],
          [18, -69],
        ],
        "#9b8252",
        3,
      );
      polygon(
        c,
        [
          [-15, -68],
          [16, -68],
          [13, -26],
          [2, -35],
          [-13, -27],
        ],
        "#603732",
        "#312b27",
      );
      polygon(
        c,
        [
          [0, -58],
          [5, -49],
          [0, -39],
          [-5, -49],
        ],
        "#ad8c58",
      );
      line(
        c,
        [
          [-12, -65],
          [-11, -36],
        ],
        "#b27c563e",
        1,
      );
    } else {
      for (let i = 0; i < 4; i++) {
        const x = noise(i, d.x) * 30 - 15,
          y = noise(i, d.y) * 12 - 6,
          size = 4 + noise(i, d.x + d.y) * 8;
        polygon(
          c,
          [
            [x - size, y],
            [x - size * 0.4, y - size * 0.7],
            [x + size * 0.6, y - size * 0.8],
            [x + size, y],
            [x, y + size * 0.4],
          ],
          i % 2 ? "#626858" : "#4c594b",
          "#28382f",
        );
        line(
          c,
          [
            [x - size * 0.4, y - size * 0.7],
            [x + size * 0.6, y - size * 0.8],
          ],
          "#92957a70",
        );
      }
    }
  }

  drawHero(c, p, game) {
    const step = this.heroMoving ? Math.sin(this.heroStride) * 3 : 0;
    const bob = this.heroMoving
      ? Math.abs(step) * -0.4
      : Math.sin(game.time * 3) * 0.7;
    const active = p.attackTimer > 0;
    ellipse(c, 1, 3, 22, 10, "#060d13a0");
    if (p.invulnerable > 0) {
      ellipse(c, 0, 1, 25, 11, "#d3c49512", "#cabd864d");
      if (Math.sin(game.time * 40) > 0.5) c.globalAlpha = 0.65;
    }
    c.save();
    c.translate(0, bob);
    // Cloak, lined in ochre and shaped to keep the player readable at a glance.
    polygon(
      c,
      [
        [-10, -53],
        [-19, -38],
        [-21, -12],
        [-11, -4],
        [-1, -9],
        [8, -6],
        [17, -12],
        [12, -43],
        [5, -54],
      ],
      "#681e28",
      "#301b21",
    );
    polygon(
      c,
      [
        [-10, -49],
        [-15, -21],
        [-11, -8],
        [-4, -11],
        [-6, -42],
      ],
      "#a2353a",
    );
    polygon(
      c,
      [
        [5, -51],
        [12, -37],
        [14, -13],
        [6, -10],
        [1, -41],
      ],
      "#8d2933",
    );
    line(
      c,
      [
        [-18, -17],
        [-11, -9],
        [-4, -13],
      ],
      "#b56c4e",
      1,
    );
    line(
      c,
      [
        [-9, -46],
        [-13, -20],
      ],
      "#c250463f",
      2,
    );
    // Greaves and boots.
    c.save();
    c.translate(-step * 0.4, step);
    polygon(
      c,
      [
        [-10, -23],
        [-1, -21],
        [-4, -5],
        [-14, -3],
        [-15, -6],
      ],
      "#293136",
      "#111b21",
    );
    line(
      c,
      [
        [-8, -20],
        [-9, -8],
      ],
      "#7b7e73",
      2,
    );
    c.restore();
    c.save();
    c.translate(step * 0.4, -step);
    polygon(
      c,
      [
        [3, -22],
        [11, -23],
        [12, -6],
        [16, -2],
        [5, 0],
        [3, -7],
      ],
      "#263036",
      "#111b21",
    );
    line(
      c,
      [
        [7, -20],
        [8, -8],
      ],
      "#9a9680",
      2,
    );
    c.restore();
    // Layered steel breastplate with its gold clasp.
    polygon(
      c,
      [
        [-10, -49],
        [8, -49],
        [12, -36],
        [7, -23],
        [-9, -23],
        [-14, -38],
      ],
      "#626867",
      "#202a2c",
    );
    polygon(
      c,
      [
        [-7, -45],
        [0, -46],
        [1, -31],
        [-9, -33],
      ],
      "#96998a",
    );
    polygon(
      c,
      [
        [1, -46],
        [8, -45],
        [9, -32],
        [1, -30],
      ],
      "#474f50",
    );
    line(
      c,
      [
        [-8, -39],
        [1, -36],
        [9, -39],
      ],
      "#c2baa063",
      1.4,
    );
    polygon(
      c,
      [
        [-10, -29],
        [10, -29],
        [9, -24],
        [-10, -24],
      ],
      "#4b3226",
      "#191f20",
    );
    c.fillStyle = "#c4a361";
    c.fillRect(-3, -29, 5, 5);
    // Shoulder plates.
    ellipse(c, -12, -45, 8, 6, "#7d8278", "#272f31");
    ellipse(c, 10, -44, 8, 6, "#69716c", "#252e2f");
    line(
      c,
      [
        [-17, -46],
        [-13, -49],
        [-7, -46],
      ],
      "#b7b397",
      1.2,
    );
    line(
      c,
      [
        [-16, -41],
        [-20, -28],
        [-16, -24],
      ],
      "#373d3b",
      6,
    );
    ellipse(c, -16, -24, 3.5, 4.5, "#a78967", "#332b25");
    // Deep red hood around a warm, shadowed face.
    polygon(
      c,
      [
        [-10, -54],
        [-9, -62],
        [-3, -68],
        [6, -65],
        [11, -56],
        [7, -47],
        [-7, -48],
      ],
      "#842a33",
      "#351f25",
    );
    polygon(
      c,
      [
        [-6, -59],
        [0, -63],
        [7, -58],
        [5, -50],
        [-2, -49],
        [-6, -53],
      ],
      "#bca180",
    );
    polygon(
      c,
      [
        [-8, -58],
        [-1, -63],
        [8, -57],
        [1, -58],
        [-5, -54],
      ],
      "#342d2a",
    );
    line(
      c,
      [
        [-2, -55],
        [1, -55],
      ],
      "#312c28",
      1.1,
    );
    line(
      c,
      [
        [6, -62],
        [9, -55],
        [5, -47],
      ],
      "#c6584c",
      1.5,
    );
    // Sword arm follows its attack with a broad, readable gesture.
    const facing = p.facing || 0;
    const right = Math.cos(facing) - Math.sin(facing) >= 0;
    const handX = right ? 18 : -18;
    const rotation = active
      ? Math.sin(clamp(p.attackTimer * 4, 0, 1) * Math.PI) *
        (right ? 1.7 : -1.7)
      : right
        ? 0.48
        : -0.48;
    line(
      c,
      [
        [right ? 12 : -12, -41],
        [handX, -30],
      ],
      "#5f6862",
      6,
    );
    ellipse(c, handX, -30, 3.5, 4, "#b99b73", "#514031");
    c.save();
    c.translate(handX, -30);
    c.rotate(rotation);
    line(
      c,
      [
        [0, 4],
        [0, -8],
      ],
      "#563c2a",
      4,
    );
    line(
      c,
      [
        [-7, -7],
        [7, -7],
      ],
      "#c3a369",
      3,
    );
    polygon(
      c,
      [
        [-3, -9],
        [-3, -36],
        [0, -44],
        [3, -36],
        [3, -9],
      ],
      "#c4ccc4",
      "#424f50",
    );
    polygon(
      c,
      [
        [0, -42],
        [2, -35],
        [2, -10],
        [0, -10],
      ],
      "#f0e4bb",
    );
    line(
      c,
      [
        [0, -38],
        [0, -12],
      ],
      "#748986",
      0.8,
    );
    ellipse(c, 0, 5, 3, 2, "#b19458");
    c.restore();
    c.restore();
  }

  drawEnemy(c, e, game) {
    if (e.windup > 0) {
      const progress = 1 - e.windup / (e.windupMax || 1);
      c.save();
      c.scale(1, 0.5);
      const radius = Math.max(
        27,
        (e.type === "wraith" ? 0.8 : e.attackRange || 1) * 45,
      );
      ellipse(c, 0, 0, radius, radius, "#c7563620", "#c7784c70");
      c.beginPath();
      c.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
      c.strokeStyle = "#e29365";
      c.lineWidth = 2;
      c.stroke();
      c.restore();
    }
    if (e.type === "boss") {
      c.scale(1.7, 1.7);
    } else if (e.type === "brute") c.scale(1.25, 1.25);
    const bob =
      Math.sin(game.time * (e.type === "wraith" ? 2 : 3) + e.id) * 1.5;
    ellipse(
      c,
      0,
      3,
      e.type === "brute" || e.type === "boss" ? 26 : 17,
      8,
      "#080d16a3",
    );
    c.save();
    c.translate(0, bob);
    if (e.hitFlash > 0) {
      c.shadowColor = "#ffd5b8";
      c.shadowBlur = 12;
    }
    if (e.type === "wraith") {
      const glow = c.createRadialGradient(0, -29, 2, 0, -29, 48);
      glow.addColorStop(0, "#87b3bb24");
      glow.addColorStop(1, "#7797b000");
      c.fillStyle = glow;
      c.fillRect(-50, -80, 100, 100);
      polygon(
        c,
        [
          [-8, -57],
          [4, -63],
          [13, -51],
          [15, -27],
          [25, -5],
          [13, -11],
          [11, -2],
          [1, -8],
          [-10, 0],
          [-7, -13],
          [-20, -7],
          [-13, -30],
        ],
        "#343f54",
        "#191f32",
      );
      polygon(
        c,
        [
          [-7, -50],
          [-9, -25],
          [-14, -10],
          [-3, -18],
          [0, -52],
        ],
        "#657889a0",
      );
      polygon(
        c,
        [
          [2, -52],
          [9, -49],
          [10, -25],
          [18, -10],
          [5, -17],
        ],
        "#495971",
      );
      ellipse(c, 1, -49, 7, 9, "#131d29");
      line(
        c,
        [
          [-3, -50],
          [-1, -50],
        ],
        "#b9eff1",
        2,
      );
      line(
        c,
        [
          [5, -50],
          [7, -50],
        ],
        "#b9eff1",
        2,
      );
      line(
        c,
        [
          [-9, -39],
          [-24, -27],
          [-28, -16],
        ],
        "#637886",
        4,
      );
      line(
        c,
        [
          [10, -39],
          [23, -32],
          [27, -38],
        ],
        "#657c89",
        4,
      );
      line(
        c,
        [
          [-26, -20],
          [-32, -15],
        ],
        "#a9bfc0",
        1.3,
      );
      line(
        c,
        [
          [-26, -20],
          [-27, -11],
        ],
        "#a9bfc0",
        1.3,
      );
    } else if (e.type === "brute" || e.type === "boss") {
      const boss = e.type === "boss";
      polygon(
        c,
        [
          [-13, -25],
          [-2, -21],
          [-4, -3],
          [-18, -2],
          [-16, -8],
        ],
        "#303131",
        "#171d20",
      );
      polygon(
        c,
        [
          [4, -24],
          [14, -24],
          [17, -4],
          [21, -1],
          [6, 1],
        ],
        "#363434",
        "#171d20",
      );
      polygon(
        c,
        [
          [-18, -51],
          [13, -51],
          [21, -32],
          [12, -19],
          [-12, -20],
          [-23, -37],
        ],
        boss ? "#554555" : "#625744",
        "#252728",
      );
      polygon(
        c,
        [
          [-11, -49],
          [0, -52],
          [3, -29],
          [-12, -29],
        ],
        boss ? "#8c6670" : "#817260",
      );
      line(
        c,
        [
          [-17, -36],
          [0, -30],
          [16, -37],
        ],
        "#aa8f6570",
        2,
      );
      line(
        c,
        [
          [-17, -43],
          [-26, -28],
          [-21, -16],
        ],
        "#656354",
        9,
      );
      line(
        c,
        [
          [17, -43],
          [27, -31],
          [26, -19],
        ],
        "#696054",
        9,
      );
      polygon(
        c,
        [
          [-25, -49],
          [-10, -57],
          [-8, -43],
          [-21, -38],
        ],
        "#555959",
        "#242a2b",
      );
      polygon(
        c,
        [
          [9, -55],
          [25, -49],
          [22, -38],
          [10, -43],
        ],
        "#666461",
        "#252a2b",
      );
      polygon(
        c,
        [
          [-7, -62],
          [5, -66],
          [12, -57],
          [8, -44],
          [-5, -43],
          [-11, -53],
        ],
        boss ? "#817766" : "#9c8b69",
        "#383d36",
      );
      polygon(
        c,
        [
          [-9, -61],
          [-19, -70],
          [-16, -57],
          [-9, -53],
        ],
        "#aa9f7d",
      );
      polygon(
        c,
        [
          [8, -63],
          [17, -74],
          [17, -58],
          [11, -54],
        ],
        "#b0a180",
      );
      polygon(
        c,
        [
          [-7, -57],
          [-1, -54],
          [0, -50],
          [-6, -51],
        ],
        "#291e21",
      );
      polygon(
        c,
        [
          [3, -55],
          [9, -58],
          [9, -52],
          [4, -50],
        ],
        "#291e21",
      );
      ellipse(c, -3, -53, 2, 1, "#ee9d64");
      ellipse(c, 6, -54, 2, 1, "#ee9d64");
      line(
        c,
        [
          [-2, -46],
          [6, -47],
        ],
        "#ddd0a1",
        1.4,
      );
      line(
        c,
        [
          [-12, -22],
          [12, -22],
        ],
        "#332b23",
        5,
      );
      ellipse(c, 0, -22, 4, 4, "#ae905b");
      c.save();
      c.translate(27, -20);
      c.rotate(e.attackTimer > 0 ? -0.8 : 0.22);
      line(
        c,
        [
          [0, 16],
          [0, -41],
        ],
        "#66513b",
        4,
      );
      polygon(
        c,
        [
          [0, -40],
          [13, -45],
          [21, -40],
          [18, -28],
          [8, -25],
          [0, -31],
        ],
        boss ? "#b5a480" : "#9a9a86",
        "#424940",
      );
      polygon(
        c,
        [
          [0, -40],
          [-10, -43],
          [-17, -38],
          [-13, -27],
          [0, -31],
        ],
        "#727971",
        "#363f3c",
      );
      line(
        c,
        [
          [20, -40],
          [17, -29],
          [9, -26],
        ],
        "#d6ccb0",
        1.4,
      );
      c.restore();
    } else {
      // Skeletal sentry: individual ribs, bone joints, rusted kettle helm.
      line(
        c,
        [
          [-5, -24],
          [-10, -12],
          [-9, -2],
        ],
        "#b1aa91",
        4,
      );
      line(
        c,
        [
          [5, -24],
          [8, -12],
          [12, -2],
        ],
        "#a99f83",
        4,
      );
      ellipse(c, -10, -12, 3, 3, "#c1b59a");
      ellipse(c, 8, -12, 3, 3, "#c1b59a");
      line(
        c,
        [
          [-9, -2],
          [-14, 0],
        ],
        "#b9ad8d",
        3,
      );
      line(
        c,
        [
          [12, -2],
          [17, 0],
        ],
        "#c0b294",
        3,
      );
      polygon(
        c,
        [
          [-9, -28],
          [-3, -34],
          [5, -33],
          [11, -27],
          [5, -20],
          [-5, -21],
        ],
        "#868578",
        "#3b4540",
      );
      line(
        c,
        [
          [0, -48],
          [1, -29],
        ],
        "#c3b799",
        3,
      );
      for (let i = 0; i < 4; i++)
        line(
          c,
          [
            [-8 + i * 0.5, -45 + i * 4],
            [-5, -42 + i * 4],
            [1, -41 + i * 4],
            [7 - i * 0.4, -44 + i * 4],
          ],
          "#bbb196",
          2,
        );
      line(
        c,
        [
          [-9, -46],
          [-17, -34],
          [-13, -25],
        ],
        "#b5aa8e",
        3.5,
      );
      line(
        c,
        [
          [9, -46],
          [18, -36],
          [21, -25],
        ],
        "#b5aa8e",
        3.5,
      );
      ellipse(c, 0, -55, 8, 9, "#ccc1a2", "#746e5b");
      polygon(
        c,
        [
          [-6, -50],
          [6, -50],
          [4, -44],
          [-4, -44],
        ],
        "#aaa388",
      );
      ellipse(c, -4, -55, 2.3, 2.8, "#293a35");
      ellipse(c, 4, -55, 2.3, 2.8, "#293a35");
      ellipse(c, -4, -55, 1, 0.8, "#d88863");
      ellipse(c, 4, -55, 1, 0.8, "#d88863");
      polygon(
        c,
        [
          [0, -52],
          [-2, -49],
          [2, -49],
        ],
        "#394236",
      );
      line(
        c,
        [
          [-4, -46],
          [4, -46],
        ],
        "#4c5140",
        1,
      );
      polygon(
        c,
        [
          [-10, -57],
          [-7, -65],
          [4, -67],
          [10, -61],
          [9, -56],
        ],
        "#737968",
        "#303d34",
      );
      line(
        c,
        [
          [-11, -57],
          [11, -57],
        ],
        "#a4a284",
        2,
      );
      c.save();
      c.translate(21, -25);
      c.rotate(e.attackTimer > 0 ? -1 : 0.2);
      line(
        c,
        [
          [0, 4],
          [0, -7],
        ],
        "#5b4a36",
        3,
      );
      line(
        c,
        [
          [-5, -7],
          [5, -7],
        ],
        "#928264",
        2,
      );
      polygon(
        c,
        [
          [-2, -7],
          [-2, -29],
          [0, -36],
          [3, -29],
          [2, -7],
        ],
        "#a8ae9a",
        "#495c51",
      );
      c.restore();
      polygon(
        c,
        [
          [-20, -35],
          [-10, -31],
          [-12, -18],
          [-19, -15],
          [-25, -24],
        ],
        "#6a4b3a",
        "#a08b62",
      );
      line(
        c,
        [
          [-22, -26],
          [-13, -23],
        ],
        "#958465",
        1.4,
      );
    }
    c.restore();
    if (e.hp < e.maxHp) {
      const y = e.type === "wraith" ? -73 : -80;
      c.fillStyle = "#0c1216cc";
      c.fillRect(-20, y, 40, 4);
      c.fillStyle = "#a85344";
      c.fillRect(-19, y + 1, 38 * Math.max(0, e.hp / e.maxHp), 2);
      c.strokeStyle = "#ae8c5c66";
      c.lineWidth = 0.6;
      c.strokeRect(-20, y, 40, 4);
    }
  }

  drawExit(game) {
    const c = this.ctx,
      p = this.screen(game.map.exit.x, game.map.exit.y);
    if (
      p.x < -200 ||
      p.x > this.width + 200 ||
      p.y < -200 ||
      p.y > this.height + 200
    )
      return;
    c.save();
    c.translate(p.x, p.y);
    ellipse(c, 0, 4, 74, 36, "#080f1680");
    for (let i = 4; i >= 0; i--) {
      polygon(
        c,
        [
          [-48 + i * 7, -14 - i * 7],
          [i * 7, 10 - i * 7],
          [43 + i * 7, -12 - i * 7],
          [-5 + i * 7, -36 - i * 7],
        ],
        `rgb(${56 + i * 7},${62 + i * 7},${57 + i * 6})`,
        "#232f2b",
      );
      line(
        c,
        [
          [-48 + i * 7, -14 - i * 7],
          [i * 7, 10 - i * 7],
          [43 + i * 7, -12 - i * 7],
        ],
        "#aaa78b66",
        1.5,
      );
    }
    if (game.exitUnlocked) {
      c.save();
      c.translate(6, -20);
      c.scale(1, 0.55);
      const glow = c.createRadialGradient(0, 0, 8, 0, 0, 90);
      glow.addColorStop(0, "#f3d69c62");
      glow.addColorStop(0.35, "#cea75521");
      glow.addColorStop(1, "#ab9c6600");
      c.fillStyle = glow;
      c.fillRect(-100, -100, 200, 200);
      c.strokeStyle = "#e9c67a88";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 54, 0, TAU);
      c.stroke();
      c.restore();
      for (let i = 0; i < 12; i++) {
        const phase = (game.time * 0.3 + i / 12) % 1;
        c.globalAlpha = Math.sin(phase * Math.PI) * 0.8;
        ellipse(c, Math.sin(i * 3) * 32, -15 - phase * 100, 1.1, 2, "#e3c188");
      }
      c.globalAlpha = 1;
    }
    const distance = Math.hypot(
      game.player.x - game.map.exit.x,
      game.player.y - game.map.exit.y,
    );
    if (distance < 3.5) {
      c.font = "10px Georgia, serif";
      c.textAlign = "center";
      c.fillStyle = game.exitUnlocked ? "#dbc48f" : "#9eaaa1";
      c.shadowColor = "#000";
      c.shadowBlur = 4;
      c.fillText(
        game.exitUnlocked ? "E  ·  DESCEND" : "THE WAY IS SEALED",
        0,
        44,
      );
    }
    c.restore();
  }

  drawLoot(item, labels, game) {
    const c = this.ctx,
      p = this.screen(item.x, item.y),
      colors = {
        common: "#c4c5ad",
        magic: "#87b9c7",
        rare: "#d5b15e",
        legendary: "#db9250",
      };
    if (
      p.x < -50 ||
      p.x > this.width + 50 ||
      p.y < -80 ||
      p.y > this.height + 50
    )
      return;
    c.save();
    c.translate(p.x, p.y);
    const color = colors[item.rarity] || colors.common;
    if (labels) {
      if (item.type === "gold") {
        c.restore();
        return;
      }
      const distance = Math.hypot(
        item.x - game.player.x,
        item.y - game.player.y,
      );
      if (distance < 3.7) {
        const text = item.type === "potion" ? "HEALTH POTION" : item.name;
        c.font = "11px Georgia, serif";
        c.textAlign = "center";
        const width = c.measureText(text).width + 16;
        c.fillStyle = "#101719db";
        c.fillRect(-width / 2, -31, width, 20);
        c.strokeStyle = color + "50";
        c.lineWidth = 0.5;
        c.strokeRect(-width / 2, -31, width, 20);
        c.fillStyle = color;
        c.fillText(text, 0, -17);
      }
      c.restore();
      return;
    }
    ellipse(c, 0, 2, 12, 5, "#0e1717a0");
    if (item.type === "gold") {
      for (let i = 0; i < 6; i++)
        ellipse(
          c,
          noise(i, item.x) * 17 - 8,
          noise(i, item.y) * 8 - 4,
          3,
          1.7,
          i % 2 ? "#bb934d" : "#dbc47c",
          "#705a30",
        );
    } else {
      c.save();
      c.globalAlpha = 0.22 + Math.sin(game.time * 2 + item.x) * 0.08;
      const glow = c.createRadialGradient(0, 0, 0, 0, 0, 31);
      glow.addColorStop(0, color);
      glow.addColorStop(1, "#00000000");
      c.fillStyle = glow;
      c.fillRect(-32, -32, 64, 64);
      c.restore();
      if (item.type === "potion") {
        ellipse(c, 0, -3, 5, 6, "#992e39", "#bb806c");
        c.fillStyle = "#bf9970";
        c.fillRect(-2.5, -12, 5, 4);
        line(
          c,
          [
            [-2, -5],
            [-2, -2],
          ],
          "#e5b1a6",
          1.5,
        );
      } else if (item.type === "weapon") {
        line(
          c,
          [
            [-8, 5],
            [10, -9],
          ],
          "#b6c4c0",
          3,
        );
        line(
          c,
          [
            [-9, -1],
            [-2, 7],
          ],
          "#c1a374",
          2,
        );
        line(
          c,
          [
            [-12, 8],
            [-6, 3],
          ],
          "#6d4a2b",
          3,
        );
      } else if (item.type === "armor") {
        polygon(
          c,
          [
            [-7, -8],
            [-2, -6],
            [3, -7],
            [7, -9],
            [11, -4],
            [7, -1],
            [6, 7],
            [-6, 7],
            [-7, -1],
            [-11, -4],
          ],
          "#7b8d88",
          "#b1b59a",
        );
      } else {
        polygon(
          c,
          [
            [0, -9],
            [7, -2],
            [0, 7],
            [-7, -2],
          ],
          color,
          "#ebe2b5",
        );
        ellipse(c, 0, -2, 2.5, 3, "#e9dfb4");
      }
      if (item.rarity !== "common") {
        c.globalAlpha = 0.3;
        const beam = c.createLinearGradient(0, -68, 0, 1);
        beam.addColorStop(0, "#00000000");
        beam.addColorStop(1, color);
        polygon(
          c,
          [
            [-4, 0],
            [-1, -68],
            [1, -68],
            [4, 0],
          ],
          beam,
        );
      }
    }
    c.restore();
  }

  drawEffect(e, game) {
    const c = this.ctx,
      p = this.screen(e.x, e.y);
    const life = clamp(e.life / (e.maxLife || 1), 0, 1),
      progress = 1 - life;
    c.save();
    c.translate(p.x, p.y - 19);
    if (e.type === "slash" || e.type === "cleave") {
      const a = e.angle || 0;
      const angle = Math.atan2(
        Math.sin(a) + Math.cos(a),
        (Math.cos(a) - Math.sin(a)) * 2,
      );
      c.scale(1, 0.58);
      c.rotate(angle);
      const radius = e.type === "cleave" ? 88 : 55;
      c.globalAlpha = life;
      c.beginPath();
      c.arc(0, 0, radius, -1.3 + progress * 0.4, 1.15 + progress * 0.4);
      c.strokeStyle = e.color || (e.type === "cleave" ? "#f0c276" : "#e4e0c0");
      c.lineWidth = 2 + life * 7;
      c.stroke();
      c.beginPath();
      c.arc(0, 0, radius - 12, -0.9 + progress * 0.4, 0.9 + progress * 0.4);
      c.strokeStyle = "#c99f6060";
      c.lineWidth = 13;
      c.stroke();
    } else if (e.type === "fireball") {
      const hostile = e.source === "enemy";
      const glow = c.createRadialGradient(0, 0, 1, 0, 0, 44);
      glow.addColorStop(0, hostile ? "#acdcd9c0" : "#ffe09ec0");
      glow.addColorStop(0.2, hostile ? "#659dada0" : "#f09a47a0");
      glow.addColorStop(1, "#e0662800");
      c.fillStyle = glow;
      c.fillRect(-45, -45, 90, 90);
      const a = Math.atan2(
        (e.vx || 0) + (e.vy || 0),
        ((e.vx || 0) - (e.vy || 0)) * 2,
      );
      c.rotate(a);
      polygon(
        c,
        [
          [8, 0],
          [-7, -6],
          [-37, -2],
          [-20, 3],
          [-5, 8],
        ],
        hostile ? "#83b9bc80" : "#e3893b80",
      );
      ellipse(c, 0, 0, 9, 7, hostile ? "#a6cfd0" : "#ffdd8e");
      ellipse(c, 3, 0, 5, 4, hostile ? "#e8efdd" : "#fff1c4");
    } else if (
      e.type === "explosion" ||
      e.type === "hit" ||
      e.type === "death"
    ) {
      const radius = (e.radius || (e.type === "explosion" ? 1.2 : 0.3)) * 45;
      if (e.type === "explosion") {
        const glow = c.createRadialGradient(
          0,
          0,
          1,
          0,
          0,
          radius * (progress + 0.8),
        );
        glow.addColorStop(0, `rgba(255,202,124,${life * 0.5})`);
        glow.addColorStop(0.5, `rgba(215,109,39,${life * 0.3})`);
        glow.addColorStop(1, "#e8813300");
        c.fillStyle = glow;
        c.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 4);
      }
      for (let i = 0; i < (e.type === "explosion" ? 18 : 9); i++) {
        const a = noise(i, e.x, e.y) * TAU,
          distance = (progress + 0.1) * radius * (1 + noise(i, e.y));
        c.globalAlpha = life;
        ellipse(
          c,
          Math.cos(a) * distance,
          Math.sin(a) * distance * 0.5 - progress * 10,
          life * 2.5 + 0.3,
          life * 1.5 + 0.2,
          e.color || (e.type === "death" ? "#a87867" : "#e6b371"),
        );
      }
    } else if (e.type === "heal" || e.type === "levelup") {
      c.globalAlpha = life;
      c.save();
      c.translate(0, 19);
      c.scale(1, 0.5);
      c.beginPath();
      c.arc(0, 0, 25 + progress * 55, 0, TAU);
      c.strokeStyle = e.type === "heal" ? "#a5c7a0" : "#edce8e";
      c.lineWidth = 2 * life;
      c.stroke();
      c.restore();
      for (let i = 0; i < 12; i++) {
        const x = Math.sin(i * 2.4) * 30;
        ellipse(
          c,
          x,
          10 - progress * (50 + noise(i) * 55),
          1,
          2.5,
          e.type === "heal" ? "#b6d8a8" : "#f3d492",
        );
      }
    } else if (e.type === "dash") {
      c.globalAlpha = life * 0.28;
      ellipse(c, 0, 0, 15, 21, "#ddd5b7");
      ellipse(c, 0, 19, 24 + progress * 22, 10, "#c0b08e");
    }
    c.restore();
  }

  drawFloatingTexts(game) {
    const c = this.ctx;
    for (const f of game.floatingTexts) {
      const p = this.screen(f.x, f.y),
        life = clamp(f.life / (f.maxLife || 1), 0, 1);
      c.save();
      c.globalAlpha = Math.min(1, life * 3);
      c.font = `${/^\d/.test(String(f.text)) ? "bold 17px" : "13px"} Georgia, serif`;
      c.textAlign = "center";
      c.shadowColor = "#070a0d";
      c.shadowBlur = 5;
      c.shadowOffsetY = 2;
      c.fillStyle = f.color || "#e0c99d";
      c.fillText(f.text, p.x, p.y - 72 - (1 - life) * 36);
      c.restore();
    }
  }

  drawAtmosphere(game) {
    const c = this.ctx,
      w = this.width,
      h = this.height;
    c.save();
    // A little light trapped in the dust; this moves independently of the dungeon.
    for (let i = 0; i < 35; i++) {
      const x = (noise(i, 3) * w + game.time * (1 + noise(i) * 3)) % w;
      const y =
        (noise(i, 7) * h - ((game.time * (2 + noise(i, 5) * 3)) % h) + h) % h;
      c.globalAlpha = 0.06 + noise(i, 2) * 0.15;
      ellipse(c, x, y, noise(i, 4) > 0.8 ? 1 : 0.6, 0.7, "#e6d7ad");
    }
    c.globalAlpha = 1;
    const fog = c.createLinearGradient(0, 0, 0, h);
    fog.addColorStop(0, "#8298940a");
    fog.addColorStop(0.5, "#576e7100");
    fog.addColorStop(1, "#76928f0b");
    c.fillStyle = fog;
    c.fillRect(0, 0, w, h);
    c.restore();
  }

  drawVignette(game) {
    const c = this.ctx,
      w = this.width,
      h = this.height;
    const vignette = c.createRadialGradient(
      w * 0.5,
      h * 0.46,
      Math.min(w, h) * 0.19,
      w * 0.5,
      h * 0.46,
      Math.max(w * 0.68, h * 0.7),
    );
    vignette.addColorStop(0, "#080d1000");
    vignette.addColorStop(0.62, "#060d100d");
    vignette.addColorStop(1, "#070d1190");
    c.fillStyle = vignette;
    c.fillRect(0, 0, w, h);
    if (game.player.hp / game.player.maxHp < 0.3) {
      const danger = c.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.4,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.7,
      );
      danger.addColorStop(0, "#600b0a00");
      danger.addColorStop(
        1,
        `rgba(113,20,21,${0.25 + Math.sin(game.time * 3) * 0.1})`,
      );
      c.fillStyle = danger;
      c.fillRect(0, 0, w, h);
    }
  }

  destroy() {
    this.textures.length = 0;
  }
}

export function drawMinimap(canvas, game, expanded = false) {
  if (!canvas || !game) return;
  const rect = canvas.getBoundingClientRect(),
    dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = rect.width || (expanded ? 480 : 180),
    h = rect.height || (expanded ? 400 : 150);
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const c = canvas.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const { map } = game;
  const scale = Math.min(
    (w - 20) / (map.width + map.height),
    (h - 18) / ((map.width + map.height) * 0.5),
  );
  const originX = w / 2 + (map.height - map.width) * scale * 0.5,
    originY = (h - (map.width + map.height) * scale * 0.5) / 2;
  const project = (x, y) => ({
    x: originX + (x - y) * scale,
    y: originY + (x + y) * scale * 0.5,
  });
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!map.tiles[y][x]) continue;
      const p = project(x + 0.5, y + 0.5);
      polygon(
        c,
        [
          [p.x, p.y - scale * 0.5],
          [p.x + scale, p.y],
          [p.x, p.y + scale * 0.5],
          [p.x - scale, p.y],
        ],
        "#797d674a",
      );
      const edge =
        !map.tiles[y - 1]?.[x] ||
        !map.tiles[y + 1]?.[x] ||
        !map.tiles[y]?.[x - 1] ||
        !map.tiles[y]?.[x + 1];
      if (edge) {
        c.strokeStyle = "#a3a18555";
        c.lineWidth = 0.6;
        c.stroke();
      }
    }
  for (const e of game.enemies) {
    if (e.dead) continue;
    const p = project(e.x, e.y);
    ellipse(
      c,
      p.x,
      p.y,
      e.type === "boss" ? 3 : 1.3,
      e.type === "boss" ? 3 : 1.3,
      "#bf705c",
    );
  }
  const exit = project(map.exit.x, map.exit.y);
  c.strokeStyle = game.exitUnlocked ? "#d9c282" : "#828c7c";
  c.lineWidth = 1.2;
  c.strokeRect(exit.x - 3, exit.y - 3, 6, 6);
  const p = project(game.player.x, game.player.y);
  ellipse(c, p.x, p.y, 5, 5, "#dfc89b22");
  polygon(
    c,
    [
      [p.x, p.y - 4],
      [p.x + 3, p.y + 2],
      [p.x, p.y + 1],
      [p.x - 3, p.y + 2],
    ],
    "#f1d79e",
  );
}
