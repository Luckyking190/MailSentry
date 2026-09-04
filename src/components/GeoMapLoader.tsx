"use client";

import dynamic from "next/dynamic";
import type { GeoPoint } from "./GeoMap";

const GeoMap = dynamic(() => import("./GeoMap").then((m) => m.GeoMap), {
  ssr: false,
  loading: () => (
    <div className="h-72 animate-pulse rounded-lg bg-surface-2" />
  ),
});

export function GeoMapLoader({ points }: { points: GeoPoint[] }) {
  return <GeoMap points={points} />;
}
