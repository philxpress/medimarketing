import Link from "next/link";
import { Database, CheckCircle2, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { getClinicMeta, searchClinics } from "@/lib/admin";
import clinicTypes from "@/lib/data/clinic-types.json";

export const dynamic = "force-dynamic";

const RADII = [5, 10, 20, 50, 100];
const CLINIC_TYPES = clinicTypes as string[];

export default async function DatabasePage({
  searchParams,
}: {
  searchParams: {
    entity?: string;
    name?: string;
    phone?: string;
    email?: string;
    location?: string;
    radius?: string;
    type?: string;
  };
}) {
  const entity = searchParams.entity === "doctors" ? "doctors" : "clinics";
  const name = searchParams.name?.trim() || "";
  const phone = searchParams.phone?.trim() || "";
  const email = searchParams.email?.trim() || "";
  const location = searchParams.location?.trim() || "";
  const radiusKm = Number(searchParams.radius) || 10;
  const type = searchParams.type?.trim() || "";

  // Only the stored counter is read on load — no scan of the big collection.
  const meta = await getClinicMeta();

  const hasSearch = Boolean(name || phone || email || location || type);
  const outcome =
    entity === "clinics" && hasSearch
      ? await searchClinics({
          name,
          phone,
          email,
          location: location || undefined,
          radiusKm: location ? radiusKm : undefined,
          type: type || undefined,
        })
      : null;

  return (
    <>
      <PageHeader title="Database" />

      {/* Total records — one cheap doc read, never a scan */}
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center gap-2 text-neutral-900">
          <Database size={18} />
          <span className="text-2xl font-bold">
            {meta ? meta.count.toLocaleString() : "—"}
          </span>
          <span className="text-sm text-neutral-500">clinics in the database</span>
        </div>
        {!meta && (
          <span className="text-xs text-neutral-500">
            Run the clinic import to populate the count.
          </span>
        )}
        <span className="text-xs text-neutral-400">
          Doctors: not loaded yet
        </span>
      </div>

      {/* Clinics / Doctors toggle */}
      <div className="mb-4 flex gap-2">
        <Tab href="/admin/clinics?entity=clinics" active={entity === "clinics"}>
          Clinics
        </Tab>
        <Tab href="/admin/clinics?entity=doctors" active={entity === "doctors"}>
          Doctors
        </Tab>
      </div>

      {/* Search form */}
      <form method="get" className="card mb-6 space-y-4">
        <input type="hidden" name="entity" value={entity} />
        {entity === "clinics" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name" name="name" defaultValue={name} placeholder="Clinic name" />
              <Field label="Telephone" name="phone" defaultValue={phone} placeholder="e.g. 03 9527" />
              <Field label="Email" name="email" defaultValue={email} placeholder="name@clinic…" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Postcode / suburb"
                name="location"
                defaultValue={location}
                placeholder="e.g. 3000 or Melbourne"
              />
              <div>
                <label className="label">Radius</label>
                <select name="radius" defaultValue={String(radiusKm)} className="input">
                  {RADII.map((r) => (
                    <option key={r} value={r}>
                      Within {r} km
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Type</label>
                <select name="type" defaultValue={type} className="input">
                  <option value="">Any type</option>
                  {CLINIC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" name="name" defaultValue={name} placeholder="Doctor name" />
            <Field
              label="Postcode / suburb"
              name="location"
              defaultValue={location}
              placeholder="e.g. 3000 or Melbourne"
            />
          </div>
        )}
        <div className="flex items-center gap-3">
          <button className="btn-primary" type="submit">
            <Search size={16} /> Search
          </button>
          {hasSearch && (
            <Link href={`/admin/clinics?entity=${entity}`} className="btn-secondary">
              Clear
            </Link>
          )}
          <span className="text-xs text-neutral-500">
            Nothing is loaded until you search.
          </span>
        </div>
      </form>

      {/* Results */}
      {entity === "doctors" ? (
        hasSearch && (
          <div className="card py-10 text-center text-sm text-neutral-500">
            The doctors database isn&apos;t loaded yet — clinics were imported first.
          </div>
        )
      ) : !hasSearch ? (
        <div className="card py-10 text-center text-sm text-neutral-500">
          Enter a name, phone, email, or a postcode/suburb + radius to search.
        </div>
      ) : outcome?.locationError ? (
        <div className="card py-10 text-center text-sm text-neutral-900">
          {outcome.locationError}
        </div>
      ) : outcome && outcome.clinics.length === 0 ? (
        <div className="card py-10 text-center text-sm text-neutral-500">No clinics match.</div>
      ) : (
        outcome && (
          <>
            <div className="mb-2 text-sm text-neutral-500">
              {outcome.clinics.length}
              {outcome.truncated ? "+" : ""} result{outcome.clinics.length === 1 ? "" : "s"}
              {outcome.mode === "radius" && outcome.center
                ? ` within ${radiusKm} km of ${outcome.center.label}`
                : ""}
              {outcome.truncated ? " (showing first 200 — narrow your search)" : ""}
            </div>
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-neutral-500">
                  <tr className="border-b border-slate-100">
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Address</th>
                    <th className="px-4 py-3 font-medium">Suburb</th>
                    <th className="px-4 py-3 font-medium">Telephone</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    {outcome.mode === "radius" && (
                      <th className="px-4 py-3 font-medium">Distance</th>
                    )}
                    <th className="px-4 py-3 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {outcome.clinics.map((c) => (
                    <tr key={c.id} className="align-top hover:bg-slate-50">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-1.5 font-medium text-neutral-900">
                          {c.name || (
                            <span className="italic text-neutral-400">Unnamed clinic</span>
                          )}
                          {c.bookable && (
                            <CheckCircle2
                              size={13}
                              className="text-brand-600"
                              aria-label="HotDoc-verified (bookable)"
                            />
                          )}
                        </div>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-neutral-500">
                        <div className="truncate" title={c.address}>
                          {c.address || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-500">
                        {c.suburb || "—"}
                        {(c.state || c.postcode) && (
                          <div className="text-xs text-neutral-400">
                            {c.state} {c.postcode}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-500">{c.phone || "—"}</td>
                      <td className="max-w-[14rem] px-4 py-3 text-neutral-500">
                        <div className="truncate" title={c.email}>
                          {c.email || "—"}
                        </div>
                      </td>
                      <td className="max-w-[16rem] px-4 py-3">
                        {c.types && c.types.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {c.types.map((t) => (
                              <span
                                key={t}
                                className="badge bg-slate-100 text-neutral-600"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>
                      {outcome.mode === "radius" && (
                        <td className="px-4 py-3 text-neutral-500">
                          {c.distanceKm != null ? `${c.distanceKm.toFixed(1)} km` : "—"}
                        </td>
                      )}
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
          </>
        )
      )}
    </>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
        active ? "bg-neutral-900 text-white" : "bg-white text-neutral-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" name={name} defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}
