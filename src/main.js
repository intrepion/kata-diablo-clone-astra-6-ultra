import {
  createGame,
  updateGame,
  useSkill,
  drinkPotion,
  interact,
  equipItem,
} from "./engine.js";
import { DungeonRenderer, drawMinimap } from "./renderer.js";

const $ = (id) => document.getElementById(id);
const canvas = $("dungeon");
const renderer = new DungeonRenderer(canvas);
const dialog = $("panel");
const FLOOR_NAMES = [
  "The Forsaken Crypt",
  "The Ember Catacombs",
  "The Hollow Throne",
];
const FLOOR_ACTS = [
  "ACT I · THE UNDERCROFT",
  "ACT II · THE FALLEN SANCTUM",
  "ACT III · THE LAST GATE",
];
const SKILL_COOLDOWNS = { cleave: 4, fireball: 3, dash: 2.5 };
let game = createGame({ seed: Date.now() % 2147483647 });
game.paused = true;
let started = false;
let panelKind = null;
let input = { moveX: 0, moveY: 0, target: null, attack: false, aim: null };
let keys = new Set();
let attackHeld = false;
let selectedEnemy = null;
let pointer = null;
let pointerClient = null;
let lastFrame = performance.now();
let hudTimer = 0;
let lastStatus = "playing";
let lastFloor = 1;
let lastHp = game.player.hp;
let lastKills = 0;
let lastInventory = 0;
let latestMessage = 0;
let activeToasts = [];
let soundEnabled = readStorage("ashveil.sound", false);
let audioContext;
let best = readStorage("ashveil.best", null);

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage is optional. */
  }
}
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}
function icon(name) {
  return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
}
function sound(kind) {
  if (!soundEnabled) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended")
      audioContext.resume().catch(() => {});
    const now = audioContext.currentTime;
    const notes = {
      attack: [140, 55, 0.1, 0.045],
      cleave: [170, 35, 0.22, 0.065],
      fireball: [100, 490, 0.32, 0.035],
      dash: [390, 80, 0.13, 0.025],
      hit: [78, 29, 0.14, 0.045],
      loot: [590, 980, 0.12, 0.024],
      heal: [260, 530, 0.4, 0.03],
      begin: [130, 260, 0.65, 0.025],
    };
    const [from, to, duration, volume] = notes[kind] || notes.attack;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = ["loot", "heal", "begin"].includes(kind)
      ? "sine"
      : "triangle";
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  } catch {
    /* The game remains playable without audio support. */
  }
}
function refreshSoundButton() {
  $("sound-button").classList.toggle("sound-on", soundEnabled);
  $("sound-button").setAttribute(
    "aria-label",
    soundEnabled ? "Mute sound" : "Enable sound",
  );
  $("sound-button").title = soundEnabled ? "Mute sound" : "Enable sound";
}
function toggleSound() {
  soundEnabled = !soundEnabled;
  writeStorage("ashveil.sound", soundEnabled);
  refreshSoundButton();
  if (soundEnabled) sound("loot");
  const button = $("setting-sound");
  if (button) button.textContent = soundEnabled ? "ON" : "OFF";
}
function begin() {
  if (game.status !== "playing" || dialog.open) return;
  if (!started) {
    started = true;
    $("start-prompt").hidden = true;
    $("toasts").hidden = false;
    sound("begin");
  }
  game.paused = false;
  $("pause-badge").hidden = true;
  canvas.focus({ preventScroll: true });
}
function releaseInput() {
  keys.clear();
  attackHeld = false;
  input.moveX = 0;
  input.moveY = 0;
  input.attack = false;
}
function showToast(text, kind = "info") {
  activeToasts.push({ text, kind, until: performance.now() + 4600 });
  activeToasts = activeToasts.slice(-3);
  renderToasts();
}
function renderToasts() {
  $("toasts").hidden = !started;
  $("toasts").innerHTML = activeToasts
    .map(
      (toast) =>
        `<div class="toast ${escapeHtml(toast.kind)}">${escapeHtml(toast.text)}</div>`,
    )
    .join("");
}
function cast(skill) {
  if (dialog.open || game.status !== "playing") return;
  begin();
  if (skill === "potion") {
    const before = game.player.hp;
    drinkPotion(game);
    if (game.player.hp > before) sound("heal");
  } else if (skill === "attack") {
    input.attack = true;
    updateGame(game, 0.001, input);
    input.attack = false;
    sound("attack");
  } else {
    const before = game.player.skills[skill];
    if (pointerClient)
      pointer = renderer.screenToWorld(pointerClient.x, pointerClient.y, game);
    const horizontal =
      Number(keys.has("d") || keys.has("arrowright")) -
      Number(keys.has("a") || keys.has("arrowleft"));
    const vertical =
      Number(keys.has("s") || keys.has("arrowdown")) -
      Number(keys.has("w") || keys.has("arrowup"));
    const target =
      skill === "dash" && (horizontal || vertical)
        ? {
            x: game.player.x + horizontal + vertical,
            y: game.player.y + vertical - horizontal,
          }
        : pointer || {
            x: game.player.x + Math.cos(game.player.facing || 0) * 4,
            y: game.player.y + Math.sin(game.player.facing || 0) * 4,
          };
    useSkill(game, skill, target);
    if (game.player.skills[skill] > before) {
      sound(skill);
      const button = document.querySelector(`[data-skill="${skill}"]`);
      button?.classList.add("used");
      setTimeout(() => button?.classList.remove("used"), 130);
    }
  }
  updateHud();
}
function doInteract() {
  if (dialog.open || game.status !== "playing") return;
  begin();
  interact(game);
  input.target = null;
  selectedEnemy = null;
  updateHud();
}

