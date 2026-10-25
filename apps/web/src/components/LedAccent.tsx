import { useEffect, useId, useRef } from 'react';
import {
  ledCells,
  ledPaths,
  ledSeed,
  ledWrap,
  type LedCell,
  type LedPath,
  type LedVariant,
} from './led-paths';

type Props = {
  frame?: boolean;
  variant?: LedVariant;
  seed?: string;
  side?: 'blue' | 'pink';
  captureKey?: number;
  impactDelayMs?: number;
};

/** Presentation-only: independent clocks and bounded paths; never changes application state. */
export function LedAccent({
  frame = false,
  variant = frame ? 'home' : 'header',
  seed,
  side,
  captureKey = 0,
  impactDelayMs = 0,
}: Props) {
  const id = useId();
  const identity = seed ?? variant + ':' + id;
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);
  const signal = useRef({ side, captureKey, impactDelayMs });
  useEffect(() => {
    signal.current = { side, captureKey, impactDelayMs };
  }, [side, captureKey, impactDelayMs]);

  useEffect(() => {
    const host = hostRef.current,
      canvas = canvasRef.current;
    if (!host || !canvas) return;
    const context = canvas.getContext('2d');
    if (!context) {
      host.dataset.ledFallback = 'true';
      return;
    }
    delete host.dataset.ledFallback;
    const instancePhase = ledSeed(identity);
    let width = 0,
      height = 0;
    let cells: LedCell[] = [],
      paths: LedPath[] = [];
    let colors: number[][] = [],
      coreColor = '';
    let brightness = 0.8,
      lap = 6,
      phase = 0,
      direction = 1,
      tailLength = 0.22,
      stroke = 2;
    let raf = 0,
      previousTime: number | null = null,
      onScreen = true,
      disposed = false;
    let lastCapture = signal.current.captureKey,
      impactAt = -Infinity;
    let impactSide = signal.current.side;
    let hovered = false,
      focused = false,
      energy = 0;
    const region = host.parentElement;
    const hoverIn = () => {
      hovered = true;
    };
    const hoverOut = () => {
      hovered = false;
    };
    const focusIn = () => {
      focused = true;
    };
    const focusOut = (event: FocusEvent) => {
      focused = event.relatedTarget instanceof Node && Boolean(region?.contains(event.relatedTarget));
    };
    const active = () => onScreen && !document.hidden && !disposed && cells.length > 0;

    function paint() {
      if (!context) return;
      const current = signal.current;
      if (current.captureKey && current.captureKey !== lastCapture) {
        impactAt = clock.current + current.impactDelayMs / 1000;
        impactSide = current.side;
      }
      lastCapture = current.captureKey;
      const age = clock.current - impactAt;
      const impact = age >= 0 && age < 0.7 ? 1 - age / 0.7 : 0;
      context.clearRect(0, 0, width, height);
      context.lineCap = 'round';
      energy += ((hovered || focused ? 1 : 0) - energy) * 0.08;
      const time = clock.current / lap;
      for (const cell of cells) {
        const path = paths[cell.path];
        if (!path) continue;
        const localDirection = variant === 'replay' && cell.lane === 1 ? -direction : direction;
        const head = ledWrap(time * localDirection + phase + path.offset);
        const distance = ledWrap((head - cell.position) * localDirection);
        let tail = distance < tailLength ? (1 - distance / tailLength) ** 2 : 0;
        // Corner charge is local, never a flashing full-frame border.
        if (variant === 'home')
          tail = Math.max(
            tail,
            Math.max(0, 1 - Math.abs(head - 0.88) / 0.12) * Math.pow(cell.position, 4) * 0.65,
          );
        const core = distance < 0.035 ? 1 - distance / 0.035 : 0;
        const laneColor = colors[cell.lane % 2];
        if (!laneColor) continue;
        const otherColor = colors[(cell.lane + 1) % 2] ?? laneColor;
        const mix =
          variant === 'header'
            ? 0.25 + 0.2 * Math.sin(cell.position * 5 - time)
            : Math.min(0.24, distance) * tail;
        const rgb = laneColor
          .map((value, i) => Math.round(value + ((otherColor[i] ?? value) - value) * mix))
          .join(',');
        let strength = Math.min(1, brightness * (1 + energy * 0.25));
        if (variant === 'replay' && current.side)
          strength *= (cell.lane === 0 ? 'blue' : 'pink') === current.side ? 1 : 0.35;
        const ripple = impact * Math.max(0, 1 - Math.abs(cell.position - age / 0.7) / 0.16);
        const liveColor = ripple > 0 ? (colors[impactSide === 'pink' ? 1 : 0]?.join(',') ?? rgb) : rgb;
        context.beginPath();
        context.moveTo(...cell.start);
        context.lineTo(...cell.end);
        context.lineWidth = stroke * 3;
        context.strokeStyle =
          'rgba(' + liveColor + ',' + Math.min(1, tail * strength * 0.18 + ripple * 0.24) + ')';
        context.stroke();
        context.lineWidth = stroke;
        context.strokeStyle =
          'rgba(' + liveColor + ',' + Math.min(1, (0.09 + tail * 0.91) * strength + ripple * 0.8) + ')';
        context.stroke();
        if (core > 0 || ripple > 0.2) {
          context.lineWidth = Math.max(1, stroke * 0.5);
          context.strokeStyle = 'rgba(' + coreColor + ',' + Math.min(1, core * strength + ripple * 0.5) + ')';
          context.stroke();
        }
      }
    }
    function tick(time: number) {
      raf = 0;
      if (!active()) {
        previousTime = null;
        return;
      }
      if (previousTime !== null) clock.current += Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      paint();
      raf = requestAnimationFrame(tick);
    }
    function sync() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      previousTime = null;
      if (active()) raf = requestAnimationFrame(tick);
    }
    function resize() {
      if (!host || !canvas || !context) return;
      const bounds = host.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      if (width < 8 || height < 2) {
        cells = [];
        sync();
        return;
      }
      const style = getComputedStyle(host);
      const number = (key: string, fallback: number) => {
        const value = parseFloat(style.getPropertyValue(key));
        return Number.isFinite(value) ? value : fallback;
      };
      colors = ['--led-a', '--led-b'].map((key) =>
        style.getPropertyValue(key).trim().split(/\s+/).map(Number),
      );
      coreColor = style.getPropertyValue('--led-core').trim().split(/\s+/).join(',');
      brightness = number('--led-brightness', 0.8);
      lap = Math.max(2, number('--led-lap-seconds', 6)) * (0.9 + instancePhase * 0.2);
      phase = number('--led-phase', 0) + instancePhase;
      direction = number('--led-direction', 1) < 0 ? -1 : 1;
      tailLength = Math.min(0.6, Math.max(0.05, number('--led-tail', 0.22)));
      stroke = Math.min(3, Math.max(1, number('--led-stroke', 2)));
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      paths = ledPaths(variant, width, height, parseFloat(style.borderTopLeftRadius) || 16);
      cells = ledCells(paths, Math.max(4, number('--led-cell-gap', 8)));
      paint();
      sync();
    }
    resize();
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(host);
    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            if (!entry) return;
            onScreen = entry.isIntersecting;
            sync();
          })
        : null;
    observer?.observe(host);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('resize', resize);
    region?.addEventListener('pointerenter', hoverIn);
    region?.addEventListener('pointerleave', hoverOut);
    region?.addEventListener('focusin', focusIn);
    region?.addEventListener('focusout', focusOut);
    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('resize', resize);
      region?.removeEventListener('pointerenter', hoverIn);
      region?.removeEventListener('pointerleave', hoverOut);
      region?.removeEventListener('focusin', focusIn);
      region?.removeEventListener('focusout', focusOut);
    };
  }, [variant, identity]);

  return (
    <div
      ref={hostRef}
      className={'led-accent ' + (frame ? 'led-accent--frame' : 'led-accent--line')}
      data-led-variant={variant}
      data-led-instance={identity}
      data-led-motion="running"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="led-canvas" />
    </div>
  );
}
