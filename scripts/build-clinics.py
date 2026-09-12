#!/usr/bin/env python3
"""
Build the clinic database from the local Practitioner List sources.

Reads the curated per-state merge (final_list/*.csv) as the clinic universe and
enriches each clinic's details from the raw crawls, applying the source-quality
precedence the product owner set:

  clinic details  ->  HotDoc  >  healthdirect  >  HealthShare (final_list)
  fax             ->  healthdirect only (the only source that carries it)
  coordinates     ->  HotDoc  >  healthdirect ; else the postcode centroid

Distance is postcode-based, so every clinic ends up with a lat/lng: its own
geocode when a source has one, otherwise the mean of all known coordinates in
its postcode. A geohash is stored for later radius search.

Filters, per instruction:
  * drop clinics with no contact method at all (no address, phone, email or fax)
  * de-duplicate to one record per distinct clinic

Output: <root>/Practitioner List/clinics.ndjson  (one clinic JSON per line),
which scripts/import-clinics.ts streams into Firestore.

Run:  python scripts/build-clinics.py
Reads only local files; writes nothing outside the (git-ignored) data folder.
"""
import csv, glob, hashlib, json, os, re, sys
from collections import defaultdict

csv.field_size_limit(1 << 24)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "Practitioner List")
FINAL = os.path.join(DATA, "final_list")
OUT = os.path.join(DATA, "clinics.ndjson")

def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())

def clean(s: str) -> str:
    return (s or "").strip()

def fnum(s):
    try:
        v = float(s)
        return v if -90 <= v <= 90 or -180 <= v <= 180 else None
    except (TypeError, ValueError):
        return None

# ── geohash encode (base32) ───────────────────────────────────────────────
_B32 = "0123456789bcdefghjkmnpqrstuvwxyz"
def geohash(lat, lng, precision=7):
    if lat is None or lng is None:
        return None
    lat_r, lng_r = (-90.0, 90.0), (-180.0, 180.0)
    gh, bits, bit, even = [], 0, 0, True
    while len(gh) < precision:
        if even:
            mid = (lng_r[0] + lng_r[1]) / 2
            if lng > mid: bits = (bits << 1) | 1; lng_r = (mid, lng_r[1])
            else:         bits = (bits << 1);     lng_r = (lng_r[0], mid)
        else:
            mid = (lat_r[0] + lat_r[1]) / 2
            if lat > mid: bits = (bits << 1) | 1; lat_r = (mid, lat_r[1])
            else:         bits = (bits << 1);     lat_r = (lat_r[0], mid)
        even = not even
        bit += 1
        if bit == 5:
            gh.append(_B32[bits]); bit = 0; bits = 0
    return "".join(gh)

# ── 1. HotDoc raw clinics, keyed by booking url ───────────────────────────
hotdoc = {}
hd_path = os.path.join(DATA, "hotdoc", "clinics.csv")
with open(hd_path, encoding="utf-8-sig") as fh:
    for r in csv.DictReader(fh):
        url = clean(r.get("url"))
        if not url:
            continue
        hotdoc[url] = {
            "name": clean(r.get("name")),
            "address": clean(r.get("street_address")),
            "suburb": clean(r.get("suburb")),
            "state": clean(r.get("state")),
            "postcode": clean(r.get("postcode")),
            "phone": clean(r.get("phone")),
            "website": clean(r.get("website")),
            "lat": fnum(r.get("latitude")),
            "lng": fnum(r.get("longitude")),
            "billingType": clean(r.get("billing_type")),
            "wheelchair": clean(r.get("wheelchair_access")),
            "doctorCount": clean(r.get("doctor_count")),
        }
print(f"HotDoc clinics loaded: {len(hotdoc)}")

# ── 2. healthdirect raw services, keyed by service_id (uuid) ──────────────
def uuid_of(url: str) -> str:
    return (url or "").rstrip("/").rsplit("/", 1)[-1].lower()

healthdirect = {}
hdir_path = os.path.join(DATA, "healthdirect", "data", "clinics.csv")
with open(hdir_path, encoding="utf-8-sig") as fh:
    for r in csv.DictReader(fh):
        sid = clean(r.get("service_id")).lower()
        if not sid:
            continue
        line1, line2 = clean(r.get("address_line1")), clean(r.get("address_line2"))
        healthdirect[sid] = {
            "address": ", ".join(a for a in (line1, line2) if a),
            "suburb": clean(r.get("suburb")),
            "state": clean(r.get("state")),
            "postcode": clean(r.get("postcode")),
            "phone": clean(r.get("phone")),
            "fax": clean(r.get("fax")),
            "email": clean(r.get("email")),
            "website": clean(r.get("website")),
            "lat": fnum(r.get("latitude")),
            "lng": fnum(r.get("longitude")),
        }
