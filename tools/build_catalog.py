#!/usr/bin/env python3
"""Build the bundled object catalog + finder-chart data for the %astro desk.

Sources (all fetched into vendor/ and data-src/):
  - OpenNGC (NGC.csv + addendum.csv): NGC, IC, Messier cross-refs, common names
  - Barnard dark nebulae (VizieR VII/220A) with notes
  - Sharpless HII regions (VizieR VII/20, B1950 -> J2000)
  - Lynds dark nebulae (VizieR VII/7A, B1950 -> J2000)
  - Caldwell list (mapping below)
  - Bright named stars (stargazer stars.csv)
  - Curated bright doubles (list below; positions snapped to stars.csv)

Outputs (desk/web/data/):
  catalog.jsn  - list of objects
  stars.jsn    - [ra, dec, mag] triples, mag <= STAR_LIMIT, for finder charts
  lines.jsn    - constellation lines + label positions
"""
import csv, json, os, re, sys, math, gzip
import numpy as np
from astropy.coordinates import SkyCoord, FK4, get_constellation
import astropy.units as u

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NGC_CSV = f"{ROOT}/vendor/OpenNGC/database_files/NGC.csv"
ADD_CSV = f"{ROOT}/vendor/OpenNGC/database_files/addendum.csv"
SRC = f"{ROOT}/data-src"
STARGAZER = "/home/amadeo/Research/stargazer/data"
OUT = f"{ROOT}/desk/web/data"
STAR_LIMIT = 8.5

os.makedirs(OUT, exist_ok=True)

def r4(x): return None if x is None else round(float(x), 4)
def fnum(s):
    s = (s or "").strip()
    return float(s) if s else None

def hms(ra):  # "HH:MM:SS.SS" -> deg
    h, m, s = [float(x) for x in ra.split(":")]
    return 15 * (h + m / 60 + s / 3600)
def dms(dec):
    sign = -1 if dec.strip().startswith("-") else 1
    d, m, s = [float(x) for x in dec.strip().lstrip("+-").split(":")]
    return sign * (d + m / 60 + s / 3600)

def cat_name(name):
    """OpenNGC 'NGC0224' -> ('NGC', '224', 'NGC 224')"""
    m = re.match(r"^([A-Za-z]+)(\d+)([A-Za-z\-]*)$", name)
    if not m: return (name, "", name)
    pre, num, suf = m.groups()
    num = num.lstrip("0") or "0"
    return (pre, num, f"{pre} {num}{suf}")

objects = []
by_id = {}

# ---------------------------------------------------------------- OpenNGC
def load_openngc(path, addendum=False):
    rows = list(csv.DictReader(open(path), delimiter=";"))
    dups = []
    for r in rows:
        t = r["Type"]
        if t == "NonEx": continue
        if t == "Dup":
            dups.append(r); continue
        pre, num, disp = cat_name(r["Name"])
        o = {
            "id": r["Name"],
            "n": disp,               # display designation
            "src": pre if pre in ("NGC", "IC") else "ADD",
            "t": t,
            "ra": r4(hms(r["RA"])) if r["RA"] else None,
            "dec": r4(dms(r["Dec"])) if r["Dec"] else None,
            "con": r["Const"],
        }
        if o["ra"] is None: continue
        v, b = fnum(r["V-Mag"]), fnum(r["B-Mag"])
        if v is not None: o["mag"] = round(v, 2)
        elif b is not None: o["mag"] = round(b, 2); o["magb"] = 1
        for k, kk in (("MajAx", "maj"), ("MinAx", "min"), ("PosAng", "pa"), ("SurfBr", "sb")):
            x = fnum(r[k])
            if x is not None: o[kk] = round(x, 2)
        if r["Hubble"]: o["hub"] = r["Hubble"]
        if r["M"]: o["m"] = int(r["M"])
        names = []
        if r["Common names"]: names += [x.strip() for x in r["Common names"].split(",")]
        if names: o["cn"] = names
        alt = []
        if r["NGC"]: alt += ["NGC " + x.lstrip("0") for x in r["NGC"].split(",")]
        if r["IC"]: alt += ["IC " + x.lstrip("0") for x in r["IC"].split(",")]
        if r["Identifiers"]:
            keep = [x.strip() for x in r["Identifiers"].split(",")
                    if not re.match(r"^(2MASX|IRAS|MCG|CGCG|KUG|MRK|PKS|SDSS|UZC|VV|Mrk)", x.strip())]
            alt += [re.sub(r"\b0+(\d)", r"\1", x) for x in keep][:4]
        if alt: o["alt"] = alt
        notes = " ".join(x for x in (r["OpenNGC notes"], r["NED notes"]) if x).strip()
        if notes: o["notes"] = notes[:300]
        if r["Cstar V-Mag"]: o["cstar"] = fnum(r["Cstar V-Mag"])
        objects.append(o); by_id[o["id"]] = o
    # duplicates become aliases of their master
    for r in dups:
        pre, num, disp = cat_name(r["Name"])
        masters = []
        if r["NGC"]: masters += ["NGC" + x for x in r["NGC"].split(",")]
        if r["IC"]: masters += ["IC" + x for x in r["IC"].split(",")]
        for mid in masters:
            if mid in by_id:
                by_id[mid].setdefault("alt", []).append(disp)
                if r["M"] and "m" not in by_id[mid]: by_id[mid]["m"] = int(r["M"])
                break

