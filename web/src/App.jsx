import { useEffect, useMemo, useState } from "react";
import { runEngine } from "./engine/runEngine.js";
import MapView from "./components/MapView.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ViolationDetail from "./components/ViolationDetail.jsx";
import { riskColor, designationColor } from "./lib/format.js";

export default function App() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [epoch, setEpoch] = useState("off");

  useEffect(() => {
    runEngine()
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  const selected = useMemo(
    () => data?.scored.features.find((f) => f.properties.change_id === selectedId) ?? null,
    [data, selectedId]
  );

  if (err)
    return <div className="center-msg">Could not load data feeds — {err}</div>;
  if (!data) return <div className="center-msg">Running spatial-join engine…</div>;

  const { scored, protectedFC, meta, kpi } = data;
  const c = kpi.byClass;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">◈</span>
          <div>
            <h1>GeoShield</h1>
            <p>
              Automated satellite change-detection cross-verified against WDPA protected
              boundaries &amp; land-permit records — {meta.aoi_name}
            </p>
          </div>
        </div>
        <div className="kpis">
          <div className="kpi high">
            <div className="v">{c.HIGH || 0}</div>
            <div className="l">High risk</div>
          </div>
          <div className="kpi">
            <div className="v">{c.MODERATE || 0}</div>
            <div className="l">Verify</div>
          </div>
          <div className="kpi">
            <div className="v">{kpi.highArea.toFixed(2)}</div>
            <div className="l">ha protected lost</div>
          </div>
          <div className="kpi">
            <div className="v">{kpi.leadDays}d</div>
            <div className="l">imagery gap</div>
          </div>
        </div>
      </header>

      <div className="layout">
        <Sidebar scored={scored} selectedId={selectedId} onSelect={setSelectedId} />

        <div className="mapwrap">
          <MapView
            scored={scored}
            protectedFC={protectedFC}
            meta={meta}
            epoch={epoch}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <div className="map-ctl epoch">
            <span style={{ color: "var(--muted)" }}>Sentinel-2</span>
            {["off", "before", "after"].map((e) => (
              <button key={e} className={epoch === e ? "on" : ""} onClick={() => setEpoch(e)}>
                {e === "off" ? "Hide" : e[0].toUpperCase() + e.slice(1)}
              </button>
            ))}
          </div>
          <div className="map-ctl legend">
            <b>Risk class</b>
            {["HIGH", "MODERATE", "LOW", "OUTSIDE"].map((k) => (
              <div key={k}>
                <span className="swatch" style={{ background: riskColor(k) }} />
                {k}
              </div>
            ))}
            <div className="legend-pa">
              <b style={{ marginTop: 6 }}>Protected areas</b>
              {protectedFC.features.map((f) => (
                <div key={f.properties.WDPAID}>
                  <span
                    className="swatch"
                    style={{ background: designationColor(f.properties.DESIG_ENG) }}
                  />
                  {f.properties.NAME}
                </div>
              ))}
            </div>
          </div>
        </div>

        <ViolationDetail feature={selected} meta={meta} epoch={epoch} setEpoch={setEpoch} />
      </div>
    </div>
  );
}
