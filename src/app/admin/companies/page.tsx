import Link from "next/link";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { getAllOrgs } from "@/lib/admin";
import { NewCompanyForm } from "@/components/admin/NewCompanyForm";

export const dynamic = "force-dynamic";

export default async function AdminCompaniesPage() {
  const orgs = await getAllOrgs();

  return (
    <>
      <PageHeader title="Companies" />
      <div className="mb-6">
        <NewCompanyForm />
      </div>

      {orgs.length === 0 ? (
        <div className="card py-14 text-center">
          <Building2 className="mx-auto mb-3 text-neutral-400" size={36} />
          <p className="font-medium text-neutral-900">No companies yet</p>
          <p className="text-sm text-neutral-500">Create one above to get started.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 font-medium">Company</th>
                <th className="px-6 py-3 font-medium">Owner</th>
                <th className="px-6 py-3 font-medium">Plan</th>
                <th className="px-6 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {orgs.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <Link
                      href={`/admin/companies/${o.id}`}
                      className="font-medium text-neutral-900 hover:text-brand-600"
                    >
                      {o.name}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-neutral-500">{o.ownerEmail ?? "—"}</td>
                  <td className="px-6 py-3">
                    <span className="badge bg-slate-100 text-neutral-700">{o.plan ?? "—"}</span>
                  </td>
                  <td className="px-6 py-3 text-neutral-500">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
