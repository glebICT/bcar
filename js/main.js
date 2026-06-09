// Entry point: screen flow, garage/track UI, and the gameplay loop.
import {
  TRACKS, CARS, UPGRADES, PAINTS, MAX_UPGRADE,
  resolveStats, upgradeCost, flatLevels,
} from "./data.js";
import * as save from "./storage.js";
import { Car } from "./car.js";
import { drawCar } from "./render.js";
import { World } from "./world.js";
import { Input } from "./input.js";

// --- DOM refs ---
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("hud");

const screens = {
  menu: document.getElementById("screen-menu"),
  levelSelect: document.getElementById("screen-levelSelect"),
  garage: document.getElementById("screen-garage"),
  pause: document.getElementById("screen-pause"),
  results: document.getElementById("screen-results"),
};

const input = new Input();

let dpr = 1;
let world = null;
let current = "menu"; // active screen / "play"
let paused = false;
let garageCarIndex = 0;

// --- Canvas sizing ---
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
}
window.addEventListener("resize", resize);
resize();

// --- Screen management ---
function show(name) {
  current = name;
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle("hidden", key !== name);
  }
  hud.classList.toggle("hidden", name !== "play");

  if (name === "menu") refreshMenu();
  if (name === "levelSelect") renderTrackList();
  if (name === "garage") renderGarage();
  syncCoinMirrors();
}

function syncCoinMirrors() {
  const coins = save.getCoins();
  document.getElementById("menu-coins").textContent = coins;
  document.querySelectorAll(".coins-mirror").forEach((el) => (el.textContent = coins));
}

function refreshMenu() {
  document.getElementById("menu-coins").textContent = save.getCoins();
}

// --- Track / level select ---
function renderTrackList() {
  const container = document.getElementById("track-list");
  container.innerHTML = "";
  const flat = flatLevels();
  const unlockedIndex = computeUnlockedIndex(flat);

  TRACKS.forEach((track) => {
    const card = document.createElement("div");
    card.className = "track-card";
    const sw = document.createElement("div");
    sw.className = "theme-swatch";
    sw.style.background = `linear-gradient(180deg, ${track.colors.sky1}, ${track.colors.ground})`;
    card.appendChild(sw);
    const h = document.createElement("h3");
    h.textContent = track.name;
    card.appendChild(h);

    track.levels.forEach((lvl, li) => {
      const key = `${track.id}:${li}`;
      const flatIdx = flat.findIndex((f) => f.key === key);
      const locked = flatIdx > unlockedIndex;
      const completed = save.isLevelCompleted(key);
      const best = save.getBestDistance(key);

      const row = document.createElement("div");
      row.className = "level-row" + (locked ? " locked" : "");
      row.innerHTML = `
        <div>
          <div class="lvl-name">${lvl.name}</div>
          <div class="lvl-meta">${lvl.distance} m · 🪙 ${lvl.reward}${best ? ` · best ${best} m` : ""}</div>
        </div>
        <div class="stars">${locked ? "🔒" : completed ? "✓" : "▶"}</div>`;
      if (!locked) {
        row.addEventListener("click", () => startLevel(track, lvl, key));
      }
      card.appendChild(row);
    });
    container.appendChild(card);
  });
}

// Highest unlocked flat index = first incomplete level (sequential unlock).
function computeUnlockedIndex(flat) {
  let idx = 0;
  for (let i = 0; i < flat.length; i++) {
    if (save.isLevelCompleted(flat[i].key)) idx = i + 1;
    else break;
  }
  return Math.min(idx, flat.length - 1);
}

// --- Garage ---
const garageCanvas = document.getElementById("garage-canvas");
const gctx = garageCanvas.getContext("2d");
let garageSpin = 0;

