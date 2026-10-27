import { useEffect, useMemo, useState } from "react";
import { riskColor } from "../lib/format.js";

const FILTERS = ["ALL", "HIGH", "MODERATE", "LOW", "OUTSIDE"];
const CLASSES = FILTERS.slice(1);

const TITLES = {
  HIGH: "Unauthorised construction",
  MODERATE: "Change needs verification",
  LOW: "Permitted / low-risk change",
  OUTSIDE: "Change outside protected land",
};

const SORTS = {
  confidence: ["Confidence", (p) => p.confidence],
  area: ["Area changed", (p) => p.area_ha],
  overlap: ["Overlap %", (p) => p.overlap_pct],
  ndvi: ["NDVI drop", (p) => -p.d_ndvi],
};

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, hint }) {
  return (
    <label className="slider">
      <span className="sl-top">
        <span>{label}</span>
        <b>{hint ?? value.toFixed(2)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
    </label>
  );
}

function Tuner({ rawWeights, setRawWeights, weights, thresholds, setThresholds, onReset }) {
  const setW = (k) => (v) => setRawWeights((w) => ({ ...w, [k]: v }));
  const setT = (k) => (v) =>
    setThresholds((t) => {
      const next = { ...t, [k]: v };
      // keep HIGH strictly above MODERATE
      if (k === "high" && v <= t.moderate) next.moderate = Math.max(0, +(v - 0.01).toFixed(2));
      if (k === "moderate" && v >= t.high) next.high = Math.min(1, +(v + 0.01).toFixed(2));
      return next;
    });

  return (
    <div className="tuner">
      <p className="tip">
        Drag to re-weight the 3-factor score. Every change is re-scored and re-classified live,
        in your browser.
      </p>
      <Slider label="Change magnitude" value={rawWeights.magnitude} onChange={setW("magnitude")}
        hint={`${Math.round(weights.magnitude * 100)}%`} />
      <Slider label="Protected-area overlap" value={rawWeights.overlap} onChange={setW("overlap")}
        hint={`${Math.round(weights.overlap * 100)}%`} />
      <Slider label="Permit status" value={rawWeights.permit} onChange={setW("permit")}
        hint={`${Math.round(weights.permit * 100)}%`} />
      <div className="thr">
        <Slider label="HIGH risk threshold" value={thresholds.high} onChange={setT("high")} min={0.05} />
        <Slider label="MODERATE threshold" value={thresholds.moderate} onChange={setT("moderate")} max={0.95} />
      </div>
      <button className="reset" onClick={onReset}>
        Reset to calibrated defaults
      </button>
    </div>
  );
}

export default function Sidebar({ scored, selectedId, onSelect, onVisibleChange, ...tuner }) {
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("confidence");
  const [showTuner, setShowTuner] = useState(false);

  const counts = useMemo(() => {
    const c = {};
    for (const f of scored.features) c[f.properties.risk_class] = (c[f.properties.risk_class] || 0) + 1;
    return c;
  }, [scored]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const by = SORTS[sortKey][1];
    return scored.features
      .filter((f) => filter === "ALL" || f.properties.risk_class === filter)
      .filter((f) => {
        if (!q) return true;
        const p = f.properties;
        return [p.change_id, p.protected_area, p.designation, p.permit_id, p.permit_holder, p.risk_class]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q));
      })
      .sort((a, b) => by(b.properties) - by(a.properties));
  }, [scored, filter, query, sortKey]);

  const filtered = filter !== "ALL" || query.trim();
  const ids = rows.map((f) => f.properties.change_id).join("|");
  useEffect(() => {
    onVisibleChange(filtered ? ids.split("|").filter(Boolean) : null);
  }, [ids, filtered, onVisibleChange]);

  const total = scored.features.length || 1;

  return (
    <aside className="sidebar">
      <h2>Flagged changes ({scored.features.length})</h2>

      <div className="dist" title="Risk mix across all flagged changes">
        {CLASSES.map((k) =>
          counts[k] ? (
            <i key={k} style={{ flexGrow: counts[k] / total, background: riskColor(k) }} title={`${k}: ${counts[k]}`} />
          ) : null
        )}
      </div>

      <div className="searchrow">
        <input
          type="search"
          placeholder="Search ID, area, permit, holder…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} aria-label="Sort by">
          {Object.entries(SORTS).map(([k, [label]]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f}
            {f !== "ALL" && <span className="n">{counts[f] || 0}</span>}
          </button>
        ))}
      </div>

      <ul className="vlist">
        {rows.map((f, i) => {
          const p = f.properties;
          return (
            <li
              key={`${p.change_id}-${p.risk_class}`}
              className={`vcard r-${p.risk_class} ${selectedId === p.change_id ? "sel" : ""}`}
              style={{ animationDelay: `${i * 40}ms` }}
              onClick={() => onSelect(p.change_id)}
            >
              <div className="r1">
                <span className="cid">{p.change_id}</span>
                <span className="sc">{p.confidence.toFixed(2)}</span>
              </div>
              <div className="ttl">{TITLES[p.risk_class]}</div>
              <div className="sub">
                <span className={`pill ${p.risk_class}`}>{p.risk_class}</span>{" "}
                {p.protected_area || "—"} · {p.area_ha.toFixed(2)} ha · {p.overlap_pct}% inside
              </div>
              <div className="mini">
                <i style={{ width: `${Math.round(p.confidence * 100)}%`, background: riskColor(p.risk_class) }} />
              </div>
            </li>
          );
        })}
        {!rows.length && <li className="none">No changes match.</li>}
      </ul>

      <h2 className="tuner-h">
        <button onClick={() => setShowTuner((s) => !s)} aria-expanded={showTuner}>
          {showTuner ? "▾" : "▸"} Tune scoring engine
        </button>
      </h2>
      {showTuner && <Tuner {...tuner} />}
      <p className="kbd">
        Tip: <kbd>↑</kbd> <kbd>↓</kbd> to step through changes, <kbd>Esc</kbd> to close.
      </p>
    </aside>
  );
}