print(f"healthdirect services loaded: {len(healthdirect)}")

# ── 3. postcode centroids from every known coordinate ─────────────────────
pc_pts = defaultdict(lambda: [0.0, 0.0, 0])
def add_pt(pc, lat, lng):
    if pc and lat is not None and lng is not None:
        acc = pc_pts[pc]; acc[0] += lat; acc[1] += lng; acc[2] += 1
for c in hotdoc.values():
    add_pt(c["postcode"], c["lat"], c["lng"])
for c in healthdirect.values():
    add_pt(c["postcode"], c["lat"], c["lng"])
centroid = {pc: (a[0] / a[2], a[1] / a[2]) for pc, a in pc_pts.items() if a[2]}
print(f"postcode centroids derived: {len(centroid)}")

# ── 4. walk final_list, dedupe clinics, apply precedence ──────────────────
clinics = {}
for fn in sorted(glob.glob(os.path.join(FINAL, "*.csv"))):
    if os.path.basename(fn) == "specialties.csv":
        continue
    state_from_file = os.path.splitext(os.path.basename(fn))[0].upper()
    with open(fn, encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            pc = clean(row.get("postcode"))
            key = f"{pc}|{norm(row.get('clinic_name'))}|{norm(row.get('clinic_address'))}"
            if key in clinics:
                continue
            hd = hotdoc.get(clean(row.get("hotdoc_url")))
            dr = healthdirect.get(uuid_of(row.get("healthdirect_url")))
            def pref(*vals):
                for v in vals:
                    if v:
                        return v
                return ""
            name = pref(hd and hd["name"], clean(row.get("clinic_name")))
            address = pref(hd and hd["address"], clean(row.get("clinic_address")),
                           dr and dr["address"])
            suburb = pref(hd and hd["suburb"], clean(row.get("suburb")), dr and dr["suburb"])
            phone = pref(hd and hd["phone"], clean(row.get("clinic_phone")), dr and dr["phone"])
            email = pref(clean(row.get("clinic_email")), dr and dr["email"])
            fax = pref(dr and dr["fax"])
            website = pref(hd and hd["website"], clean(row.get("clinic_website")),
                           dr and dr["website"])
            lat = (hd and hd["lat"]) if hd and hd["lat"] is not None else (dr and dr["lat"])
            lng = (hd and hd["lng"]) if hd and hd["lng"] is not None else (dr and dr["lng"])
            if (lat is None or lng is None) and pc in centroid:
                lat, lng = centroid[pc]
            sources = [s for s in clean(row.get("clinic_sources")).split("+") if s]
            clinics[key] = {
                "id": hashlib.sha1(key.encode()).hexdigest()[:20],
                "name": name,
                "address": address,
                "suburb": suburb,
                "state": (hd and hd["state"]) or (dr and dr["state"]) or state_from_file,
                "postcode": pc,
                "phone": phone,
                "fax": fax,
                "email": email,
                "website": website,
                "lat": lat,
                "lng": lng,
                "geohash": geohash(lat, lng),
                "sources": sources,
                "bookable": bool(hd),
                "billingType": (hd and hd["billingType"]) or "",
                "doctorCount": int(hd["doctorCount"]) if hd and hd["doctorCount"].isdigit() else None,
            }
print(f"distinct clinics before filter: {len(clinics)}")

# ── 5. filter: must have at least one contact method ──────────────────────
kept, dropped_nocontact = [], 0
for c in clinics.values():
    if c["address"] or c["phone"] or c["email"] or c["fax"]:
        kept.append(c)
    else:
        dropped_nocontact += 1

with open(OUT, "w", encoding="utf-8", newline="\n") as out:
    for c in kept:
        # ensure_ascii=True escapes every non-ASCII char (incl. the Unicode
        # line/paragraph separators U+2028/U+2029 and NEL U+0085) as \uXXXX, so
        # no raw separator survives to break NDJSON line-splitting in Node.
        out.write(json.dumps(c) + "\n")

# ── report ────────────────────────────────────────────────────────────────
def cnt(f): return sum(1 for c in kept if c[f])
print(f"dropped (no contact method): {dropped_nocontact}")
print(f"clinics written: {len(kept)}  ->  {OUT}")
print("  with address:  %d" % cnt("address"))
print("  with phone:    %d" % cnt("phone"))
print("  with email:    %d" % cnt("email"))
print("  with fax:      %d" % cnt("fax"))
print("  with geo:      %d" % sum(1 for c in kept if c["geohash"]))
print("  bookable(HotDoc): %d" % sum(1 for c in kept if c["bookable"]))
