/** The complete, deterministic Ashveil simulation. Coordinates are in floor tiles. */
const PLAYER_RADIUS = 0.24;
const SLOT_TYPES = new Set(["weapon", "armor", "relic"]);
const SKILLS = {
  cleave: { mana: 20, cooldown: 4 },
  fireball: { mana: 25, cooldown: 3 },
  dash: { mana: 0, cooldown: 2.5 },
};

function random(game) {
  game.rngState = (Math.imul(game.rngState, 1664525) + 1013904223) >>> 0;
  return game.rngState / 4294967296;
}

function nextId(game) {
  return ++game.sequence;
}
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function message(game, text, kind = "info") {
  game.messages.push({ id: nextId(game), text, kind });
  game.messages = game.messages.slice(-5);
}
function floating(game, point, text, color = "#e8d8b5") {
  game.floatingTexts.push({
    x: point.x,
    y: point.y,
    text: String(text),
    color,
    life: 1,
    maxLife: 1,
  });
}
function effect(game, type, point, life, extra = {}) {
  const entry = { type, x: point.x, y: point.y, life, maxLife: life, ...extra };
  game.effects.push(entry);
  return entry;
}

function floorAt(map, x, y) {
  return map.tiles[Math.floor(y)]?.[Math.floor(x)] === 1;
}
function fits(map, x, y, radius = PLAYER_RADIUS) {
  return (
    floorAt(map, x - radius, y - radius) &&
    floorAt(map, x + radius, y - radius) &&
    floorAt(map, x - radius, y + radius) &&
    floorAt(map, x + radius, y + radius)
  );
}
function clearLine(map, a, b, radius = 0.08) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 0.2));
  for (let index = 1; index <= steps; index++) {
    const t = index / steps;
    if (!fits(map, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, radius))
      return false;
  }
  return true;
}
function move(game, entity, dx, dy, radius = PLAYER_RADIUS) {
  // Substeps also keep an instantaneous dodge from tunneling through masonry.
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.12));
  for (let i = 0; i < count; i++) {
    if (fits(game.map, entity.x + dx / count, entity.y, radius))
      entity.x += dx / count;
    if (fits(game.map, entity.x, entity.y + dy / count, radius))
      entity.y += dy / count;
  }
}

function nearestFloor(map, target) {
  const tx = Math.floor(target.x),
    ty = Math.floor(target.y);
  if (floorAt(map, target.x, target.y)) return { x: tx, y: ty };
  for (let radius = 1; radius <= 4; radius++) {
    let nearest = null,
      best = Infinity;
    for (let y = ty - radius; y <= ty + radius; y++) {
      for (let x = tx - radius; x <= tx + radius; x++) {
        if (map.tiles[y]?.[x] !== 1) continue;
        const score = Math.hypot(x + 0.5 - target.x, y + 0.5 - target.y);
        if (score < best) {
          best = score;
          nearest = { x, y };
        }
      }
    }
    if (nearest) return nearest;
  }
  return null;
}

function pathTo(map, from, target) {
  const goal = nearestFloor(map, target);
  if (!goal) return [];
  const startX = Math.floor(from.x),
    startY = Math.floor(from.y);
  const key = (x, y) => y * map.width + x;
  const start = key(startX, startY),
    finish = key(goal.x, goal.y);
  if (start === finish) return [];
  const parents = new Map([[start, null]]),
    queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head],
      x = current % map.width,
      y = Math.floor(current / map.width);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        candidate = key(nx, ny);
      if (map.tiles[ny]?.[nx] !== 1 || parents.has(candidate)) continue;
      parents.set(candidate, current);
      if (candidate === finish) {
        const result = [];
        for (let node = finish; node !== start; node = parents.get(node)) {
          result.unshift({
            x: (node % map.width) + 0.5,
            y: Math.floor(node / map.width) + 0.5,
          });
        }
        return result;
      }
      queue.push(candidate);
    }
  }
  return [];
}

