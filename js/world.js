// The playable world: terrain, car, pickups, camera, and win/lose logic.
import { Terrain } from "./terrain.js";
import { Car } from "./car.js";
import { drawCar } from "./render.js";
import { clamp } from "./physics.js";

const BASE_Y = 420;
const COIN_VALUE = 50;
const VIEW_WIDTH = 980; // world px visible across the canvas

export class World {
  constructor(track, level, levelKey, carDef, stats, paint) {
    this.track = track;
    this.level = level;
    this.levelKey = levelKey;

    const seed = hashLevel(levelKey);
    this.terrain = new Terrain(track, level, seed);
    this.terrain.baseY = BASE_Y;

    const startX = this.terrain.step * 4;
    this.car = new Car(carDef, stats, paint, this.terrain, track.gravity);
    this.car.setStartX(startX);
    this.car.reset(startX + 30);

    this.fuelMax = stats.fuel;
    this.fuel = stats.fuel;

    this.coins = this._spawnCoins(startX);
    this.fuelCans = this._spawnFuel(startX);

    this.runCoins = 0;
    this.state = "running"; // running | finished | failed
    this._idleTimer = 0;
    this._endTimer = 0;

    this.cam = { x: this.car.chassis.x, y: this.car.chassis.y, scale: 1 };
  }

  _spawnCoins(startX) {
    const coins = [];
    const finish = this.terrain.finishX;
    for (let x = startX + 260; x < finish - 60; x += 130) {
      // Occasionally make a little arc of 3 coins.
      const arc = Math.random() < 0.4 ? 3 : 1;
      for (let j = 0; j < arc; j++) {
        const cx = x + j * 42;
        if (cx >= finish - 60) break;
        const gy = this.terrain.groundY(cx);
        const lift = 46 + (arc > 1 ? Math.sin((j / (arc - 1)) * Math.PI) * 36 : 0);
        coins.push({ x: cx, y: gy - lift, taken: false });
      }
    }
    return coins;
  }

  _spawnFuel(startX) {
    const cans = [];
    const finish = this.terrain.finishX;
    for (let x = startX + 650; x < finish - 100; x += 760) {
      const gy = this.terrain.groundY(x);
      cans.push({ x, y: gy - 40, taken: false });
    }
    return cans;
  }

  setThrottle(t) {
    if (this.state !== "running") { this.car.throttle = 0; return; }
    if (this.fuel <= 0) { this.car.throttle = 0; return; }
    this.car.throttle = t;
  }

  update(dt) {
    const car = this.car;

    // Fuel burn.
    if (this.state === "running" && car.throttle !== 0 && this.fuel > 0) {
      const rate = car.throttle > 0 ? 1.0 : 0.55;
      this.fuel = Math.max(0, this.fuel - rate * dt);
    }

    car.step(dt);

    this._collect();

    // Win / lose.
    if (this.state === "running") {
      if (car.crashed) {
        this.state = "failed";
        this.failReason = "crash";
      } else if (car.maxX >= this.terrain.finishX) {
        this.state = "finished";
      } else if (this.fuel <= 0) {
        // Out of fuel: fail once the car has nearly stopped.
        if (car.speed < 25) this._idleTimer += dt;
        else this._idleTimer = 0;
        if (this._idleTimer > 1.6) {
          this.state = "failed";
          this.failReason = "fuel";
        }
      }
    } else {
      car.throttle = 0;
      this._endTimer += dt;
    }

    this._updateCamera(dt);
  }

  _collect() {
    const cx = this.car.chassis.x;
    const cy = this.car.chassis.y;
    for (const c of this.coins) {
      if (c.taken) continue;
      if (Math.abs(c.x - cx) < 48 && Math.abs(c.y - cy) < 60) {
        c.taken = true;
        this.runCoins += COIN_VALUE;
      }
    }
    for (const f of this.fuelCans) {
      if (f.taken) continue;
      if (Math.abs(f.x - cx) < 50 && Math.abs(f.y - cy) < 64) {
        f.taken = true;
        this.fuel = Math.min(this.fuelMax, this.fuel + this.fuelMax * 0.5);
      }
    }
  }

  _updateCamera(dt) {
    const car = this.car;
    const lookahead = clamp(car.chassis.vx * 0.25, -180, 220);
    const targetX = car.chassis.x + lookahead;
    const targetY = car.chassis.y - 40;
    const k = 1 - Math.pow(0.001, dt);
    this.cam.x += (targetX - this.cam.x) * k;
    this.cam.y += (targetY - this.cam.y) * k;
  }

