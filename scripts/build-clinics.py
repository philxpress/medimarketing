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

def nkey(s: str) -> str:
    """Punctuation-insensitive key for comparing a name against an address."""
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()

_NAME_PLACEHOLDERS = {"", "no clinic listed", "none", "na", "n a", "unknown"}

def valid_name(name: str, address: str) -> str:
    """A real clinic name, or "" — never the address or a phone number.

    The source falls back to the street address (and occasionally a bare phone
    number) when it has no practice name; those are not names, so blank them.
    """
    n = (name or "").strip()
    if not n:
        return ""
    k = nkey(n)
    if k in _NAME_PLACEHOLDERS:
        return ""
    if not re.search(r"[A-Za-z]", n):          # digits/punctuation only → phone or number
        return ""
    if k == nkey(address):                      # address standing in as the name
        return ""
    return n

def clean(s: str) -> str:
    return (s or "").strip()

# ── clinic type extraction ────────────────────────────────────────────────
# Types come from the two non-HotDoc sources:
#   * healthdirect_service_types (clinic-level, split on "|" and ";")
#   * specialties (practitioner-level, split on ";", accumulated across ALL
#     the clinic's rows)
# The two sources label the same profession differently, so a light alignment
# collapses the obvious GP variants to a single canonical label; everything
# else is kept verbatim.
_GP_CANON = "GP (General Practitioner)"
_GP_VARIANTS = {
    "gp (general practice)",
    "gp (general practitioner)",
    "general practitioner",
    "general practice",
    "gp",
}

def canon_type(t: str) -> str:
    tl = t.strip().lower()
    if tl in _GP_VARIANTS:
        return _GP_CANON
    return t.strip()

def split_types(raw: str, seps: str) -> list:
    """Split a raw type field on every char in `seps`, trim, canonicalize."""
    parts = [raw or ""]
    for sep in seps:
        parts = [p for chunk in parts for p in chunk.split(sep)]
    out = []
    for p in parts:
        p = p.strip()
        if p:
            out.append(canon_type(p))
    return out

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
            "org": clean(r.get("organisation_name")),
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
# Types accumulate across ALL rows of a clinic (the loop below keeps only the
# first row for details, but specialties live on every practitioner row), keyed
# the same way as `clinics`. Value: lowercase -> display, for case-insensitive
# de-duplication that preserves the first-seen casing.
types_by_key = defaultdict(dict)
for fn in sorted(glob.glob(os.path.join(FINAL, "*.csv"))):
    if os.path.basename(fn) == "specialties.csv":
        continue
    state_from_file = os.path.splitext(os.path.basename(fn))[0].upper()
    with open(fn, encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            pc = clean(row.get("postcode"))
            key = f"{pc}|{norm(row.get('clinic_name'))}|{norm(row.get('clinic_address'))}"
            # Accumulate types for EVERY row of this clinic (before the dedup
            # skip), so HealthShare specialties across all practitioners count.
            bucket = types_by_key[key]
            for t in split_types(row.get("healthdirect_service_types"), "|;"):
                bucket.setdefault(t.lower(), t)
            for t in split_types(row.get("specialties"), ";"):
                bucket.setdefault(t.lower(), t)
            if key in clinics:
                continue
            hd = hotdoc.get(clean(row.get("hotdoc_url")))
            dr = healthdirect.get(uuid_of(row.get("healthdirect_url")))
            def pref(*vals):
                for v in vals:
                    if v:
                        return v
                return ""
            address = pref(hd and hd["address"], clean(row.get("clinic_address")),
                           dr and dr["address"])
            # Name must be a real name — never the address or a phone number.
            # Try each source's name in precedence; keep the first valid one.
            name = ""
            for cand in (hd and hd["name"], dr and dr["org"], clean(row.get("clinic_name"))):
                v = valid_name(cand or "", address)
                if v:
                    name = v
                    break
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

# ── 4b. attach accumulated types (from healthdirect + HealthShare) ─────────
for key, c in clinics.items():
    c["types"] = sorted(types_by_key[key].values(), key=str.lower)

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

# ── postcode centroids + suburb→postcode, bundled into the app ────────────
# Lets the admin search resolve a postcode/suburb to a map centre for radius
# search without any Firestore reads. Small, non-sensitive (public centroids).
pc_geo = defaultdict(lambda: [0.0, 0.0, 0])
sub_counts = defaultdict(int)  # (suburb_norm, postcode) -> clinic count
for c in kept:
    if c["postcode"] and c["lat"] is not None and c["lng"] is not None:
        acc = pc_geo[c["postcode"]]; acc[0] += c["lat"]; acc[1] += c["lng"]; acc[2] += 1
    if c["suburb"] and c["postcode"]:
        sub_counts[(norm(c["suburb"]), c["postcode"])] += 1
by_postcode = {pc: [round(a[0] / a[2], 5), round(a[1] / a[2], 5)] for pc, a in pc_geo.items() if a[2]}
by_suburb = {}
for (sub, pc), n in sub_counts.items():
    # A suburb name can map to several postcodes; keep the busiest, and only if
    # that postcode has a centroid.
    if pc not in by_postcode:
        continue
    if sub not in by_suburb or n > sub_counts[(sub, by_suburb[sub])]:
        by_suburb[sub] = pc
PC_OUT = os.path.join(ROOT, "src", "lib", "data", "postcodes.json")
os.makedirs(os.path.dirname(PC_OUT), exist_ok=True)
with open(PC_OUT, "w", encoding="utf-8", newline="\n") as f:
    json.dump({"byPostcode": by_postcode, "bySuburb": by_suburb}, f, separators=(",", ":"))
print(f"postcode lookup written: {len(by_postcode)} postcodes, {len(by_suburb)} suburbs -> {PC_OUT}")

# ── clinic-type facet list (top ~60 types by clinic count) ────────────────
# The dropdown offers these exact strings, so they match stored `types` values.
type_clinic_counts = defaultdict(int)
for c in kept:
    for t in c["types"]:
        type_clinic_counts[t] += 1
top_types = sorted(type_clinic_counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))[:60]
facet = [t for t, _ in top_types]
TYPES_OUT = os.path.join(ROOT, "src", "lib", "data", "clinic-types.json")
os.makedirs(os.path.dirname(TYPES_OUT), exist_ok=True)
with open(TYPES_OUT, "w", encoding="utf-8", newline="\n") as f:
    json.dump(facet, f, ensure_ascii=True, indent=2)
    f.write("\n")
print(f"clinic types written: {len(facet)} facet values (of {len(type_clinic_counts)} distinct) -> {TYPES_OUT}")

# ── report ────────────────────────────────────────────────────────────────
def cnt(f): return sum(1 for c in kept if c[f])
print(f"dropped (no contact method): {dropped_nocontact}")
print(f"clinics written: {len(kept)}  ->  {OUT}")
print("  with name:     %d  (blank: %d)" % (cnt("name"), len(kept) - cnt("name")))
print("  with address:  %d" % cnt("address"))
print("  with phone:    %d" % cnt("phone"))
print("  with email:    %d" % cnt("email"))
print("  with fax:      %d" % cnt("fax"))
print("  with geo:      %d" % sum(1 for c in kept if c["geohash"]))
print("  bookable(HotDoc): %d" % sum(1 for c in kept if c["bookable"]))
_with_types = sum(1 for c in kept if c["types"])
print("  with type(s):  %d  (%.1f%% coverage)" % (
    _with_types, 100.0 * _with_types / len(kept) if kept else 0.0))