function walkToward(game, entity, target, speed, dt) {
  let waypoint = target;
  if (!clearLine(game.map, entity, target, PLAYER_RADIUS)) {
    const destination = `${Math.floor(target.x)},${Math.floor(target.y)}`;
    if (
      entity.pathDestination !== destination ||
      entity.pathRefresh <= game.time ||
      !entity.path?.length
    ) {
      entity.path = pathTo(game.map, entity, target);
      entity.pathDestination = destination;
      entity.pathRefresh = game.time + 0.7;
    }
    while (entity.path?.length && distance(entity, entity.path[0]) < 0.14)
      entity.path.shift();
    waypoint = entity.path?.[0];
    if (!waypoint) return;
  } else {
    entity.path = [];
  }
  const dx = waypoint.x - entity.x,
    dy = waypoint.y - entity.y,
    length = Math.hypot(dx, dy);
  if (length < 0.07) return;
  const step = Math.min(length, speed * dt);
  entity.facing = Math.atan2(dy, dx);
  move(game, entity, (dx / length) * step, (dy / length) * step);
}

function makeMap(game) {
  const width = 28,
    height = 27;
  const tiles = Array.from({ length: height }, () => Array(width).fill(0));
  const rooms = [
    { x: 2, y: 2, w: 10, h: 10 },
    { x: 16, y: 3, w: 9, h: 9 },
    { x: 5, y: 16, w: 11, h: 8 },
    { x: 19, y: 16, w: 7, h: 8 },
  ];
  function carve(x, y, w, h) {
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) tiles[row][col] = 1;
    }
  }
  for (const room of rooms) carve(room.x, room.y, room.w, room.h);
  carve(11, 6, 6, 3);
  carve(7, 11, 3, 6);
  carve(15, 19, 5, 3);
  carve(21, 11, 3, 6);
  const decor = [];
  for (const room of rooms) {
    const corners = [
      [room.x + 0.5, room.y + 0.5],
      [room.x + room.w - 0.5, room.y + 0.5],
      [room.x + 0.5, room.y + room.h - 0.5],
      [room.x + room.w - 0.5, room.y + room.h - 0.5],
    ];
    corners.forEach(([x, y], i) =>
      decor.push({
        x,
        y,
        type: i % 2 ? "brazier" : "pillar",
        variant: game.floor,
      }),
    );
    for (let i = 0; i < 7; i++) {
      decor.push({
        x: room.x + 0.8 + random(game) * (room.w - 1.6),
        y: room.y + 0.8 + random(game) * (room.h - 1.6),
        type: ["rubble", "bones", "grave", "rubble"][i % 4],
        variant: Math.floor(random(game) * 4),
      });
    }
  }
  decor.push(
    { x: 3.5, y: 4.5, type: "brazier" },
    { x: 8.5, y: 3.5, type: "brazier" },
    { x: 3.1, y: 7.5, type: "banner" },
    { x: 11.4, y: 5.1, type: "banner" },
    { x: 12.5, y: 6.5, type: "brazier" },
    { x: 15.5, y: 8.5, type: "brazier" },
    { x: 7.5, y: 14.5, type: "brazier" },
    { x: 22.5, y: 14.5, type: "brazier" },
    { x: 19.5, y: 20.5, type: "brazier" },
    { x: 25.3, y: 20.5, type: "brazier" },
  );
  return {
    width,
    height,
    tiles,
    rooms,
    decor,
    spawn: { x: 5.5, y: 5.5 },
    exit: { x: 23.5, y: 21.5 },
  };
}

const ENEMY_STATS = {
  skeleton: {
    hp: 35,
    speed: 1.2,
    damage: 10,
    range: 1.22,
    windup: 0.6,
    cooldown: 1.65,
    xp: 22,
  },
  wraith: {
    hp: 29,
    speed: 1.05,
    damage: 12,
    range: 4.3,
    windup: 0.85,
    cooldown: 2.7,
    xp: 28,
  },
  brute: {
    hp: 87,
    speed: 0.8,
    damage: 20,
    range: 1.65,
    windup: 0.95,
    cooldown: 2.5,
    xp: 45,
  },
  boss: {
    hp: 950,
    speed: 0.78,
    damage: 31,
    range: 2.3,
    windup: 1.15,
    cooldown: 2.6,
    xp: 220,
  },
};

function makeEnemy(game, type, x, y) {
  const stats = ENEMY_STATS[type],
    scaling = type === "boss" ? 1 : 1 + (game.floor - 1) * 0.7;
  return {
    id: nextId(game),
    type,
    x,
    y,
    hp: Math.round(stats.hp * scaling),
    maxHp: Math.round(stats.hp * scaling),
    speed: stats.speed,
    damage: Math.round(stats.damage * (1 + (game.floor - 1) * 0.12)),
    attackTimer: 0,
    hitFlash: 0,
    facing: -Math.PI * 0.65,
    windup: 0,
    windupMax: stats.windup,
    attackRange: stats.range,
    attackCooldown: 0.5 + random(game),
    aggroUntil: 0,
    home: { x, y },
    pathRefresh: 0,
    path: [],
  };
}

