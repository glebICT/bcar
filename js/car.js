// 2D physics car: a rigid chassis + two wheels joined by suspension springs.
// World convention: +y is DOWN, gravity pulls +y.
import { rotate, dot, clamp } from "./physics.js";

export class Car {
  constructor(carDef, stats, paint, terrain, gravity) {
    this.def = carDef;
    this.stats = stats;
    this.paint = paint;
    this.terrain = terrain;
    this.gravity = gravity;

    const halfBase = stats.wheelBase;
    this.bodyW = halfBase * 2 + 26;
    this.bodyH = 34;
    this.wheelR = stats.wheelRadius;
    this.mountY = 16; // suspension mount offset below chassis center
    this.restLen = 16; // suspension rest length

    // Local mount points for rear / front wheels.
    this.mounts = [
      { x: -halfBase, y: this.mountY },
      { x: halfBase, y: this.mountY },
    ];

    // Chassis rigid body.
    const m = stats.mass;
    this.chassis = {
      x: 0, y: 0, vx: 0, vy: 0,
      angle: 0, av: 0,
      mass: m,
      invMass: 1 / m,
      I: (m * (this.bodyW * this.bodyW + this.bodyH * this.bodyH)) / 12,
    };
    this.chassis.invI = 1 / this.chassis.I;

    // Wheels as point masses.
    this.wheels = this.mounts.map(() => ({
      x: 0, y: 0, vx: 0, vy: 0,
      mass: 18, invMass: 1 / 18,
      onGround: false, contactN: { x: 0, y: -1 }, spin: 0,
    }));

    this.crashed = false;
    this.throttle = 0; // -1 brake/reverse .. +1 gas
    this.distance = 0;
    this.maxX = 0;
  }

  reset(x) {
    const groundY = this.terrain.groundY(x);
    this.chassis.x = x;
    this.chassis.y = groundY - (this.mountY + this.restLen + this.wheelR) - 4;
    this.chassis.vx = this.chassis.vy = 0;
    this.chassis.angle = 0;
    this.chassis.av = 0;
    for (let i = 0; i < this.wheels.length; i++) {
      const mountW = this._mountWorld(i);
      this.wheels[i].x = mountW.x;
      this.wheels[i].y = mountW.y + this.restLen;
      this.wheels[i].vx = this.wheels[i].vy = 0;
      this.wheels[i].spin = 0;
    }
    this.crashed = false;
    this.distance = 0;
    this.maxX = x;
  }

  _mountWorld(i) {
    const m = this.mounts[i];
    const r = rotate(m.x, m.y, this.chassis.angle);
    return { x: this.chassis.x + r.x, y: this.chassis.y + r.y, lx: r.x, ly: r.y };
  }

  // Apply an impulse to the chassis at a world offset (rx,ry) from its center.
  _applyChassisImpulse(jx, jy, rx, ry) {
    this.chassis.vx += jx * this.chassis.invMass;
    this.chassis.vy += jy * this.chassis.invMass;
    this.chassis.av += (rx * jy - ry * jx) * this.chassis.invI;
  }

  step(dt) {
    if (this.crashed) {
      // Let the wreck settle but stop driving.
      this._integrate(dt, true);
      return;
    }
    const SUB = 4;
    const h = dt / SUB;
    for (let s = 0; s < SUB; s++) this._substep(h);

    this.maxX = Math.max(this.maxX, this.chassis.x);
    this.distance = Math.max(0, this.maxX - this._startX());
    this._checkCrash();
  }

  _startX() {
    if (this._sx === undefined) this._sx = this.terrain.step * 4; // matches spawn area
    return this._sx;
  }
  setStartX(x) { this._sx = x; }

