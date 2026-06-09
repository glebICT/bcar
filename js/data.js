// Static game data: cars, upgrades, tracks, paint colors.

export const PAINTS = [
  "#ff5e57", "#ffcc33", "#4fd17a", "#3aa0ff",
  "#b06bff", "#ff7ad9", "#ffffff", "#2b2f3a",
];

// Car archetypes. Stats are *base* values; upgrades scale them.
// enginePower: drive force, mass: chassis mass, grip: traction,
// suspension: spring stiffness, fuel: tank size (seconds of throttle).
export const CARS = [
  {
    id: "jeep",
    name: "Jeep",
    price: 0,
    shape: "jeep",
    base: { enginePower: 115000, mass: 120, grip: 1.0, suspension: 14000, fuel: 28, wheelRadius: 24, wheelBase: 44, drive4wd: false },
  },
  {
    id: "buggy",
    name: "Dune Buggy",
    price: 6000,
    shape: "buggy",
    base: { enginePower: 135000, mass: 95, grip: 1.05, suspension: 11000, fuel: 26, wheelRadius: 27, wheelBase: 50, drive4wd: true },
  },
  {
    id: "sports",
    name: "Sports Car",
    price: 14000,
    shape: "sports",
    base: { enginePower: 155000, mass: 105, grip: 1.25, suspension: 17000, fuel: 24, wheelRadius: 20, wheelBase: 52, drive4wd: false },
  },
  {
    id: "truck",
    name: "Monster Truck",
    price: 28000,
    shape: "truck",
    base: { enginePower: 200000, mass: 175, grip: 1.15, suspension: 20000, fuel: 34, wheelRadius: 34, wheelBase: 56, drive4wd: true },
  },
];

// Upgrade tracks. Each has 6 levels (0 = base). Cost grows per level.
export const UPGRADES = [
  { id: "engine",     name: "Engine",     stat: "enginePower", perLevel: 0.18, baseCost: 600 },
  { id: "tires",      name: "Tires",      stat: "grip",        perLevel: 0.10, baseCost: 500 },
  { id: "suspension", name: "Suspension", stat: "suspension",  perLevel: 0.12, baseCost: 450 },
  { id: "fuel",       name: "Fuel Tank",  stat: "fuel",        perLevel: 0.15, baseCost: 400 },
];
export const MAX_UPGRADE = 5;

export function upgradeCost(baseCost, level) {
  return Math.round(baseCost * Math.pow(1.7, level));
}

// Resolve a car's effective stats given stored upgrade levels.
export function resolveStats(car, upgrades = {}) {
  const s = { ...car.base };
  for (const u of UPGRADES) {
    const lvl = upgrades[u.id] || 0;
    s[u.stat] = car.base[u.stat] * (1 + u.perLevel * lvl);
  }
  return s;
}

// Themed tracks, each with several levels of increasing distance.
export const TRACKS = [
  {
    id: "countryside",
    name: "Countryside",
    gravity: 1500,
    roughness: 0.55,
    amplitude: 90,
    colors: { sky1: "#7ec8ff", sky2: "#cdeeff", ground: "#5a8f3c", groundDark: "#3c6427", dirt: "#6b4a2a" },
    levels: [
      { name: "Sunday Drive", distance: 900, reward: 350 },
      { name: "Green Hills", distance: 1500, reward: 600 },
      { name: "The Long Road", distance: 2400, reward: 1000 },
    ],
  },
  {
    id: "desert",
    name: "Desert",
    gravity: 1450,
    roughness: 0.8,
    amplitude: 105,
    colors: { sky1: "#ffb46b", sky2: "#ffe6c2", ground: "#d9a441", groundDark: "#b5832f", dirt: "#8a5a22" },
    levels: [
      { name: "Dust Bowl", distance: 1200, reward: 700 },
      { name: "Canyon Run", distance: 2000, reward: 1100 },
      { name: "Sandstorm", distance: 3000, reward: 1800 },
    ],
  },
  {
    id: "mountain",
    name: "Mountains",
    gravity: 1600,
    roughness: 0.95,
    amplitude: 135,
    colors: { sky1: "#9aa7c7", sky2: "#e6ecff", ground: "#8a8f9c", groundDark: "#5b606e", dirt: "#4a4e58" },
    levels: [
      { name: "Foothills", distance: 1500, reward: 1200 },
      { name: "Steep Climb", distance: 2400, reward: 1900 },
      { name: "Summit", distance: 3600, reward: 3000 },
    ],
  },
  {
    id: "moon",
    name: "The Moon",
    gravity: 520,
    roughness: 1.0,
    amplitude: 150,
    colors: { sky1: "#0a0a18", sky2: "#1a1a3a", ground: "#c9c9d6", groundDark: "#8a8a99", dirt: "#6a6a78" },
    levels: [
      { name: "Low Gravity", distance: 1800, reward: 2200 },
      { name: "Crater Field", distance: 2800, reward: 3400 },
      { name: "Dark Side", distance: 4200, reward: 5000 },
    ],
  },
];

// Flat ordered list of all levels for sequential unlocking.
export function flatLevels() {
  const list = [];
  TRACKS.forEach((track, ti) => {
    track.levels.forEach((lvl, li) => {
      list.push({ trackId: track.id, trackIndex: ti, levelIndex: li, key: `${track.id}:${li}` });
    });
  });
  return list;
}
