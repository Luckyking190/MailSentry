"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";

import { countryFlag, countryName } from "@/lib/geo";

export type OriginPoint = {
  lat: number;
  lon: number;
  city: string | null;
  country: string | null;
  count: number;
};

/**
 * Aggregate origin map for the whole mailbox — one marker per distinct
 * originating location, area proportional to how much mail came from it.
 *
 * Distinct from GeoMap, which traces the hop path of a single message: there
 * is no route to draw here, and markers have to encode volume instead.
 */
export function OriginMap({ points }: { points: OriginPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg bg-surface-2 px-6 text-center text-xs text-muted">
        No origin coordinates yet — they are resolved from each message&apos;s
        earliest trusted mail server during a scan.
      </div>
    );
  }

  const max = Math.max(...points.map((p) => p.count));

  // Area, not radius, tracks volume — scaling the radius linearly would make a
  // 4x busier origin look 16x bigger.
  const radiusFor = (count: number) => 5 + 11 * Math.sqrt(count / max);

  return (
    <div className="h-72 overflow-hidden rounded-lg">
      <MapContainer
        center={[20, 10]}
        zoom={1}
        minZoom={1}
        worldCopyJump
        className="h-full w-full"
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => (
          <CircleMarker
            key={`${p.lat},${p.lon},${p.city ?? ""}`}
            center={[p.lat, p.lon]}
            radius={radiusFor(p.count)}
            pathOptions={{
              color: "#6366f1",
              fillColor: "#6366f1",
              fillOpacity: 0.55,
              weight: 1.5,
            }}
          >
            <Tooltip direction="top">
              <strong>
                {countryFlag(p.country)}{" "}
                {[p.city, countryName(p.country)].filter(Boolean).join(", ")}
              </strong>
              <br />
              {p.count} {p.count === 1 ? "email" : "emails"}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