load_openngc(NGC_CSV)
load_openngc(ADD_CSV, addendum=True)
print("OpenNGC objects:", len(objects))

# ---------------------------------------------------------------- Caldwell
CALDWELL = {
 1:"NGC0188",2:"NGC0040",3:"NGC4236",4:"NGC7023",5:"IC0342",6:"NGC6543",7:"NGC2403",8:"NGC0559",
 9:"C009",10:"NGC0663",11:"NGC7635",12:"NGC6946",13:"NGC0457",14:"C014",15:"NGC6826",16:"NGC7243",
 17:"NGC0147",18:"NGC0185",19:"IC5146",20:"NGC7000",21:"NGC4449",22:"NGC7662",23:"NGC0891",24:"NGC1275",
 25:"NGC2419",26:"NGC4244",27:"NGC6888",28:"NGC0752",29:"NGC5005",30:"NGC7331",31:"IC0405",32:"NGC4631",
 33:"NGC6992",34:"NGC6960",35:"NGC4889",36:"NGC4559",37:"NGC6882",38:"NGC4565",39:"NGC2392",40:"NGC3626",
 41:"C041",42:"NGC7006",43:"NGC7814",44:"NGC7479",45:"NGC5248",46:"NGC2261",47:"NGC6934",48:"NGC2775",
 49:"NGC2237",50:"NGC2239",51:"IC1613",52:"NGC4697",53:"NGC3115",54:"NGC2506",55:"NGC7009",56:"NGC0246",
 57:"NGC6822",58:"NGC2360",59:"NGC3242",60:"NGC4038",61:"NGC4039",62:"NGC0247",63:"NGC7293",64:"NGC2362",
 65:"NGC0253",66:"NGC5694",67:"NGC1097",68:"NGC6729",69:"NGC6302",70:"NGC0300",71:"NGC2477",72:"NGC0055",
 73:"NGC1851",74:"NGC3132",75:"NGC6124",76:"NGC6231",77:"NGC5128",78:"NGC6541",79:"NGC3201",80:"NGC5139",
 81:"NGC6352",82:"NGC6193",83:"NGC4945",84:"NGC5286",85:"IC2391",86:"NGC6397",87:"NGC1261",88:"NGC5823",
 89:"NGC6087",90:"NGC2867",91:"NGC3532",92:"NGC3372",93:"NGC6752",94:"NGC4755",95:"NGC6025",96:"NGC2516",
 97:"NGC3766",98:"NGC4609",99:"C099",100:"IC2944",101:"NGC6744",102:"IC2602",103:"NGC2070",104:"NGC0362",
 105:"NGC4833",106:"NGC0104",107:"NGC6101",108:"NGC4372",109:"NGC3195",
}
missing = []
for c, oid in CALDWELL.items():
    if oid in by_id: by_id[oid]["c"] = c
    else: missing.append((c, oid))
