"""Step 2 inputs — regulatory reference layers.

* protected_areas.geojson : WDPA-schema boundaries (World Database on Protected Areas).
  Geometry here is representative and sized to the demo AOI; field names, codes and
  designations follow the real WDPA standard so a genuine Protected Planet export
  drops in unchanged. Anchored on real sites:
     - Bhoj Wetland .......... Ramsar Site 1206 (designated 2002-08-19)
     - Kerwa-Kaliasot ........ Reserved Forest, Bhopal Forest Division
     - Ratapani .............. Wildlife Sanctuary / Tiger Reserve (WDPAID 2496)

* land_permits.json : mock building / land-use permit register (stand-in for the
  ULB + Revenue Dept records the problem statement refers to).
"""
from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent / "_work"
OUT.mkdir(exist_ok=True)


def _poly(coords):
    return {"type": "Polygon", "coordinates": [coords + [coords[0]]]}


PROTECTED_AREAS = {
    "type": "FeatureCollection",
    "name": "protected_areas",
    "note": "WDPA-schema; representative geometry for the SW Bhopal demo AOI.",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "WDPAID": 900558,
                "NAME": "Bhoj Wetland",
                "ORIG_NAME": "Bhoj Wetland (Upper & Lower Lake)",
                "DESIG_ENG": "Ramsar Site, Wetland of International Importance",
                "DESIG_TYPE": "International",
                "IUCN_CAT": "Not Reported",
                "MARINE": "0",
                "REP_AREA_KM2": 34.82,
                "STATUS": "Designated",
                "STATUS_YR": 2002,
                "GOV_TYPE": "Sub-national ministry or agency",
                "MANG_AUTH": "M.P. State Wetland Authority / EPCO",
                "ramsar_ref": 1206,
            },
            "geometry": _poly([
                [77.3355, 23.2520], [77.3520, 23.2560], [77.3690, 23.2540],
                [77.3760, 23.2455], [77.3720, 23.2330], [77.3560, 23.2295],
                [77.3410, 23.2325], [77.3335, 23.2420],
            ]),
        },
        {
            "type": "Feature",
            "properties": {
                "WDPAID": 555625113,
                "NAME": "Kerwa-Kaliasot Reserved Forest",
                "ORIG_NAME": "Kerwa & Kaliasot RF blocks",
                "DESIG_ENG": "Reserved Forest",
                "DESIG_TYPE": "National",
                "IUCN_CAT": "Not Applicable",
                "MARINE": "0",
                "REP_AREA_KM2": 21.4,
                "STATUS": "Designated",
                "STATUS_YR": 1976,
                "GOV_TYPE": "Sub-national ministry or agency",
                "MANG_AUTH": "Divisional Forest Officer, Bhopal (General) Division",
                "legal_basis": "Indian Forest Act 1927, s.20",
            },
            "geometry": _poly([
                [77.3540, 23.2240], [77.3760, 23.2250], [77.3980, 23.2232],
                [77.4090, 23.2150], [77.4080, 23.1950], [77.3900, 23.1815],
                [77.3650, 23.1800], [77.3520, 23.1930], [77.3505, 23.2110],
            ]),
        },
        {
            "type": "Feature",
            "properties": {
                "WDPAID": 2496,
                "NAME": "Ratapani",
                "ORIG_NAME": "Ratapani Wildlife Sanctuary",
                "DESIG_ENG": "Wildlife Sanctuary",
                "DESIG_TYPE": "National",
                "IUCN_CAT": "IV",
                "MARINE": "0",
                "REP_AREA_KM2": 1271.46,
                "STATUS": "Notified",
                "STATUS_YR": 1976,
                "GOV_TYPE": "Sub-national ministry or agency",
                "MANG_AUTH": "Field Director, Ratapani Tiger Reserve",
                "note": "Northern buffer edge; core lies ~35 km SE of Bhopal.",
            },
            "geometry": _poly([
                [77.4020, 23.1980], [77.4110, 23.1980], [77.4110, 23.1800],
                [77.4020, 23.1800],
            ]),
        },
    ],
}


LAND_PERMITS = {
    "register": "Mock Building & Land-Use Permit Register (demo)",
    "authorities": ["Bhopal Municipal Corporation", "Town & Country Planning, M.P.", "Revenue Dept."],
    "permits": [
        {
            "permit_id": "TCP/BPL/2022/ECO/0117",
            "holder": "Kerwa Hospitality Pvt. Ltd.",
            "type": "Eco-tourism resort — conditional NOC",
            "status": "VALID",
            "issued": "2022-02-18",
            "valid_until": "2027-02-17",
            "authority": "Town & Country Planning, M.P.",
            "footprint": _poly([
                [77.3968, 23.2140], [77.4022, 23.2140], [77.4022, 23.2188], [77.3968, 23.2188],
            ]),
        },
        {
            "permit_id": "BMC/BP/2019/4471",
            "holder": "R. Nair",
            "type": "Residential building permit",
            "status": "EXPIRED",
            "issued": "2019-07-30",
            "valid_until": "2022-07-29",
            "authority": "Bhopal Municipal Corporation",
            "footprint": _poly([
                [77.3688, 23.2232], [77.3726, 23.2232], [77.3726, 23.2262], [77.3688, 23.2262],
            ]),
        },
        {
            "permit_id": "BMC/BP/2023/1180",
            "holder": "Sahai Constructions",
            "type": "Commercial complex permit",
            "status": "VALID",
            "issued": "2023-05-04",
            "valid_until": "2026-05-03",
            "authority": "Bhopal Municipal Corporation",
            "footprint": _poly([
                [77.3506, 23.2548], [77.3560, 23.2548], [77.3560, 23.2592], [77.3506, 23.2592],
            ]),
        },
    ],
}


def build():
    (OUT / "protected_areas.geojson").write_text(json.dumps(PROTECTED_AREAS, indent=2))
    (OUT / "land_permits.json").write_text(json.dumps(LAND_PERMITS, indent=2))
    print(f"  boundaries: {len(PROTECTED_AREAS['features'])} protected areas, "
          f"{len(LAND_PERMITS['permits'])} permits")
    return PROTECTED_AREAS, LAND_PERMITS


if __name__ == "__main__":
    build()