function loadFloor(game) {
  game.map = makeMap(game);
  game.player.x = game.map.spawn.x;
  game.player.y = game.map.spawn.y;
  game.player.path = [];
  game.player.pathDestination = null;
  game.player.invulnerable = 0.8;
  game.enemies = [];
  const placements = [
    ["skeleton", 9.5, 6.5],
    ["skeleton", 9.5, 9.5],
    ["skeleton", 6.5, 10.5],
    ["skeleton", 17.5, 5.5],
    ["wraith", 22.5, 4.5],
    ["skeleton", 23.5, 8.5],
    ["brute", 19.5, 9.5],
    ["skeleton", 7.5, 18.5],
    ["skeleton", 12.5, 18.5],
    ["wraith", 8.5, 22.5],
    ["brute", 13.5, 22.5],
    ["skeleton", 21.5, 17.5],
    ["skeleton", 24.5, 18.5],
    ["wraith", 21.5, 22.5],
    ["skeleton", 13.5, 7.5],
    ["skeleton", 22.5, 13.5],
  ];
  if (game.floor >= 2)
    placements.push(
      ["wraith", 4.5, 9.5],
      ["skeleton", 19.5, 4.5],
      ["brute", 10.5, 20.5],
      ["skeleton", 8.5, 13.5],
      ["skeleton", 17.5, 20.5],
    );
  if (game.floor === 3) placements.push(["boss", 23.0, 20.0]);
  for (const [type, x, y] of placements)
    game.enemies.push(makeEnemy(game, type, x, y));
  game.floorKills = 0;
  game.floorTotal = game.enemies.length;
  game.exitUnlocked = false;
  game.effects = [];
  game.floatingTexts = [];
  game.loot = [];
  if (game.floor === 1) {
    game.loot.push({
      id: nextId(game),
      x: 4.5,
      y: 8.5,
      type: "relic",
      name: "Pilgrim’s Ember",
      rarity: "magic",
      value: 25,
      damage: 2,
      armor: 1,
    });
  } else {
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + 45);
    game.player.mana = game.player.maxMana;
    game.player.potions = Math.min(9, game.player.potions + 1);
    message(
      game,
      game.floor === 2
        ? "The Ember Catacombs. Something stirs beneath the stone."
        : "The Hollow Throne. Defeat the Hollow King.",
      "danger",
    );
  }
}

function refreshStats(game) {
  const p = game.player,
    equipment = Object.values(p.equipment).filter(Boolean);
  p.damage =
    12 +
    (p.level - 1) * 3 +
    equipment.reduce((sum, item) => sum + (item.damage || 0), 0);
  p.armor = 2 + equipment.reduce((sum, item) => sum + (item.armor || 0), 0);
  p.maxHp = 140 + (p.level - 1) * 14;
  p.maxMana = 100 + (p.level - 1) * 5;
}

export function createGame({ seed = 1 } = {}) {
  const numericSeed = Number.isFinite(seed) ? seed >>> 0 : 1;
  const game = {
    seed: numericSeed,
    rngState: numericSeed,
    sequence: 0,
    status: "playing",
    paused: false,
    time: 0,
    floor: 1,
    map: null,
    enemies: [],
    loot: [],
    effects: [],
    floatingTexts: [],
    messages: [],
    kills: 0,
    floorKills: 0,
    floorTotal: 0,
    bossDefeated: false,
    exitUnlocked: false,
    stats: { kills: 0, goldCollected: 0, damageDealt: 0 },
    player: {
      x: 0,
      y: 0,
      hp: 140,
      maxHp: 140,
      mana: 100,
      maxMana: 100,
      level: 1,
      xp: 0,
      xpNext: 90,
      gold: 0,
      potions: 4,
      damage: 18,
      armor: 5,
      speed: 3.1,
      facing: Math.PI / 4,
      attackTimer: 0,
      attackCooldown: 0,
      invulnerable: 0,
      lastHurt: -10,
      skills: { cleave: 0, fireball: 0, dash: 0 },
      equipment: {
        weapon: {
          id: "starter-weapon",
          type: "weapon",
          name: "Worn Longsword",
          rarity: "common",
          damage: 6,
          value: 10,
        },
        armor: {
          id: "starter-armor",
          type: "armor",
          name: "Wayfarer’s Leathers",
          rarity: "common",
          armor: 3,
          value: 8,
        },
        relic: null,
      },
      inventory: [],
    },
  };
  loadFloor(game);
  message(
    game,
    "Enter the ruins. Silence every restless soul to open the descent.",
  );
  return game;
}