  // ---- Rendering ----
  render(ctx, cw, ch) {
    const scale = cw / VIEW_WIDTH;
    this.cam.scale = scale;

    this._drawSky(ctx, cw, ch);

    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(scale, scale);
    ctx.translate(-this.cam.x, -this.cam.y);

    this._drawParallax(ctx, cw, ch, scale);
    this._drawTerrain(ctx, cw, ch, scale);
    this._drawFinish(ctx);
    this._drawCoins(ctx);
    this._drawFuelCans(ctx);

    drawCar(ctx, this.car, {
      x: this.car.chassis.x,
      y: this.car.chassis.y,
      angle: this.car.chassis.angle,
      live: true,
    });

    ctx.restore();
  }

  _drawSky(ctx, cw, ch) {
    const c = this.track.colors;
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, c.sky1);
    g.addColorStop(1, c.sky2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);

    if (this.track.id === "moon") {
      // Stars.
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (let i = 0; i < 60; i++) {
        const sx = (i * 137.5) % cw;
        const sy = (i * 89.3) % (ch * 0.6);
        ctx.fillRect(sx, sy, 2, 2);
      }
    }
  }

  // Visible world-x range for the current camera.
  _viewRange(cw, scale) {
    const halfW = cw / 2 / scale;
    return { left: this.cam.x - halfW, right: this.cam.x + halfW };
  }

  _drawParallax(ctx, cw, ch, scale) {
    const c = this.track.colors;
    const { left, right } = this._viewRange(cw, scale);
    // Two rolling hill layers behind the play terrain.
    const layers = [
      { depth: 0.35, amp: 90, color: shadeHex(c.groundDark, 30), yOff: 120, wl: 700 },
      { depth: 0.6, amp: 70, color: shadeHex(c.groundDark, 12), yOff: 70, wl: 420 },
    ];
    for (const L of layers) {
      ctx.fillStyle = L.color;
      ctx.beginPath();
      const step = 40;
      const startX = Math.floor(left / step) * step;
      ctx.moveTo(startX, BASE_Y + 600);
      for (let x = startX; x <= right + step; x += step) {
        const px = this.cam.x + (x - this.cam.x) * L.depth;
        const y = BASE_Y - L.yOff - Math.sin(px / L.wl * Math.PI * 2) * L.amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(right + step, BASE_Y + 600);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawTerrain(ctx, cw, ch, scale) {
    const c = this.track.colors;
    const terr = this.terrain;
    const { left, right } = this._viewRange(cw, scale);
    const step = terr.step;
    const x0 = Math.max(0, Math.floor(left / step) * step);
    const x1 = Math.min(terr.length, right + step);

    ctx.beginPath();
    ctx.moveTo(x0, terr.groundY(x0));
    for (let x = x0; x <= x1; x += step) {
      ctx.lineTo(x, terr.groundY(x));
    }
    const bottom = BASE_Y + 700;
    ctx.lineTo(x1, bottom);
    ctx.lineTo(x0, bottom);
    ctx.closePath();

    // Dirt body.
    ctx.fillStyle = c.dirt;
    ctx.fill();

    // Grass / surface cap.
    ctx.beginPath();
    ctx.moveTo(x0, terr.groundY(x0));
    for (let x = x0; x <= x1; x += step) ctx.lineTo(x, terr.groundY(x));
    ctx.lineWidth = 14;
    ctx.lineJoin = "round";
    ctx.strokeStyle = c.ground;
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = shadeHex(c.ground, 30);
    ctx.stroke();
  }

  _drawFinish(ctx) {
    const x = this.terrain.finishX;
    const gy = this.terrain.groundY(x);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x, gy - 140);
    ctx.stroke();
    // Checkered flag.
    const fw = 46, fh = 30, sq = fh / 3;
    for (let r = 0; r < 3; r++) {
      for (let col = 0; col < 4; col++) {
        ctx.fillStyle = (r + col) % 2 ? "#fff" : "#111";
        ctx.fillRect(x + 2 + col * sq, gy - 140 + r * sq, sq, sq);
      }
    }
  }

  _drawCoins(ctx) {
    for (const c of this.coins) {
      if (c.taken) continue;
      ctx.fillStyle = "#ffcc33";
      ctx.beginPath();
      ctx.arc(c.x, c.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c8950f";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = "#c8950f";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", c.x, c.y + 1);
    }
  }

  _drawFuelCans(ctx) {
    for (const f of this.fuelCans) {
      if (f.taken) continue;
      ctx.fillStyle = "#ff5e57";
      roundRectPath(ctx, f.x - 11, f.y - 14, 22, 28, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⛽", f.x, f.y + 1);
    }
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(r + amt, 0, 255);
  g = clamp(g + amt, 0, 255);
  b = clamp(b + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}

function hashLevel(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
