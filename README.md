# GeoShield

**Automated Geo-Spatial Intelligence for Real-Time Land Encroachment Detection & Regulatory Cross-Verification**

Team **Striders** · Build with Bharat 2.0 · South Asian University

GeoShield turns raw satellite pixel-change into **verified, permit-checked violation
dockets**. It detects vegetation loss / new construction from multi-temporal
Sentinel-2 imagery, then cross-verifies every flagged change against **WDPA
protected-area boundaries** and a **land-permit register** — entirely client-side —
and presents colour-coded risk alerts to field officers on an interactive map.

```
┌─ DATA INGESTION LAYER ──────────────┐   ┌─ SPATIAL JOIN & VERIFICATION ─┐   ┌─ INSPECTION DASHBOARD ─┐
│ Sentinel-2 / Landsat  (GEE)         │   │ Turf.js  booleanIntersects   │   │ React + react-leaflet  │
│ NDVI + NDWI differencing → threshold│──▶│ overlap %  vs WDPA boundaries │──▶│ Red / Amber / Green     │
│ vector change polygons (GeoJSON)    │   │ mock permit register         │   │ click-to-inspect docket │
│                                     │   │ 3-factor confidence score    │   │ before / after toggle   │
└─────────────────────────────────────┘   └──────────────────────────────┘   └────────────────────────┘
        ingestion/  (Python, offline)          web/src/engine/  (browser)         web/src/  (browser)
```

Live demo: **https://geoshield-striders.netlify.app** &nbsp;·&nbsp; Repo: **https://github.com/tiwarinamit131-droid/geoshield**

---

## Repository layout

```
geoshield/
├── ingestion/                     Data Ingestion Layer — offline pre-compute (Python)
│   ├── synth_scene.py             geolocated demo Sentinel-2 scene (real coords, synthetic reflectance)
│   ├── ndvi_change.py             NDVI/NDWI differencing → change_polygons.geojson + rgb PNGs
│   ├── boundaries.py              WDPA-schema protected areas + mock land-permit register
│   ├── scoring.py                 reference 3-factor score (mirrors the browser engine)
│   ├── build_data.py              ▶ run this: writes every feed into web/public/data/
│   └── gee_ndvi_change.js         REAL Sentinel-2 pipeline for the GEE Code Editor
├── web/                           Inspection Dashboard (React + Vite)
│   ├── src/engine/                Spatial Join & Verification engine (Turf.js)
│   │   ├── spatialJoin.js         booleanIntersects / intersect / area  → overlap %
│   │   ├── confidence.js          weighted 3-factor score + risk classification
│   │   └── runEngine.js           loads feeds, runs the join, returns scored violations
│   ├── src/components/            MapView · Sidebar · ViolationDetail
│   └── public/data/               the GeoJSON/JSON feeds (committed — Netlify serves them)
└── netlify.toml                   static deploy config
```

---

## The 3-factor confidence score

`ingestion/scoring.py` and `web/src/engine/confidence.js` implement the **same** formula:

| Factor | Weight | Meaning |
|---|---|---|
| `magnitude` | 0.35 | change severity — area cleared + NDVI drop + NDWI drop |
| `overlap` | 0.35 | fraction of the change polygon that falls **inside a protected boundary** |
| `permit` | 0.30 | `1.0` no permit · `0.4` expired permit · `0.0` valid permit |

`score = 0.35·magnitude + 0.35·overlap + 0.30·permit`

| Risk class | Rule | Colour |
|---|---|---|
| **HIGH** | score ≥ 0.62, inside a protected area | 🔴 Red |
| **MODERATE** | score ≥ 0.35 | 🟠 Amber |
| **LOW** | valid permit covers it, or low score | 🟢 Green |
| **OUTSIDE** | 0 % protected-area overlap | ⚪ Grey |

Demo scene result: 2 HIGH (forest clearing + wetland land-filling), 1 MODERATE
(boundary-straddling change with a lapsed permit), 1 LOW (permitted eco-resort),
1 OUTSIDE (construction on unprotected land).

---

## Run it locally

### What you need
| | |
|---|---|
| **Node.js 18+** | for the dashboard (`node --version`) |
| Python 3.10–3.13 | *only* if you want to regenerate the data feeds |
| A browser | Chrome / Edge / Firefox |

### Dashboard (this is all you need for the demo)

```bash
cd web
npm install
npm run dev
```
Open the URL it prints (http://localhost:5174).

### Regenerate the data feeds (optional)

```bash
python -m venv .venv
.venv\Scripts\activate           # Windows   (source .venv/bin/activate on mac/linux)
pip install -r ingestion/requirements.txt
python ingestion/build_data.py
```
This rewrites everything in `web/public/data/`. To use **real** Sentinel-2 instead
of the synthetic scene, run `ingestion/gee_ndvi_change.js` in the Google Earth
Engine Code Editor and export `change_polygons.geojson` into `web/public/data/`.

---

## Data & honesty note

For a guaranteed-working demo the satellite scene uses **synthetic reflectance over
real Bhopal coordinates**, and the protected-area polygons are **WDPA-schema
representative geometry** (correct field names, codes and designations; approximate
outlines). Anchored on real sites — Bhoj Wetland (Ramsar 1206), Kerwa-Kaliasot
Reserved Forest, Ratapani WLS (WDPA 2496). Swap in a real GEE export and an official
Protected Planet download and nothing else changes — the engine and dashboard are
schema-compatible.

## References

* World Database on Protected Areas — <https://www.protectedplanet.net>
* Google Earth Engine — <https://earthengine.google.com>
* Turf.js — <https://turfjs.org>
* Sentinel-2 SR Harmonized — `COPERNICUS/S2_SR_HARMONIZED`
