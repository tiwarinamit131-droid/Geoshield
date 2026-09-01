import { useState } from "react";

const FILTERS = ["ALL", "HIGH", "MODERATE", "LOW", "OUTSIDE"];

const TITLES = {
  HIGH: "Unauthorised construction",
  MODERATE: "Change needs verification",
  LOW: "Permitted / low-risk change",
  OUTSIDE: "Change outside protected land",
};

export default function Sidebar({ scored, selectedId, onSelect }) {
  const [filter, setFilter] = useState("ALL");
  const rows = scored.features.filter(
    (f) => filter === "ALL" || f.properties.risk_class === filter
  );

  return (
    <aside className="sidebar">
      <h2>Flagged changes ({scored.features.length})</h2>
      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      <ul className="vlist">
        {rows.map((f) => {
          const p = f.properties;
          return (
            <li
              key={p.change_id}
              className={`vcard r-${p.risk_class} ${selectedId === p.change_id ? "sel" : ""}`}
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
            </li>
          );
        })}
        {!rows.length && (
          <li style={{ color: "var(--muted)", fontSize: 12, padding: "6px 4px" }}>
            No changes in this category.
          </li>
        )}
      </ul>
    </aside>
  );
}