print("Caldwell missing:", missing)
EXTRA_ALIASES = {"ESO056-115": ["LMC"], "NGC0292": ["SMC"], "NGC1976": ["Orion Nebula"], "NGC0224": ["Andromeda"],
                 "NGC5194": ["Whirlpool"], "NGC5457": ["Pinwheel"], "NGC3031": ["Bode's Galaxy"], "NGC0598": ["Triangulum Galaxy"],
                 "NGC6720": ["Ring"], "NGC7009": ["Saturn Nebula"], "NGC2392": ["Eskimo Nebula", "Clown Face"],
                 "NGC0869": ["Double Cluster", "h Persei"], "NGC0884": ["Double Cluster", "chi Persei"]}
for oid, al in EXTRA_ALIASES.items():
    if oid in by_id: by_id[oid].setdefault("alt", []).extend(al)

# ---------------------------------------------------------------- Barnard
bnotes = {}
for line in open(f"{SRC}/barnard-notes.dat", encoding="latin-1"):
    key = line[1:5].strip(); txt = line[6:].rstrip()
    bnotes[key] = (bnotes.get(key, "") + " " + txt).strip()
bcount = 0
for line in open(f"{SRC}/barnard.dat", encoding="latin-1"):
    if len(line) < 38: continue
    num = line[1:5].strip()
    try:
        h, m = int(line[22:24]), int(line[25:27]); s = line[28:30].strip(); s = int(s) if s else 0
        sign = -1 if line[32] == "-" else 1
        d, dm = int(line[33:35]), int(line[36:38])
    except ValueError:
        continue
    diam = line[39:44].strip()
    mnum = re.match(r"(\d+)(.*)", num); bid = "B" + mnum.group(1).zfill(3) + mnum.group(2)
    o = {"id": bid, "n": f"B {num}", "src": "B", "t": "DrkN",
         "ra": r4(15 * (h + m / 60 + s / 3600)), "dec": r4(sign * (d + dm / 60))}
    if diam: o["maj"] = float(diam)
    if num in bnotes: o["notes"] = bnotes[num][:300]
    o["alt"] = [f"Barnard {num}"]
    # merge with OpenNGC addendum B033 (Horsehead)
    if o["id"] in by_id:
        by_id[o["id"]].setdefault("alt", []).extend(o["alt"])
        if "notes" in o: by_id[o["id"]].setdefault("notes", o["notes"])
        continue
    objects.append(o); by_id[o["id"]] = o; bcount += 1
print("Barnard:", bcount)

# ---------------------------------------------------------------- Sharpless (B1950 -> J2000)
sh_rows = []
for line in gzip.open(f"{SRC}/sharpless.dat.gz", "rt"):
    n = int(line[0:4])
    h, m, ds = int(line[34:36]), int(line[36:38]), int(line[38:41])
    sign = -1 if line[41] == "-" else 1
    d, dm, dsec = int(line[42:44]), int(line[44:46]), int(line[46:48])
    diam = int(line[48:52]); form, struct, bright = line[52], line[53], line[54]
    sh_rows.append((n, 15 * (h + m / 60 + ds / 36000), sign * (d + dm / 60 + dsec / 3600), diam, form, struct, bright))
c = SkyCoord(ra=[r[1] for r in sh_rows] * u.deg, dec=[r[2] for r in sh_rows] * u.deg,
             frame=FK4(equinox="B1950")).icrs
FORM = {"1": "circular", "2": "elliptical", "3": "irregular"}
STRUCT = {"1": "amorphous", "2": "intermediate", "3": "filamentary"}
BRIGHT = {"1": "faint", "2": "medium", "3": "bright"}
for (n, _, _, diam, form, struct, bright), ra, dec in zip(sh_rows, c.ra.deg, c.dec.deg):
    o = {"id": f"SH2-{n}", "n": f"Sh2-{n}", "src": "SH2", "t": "HII", "ra": r4(ra), "dec": r4(dec),
         "maj": float(diam), "alt": [f"Sh 2-{n}", f"Sharpless {n}"],
         "notes": f"{FORM.get(form,'')}, {STRUCT.get(struct,'')}, {BRIGHT.get(bright,'')} HII region (Sharpless)."}
    objects.append(o); by_id[o["id"]] = o
