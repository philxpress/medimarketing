import Link from "next/link";
import { Search, Stethoscope, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { queryClinics } from "@/lib/admin";

export const dynamic = "force-dynamic";

const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

export default async function AdminClinicsPage({
  searchParams,
}: {
  searchParams: { state?: string; q?: string; after?: string };
}) {
  const state = searchParams.state?.trim() || "";
  const q = searchParams.q?.trim() || "";
  const after = searchParams.after || "";

  const { clinics, nextCursor } = await queryClinics({
    state: state || undefined,
    q: q || undefined,
    after: after || undefined,
    limit: 25,
  });

  const nextQs = new URLSearchParams();
  if (state) nextQs.set("state", state);
  if (q) nextQs.set("q", q);
  if (nextCursor) nextQs.set("after", nextCursor);

  return (
    <>
      <PageHeader title="Clinic database" />

      <form className="card mb-6 flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="label">State</label>
          <select name="state" defaultValue={state} className="input w-36">
            <option value="">All states</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[16rem] flex-1">
          <label className="label">Search by name (starts with)</label>
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input name="q" defaultValue={q} className="input pl-8" placeholder="e.g. Northside" />
          </div>
        </div>
        <button className="btn-primary" type="submit">
          Filter
        </button>
        {(state || q) && (
          <Link href="/admin/clinics" className="btn-secondary">
            Clear
          </Link>
        )}
      </form>

      {clinics.length === 0 ? (
        <div className="card py-14 text-center">
          <Stethoscope className="mx-auto mb-3 text-neutral-400" size={36} />
          <p className="font-medium text-neutral-900">No clinics match</p>
          <p className="text-sm text-neutral-500">Adjust the state or search and try again.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 font-medium">Clinic</th>
                <th className="px-4 py-3 font-medium">Suburb</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {clinics.map((c) => (
                <tr key={c.id} className="align-top hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5 font-medium text-neutral-900">
                      {c.name || <span className="italic text-neutral-400">Unnamed clinic</span>}
                      {c.bookable && (
                        <CheckCircle2
                          size={13}
                          className="text-brand-600"
                          aria-label="HotDoc-verified (bookable)"
                        />
                      )}
                    </div>
                    <div className="max-w-md truncate text-xs text-neutral-500">{c.address}</div>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {c.suburb} {c.state} {c.postcode}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {c.phone && <div>{c.phone}</div>}
                    {c.email && <div className="truncate">{c.email}</div>}
                    {c.fax && <div>fax {c.fax}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.sources.map((s) => (
                        <span key={s} className="badge bg-slate-100 text-neutral-600">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <Link href={`/admin/clinics?${nextQs.toString()}`} className="btn-secondary">
            Next 25 →
          </Link>
        </div>
      )}
    </>
  );
}
