"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#4f46e5", "#712ae2", "#047857", "#f59e0b", "#ec4899", "#0ea5e9"];
const DURATION_MS = 1800;
const PIECES = 90;

/** Coriandoli per la risposta corretta: riempiono il contenitore (che deve essere `relative`). */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const { width, height } = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const pieces = Array.from({ length: PIECES }, (_, i) => ({
      x: width / 2,
      y: height * 0.4,
      vx: (Math.random() - 0.5) * 16,
      vy: -4 - Math.random() * 12,
      size: 5 + Math.random() * 6,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.4,
      color: COLORS[i % COLORS.length],
    }));

    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const t = (now - start) / DURATION_MS;
      ctx.clearRect(0, 0, width, height);
      if (t >= 1) return;
      ctx.globalAlpha = Math.min(1, (1 - t) / 0.4);
      for (const p of pieces) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 size-full" />;
}
