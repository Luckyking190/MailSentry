export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted">{description}</p>
        )}
      </div>
      {actions}
    </header>
  );
}

export function Placeholder({ phase, children }: { phase: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/40 px-5 py-10 text-center">
      <p className="text-sm text-foreground">{children}</p>
      <p className="mt-1 text-xs text-muted">Arrives in {phase}.</p>
    </div>
  );
}
