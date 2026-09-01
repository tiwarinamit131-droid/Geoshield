import { WEIGHTS } from "../engine/confidence.js";
import { fmtDate } from "../lib/format.js";

const RISK_TEXT = {
  HIGH: "Prima-facie unauthorised construction on legally protected land. Escalate for site inspection and notice under the Indian Forest Act 1927 / Wetlands (Conservation & Management) Rules 2017.",
  MODERATE: "Land-use change partly inside a protected boundary or with a lapsed permit. Requires ground verification of the RoR / mutation and permit status before enforcement.",
  LOW: "Change is covered by a valid permit or lies outside protected land. Logged for audit; no enforcement proposed.",
  OUTSIDE: "Structural change detected outside every mapped protected area. Forwarded to the Urban Local Body for building-bylaw check only.",
};

function Factor({ label, value, weight, note }) {
  return (
    <div className="factor">
      <div className="fl">
        <span>{label}</span>
        <span>
          {value.toFixed(2)} × w{weight} {note ? `· ${note}` : ""}
        </span>
      </div>
      <div className="bar">
        <i style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export default function ViolationDetail({ feature, meta, epoch, setEpoch }) {
  if (!feature) {
    return (
      <aside className="detail">
        <div className="empty">
          Select a flagged change to see its regulatory cross-verification, confidence
          breakdown and enforcement docket.
        </div>
      </aside>
    );
  }
  const p = feature.properties;
  const f = p.factors;

  const downloadDocket = () => {
    const blob = new Blob([JSON.stringify({ ...p, geometry: feature.geometry }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${p.change_id}_docket.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <aside className="detail">
      <div className="dhead">
        <div className="cid">
          {p.change_id} · {p.risk_class}
        </div>
        <div className="score" style={{ color: `var(--${p.risk_class.toLowerCase()})` }}>
          {p.confidence.toFixed(2)}
          <span style={{ fontSize: 13, color: "var(--muted)" }}> / 1.00 confidence</span>
        </div>
      </div>

      <div className="dbody">
        <p style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 14 }}>
          {RISK_TEXT[p.risk_class]}
        </p>

        <h2 style={{ padding: "0 0 8px" }}>Multi-factor score</h2>
        <Factor label="Change magnitude" value={f.magnitude} weight={WEIGHTS.magnitude} />
        <Factor
          label="Protected-area overlap"
          value={f.overlap}
          weight={WEIGHTS.overlap}
          note={`${p.overlap_pct}%`}
        />
        <Factor
          label="Permit status"
          value={f.permit}
          weight={WEIGHTS.permit}
          note={p.permit_status}
        />
        <div className="formula">
          score = {WEIGHTS.magnitude}·{f.magnitude.toFixed(2)} + {WEIGHTS.overlap}·
          {f.overlap.toFixed(2)} + {WEIGHTS.permit}·{f.permit.toFixed(2)} ={" "}
          <b>{p.confidence.toFixed(2)}</b>
        </div>

        <div className="kv">
          <span className="k">Protected area</span>
          <span>{p.protected_area || "— (outside)"}</span>
          <span className="k">Designation</span>
          <span>{p.designation || "—"}</span>
          <span className="k">WDPA ID</span>
          <span>{p.protected_wdpaid || "—"}</span>
          <span className="k">Permit</span>
          <span>
            {p.permit_id ? `${p.permit_id} (${p.permit_status})` : "No permit on record"}
          </span>
          <span className="k">Area changed</span>
          <span>
            {p.area_ha.toFixed(3)} ha ({p.area_m2.toFixed(0)} m²)
          </span>
          <span className="k">NDVI</span>
          <span>
            {p.ndvi_before.toFixed(2)} → {p.ndvi_after.toFixed(2)} (Δ {p.d_ndvi.toFixed(2)})
          </span>
          <span className="k">Δ NDWI (water)</span>
          <span>{p.d_ndwi.toFixed(2)}</span>
          <span className="k">Imagery</span>
          <span>
            {fmtDate(p.detected_from)} → {fmtDate(p.detected_to)}
          </span>
          <span className="k">Centroid</span>
          <span>
            {p.centroid[1].toFixed(5)}, {p.centroid[0].toFixed(5)}
          </span>
        </div>

        <h2 style={{ padding: "0 0 6px" }}>Before / after imagery</h2>
        <div className="filters" style={{ padding: "0 0 12px" }}>
          <button className={epoch === "before" ? "on" : ""} onClick={() => setEpoch("before")}>
            Before ({fmtDate(meta.before_date)})
          </button>
          <button className={epoch === "after" ? "on" : ""} onClick={() => setEpoch("after")}>
            After ({fmtDate(meta.after_date)})
          </button>
        </div>

        <div className="dbtns">
          <button className="primary" onClick={() => window.print()}>
            Print docket
          </button>
          <button onClick={downloadDocket}>Download JSON</button>
        </div>
      </div>

      <div id="docket" style={{ display: "none" }}>
        <h1>GeoShield — Encroachment Violation Docket</h1>
        <p>
          <b>{p.change_id}</b> · Risk class: {p.risk_class} · Confidence {p.confidence.toFixed(2)}
        </p>
        <p>AOI: {meta.aoi_name}</p>
        <p>
          Protected area: {p.protected_area || "outside protected land"} ({p.designation || "—"}),
          WDPA {p.protected_wdpaid || "—"}
        </p>
        <p>Overlap with protected boundary: {p.overlap_pct}%</p>
        <p>
          Permit: {p.permit_id ? `${p.permit_id} — ${p.permit_status}` : "none on record"}
        </p>
        <p>
          Area changed: {p.area_ha.toFixed(3)} ha · NDVI {p.ndvi_before.toFixed(2)} →{" "}
          {p.ndvi_after.toFixed(2)}
        </p>
        <p>
          Imagery pair: {p.detected_from} → {p.detected_to}
        </p>
        <p>
          Centroid: {p.centroid[1].toFixed(6)}, {p.centroid[0].toFixed(6)}
        </p>
        <p style={{ marginTop: 12 }}>{RISK_TEXT[p.risk_class]}</p>
        <p style={{ marginTop: 12, fontSize: 11 }}>
          Score = {WEIGHTS.magnitude}·magnitude({f.magnitude.toFixed(2)}) +{" "}
          {WEIGHTS.overlap}·overlap({f.overlap.toFixed(2)}) + {WEIGHTS.permit}·permit(
          {f.permit.toFixed(2)}). Evidence: multi-temporal Sentinel-2 NDVI/NDWI differencing.
        </p>
      </div>
    </aside>
  );
}
