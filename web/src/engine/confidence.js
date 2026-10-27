// Multi-Factor Violation Confidence Score — runs client-side in the browser.
// Mirrors ingestion/scoring.py so the live result matches the pre-computed feed.
//
//   score = W_MAG*f_magnitude + W_OVL*f_overlap + W_PRM*f_permit
//
//   f_magnitude : change severity  (area size + NDVI/NDWI drop)
//   f_overlap   : fraction of the change polygon inside a protected area
//   f_permit    : 1 = no permit, 0.4 = expired permit, 0 = valid permit

export const WEIGHTS = { magnitude: 0.35, overlap: 0.35, permit: 0.3 };
export const THRESHOLDS = { high: 0.62, moderate: 0.35 };
const PERMIT_COVER_MIN = 0.6;

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

export function fMagnitude(p) {
  const areaScore = clamp((p.area_ha ?? 0) / 3);
  const ndviScore = clamp(-(p.d_ndvi ?? 0) / 0.6);
  const ndwiScore = clamp(-(p.d_ndwi ?? 0) / 0.6);
  return +(0.45 * areaScore + 0.35 * ndviScore + 0.2 * ndwiScore).toFixed(4);
}

// rescale user-tuned weights so they always sum to 1
export function normalizeWeights(w) {
  const sum = w.magnitude + w.overlap + w.permit || 1;
  return {
    magnitude: +(w.magnitude / sum).toFixed(3),
    overlap: +(w.overlap / sum).toFixed(3),
    permit: +(w.permit / sum).toFixed(3),
  };
}

export const RISK_META = {
  HIGH: { label: "High — likely illegal", color: "#e5372c" },
  MODERATE: { label: "Moderate — verify on ground", color: "#f2a308" },
  LOW: { label: "Low — permitted / minor", color: "#2fa257" },
  OUTSIDE: { label: "Outside protected land", color: "#7c8794" },
};

// change: scored Feature (already carries overlap/permit results from spatialJoin)
export function classify({ score, fOverlap, permit, permitCover }, thresholds = THRESHOLDS) {
  if (fOverlap <= 0.001) return "OUTSIDE";
  if (permit && permit.status === "VALID" && permitCover >= PERMIT_COVER_MIN) return "LOW";
  if (score >= thresholds.high) return "HIGH";
  if (score >= thresholds.moderate) return "MODERATE";
  return "LOW";
}

export function permitFactor(permit) {
  if (!permit) return 1;
  if (permit.status === "VALID") return 0;
  if (permit.status === "EXPIRED") return 0.4;
  return 0.8;
}