print("Sharpless:", len(sh_rows))

# ---------------------------------------------------------------- LDN (B1950 -> J2000)
ldn_rows = []
for line in open(f"{SRC}/ldn.dat", encoding="latin-1"):
    num = line[0:4].strip()
    if not num: continue
    h = int(line[5:7]); m = float(line[8:12]); sign = -1 if line[15] == "-" else 1
    d = int(line[16:18]); dm = int(line[19:21])
    area = float(line[36:43]); opac = line[44].strip(); barn = line[60:92].strip()
    ldn_rows.append((int(num), 15 * (h + m / 60), sign * (d + dm / 60), area, opac, barn))
c = SkyCoord(ra=[r[1] for r in ldn_rows] * u.deg, dec=[r[2] for r in ldn_rows] * u.deg,
             frame=FK4(equinox="B1950")).icrs
for (n, _, _, area, opac, barn), ra, dec in zip(ldn_rows, c.ra.deg, c.dec.deg):
    o = {"id": f"LDN{n}", "n": f"LDN {n}", "src": "LDN", "t": "DrkN", "ra": r4(ra), "dec": r4(dec),
         "maj": round(math.sqrt(area) * 60, 1), "alt": [f"Lynds {n}", f"L{n}"]}
    note = f"Lynds dark nebula, area {area:.3f} sq deg"
    if opac: note += f", opacity {opac}/6"; o["opac"] = int(opac)
    if barn:
        bs = [b.strip() for b in re.findall(r".{4}", barn.ljust(32)) if b.strip()]
        o["alt"] += [f"B {b}" for b in bs]
        note += ", = Barnard " + ", ".join(bs)
    o["notes"] = note
    objects.append(o); by_id[o["id"]] = o
print("LDN:", len(ldn_rows))

# ---------------------------------------------------------------- stars
stars = list(csv.DictReader(open(f"{STARGAZER}/stars.csv")))
star_arr = np.array([[float(s["ra_deg"]), float(s["dec_deg"]), float(s["mag"])] for s in stars])
def snap(ra, dec, mag=None, tol_arcmin=12.0):
    d = np.hypot((star_arr[:, 0] - ra) * math.cos(math.radians(dec)), star_arr[:, 1] - dec) * 60
    ok = d < tol_arcmin
    if mag is not None: ok &= np.abs(star_arr[:, 2] - mag) < 1.0
    idx = np.where(ok)[0]
    if len(idx) == 0: return None
    return int(idx[np.argmin(d[idx])])

named = 0
for s in stars:
    if not s["name"]: continue
    o = {"id": "HR" + s["hr"], "n": s["name"], "src": "STAR", "t": "*", "ra": r4(s["ra_deg"]), "dec": r4(s["dec_deg"]),
         "mag": round(float(s["mag"]), 2), "alt": [f"HR {s['hr']}"]}
    if s["bv"]: o["bv"] = float(s["bv"])
    objects.append(o); by_id[o["id"]] = o; named += 1
print("named stars:", named)

