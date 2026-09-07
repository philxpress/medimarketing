export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-900">{description}</p>}
      </div>
      {action}
    </div>
  );
}
