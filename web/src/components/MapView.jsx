import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  ImageOverlay,
  CircleMarker,
  Tooltip,
  Pane,
  useMap,
} from "react-leaflet";
import * as turf from "@turf/turf";
import { riskColor, designationColor } from "../lib/format.js";

const BASE = import.meta.env.BASE_URL;

function MapSizer({ scored }) {
  const map = useMap();
  useEffect(() => {
    const fitBounds = () => {
      if (!scored?.features?.length) return;
      const [w, s, e, n] = turf.bbox(scored);
      map.fitBounds(
        [
          [s, w],
          [n, e],
        ],
        { padding: [50, 50], maxZoom: 16 }
      );
    };
    const sync = () => {
      map.invalidateSize(false);
    };

    const el = map.getContainer();
    const ro = new ResizeObserver(() => {
      sync();
    });
    ro.observe(el);

    const timers = [80, 300, 800, 1500].map((ms) =>
      setTimeout(() => {
        sync();
        fitBounds();
      }, ms)
    );
    window.addEventListener("resize", sync);
    map.whenReady(() => {
      sync();
      fitBounds();
    });

    return () => {
      ro.disconnect();
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", sync);
    };
  }, [scored, map]);
  return null;
}

function FlyToSelected({ scored, selectedId }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const f = scored.features.find((x) => x.properties.change_id === selectedId);
    if (!f) return;
    const [w, s, e, n] = turf.bbox(f);
    map.flyToBounds(
      [
        [s, w],
        [n, e],
      ],
      { padding: [140, 140], maxZoom: 17, duration: 0.6 }
    );
  }, [selectedId, scored, map]);
  return null;
}

export default function MapView({ scored, protectedFC, meta, epoch, selectedId, onSelect }) {
  const rb = meta.raster_bounds; // [W, S, E, N]
  const imgBounds = [
    [rb[1], rb[0]],
    [rb[3], rb[2]],
  ];

  const protectedStyle = (feat) => ({
    color: designationColor(feat.properties.DESIG_ENG),
    weight: 2,
    dashArray: "5 4",
    fillOpacity: 0.05,
  });

  const violStyle = (feat) => {
    const sel = feat.properties.change_id === selectedId;
    return {
      color: riskColor(feat.properties.risk_class),
      weight: sel ? 4 : 2,
      fillOpacity: sel ? 0.65 : 0.45,
    };
  };

  return (
    <MapContainer center={[meta.bbox[1], meta.bbox[0]]} zoom={13}>
      <TileLayer
        attribution="Tiles &copy; Esri — Maxar, Earthstar Geographics"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
      />

      {/* analysed Sentinel-2 scene sits below the vector layers */}
      {epoch !== "off" && (
        <Pane name="imagery" style={{ zIndex: 250 }}>
          <ImageOverlay
            key={epoch}
            url={`${BASE}data/rgb_${epoch}.png`}
            bounds={imgBounds}
            opacity={0.85}
          />
        </Pane>
      )}

      <GeoJSON data={protectedFC} style={protectedStyle}
        onEachFeature={(feat, layer) =>
          layer.bindTooltip(
            `${feat.properties.NAME} — ${feat.properties.DESIG_ENG}`,
            { sticky: true }
          )
        }
      />

      <GeoJSON
        key={`v-${selectedId}`}
        data={scored}
        style={violStyle}
        onEachFeature={(feat, layer) => {
          const p = feat.properties;
          layer.bindTooltip(
            `${p.risk_class} · score ${p.confidence.toFixed(2)} · ${p.change_id}`,
            { sticky: true }
          );
          layer.on("click", () => onSelect(p.change_id));
        }}
      />

      {/* always-visible centroid markers so small polygons are findable at any zoom */}
      {scored.features.map((f) => {
        const p = f.properties;
        const sel = p.change_id === selectedId;
        return (
          <CircleMarker
            key={p.change_id}
            center={[p.centroid[1], p.centroid[0]]}
            radius={sel ? 11 : 7}
            pathOptions={{
              color: "#0b0f0d",
              weight: sel ? 2 : 1,
              fillColor: riskColor(p.risk_class),
              fillOpacity: 1,
            }}
            eventHandlers={{ click: () => onSelect(p.change_id) }}
          >
            <Tooltip direction="top">
              {p.risk_class} · {p.confidence.toFixed(2)} · {p.change_id}
            </Tooltip>
          </CircleMarker>
        );
      })}

      <MapSizer scored={scored} />
      <FlyToSelected scored={scored} selectedId={selectedId} />
    </MapContainer>
  );
}
