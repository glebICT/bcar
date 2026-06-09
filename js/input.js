// Keyboard + touch input. Exposes throttle in [-1, 1].
export class Input {
  constructor() {
    this.gas = false;
    this.brake = false;
    this._bind();
  }

  _bind() {
    const down = (e) => this._set(e.key, true);
    const up = (e) => this._set(e.key, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    const bindBtn = (id, prop) => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = (e) => { e.preventDefault(); this[prop] = true; };
      const off = (e) => { e.preventDefault(); this[prop] = false; };
      el.addEventListener("touchstart", on, { passive: false });
      el.addEventListener("touchend", off);
      el.addEventListener("touchcancel", off);
      el.addEventListener("mousedown", on);
      el.addEventListener("mouseup", off);
      el.addEventListener("mouseleave", off);
    };
    bindBtn("touch-gas", "gas");
    bindBtn("touch-brake", "brake");
  }

  _set(key, val) {
    switch (key) {
      case "ArrowRight":
      case "d":
      case "D":
        this.gas = val;
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        this.brake = val;
        break;
    }
  }

  get throttle() {
    return (this.gas ? 1 : 0) - (this.brake ? 1 : 0);
  }

  release() {
    this.gas = this.brake = false;
  }
}
