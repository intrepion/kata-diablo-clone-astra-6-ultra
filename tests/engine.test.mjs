import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  updateGame,
  useSkill,
  drinkPotion,
  equipItem,
  interact,
  restartGame,
} from "../src/engine.js";

function advance(game, seconds, input = {}) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60)
    updateGame(game, 1 / 60, input);
}
function isolate(game, type = "skeleton") {
  const enemy = game.enemies.find((entry) => entry.type === type);
  game.enemies = [enemy];
  game.floorTotal = 1;
  enemy.x = game.player.x + 1;
  enemy.y = game.player.y;
  return enemy;
}
function clearFloor(game) {
  for (const enemy of game.enemies) {
    enemy.hp = 1;
    enemy.x = game.player.x + 1;
    enemy.y = game.player.y;
  }
  game.player.skills.cleave = 0;
  game.player.mana = game.player.maxMana;
  assert.equal(useSkill(game, "cleave"), true);
  updateGame(game, 1 / 60);
}

test("a seed reproduces the entire initial world, and different seeds change its details", () => {
  assert.deepEqual(createGame({ seed: 77 }), createGame({ seed: 77 }));
  assert.notDeepEqual(
    createGame({ seed: 77 }).map.decor,
    createGame({ seed: 78 }).map.decor,
  );
  assert.equal(createGame().player.damage, 18);
});

test("every floor tile and enemy is connected to the spawn, with a reachable exit", () => {
  const game = createGame();
  for (let floor = 1; floor <= 3; floor++) {
    const { map } = game;
    const queue = [[Math.floor(map.spawn.x), Math.floor(map.spawn.y)]];
    const visited = new Set([queue[0].join(",")]);
    for (let head = 0; head < queue.length; head++) {
      const [x, y] = queue[head];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const key = `${x + dx},${y + dy}`;
        if (map.tiles[y + dy]?.[x + dx] !== 1 || visited.has(key)) continue;
        visited.add(key);
        queue.push([x + dx, y + dy]);
      }
    }
    assert.equal(visited.size, map.tiles.flat().filter(Boolean).length);
    assert.ok(
      visited.has(`${Math.floor(map.exit.x)},${Math.floor(map.exit.y)}`),
    );
    for (const enemy of game.enemies)
      assert.ok(visited.has(`${Math.floor(enemy.x)},${Math.floor(enemy.y)}`));
    if (floor < 3) {
      clearFloor(game);
      Object.assign(game.player, game.map.exit);
      interact(game);
    }
  }
});

test("pause freezes simulation and prevents active abilities or drinking", () => {
  const game = createGame();
  game.player.hp = 80;
  game.paused = true;
  const before = structuredClone(game);
  advance(game, 2, { moveX: 1, attack: true });
  assert.equal(useSkill(game, "dash"), false);
  assert.equal(drinkPotion(game), false);
  assert.equal(interact(game), false);
  assert.deepEqual(game, before);
});

test("movement is normalized, and walls block both walking and a dash", () => {
  const cardinal = createGame(),
    diagonal = createGame();
  cardinal.enemies = [];
  diagonal.enemies = [];
  updateGame(cardinal, 0.2, { moveX: 1 });
  updateGame(diagonal, 0.2, { moveX: 1, moveY: 1 });
  const displacement = (game) =>
    Math.hypot(
      game.player.x - game.map.spawn.x,
      game.player.y - game.map.spawn.y,
    );
  assert.ok(
    Math.abs(displacement(cardinal) - displacement(diagonal)) < 0.00001,
  );
  advance(cardinal, 4, { moveX: -1 });
  assert.ok(cardinal.player.x >= 2.24);
  assert.ok(cardinal.player.x < 2.4);
  cardinal.player.facing = Math.PI;
  assert.equal(useSkill(cardinal, "dash"), true);
  assert.ok(cardinal.player.x >= 2.24);
  assert.ok(cardinal.player.invulnerable > 0);
});

test("click movement finds a route around an entire wall into another room", () => {
  const game = createGame();
  game.enemies = [];
  const target = { x: 20.5, y: 20.5 };
  advance(game, 16, { target });
  assert.ok(
    Math.hypot(game.player.x - target.x, game.player.y - target.y) < 0.15,
  );
});

test("pursuit rounds a masonry corner even when a blocked enemy is already within melee distance", () => {
  const game = createGame();
  const enemy = isolate(game);
  game.map.width = 5;
  game.map.height = 5;
  game.map.tiles = [
    [0, 0, 0, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 1, 1, 1, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 0, 0],
  ];
  game.player.x = 1.7;
  game.player.y = 1.7;
  enemy.x = 2.3;
  enemy.y = 2.3;
  enemy.speed = 0;
  enemy.attackCooldown = 20;
  assert.ok(
    Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y) < 1.22,
  );
  advance(game, 1.2, { target: enemy, attack: true, aim: enemy });
  assert.equal(game.kills, 1);
  assert.ok(Math.hypot(game.player.x - 1.7, game.player.y - 1.7) > 0.1);
});

