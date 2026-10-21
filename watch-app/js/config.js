// WatchNav user configuration — EDIT THESE BEFORE PACKAGING.
// You can also change both at runtime in the watch app's Settings screen.

const CONFIG = {
  // Base URL of your deployed relay service (no trailing slash).
  // Example: "https://watchnav-relay.onrender.com"
  RELAY_URL: "",

  // 6-digit pairing code. Get one from <RELAY_URL>/pair, or pick your own
  // 6 digits — the same code goes in the iPhone Shortcut.
  PAIR_CODE: "",

  // Routing profile: "foot", "bike", or "car" (OSRM profiles).
  ROUTE_PROFILE: "foot",

  // Tile servers (free for personal/light use). Pick one.
  TILE_URL: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  // Alternative (cleaner look, free tier): 
  // TILE_URL: "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",

  // Poll the relay for a pushed destination this often (ms).
  POLL_MS: 15000,

  // Map detail (watch screen is 360x360).
  TILE_SIZE: 256,
  DEFAULT_ZOOM: 16,
};
