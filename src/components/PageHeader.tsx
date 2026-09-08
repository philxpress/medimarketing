export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{title}</h1>
      {action}
    </div>
  );
}
