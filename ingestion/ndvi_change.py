"""Step 1 of the PPT pipeline — Satellite Ingestion & NDVI Differencing.

  NDVI(after) - NDVI(before)  ->  threshold  ->  vector change polygons (GeoJSON)

Also emits NDWI differencing (water index) so wetland land-filling is caught, and
true-colour before/after PNGs for the dashboard's temporal toggle.
Output CRS: WGS84 (EPSG:4326) so the browser engine can consume it directly.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio import features
from rasterio.warp import transform_bounds
from scipy import ndimage as ndi
from shapely.geometry import mapping, shape
from shapely.ops import transform as shp_transform
from pyproj import Transformer

from aoi import AFTER_DATE, BEFORE_DATE

_EPS = 1e-6
DNDVI_LOSS = -0.18      # NDVI drop that counts as vegetation removal
DNDWI_LOSS = -0.18      # NDWI drop that counts as water -> land
DNDBI_GAIN = 0.08       # built-up index rise
MIN_AREA_M2 = 250.0


def _nd(a, b):
    return (a - b) / (a + b + _EPS)


def _indices(stack):
    blue, green, red, nir, swir = stack
    return dict(ndvi=_nd(nir, red), ndwi=_nd(green, nir), ndbi=_nd(swir, nir))


def run(before_tif: Path, after_tif: Path):
    with rasterio.open(before_tif) as s:
        b = s.read().astype("float32")
        transform, crs, W, H = s.transform, s.crs, s.width, s.height
    with rasterio.open(after_tif) as s:
        a = s.read().astype("float32")

    bi, ai = _indices(b), _indices(a)
    d_ndvi = ai["ndvi"] - bi["ndvi"]
    d_ndwi = ai["ndwi"] - bi["ndwi"]
    d_ndbi = ai["ndbi"] - bi["ndbi"]

    change = ((d_ndvi < DNDVI_LOSS) | (d_ndwi < DNDWI_LOSS)) & (d_ndbi > DNDBI_GAIN)
    change = ndi.binary_opening(change, np.ones((3, 3)))
    change = ndi.binary_closing(change, np.ones((3, 3)))
    labels, n = ndi.label(change)

    to_wgs = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    reproj = lambda g: shp_transform(lambda x, y, z=None: to_wgs.transform(x, y), g)

    feats = []
    for geom, val in features.shapes(labels.astype(np.int32), mask=labels > 0, transform=transform):
        poly_utm = shape(geom)
        if poly_utm.area < MIN_AREA_M2:
            continue
        comp = labels == int(val)
        poly = reproj(poly_utm)
        c = poly.centroid
        feats.append({
            "type": "Feature",
            "geometry": mapping(poly),
            "properties": {
                "change_id": f"CHG-{len(feats)+1:03d}",
                "area_m2": round(poly_utm.area, 1),
                "area_ha": round(poly_utm.area / 1e4, 4),
                "ndvi_before": round(float(bi["ndvi"][comp].mean()), 3),
                "ndvi_after": round(float(ai["ndvi"][comp].mean()), 3),
                "d_ndvi": round(float(d_ndvi[comp].mean()), 3),
                "d_ndwi": round(float(d_ndwi[comp].mean()), 3),
                "d_ndbi": round(float(d_ndbi[comp].mean()), 3),
                "centroid": [round(c.x, 6), round(c.y, 6)],
                "detected_from": BEFORE_DATE,
                "detected_to": AFTER_DATE,
                "source": "Sentinel-2 NDVI differencing",
            },
        })

    fc = {"type": "FeatureCollection", "features": feats}
    bounds = list(transform_bounds(crs, "EPSG:4326", *rasterio.open(before_tif).bounds))

    # true-colour PNGs for the before / after toggle
    pngs = {}
    for name, arr in (("before", b), ("after", a)):
        rgb = np.clip(np.stack([arr[2], arr[1], arr[0]], -1) * 3.1, 0, 1) ** 0.85
        p = before_tif.parent / f"rgb_{name}.png"
        Image.fromarray((rgb * 255).astype("uint8")).save(p)
        pngs[name] = p

    print(f"  change detection: {len(feats)} polygons from {n} raw components")
    return fc, bounds, pngs


if __name__ == "__main__":
    w = Path(__file__).resolve().parent / "_work"
    fc, bounds, _ = run(w / "before.tif", w / "after.tif")
    (w / "change_polygons.geojson").write_text(json.dumps(fc, indent=2))
    print("bounds:", bounds)
