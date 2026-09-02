const token = import.meta.env.VITE_DASHBOARD_AUTH_TOKEN || "";
const demoGateway = (import.meta.env.VITE_DEMO_GATEWAY_URL || `${window.location.protocol}//${window.location.hostname}:3001`).replace(/\/$/, "");

const request = async (url, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (token) headers["x-dashboard-token"] = token;
  const response = await fetch(url, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(body.error?.message || `Request failed (${response.status})`);
  return body.data ?? body;
};

const demoRequest = (url, options = {}) => request(`${demoGateway}${url}`, options);

export const api = {
  mine: () => request("/api/v1/mine"),
  state: () => request("/api/v1/mine/state"),
  locations: () => request("/api/v1/locations"),
  location: (id) => request(`/api/v1/locations/${encodeURIComponent(id)}`),
  locationHistory: (id) => request(`/api/v1/locations/${encodeURIComponent(id)}/history?limit=20&offset=0`),
  devices: () => request("/api/v1/devices"),
  device: (id) => request(`/api/v1/devices/${encodeURIComponent(id)}`),
  deviceHistory: (id) => request(`/api/v1/devices/${encodeURIComponent(id)}/history?limit=20&offset=0`),
  alerts: () => request("/api/v1/alerts?limit=50"),
  assessment: () => request("/api/v1/assessment"),
  system: () => request("/api/v1/system/status"),
};

export const demoApi = {
  state: () => demoRequest("/api/v1/mine/state"),
  deviceHistory: (id) => demoRequest(`/api/v1/devices/${encodeURIComponent(id)}/history?limit=40&offset=0`),
  alerts: () => demoRequest("/api/v1/alerts?limit=50"),
};

export const websocketUrl = () => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${protocol}//${window.location.host}/ws${query}`;
};

export const demoWebsocketUrl = () => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${demoGateway}/ws`);
  url.protocol = protocol;
  if (token) url.searchParams.set("token", token);
  return url.toString();
};
