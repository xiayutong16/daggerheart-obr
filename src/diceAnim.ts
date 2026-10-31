// Canvas dice animation used in the popover: dice tumble down, bounce, and settle
// on their final faces. Everything is drawn with 2D canvas so nothing has to be
// bundled as an asset.

export interface AnimDie {
  value: number;
  sides: number;
  color: string;
  /** Optional caption drawn under the die (e.g. "希望"). */
  caption?: string;
}

interface DieState {
  die: AnimDie;
  x: number;
  spin: number;
  phase: number;
  shown: number;
}

const BOUNCES = [
  { up: 0.16, height: 0.34 },
  { up: 0.10, height: 0.11 },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(s, 16);
  if (Number.isNaN(n)) return [139, 124, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, target: number, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const to = (c: number) => Math.round(c + (target - c) * amount);
  return `rgb(${to(r)},${to(g)},${to(b)})`;
}

function roundPolygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / sides;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    if (i === 0) ctx.moveTo((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    else ctx.lineTo((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
}

function drawDie(
  ctx: CanvasRenderingContext2D,
  s: DieState,
  cx: number,
  cy: number,
  r: number,
  angle: number,
  value: number,
  shadowY: number,
) {
  const color = s.die.color;

  // ground shadow, softer the higher the die is
  const drop = Math.max(0, shadowY - cy);
  const k = Math.max(0.15, 1 - drop / (r * 3));
  ctx.save();
  ctx.globalAlpha = 0.35 * k;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, shadowY, r * 0.85 * k, r * 0.22 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // body
  roundPolygon(ctx, 0, 0, r, 6);
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, mix(color, 255, 0.38));
  g.addColorStop(0.55, color);
  g.addColorStop(1, mix(color, 0, 0.42));
  ctx.fillStyle = g;
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 0.5;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.4, r * 0.075);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.stroke();

  // faceted inner lines (a nod to a d20/d12 facet)
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, r * 0.045);
  ctx.beginPath();
  for (let i = 0; i < 6; i += 2) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // highlight
  ctx.beginPath();
  ctx.ellipse(-r * 0.28, -r * 0.36, r * 0.34, r * 0.19, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();

  // number
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.round(r * 0.95)}px ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = r * 0.2;
  ctx.fillText(String(value), 0, r * 0.04);
  ctx.restore();
}

/** Piecewise bounce: 0 = on the floor, 1 = top of the drop. */
function bounceHeight(t: number): number {
  const first = 0.42; // fall
  if (t < first) {
    const u = t / first;
    return 1 - u * u;
  }
  let cursor = first;
  let level = 0;
  for (const b of BOUNCES) {
    const up = b.up;
    if (t < cursor + up) {
      const u = (t - cursor) / up;
      return b.height * (1 - (1 - u) * (1 - u));
    }
    cursor += up;
    if (t < cursor + up) {
      const u = (t - cursor) / up;
      return b.height * (1 - u * u);
    }
    cursor += up;
    level = 0;
  }
  return level;
}

export function animateDice(
  canvas: HTMLCanvasElement,
  dice: AnimDie[],
  opts: { duration?: number; onBounce?: () => void } = {},
): Promise<void> {
  const duration = opts.duration ?? 900;
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  return new Promise<void>((resolve) => {
    const width = canvas.clientWidth || 400;
    const height = canvas.clientHeight || 132;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve();
      return;
    }
    ctx.scale(dpr, dpr);

    const floorY = height - 20;
    const r = Math.min(34, (width / Math.max(1, dice.length)) * 0.26);
    const gap = width / (dice.length + 1);
    const states: DieState[] = dice.map((d, i) => ({
      die: d,
      x: gap * (i + 1),
      spin: (Math.random() > 0.5 ? 1 : -1) * (1.6 + Math.random() * 1.4),
      phase: Math.random() * Math.PI,
      shown: d.value,
    }));

    let bounced = 0;
    const start = performance.now();

    const frame = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / duration);
      ctx.clearRect(0, 0, width, height);

      // landing moments → sound + a little squash
      const marks = [0.42, 0.58, 0.78];
      while (bounced < marks.length && t >= marks[bounced]) {
        bounced++;
        opts.onBounce?.();
      }

      for (const s of states) {
        const h = bounceHeight(t);
        const lift = h * (floorY - r - 8);
        const cy = floorY - r - lift;
        const settling = t > 0.8;
        const angle = s.spin * Math.PI * 2 * Math.pow(1 - t, 2.4);
        if (!settling) {
          const wobble = Math.sin(t * 40 + s.phase);
          s.shown = Math.max(1, Math.min(s.die.sides, Math.round(1 + Math.abs(wobble) * (s.die.sides - 1))));
        } else {
          s.shown = s.die.value;
        }
        const squash = h < 0.02 ? 1 + (1 - t) * 0.08 : 1;
        drawDie(ctx, s, s.x, cy, r * squash, angle, settling ? s.die.value : s.shown, floorY);
      }

      if (t < 1 && canvas.isConnected) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(frame);
  });
}
