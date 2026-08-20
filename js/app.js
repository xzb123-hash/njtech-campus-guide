/* ============================================================
 * 南京工业大学·江浦校区 新生导览 —— 交互逻辑
 * ============================================================ */
(function () {
  "use strict";

  /* ---------------- 工具函数 ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function haversine(a, b) {
    const R = 6371000;
    const dLat = ((b[0] - a[0]) * Math.PI) / 180;
    const dLng = ((b[1] - a[1]) * Math.PI) / 180;
    const la1 = (a[0] * Math.PI) / 180, la2 = (b[0] * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* WGS-84 -> GCJ-02（高德底图使用 GCJ-02） */
  function outOfChina(lat, lng) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }
  function tLat(x, y) {
    let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
    r += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
    r += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
    return r;
  }
  function tLng(x, y) {
    let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
    r += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
    r += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
    return r;
  }
  function wgs2gcj(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    const a = 6378245.0, ee = 0.00669342162296594323;
    let dLat = tLat(lng - 105.0, lat - 35.0);
    let dLng = tLng(lng - 105.0, lat - 35.0);
    const radLat = (lat / 180.0) * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
    dLng = (dLng * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
    return [lat + dLat, lng + dLng];
  }

  const poiById = {};
  POIS.forEach((p) => (poiById[p.no] = p));

  /* ---------------- 地图初始化 ---------------- */
  const centerGCJ = wgs2gcj(32.0825, 118.6350);
  const map = L.map("campusMap", {
    center: centerGCJ,
    zoom: 15,
    minZoom: 13,
    maxZoom: 19,
    zoomControl: false,
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);

  const roadLayer = L.tileLayer(
    "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
    { subdomains: "1234", maxZoom: 19, maxNativeZoom: 18, attribution: "底图 © 高德地图" }
  );
  const satLayer = L.tileLayer(
    "https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
    { subdomains: "1234", maxZoom: 19, maxNativeZoom: 18, attribution: "底图 © 高德地图" }
  );
  roadLayer.addTo(map);
  L.control.layers(
    { "道路图": roadLayer, "卫星图": satLayer },
    null,
    { position: "bottomright", collapsed: false }
  ).addTo(map);

  /* 校园边界（描边） */
  const boundaryLatLngs = BOUNDARY.map((ring) =>
    ring.map(([la, ln]) => {
      const [gla, gln] = wgs2gcj(la, ln);
      return [gla, gln];
    })
  );
  L.polygon(boundaryLatLngs, {
    color: "#0b1f4d",
    weight: 2,
    opacity: 0.55,
    fillColor: "#0b1f4d",
    fillOpacity: 0.03,
    dashArray: "6 6",
    interactive: false,
  }).addTo(map);

  /* ---------------- 标记与弹窗 ---------------- */
  const catLayers = {};
  Object.keys(CATEGORIES).forEach((k) => (catLayers[k] = L.layerGroup().addTo(map)));

  function pinIcon(poi, active) {
    const c = CATEGORIES[poi.cat];
    return L.divIcon({
      className: "",
      html:
        '<span class="poi-pin' + (active ? " active" : "") + '" style="--pin:' + c.color + '">' + poi.no + "</span>",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -16],
    });
  }

  function popupHtml(poi) {
    const c = CATEGORIES[poi.cat];
    const media = poi.photo
      ? '<img src="' + poi.photo + '" alt="' + poi.name + '实景照片">'
      : '<div class="ph">' + c.icon + "</div>" +
        '<p class="ph-note">示意图 · 照片待补充（可替换为官方实拍）</p>';
    const aliases = poi.aliases && poi.aliases.length
      ? '<p class="alias">别称：' + poi.aliases.slice(0, 5).join(" / ") + "</p>"
      : "";
    const gcj = wgs2gcj(poi.lat, poi.lon);
    const navUrl =
      "https://uri.amap.com/navigation?to=" +
      gcj[1].toFixed(6) + "," + gcj[0].toFixed(6) + "," +
      encodeURIComponent(poi.name) + "&mode=walk&src=njtech-guide";
    return (
      '<div class="popup-media">' +
        '<span class="popup-badge" style="background:' + c.color + '">' + poi.no + "</span>" +
        '<span class="popup-cat">' + c.icon + " " + c.label + "</span>" +
        media +
      "</div>" +
      '<div class="popup-body">' +
        "<h3>" + poi.name + "</h3>" +
        aliases +
        '<p class="desc">' + poi.desc + "</p>" +
        '<div class="popup-actions">' +
          '<button class="btn btn-outline route-set" data-role="from" data-no="' + poi.no + '">设为起点</button>' +
          '<button class="btn btn-outline route-set" data-role="to" data-no="' + poi.no + '">设为终点</button>' +
          '<a class="btn btn-outline" href="' + navUrl + '" target="_blank" rel="noopener">高德步行导航</a>' +
        "</div>" +
      "</div>"
    );
  }

  const markers = {};
  POIS.forEach((poi) => {
    const gcj = wgs2gcj(poi.lat, poi.lon);
    const marker = L.marker(gcj, { icon: pinIcon(poi, false), riseOnHover: true });
    marker.bindPopup(popupHtml(poi), { className: "poi-popup", maxWidth: 320, closeButton: true });
    marker.on("click", () => setActiveMarker(poi.no));
    marker.on("popupclose", () => clearActiveMarker());
    marker.addTo(catLayers[poi.cat]);
    markers[poi.no] = marker;
  });

  let activeNo = null;
  function setActiveMarker(no) {
    clearActiveMarker();
    activeNo = no;
    markers[no].setIcon(pinIcon(poiById[no], true));
    markers[no].openPopup();
  }
  function clearActiveMarker() {
    if (activeNo !== null && markers[activeNo]) {
      markers[activeNo].setIcon(pinIcon(poiById[activeNo], false));
      activeNo = null;
    }
  }
  function focusPoi(no, fly) {
    const poi = poiById[no];
    if (!poi) return;
    if (fly) map.flyTo(wgs2gcj(poi.lat, poi.lon), Math.max(map.getZoom(), 16), { duration: 0.8 });
    else map.panTo(wgs2gcj(poi.lat, poi.lon));
    setActiveMarker(no);
  }

  /* 弹窗内「设为起点/终点」 */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".route-set");
    if (!btn) return;
    const poi = poiById[Number(btn.dataset.no)];
    const target = btn.dataset.role === "from" ? routeFrom : routeTo;
    target.value = poi.name;
    target.dataset.poiId = poi.no;
    if (routeFrom.dataset.poiId && routeTo.dataset.poiId) {
      computeRoute();
    }
  });

  /* ---------------- 图例筛选 ---------------- */
  const legendBox = $("#legendChips");
  const catVisible = {};
  Object.keys(CATEGORIES).forEach((k) => (catVisible[k] = true));

  Object.keys(CATEGORIES).forEach((k) => {
    const c = CATEGORIES[k];
    const count = POIS.filter((p) => p.cat === k).length;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "legend-chip on";
    chip.style.color = c.color;
    chip.innerHTML = '<span class="dot" style="background:' + c.color + '"></span>' + c.label + " " + count;
    chip.addEventListener("click", () => {
      catVisible[k] = !catVisible[k];
      chip.classList.toggle("on", catVisible[k]);
      chip.classList.toggle("off", !catVisible[k]);
      if (catVisible[k]) catLayers[k].addTo(map);
      else {
        map.closePopup();
        clearActiveMarker();
        catLayers[k].remove();
      }
      renderPoiList();
    });
    legendBox.appendChild(chip);
  });

  /* ---------------- 地点索引面板 ---------------- */
  const poiListEl = $("#poiList");
  const panel = $(".poi-panel");
  $("#panelToggle").addEventListener("click", () => {
    const collapsed = panel.classList.toggle("collapsed");
    $("#panelToggle").textContent = collapsed ? "›" : "‹";
    if (!collapsed) renderPoiList();
  });

  function renderPoiList() {
    const q = ($("#panelFilter").value || "").trim().toLowerCase();
    const sorted = POIS.slice().sort((a, b) => a.no - b.no);
    poiListEl.innerHTML = "";
    sorted.forEach((poi) => {
      const hide =
        !catVisible[poi.cat] ||
        (q && !(poi.name + " " + (poi.aliases || []).join(" ") + " " + CATEGORIES[poi.cat].label).toLowerCase().includes(q));
      const item = document.createElement("div");
      item.className = "poi-item" + (hide ? " hide" : "");
      item.innerHTML =
        '<span class="num" style="background:' + CATEGORIES[poi.cat].color + '">' + poi.no + "</span>" +
        '<div><div class="name">' + poi.name + '</div><div class="cat">' + CATEGORIES[poi.cat].label + "</div></div>";
      item.addEventListener("click", () => {
        map.closePopup();
        focusPoi(poi.no, true);
      });
      poiListEl.appendChild(item);
    });
  }
  $("#panelFilter").addEventListener("input", renderPoiList);
  renderPoiList();

  /* ---------------- 搜索 / 自动补全 ---------------- */
  function searchPois(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/);
    const hay = (poi) =>
      (poi.name + " " + (poi.aliases || []).join(" ") + " " + CATEGORIES[poi.cat].label + " " + poi.desc).toLowerCase();
    const scored = [];
    POIS.forEach((poi) => {
      const text = hay(poi);
      if (!tokens.every((t) => text.includes(t))) return;
      const nameLow = poi.name.toLowerCase();
      const aliasLow = (poi.aliases || []).join(" ").toLowerCase();
      let score = 100;
      if (tokens.some((t) => nameLow.startsWith(t))) score -= 20;
      if (tokens.some((t) => aliasLow.includes(t) && !nameLow.includes(t))) score += 10;
      if (!nameLow.includes(tokens[0]) && !aliasLow.includes(tokens[0])) score += 40;
      scored.push({ poi, score });
    });
    return scored.sort((a, b) => a.score - b.score).slice(0, 8).map((s) => s.poi);
  }

  function setupAutocomplete(input, onSelect) {
    let box = null, active = -1, items = [];

    function close() {
      if (box) { box.remove(); box = null; }
      active = -1;
    }
    function position() {
      if (!box) return;
      const r = input.getBoundingClientRect();
      box.style.left = Math.min(r.left, window.innerWidth - 320) + "px";
      box.style.top = r.bottom + 6 + "px";
      box.style.width = Math.max(r.width, 260) + "px";
    }
    function show(list) {
      close();
      if (!list.length) return;
      items = list;
      box = document.createElement("ul");
      box.className = "search-hints";
      box.style.position = "fixed";
      box.style.zIndex = 2000;
      document.body.appendChild(box);
      render();
      position();
    }
    function render() {
      if (!box) return;
      box.innerHTML = "";
      items.forEach((poi, i) => {
        const c = CATEGORIES[poi.cat];
        const li = document.createElement("li");
        li.className = i === active ? "active" : "";
        li.innerHTML =
          '<span class="num" style="background:' + c.color + '">' + poi.no + "</span>" +
          "<span>" + poi.name + '</span><span class="cat">' + c.label + "</span>";
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          pick(poi);
        });
        box.appendChild(li);
      });
    }
    function pick(poi) {
      input.value = poi.name;
      input.dataset.poiId = poi.no;
      close();
      if (onSelect) onSelect(poi);
    }

    input.addEventListener("focus", () => {
      const list = searchPois(input.value);
      if (list.length) show(list);
    });
    input.addEventListener("input", () => {
      delete input.dataset.poiId;
      const list = searchPois(input.value);
      show(list);
    });
    input.addEventListener("keydown", (e) => {
      if (!box) return;
      if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % items.length; render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + items.length) % items.length; render(); }
      else if (e.key === "Enter") { e.preventDefault(); if (items[active]) pick(items[active]); else if (items[0]) pick(items[0]); }
      else if (e.key === "Escape") close();
    });
    input.addEventListener("blur", () => setTimeout(close, 150));
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
  }

  const searchInput = $("#searchInput");
  const routeFrom = $("#routeFrom");
  const routeTo = $("#routeTo");

  setupAutocomplete(searchInput, (poi) => focusPoi(poi.no, true));
  $("#searchBtn").addEventListener("click", () => {
    const list = searchPois(searchInput.value);
    if (list.length) focusPoi(list[0].no, true);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const list = searchPois(searchInput.value);
      if (list.length) focusPoi(list[0].no, true);
    }
  });

  setupAutocomplete(routeFrom, () => { if (routeTo.dataset.poiId) computeRoute(); });
  setupAutocomplete(routeTo, () => { if (routeFrom.dataset.poiId) computeRoute(); });
  $("#swapBtn").addEventListener("click", () => {
    const a = routeFrom.value, b = routeTo.value, ai = routeFrom.dataset.poiId, bi = routeTo.dataset.poiId;
    routeFrom.value = b; routeTo.value = a;
    routeFrom.dataset.poiId = bi || ""; routeTo.dataset.poiId = ai || "";
  });
  $("#clearRouteBtn").addEventListener("click", () => {
    clearRoute();
    routeFrom.value = ""; routeTo.value = "";
    delete routeFrom.dataset.poiId; delete routeTo.dataset.poiId;
  });

  /* ---------------- 道路网与路线规划 ---------------- */
  const nodeIdx = new Map();
  const nodePts = [];
  const adj = [];
  function ensureNode(lat, lon) {
    const key = lat.toFixed(6) + "," + lon.toFixed(6);
    if (nodeIdx.has(key)) return nodeIdx.get(key);
    const idx = nodePts.length;
    nodeIdx.set(key, idx);
    nodePts.push([lat, lon]);
    adj.push([]);
    return idx;
  }
  ROADS.forEach((road) => {
    for (let i = 0; i < road.pts.length - 1; i++) {
      const p1 = road.pts[i], p2 = road.pts[i + 1];
      const i1 = ensureNode(p1[0], p1[1]), i2 = ensureNode(p2[0], p2[1]);
      if (i1 === i2) continue;
      const w = haversine(p1, p2);
      const nm = road.name || null;
      adj[i1].push([i2, w, nm]);
      adj[i2].push([i1, w, nm]);
    }
  });

  function snapPoi(poi) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < nodePts.length; i++) {
      const d = haversine([poi.lat, poi.lon], nodePts[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return { idx: best, dist: bestD };
  }
  const snapCache = {};
  POIS.forEach((p) => (snapCache[p.no] = snapPoi(p)));

  /* 校外交通点（地铁/公交站等）用直连段接入校园道路网 */
  function ensureExternalNode(poi) {
    const snap = snapCache[poi.no];
    if (snap.dist < 260) return snap.idx;
    const idx = ensureNode(poi.lat, poi.lon);
    const extName = poi.no === 52 ? "浦珠南路（校外）" : "校外通道";
    adj[idx].push([snap.idx, snap.dist, extName]);
    adj[snap.idx].push([idx, snap.dist, extName]);
    return idx;
  }
  const extNodeCache = {};
  POIS.forEach((p) => (extNodeCache[p.no] = ensureExternalNode(p)));

  function dijkstra(s, t) {
    const n = nodePts.length;
    const dist = new Array(n).fill(Infinity);
    const prev = new Array(n).fill(-1);
    const prevName = new Array(n).fill(null);
    const done = new Array(n).fill(false);
    dist[s] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) {
        if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      }
      if (u === -1) break;
      if (u === t) break;
      done[u] = true;
      for (const [v, w, nm] of adj[u]) {
        if (done[v]) continue;
        const nd = dist[u] + w;
        if (nd < dist[v]) {
          dist[v] = nd; prev[v] = u; prevName[v] = nm;
        }
      }
    }
    if (!isFinite(dist[t])) return null;
    const path = [];
    const names = [];
    for (let v = t; v !== -1; v = prev[v]) {
      path.push(v);
      if (prevName[v]) names.push(prevName[v]);
    }
    path.reverse();
    names.reverse();
    const roadNames = [];
    names.forEach((nm) => {
      if (roadNames[roadNames.length - 1] !== nm) roadNames.push(nm);
    });
    return { dist: dist[t], nodes: path, roadNames };
  }

  let routeLayers = [];
  let routeHighlight = null;
  function clearRoute() {
    routeLayers.forEach((l) => map.removeLayer(l));
    routeLayers = [];
    if (routeHighlight) { routeHighlight(); routeHighlight = null; }
    $("#routeResult").innerHTML = "";
  }

  function computeRoute() {
    clearRoute();
    const a = poiById[Number(routeFrom.dataset.poiId)];
    const b = poiById[Number(routeTo.dataset.poiId)];
    const box = $("#routeResult");
    if (!a || !b) {
      box.innerHTML = '<span style="color:#d35400">请从下拉框选择两个地点</span>';
      return;
    }
    if (a.no === b.no) {
      box.innerHTML = "起点与终点相同 😄";
      return;
    }

    let route = null;
    route = dijkstra(extNodeCache[a.no], extNodeCache[b.no]);

    if (route) {
      const pts = [[a.lat, a.lon]];
      route.nodes.forEach((i) => pts.push(nodePts[i]));
      pts.push([b.lat, b.lon]);
      const gcjPts = pts.map(([la, ln]) => wgs2gcj(la, ln));
      const poly = L.polyline(gcjPts, { className: "route-line" });
      const halo = L.polyline(gcjPts, { className: "route-halo" });
      routeLayers.push(halo, poly);
      const startGcj = wgs2gcj(a.lat, a.lon), endGcj = wgs2gcj(b.lat, b.lon);
      routeLayers.push(
        L.marker(startGcj, { icon: L.divIcon({ className: "", html: '<span class="route-a"></span>', iconSize: [14, 14], iconAnchor: [7, 7] }), interactive: false }),
        L.marker(endGcj, { icon: L.divIcon({ className: "", html: '<span class="route-b"></span>', iconSize: [14, 14], iconAnchor: [7, 7] }), interactive: false })
      );
      routeLayers.forEach((l) => l.addTo(map));
      const dist = route.dist;
      const timeMin = Math.max(1, Math.round((dist / 1.25) * 1.1 / 60));
      box.innerHTML =
        '<span class="time">🚶 约 ' + timeMin + " 分钟</span>" +
        " · 全程约 " + Math.round(dist) + " 米";
      if (route.roadNames.length) {
        box.innerHTML += '<br><span style="font-weight:400">途经：' + route.roadNames.join(" → ") + "</span>";
      }
      map.fitBounds(poly.getBounds(), { padding: [70, 70], maxZoom: 16.5 });
    } else {
      const dist = haversine([a.lat, a.lon], [b.lat, b.lon]) * 1.35;
      const timeMin = Math.max(1, Math.round((dist / 1.25) * 1.1 / 60));
      const gcjPts = [wgs2gcj(a.lat, a.lon), wgs2gcj(b.lat, b.lon)];
      const poly = L.polyline(gcjPts, { className: "route-line" });
      const halo = L.polyline(gcjPts, { className: "route-halo" });
      routeLayers.push(halo, poly);
      routeLayers.forEach((l) => l.addTo(map));
      box.innerHTML =
        '<span class="time">🚶 约 ' + timeMin + " 分钟</span>" +
        " · 直线估算约 " + Math.round(dist) + " 米 <span style='font-weight:400'>(未匹配道路网)</span>";
      map.fitBounds(poly.getBounds(), { padding: [70, 70], maxZoom: 16.5 });
    }
    map.closePopup();
    clearActiveMarker();
    markers[a.no].setIcon(pinIcon(a, true));
    markers[b.no].setIcon(pinIcon(b, true));
    routeHighlight = () => {
      markers[a.no].setIcon(pinIcon(a, false));
      markers[b.no].setIcon(pinIcon(b, false));
    };
  }

  $("#routeBtn").addEventListener("click", computeRoute);

  /* ---------------- 掠影 ---------------- */
  const grid = $("#galleryGrid");
  GALLERY.forEach((g) => {
    const fig = document.createElement("figure");
    fig.className = "gallery-item";
    fig.innerHTML = '<img src="' + g.src + '" alt="' + g.caption + '" loading="lazy">' +
      "<figcaption>" + g.caption + "</figcaption>";
    fig.addEventListener("click", () => window.open(g.src, "_blank"));
    grid.appendChild(fig);
  });

  /* 顶部导航高亮 */
  const sections = ["hero", "map", "guide", "gallery", "about"];
  const links = $$(".nav-links a");
  window.addEventListener("scroll", () => {
    const y = window.scrollY + 120;
    let cur = "hero";
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= y) cur = id;
    });
    links.forEach((a) => {
      a.style.color = a.getAttribute("href") === "#" + cur ? "var(--gold-light)" : "";
    });
  }, { passive: true });
})();
