"""Data Ingestion Layer entry point.

Runs the whole offline pre-compute and writes the feeds the browser dashboard
consumes into  web/public/data/ :

    change_polygons.geojson    NDVI/NDWI differencing output (step 1)
    protected_areas.geojson    WDPA-schema boundaries
    land_permits.json          mock permit register
    scored_violations.geojson  reference output of the scoring engine (step 2)
    rgb_before.png / rgb_after.png   true-colour temporal toggle
    meta.json                  AOI, dates, raster bounds, KPI summary

Usage:   python ingestion/build_data.py
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEB_DATA = HERE.parent / "web" / "public" / "data"


def main():
    import aoi
    import boundaries
    import ndvi_change
    import synth_scene
    from scoring import score_all

    WEB_DATA.mkdir(parents=True, exist_ok=True)
    print("GeoShield — building demo data feeds")

    before_tif, after_tif = synth_scene.build()
    change_fc, bounds, pngs = ndvi_change.run(before_tif, after_tif)
    protected_fc, permits = boundaries.build()
    scored = score_all(change_fc, protected_fc, permits)

    (WEB_DATA / "change_polygons.geojson").write_text(json.dumps(change_fc))
    (WEB_DATA / "protected_areas.geojson").write_text(json.dumps(protected_fc))
    (WEB_DATA / "land_permits.json").write_text(json.dumps(permits))
    (WEB_DATA / "scored_violations.geojson").write_text(json.dumps(scored, indent=2))
    shutil.copy(pngs["before"], WEB_DATA / "rgb_before.png")
    shutil.copy(pngs["after"], WEB_DATA / "rgb_after.png")

    counts = {}
    for f in scored["features"]:
        k = f["properties"]["risk_class"]
        counts[k] = counts.get(k, 0) + 1
    illegal_area = round(
        sum(f["properties"]["area_ha"] for f in scored["features"]
            if f["properties"]["risk_class"] == "HIGH"), 3
    )

    meta = {
        "aoi_name": "SW Bhopal green belt — Bhoj Wetland & Kerwa-Kaliasot RF",
        "bbox": [aoi.WEST, aoi.SOUTH, aoi.EAST, aoi.NORTH],
        "raster_bounds": bounds,               # [W, S, E, N] WGS84
        "before_date": aoi.BEFORE_DATE,
        "after_date": aoi.AFTER_DATE,
        "generated_note": "Synthetic reflectance over real coordinates; "
                          "protected geometry is WDPA-schema representative.",
        "kpi": {
            "changes_detected": len(scored["features"]),
            "by_class": counts,
            "high_risk_area_ha": illegal_area,
        },
    }
    (WEB_DATA / "meta.json").write_text(json.dumps(meta, indent=2))

    print("\n  wrote ->", WEB_DATA)
    for f in scored["features"]:
        p = f["properties"]
        print(f"   {p['risk_class']:9} score={p['confidence']:.2f} "
              f"ovl={p['overlap_pct']:5.1f}%  permit={p['permit_status']:7} "
              f"{p['protected_area'] or '(outside)'}")
    print("\nNext:  cd web && npm install && npm run dev")


if __name__ == "__main__":
    main()
