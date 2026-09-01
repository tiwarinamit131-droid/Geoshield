export const pct = (v) => `${(v * 100).toFixed(0)}%`;
export const ha = (v) => `${(v ?? 0).toFixed(2)} ha`;

export function riskColor(k) {
  return (
    {
      HIGH: "#e5372c",
      MODERATE: "#f2a308",
      LOW: "#2fa257",
      OUTSIDE: "#7c8794",
    }[k] || "#7c8794"
  );
}

export function designationColor(desig = "") {
  if (desig.includes("Ramsar") || desig.includes("Wetland")) return "#2f9bd6";
  if (desig.includes("Reserved Forest")) return "#3a7d3a";
  if (desig.includes("Sanctuary") || desig.includes("Tiger")) return "#1f9e8f";
  return "#8a8a8a";
}

export function fmtDate(s) {
  try {
    return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return s;
  }
}