test("melee kills award experience and loot, and unlock only the cleared floor", () => {
  const game = createGame();
  const enemy = isolate(game);
  const hp = enemy.hp;
  updateGame(game, 1 / 60, { attack: true });
  assert.equal(enemy.hp, hp - game.player.damage);
  assert.equal(game.exitUnlocked, false);
  advance(game, 0.65, { attack: true });
  assert.equal(game.kills, 1);
  assert.equal(game.floorKills, 1);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.exitUnlocked, true);
  assert.ok(game.player.xp > 0);
  assert.equal(game.stats.damageDealt, hp);
  assert.ok(game.loot.length > 0 || game.player.gold > 0);
});

test("cleave spends mana once, hits an area, and respects its cooldown", () => {
  const game = createGame();
  game.enemies = game.enemies.slice(0, 2);
  game.floorTotal = 2;
  game.enemies.forEach((enemy, i) => {
    enemy.x = game.player.x + 1.4;
    enemy.y = game.player.y + i * 0.4;
  });
  assert.equal(useSkill(game, "cleave"), true);
  assert.equal(game.player.mana, 80);
  assert.equal(game.player.skills.cleave, 4);
  assert.ok(game.enemies.every((enemy) => enemy.hp < enemy.maxHp));
  assert.equal(useSkill(game, "cleave"), false);
  assert.equal(game.player.mana, 80);
  advance(game, 4.1);
  assert.equal(useSkill(game, "cleave"), true);
  assert.equal(game.exitUnlocked, true);
  assert.equal(useSkill(game, "unknown"), false);
});

test("a ranged fireball hits its target and cannot deal damage through a wall", () => {
  const game = createGame();
  const enemy = isolate(game);
  enemy.x = game.player.x + 4;
  enemy.speed = 0;
  enemy.attackCooldown = 20;
  assert.equal(useSkill(game, "fireball", enemy), true);
  advance(game, 0.7);
  assert.equal(game.kills, 1);

  const blocked = createGame();
  const distant = isolate(blocked);
  blocked.player.x = 10.5;
  blocked.player.y = 4.5;
  distant.x = 17.5;
  distant.y = 4.5;
  distant.speed = 0;
  distant.attackCooldown = 20;
  useSkill(blocked, "fireball", distant);
  advance(blocked, 1.2);
  assert.equal(distant.hp, distant.maxHp);
});

test("enemy attacks telegraph before damage and a dodge avoids the strike", () => {
  const game = createGame();
  const enemy = isolate(game, "brute");
  game.player.invulnerable = 0;
  enemy.attackCooldown = 0;
  const originalHp = game.player.hp;
  updateGame(game, 1 / 60);
  assert.ok(enemy.windup > 0.8);
  assert.equal(game.player.hp, originalHp);
  advance(game, 0.3);
  assert.equal(game.player.hp, originalHp);
  useSkill(game, "dash", { x: game.player.x - 5, y: game.player.y });
  advance(game, 0.8);
  assert.equal(game.player.hp, originalHp);
});

test("potions are consumed only when useful and restore bounded health", () => {
  const game = createGame();
  assert.equal(drinkPotion(game), false);
  assert.equal(game.player.potions, 4);
  game.player.hp = 100;
  assert.equal(drinkPotion(game), true);
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.player.potions, 3);
  game.player.hp = 20;
  game.player.potions = 0;
  assert.equal(drinkPotion(game), false);
  assert.equal(game.player.hp, 20);
});

test("equipment replaces one slot and preserves the replaced item without stacking bonuses", () => {
  const game = createGame();
  const weapon = {
    id: "test-sword",
    type: "weapon",
    name: "Test Blade",
    damage: 17,
    rarity: "rare",
    value: 50,
  };
  const old = game.player.equipment.weapon;
  game.player.inventory.push(weapon);
  assert.equal(equipItem(game, weapon.id), true);
  assert.equal(game.player.damage, 29);
  assert.equal(game.player.equipment.weapon, weapon);
  assert.deepEqual(game.player.inventory, [old]);
  assert.equal(equipItem(game, old.id), true);
  assert.equal(game.player.damage, 18);
  assert.deepEqual(game.player.inventory, [weapon]);
  assert.equal(equipItem(game, "missing"), false);
  game.paused = true;
  assert.equal(
    equipItem(game, weapon.id),
    true,
    "inventory can be managed while gameplay is paused",
  );
});