function renderGarage() {
  garageCarIndex = ((garageCarIndex % CARS.length) + CARS.length) % CARS.length;
  const car = CARS[garageCarIndex];
  const owned = save.ownsCar(car.id);

  document.getElementById("garage-car-name").textContent = car.name;

  // Paint dots.
  const paintRow = document.getElementById("paint-row");
  paintRow.innerHTML = "";
  const activePaint = save.getCarData(car.id).paint;
  PAINTS.forEach((color, i) => {
    const dot = document.createElement("div");
    dot.className = "paint-dot" + (i === activePaint ? " active" : "");
    dot.style.background = color;
    dot.addEventListener("click", () => {
      save.setPaint(car.id, i);
      renderGarage();
    });
    paintRow.appendChild(dot);
  });

  // Buy / select buttons.
  const buyBtn = document.getElementById("btn-buy-car");
  const selBtn = document.getElementById("btn-select-car");
  if (!owned) {
    buyBtn.classList.remove("hidden");
    selBtn.classList.add("hidden");
    const affordable = save.getCoins() >= car.price;
    buyBtn.textContent = `BUY · 🪙 ${car.price}`;
    buyBtn.disabled = !affordable;
  } else {
    buyBtn.classList.add("hidden");
    selBtn.classList.remove("hidden");
    const isSelected = save.getSelectedCar() === car.id;
    selBtn.textContent = isSelected ? "SELECTED" : "SELECT";
    selBtn.disabled = isSelected;
  }

  renderUpgrades(car, owned);
}

function renderUpgrades(car, owned) {
  const list = document.getElementById("upgrade-list");
  list.innerHTML = "";
  UPGRADES.forEach((u) => {
    const level = save.getUpgradeLevel(car.id, u.id);
    const wrap = document.createElement("div");
    wrap.className = "upgrade";

    const pips = Array.from({ length: MAX_UPGRADE }, (_, i) =>
      `<div class="pip ${i < level ? "filled" : ""}"></div>`).join("");

    const maxed = level >= MAX_UPGRADE;
    const cost = upgradeCost(u.baseCost, level);
    const affordable = save.getCoins() >= cost;

    wrap.innerHTML = `
      <div class="upgrade-head">
        <span class="u-name">${u.name}</span>
        <span class="${maxed ? "owned-tag" : "price-tag"}">${maxed ? "MAX" : "🪙 " + cost}</span>
      </div>
      <div class="upgrade-bar">${pips}</div>
      <button class="btn upgrade-buy" ${(!owned || maxed || !affordable) ? "disabled" : ""}>
        ${maxed ? "MAXED" : !owned ? "BUY CAR FIRST" : "UPGRADE"}
      </button>`;

    const btn = wrap.querySelector("button");
    if (owned && !maxed && affordable) {
      btn.addEventListener("click", () => {
        if (save.spendCoins(cost)) {
          save.setUpgradeLevel(car.id, u.id, level + 1);
          renderGarage();
          syncCoinMirrors();
        }
      });
    }
    list.appendChild(wrap);
  });
}

function drawGaragePreview() {
  const car = CARS[garageCarIndex];
  const stats = resolveStats(car, save.getCarData(car.id).upgrades);
  const paint = save.getPaintColor(car.id);
  const preview = new Car(car, stats, paint, null, 2000);

  const w = garageCanvas.width, h = garageCanvas.height;
  gctx.clearRect(0, 0, w, h);
  garageSpin += 0.04;
  drawCar(gctx, preview, {
    x: w / 2,
    y: h / 2 - 10,
    angle: 0,
    scale: 1.25,
    spin: garageSpin,
  });
}

document.getElementById("car-prev").addEventListener("click", () => { garageCarIndex--; renderGarage(); });
document.getElementById("car-next").addEventListener("click", () => { garageCarIndex++; renderGarage(); });
document.getElementById("btn-buy-car").addEventListener("click", () => {
  const car = CARS[garageCarIndex];
  if (save.buyCar(car.id)) {
    save.selectCar(car.id);
    renderGarage();
    syncCoinMirrors();
  }
});
document.getElementById("btn-select-car").addEventListener("click", () => {
  save.selectCar(CARS[garageCarIndex].id);
  renderGarage();
});

