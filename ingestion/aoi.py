"""Area of interest for the GeoShield demo: the SW Bhopal green belt.

Covers part of the Bhoj Wetland (Upper Lake, Ramsar 1206), the Kerwa / Kaliasot
Reserved Forest and the northern fringe of the Ratapani landscape — the exact
kind of protected-ecosystem interface the problem statement targets.
"""
from __future__ import annotations

# WGS84 bounding box  (lon/lat)
WEST, SOUTH, EAST, NORTH = 77.330, 23.180, 77.410, 23.260

# raster grid
RES_M = 10.0                     # metres / pixel  (Sentinel-2 native)
UTM_CRS = "EPSG:32643"           # UTM 43N
WGS84 = "EPSG:4326"

BEFORE_DATE = "2023-11-12"
AFTER_DATE = "2025-08-27"

CENTER = ((WEST + EAST) / 2, (SOUTH + NORTH) / 2)
