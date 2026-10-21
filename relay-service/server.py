#!/usr/bin/env python3
"""
WatchNav relay — zero-dependency Python 3 service.

Phone (iOS Shortcut) POSTs a destination/route; the watch polls GET.
Storage is in-memory with optional persistence to a JSON file so a
free-tier dyno restart does not lose a pending route.

Endpoints
  GET  /health                  -> {"ok": true}
  GET  /pair                    -> {"code": "482913"}   (new pairing code)
  POST /route                   body: {"code": "482913", "name": "Home",
                                     "lat": 12.34, "lon": 56.78}
                                or    {"code": "482913", "query": "Connaught Place"}
                                -> {"ok": true}
  GET  /route?code=482913       -> {"ok": true, "route": {...}} or {"ok": true, "route": null}
        ?since=<unix_ts>        only returns route newer than `since`
  POST /route/clear             body: {"code": ...} -> clears pending route

Routes are stored per pairing code with a TTL (default 24h).
Deploy anywhere Python 3.10+ runs: `python3 server.py` (PORT env var, default 8080).
"""

import json
import os
import threading
import time
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("PORT", "8080"))
ROUTE_TTL = float(os.environ.get("ROUTE_TTL_SEC", "86400"))  # 24 h
STATE_FILE = os.environ.get("STATE_FILE", "relay_state.json")
MAX_BODY = 32 * 1024

_lock = threading.Lock()
_routes = {}   # code -> route dict


def _load():
    try:
        with open(STATE_FILE) as f:
            data = json.load(f)
        now = time.time()
        _routes.update({k: v for k, v in data.items() if now - v.get("ts", 0) < ROUTE_TTL})
    except Exception:
        pass


def _save():
    try:
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(_routes, f)
        os.replace(tmp, STATE_FILE)
    except Exception:
        pass


class Handler(BaseHTTPRequestHandler):
    server_version = "WatchNavRelay/1.0"

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = min(int(self.headers.get("Content-Length") or 0), MAX_BODY)
        if n <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(n))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self._json(200, {"ok": True})

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path in ("/", "/health"):
            return self._json(200, {"ok": True, "routes": len(_routes)})
        if u.path == "/pair":
            return self._json(200, {"code": f"{secrets.randbelow(1000000):06d}"})
        if u.path == "/route":
            code = (q.get("code") or [""])[0]
            since = float((q.get("since") or ["0"])[0] or 0)
            with _lock:
                r = _routes.get(code)
            if not r or r.get("ts", 0) <= since or time.time() - r.get("ts", 0) > ROUTE_TTL:
                return self._json(200, {"ok": True, "route": None})
            return self._json(200, {"ok": True, "route": r})
        return self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        data = self._body()
        code = str(data.get("code") or "")
        if not code or not code.isdigit():
            return self._json(400, {"ok": False, "error": "bad code"})
        if u.path == "/route":
            route = {
                "ts": time.time(),
                "id": secrets.token_hex(8),
                "name": (data.get("name") or "Destination")[:120],
            }
            if data.get("lat") is not None and data.get("lon") is not None:
                try:
                    route["lat"] = float(data["lat"])
                    route["lon"] = float(data["lon"])
                except (TypeError, ValueError):
                    return self._json(400, {"ok": False, "error": "bad lat/lon"})
            elif data.get("query"):
                route["query"] = str(data["query"])[:200]
            else:
                return self._json(400, {"ok": False, "error": "need lat/lon or query"})
            with _lock:
                _routes[code] = route
                _save()
            return self._json(200, {"ok": True, "route": route})
        if u.path == "/route/clear":
            with _lock:
                _routes.pop(code, None)
                _save()
            return self._json(200, {"ok": True})
        return self._json(404, {"ok": False, "error": "not found"})

    def log_message(self, fmt, *args):  # quieter logs
        pass


if __name__ == "__main__":
    _load()
    print(f"WatchNav relay listening on :{PORT}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
