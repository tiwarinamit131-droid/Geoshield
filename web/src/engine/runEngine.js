// Spatial Join & Verification Engine (browser side)
// change polygons  +  WDPA boundaries  +  permit register  ->  scored violations
import { bestProtectedArea, matchingPermit } from "./spatialJoin.js";
import { WEIGHTS, classify, fMagnitude, permitFactor } from "./confidence.js";

const BASE = `${import.meta.env.BASE_URL}data`;

async function getJSON(name) {
  const r = await fetch(`${BASE}/${name}`);
  if (!r.ok) throw new Error(`failed to load ${name} (${r.status})`);
  return r.json();
}

export function scoreChange(change, protectedFC, permits) {
  const { feature: pa, fraction: fOverlap } = bestProtectedArea(change, protectedFC);
  const { permit, cover: permitCover } = matchingPermit(change, permits);

  const fMag = fMagnitude(change.properties);
  const fPrm = permitFactor(permit);
  const score = +(
    WEIGHTS.magnitude * fMag +
    WEIGHTS.overlap * fOverlap +
    WEIGHTS.permit * fPrm
  ).toFixed(4);

  const risk = classify({ score, fOverlap, permit, permitCover });

  return {
    type: "Feature",
    geometry: change.geometry,
    properties: {
      ...change.properties,
      factors: { magnitude: fMag, overlap: +fOverlap.toFixed(4), permit: fPrm },
      weights: WEIGHTS,
      confidence: score,
      risk_class: risk,
      overlap_pct: +(fOverlap * 100).toFixed(1),
      protected_area: pa?.properties.NAME ?? null,
      protected_wdpaid: pa?.properties.WDPAID ?? null,
      designation: pa?.properties.DESIG_ENG ?? null,
      permit_id: permit?.permit_id ?? null,
      permit_status: permit?.status ?? "NONE",
      permit_holder: permit?.holder ?? null,
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

  const features = changeFC.features
    .map((c) => scoreChange(c, protectedFC, permits))
    .sort((a, b) => b.properties.confidence - a.properties.confidence);

  const scored = { type: "FeatureCollection", features };

  const byClass = features.reduce((acc, f) => {
    acc[f.properties.risk_class] = (acc[f.properties.risk_class] || 0) + 1;
    return acc;
  }, {});

  return {
    scored,
    protectedFC,
    permits,
    meta,
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

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