# ---------------------------------------------------------------- doubles
# name, RA (h m.m), Dec (deg arcmin), mag A, mag B, sep arcsec, PA deg, note
DOUBLES = [
 ("Albireo", "19 30.7", "+27 58", 3.1, 5.1, 34.7, 54, "Gold and sapphire-blue pair; the classic color-contrast double."),
 ("Mizar", "13 23.9", "+54 56", 2.2, 3.9, 14.4, 153, "Mizar A/B, with naked-eye Alcor 12' away; first telescopic double ever discovered."),
 ("Castor", "07 34.6", "+31 53", 1.9, 3.0, 5.4, 52, "Bright, nearly equal white pair; slowly widening. Faint red dwarf C 71\" away."),
 ("Epsilon Lyrae (Double Double)", "18 44.3", "+39 40", 4.7, 4.6, 208, 173, "Two pairs 3.5' apart, each about 2.3\" wide; splitting both is a classic seeing test at 100x+."),
 ("Almach", "02 03.9", "+42 20", 2.3, 5.0, 9.6, 63, "Gamma Andromedae. Gold and greenish-blue; rivals Albireo."),
 ("Achird", "00 49.1", "+57 49", 3.5, 7.4, 13.4, 324, "Eta Cassiopeiae. Yellow and reddish-orange nearby binary."),
 ("Iota Cassiopeiae", "02 29.1", "+67 24", 4.6, 6.9, 2.9, 230, "Triple: B at 2.9\", C (8.4) at 7.2\". Lovely at 150x."),
 ("Polaris", "02 31.8", "+89 16", 2.0, 9.0, 18.4, 236, "Faint companion; needs 80mm+ due to glare."),
 ("Rasalgethi", "17 14.6", "+14 23", 3.5, 5.4, 4.6, 104, "Alpha Herculis. Orange giant with blue-green companion."),
 ("Izar", "14 45.0", "+27 04", 2.6, 4.8, 2.9, 344, "Epsilon Bootis, 'Pulcherrima'. Gold and blue; needs steady seeing, 150x+."),
 ("Cor Caroli", "12 56.0", "+38 19", 2.9, 5.6, 19.3, 229, "Alpha CVn. Easy wide pair, white and pale yellow."),
 ("Mesarthim", "01 53.5", "+19 18", 4.5, 4.6, 7.5, 1, "Gamma Arietis. Perfectly matched white pair."),
 ("Alrescha", "02 02.0", "+02 46", 4.1, 5.2, 1.8, 265, "Alpha Piscium. Tight; needs 200x and good seeing."),
 ("Porrima", "12 41.7", "-01 27", 3.5, 3.5, 3.0, 5, "Gamma Virginis. Equal pair, widening after 2005 periastron."),
 ("Algieba", "10 20.0", "+19 50", 2.4, 3.6, 4.7, 126, "Gamma Leonis. Gold-orange pair, superb at 150x."),
 ("Rigel", "05 14.5", "-08 12", 0.2, 6.8, 9.5, 204, "Companion lost in glare at low power; try 100x+."),
 ("Sigma Orionis", "05 38.7", "-02 36", 3.8, 6.6, 12.9, 84, "Multiple: AB-D 12.9\", AB-E 42\" plus Struve 761 triple in same field."),
 ("Mintaka", "05 32.0", "-00 18", 2.4, 6.8, 52, 0, "Delta Orionis. Wide easy pair."),
 ("Trapezium", "05 35.3", "-05 23", 5.1, 6.7, 13, 30, "Theta-1 Orionis in M42: 4 bright stars; E and F components need 100x+ and steady air."),
 ("Beta Monocerotis", "06 28.8", "-07 02", 4.6, 5.0, 7.1, 132, "Triple, B-C 2.9\". Herschel: 'one of the most beautiful sights in the heavens'."),
 ("61 Cygni", "21 06.9", "+38 45", 5.2, 6.1, 31, 152, "Orange pair; nearby high-proper-motion binary."),
 ("Kuma", "17 32.2", "+55 11", 4.9, 4.9, 62, 312, "Nu Draconis. Twin white stars; splits in binoculars."),
 ("Psi Draconis", "17 41.9", "+72 09", 4.6, 5.6, 30, 15, "Wide yellow pair."),
 ("16-17 Draconis", "16 36.2", "+52 55", 5.1, 5.5, 90, 194, "Wide naked-eye pair; 17 Dra itself is a 3.4\" double."),
 ("Mu Cygni", "21 44.1", "+28 45", 4.7, 6.2, 1.5, 320, "Tight; a 200x+ challenge."),
 ("Delta Cephei", "22 29.2", "+58 25", 4.1, 6.3, 41, 191, "Prototype Cepheid variable with blue companion; easy."),
 ("Kurhah", "22 03.8", "+64 38", 4.4, 6.5, 8.3, 274, "Xi Cephei. Pretty unequal pair."),
 ("Gamma Delphini", "20 46.7", "+16 07", 4.3, 5.1, 9.0, 265, "Yellow and greenish; Struve 2725 in same low-power field."),
 ("Zeta Aquarii", "22 28.8", "-00 01", 4.3, 4.5, 2.3, 165, "Equal white pair, slowly widening."),
 ("Acrab", "16 05.4", "-19 48", 2.6, 4.9, 13.6, 20, "Beta Scorpii (Graffias). Bright easy pair."),
 ("Nu Scorpii", "16 12.0", "-19 28", 4.4, 6.4, 41, 337, "Double-double: AB 1.3\", CD 2.3\"."),
 ("Antares", "16 29.4", "-26 26", 1.0, 5.4, 2.7, 275, "Green-looking companion in red glare; needs 200x and steady seeing."),
 ("95 Herculis", "18 01.5", "+21 36", 4.9, 5.2, 6.4, 257, "Near-equal pair with subtle color contrast."),
 ("Zeta Herculis", "16 41.3", "+31 36", 2.9, 5.4, 1.4, 130, "Tight fast binary; 250x+ challenge."),
 ("Kaffaljidhma", "02 43.3", "+03 14", 3.5, 6.2, 2.6, 298, "Gamma Ceti. Tight, needs 150x+."),
 ("Miram", "02 50.7", "+55 54", 3.8, 8.5, 28, 300, "Eta Persei. Orange and blue, wide."),
 ("Theta Aurigae", "05 59.7", "+37 13", 2.6, 7.1, 3.9, 305, "Unequal, moderately tight."),
 ("Tegmine", "08 12.2", "+17 39", 5.1, 6.2, 5.9, 65, "Zeta Cancri triple; AB 1.1\" is the challenge."),
 ("Iota Cancri", "08 46.7", "+28 46", 4.0, 6.6, 30.5, 307, "Gold and blue; a spring Albireo."),
 ("54 Leonis", "10 55.6", "+24 45", 4.5, 6.3, 6.5, 111, "White and bluish."),
 ("Alula Australis", "11 18.2", "+31 32", 4.3, 4.8, 2.0, 200, "Xi UMa, fast binary, ~60 yr period; tight."),
 ("Kappa Bootis", "14 13.5", "+51 47", 4.5, 6.6, 13.4, 236, "Easy; Iota Boo wide pair nearby."),
 ("Alkalurops", "15 24.5", "+37 23", 4.3, 7.0, 108, 171, "Mu Bootis; B is itself a 2\" pair."),
 ("Xi Bootis", "14 51.4", "+19 06", 4.7, 7.0, 5.0, 300, "Yellow-orange nearby binary, ~150 yr."),
 ("Delta Serpentis", "15 34.8", "+10 32", 4.2, 5.2, 4.0, 173, "Close white pair."),
 ("Zeta Coronae Borealis", "15 39.4", "+36 38", 5.0, 6.0, 6.3, 305, "Blue-white pair."),
 ("Sigma Coronae Borealis", "16 14.7", "+33 52", 5.6, 6.5, 7.2, 238, "Slow binary; easy."),
 ("Alya", "18 56.2", "+04 12", 4.6, 5.0, 22.3, 104, "Theta Serpentis. Wide twin white pair."),
 ("Beta Lyrae", "18 50.1", "+33 22", 3.4, 8.6, 46, 149, "Eclipsing variable with wide companion."),
 ("Zeta Lyrae", "18 44.8", "+37 36", 4.3, 5.6, 44, 150, "Easy wide pair near Vega."),
 ("Algedi", "20 18.1", "-12 33", 3.6, 4.3, 381, 291, "Alpha Capricorni. Naked-eye optical pair."),
 ("Dabih", "20 21.0", "-14 47", 3.1, 6.1, 205, 267, "Beta Capricorni; gold and blue, binocular pair."),
 ("Lambda Arietis", "01 57.9", "+23 36", 4.8, 7.3, 37, 46, "Easy wide pair."),
 ("32 Eridani", "03 54.3", "-02 57", 4.8, 6.1, 6.9, 348, "Yellow and blue-green; fine color contrast."),
 ("Acamar", "02 58.3", "-40 18", 3.2, 4.1, 8.3, 90, "Theta Eridani. Bright southern pair."),
 ("Eta Orionis", "05 24.5", "-02 24", 3.6, 4.9, 1.7, 77, "Tight; 200x+."),
 ("Meissa", "05 35.1", "+09 56", 3.5, 5.5, 4.3, 44, "Lambda Orionis. Bright with easy companion."),
 ("145 Canis Majoris", "07 16.6", "-23 19", 4.8, 6.8, 26.8, 52, "The 'Winter Albireo': orange and blue."),
 ("Epsilon Monocerotis", "06 23.8", "+04 36", 4.4, 6.6, 12.1, 29, "Yellow and blue."),
 ("12 Lyncis", "06 46.2", "+59 27", 5.4, 6.0, 1.7, 70, "Triple; C (7.3) at 8.7\"."),
 ("38 Geminorum", "06 54.6", "+13 11", 4.8, 7.8, 7.1, 145, "Yellow and blue."),
 ("Wasat", "07 20.1", "+21 59", 3.5, 8.2, 5.5, 226, "Delta Geminorum; faint companion."),
 ("24 Comae Berenices", "12 35.1", "+18 23", 5.2, 6.7, 20.3, 271, "Orange and blue; a spring Albireo."),
 ("Zeta Piscium", "01 13.7", "+07 35", 5.2, 6.3, 23, 63, "Easy white pair."),
 ("Psi-1 Piscium", "01 05.7", "+21 28", 5.3, 5.5, 30, 160, "Twin white pair."),
 ("Delta Cygni", "19 45.0", "+45 08", 2.9, 6.3, 2.7, 220, "Tight unequal; 200x."),
 ("Omicron-1 Cygni", "20 13.6", "+46 44", 3.8, 7.0, 107, 173, "31 Cyg: orange with blue companion; 30 Cyg 338\" makes a colorful triple."),
 ("Sigma Cassiopeiae", "23 59.0", "+55 45", 5.0, 7.1, 3.0, 326, "Tight pair; blue-green tint."),
 ("Epsilon Hydrae", "08 46.8", "+06 25", 3.4, 6.8, 2.9, 300, "Tight, yellow and blue."),
 ("Algorab", "12 29.9", "-16 31", 3.0, 9.2, 24.2, 214, "Delta Corvi; faint 'purple' companion."),
 ("Acrux", "12 26.6", "-63 06", 1.3, 1.8, 4.0, 115, "Alpha Crucis. Brilliant southern pair."),
 ("Gamma Velorum", "08 09.5", "-47 20", 1.8, 4.3, 41, 220, "Wolf-Rayet star with wide companions."),
 ("Rigil Kentaurus", "14 39.6", "-60 50", 0.0, 1.3, 8.0, 340, "Alpha Centauri. Closest star system; bright easy pair."),
 ("Gamma Leporis", "05 44.5", "-22 27", 3.6, 6.2, 95, 350, "Wide binocular pair, yellow and orange."),
 ("Theta Tauri", "04 28.7", "+15 52", 3.4, 3.9, 337, 348, "Naked-eye pair in the Hyades."),
 ("Struve 2816", "21 39.0", "+57 29", 5.6, 7.5, 12, 120, "Triple in IC 1396; C at 20\"."),
 ("Omicron Draconis", "18 51.2", "+59 23", 4.7, 8.3, 37, 322, "Orange and blue, easy."),
 ("Epsilon Draconis", "19 48.2", "+70 16", 3.8, 7.4, 3.2, 20, "Tight, yellow and blue."),
 ("40-41 Draconis", "18 00.2", "+80 00", 5.7, 6.1, 19, 232, "Yellow twins near the pole."),
 ("Arrakis", "17 05.3", "+54 28", 5.7, 5.7, 2.4, 10, "Mu Draconis. Equal tight pair."),
 ("30 Arietis", "02 37.0", "+24 39", 6.5, 7.0, 38, 274, "Easy yellowish pair."),
]
def parse_hm(s):
    h, m = s.split(); return 15 * (int(h) + float(m) / 60)