  _substep(h) {
    const g = this.gravity;
    const c = this.chassis;

    // Gravity on chassis + wheels.
    c.vy += g * h;
    for (const w of this.wheels) w.vy += g * h;

    // Air control: tilt with throttle when no wheel touches ground.
    const airborne = !this.wheels[0].onGround && !this.wheels[1].onGround;
    if (airborne) {
      if (this.throttle !== 0) {
        c.av += -this.throttle * 3.0 * h; // gas -> wheelie back, brake -> nose down
      }
      // Weak self-righting + angular damping so neutral input lands wheels-down.
      let a = c.angle % (Math.PI * 2);
      if (a > Math.PI) a -= Math.PI * 2;
      if (a < -Math.PI) a += Math.PI * 2;
      c.av += -a * 2.4 * h;
      c.av *= 1 - 0.8 * h;
    }

    // Suspension springs connect each wheel to its mount.
    for (let i = 0; i < this.wheels.length; i++) {
      this._suspension(i, h);
    }

    // Wheel/ground collision + drive/traction.
    for (let i = 0; i < this.wheels.length; i++) {
      this._wheelGround(i, h);
    }

    // Chassis corners vs ground (belly scrape / roof crash handled separately).
    this._chassisGround(h);

    this._integrate(h, false);
  }

  _suspension(i, h) {
    const c = this.chassis;
    const w = this.wheels[i];
    const mount = this._mountWorld(i);

    // Suspension axis = chassis "down" direction.
    const axis = rotate(0, 1, c.angle);
    const perp = { x: -axis.y, y: axis.x };

    const dx = w.x - mount.x;
    const dy = w.y - mount.y;
    const along = dot(dx, dy, axis.x, axis.y);
    const side = dot(dx, dy, perp.x, perp.y);

    // Relative velocity at mount (include chassis angular term).
    const mvx = c.vx - c.av * mount.ly;
    const mvy = c.vy + c.av * mount.lx;
    const rvx = w.vx - mvx;
    const rvy = w.vy - mvy;
    const relAlong = dot(rvx, rvy, axis.x, axis.y);
    const relSide = dot(rvx, rvy, perp.x, perp.y);

    const k = this.stats.suspension;
    const damp = 900;

    // Spring force keeps wheel near rest length along the axis.
    const fAlong = -k * (along - this.restLen) - damp * relAlong;
    // Stiff lateral constraint keeps the wheel tracking under its mount.
    const fSide = -k * 2.2 * side - damp * 1.3 * relSide;

    const fx = axis.x * fAlong + perp.x * fSide;
    const fy = axis.y * fAlong + perp.y * fSide;

    // Apply to wheel, equal & opposite to chassis at the mount.
    w.vx += fx * w.invMass * h;
    w.vy += fy * w.invMass * h;
    this._applyChassisImpulse(-fx * h, -fy * h, mount.lx, mount.ly);
  }

  _wheelGround(i, h) {
    const w = this.wheels[i];
    const terr = this.terrain;
    const groundY = terr.groundY(w.x);
    const pen = w.y + this.wheelR - groundY;

    // Grounded within a tolerance band so contact (and drive) stays stable
    // even when position correction nudges the wheel just clear of the surface.
    const tol = this.wheelR * 0.35;
    if (pen <= -tol) {
      w.onGround = false;
      return;
    }
    w.onGround = true;
    const n = terr.normal(w.x);
    w.contactN = n;

    if (pen > 0) {
      // Position correction (push wheel out along normal) only when sunk in.
      const corr = Math.min(pen, 12);
      w.x += n.x * corr;
      w.y += n.y * corr;

      // Cancel velocity into the ground (no bounce).
      const vn = dot(w.vx, w.vy, n.x, n.y);
      if (vn < 0) {
        w.vx -= n.x * vn;
        w.vy -= n.y * vn;
      }
    }

    // Tangent pointing "forward" (positive world x).
    let tx = -n.y, ty = n.x;
    if (tx < 0) { tx = -tx; ty = -ty; }

    const normalForce = this.stats.mass * this.gravity; // rough load estimate
    const maxTraction = this.stats.grip * normalForce * 0.9;

    // Drive: rear-wheel by default, both if 4wd.
    const driven = this.stats.drive4wd || i === 0;
    if (driven && this.throttle !== 0 && !this.crashed) {
      let force = this.stats.enginePower * this.throttle;
      force = clamp(force, -maxTraction, maxTraction);
      // 4wd splits drive across both wheels.
      if (this.stats.drive4wd) force *= 0.5;
      // Only part of the drive goes through the wheel contact (which levers the
      // chassis into a wheelie); the rest is applied to the chassis CG as pure
      // thrust so flooring it doesn't instantly backflip the car.
      const wheelShare = 0.4;
      w.vx += tx * force * wheelShare * w.invMass * h;
      w.vy += ty * force * wheelShare * w.invMass * h;
      const c = this.chassis;
      c.vx += tx * force * (1 - wheelShare) * c.invMass * h;
      c.vy += ty * force * (1 - wheelShare) * c.invMass * h;
    }

    // Rolling resistance + tangential grip damping (prevents endless sliding).
    const vt = dot(w.vx, w.vy, tx, ty);
    const rollDamp = this.throttle === 0 ? 0.6 : 0.08;
    w.vx -= tx * vt * rollDamp * h;
    w.vy -= ty * vt * rollDamp * h;

    w.spin += vt * h * 0.12;
  }

