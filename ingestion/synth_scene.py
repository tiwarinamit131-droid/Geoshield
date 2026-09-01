"""Build a geolocated multi-spectral before/after scene for the demo AOI.

Reflectance values are synthetic, but the geometry is real: the raster is written
in UTM 43N at 10 m and lines up with actual Bhopal coordinates, so every downstream
polygon has a genuine lat/lon. Swap this module for a real Sentinel-2 export
(see ``gee_ndvi_change.js``) with no change to the rest of the pipeline.

Band order (Sentinel-2 equivalent): 0 Blue  1 Green  2 Red  3 NIR  4 SWIR
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin

from aoi import AFTER_DATE, BEFORE_DATE, EAST, NORTH, RES_M, SOUTH, UTM_CRS, WEST

OUT = Path(__file__).resolve().parent / "_work"
OUT.mkdir(exist_ok=True)

_fwd = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)

# AOI corners in UTM
_x0, _y1 = _fwd.transform(WEST, NORTH)
_x1, _y0 = _fwd.transform(EAST, SOUTH)
W = int(round((_x1 - _x0) / RES_M))
H = int(round((_y1 - _y0) / RES_M))
TRANSFORM = from_origin(_x0, _y1, RES_M, RES_M)

rng = np.random.default_rng(2025)
rows, cols = np.mgrid[0:H, 0:W]


def _lonlat_to_px(lon: float, lat: float) -> tuple[float, float]:
    x, y = _fwd.transform(lon, lat)
    return (x - _x0) / RES_M, (_y1 - y) / RES_M


# ----- land-cover layout (positioned against real features) ------------------
# Upper Lake / Bhoj Wetland occupies the NW; Kerwa-Kaliasot forest the S & SE.
def _disc(cx, cy, r):
    return (cols - cx) ** 2 + (rows - cy) ** 2 < r ** 2


lc_lake = (
    _disc(*_lonlat_to_px(77.349, 23.246), 78)
    | _disc(*_lonlat_to_px(77.366, 23.250), 60)
    | _disc(*_lonlat_to_px(77.340, 23.234), 46)
)
_forest_y0 = _lonlat_to_px(77.37, 23.223)[1]
lc_forest = (rows > _forest_y0) & ~lc_lake
lc_forest |= (_disc(*_lonlat_to_px(77.398, 23.233), 60)) & ~lc_lake
lc_urban = (~lc_forest & ~lc_lake) & (rows < _forest_y0)

SIG = {  # [blue, green, red, nir, swir]
    "forest": [0.031, 0.056, 0.041, 0.415, 0.150],
    "scrub":  [0.070, 0.110, 0.130, 0.250, 0.255],
    "lake":   [0.048, 0.070, 0.045, 0.020, 0.010],
    "urban":  [0.090, 0.115, 0.125, 0.270, 0.235],
    "built":  [0.140, 0.150, 0.175, 0.170, 0.290],
}


def _fractal(scale_px, octaves=4, seed=0):
    """Smooth multi-octave noise field in [-1, 1] for natural-looking texture."""
    from scipy.ndimage import gaussian_filter, zoom

    g = np.random.default_rng(seed)
    out = np.zeros((H, W), np.float32)
    amp = 1.0
    for o in range(octaves):
        s = max(2, int(scale_px / (2 ** o)))
        small = g.normal(0, 1, (H // s + 2, W // s + 2)).astype(np.float32)
        big = zoom(small, (H / small.shape[0], W / small.shape[1]), order=1)[:H, :W]
        out += amp * gaussian_filter(big, s / 2)
        amp *= 0.55
    out /= np.abs(out).max() + 1e-6
    return out


_TEX = _fractal(90, seed=7)          # landcover mottling
_TEX_FINE = _fractal(14, seed=8)     # fine speckle


def _compose(changes=None, seasonal=0.0):
    img = np.empty((5, H, W), dtype=np.float32)
    for b in range(5):
        layer = np.full((H, W), SIG["scrub"][b], np.float32)
        layer[lc_urban] = SIG["urban"][b]
        layer[lc_forest] = SIG["forest"][b]
        layer[lc_lake] = SIG["lake"][b]
        # per-band texture: vegetation varies most in NIR, water stays flat
        veg = (lc_forest | (~lc_urban & ~lc_lake))
        layer[veg] += (_TEX[veg] * (0.055 if b == 3 else 0.018)
                       + _TEX_FINE[veg] * 0.012)
        layer[lc_urban] += _TEX_FINE[lc_urban] * 0.03 + _TEX[lc_urban] * 0.02
        layer[lc_lake] += _TEX_FINE[lc_lake] * 0.004
        img[b] = layer
    if seasonal:
        img[3][lc_forest] -= seasonal * 0.4      # mild dry-season canopy change
        img[3][~lc_forest & ~lc_lake] -= seasonal
    for mask, sig in (changes or []):
        for b in range(5):
            img[b][mask] = sig[b] + rng.normal(0, 0.01, img[b][mask].shape).astype(np.float32)
    img += rng.normal(0.0, 0.006, img.shape).astype(np.float32)
    return np.clip(img, 0.0, 1.0)


def _rect(lon0, lat0, lon1, lat1):
    c0, r0 = _lonlat_to_px(lon0, lat1)
    c1, r1 = _lonlat_to_px(lon1, lat0)
    c0, c1 = sorted((c0, c1))
    r0, r1 = sorted((r0, r1))
    return (cols >= c0) & (cols < c1) & (rows >= r0) & (rows < r1)


# Deliberate land-use changes (see boundaries.py for how each is judged)
CHANGES = {
    "forest_clearing": _rect(77.3788, 23.2018, 77.3812, 23.2039),   # inside Kerwa RF, no permit (~5 ha)
    "lake_encroachment": _rect(77.3545, 23.2410, 77.3566, 23.2429), # Bhoj Wetland shoreline, no permit (~3 ha)
    "permitted_resort": _rect(77.3984, 23.2154, 77.4004, 23.2173),  # inside forest fringe, VALID permit
    "boundary_straddle": _rect(77.3695, 23.2238, 77.3715, 23.2262), # ~half inside RF, permit lapsed
    "outside_build": _rect(77.3524, 23.2562, 77.3543, 23.2578),     # urban, outside every protected area
}


def build():
    before = _compose(seasonal=0.0)
    after = _compose(
        seasonal=0.045,
        changes=[
            (CHANGES["forest_clearing"], SIG["built"]),
            (CHANGES["lake_encroachment"], SIG["built"]),
            (CHANGES["permitted_resort"], SIG["built"]),
            (CHANGES["boundary_straddle"], SIG["built"]),
            (CHANGES["outside_build"], SIG["built"]),
        ],
    )
    profile = dict(driver="GTiff", height=H, width=W, count=5, dtype="float32",
                   crs=UTM_CRS, transform=TRANSFORM, compress="deflate")
    for name, arr, when in (("before", before, BEFORE_DATE), ("after", after, AFTER_DATE)):
        with rasterio.open(OUT / f"{name}.tif", "w", **profile) as dst:
            dst.write(arr)
            dst.update_tags(acquired=when, platform="Sentinel-2 (synthetic reflectance)")
    print(f"  scene: {W}x{H}px @ {RES_M:.0f}m  ->  {OUT/'before.tif'} , {OUT/'after.tif'}")
    return OUT / "before.tif", OUT / "after.tif"


if __name__ == "__main__":
    build()