test("nearby loot is collected once, and experience levels up health and damage", () => {
  const game = createGame();
  game.enemies = [];
  game.loot = [
    {
      id: "coins",
      x: game.player.x,
      y: game.player.y,
      type: "gold",
      rarity: "common",
      name: "Gold",
      value: 23,
    },
  ];
  advance(game, 0.2);
  assert.equal(game.player.gold, 23);
  assert.equal(game.stats.goldCollected, 23);
  assert.equal(game.loot.length, 0);
  const leveled = createGame();
  clearFloor(leveled);
  assert.ok(leveled.player.level > 1);
  assert.ok(leveled.player.maxHp > 140);
  assert.ok(leveled.player.damage > 18);
  assert.ok(leveled.player.xp < leveled.player.xpNext);
});

test("three cleared floors and the boss lead to victory through the exit", () => {
  const game = createGame();
  for (let floor = 1; floor <= 3; floor++) {
    assert.equal(game.floor, floor);
    Object.assign(game.player, game.map.exit);
    assert.equal(interact(game), false);
    assert.equal(game.floor, floor);
    clearFloor(game);
    assert.equal(game.floorKills, game.floorTotal);
    assert.equal(game.exitUnlocked, true);
    Object.assign(game.player, game.map.exit);
    assert.equal(interact(game), true);
  }
  assert.equal(game.bossDefeated, true);
  assert.equal(game.status, "victory");
  assert.equal(game.floor, 3);
  const snapshot = structuredClone(game);
  advance(game, 1, { attack: true, moveX: 1 });
  assert.deepEqual(game, snapshot);
});

test("lethal damage ends the run, freezes gameplay, and restart restores the seeded world", () => {
  const game = createGame({ seed: 82 });
  const enemy = isolate(game, "brute");
  game.player.hp = 1;
  game.player.invulnerable = 0;
  game.player.lastHurt = 0;
  enemy.attackCooldown = 0;
  advance(game, 1.2);
  assert.equal(game.status, "dead");
  assert.equal(game.player.hp, 0);
  const snapshot = structuredClone(game);
  advance(game, 1, { moveX: 1 });
  assert.equal(useSkill(game, "cleave"), false);
  assert.equal(drinkPotion(game), false);
  assert.deepEqual(game, snapshot);
  const identity = game;
  restartGame(game);
  assert.equal(game, identity);
  assert.deepEqual(game, createGame({ seed: 82 }));
});

test("a lethal enemy strike prevents later projectiles from leveling up or healing the dead player", () => {
  const game = createGame();
  const enemy = isolate(game, "brute");
  game.player.hp = 1;
  game.player.invulnerable = 0;
  game.player.lastHurt = 0;
  game.player.xp = game.player.xpNext - 1;
  enemy.windup = 0.001;
  enemy.hp = 1;
  game.effects.push({
    type: "fireball",
    x: enemy.x,
    y: enemy.y,
    vx: 0,
    vy: 0,
    life: 1,
    maxLife: 1,
    source: "player",
    damage: 100,
  });
  updateGame(game, 1 / 60);
  assert.equal(game.status, "dead");
  assert.equal(game.player.hp, 0);
  assert.equal(game.player.level, 1);
  assert.equal(game.kills, 0);
});

test("invalid or huge elapsed times cannot poison state or teleport the player", () => {
  const game = createGame();
  const before = structuredClone(game);
  for (const dt of [NaN, Infinity, -1, 0]) updateGame(game, dt, { moveX: 1 });
  assert.deepEqual(game, before);
  updateGame(game, 999, { moveX: 1 });
  assert.ok(game.time <= 0.251);
  assert.ok(game.player.x - before.player.x <= game.player.speed * 0.251);
});

test("a complete run is winnable using only gameplay commands, including automatic route finding", () => {
  const game = createGame({ seed: 19 });
  let steps = 0;
  while (game.status === "playing" && steps++ < 60 * 600) {
    const player = game.player;
    for (const item of [...player.inventory]) {
      const equipped = player.equipment[item.type];
      if (
        (item.damage || 0) + (item.armor || 0) >
        (equipped?.damage || 0) + (equipped?.armor || 0)
      )
        equipItem(game, item.id);
    }
    if (player.hp < player.maxHp * 0.45) drinkPotion(game);
    const enemies = [...game.enemies].sort(
      (a, b) =>
        Math.hypot(a.x - player.x, a.y - player.y) -
        Math.hypot(b.x - player.x, b.y - player.y),
    );
    const target = enemies[0];
    if (target) {
      const range = Math.hypot(target.x - player.x, target.y - player.y);
      if (range < 2.65) useSkill(game, "cleave", target);
      else if (range < 7) useSkill(game, "fireball", target);
      updateGame(game, 1 / 60, { target, attack: true, aim: target });
    } else {
      updateGame(game, 1 / 60, { target: game.map.exit });
      if (
        Math.hypot(game.map.exit.x - player.x, game.map.exit.y - player.y) < 1.5
      )
        interact(game);
    }
  }
  assert.equal(game.status, "victory");
  assert.equal(game.kills, 59);
  assert.equal(game.bossDefeated, true);
  assert.ok(game.player.gold > 0);
  assert.ok(game.player.level > 1);
  assert.ok(game.player.hp > 0);
});
