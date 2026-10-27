// Spatial Join & Verification Engine (browser side)
// change polygons  +  WDPA boundaries  +  permit register  ->  scored violations
//
// The expensive Turf.js joins run once in joinChanges(); scoreAll() is cheap, so
// the dashboard can re-score live whenever the analyst retunes weights/thresholds.
import { bestProtectedArea, matchingPermit } from "./spatialJoin.js";
import { WEIGHTS, THRESHOLDS, classify, fMagnitude, permitFactor } from "./confidence.js";

const BASE = `${import.meta.env.BASE_URL}data`;

async function getJSON(name) {
  const r = await fetch(`${BASE}/${name}`);
  if (!r.ok) throw new Error(`failed to load ${name} (${r.status})`);
  return r.json();
}

// spatial join for one change polygon (weight-independent)
export function joinChange(change, protectedFC, permits) {
  const { feature: pa, fraction: fOverlap } = bestProtectedArea(change, protectedFC);
  const { permit, cover: permitCover } = matchingPermit(change, permits);
  return { change, pa, fOverlap, permit, permitCover };
}

export function scoreJoined(j, weights = WEIGHTS, thresholds = THRESHOLDS) {
  const { change, pa, fOverlap, permit, permitCover } = j;
  const fMag = fMagnitude(change.properties);
  const fPrm = permitFactor(permit);
  const score = +(
    weights.magnitude * fMag +
    weights.overlap * fOverlap +
    weights.permit * fPrm
  ).toFixed(4);

  const risk = classify({ score, fOverlap, permit, permitCover }, thresholds);

  return {
    type: "Feature",
    geometry: change.geometry,
    properties: {
      ...change.properties,
      factors: { magnitude: fMag, overlap: +fOverlap.toFixed(4), permit: fPrm },
      weights,
      confidence: score,
      risk_class: risk,
      overlap_pct: +(fOverlap * 100).toFixed(1),
      protected_area: pa?.properties.NAME ?? null,
      protected_wdpaid: pa?.properties.WDPAID ?? null,
      designation: pa?.properties.DESIG_ENG ?? null,
      permit_id: permit?.permit_id ?? null,
      permit_status: permit?.status ?? "NONE",
      permit_holder: permit?.holder ?? null,
      permit_valid_until: permit?.valid_until ?? null,
      permit_authority: permit?.authority ?? null,
    },
  };
}

export function scoreChange(change, protectedFC, permits) {
  return scoreJoined(joinChange(change, protectedFC, permits));
}

// re-score every joined change and rebuild the KPIs
export function scoreAll(joined, meta, weights = WEIGHTS, thresholds = THRESHOLDS) {
  const features = joined
    .map((j) => scoreJoined(j, weights, thresholds))
    .sort((a, b) => b.properties.confidence - a.properties.confidence);

  const byClass = features.reduce((acc, f) => {
    acc[f.properties.risk_class] = (acc[f.properties.risk_class] || 0) + 1;
    return acc;
  }, {});

  return {
    scored: { type: "FeatureCollection", features },
    kpi: {
      total: features.length,
      byClass,
      highArea: +features
        .filter((f) => f.properties.risk_class === "HIGH")
        .reduce((s, f) => s + (f.properties.area_ha || 0), 0)
        .toFixed(3),
      leadDays: daysBetween(meta.before_date, meta.after_date),
    },
  };
}

export async function runEngine() {
  const [changeFC, protectedFC, permits, meta] = await Promise.all([
    getJSON("change_polygons.geojson"),
    getJSON("protected_areas.geojson"),
    getJSON("land_permits.json"),
    getJSON("meta.json"),
  ]);

  const joined = changeFC.features.map((c) => joinChange(c, protectedFC, permits));

  return { joined, protectedFC, permits, meta, ...scoreAll(joined, meta) };
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
