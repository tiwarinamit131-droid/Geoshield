// Deterministic client-side spatial joining with Turf.js
// (@turf/turf bundles boolean-intersects, intersect, area, etc.)
import * as turf from "@turf/turf";

// area of a GeoJSON polygon feature/geometry, in m^2
const areaOf = (g) => {
  try {
    return turf.area(g);
  } catch {
    return 0;
  }
};

// fraction (0..1) of `change` that lies inside `other`
export function overlapFraction(change, other) {
  if (!turf.booleanIntersects(change, other)) return 0;
  const a = areaOf(change);
  if (!a) return 0;
  let inter = 0;
  try {
    const clip = turf.intersect(turf.featureCollection([change, other]));
    inter = clip ? areaOf(clip) : 0;
  } catch {
    inter = 0;
  }
  return Math.min(1, inter / a);
}

// best-overlapping protected area for a change polygon
export function bestProtectedArea(change, protectedFC) {
  let best = null;
  let frac = 0;
  for (const pa of protectedFC.features) {
    const f = overlapFraction(change, pa);
    if (f > frac) {
      frac = f;
      best = pa;
    }
  }
  return { feature: best, fraction: frac };
}

// matching permit whose footprint covers the largest share of the change
export function matchingPermit(change, permits) {
  let match = null;
  let cover = 0;
  for (const pm of permits.permits ?? []) {
    const footprint = turf.feature(pm.footprint);
    const f = overlapFraction(change, footprint);
    if (f > cover) {
      cover = f;
      match = pm;
    }
  }
  return { permit: match, cover };
}