export function restartGame(game) {
  const fresh = createGame({ seed: game.seed });
  for (const key of Object.keys(game)) delete game[key];
  Object.assign(game, fresh);
  return game;
}

function gainXp(game, amount) {
  const p = game.player;
  p.xp += amount;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = Math.round(p.xpNext * 1.6);
    refreshStats(game);
    p.hp = Math.min(p.maxHp, p.hp + 48);
    p.mana = p.maxMana;
    effect(game, "levelup", p, 1.5, { radius: 3, color: "#efcc79" });
    floating(game, p, `LEVEL ${p.level}`, "#f4cf76");
    message(
      game,
      `Level ${p.level}. Strength grows; health and spirit restored.`,
      "success",
    );
  }
}

function dropLoot(game, enemy) {
  const boss = enemy.type === "boss";
  game.loot.push({
    id: nextId(game),
    x: enemy.x + 0.15,
    y: enemy.y + 0.12,
    type: "gold",
    name: "Gold",
    rarity: "common",
    value: boss ? 150 : Math.round(5 + random(game) * 11 + game.floor * 2),
  });
  if (random(game) < 0.21 || boss) {
    game.loot.push({
      id: nextId(game),
      x: enemy.x - 0.3,
      y: enemy.y + 0.22,
      type: "potion",
      name: "Crimson Flask",
      rarity: "common",
      value: 1,
    });
  }
  if (random(game) < 0.31 || boss || game.floorKills === 2) {
    const roll = random(game),
      rarity = boss
        ? "legendary"
        : roll > 0.78
          ? "rare"
          : roll > 0.25
            ? "magic"
            : "common";
    const tier = { common: 0, magic: 2, rare: 5, legendary: 10 }[rarity];
    const type = boss
      ? "weapon"
      : ["weapon", "armor", "relic"][Math.floor(random(game) * 3)];
    const names = {
      weapon: [
        "Cryptsteel Blade",
        "Emberfang",
        "Mourning Edge",
        "Oath of the Ashen",
      ],
      armor: [
        "Gravewarden Mail",
        "Duskweave Mantle",
        "Ashbound Cuirass",
        "Veil of the First",
      ],
      relic: [
        "Ember Sigil",
        "Hollow Star",
        "Saint’s Last Breath",
        "Heart of the Veil",
      ],
    };
    const rarityIndex = ["common", "magic", "rare", "legendary"].indexOf(
      rarity,
    );
    const item = {
      id: nextId(game),
      x: enemy.x + 0.36,
      y: enemy.y - 0.22,
      type,
      name: names[type][rarityIndex],
      rarity,
      value: (tier + game.floor) * 12,
    };
    if (type === "weapon") item.damage = 6 + game.floor * 2 + tier;
    if (type === "armor") item.armor = 3 + game.floor + tier;
    if (type === "relic") {
      item.damage = game.floor + tier;
      item.armor = Math.max(1, Math.ceil(tier / 2));
    }
    game.loot.push(item);
  }
}

function hurtEnemy(game, enemy, damage) {
  if (enemy.dead || enemy.hp <= 0) return;
  const rounded = Math.max(1, Math.round(damage));
  game.stats.damageDealt += Math.min(enemy.hp, rounded);
  enemy.hp = Math.max(0, enemy.hp - rounded);
  enemy.hitFlash = 0.2;
  enemy.aggroUntil = game.time + 12;
  floating(game, enemy, rounded, "#f4e5c7");
  effect(game, "hit", enemy, 0.22, { color: "#d76548", radius: 0.55 });
  if (enemy.hp > 0) return;
  enemy.dead = true;
  enemy.windup = 0;
  game.kills++;
  game.stats.kills++;
  game.floorKills++;
  if (enemy.type === "boss") {
    game.bossDefeated = true;
    message(game, "The Hollow King falls. The veil begins to lift.", "success");
  }
  effect(game, "death", enemy, 0.9, {
    radius: enemy.type === "boss" ? 2.2 : 0.9,
    color: "#7f665b",
  });
  gainXp(game, ENEMY_STATS[enemy.type].xp);
  dropLoot(game, enemy);
  if (game.floorKills >= game.floorTotal) {
    game.exitUnlocked = true;
    message(
      game,
      game.floor === 3
        ? "The sanctuary is open. Return to the light."
        : "The descent is open. Find the golden seal.",
      "success",
    );
    effect(game, "levelup", game.map.exit, 2, { radius: 3, color: "#f4ce76" });
  }
}

