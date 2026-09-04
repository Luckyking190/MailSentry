"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { BandThresholds } from "@/lib/scoring";

export type DetectorMeta = { id: string; label: string; defaultWeight: number };

export type SettingsFormValue = {
  scanWindowDays: number;
  maxEmails: number;
  enableLlm: boolean;
  llmModel: string | null;
  bandThresholds: BandThresholds;
  detectorWeights: Record<string, number>;
  brandWatchlist: string[];
};

export function SettingsForm({
  initial,
  detectors,
  featherlessConfigured,
}: {
  initial: SettingsFormValue;
  detectors: DetectorMeta[];
  featherlessConfigured: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<SettingsFormValue>(initial);
  const [watchlistInput, setWatchlistInput] = useState(initial.brandWatchlist.join(", "));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  function weight(id: string, fallback: number): number {
    return value.detectorWeights[id] ?? fallback;
  }

  function setWeight(id: string, w: number) {
    setValue((v) => ({ ...v, detectorWeights: { ...v.detectorWeights, [id]: w } }));
  }

  async function save() {
    setSaving(true);
    setSaved(null);
    const brandWatchlist = watchlistInput
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const payload: SettingsFormValue = { ...value, brandWatchlist };
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSaved("Saved.");
        router.refresh();
      } else {
        setSaved("Failed to save.");
      }
    } catch {
      setSaved("Lost connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Scan</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Look-back window (days)">
            <input
              type="number"
              min={1}
              max={365}
              value={value.scanWindowDays}
              onChange={(e) =>
                setValue((v) => ({ ...v, scanWindowDays: Number(e.target.value) }))
              }
              className="input"
            />
          </Field>
          <Field label="Max emails per scan">
            <input
              type="number"
              min={10}
              max={2000}
              value={value.maxEmails}
              onChange={(e) => setValue((v) => ({ ...v, maxEmails: Number(e.target.value) }))}
              className="input"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI analysis (Featherless)</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {!featherlessConfigured && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-amber-500/30">
              No FEATHERLESS_API_KEY configured on the server — AI detectors
              stay off regardless of this toggle.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.enableLlm}
              onChange={(e) => setValue((v) => ({ ...v, enableLlm: e.target.checked }))}
              className="h-4 w-4 rounded border-border accent-brand"
            />
            Enable content / BEC / social-engineering analysis
          </label>
          <Field label="Model override (optional)">
            <input
              type="text"
              placeholder="e.g. Qwen/Qwen2.5-72B-Instruct"
              value={value.llmModel ?? ""}
              onChange={(e) =>
                setValue((v) => ({ ...v, llmModel: e.target.value || null }))
              }
              className="input"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risk bands</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-4">
          {(["low", "medium", "high", "critical"] as const).map((k) => (
            <Field key={k} label={`${k[0].toUpperCase()}${k.slice(1)} ≥`}>
              <input
                type="number"
                min={0}
                max={100}
                value={value.bandThresholds[k]}
                onChange={(e) =>
                  setValue((v) => ({
                    ...v,
                    bandThresholds: { ...v.bandThresholds, [k]: Number(e.target.value) },
                  }))
                }
                className="input"
              />
            </Field>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detector weights</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {detectors.map((d) => {
            const w = weight(d.id, d.defaultWeight);
            return (
              <div key={d.id} className="flex items-center gap-3">
                <span className="w-48 shrink-0 truncate text-sm">{d.label}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={w}
                  onChange={(e) => setWeight(d.id, Number(e.target.value))}
                  className="h-1.5 flex-1 accent-brand"
                />
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">
                  {w.toFixed(2)}
                </span>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brand watchlist</CardTitle>
        </CardHeader>
        <CardBody>
          <Field label="Extra terms to flag in lookalike domains (comma-separated)">
            <input
              type="text"
              value={watchlistInput}
              onChange={(e) => setWatchlistInput(e.target.value)}
              placeholder="acmecorp, acme-bank"
              className="input"
            />
          </Field>
        </CardBody>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {saved && <span className="text-xs text-muted">{saved}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}
