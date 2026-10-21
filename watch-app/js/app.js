/* WatchNav — Tizen web navigation app for Galaxy Watch 3.
 * Free stack: OSM tiles + OSRM routing + Nominatim geocoding + relay push.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("map"), ctx = canvas.getContext("2d");

  // ---------- settings ----------
  function loadSetting(k, dflt) {
    try { var v = localStorage.getItem("watchnav_" + k); return v === null ? dflt : v; }
    catch (e) { return dflt; }
  }
  function saveSetting(k, v) { try { localStorage.setItem("watchnav_" + k, v); } catch (e) {} }

  var relay = loadSetting("relay", CONFIG.RELAY_URL || "");
  var pairCode = loadSetting("code", CONFIG.PAIR_CODE || "");
  var profile = loadSetting("profile", CONFIG.ROUTE_PROFILE || "foot");
  var zoom = parseInt(loadSetting("zoom", String(CONFIG.DEFAULT_ZOOM)), 10);

  // ---------- state ----------
  var pos = null;            // {lat, lon, heading, speed}
  var pending = null;        // route pushed from phone, not yet accepted
  var nav = null;            // {dest:{lat,lon,name}, steps:[], coords:[[lat,lon]...], dist, dur}
  var lastRouteTs = 0, lastRouteId = null;
  var tiles = {};            // "z/x/y" -> Image
  var statusMsg = "Waiting for GPS…";

  function status(t) { statusMsg = t; $("status").textContent = t; }

  // ---------- keep screen on / vibration ----------
  try {
    if (typeof tizen !== "undefined" && tizen.power) {
      tizen.power.request("SCREEN", "SCREEN_NORMAL");
    }
  } catch (e) {}
  function buzz(ms) { try { navigator.vibrate(ms || 200); } catch (e) {} }

  // ---------- web mercator ----------
  function merc(lat, lon, z) {
    var s = CONFIG.TILE_SIZE * Math.pow(2, z);
    var x = (lon + 180) / 360 * s;
    var la = Math.min(Math.max(lat, -85.051), 85.051);
    var y = (0.5 - Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360)) / (2 * Math.PI)) * s;
    return { x: x, y: y };
  }
  function distM(a, b) {
    var R = 6371000, dLa = (b.lat - a.lat) * Math.PI / 180, dLo = (b.lon - a.lon) * Math.PI / 180;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
      Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ---------- map render ----------
  function draw() {
    var W = 360, H = 360;
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, W, H);
    var center = pos || (nav && nav.dest) || { lat: 0, lon: 0 };
    var c = merc(center.lat, center.lon, zoom);
    var x0 = c.x - W / 2, y0 = c.y - H / 2;
    var ts = CONFIG.TILE_SIZE;
    var tx0 = Math.floor(x0 / ts), ty0 = Math.floor(y0 / ts);
    var n = Math.pow(2, zoom);

    for (var tx = tx0; tx * ts < x0 + W; tx++) {
      for (var ty = ty0; ty * ts < y0 + H; ty++) {
        var wx = ((tx % n) + n) % n;
        if (ty < 0 || ty >= n) continue;
        var key = zoom + "/" + wx + "/" + ty;
        var img = tiles[key];
        if (!img) {
          img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = function () { tiles[key] = this; draw(); };
          img.onerror = function () { tiles[key] = "err"; };
          img.src = CONFIG.TILE_URL.replace("{z}", zoom).replace("{x}", wx).replace("{y}", ty);
          tiles[key] = "loading";
        }
        if (img !== "loading" && img !== "err" && img.complete) {
          ctx.drawImage(img, tx * ts - x0, ty * ts - y0);
        }
      }
    }

    function px(lat, lon) { var p = merc(lat, lon, zoom); return { x: p.x - x0, y: p.y - y0 }; }

    // route polyline
    if (nav && nav.coords.length) {
      ctx.strokeStyle = "#1e8cff"; ctx.lineWidth = 7;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      nav.coords.forEach(function (pt, i) {
        var p = px(pt.lat, pt.lon);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      // destination pin
      var d = px(nav.dest.lat, nav.dest.lon);
      ctx.fillStyle = "#ff4444";
      ctx.beginPath(); ctx.arc(d.x, d.y, 8, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(d.x, d.y, 3, 0, 7); ctx.fill();
    }

    // position dot + heading
    if (pos) {
      var p = px(pos.lat, pos.lon);
      ctx.fillStyle = "rgba(30,140,255,.3)";
      ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, 7); ctx.fill();
      ctx.fillStyle = "#1e8cff";
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7); ctx.stroke();
    }
  }

  // ---------- HTTP ----------
  function getJSON(url) {
    return fetch(url, { headers: { "Accept": "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  // ---------- relay polling ----------
  function pollRelay() {
    if (!relay || !pairCode) return;
    getJSON(relay + "/route?code=" + pairCode + "&since=" + Math.floor(lastRouteTs * 1000) / 1000)
      .then(function (res) {
        if (res && res.route && res.route.id !== lastRouteId) {
          lastRouteId = res.route.id;
          lastRouteTs = res.route.ts;
          onPush(res.route);
        }
      }).catch(function () {});
  }

  function onPush(r) {
    pending = r;
    showBanner("Navigate to " + (r.name || r.query || "destination") + "?  Tap to start");
    buzz([200, 100, 200]);
  }

  function showBanner(t) {
    var b = $("banner"); b.textContent = t; b.classList.remove("hidden");
  }
  $("banner").addEventListener("click", function () {
    $("banner").classList.add("hidden");
    if (pending) { acceptRoute(pending); pending = null; }
  });

  // ---------- geocoding + routing ----------
  function acceptRoute(r) {
    status("Finding route…");
    var done = function (lat, lon, name) {
      if (!pos) { status("No GPS fix yet"); pending = r; showBanner("Waiting for GPS — tap to retry"); return; }
      routeTo(lat, lon, name);
    };
    if (r.lat !== undefined && r.lon !== undefined) {
      done(r.lat, r.lon, r.name);
    } else if (r.query) {
      getJSON("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
              encodeURIComponent(r.query))
        .then(function (res) {
          if (!res.length) throw new Error("no result");
          done(parseFloat(res[0].lat), parseFloat(res[0].lon), r.name === "Destination" ? res[0].display_name.split(",")[0] : r.name);
        })
        .catch(function () { status("Geocode failed"); });
    }
  }

  function routeTo(lat, lon, name) {
    var url = "https://router.project-osrm.org/route/v1/" + profile + "/" +
      pos.lon + "," + pos.lat + ";" + lon + "," + lat +
      "?steps=true&geometries=geojson&overview=full";
    getJSON(url).then(function (res) {
      if (!res.routes || !res.routes.length) throw new Error("no route");
      var rt = res.routes[0], leg = rt.legs[0];
      nav = {
        dest: { lat: lat, lon: lon, name: name },
        coords: rt.geometry.coordinates.map(function (c) { return { lat: c[1], lon: c[0] }; }),
        steps: leg.steps.map(function (s) {
          return {
            lat: s.maneuver.location[1], lon: s.maneuver.location[0],
            text: instructionText(s), dist: s.distance
          };
        }),
        dist: rt.distance, dur: rt.duration, stepIdx: 0
      };
      $("btn-stop").classList.remove("hidden");
      $("hud").classList.remove("hidden");
      status(nav.dest.name);
      zoom = Math.max(zoom, 16);
      buzz([300, 100, 300]);
      draw();
    }).catch(function () { status("Routing failed"); });
  }

  function instructionText(step) {
    var m = step.maneuver, t = m.type, mod = m.modifier || "";
    var names = { "depart": "Head", "arrive": "Arrive", "turn": "Turn", "new name": "Continue",
      "merge": "Merge", "roundabout": "Roundabout", "fork": "Fork", "end of road": "End of road",
      "continue": "Continue", "uturn": "U-turn", "notification": "" };
    var base = names[t] !== undefined ? names[t] : t;
    if (mod) base += " " + mod;
    if (step.name && t !== "arrive") base += " onto " + step.name;
    return base || "Continue";
  }

  // ---------- turn guidance ----------
  var lastBuzzStep = -1;
  function guidance() {
    if (!nav || !pos) { $("hud").classList.add("hidden"); return; }
    // advance steps passed
    while (nav.stepIdx < nav.steps.length - 1 &&
           distM(pos, nav.steps[nav.stepIdx]) < 20) {
      nav.stepIdx++;
    }
    var st = nav.steps[Math.min(nav.stepIdx, nav.steps.length - 1)];
    var d = Math.round(distM(pos, st));
    var remain = Math.round(distM(pos, nav.dest));
    $("hud-turn").textContent = st.text;
    $("hud-dist").textContent = d >= 1000 ? (d / 1000).toFixed(1) + " km" : d + " m";
    status((remain / 1000).toFixed(1) + " km to " + nav.dest.name);
    if (d < 40 && lastBuzzStep !== nav.stepIdx) { lastBuzzStep = nav.stepIdx; buzz([150, 80, 150]); }
    if (remain < 30) {
      $("hud-turn").textContent = "You have arrived";
      stopNav();
      buzz([300, 100, 300, 100, 300]);
    }
  }

  function stopNav() {
    nav = null;
    $("hud").classList.add("hidden");
    $("btn-stop").classList.add("hidden");
    status("Waiting…");
    if (relay && pairCode) {
      fetch(relay + "/route/clear", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pairCode }) }).catch(function () {});
    }
  }
  $("btn-stop").addEventListener("click", stopNav);

  // ---------- GPS ----------
  function startGPS() {
    if (!navigator.geolocation) { status("No GPS"); return; }
    navigator.geolocation.watchPosition(function (p) {
      pos = { lat: p.coords.latitude, lon: p.coords.longitude,
              heading: p.coords.heading, speed: p.coords.speed };
      if (!nav && !pending) status("Ready — send a destination from your phone");
      guidance();
      draw();
    }, function () {
      status("GPS error");
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }

  // ---------- menu ----------
  function showMenu() {
    $("mi-profile-val").textContent = profile;
    $("mi-code-val").textContent = pairCode || "not set";
    $("mi-relay-val").textContent = relay || "not set";
    $("screen-menu").classList.remove("hidden");
  }
  $("btn-menu").addEventListener("click", showMenu);
  $("mi-back").addEventListener("click", function () { $("screen-menu").classList.add("hidden"); });
  $("mi-profile").addEventListener("click", function () {
    var order = ["foot", "bike", "car"];
    profile = order[(order.indexOf(profile) + 1) % order.length];
    saveSetting("profile", profile); showMenu();
  });
  $("mi-code").addEventListener("click", function () { openCodePad(); });
  $("mi-relay").addEventListener("click", function () {
    var v = prompt("Relay URL", relay);
    if (v !== null) { relay = v.replace(/\/$/, ""); saveSetting("relay", relay); showMenu(); }
  });
  $("mi-navigate").addEventListener("click", function () {
    $("screen-menu").classList.add("hidden");
    pollRelay();
  });

  // ---------- pairing code pad ----------
  var codeBuf = "";
  function openCodePad() {
    $("screen-menu").classList.add("hidden");
    codeBuf = "";
    renderCode();
    $("screen-code").classList.remove("hidden");
  }
  function renderCode() {
    $("code-display").textContent = (codeBuf + "______").slice(0, 6);
  }
  Array.prototype.forEach.call(document.querySelectorAll(".pad-key"), function (b) {
    b.addEventListener("click", function () {
      var k = b.getAttribute("data-k");
      if (k === "del") codeBuf = codeBuf.slice(0, -1);
      else if (k === "ok") {
        if (codeBuf.length === 6) {
          pairCode = codeBuf; saveSetting("code", pairCode);
          $("screen-code").classList.add("hidden");
          lastRouteTs = 0; pollRelay();
        }
        return;
      } else if (codeBuf.length < 6) codeBuf += k;
      renderCode();
    });
  });

  // ---------- bezel / keys ----------
  document.addEventListener("rotarydetent", function (e) {
    if (e.detail && e.detail.direction === "CW") zoom = Math.min(19, zoom + 1);
    else zoom = Math.max(13, zoom - 1);
    saveSetting("zoom", String(zoom));
    draw();
  });
  document.addEventListener("tizenhwkey", function (e) {
    if (e.keyName === "back") {
      if (!$("screen-code").classList.contains("hidden")) $("screen-code").classList.add("hidden");
      else if (!$("screen-menu").classList.contains("hidden")) $("screen-menu").classList.add("hidden");
      else try { tizen.application.getCurrentApplication().exit(); } catch (err) {}
    }
  });

  // ---------- boot ----------
  if (!relay) status("Set relay URL in menu or js/config.js");
  else if (!pairCode) status("Set pairing code in menu");
  startGPS();
  pollRelay();
  setInterval(pollRelay, CONFIG.POLL_MS);
  setInterval(function () { if (pos) draw(); }, 5000);
})();