def parse_dm(s):
    sign = -1 if s.strip().startswith("-") else 1
    d, m = s.strip().lstrip("+-").split(); return sign * (int(d) + int(m) / 60)
dbl = 0
for name, ra_s, dec_s, m1, m2, sep, pa, note in DOUBLES:
    ra, dec = parse_hm(ra_s), parse_dm(dec_s)
    i = snap(ra, dec, m1)
    if i is not None: ra, dec = float(star_arr[i, 0]), float(star_arr[i, 1])
    slug = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-")
    o = {"id": f"DBL-{slug}", "n": name, "src": "DBL", "t": "**", "ra": r4(ra), "dec": r4(dec),
         "mag": m1, "mag2": m2, "sep": sep, "pa": pa, "notes": note}
    objects.append(o); by_id[o["id"]] = o; dbl += 1
print("doubles:", dbl)

# ---------------------------------------------------------------- constellations for objects lacking one
need = [o for o in objects if not o.get("con")]
if need:
    c = SkyCoord(ra=[o["ra"] for o in need] * u.deg, dec=[o["dec"] for o in need] * u.deg)
    for o, con in zip(need, get_constellation(c, short_name=True)):
        o["con"] = con
print("constellation filled:", len(need))
# Serpens: OpenNGC uses Se1/Se2; astropy 'Ser'. Normalize both to Ser.
for o in objects:
    if o["con"] in ("Se1", "Se2"): o["con"] = "Ser"

