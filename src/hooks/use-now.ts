"use client";

import { useState } from "react";

/** Istante di riferimento stabile per il render (evita Date.now() impuro durante il render). */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
