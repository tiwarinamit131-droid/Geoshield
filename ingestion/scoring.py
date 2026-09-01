"""Multi-Factor Violation Confidence Score (reference implementation).

Mirrors web/src/engine/confidence.js exactly so the pre-computed
scored_violations.geojson matches what the browser engine produces live.

    score = W_MAG * f_magnitude   (change severity: area + NDVI drop)
          + W_OVL * f_overlap      (fraction of change area inside a protected area)
          + W_PRM * f_permit       (1 = no permit, 0.4 = expired, 0 = valid permit)

    class:  HIGH     score >= 0.62   (Red   — likely illegal)
            MODERATE score >= 0.35   (Amber — needs field verification)
            LOW      otherwise       (Green — permitted / low risk)

A VALID permit covering >= 60% of the change forces LOW (permitted development).
A change with zero protected-area overlap is tagged OUTSIDE (informational).
"""
from __future__ import annotations

from shapely.geometry import shape

W_MAG, W_OVL, W_PRM = 0.35, 0.35, 0.30
T_HIGH, T_MODERATE = 0.62, 0.35
PERMIT_COVER_MIN = 0.60


def _clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def f_magnitude(props: dict) -> float:
    area_score = _clamp(props.get("area_ha", 0.0) / 3.0)
    ndvi_score = _clamp(-props.get("d_ndvi", 0.0) / 0.6)
    ndwi_score = _clamp(-props.get("d_ndwi", 0.0) / 0.6)
    return round(0.45 * area_score + 0.35 * ndvi_score + 0.20 * ndwi_score, 4)


def score_change(change_feat: dict, protected_fc: dict, permits: dict) -> dict:
    poly = shape(change_feat["geometry"])
    area = poly.area or 1e-12

    # --- factor 2: overlap with protected areas -----------------------------
    best_pa, ov_area = None, 0.0
    for pa in protected_fc["features"]:
        g = shape(pa["geometry"])
        if not poly.intersects(g):
            continue
        a = poly.intersection(g).area
        if a > ov_area:
            best_pa, ov_area = pa, a
    f_ovl = _clamp(ov_area / area)

    # --- factor 3: permit status -----------------------------------------
    matched_permit, permit_cover = None, 0.0
    for pm in permits.get("permits", []):
        g = shape(pm["footprint"])
        if not poly.intersects(g):
            continue
        cover = poly.intersection(g).area / area
        if cover > permit_cover:
            matched_permit, permit_cover = pm, cover
    if matched_permit is None:
        f_prm = 1.0
    elif matched_permit["status"] == "VALID":
        f_prm = 0.0
    elif matched_permit["status"] == "EXPIRED":
        f_prm = 0.4
    else:
        f_prm = 0.8

    f_mag = f_magnitude(change_feat["properties"])
    score = round(W_MAG * f_mag + W_OVL * f_ovl + W_PRM * f_prm, 4)

    if f_ovl <= 0.001:
        klass = "OUTSIDE"
    elif matched_permit and matched_permit["status"] == "VALID" and permit_cover >= PERMIT_COVER_MIN:
        klass = "LOW"
    elif score >= T_HIGH:
        klass = "HIGH"
    elif score >= T_MODERATE:
        klass = "MODERATE"
    else:
        klass = "LOW"

    props = dict(change_feat["properties"])
    props.update(
        factors={"magnitude": f_mag, "overlap": round(f_ovl, 4), "permit": f_prm},
        weights={"magnitude": W_MAG, "overlap": W_OVL, "permit": W_PRM},
        confidence=score,
        risk_class=klass,
        overlap_pct=round(f_ovl * 100, 1),
        protected_area=(best_pa["properties"]["NAME"] if best_pa else None),
        protected_wdpaid=(best_pa["properties"]["WDPAID"] if best_pa else None),
        designation=(best_pa["properties"]["DESIG_ENG"] if best_pa else None),
        permit_id=(matched_permit["permit_id"] if matched_permit else None),
        permit_status=(matched_permit["status"] if matched_permit else "NONE"),
    )
    return {"type": "Feature", "geometry": change_feat["geometry"], "properties": props}


def score_all(change_fc, protected_fc, permits):
    feats = [score_change(f, protected_fc, permits) for f in change_fc["features"]]
    feats.sort(key=lambda f: f["properties"]["confidence"], reverse=True)
    return {"type": "FeatureCollection", "features": feats}
