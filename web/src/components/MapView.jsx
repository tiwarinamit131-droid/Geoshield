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

// before/after swipe: clip the "after" pane to the right of the divider
function SwipeClip({ pos }) {
  const map = useMap();
  useEffect(() => {
    const pane = map.getPane("imgAfter");
    if (!pane) return;
    const update = () => {
      const size = map.getSize();
      const nw = map.containerPointToLayerPoint([0, 0]);
      const se = map.containerPointToLayerPoint(size);
      const x = nw.x + size.x * pos;
      pane.style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${x}px)`;
    };
    update();
    map.on("move zoom resize", update);
    return () => {
      map.off("move zoom resize", update);
      pane.style.clip = "";
    };
  }, [map, pos]);
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
      // on phones the docket sheet covers the lower half of the map
      window.matchMedia("(max-width: 900px)").matches
        ? { paddingTopLeft: [40, 120], paddingBottomRight: [40, map.getSize().y * 0.55], maxZoom: 16, duration: 0.6 }
        : { padding: [140, 140], maxZoom: 17, duration: 0.6 }
    );
  }, [selectedId, scored, map]);
  return null;
}

export default function MapView({
  scored,
  protectedFC,
  meta,
  epoch,
  swipePos,
  selectedId,
  visibleIds,
  onSelect,
}) {
  const shown = (id) => !visibleIds || visibleIds.includes(id);
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
    const dim = !shown(feat.properties.change_id);
    return {
      color: riskColor(feat.properties.risk_class),
      weight: sel ? 4 : 2,
      opacity: dim ? 0.25 : 1,
      fillOpacity: dim ? 0.08 : sel ? 0.65 : 0.45,
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
      {(epoch === "before" || epoch === "swipe") && (
        <Pane name="imgBefore" style={{ zIndex: 250 }}>
          <ImageOverlay url={`${BASE}data/rgb_before.png`} bounds={imgBounds} opacity={0.9} />
        </Pane>
      )}
      {(epoch === "after" || epoch === "swipe") && (
        <Pane name="imgAfter" style={{ zIndex: 251 }}>
          <ImageOverlay url={`${BASE}data/rgb_after.png`} bounds={imgBounds} opacity={0.9} />
          {epoch === "swipe" && <SwipeClip pos={swipePos} />}
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
        key={`v-${selectedId}-${visibleIds?.join() ?? "all"}-${scored.features
          .map((f) => f.properties.risk_class[0])
          .join("")}`}
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
        const dim = !shown(p.change_id);
        const center = [p.centroid[1], p.centroid[0]];
        return [
          p.risk_class === "HIGH" && !dim && (
            <CircleMarker
              key={`${p.change_id}-pulse`}
              center={center}
              radius={14}
              interactive={false}
              pathOptions={{
                className: "pulse-ring",
                color: riskColor("HIGH"),
                weight: 2,
                fill: false,
              }}
            />
          ),
          <CircleMarker
            key={`${p.change_id}-${p.risk_class}`}
            center={center}
            radius={sel ? 11 : 7}
            pathOptions={{
              color: sel ? "#ffffff" : "#0b0f0d",
              weight: sel ? 3 : 1,
              opacity: dim ? 0.3 : 1,
              fillColor: riskColor(p.risk_class),
              fillOpacity: dim ? 0.3 : 1,
            }}
            eventHandlers={{ click: () => onSelect(p.change_id) }}
          >
            <Tooltip direction="top">
              {p.risk_class} · {p.confidence.toFixed(2)} · {p.change_id}
            </Tooltip>
          </CircleMarker>,
        ];
      })}

      <MapSizer scored={scored} />
      <FlyToSelected scored={scored} selectedId={selectedId} />
    </MapContainer>
  );
}
