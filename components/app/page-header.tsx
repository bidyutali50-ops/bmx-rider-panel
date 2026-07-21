export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {/* route-tick accent — a small consignment mark before the title */}
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-4 w-1 rounded-full bg-brand-500" />
          <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        </div>
        {description && <p className="mt-1 pl-3 text-sm text-[var(--muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
