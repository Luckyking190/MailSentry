import { SIGNAL_CATEGORIES, CATEGORY_LABEL, BAND_ORDER, BAND_META } from "@/lib/scoring";

export type FilterValues = {
  q?: string;
  domain?: string;
  category?: string;
  band?: string;
  since?: string;
};

const SINCE_OPTIONS = [
  { value: "", label: "All time" },
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

export function Filters({ values, action }: { values: FilterValues; action: string }) {
  return (
    <form
      method="get"
      action={action}
      className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3"
    >
      <FormField label="Search">
        <input
          type="text"
          name="q"
          defaultValue={values.q}
          placeholder="subject or body…"
          className="input"
        />
      </FormField>

      <FormField label="Sender domain">
        <input
          type="text"
          name="domain"
          defaultValue={values.domain}
          placeholder="example.com"
          className="input"
        />
      </FormField>

      <FormField label="Category">
        <select name="category" defaultValue={values.category ?? ""} className="input">
          <option value="">Any</option>
          {SIGNAL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Risk band">
        <select name="band" defaultValue={values.band ?? ""} className="input">
          <option value="">Any</option>
          {BAND_ORDER.map((b) => (
            <option key={b} value={b}>
              {BAND_META[b].label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Time range">
        <select name="since" defaultValue={values.since ?? ""} className="input">
          {SINCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </FormField>

      <button
        type="submit"
        className="h-9 rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg hover:bg-indigo-500"
      >
        Apply
      </button>
      {(values.q || values.domain || values.category || values.band || values.since) && (
        <a href={action} className="h-9 px-1 text-xs leading-9 text-muted hover:text-foreground">
          Clear
        </a>
      )}
    </form>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted">
      {label}
      {children}
    </label>
  );
}