function hurtPlayer(game, damage) {
  const p = game.player;
  if (p.invulnerable > 0 || game.status !== "playing") return;
  const actual = Math.max(1, Math.round(damage - p.armor * 0.55));
  p.hp = Math.max(0, p.hp - actual);
  p.lastHurt = game.time;
  p.invulnerable = 0.4;
  floating(game, p, `−${actual}`, "#ff8874");
  effect(game, "hit", p, 0.28, { color: "#ed634c", radius: 0.65 });
  if (p.hp === 0) {
    game.status = "dead";
    effect(game, "death", p, 1.2, { radius: 2, color: "#9d382e" });
    message(game, "Your ember fades. The ruins remember.", "danger");
  }
}

function attack(game, aim) {
  const p = game.player;
  if (p.attackCooldown > 0) return false;
  let target = null,
    closest = 1.65;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const length = distance(p, enemy);
    if (length <= closest && clearLine(game.map, p, enemy)) {
      closest = length;
      target = enemy;
    }
  }
  if (!target) return false;
  const toward = target || aim;
  p.facing = Math.atan2(toward.y - p.y, toward.x - p.x);
  p.attackTimer = 0.27;
  p.attackCooldown = 0.47;
  effect(game, "slash", p, 0.23, {
    angle: p.facing,
    radius: 1.7,
    color: "#eee0bd",
  });
  hurtEnemy(game, target, p.damage);
  return true;
}

export function useSkill(game, skill, target) {
  if (game.paused || game.status !== "playing" || !Object.hasOwn(SKILLS, skill))
    return false;
  const p = game.player,
    data = SKILLS[skill];
  if (p.skills[skill] > 0 || p.mana < data.mana) return false;
  p.mana -= data.mana;
  p.skills[skill] = data.cooldown;
  const validTarget =
    target && Number.isFinite(target.x) && Number.isFinite(target.y);
  const angle =
    validTarget && distance(p, target) > 0.05
      ? Math.atan2(target.y - p.y, target.x - p.x)
      : p.facing;
  p.facing = angle;
  if (skill === "cleave") {
    p.attackTimer = 0.42;
    effect(game, "cleave", p, 0.48, { angle, radius: 2.8, color: "#efbc70" });
    for (const enemy of game.enemies) {
      if (
        !enemy.dead &&
        distance(p, enemy) <= 2.8 &&
        clearLine(game.map, p, enemy)
      )
        hurtEnemy(game, enemy, p.damage * 1.85);
    }
  } else if (skill === "fireball") {
    p.attackTimer = 0.3;
    effect(
      game,
      "fireball",
      { x: p.x + Math.cos(angle) * 0.45, y: p.y + Math.sin(angle) * 0.45 },
      1.5,
      {
        angle,
        vx: Math.cos(angle) * 9,
        vy: Math.sin(angle) * 9,
        radius: 0.35,
        source: "player",
        damage: p.damage * 2.4,
        color: "#ffaf4e",
      },
    );
  } else {
    const origin = { x: p.x, y: p.y };
    p.invulnerable = Math.max(p.invulnerable, 0.65);
    move(game, p, Math.cos(angle) * 3.3, Math.sin(angle) * 3.3);
    effect(game, "dash", origin, 0.42, {
      angle,
      radius: distance(origin, p),
      color: "#94b8ba",
    });
    effect(game, "dash", p, 0.32, { angle, radius: 0.6, color: "#c1d2cc" });
    p.path = [];
  }
  return true;
}

export function drinkPotion(game) {
  const p = game.player;
  if (
    game.paused ||
    game.status !== "playing" ||
    p.potions <= 0 ||
    p.hp >= p.maxHp
  )
    return false;
  const restored = Math.min(p.maxHp - p.hp, 75 + (p.level - 1) * 10);
  p.potions--;
  p.hp += restored;
  effect(game, "heal", p, 0.8, { radius: 1.3, color: "#a6c596" });
  floating(game, p, `+${Math.round(restored)}`, "#b6dba5");
  return true;
}

