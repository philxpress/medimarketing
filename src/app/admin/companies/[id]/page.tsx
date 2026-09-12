import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { getOrg } from "@/lib/admin";
import { getMembers, getInvites } from "@/lib/data";
import { PlanEditor } from "@/components/admin/PlanEditor";

export const dynamic = "force-dynamic";

export default async function AdminCompanyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const org = await getOrg(params.id);
  if (!org) notFound();
  const [members, invites] = await Promise.all([
    getMembers(params.id),
    getInvites(params.id),
  ]);

  return (
    <>
      <Link
        href="/admin/companies"
        className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-900 hover:underline"
      >
        <ArrowLeft size={14} /> All companies
      </Link>
      <PageHeader title={org.name} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold text-neutral-900">Subscription</h2>
          <PlanEditor orgId={org.id} plan={org.plan ?? ""} />
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold text-neutral-900">Company</h2>
          <dl className="space-y-2 text-sm">
            <Row k="Owner email" v={org.ownerEmail ?? "—"} />
            <Row k="Timezone" v={org.timezone ?? "—"} />
            <Row k="Postal address" v={org.postalAddress ? "set" : "not set"} />
            <Row k="Created" v={new Date(org.createdAt).toLocaleString()} />
            <Row k="Org ID" v={org.id} />
          </dl>
        </div>

        <div className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold text-neutral-900">
            Members <span className="text-neutral-500">({members.length})</span>
          </h2>
          {members.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No members yet — the invited owner joins on first sign-in.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-50">
                {members.map((m) => (
                  <tr key={m.uid}>
                    <td className="py-2 text-neutral-900">{m.displayName || m.email}</td>
                    <td className="py-2 text-neutral-500">{m.email}</td>
                    <td className="py-2 text-right">
                      <span className="badge bg-slate-100 text-neutral-700 capitalize">
                        {m.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {invites.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-sm font-semibold text-neutral-900">
                Pending invites
              </h3>
              <ul className="space-y-1 text-sm">
                {invites.map((i) => (
                  <li key={i.email} className="flex justify-between text-neutral-500">
                    <span>{i.email}</span>
                    <span className="capitalize">{i.role}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-500">{k}</dt>
      <dd className="text-right font-medium text-neutral-900">{v}</dd>
    </div>
  );
}
