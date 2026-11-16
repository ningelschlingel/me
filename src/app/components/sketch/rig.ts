import { Injectable, inject } from '@angular/core';
import { Viewport } from '../../layout';

/** How far the camera may lean, radians. Small: the scenes should breathe, not swing. */
const LEAN = { yaw: 0.28, pitch: 0.14 };
/** Time constant of the follow curve. */
const LAG_MS = 420;

/**
 * One camera offset shared by every sketch. With a mouse, all scenes lean slightly
 * towards the pointer (smoothed). Without one, they all follow the same slow,
 * aimless joggle, so the page moves as one.
 */
@Injectable({ providedIn: 'root' })
export class CameraRig {
  private readonly fine = inject(Viewport).fine;
  private target = { yaw: 0, pitch: 0 };
  private now = { yaw: 0, pitch: 0 };
  private at = 0;

  constructor() {
    if (!this.fine || typeof window === 'undefined') return;
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        this.target = {
          yaw: (e.clientX / window.innerWidth - 0.5) * 2 * LEAN.yaw,
          pitch: (e.clientY / window.innerHeight - 0.5) * 2 * LEAN.pitch,
        };
      },
      { passive: true },
    );
  }

  /** Offset for this frame. Cheap to call from several sketches in the same frame. */
  offset(time: number, calm: boolean) {
    if (time === this.at) return this.now;
    const dt = Math.min(64, Math.max(0, time - this.at));
    this.at = time;
    if (!this.fine) {
      // A few slow, incommensurate sines: smooth, never repeating in an obvious way.
      const s = time / 1000;
      const k = calm ? 0.4 : 1;
      this.now = {
        yaw: k * (0.16 * Math.sin(s * 0.31) + 0.07 * Math.sin(s * 0.77 + 1.3)),
        pitch: k * (0.07 * Math.sin(s * 0.23 + 0.4) + 0.03 * Math.sin(s * 0.61 + 2.1)),
      };
      return this.now;
    }
    const target = calm ? { yaw: this.target.yaw * 0.4, pitch: this.target.pitch * 0.4 } : this.target;
    const k = 1 - Math.exp(-dt / LAG_MS);
    this.now = {
      yaw: this.now.yaw + (target.yaw - this.now.yaw) * k,
      pitch: this.now.pitch + (target.pitch - this.now.pitch) * k,
    };
    return this.now;
  }
}