export function equipItem(game, itemId) {
  if (game.status !== "playing") return false;
  const p = game.player,
    index = p.inventory.findIndex((item) => item.id === itemId);
  if (index < 0) return false;
  const item = p.inventory[index];
  if (!SLOT_TYPES.has(item.type)) return false;
  p.inventory.splice(index, 1);
  const previous = p.equipment[item.type];
  p.equipment[item.type] = item;
  if (previous) p.inventory.push(previous);
  refreshStats(game);
  message(game, `Equipped ${item.name}.`, "loot");
  return true;
}

function collectLoot(game, radius = 1.1) {
  const p = game.player;
  let collected = false;
  for (const item of game.loot) {
    if (
      item.collected ||
      distance(p, item) > radius ||
      !clearLine(game.map, p, item)
    )
      continue;
    if (item.type === "potion" && p.potions >= 9) continue;
    item.collected = true;
    collected = true;
    if (item.type === "gold") {
      p.gold += item.value;
      game.stats.goldCollected += item.value;
      floating(game, item, `+${item.value} gold`, "#e4bd6e");
    } else if (item.type === "potion") {
      p.potions = Math.min(9, p.potions + item.value);
      floating(game, item, "+1 flask", "#e0927f");
    } else {
      p.inventory.push(item);
      message(
        game,
        `${item.name} acquired. Open your inventory to equip.`,
        "loot",
      );
      floating(
        game,
        item,
        item.name,
        item.rarity === "rare"
          ? "#e5c576"
          : item.rarity === "legendary"
            ? "#f29d55"
            : "#90c4cd",
      );
    }
  }
  game.loot = game.loot.filter((item) => !item.collected);
  return collected;
}

export function interact(game) {
  if (game.paused || game.status !== "playing") return false;
  const collected = collectLoot(game, 2);
  if (distance(game.player, game.map.exit) > 2.3) return collected;
  if (!game.exitUnlocked) {
    message(
      game,
      `${game.floorTotal - game.floorKills} restless souls still bind the seal.`,
      "info",
    );
    return false;
  }
  if (game.floor === 3) {
    game.status = "victory";
    message(
      game,
      "Dawn returns to Ashveil. Your oath is fulfilled.",
      "success",
    );
    return true;
  }
  game.floor++;
  loadFloor(game);
  return true;
}

function advanceEnemy(game, enemy, dt) {
  if (enemy.dead) return;
  enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
  enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
  const p = game.player,
    length = distance(enemy, p),
    stats = ENEMY_STATS[enemy.type];
  if (enemy.windup > 0) {
    enemy.windup = Math.max(0, enemy.windup - dt);
    if (enemy.windup === 0) {
      enemy.attackTimer = 0.28;
      enemy.attackCooldown = stats.cooldown;
      if (enemy.type === "wraith") {
        effect(game, "fireball", enemy, 2, {
          source: "enemy",
          damage: enemy.damage,
          radius: 0.28,
          vx: Math.cos(enemy.facing) * 4.4,
          vy: Math.sin(enemy.facing) * 4.4,
          angle: enemy.facing,
          color: "#8eb8ad",
        });
      } else {
        effect(
          game,
          enemy.type === "boss" || enemy.type === "brute" ? "cleave" : "slash",
          enemy,
          0.3,
          { angle: enemy.facing, radius: enemy.attackRange, color: "#c6614e" },
        );
        if (length <= enemy.attackRange + 0.18 && clearLine(game.map, enemy, p))
          hurtPlayer(game, enemy.damage);
      }
    }
    return;
  }
  const visible =
    length < (enemy.type === "boss" ? 7 : 5.8) && clearLine(game.map, enemy, p);
  if (visible) enemy.aggroUntil = game.time + 7;
  if (enemy.aggroUntil < game.time) return;
  enemy.facing = Math.atan2(p.y - enemy.y, p.x - enemy.x);
  if (length <= enemy.attackRange && clearLine(game.map, enemy, p)) {
    if (enemy.attackCooldown <= 0) {
      enemy.windup = stats.windup;
      enemy.windupMax = stats.windup;
      enemy.attackTimer = stats.windup;
    }
  } else {
    walkToward(game, enemy, p, enemy.speed, dt);
  }
}