# search text
for o in objects:
    parts = [o["n"]]
    if o.get("m"): parts += [f"M {o['m']}", f"Messier {o['m']}"]
    if o.get("c"): parts += [f"C {o['c']}", f"Caldwell {o['c']}"]
    parts += o.get("cn", []); parts += o.get("alt", [])
    norm = lambda x: re.sub(r"\s+", " ", x).strip()
    parts = [norm(x) for x in parts]
    # drop aliases that only differ from the display name by spacing/case
    key = lambda x: re.sub(r"[\s\-]", "", x).lower()
    seen = set(); keep = []
    for x in parts:
        if key(x) in seen: continue
        seen.add(key(x)); keep.append(x)
    o["s"] = " | ".join(keep)
    o.pop("alt", None)

objects.sort(key=lambda o: (o["src"] != "ADD", o["src"], len(o["id"]), o["id"]))
json.dump(objects, open(f"{OUT}/catalog.jsn", "w"), separators=(",", ":"), ensure_ascii=False)
print("catalog:", len(objects), "objects,", os.path.getsize(f"{OUT}/catalog.jsn") // 1024, "KB")

# ---------------------------------------------------------------- finder chart stars
sub = star_arr[star_arr[:, 2] <= STAR_LIMIT]
flat = [[round(float(r), 3), round(float(d), 3), round(float(m), 1)] for r, d, m in sub]
json.dump(flat, open(f"{OUT}/stars.jsn", "w"), separators=(",", ":"))
print("stars:", len(flat), os.path.getsize(f"{OUT}/stars.jsn") // 1024, "KB")

lines = [[float(r["ra1"]), float(r["dec1"]), float(r["ra2"]), float(r["dec2"])]
         for r in csv.DictReader(open(f"{STARGAZER}/constellation_lines.csv"))]
names = [[r["con"], r["name"], float(r["ra"]), float(r["dec"])]
         for r in csv.DictReader(open(f"{STARGAZER}/constellation_names.csv"))]
# constellation boundaries (Roman 1987, VizieR VI/42): [ra_lo_h, ra_hi_h, dec_lo, con] in B1875 coords
bounds = []
for line in open(f"{SRC}/constbnd.dat"):
    parts = line.split()
    if len(parts) == 4: bounds.append([float(parts[0]), float(parts[1]), float(parts[2]), parts[3]])
json.dump({"lines": lines, "names": names, "bounds": bounds}, open(f"{OUT}/lines.jsn", "w"), separators=(",", ":"))
print("bounds:", len(bounds))
print("lines:", len(lines), "names:", len(names))
