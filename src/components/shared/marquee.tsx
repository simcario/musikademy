"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Testo su una riga: se supera lo spazio disponibile scorre avanti e indietro (marquee), altrimenti
 * resta fermo. Con "riduci movimento" attivo resta fermo e tagliato. Il testo completo è nel `title`.
 */
export function Marquee({ children, className }: { children: string; className?: string }) {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => setShift(Math.max(0, Math.ceil(i.scrollWidth - o.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    return () => ro.disconnect();
  }, [children]);

  return (
    <span ref={outer} title={children} className={cn("block overflow-hidden whitespace-nowrap", className)}>
      <span
        ref={inner}
        className={cn("inline-block", shift > 0 && "marquee")}
        style={
          shift > 0
            ? ({
                "--marquee-shift": `-${shift}px`,
                // Circa 30 px al secondo, con una pausa ai due estremi.
                "--marquee-duration": `${Math.max(4, shift / 30 + 3)}s`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {children}
      </span>
    </span>
  );
}