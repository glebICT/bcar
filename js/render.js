// Vector car art, shared between the gameplay world and the garage preview.
import { rotate } from "./physics.js";

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

// Draw a wheel centered at (0,0) in current transform.
function drawWheel(ctx, radius, spin) {
  ctx.save();
  ctx.rotate(spin);
  ctx.fillStyle = "#1a1a20";
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a3a45";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6a6a78";
  ctx.lineWidth = Math.max(2, radius * 0.12);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * radius * 0.5, Math.sin(a) * radius * 0.5);
    ctx.stroke();
  }
  ctx.fillStyle = "#888";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Draw just the car body in local space (origin at chassis center).
function drawBody(ctx, shape, paint, bodyW, bodyH) {
  const hw = bodyW / 2;
  const dark = shade(paint, -45);
  const light = shade(paint, 50);

  ctx.lineJoin = "round";

  if (shape === "sports") {
    // Low, sleek wedge.
    ctx.fillStyle = paint;
    ctx.beginPath();
    ctx.moveTo(-hw, 6);
    ctx.lineTo(-hw + 12, -bodyH * 0.5);
    ctx.lineTo(hw - 26, -bodyH * 0.5);
    ctx.lineTo(hw - 10, -2);
    ctx.lineTo(hw, 8);
    ctx.lineTo(-hw, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#bfe3ff";
    ctx.beginPath();
    ctx.moveTo(-hw + 18, -bodyH * 0.45);
    ctx.lineTo(hw - 30, -bodyH * 0.45);
    ctx.lineTo(hw - 22, -4);
    ctx.lineTo(-hw + 12, -4);
    ctx.closePath();
    ctx.fill();
  } else if (shape === "truck") {
    // Tall cab + big body.
    ctx.fillStyle = paint;
    roundRect(ctx, -hw, -bodyH * 0.4, bodyW, bodyH, 8);
    ctx.fill();
    ctx.fillStyle = dark;
    roundRect(ctx, -hw + 4, 2, bodyW - 8, bodyH * 0.5, 6);
    ctx.fill();
    ctx.fillStyle = light;
    roundRect(ctx, hw - bodyW * 0.42, -bodyH * 0.75, bodyW * 0.4, bodyH * 0.5, 6);
    ctx.fill();
    ctx.fillStyle = "#bfe3ff";
    roundRect(ctx, hw - bodyW * 0.36, -bodyH * 0.68, bodyW * 0.3, bodyH * 0.32, 4);
    ctx.fill();
  } else if (shape === "buggy") {
    // Open-frame buggy with roll cage.
    ctx.fillStyle = paint;
    roundRect(ctx, -hw, -4, bodyW, bodyH * 0.8, 8);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-hw + 8, -2);
    ctx.lineTo(-hw + 20, -bodyH * 0.7);
    ctx.lineTo(hw - 24, -bodyH * 0.7);
    ctx.lineTo(hw - 8, -2);
    ctx.stroke();
    ctx.fillStyle = light;
    roundRect(ctx, -hw + 6, 0, bodyW - 12, bodyH * 0.4, 5);
    ctx.fill();
  } else {
    // Default: jeep — boxy with a cabin + window.
    ctx.fillStyle = paint;
    roundRect(ctx, -hw, -bodyH * 0.25, bodyW, bodyH, 8);
    ctx.fill();
    ctx.fillStyle = light;
    roundRect(ctx, -hw + bodyW * 0.12, -bodyH * 0.7, bodyW * 0.6, bodyH * 0.55, 7);
    ctx.fill();
    ctx.fillStyle = "#bfe3ff";
    roundRect(ctx, -hw + bodyW * 0.18, -bodyH * 0.62, bodyW * 0.48, bodyH * 0.4, 4);
    ctx.fill();
    ctx.fillStyle = dark;
    roundRect(ctx, -hw, bodyH * 0.45, bodyW, bodyH * 0.3, 5);
    ctx.fill();
  }

  // Headlight.
  ctx.fillStyle = "#fff6c2";
  ctx.beginPath();
  ctx.arc(hw - 4, 2, 4, 0, Math.PI * 2);
  ctx.fill();
}

// Full car (body + wheels). `getWheel(i)` returns {dx,dy,spin} relative to center
// when rendering the live physics car; for the garage we synthesize fixed mounts.
export function drawCar(ctx, car, opts = {}) {
  const { x = 0, y = 0, angle = 0, scale = 1 } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Soft shadow.
  ctx.save();
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(0, car.mountY + car.restLen + car.wheelR - 2, car.bodyW * 0.55, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Wheels (drawn in chassis frame at their suspension positions).
  ctx.save();
  ctx.rotate(angle);
  for (let i = 0; i < car.mounts.length; i++) {
    const m = car.mounts[i];
    const wheel = car.wheels[i];
    let wx, wy, spin;
    if (opts.live) {
      // Convert world wheel pos into chassis-local frame.
      const rel = rotate(wheel.x - car.chassis.x, wheel.y - car.chassis.y, -angle);
      wx = rel.x; wy = rel.y; spin = wheel.spin;
    } else {
      wx = m.x; wy = m.y + car.restLen; spin = opts.spin || 0;
    }
    ctx.save();
    ctx.translate(wx, wy);
    drawWheel(ctx, car.wheelR, spin);
    ctx.restore();
  }
  drawBody(ctx, car.def.shape, car.paint, car.bodyW, car.bodyH);
  ctx.restore();

  ctx.restore();
}
