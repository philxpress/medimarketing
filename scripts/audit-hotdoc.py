#!/usr/bin/env python3
"""
Audit a new HotDoc pull against the last-applied one.

The HotDoc crawler writes a new pull to "Practitioner List/hotdoc/clinics_v2.csv";
the previously-applied pull stays in "clinics.csv" as the baseline. This script
diffs them by HotDoc's stable clinic_id and reports what changed, what's new, and
what was delisted — the HotDoc-specific view of what a re-import/sync will apply.

Part of the update method:
  1. python "Practitioner List/hotdoc/scrape_hotdoc.py" --refresh-sitemap --out-suffix _v2
  2. python scripts/audit-hotdoc.py          # see what HotDoc changed (writes a CSV report)
  3. python scripts/build-clinics.py         # rebuild clinics.ndjson (reads the new pull)
  4. npx tsx scripts/sync-clinics.ts --commit# apply ONLY the delta to Firestore
  5. python scripts/audit-hotdoc.py --rotate # make the new pull the baseline for next time

Reads/writes only the git-ignored crawl folder. --rotate makes clinics_v2.csv the
new clinics.csv (backing up the old baseline to clinics_prev.csv) and removes v2.
"""
import csv, os, re, sys, shutil

csv.field_size_limit(1 << 24)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HD = os.path.join(ROOT, "Practitioner List", "hotdoc")
BASE = os.path.join(HD, "clinics.csv")       # last-applied pull
NEW = os.path.join(HD, "clinics_v2.csv")     # fresh pull
REPORT = os.path.join(HD, "hotdoc_changes.csv")

# Fields worth tracking, with a normaliser so formatting noise isn't a "change".
def _phone(s):
    d = re.sub(r"\D", "", s or ""); return d[-8:] if len(d) >= 8 else d
def _addr(s): return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()
def _text(s): return re.sub(r"\s+", " ", (s or "").strip().lower())
def _web(s):
    s = (s or "").strip().lower().rstrip("/")
    return re.sub(r"^https?://(www\.)?", "", s).split("?")[0]

FIELDS = [
    ("name", "name", _text),
    ("street_address", "address", _addr),
    ("suburb", "suburb", _text),
    ("postcode", "postcode", lambda x: (x or "").strip()),
    ("phone", "phone", _phone),
    ("website", "website", _web),
    ("billing_type", "billing", lambda x: (x or "").strip().lower()),
    ("service_types", "types", lambda x: ";".join(sorted(p.strip().lower() for p in (x or "").split(";") if p.strip()))),
]

def load(path):
    d = {}
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            cid = (r.get("clinic_id") or "").strip()
            if cid:
                d[cid] = r
    return d

def rotate():
    if not os.path.exists(NEW):
        print(f"Nothing to rotate — {NEW} not found."); return
    if os.path.exists(BASE):
        shutil.copy2(BASE, os.path.join(HD, "clinics_prev.csv"))
    shutil.copy2(NEW, BASE)
    os.remove(NEW)
    print("Rotated: clinics_v2.csv -> clinics.csv (old baseline saved as clinics_prev.csv).")

def main():
    if "--rotate" in sys.argv:
        rotate(); return
    if not os.path.exists(NEW):
        print(f"No new pull found at {NEW}. Run the crawler with --out-suffix _v2 first.")
        sys.exit(1)
    if not os.path.exists(BASE):
        print(f"No baseline at {BASE}; treating every clinic in the new pull as new.")
    base = load(BASE) if os.path.exists(BASE) else {}
    new = load(NEW)

    both = set(base) & set(new)
    added = set(new) - set(base)
    removed = set(base) - set(new)

    rows = []            # report rows
    changed_clinics = 0
    field_counts = {lbl: 0 for _, lbl, _ in FIELDS}
    for cid in both:
        o, n = base[cid], new[cid]
        row_changed = False
        for col, lbl, fn in FIELDS:
            if fn(o.get(col)) != fn(n.get(col)):
                field_counts[lbl] += 1
                row_changed = True
                rows.append(["changed", cid, (n.get("name") or "").strip(), lbl,
                             (o.get(col) or "").strip(), (n.get(col) or "").strip()])
        if row_changed:
            changed_clinics += 1
    for cid in added:
        rows.append(["new", cid, (new[cid].get("name") or "").strip(), "", "",
                     f'{new[cid].get("suburb","")} {new[cid].get("state","")} {new[cid].get("postcode","")}'.strip()])
    for cid in removed:
        rows.append(["delisted", cid, (base[cid].get("name") or "").strip(), "", "",
                     f'{base[cid].get("suburb","")} {base[cid].get("state","")}'.strip()])

    with open(REPORT, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["status", "clinic_id", "name", "field", "old", "new"])
        w.writerows(rows)

    print(f"HotDoc pull audit — baseline {len(base)} vs new {len(new)}")
    print(f"  matched: {len(both)} | new: {len(added)} | delisted: {len(removed)}")
    print(f"  clinics with a field change: {changed_clinics}")
    print("  changes by field:")
    for _, lbl, _ in FIELDS:
        print(f"    {lbl:9} {field_counts[lbl]}")
    print(f"\n  full report ({len(rows)} rows) -> {REPORT}")
    print("  After applying (build + sync), run:  python scripts/audit-hotdoc.py --rotate")

if __name__ == "__main__":
    main()