function openPanel(kind) {
  if (dialog.open && panelKind === kind) {
    if (kind !== "dead" && kind !== "victory") closePanel();
    return;
  }
  game.paused = true;
  releaseInput();
  panelKind = kind;
  $("pause-badge").hidden = true;
  renderPanel();
  if (!dialog.open) dialog.showModal();
}
function closePanel() {
  if (game.status !== "playing") {
    openPanel(game.status);
    return;
  }
  dialog.close();
  panelKind = null;
  if (game.status === "playing" && started) begin();
}
function panel(title, kicker, content) {
  $("panel-title").textContent = title;
  $("panel-kicker").textContent = kicker;
  $("panel-body").innerHTML = content;
}
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
function itemStat(item) {
  return [
    item.damage ? `+${item.damage} damage` : "",
    item.armor ? `+${item.armor} armor` : "",
    item.type === "relic" && !item.damage && !item.armor ? "Ancient power" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
function renderPanel() {
  const p = game.player;
  $("close-panel").hidden = panelKind === "dead" || panelKind === "victory";
  if (panelKind === "inventory") {
    $("new-loot-dot").hidden = true;
    const equipment = ["weapon", "armor", "relic"]
      .map((slot) => {
        const item = p.equipment[slot];
        return `<div class="equipment-slot"><small>${slot.toUpperCase()}</small>${icon(slot === "weapon" ? "sword" : slot === "armor" ? "shield" : "sigil")}<strong class="rarity-${item?.rarity || "common"}">${escapeHtml(item?.name || "Unequipped")}</strong><span>${item ? escapeHtml(itemStat(item)) : "An empty promise."}</span></div>`;
      })
      .join("");
    const items = p.inventory
      .map(
        (item) =>
          `<div class="item-row">${icon(item.type === "weapon" ? "sword" : item.type === "armor" ? "shield" : "sigil")}<div><strong class="rarity-${item.rarity}">${escapeHtml(item.name)}</strong><small>${escapeHtml(itemStat(item))} · ${escapeHtml(item.rarity)}</small></div><button data-equip="${escapeHtml(item.id)}">EQUIP</button></div>`,
      )
      .join("");
    panel(
      "The things we carry",
      `WANDERER · LEVEL ${p.level}`,
      `<div class="inventory-stats"><span>DAMAGE<strong>${p.damage}</strong></span><span>ARMOR<strong>${p.armor}</strong></span><span>GOLD<strong>${p.gold}</strong></span></div><div class="section-label">EQUIPPED</div><div class="equipment-slots">${equipment}</div><div class="section-label">SATCHEL · ${p.inventory.length} ITEMS</div><div class="item-list">${items || '<div class="empty-note">An empty satchel. A crypt full of possibilities.<br>Walk near fallen enemies to collect their spoils.</div>'}</div><p class="modal-footnote">Equipping an item returns your previous equipment to the satchel. Gold and loot are collected when you approach them.</p>`,
    );
    document.querySelectorAll("[data-equip]").forEach((button) =>
      button.addEventListener("click", () => {
        const item = p.inventory.find(
          (entry) => String(entry.id) === button.dataset.equip,
        );
        if (item) {
          equipItem(game, item.id);
          sound("loot");
          renderPanel();
          updateHud();
        }
      }),
    );
  } else if (panelKind === "help") {
    panel(
      "A guide for the lost",
      "SURVIVE THE DESCENT",
      `<p class="dialog-intro">Three depths. One ancient evil. Clear each floor, gather what the dead leave behind, and find the stairs below.</p><div class="controls-grid">${[
        ["Move", "W A S D / ↑ ↓ ← →"],
        ["Move / hunt a foe", "LEFT CLICK"],
        ["Rend · basic attack", "SHIFT / RIGHT CLICK"],
        ["Reaping cleave · 20 essence", "1"],
        ["Ember bolt · 25 essence", "2"],
        ["Evade · brief invulnerability", "SPACE"],
        ["Drink a healing draught", "Q"],
        ["Use the stairs", "E"],
        ["Equipment & loot", "I"],
        ["Dungeon map", "M"],
        ["Pause / resume", "ESC"],
        ["Touch controls", "TAP + ACTION BAR"],
      ]
        .map(
          ([label, key]) =>
            `<div class="control-row"><span>${label}</span><kbd>${key}</kbd></div>`,
        )
        .join(
          "",
        )}</div><div class="section-label">A FEW WORDS OF WISDOM</div><p class="modal-footnote">Click an enemy to pursue and strike it. Move away to break pursuit. Essence regenerates, but life is precious. Evade telegraphed attacks, use cleave when surrounded, and equip stronger finds from your inventory. Ember bolts and evades aim toward your pointer. Defeat every guardian to unseal the stairs, then stand nearby and press E.</p><div class="dialog-actions"><button class="primary-button" id="help-play">${started ? "RETURN TO THE CRYPT" : "BEGIN YOUR DESCENT"}</button></div>`,
    );
    $("help-play").onclick = () => {
      closePanel();
      begin();
    };
  } else if (panelKind === "codex") {
    panel(
      "That which waits below",
      "FIELD NOTES · THE RESTLESS DEAD",
      `<p class="dialog-intro">The old sanctuary has forgotten its gods.<br>Its guardians have forgotten how to die.</p><div class="bestiary"><article class="codex-entry"><h3>The Unburied</h3><p>Restless bones in rusted armor. Slow alone, relentless in a crowd. Let them gather, then reap.</p><small>SKELETON · MELEE</small></article><article class="codex-entry"><h3>Ash Wraiths</h3><p>Remnants of the sanctuary's faithful. Their pale bolts cross the crypt. Close the distance or step aside.</p><small>WRAITH · RANGED</small></article><article class="codex-entry"><h3>Gravebound</h3><p>Burdened by stone and ancient vows. Step away from their heavy strike and answer with steel.</p><small>BRUTE · HEAVY</small></article><article class="codex-entry"><h3>The Hollow King</h3><p>Vorath waits at the final gate. When the ground glows beneath him, leave his circle—or join his court.</p><small>BOSS · DEPTH III</small></article></div>${best ? `<p class="modal-footnote">Your best descent: depth ${best.floor} · ${best.kills} foes vanquished${best.victory ? " · The Hollow King defeated" : ""}.</p>` : ""}`,
    );
  } else if (panelKind === "map") {
    panel(
      FLOOR_NAMES[game.floor - 1],
      `CHART OF THE HOLLOW · DEPTH 0${game.floor}`,
      '<canvas id="large-map" width="550" height="330" aria-label="Expanded dungeon map"></canvas><div class="map-legend"><span><i></i>Wanderer</span><span><i class="enemy"></i>Hostiles</span><span><i class="exit"></i>Stairs</span></div><p class="modal-footnote">Follow the connecting passageways. The stairs unseal when every guardian on this floor has fallen.</p>',
    );
    drawMinimap($("large-map"), game, true);
  } else if (panelKind === "settings" || panelKind === "pause") {
    const title =
      panelKind === "pause"
        ? "A moment of stillness"
        : "Make the dark your own";
    panel(
      title,
      panelKind === "pause" ? "THE DESCENT IS PAUSED" : "SETTINGS",
      `<p class="dialog-intro">Even the dark can wait.</p><div class="setting-row"><span>Combat sounds</span><button id="setting-sound">${soundEnabled ? "ON" : "OFF"}</button></div><div class="setting-row"><span>Controls & survival guide</span><button id="setting-help">OPEN</button></div><p class="modal-footnote">Your best descent is saved on this device. A current run lasts until you leave or reload this page.</p><div class="dialog-actions"><button class="primary-button" id="resume-button">${started ? "RESUME DESCENT" : "ENTER THE CRYPT"}</button><button class="secondary-button" id="restart-button">NEW DESCENT</button></div>`,
    );
    $("setting-sound").onclick = toggleSound;
    $("setting-help").onclick = () => openPanel("help");
    $("resume-button").onclick = () => {
      closePanel();
      begin();
    };
    $("restart-button").onclick = () => openPanel("restart");
  } else if (panelKind === "restart") {
    panel(
      "Leave this life behind?",
      "A NEW DESCENT",
      '<p class="dialog-intro">This run will end. Your best record will remain, and a new Wanderer will enter the crypt.</p><div class="dialog-actions"><button class="primary-button" id="confirm-restart">BEGIN ANEW</button><button class="secondary-button" id="cancel-restart">KEEP THIS RUN</button></div>',
    );
    $("confirm-restart").onclick = reset;
    $("cancel-restart").onclick = () => openPanel("pause");
  } else if (panelKind === "dead" || panelKind === "victory") {
    const victory = panelKind === "victory";
    panel(
      victory ? "Even the hollow has an end." : "The crypt remembers you.",
      victory ? "THE HOLLOW KING HAS FALLEN" : "YOUR DESCENT ENDS HERE",
      `<p class="dialog-intro">${victory ? "The last gate opens. For the first time in an age, the dead are still. You step toward a light that remembers your name." : "Another ember fades beneath the earth. But some souls are too stubborn to stay buried."}</p><div class="run-results"><div class="run-result"><strong>${game.kills}</strong><span>FOES VANQUISHED</span></div><div class="run-result"><strong>${p.gold}</strong><span>GOLD GATHERED</span></div><div class="run-result"><strong>${formatTime(game.time)}</strong><span>TIME IN THE DARK</span></div></div><div class="dialog-actions"><button class="primary-button" id="play-again">${victory ? "DESCEND ONCE MORE" : "RISE AGAIN"}</button><button class="secondary-button" id="end-codex">READ THE CODEX</button></div>`,
    );
    $("play-again").onclick = reset;
    $("end-codex").onclick = () => openPanel("codex");
  }
}
function saveRecord() {
  const record = {
    floor: game.floor,
    kills: game.kills,
    victory: game.status === "victory",
    time: game.time,
  };
  if (
    !best ||
    (record.victory && !best.victory) ||
    record.floor > best.floor ||
    (record.floor === best.floor && record.kills > best.kills)
  ) {
    best = record;
    writeStorage("ashveil.best", best);
  }
}
function reset() {
  saveRecord();
  game = createGame({ seed: Date.now() % 2147483647 });
  started = false;
  game.paused = true;
  lastStatus = "playing";
  lastFloor = 1;
  lastHp = game.player.hp;
  lastKills = 0;
  lastInventory = 0;
  latestMessage = 0;
  selectedEnemy = null;
  pointer = null;
  pointerClient = null;
  input = { moveX: 0, moveY: 0, target: null, attack: false, aim: null };
  activeToasts = [];
  releaseInput();
  closePanel();
  $("start-prompt").hidden = false;
  $("pause-badge").hidden = true;
  $("new-loot-dot").hidden = true;
  renderToasts();
  updateHud();
  begin();
}
function updateHud() {
  const p = game.player;
  $("health-number").textContent = Math.ceil(Math.max(0, p.hp));
  $("health-total").textContent = `/ ${p.maxHp}`;
  $("mana-number").textContent = Math.floor(p.mana);
  $("mana-total").textContent = `/ ${p.maxMana}`;
  $("health-orb").style.setProperty(
    "--fill",
    `${Math.max(0, (p.hp / p.maxHp) * 100)}%`,
  );
  $("mana-orb").style.setProperty("--fill", `${(p.mana / p.maxMana) * 100}%`);
  $("level-medallion").textContent = p.level;
  $("character-level").textContent = `Level ${p.level}`;
  $("gold-count").textContent = p.gold.toLocaleString();
  $("potion-count").textContent = p.potions;
  $("xp-fill").style.width = `${Math.min(100, (p.xp / p.xpNext) * 100)}%`;
  $("xp-label").textContent = `${p.xp} / ${p.xpNext} XP`;
  $("kill-counter").textContent = `${game.floorKills} / ${game.floorTotal}`;
  $("quest-fill").style.width =
    `${(game.floorKills / Math.max(1, game.floorTotal)) * 100}%`;
  $("quest-check").textContent = game.exitUnlocked ? "✓" : "◇";
  $("quest-description").textContent = game.exitUnlocked
    ? "The way is open."
    : game.floor === 3
      ? "End the reign of the Hollow King."
      : "Silence the restless dead.";
  $("quest-progress").textContent = game.exitUnlocked
    ? game.floor === 3
      ? "Leave the hollow behind"
      : "Find the stairs below"
    : "Defeat the crypt’s guardians";
  $("quest-flavor").textContent = game.exitUnlocked
    ? "Another threshold. Another choice."
    : "Some doors should stay closed.";
  $("scene-hint").textContent = !started
    ? "A forgotten sanctuary. An unbroken curse."
    : game.exitUnlocked
      ? "The seal has broken. Follow the light."
      : p.hp < p.maxHp * 0.3
        ? "Life is fading. Drink a draught with Q."
        : "Steel for the dead. Fire for the darkness.";
  for (const [skill, total] of Object.entries(SKILL_COOLDOWNS)) {
    const button = document.querySelector(`[data-skill="${skill}"]`);
    const remaining = p.skills[skill] || 0;
    button.querySelector(".cooldown").style.height =
      `${Math.min(100, (remaining / total) * 100)}%`;
    button.querySelector(".cooldown-number").textContent =
      remaining > 0.1 ? remaining.toFixed(1) : "";
    button.classList.toggle(
      "no-mana",
      (skill === "cleave" && p.mana < 20) ||
        (skill === "fireball" && p.mana < 25),
    );
  }
  const nearExit =
    Math.hypot(p.x - game.map.exit.x, p.y - game.map.exit.y) <= 2.3;
  $("interact-button").hidden =
    !started || !game.exitUnlocked || !nearExit || game.status !== "playing";
  $("interact-button").querySelector("span").textContent =
    game.floor === 3 ? "Leave the hollow" : "Descend deeper";
  const boss = game.enemies.find(
    (enemy) =>
      enemy.type === "boss" &&
      enemy.hp > 0 &&
      !enemy.dead &&
      Math.hypot(enemy.x - p.x, enemy.y - p.y) < 10,
  );
  $("boss-bar").hidden = !boss;
  if (boss) $("boss-health").style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  if (game.floor !== lastFloor) {
    selectedEnemy = null;
    input.target = null;
    pointer = null;
    pointerClient = null;
    lastFloor = game.floor;
    saveRecord();
  }
  $("location-name").textContent = FLOOR_NAMES[game.floor - 1];
  $("map-location").textContent = FLOOR_NAMES[game.floor - 1];
  $("act-label").textContent = FLOOR_ACTS[game.floor - 1];
  $("floor-label").textContent = `DEPTH 0${game.floor} / 03`;
  if (p.inventory.length > lastInventory) {
    $("new-loot-dot").hidden = false;
    sound("loot");
  }
  lastInventory = p.inventory.length;
  if (p.hp < lastHp) sound("hit");
  lastHp = p.hp;
  if (game.kills > lastKills) {
    sound("attack");
    saveRecord();
  }
  lastKills = game.kills;
  for (const message of game.messages) {
    if (message.id > latestMessage) {
      showToast(message.text, message.kind);
      latestMessage = message.id;
    }
  }
  if (activeToasts.some((toast) => toast.until < performance.now())) {
    activeToasts = activeToasts.filter(
      (toast) => toast.until >= performance.now(),
    );
    renderToasts();
  }
  drawMinimap($("minimap"), game);
  if (game.status !== lastStatus) {
    lastStatus = game.status;
    if (game.status === "dead" || game.status === "victory") {
      saveRecord();
      openPanel(game.status);
    }
  }
}

canvas.addEventListener("pointermove", (event) => {
  pointerClient = { x: event.clientX, y: event.clientY };
  pointer = renderer.screenToWorld(event.clientX, event.clientY, game);
  input.aim = pointer;
});
canvas.addEventListener("pointerdown", (event) => {
  if (dialog.open || game.status !== "playing") return;
  event.preventDefault();
  begin();
  pointerClient = { x: event.clientX, y: event.clientY };
  pointer = renderer.screenToWorld(event.clientX, event.clientY, game);
  input.aim = pointer;
  if (event.button === 2) {
    attackHeld = true;
    input.target = null;
    selectedEnemy = null;
    return;
  }
  if (event.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  const nearest = game.enemies
    .filter((enemy) => !enemy.dead && enemy.hp > 0)
    .map((enemy) => {
      const point = renderer.screen(enemy.x, enemy.y);
      const height =
        enemy.type === "boss" ? 100 : enemy.type === "brute" ? 75 : 62;
      const dx = event.clientX - rect.left - point.x,
        dy = event.clientY - rect.top - point.y;
      const onSprite =
        Math.abs(dx) < (enemy.type === "boss" ? 44 : 28) &&
        dy > -height &&
        dy < 10;
      return { enemy, onSprite, distance: Math.hypot(dx, dy + height * 0.45) };
    })
    .filter((entry) => entry.onSprite)
    .sort((a, b) => a.distance - b.distance)[0];
  if (nearest) {
    selectedEnemy = nearest.enemy.id;
    input.target = { x: nearest.enemy.x, y: nearest.enemy.y };
  } else {
    selectedEnemy = null;
    input.target = pointer;
    game.effects.push({
      type: "dash",
      x: pointer.x,
      y: pointer.y,
      life: 0.35,
      maxLife: 0.35,
      radius: 0.22,
      color: "#d4bb80",
    });
  }
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("pointerup", () => {
  attackHeld = false;
});
window.addEventListener("pointercancel", () => {
  attackHeld = false;
});
window.addEventListener("keydown", (event) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
  const key = event.key.toLowerCase();
  if (key === " " && event.target.closest("button, a")) return;
  if (key === "escape") {
    event.preventDefault();
    if (event.repeat) return;
    if (dialog.open) closePanel();
    else if (game.status === "playing") openPanel("pause");
    else openPanel(game.status);
    return;
  }
  if (dialog.open) {
    if (
      (key === "i" && panelKind === "inventory") ||
      (key === "m" && panelKind === "map")
    ) {
      event.preventDefault();
      closePanel();
    }
    return;
  }
  if (
    [
      "w",
      "a",
      "s",
      "d",
      "arrowup",
      "arrowleft",
      "arrowdown",
      "arrowright",
      "shift",
      " ",
      "1",
      "2",
      "q",
      "e",
      "i",
      "m",
      "?",
    ].includes(key)
  )
    event.preventDefault();
  else return;
  if (
    event.repeat &&
    ![
      "w",
      "a",
      "s",
      "d",
      "arrowup",
      "arrowleft",
      "arrowdown",
      "arrowright",
      "shift",
    ].includes(key)
  )
    return;
  if (key === "i") {
    openPanel("inventory");
    return;
  }
  if (key === "m") {
    openPanel("map");
    return;
  }
  if (key === "?") {
    openPanel("help");
    return;
  }
  begin();
  keys.add(key);
  if (key === "1") cast("cleave");
  if (key === "2") cast("fireball");
  if (key === " ") cast("dash");
  if (key === "q") cast("potion");
  if (key === "e") doInteract();
});
window.addEventListener("keyup", (event) =>
  keys.delete(event.key.toLowerCase()),
);
window.addEventListener("blur", () => {
  releaseInput();
  if (started && !dialog.open && game.status === "playing") {
    game.paused = true;
    $("pause-badge").hidden = false;
  }
});
document.addEventListener("visibilitychange", () => {
  lastFrame = performance.now();
  if (document.hidden) {
    releaseInput();
    if (started && !dialog.open && game.status === "playing") {
      game.paused = true;
      $("pause-badge").hidden = false;
    }
  }
});
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closePanel();
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      closePanel();
  }
});
$("close-panel").onclick = closePanel;
$("begin-button").onclick = begin;
$("descent-button").onclick = () => {
  if (dialog.open) closePanel();
  else begin();
};
$("inventory-button").onclick = $("inventory-link").onclick = () =>
  openPanel("inventory");
$("map-button").onclick = $("expand-map").onclick = () => openPanel("map");
$("help-button").onclick = $("footer-help").onclick = () => openPanel("help");
$("settings-button").onclick = () => openPanel("settings");
$("codex-button").onclick = () => openPanel("codex");
$("sound-button").onclick = toggleSound;
$("interact-button").onclick = doInteract;
document
  .querySelectorAll("[data-skill]")
  .forEach((button) =>
    button.addEventListener("click", () => cast(button.dataset.skill)),
  );
refreshSoundButton();
updateHud();

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!game.paused && game.status === "playing") {
    if (pointerClient)
      pointer = renderer.screenToWorld(pointerClient.x, pointerClient.y, game);
    const horizontal =
      Number(keys.has("d") || keys.has("arrowright")) -
      Number(keys.has("a") || keys.has("arrowleft"));
    const vertical =
      Number(keys.has("s") || keys.has("arrowdown")) -
      Number(keys.has("w") || keys.has("arrowup"));
    input.moveX = (horizontal + vertical) / Math.SQRT2;
    input.moveY = (vertical - horizontal) / Math.SQRT2;
    if (horizontal || vertical) {
      input.target = null;
      selectedEnemy = null;
    }
    let hunting = false;
    if (selectedEnemy != null) {
      const target = game.enemies.find(
        (enemy) => enemy.id === selectedEnemy && !enemy.dead && enemy.hp > 0,
      );
      if (target) {
        input.target = { x: target.x, y: target.y };
        input.aim = { x: target.x, y: target.y };
        hunting = true;
      } else {
        selectedEnemy = null;
        input.target = null;
      }
    } else input.aim = pointer;
    input.attack = attackHeld || keys.has("shift") || hunting;
    updateGame(game, dt, input);
    if (
      input.target &&
      Math.hypot(
        input.target.x - game.player.x,
        input.target.y - game.player.y,
      ) < 0.15
    )
      input.target = null;
  }
  renderer.render(game, dt);
  hudTimer += dt;
  if (hudTimer >= 0.08) {
    hudTimer = 0;
    updateHud();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// A local-only inspection seam for smoke tests and development. No remote game authority.
if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
  window.__ASHVEIL__ = {
    get game() {
      return game;
    },
    renderer,
    begin,
    cast,
    openPanel,
    closePanel,
    reset,
    updateHud,
  };
}
