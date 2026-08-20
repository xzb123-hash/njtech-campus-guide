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

  /* ---------------- 深色模式 ---------------- */
  const themeBtn = $("#themeToggle");
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    themeBtn.textContent = t === "dark" ? "☀️" : "🌙";
  }
  let theme = localStorage.getItem("njtech-theme");
  if (!theme) {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  applyTheme(theme);
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    localStorage.setItem("njtech-theme", next);
    applyTheme(next);
  });

  /* ---------------- 报到倒计时 ---------------- */
  const COUNT_KEY = "njtech-orientation";
  let orientationDate = localStorage.getItem(COUNT_KEY) || CONFIG.orientationDate;
  const dateInput = $("#orientationDate");
  try {
    dateInput.value = new Date(orientationDate).toISOString().slice(0, 16);
  } catch (e) { /* 忽略非法日期 */ }
  dateInput.addEventListener("change", () => {
    const v = dateInput.value;
    if (v) {
      orientationDate = new Date(v).toISOString();
      localStorage.setItem(COUNT_KEY, orientationDate);
    } else {
      orientationDate = CONFIG.orientationDate;
      localStorage.removeItem(COUNT_KEY);
    }
    tick();
  });
  function tick() {
    const el = $("#countdown");
    const t = new Date(orientationDate).getTime() - Date.now();
    if (t <= 0) { el.textContent = "报到日到啦 🎉"; return; }
    const d = Math.floor(t / 864e5);
    const h = Math.floor(t / 36e5) % 24;
    const m = Math.floor(t / 6e4) % 60;
    const s = Math.floor(t / 1e3) % 60;
    el.textContent = d + "天 " + h + "时 " + m + "分 " + s + "秒";
  }
  tick();
  setInterval(tick, 1000);

  /* ---------------- 行李清单 ---------------- */
  const CHECK_KEY = "njtech-checklist";
  const doneSet = new Set(JSON.parse(localStorage.getItem(CHECK_KEY) || "[]"));
  function renderChecklist() {
    const body = $("#checklistBody");
    body.innerHTML = "";
    let total = 0, done = 0;
    CHECKLIST.forEach((g) => {
      total += g.items.length;
      done += g.items.filter((it) => doneSet.has(g.cat + "|" + it)).length;
      const cat = document.createElement("div");
      cat.className = "checklist-cat";
      cat.textContent = g.cat;
      body.appendChild(cat);
      g.items.forEach((it) => {
        const key = g.cat + "|" + it;
        const label = document.createElement("label");
        label.className = "checklist-item" + (doneSet.has(key) ? " done" : "");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = doneSet.has(key);
        cb.addEventListener("change", () => {
          if (cb.checked) doneSet.add(key); else doneSet.delete(key);
          localStorage.setItem(CHECK_KEY, JSON.stringify(Array.from(doneSet)));
          renderChecklist();
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(it));
        body.appendChild(label);
      });
    });
    const pct = total ? Math.round((done / total) * 100) : 0;
    $("#checklistBar").style.width = pct + "%";
    $("#checklistPct").textContent = pct + "%";
  }
  renderChecklist();

  /* ---------------- 交通接驳助手 ---------------- */
  const transitFrom = $("#transitFrom");
  const transitDorm = $("#transitDorm");
  const transitResult = $("#transitResult");
  TRANSIT_OPTIONS.forEach((o) => {
    const op = document.createElement("option");
    op.value = o.id; op.textContent = o.label;
    transitFrom.appendChild(op);
  });
  DORM_GATES.forEach((d) => {
    const op = document.createElement("option");
    op.value = d.dorm; op.textContent = d.dorm;
    transitDorm.appendChild(op);
  });
  function renderTransit() {
    const opt = TRANSIT_OPTIONS.find((o) => o.id === transitFrom.value);
    if (!opt) { transitResult.innerHTML = ""; return; }
    let html = "";
    opt.steps.forEach((s) => { html += '<div class="t-step">' + s + "</div>"; });
    const gate = DORM_GATES.find((d) => d.dorm === transitDorm.value);
    if (gate) {
      html += '<div class="transit-gate">🏛 建议从<b> ' + gate.gate + " </b>进校，然后在地图上找到你的宿舍区，用「路线规划」生成到宿舍的步行路线。</div>";
    }
    transitResult.innerHTML = html;
  }
  transitFrom.addEventListener("change", renderTransit);
  transitDorm.addEventListener("change", renderTransit);
  renderTransit();

  /* ---------------- 校园巴士模拟 ---------------- */
  let busAnimId = null, busLayer = null;
  function stopBus() {
    if (busAnimId !== null) { cancelAnimationFrame(busAnimId); busAnimId = null; }
    if (busLayer) { map.removeLayer(busLayer); busLayer = null; }
    $("#busStatus").textContent = "";
  }
  function busPath(line) {
    const pts = [], segLens = [];
    for (let i = 0; i < line.stops.length - 1; i++) {
      const a = poiById[line.stops[i]], b = poiById[line.stops[i + 1]];
      const r = dijkstra(extNodeCache[a.no], extNodeCache[b.no]);
      if (!r) return null;
      const seg = [[a.lat, a.lon]];
      r.nodes.forEach((n) => seg.push(nodePts[n]));
      seg.push([b.lat, b.lon]);
      let len = 0;
      for (let k = 1; k < seg.length; k++) len += haversine(seg[k - 1], seg[k]);
      const startIdx = pts.length === 0 ? 0 : 1;
      seg.slice(startIdx).forEach((p) => pts.push(p));
      segLens.push(len);
    }
    return { pts, segLens };
  }
  $("#busPlayBtn").addEventListener("click", playBus);
  $("#busStopBtn").addEventListener("click", stopBus);
  function playBus() {
    stopBus();
    const line = BUS_LINES[Number($("#busLineSelect").value)];
    const data = busPath(line);
    if (!data || data.pts.length < 2) {
      $("#busStatus").textContent = "该线路暂无法连通道路网";
      return;
    }
    const gcj = data.pts.map((p) => wgs2gcj(p[0], p[1]));
    const poly = L.polyline(gcj, { color: line.color, weight: 5, opacity: 0.85, dashArray: "8 8" });
    busLayer = L.layerGroup([poly]).addTo(map);
    const marker = L.marker(gcj[0], {
      icon: L.divIcon({ className: "", html: '<span class="bus-dot" style="--bus:' + line.color + '"></span>', iconSize: [20, 20], iconAnchor: [10, 10] }),
      interactive: false,
    });
    busLayer.addLayer(marker);
    let total = 0;
    const cum = [];
    for (let i = 1; i < gcj.length; i++) { total += haversine(data.pts[i - 1], data.pts[i]); cum.push(total); }
    const stopPos = [0];
    data.segLens.forEach((l) => stopPos.push(stopPos[stopPos.length - 1] + l));
    const dur = Math.max(6, Math.min(20, total / 60));
    const t0 = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - t0) / (dur * 1000));
      const target = p * total;
      let k = 0;
      while (k < cum.length - 1 && cum[k] < target) k++;
      const prevDist = k === 0 ? 0 : cum[k - 1];
      const segLen = cum[k] - prevDist || 1;
      const f = Math.min(1, (target - prevDist) / segLen);
      const lat = data.pts[k][0] + (data.pts[k + 1][0] - data.pts[k][0]) * f;
      const lon = data.pts[k][1] + (data.pts[k + 1][1] - data.pts[k][1]) * f;
      marker.setLatLng(wgs2gcj(lat, lon));
      let cur = "校门口";
      for (let s = stopPos.length - 1; s >= 0; s--) {
        if (stopPos[s] <= target + 1) { cur = poiById[line.stops[s]].name; break; }
      }
      $("#busStatus").textContent = line.name + " · " + cur;
      if (p >= 1) {
        $("#busStatus").textContent = line.name + " 已到终点站 · " + poiById[line.stops[line.stops.length - 1]].name;
        if (busLayer) map.removeLayer(busLayer);
        busLayer = null;
        busAnimId = null;
        return;
      }
      busAnimId = requestAnimationFrame(frame);
    }
    busAnimId = requestAnimationFrame(frame);
    map.fitBounds(poly.getBounds(), { padding: [60, 60], maxZoom: 16 });
  }

  /* ---------------- 报到动线模式 ---------------- */
  const reportBtn = $("#reportModeBtn");
  const reportStatus = $("#reportStatus");
  let reportOn = false, reportLayers = [], reportPanel = null;
  function closeReport() {
    reportOn = false;
    reportBtn.classList.remove("active");
    reportStatus.textContent = "";
    if (reportPanel) { reportPanel.remove(); reportPanel = null; }
    reportLayers.forEach((l) => map.removeLayer(l));
    reportLayers = [];
    Object.keys(markers).forEach((no) => markers[no].setIcon(pinIcon(poiById[Number(no)], false)));
  }
  function openReport() {
    closeReport();
    reportOn = true;
    reportBtn.classList.add("active");
    reportStatus.textContent = "点击步骤，地图带你走";
    const pts = [];
    REPORT_STEPS.forEach((s) => {
      if (!poiById[s.poi]) return;
      pts.push(wgs2gcj(poiById[s.poi].lat, poiById[s.poi].lon));
      markers[s.poi].setIcon(pinIcon(poiById[s.poi], true));
    });
    const line = L.polyline(pts, { color: "#c9a227", weight: 4, dashArray: "6 8", opacity: 0.85 });
    reportLayers.push(line);
    line.addTo(map);
    const panel = document.createElement("div");
    panel.id = "reportPanel";
    REPORT_STEPS.forEach((s) => {
      const d = document.createElement("div");
      d.className = "report-step";
      const num = s.title.replace(/[^\d]/g, "");
      d.innerHTML =
        '<span class="rnum">' + num + "</span>" +
        '<div><div class="rtitle">' + s.title + '</div><div class="rdesc">' + s.desc + "</div></div>";
      d.addEventListener("click", () => focusPoi(s.poi, true));
      panel.appendChild(d);
    });
    reportBtn.closest(".tool-row").after(panel);
    map.fitBounds(line.getBounds(), { padding: [80, 80], maxZoom: 16 });
  }
  reportBtn.addEventListener("click", () => {
    if (reportOn) closeReport(); else openReport();
  });

  /* ---------------- 天气 ---------------- */
  const WMO = {
    0: "☀️ 晴", 1: "🌤 晴间多云", 2: "⛅ 多云", 3: "☁️ 阴",
    45: "🌫 雾", 48: "🌫 雾凇", 51: "🌦 毛毛雨", 53: "🌦 毛毛雨", 55: "🌧 毛毛雨",
    61: "🌧 小雨", 63: "🌧 中雨", 65: "🌧 大雨", 66: "🌧 冻雨", 67: "🌧 冻雨",
    71: "🌨 小雪", 73: "🌨 中雪", 75: "❄️ 大雪", 80: "🌦 阵雨", 81: "🌧 阵雨",
    82: "🌧 强阵雨", 95: "⛈ 雷雨", 96: "⛈ 雷雨伴冰雹", 99: "⛈ 雷雨伴冰雹",
  };
  function renderWeather(d) {
    const cur = d.current;
    const code = WMO[cur.weather_code] || "🌡 " + cur.weather_code;
    const days = d.daily;
    let html =
      '<div class="weather-today"><span class="weather-temp">' + Math.round(cur.temperature_2m) + "°C</span>" +
      "<span>" + CONFIG.weather.city + " · " + code + "</span></div>" +
      '<div class="weather-days">';
    for (let i = 0; i < Math.min(4, days.time.length); i++) {
      const wd = new Date(days.time[i] + "T00:00:00");
      const label = i === 0 ? "今天" : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][wd.getDay()];
      html +=
        '<div class="weather-day"><span>' + label + '</span><b>' + Math.round(days.temperature_2m_max[i]) + "°</b>" +
        "<span>" + Math.round(days.temperature_2m_min[i]) + "°</span></div>";
    }
    html += "</div>";
    $("#weatherBox").innerHTML = html;
  }
  fetch(
    "https://api.open-meteo.com/v1/forecast?latitude=" + CONFIG.weather.lat +
    "&longitude=" + CONFIG.weather.lon +
    "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min" +
    "&timezone=Asia%2FShanghai&forecast_days=4"
  ).then((r) => r.json()).then(renderWeather).catch(() => {
    $("#weatherBox").textContent = "天气服务暂不可用（离线或无网络时无法获取）";
  });

  /* ---------------- 常用入口 / 多校区 ---------------- */
  $("#campusLinks").innerHTML = CAMPUS_LINKS.map((l) =>
    '<li><a href="' + l.url + '" target="_blank" rel="noopener"><b>' + l.name + "</b></a> — " + l.desc + "</li>"
  ).join("");
  $("#campusNote").innerHTML = CAMPUS_NOTE.map((c) =>
    "<li><b>" + c.name + "</b>（" + c.addr + "）" + c.note + "</li>"
  ).join("");

  /* ---------------- PWA 离线支持 ---------------- */
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* 忽略注册失败 */ });
  }
})();
