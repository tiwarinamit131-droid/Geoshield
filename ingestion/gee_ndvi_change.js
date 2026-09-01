/**
 * GeoShield — Step 1 (real-imagery version)  ·  Google Earth Engine Code Editor
 * ---------------------------------------------------------------------------
 * Paste into https://code.earthengine.google.com , adjust AOI / dates, Run,
 * then use "Tasks" to export `change_polygons` as GeoJSON. Drop that file into
 * web/public/data/change_polygons.geojson — the browser engine consumes it
 * unchanged. This replaces ingestion/synth_scene.py + ndvi_change.py with a
 * genuine Sentinel-2 pipeline (cloud-masked, monsoon-robust).
 */

// ---- 1. AOI (SW Bhopal green belt — Bhoj Wetland & Kerwa-Kaliasot RF) -------
var aoi = ee.Geometry.Rectangle([77.330, 23.180, 77.410, 23.260]);
Map.centerObject(aoi, 13);

var BEFORE = ['2023-10-15', '2023-12-15'];
var AFTER  = ['2025-07-15', '2025-09-15'];

// ---- 2. Cloud-masked Sentinel-2 SR median composites ------------------------
function s2(range) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(range[0], range[1])
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
    .map(function (img) {
      var scl = img.select('SCL');
      var clear = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10));
      return img.updateMask(clear).divide(10000);
    })
    .median()
    .clip(aoi);
}
var before = s2(BEFORE);
var after  = s2(AFTER);

// ---- 3. Spectral indices + differencing ------------------------------------
var ndvi = function (i) { return i.normalizedDifference(['B8', 'B4']).rename('NDVI'); };
var ndwi = function (i) { return i.normalizedDifference(['B3', 'B8']).rename('NDWI'); };
var ndbi = function (i) { return i.normalizedDifference(['B11', 'B8']).rename('NDBI'); };

var dNDVI = ndvi(after).subtract(ndvi(before));
var dNDWI = ndwi(after).subtract(ndwi(before));
var dNDBI = ndbi(after).subtract(ndbi(before));

// vegetation OR water loss, together with a built-up gain
var change = dNDVI.lt(-0.18).or(dNDWI.lt(-0.18)).and(dNDBI.gt(0.08))
  .selfMask().rename('change');

// ---- 4. Clean + vectorise -------------------------------------------------
var cleaned = change
  .focalMin(1).focalMax(1)                        // morphological open/close
  .reproject('EPSG:32643', null, 10);

var vectors = cleaned.reduceToVectors({
  geometry: aoi,
  scale: 10,
  geometryType: 'polygon',
  eightConnected: false,
  labelProperty: 'zone',
  maxPixels: 1e9,
});

// attach per-polygon stats the scoring engine expects
var withStats = vectors.map(function (f) {
  var g = f.geometry();
  var area = g.area(1);
  var mNDVI = dNDVI.reduceRegion({ reducer: ee.Reducer.mean(), geometry: g, scale: 10 }).get('NDVI');
  var mNDWI = dNDWI.reduceRegion({ reducer: ee.Reducer.mean(), geometry: g, scale: 10 }).get('NDWI');
  var mNDBI = dNDBI.reduceRegion({ reducer: ee.Reducer.mean(), geometry: g, scale: 10 }).get('NDBI');
  var vb = ndvi(before).reduceRegion({ reducer: ee.Reducer.mean(), geometry: g, scale: 10 }).get('NDVI');
  var va = ndvi(after).reduceRegion({ reducer: ee.Reducer.mean(), geometry: g, scale: 10 }).get('NDVI');
  return f.set({
    area_m2: area,
    area_ha: ee.Number(area).divide(1e4),
    d_ndvi: mNDVI, d_ndwi: mNDWI, d_ndbi: mNDBI,
    ndvi_before: vb, ndvi_after: va,
    detected_from: BEFORE[0], detected_to: AFTER[1],
    source: 'Sentinel-2 SR (GEE) NDVI/NDWI differencing',
  });
});

var minArea = withStats.filter(ee.Filter.gt('area_m2', 250));
print('change polygons:', minArea.size());

Map.addLayer(after, { bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3 }, 'after (true colour)');
Map.addLayer(dNDVI, { min: -0.5, max: 0.5, palette: ['red', 'white', 'green'] }, 'dNDVI');
Map.addLayer(minArea, { color: 'red' }, 'change polygons');

// ---- 5. Export -----------------------------------------------------------
Export.table.toDrive({
  collection: minArea,
  description: 'change_polygons',
  fileFormat: 'GeoJSON',
});
