// Validated palette (see viz.css) exposed to JS for the chart library.
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];
export const STATUS = { normal: "#0ca30c", good: "#0ca30c", warning: "#fab219", high: "#ec835a", serious: "#ec835a", critical: "#d03b3b" };
export const INK = { primary: "#eef4f9", secondary: "#b3c3d1", muted: "#7d8fa0" };
export const GRID = "#1c2938";
export const AXIS = { fill: "#7d8fa0", fontSize: 11 };

// Sensors keep a fixed slot so a reading is the same colour on every screen it
// appears on; colour follows the sensor, never its position in a list.
const SLOT = { "gas.co": 0, "gas.co2": 1, "gas.ch4": 2, temperature: 3, battery: 4, "gas.o2": 5, humidity: 1, "gas.ch4_face": 2 };
export const seriesColor = (sensor) => SERIES[SLOT[sensor] ?? Math.abs([...String(sensor)].reduce((hash, character) => hash * 31 + character.charCodeAt(0), 7)) % SERIES.length];
export const statusColor = (risk) => STATUS[risk] || STATUS.normal;

export const clockTime = (value) => value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
export const relativeMinutes = (m) => `${m > 0 ? "+" : ""}${Math.round(m)} min`;
export const tidy = (value, digits = 2) => Number.isFinite(value) ? Number(value.toFixed(digits)).toLocaleString() : "—";

// Axis ticks: precision follows magnitude, so a ppm scale does not carry two
// meaningless decimals while a %LEL scale keeps the ones that matter.
export const axisTick = (value) => {
  const size = Math.abs(value);
  if (!Number.isFinite(value)) return "";
  return Number(value.toFixed(size >= 1000 ? 0 : size >= 100 ? 1 : 2)).toLocaleString();
};

// Pad a domain without inventing negative readings for quantities that cannot go
// below zero in the data observed.
export const paddedDomain = (values, fraction = 0.15) => {
  const min = Math.min(...values); const max = Math.max(...values);
  const pad = (max - min || Math.max(Math.abs(max) * 0.1, 1)) * fraction;
  return [min >= 0 ? Math.max(0, min - pad) : min - pad, max + pad];
};

export const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
