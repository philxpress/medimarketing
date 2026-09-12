import Link from "next/link";
import { Building2, Stethoscope, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { getAllOrgs, getClinicMeta } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [orgs, clinicMeta] = await Promise.all([getAllOrgs(), getClinicMeta()]);
  const clinics = clinicMeta?.count ?? 0;

  return (
    <>
      <PageHeader title="Platform overview" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat icon={Building2} label="Companies" value={orgs.length} href="/admin/companies" />
        <Stat
          icon={Stethoscope}
          label="Clinics in database"
          value={clinics}
          href="/admin/clinics"
        />
      </div>

      <div className="card mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-neutral-900">Recent companies</h2>
          <Link href="/admin/companies" className="text-sm text-brand-600 hover:underline">
            View all
          </Link>
        </div>
        {orgs.length === 0 ? (
          <p className="text-sm text-neutral-500">No companies yet.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {orgs.slice(0, 6).map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2.5">
                <Link
                  href={`/admin/companies/${o.id}`}
                  className="font-medium text-neutral-900 hover:text-brand-600"
                >
                  {o.name}
                </Link>
                <span className="badge bg-slate-100 text-neutral-700">{o.plan ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href} className="card p-4 transition hover:shadow-md">
      <Icon size={20} className="text-neutral-900" />
      <div className="mt-3 text-2xl font-bold text-neutral-900">{value.toLocaleString()}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </Link>
  );
}
