import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runEngine, scoreAll } from "./engine/runEngine.js";
import { WEIGHTS, THRESHOLDS, normalizeWeights } from "./engine/confidence.js";
import MapView from "./components/MapView.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ViolationDetail from "./components/ViolationDetail.jsx";
import CountUp from "./components/CountUp.jsx";
import { riskColor, designationColor } from "./lib/format.js";

const EPOCHS = [
  ["off", "Hide"],
  ["before", "Before"],
  ["after", "After"],
  ["swipe", "Swipe"],
];
const TOUR_MS = 4500;

const idFromHash = () => decodeURIComponent(window.location.hash.replace(/^#/, "")) || null;

export default function App() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [selectedId, setSelectedId] = useState(idFromHash);
  const [epoch, setEpoch] = useState("off");
  const [swipePos, setSwipePos] = useState(0.5);
  const [rawWeights, setRawWeights] = useState(WEIGHTS);
  const [thresholds, setThresholds] = useState(THRESHOLDS);
  const [touring, setTouring] = useState(false);
  const [visibleIds, setVisibleIds] = useState(null);
  const mapwrapRef = useRef(null);

  useEffect(() => {
    runEngine()
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  const weights = useMemo(() => normalizeWeights(rawWeights), [rawWeights]);

  // live re-score whenever the analyst retunes the engine
  const live = useMemo(
    () => (data ? scoreAll(data.joined, data.meta, weights, thresholds) : null),
    [data, weights, thresholds]
  );

  // keep the selected change in the URL so a docket link can be shared
  useEffect(() => {
    const want = selectedId ? `#${selectedId}` : "";
    if (window.location.hash !== want)
      history.replaceState(null, "", want || window.location.pathname + window.location.search);
  }, [selectedId]);
  useEffect(() => {
    const onHash = () => setSelectedId(idFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const order = useMemo(() => {
    const all = live?.scored.features.map((f) => f.properties.change_id) ?? [];
    return visibleIds ? all.filter((id) => visibleIds.includes(id)) : all;
  }, [live, visibleIds]);

  const step = useCallback(
    (dir) => {
      if (!order.length) return;
      const i = order.indexOf(selectedId);
      const next = i < 0 ? (dir > 0 ? 0 : order.length - 1) : (i + dir + order.length) % order.length;
      setSelectedId(order[next]);
    },
    [order, selectedId]
  );

  // guided tour: cycle through every flagged change for presentations
  useEffect(() => {
    if (!touring) return;
    if (!selectedId) step(1);
    const t = setInterval(() => step(1), TOUR_MS);
    return () => clearInterval(t);
  }, [touring, step, selectedId]);

  // keyboard: ↑/↓ or j/k move through the list, Esc closes the docket
  useEffect(() => {
    const onKey = (e) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "ArrowDown" || e.key === "j") (e.preventDefault(), step(1));
      else if (e.key === "ArrowUp" || e.key === "k") (e.preventDefault(), step(-1));
      else if (e.key === "Escape") (setSelectedId(null), setTouring(false));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  // on phones the docket opens as a bottom sheet: bring the map back into view above it
  useEffect(() => {
    if (selectedId && window.matchMedia("(max-width: 900px)").matches)
      window.scrollTo({ top: 0, behavior: "smooth" });
  }, [selectedId]);

  const selected = useMemo(
    () => live?.scored.features.find((f) => f.properties.change_id === selectedId) ?? null,
    [live, selectedId]
  );

  const startSwipeDrag = (e) => {
    e.preventDefault();
    const rect = mapwrapRef.current.getBoundingClientRect();
    const move = (ev) => {
      const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      setSwipePos(Math.min(0.98, Math.max(0.02, x / rect.width)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (err)
    return (
      <div className="center-msg">
        <div>
          Could not load data feeds — {err}
          <br />
          <button className="retry" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  if (!data || !live)
    return (
      <div className="center-msg">
        <div className="loader">
          <span className="scan" />
          Running spatial-join engine…
        </div>
      </div>
    );

  const { protectedFC, meta } = data;
  const { scored, kpi } = live;
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
            <div className="v">
              <CountUp value={c.HIGH || 0} />
            </div>
            <div className="l">High risk</div>
          </div>
          <div className="kpi mod">
            <div className="v">
              <CountUp value={c.MODERATE || 0} />
            </div>
            <div className="l">Verify</div>
          </div>
          <div className="kpi">
            <div className="v">
              <CountUp value={kpi.highArea} decimals={2} />
            </div>
            <div className="l">ha protected lost</div>
          </div>
          <div className="kpi">
            <div className="v">
              <CountUp value={kpi.leadDays} />d
            </div>
            <div className="l">imagery gap</div>
          </div>
        </div>
      </header>

      <div className="layout">
        <Sidebar
          scored={scored}
          selectedId={selectedId}
          onSelect={(id) => (setTouring(false), setSelectedId(id))}
          onVisibleChange={setVisibleIds}
          rawWeights={rawWeights}
          setRawWeights={setRawWeights}
          weights={weights}
          thresholds={thresholds}
          setThresholds={setThresholds}
          onReset={() => (setRawWeights(WEIGHTS), setThresholds(THRESHOLDS))}
        />

        <div className="mapwrap" ref={mapwrapRef}>
          <MapView
            scored={scored}
            protectedFC={protectedFC}
            meta={meta}
            epoch={epoch}
            swipePos={swipePos}
            selectedId={selectedId}
            visibleIds={visibleIds}
            onSelect={(id) => (setTouring(false), setSelectedId(id))}
          />
          {epoch === "swipe" && (
            <div className="swipe-line" style={{ left: `${swipePos * 100}%` }}>
              <span className="tag l">Before</span>
              <span className="tag r">After</span>
              <button
                className="swipe-handle"
                aria-label="Drag to compare before and after imagery"
                onPointerDown={startSwipeDrag}
              >
                ⇆
              </button>
            </div>
          )}
          <div className="map-ctl epoch">
            <span className="lbl">Sentinel-2</span>
            {EPOCHS.map(([k, label]) => (
              <button key={k} className={epoch === k ? "on" : ""} onClick={() => setEpoch(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="map-ctl tour">
            <button className={touring ? "on" : ""} onClick={() => setTouring((t) => !t)}>
              {touring ? "❚❚ Stop tour" : "▶ Guided tour"}
            </button>
          </div>
          <div className="map-ctl legend">
            <b>Risk class</b>
            {["HIGH", "MODERATE", "LOW", "OUTSIDE"].map((k) => (
              <div key={k}>
                <span className="swatch" style={{ background: riskColor(k) }} />
                {k} <span className="cnt">{c[k] || 0}</span>
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

        <ViolationDetail
          feature={selected}
          meta={meta}
          epoch={epoch}
          setEpoch={setEpoch}
          thresholds={thresholds}
          onClose={() => (setSelectedId(null), setTouring(false))}
          onStep={step}
          position={selected ? order.indexOf(selectedId) + 1 : 0}
          total={order.length}
        />
      </div>
    </div>
  );
}
