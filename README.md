# astrologging — `%astro`, a deep-sky observing log on Urbit

An Urbit app for logging the objects you have observed. Search a bundled
catalog of ~16,000 objects, read the key facts, get magnification and filter
advice tuned to your own telescopes and eyepieces, look at a finder chart and
a DSS photo, then mark the object as seen or log a full observation (site,
gear, seeing, transparency, notes, and whether you imaged it and with which
imaging setup).

Open it at **`http://localhost:8081/astro`** on the fakezod in this folder
(login code `lidlut-tabwed-pillex-ridrup`). See `SHIP.md` for ship operations.

## What is in the catalog

| source | objects | notes |
|---|---|---|
| OpenNGC (NGC + IC) | ~13,000 | with Messier cross-refs, common names, sizes, magnitudes, surface brightness |
| OpenNGC addendum | 64 | Pleiades, Hyades, Coathanger, LMC, Double Cluster, … |
| Caldwell | 109 | mapped onto the NGC/IC/addendum objects |
| Barnard dark nebulae | 349 | VizieR VII/220A, with Barnard's own notes |
| Sharpless HII regions | 313 | VizieR VII/20, precessed B1950 → J2000 |
| Lynds dark nebulae (LDN) | 1,787 | VizieR VII/7A, precessed, with Barnard cross-ids |
| Named bright stars | 443 | from the stargazer HR star list |
| Bright double stars | 81 | curated list; positions snapped to the star catalog |
| Solar system | 9 | Sun, Moon and the planets, computed in the browser (`web/planets.js`: JPL approximate elements; Schlyter's Moon with parallax), refreshed every 30 s |

Finder charts use 61,816 stars to magnitude 8.5 plus constellation lines; the
Roman (1987) boundary table gives constellations for moving objects.

The desk ships a `desk.docket-0` with `site+/astro`, so it appears as an
**Astro Log** tile in Landscape. The page is responsive: under 720 px it
switches to a phone layout (list ↔ detail, bottom tab bar, collapsible
filters) and can be added to a home screen via the web manifest.

**Night plans.** The Plan tab keeps target lists per night on the ship
(`plans` in agent state). For a date and your site it computes sunset,
astronomical darkness, sunrise, moon phase and rise/set, orders targets by
transit (or by their highest point in the dark window), and suggests unseen,
well-placed objects (bright-moon nights get clusters, doubles and
planetaries). **Print / PDF** opens a print preview: a cover sheet with the
night's timings and target table, then one A4 sheet per target with facts,
eyepiece picks for your first two scopes, a 10° Telrad finder chart and a 2°
eyepiece chart (black-on-white), the DSS2 image, and lines for notes. Use the
browser's print dialog and "Save as PDF".

Everything is rebuilt by `tools/build_catalog.py` (needs `astropy`, `numpy`)
from `vendor/OpenNGC`, `data-src/`, and `~/Research/stargazer/data`.

## Layout

```
desk/                      the %astro desk (rsync'd to zod/astro, then |commit)
  sur/astro.hoon           observation / scope / eyepiece / rig types, actions, updates
  lib/astro.hoon           json encoders/decoders
  app/astro.hoon           the Gall agent: state, pokes, scries, /updates subscription
  app/astro-fileserver.hoon  Fang-'s foo-fileserver (unmodified), serves /web at /astro
  app/fileserver/config.hoon  web-root /astro, extensionless → index.html
  mar/astro/{action,update}.hoon   marks
  mar/jsn.hoon             raw-bytes JSON mark so the 3 MB catalog is never parsed on-ship
  web/index.html, app.js, planets.js, style.css   the single-page UI (no build step)
  web/tile.svg, manifest.json  Landscape tile image and PWA manifest
  desk.docket-0 + sur/lib/mar docket   Landscape tile (site+/astro, no glob)
  web/data/{catalog,stars,lines}.jsn  generated data
tools/build_catalog.py     builds web/data
tools/mcp.sh               curl helper for the ship's MCP endpoint (commit, build, install…)
urbit-mcp/                 gwbtc/urbit-mcp checkout (built into the %mcp desk)
vendor/                    OpenNGC and Fang-/suite checkouts
data-src/                  VizieR downloads
zod/                       the fakezod pier (tmux session `astro-zod`, port 8081)
```

## Agent interface

Pokes take mark `%astro-action` or `%json`:

```json
{"add-obs": {"obj":"NGC0224","when":1757509000000,"site":"Backyard","scope":"8\" Dobsonian",
             "eyepiece":"25mm Plossl","seeing":3,"transparency":4,"notes":"…","imaged":true,"rig":"Seestar S50"}}
{"edit-obs": {"id":1,"observation":{…}}}      {"del-obs": 1}
{"put-scope": {"name":"…","kind":"dob","aperture":203,"focal":1200,"notes":""}}   {"del-scope":"name"}
{"put-eyepiece": {"name":"…","focal":250,"afov":52,"notes":""}}   (focal in 0.1 mm)  {"del-eyepiece":"name"}
{"put-rig": {"name":"…","optics":"…","camera":"…","mount":"…","filters":"…","notes":""}}   {"del-rig":"name"}
{"set-site": "Backyard"}
{"put-plan": {"name":"Night of 2026-09-12","date":1757692800000,"site":"Club","targets":["NGC7000","SOL-Saturn"],"notes":""}}
{"del-plan": "Night of 2026-09-12"}
```

Scries (all return JSON; over HTTP: `GET /~/scry/astro/<path>.json`):
`/x/state`, `/x/obs`, `/x/obs/<obj-id>`, `/x/seen`, `/x/gear`, `/x/site`, `/x/plans`.
Subscribe to `/updates` for `%astro-update` facts. Object ids are the catalog
ids (`NGC0224`, `IC0434`, `B033`, `SH2-155`, `LDN1773`, `HR7001`, `DBL-Albireo`).

## Booting your own ship for it

1. Boot a fake ship (or use a real one) and note its HTTP port and `+code`.
2. `|new-desk %astro`, `|mount %astro`, copy `desk/` into the mounted desk, `|commit %astro`, `|install our %astro`.
3. Open `http://<ship>/astro`. The Landscape tile appears automatically.

`tools/mcp.sh` drives the ship through [urbit-mcp](https://github.com/gwbtc/urbit-mcp)
if you have it installed; it reads the auth cookie from `$ASTRO_COOKIE`, a
`.ship-cookie` file, or `SHIP.md` (all git-ignored).

## Developing

```sh
python3 tools/build_catalog.py           # regenerate desk/web/data
rsync -a --delete desk/ zod/astro/       # copy into the mounted desk
tools/mcp.sh mcp/commit-desk '{"desk":"astro"}'
tools/mcp.sh mcp/test-build '{"desk":"astro","path":"/app/astro/hoon"}'
```

The fileserver clears its Eyre cache whenever `/web` changes, so a commit is
enough to see frontend edits after a reload.