function explode(game, projectile) {
  projectile.life = 0;
  const radius = projectile.source === "player" ? 1.8 : 0.6;
  effect(game, "explosion", projectile, 0.55, {
    radius,
    color: projectile.color,
  });
  if (projectile.source === "player") {
    for (const enemy of game.enemies) {
      if (
        !enemy.dead &&
        distance(projectile, enemy) <= radius &&
        clearLine(game.map, projectile, enemy)
      )
        hurtEnemy(game, enemy, projectile.damage);
    }
  } else if (distance(projectile, game.player) <= 0.8) {
    hurtPlayer(game, projectile.damage);
  }
}

function advanceEffects(game, dt) {
  // A snapshot prevents newly spawned explosions from being advanced twice.
  for (const entry of [...game.effects]) {
    if (game.status !== "playing") break;
    entry.life -= dt;
    if (entry.type !== "fireball" || entry.life <= 0) continue;
    const dx = entry.vx * dt,
      dy = entry.vy * dt;
    const count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.15));
    for (let step = 0; step < count && entry.life > 0; step++) {
      const nx = entry.x + dx / count,
        ny = entry.y + dy / count;
      if (!floorAt(game.map, nx, ny)) {
        explode(game, entry);
        break;
      }
      entry.x = nx;
      entry.y = ny;
      const hit =
        entry.source === "player"
          ? game.enemies.some(
              (enemy) => !enemy.dead && distance(entry, enemy) < 0.5,
            )
          : distance(entry, game.player) < 0.45;
      if (hit) explode(game, entry);
    }
  }
  game.effects = game.effects.filter((entry) => entry.life > 0);
  for (const entry of game.floatingTexts) entry.life -= dt;
  game.floatingTexts = game.floatingTexts.filter((entry) => entry.life > 0);
}

function advance(game, dt, input) {
  game.time += dt;
  const p = game.player;
  p.attackTimer = Math.max(0, p.attackTimer - dt);
  p.attackCooldown = Math.max(0, p.attackCooldown - dt);
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  for (const skill of Object.keys(p.skills))
    p.skills[skill] = Math.max(0, p.skills[skill] - dt);
  p.mana = Math.min(p.maxMana, p.mana + dt * 6);
  if (game.time - p.lastHurt > 5) p.hp = Math.min(p.maxHp, p.hp + dt * 1.2);
  const mx = Number.isFinite(input.moveX) ? input.moveX : 0;
  const my = Number.isFinite(input.moveY) ? input.moveY : 0;
  const magnitude = Math.hypot(mx, my);
  if (magnitude > 0) {
    p.facing = Math.atan2(my, mx);
    move(
      game,
      p,
      (mx / Math.max(1, magnitude)) * p.speed * dt,
      (my / Math.max(1, magnitude)) * p.speed * dt,
    );
    p.path = [];
  } else if (
    input.target &&
    Number.isFinite(input.target.x) &&
    Number.isFinite(input.target.y)
  ) {
    // Stop at sword reach when chasing an enemy; attacking never pushes through it.
    const closeEnemy =
      input.attack &&
      game.enemies.some(
        (enemy) =>
          !enemy.dead &&
          distance(enemy, input.target) < 0.7 &&
          distance(p, enemy) < 1.22 &&
          clearLine(game.map, p, enemy),
      );
    if (!closeEnemy) walkToward(game, p, input.target, p.speed, dt);
  }
  if (
    input.aim &&
    Number.isFinite(input.aim.x) &&
    Number.isFinite(input.aim.y)
  ) {
    p.facing = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
  }
  if (input.attack) attack(game, input.aim);
  for (const enemy of game.enemies) {
    advanceEnemy(game, enemy, dt);
    if (game.status !== "playing") break;
  }
  if (game.status !== "playing") return;
  advanceEffects(game, dt);
  game.enemies = game.enemies.filter((enemy) => !enemy.dead);
  if (game.status === "playing") collectLoot(game);
}

export function updateGame(game, dt, input = {}) {
  if (
    game.paused ||
    game.status !== "playing" ||
    !Number.isFinite(dt) ||
    dt <= 0
  )
    return;
  // Limit time after a suspended tab, and integrate small steps for reliable collisions.
  let remaining = Math.min(dt, 0.25);
  while (remaining > 0.000001 && game.status === "playing") {
    const step = Math.min(remaining, 1 / 30);
    advance(game, step, input);
    remaining -= step;
  }
}
