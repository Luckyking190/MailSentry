"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";

export type GeoPoint = {
  hopIndex: number;
  ip: string;
  lat: number;
  lon: number;
  city: string | null;
  country: string | null;
  org: string | null;
  isTrustedOrigin: boolean;
};

export function GeoMap({ points }: { points: GeoPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg bg-surface-2 text-xs text-muted">
        No geolocatable hops for this message.
      </div>
    );
  }

  const center: [number, number] =
    points.length === 1
      ? [points[0].lat, points[0].lon]
      : [
          points.reduce((s, p) => s + p.lat, 0) / points.length,
          points.reduce((s, p) => s + p.lon, 0) / points.length,
        ];

  const path = [...points].reverse().map((p) => [p.lat, p.lon] as [number, number]);

  return (
    <div className="h-72 overflow-hidden rounded-lg">
      <MapContainer
        center={center}
        zoom={points.length > 1 ? 2 : 4}
        className="h-full w-full"
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {path.length > 1 && (
          <Polyline positions={path} pathOptions={{ color: "#6366f1", weight: 2, dashArray: "4 4" }} />
        )}
        {points.map((p) => (
          <CircleMarker
            key={p.hopIndex}
            center={[p.lat, p.lon]}
            radius={p.isTrustedOrigin ? 9 : 6}
            pathOptions={{
              color: p.isTrustedOrigin ? "#f43f5e" : "#6366f1",
              fillColor: p.isTrustedOrigin ? "#f43f5e" : "#6366f1",
              fillOpacity: 0.85,
              weight: 2,
            }}
          >
            <Tooltip direction="top">
              <span className="font-mono">{p.ip}</span>
              <br />
              {[p.city, p.country].filter(Boolean).join(", ") || "Unknown location"}
              {p.org && (
                <>
                  <br />
                  {p.org}
                </>
              )}
              {p.isTrustedOrigin && (
                <>
                  <br />
                  <strong>Originating server</strong>
                </>
              )}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