  _chassisGround(h) {
    const c = this.chassis;
    const hw = this.bodyW / 2;
    const hh = this.bodyH / 2;
    const corners = [
      { x: -hw, y: hh }, { x: hw, y: hh }, // bottom
      { x: -hw, y: -hh }, { x: hw, y: -hh }, // top
    ];
    for (const corner of corners) {
      const r = rotate(corner.x, corner.y, c.angle);
      const wx = c.x + r.x;
      const wy = c.y + r.y;
      const groundY = this.terrain.groundY(wx);
      const pen = wy - groundY;
      if (pen <= 0) continue;
      const n = this.terrain.normal(wx);

      // Position correction.
      c.x += n.x * Math.min(pen, 8);
      c.y += n.y * Math.min(pen, 8);

      // Velocity at the contact point.
      const cvx = c.vx - c.av * r.y;
      const cvy = c.vy + c.av * r.x;
      const vn = dot(cvx, cvy, n.x, n.y);
      if (vn < 0) {
        const j = -vn * 0.8;
        this._applyChassisImpulse(n.x * j * c.mass, n.y * j * c.mass, r.x, r.y);
        // Friction to scrub speed when the body drags.
        c.vx *= 0.985;
        c.av *= 0.96;
      }
    }
  }

  _integrate(h, settleOnly) {
    const c = this.chassis;
    // Light quadratic air drag bounds top speed without killing coasting.
    const AIR = 0.0015;
    c.vx -= AIR * c.vx * Math.abs(c.vx) * h;
    c.av = clamp(c.av, -7, 7);
    c.vx = clamp(c.vx, -2600, 2600);
    c.vy = clamp(c.vy, -2600, 2600);
    c.x += c.vx * h;
    c.y += c.vy * h;
    c.angle += c.av * h;
    for (const w of this.wheels) {
      w.vx = clamp(w.vx, -2600, 2600);
      w.vy = clamp(w.vy, -2600, 2600);
      w.x += w.vx * h;
      w.y += w.vy * h;
    }
  }

  _checkCrash() {
    if (this.crashed) return;
    const c = this.chassis;
    // Only a genuine flip is fatal: the chassis must be substantially inverted
    // AND its roof must be touching the ground. Hard/bumpy landings on the
    // wheels or side never crash.
    let a = c.angle % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    if (Math.abs(a) < 2.5) return; // < ~143deg from upright: still recoverable

    const roof = rotate(0, -(this.bodyH / 2 + 8), c.angle);
    const rx = c.x + roof.x;
    const ry = c.y + roof.y;
    const groundY = this.terrain.groundY(rx);
    if (ry > groundY - 4) {
      this.crashed = true;
    }
  }

  get speed() {
    return Math.hypot(this.chassis.vx, this.chassis.vy);
  }
}