// --- Gameplay ---
let activeLevel = null;

function startLevel(track, level, key) {
  resultsShown = false;
  const carId = save.getSelectedCar();
  const carDef = CARS.find((c) => c.id === carId) || CARS[0];
  const stats = resolveStats(carDef, save.getCarData(carId).upgrades);
  const paint = save.getPaintColor(carId);

  world = new World(track, level, key, carDef, stats, paint);
  activeLevel = { track, level, key };
  paused = false;
  document.getElementById("hud-best").textContent = save.getBestDistance(key) + " m";
  show("play");
}

function restartLevel() {
  if (!activeLevel) return;
  startLevel(activeLevel.track, activeLevel.level, activeLevel.key);
}

function finishRun() {
  const dist = Math.round(world.car.distance);
  const key = activeLevel.key;
  save.setBestDistance(key, dist);

  const finished = world.state === "finished";
  let reward = world.runCoins;
  if (finished) {
    save.markCompleted(key);
    reward += activeLevel.level.reward;
  }
  save.addCoins(reward);

  // Populate results screen.
  document.getElementById("results-title").textContent =
    finished ? "FINISHED! 🏁" : world.failReason === "fuel" ? "OUT OF FUEL" : "CRASHED!";
  document.getElementById("result-distance").textContent = dist + " m";
  document.getElementById("result-coins").textContent = world.runCoins;
  document.getElementById("result-reward").textContent = "+" + reward;

  const nextBtn = document.getElementById("btn-next");
  nextBtn.textContent = finished ? "CONTINUE" : "TRACKS";

  show("results");
}

// --- HUD ---
function updateHud() {
  if (!world) return;
  document.getElementById("hud-distance").textContent = Math.round(world.car.distance) + " m";
  document.getElementById("hud-coins").textContent = world.runCoins;
  const pct = (world.fuel / world.fuelMax) * 100;
  const fill = document.getElementById("fuel-fill");
  fill.style.width = pct + "%";
}

// --- Loop ---
let lastT = performance.now();
let acc = 0;
const STEP = 1 / 60;
let resultsShown = false;

function frame(now) {
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;

  if (current === "play" && !paused && world) {
    world.setThrottle(input.throttle);
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 6) {
      world.update(STEP);
      acc -= STEP;
      guard++;
    }
    world.render(ctx, canvas.width, canvas.height);
    updateHud();

    if (world.state !== "running" && !resultsShown) {
      // Brief delay so the player sees the crash/finish before the panel.
      if (world._endTimer > 0.7) {
        resultsShown = true;
        input.release();
        finishRun();
      }
    }
  } else if (current === "garage") {
    drawGaragePreview();
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Buttons / global controls ---
document.querySelectorAll("[data-goto]").forEach((el) => {
  el.addEventListener("click", () => show(el.dataset.goto));
});

document.getElementById("btn-reset").addEventListener("click", () => {
  if (confirm("Reset all progress, coins, and cars?")) {
    save.resetSave();
    garageCarIndex = 0;
    show("menu");
  }
});

document.getElementById("btn-pause").addEventListener("click", () => togglePause(true));
document.getElementById("btn-resume").addEventListener("click", () => togglePause(false));
document.getElementById("btn-restart").addEventListener("click", () => { togglePause(false); restartLevel(); });
document.getElementById("btn-retry").addEventListener("click", () => { resultsShown = false; restartLevel(); });
document.getElementById("btn-next").addEventListener("click", () => show("levelSelect"));

function togglePause(state) {
  if (current !== "play" && !paused) return;
  paused = state;
  screens.pause.classList.toggle("hidden", !state);
}

window.addEventListener("keydown", (e) => {
  if (current === "play" && (e.key === "Escape" || e.key === "p" || e.key === "P")) {
    togglePause(!paused);
  }
  if (current === "play" && (e.key === "r" || e.key === "R") && !paused) {
    resultsShown = false;
    restartLevel();
  }
});

// Boot.
show("menu");
