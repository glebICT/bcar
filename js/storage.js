// Persistent save state via localStorage.
import { CARS, PAINTS } from "./data.js";

const KEY = "brennan.save.v1";

const DEFAULT_SAVE = {
  coins: 0,
  selectedCar: "jeep",
  ownedCars: ["jeep"],
  // per-car: { paint: index, upgrades: { engine, tires, suspension, fuel } }
  cars: {
    jeep: { paint: 1, upgrades: {} },
  },
  // level key -> best distance reached
  bestDistance: {},
  // completed level keys
  completed: [],
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_SAVE), ...parsed };
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function get() {
  return state;
}

export function resetSave() {
  state = structuredClone(DEFAULT_SAVE);
  save();
}

export function getCoins() {
  return state.coins;
}

export function addCoins(n) {
  state.coins = Math.max(0, Math.round(state.coins + n));
  save();
}

export function spendCoins(n) {
  if (state.coins < n) return false;
  state.coins -= n;
  save();
  return true;
}

// --- Car ownership & customization ---

function ensureCarEntry(carId) {
  if (!state.cars[carId]) {
    state.cars[carId] = { paint: 0, upgrades: {} };
  }
  return state.cars[carId];
}

export function ownsCar(carId) {
  return state.ownedCars.includes(carId);
}

export function buyCar(carId) {
  const car = CARS.find((c) => c.id === carId);
  if (!car || ownsCar(carId)) return false;
  if (!spendCoins(car.price)) return false;
  state.ownedCars.push(carId);
  ensureCarEntry(carId);
  save();
  return true;
}

export function selectCar(carId) {
  if (!ownsCar(carId)) return false;
  state.selectedCar = carId;
  ensureCarEntry(carId);
  save();
  return true;
}

export function getSelectedCar() {
  return state.selectedCar;
}

export function getCarData(carId) {
  return ensureCarEntry(carId);
}

export function setPaint(carId, paintIndex) {
  const entry = ensureCarEntry(carId);
  entry.paint = ((paintIndex % PAINTS.length) + PAINTS.length) % PAINTS.length;
  save();
}

export function getPaintColor(carId) {
  const entry = ensureCarEntry(carId);
  return PAINTS[entry.paint] || PAINTS[0];
}

export function getUpgradeLevel(carId, upgradeId) {
  const entry = ensureCarEntry(carId);
  return entry.upgrades[upgradeId] || 0;
}

export function setUpgradeLevel(carId, upgradeId, level) {
  const entry = ensureCarEntry(carId);
  entry.upgrades[upgradeId] = level;
  save();
}

// --- Progression ---

export function isLevelCompleted(key) {
  return state.completed.includes(key);
}

export function markCompleted(key) {
  if (!state.completed.includes(key)) {
    state.completed.push(key);
    save();
  }
}

export function getBestDistance(key) {
  return state.bestDistance[key] || 0;
}

export function setBestDistance(key, dist) {
  if (dist > (state.bestDistance[key] || 0)) {
    state.bestDistance[key] = Math.round(dist);
    save();
  }
}
