// =============================
  // JiM MapLibre demo
  // This file is intentionally written as a single HTML file so you can learn by reading it.
  // Main ideas:
  // - Load multiple datasets (cities, perimeters, grids, facilities, travel time table, socio economic table)
  // - Render layers (perimeters, grid choropleth, facilities pins, route lines)
  // - Apply hierarchical filters (filter level 1 then filter level 2)
  // - Let the user select grid cells and compute aggregated indicators
  // - Optionally compare two cities in a split view
  // =============================

  // Data locations, all paths are relative to the folder that serves index.html
  // Keep everything under data/ and assets/ to make GitHub Pages deployment easier
  const DATA_PATHS = {
    cityCSV: "data/lon_lat_city.csv",
    perimeters: "data/perimeters.geojson",
    grids: "data/grids.geojson",
    facilities: "data/facilities.geojson",
    chloropleth: "data/data_chloropeth.json",
    socio: "data/socio_economic_variables.json",
    relation: "data/relation_grid_perimeter.json",
    routesDir: "data/linestring_by_id"
  };

  // Basemap style
  // Robust approach: a single style containing two raster basemaps
  // We never call map.setStyle, we only toggle layer visibility
  const BASE_STYLE = {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors"
      },
      sat: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "Tiles © Esri"
      }
    },
    layers: [
      { id: "base-osm", type: "raster", source: "osm", layout: { visibility: "visible" } },
      { id: "base-sat", type: "raster", source: "sat", layout: { visibility: "none" } }
    ]
  };

// Filter level 1, stable numeric codes used in your R pipeline
  // This is what drives the first stage of filtering for both choropleth and facilities
  const FILTER1 = [
    { code: 1, label: "Leisure Facilities" },
    { code: 2, label: "Local Food Stores" },
    { code: 3, label: "Local Health Care Providers" },
    { code: 4, label: "Primary Schools" }
  ];

  // Filter level 2, optional refinement inside a filter 1 family
  // code 0 means: use only filter 1 (rows where filter_2_code equals 0)
  // matchTokens are also used to filter route files by id_facility text
  const FILTER2 = [
    { code: 0, label: "All (level 1 only)" },
    { code: 1, label: "Library", matchTokens: ["biblioteca", "library"] },
    { code: 2, label: "Cinema", matchTokens: ["cinema"] },
    { code: 3, label: "Elementary school", matchTokens: ["elementary school"] },
    { code: 4, label: "Local grocery store", matchTokens: ["local grocery store", "grocery"] },
    { code: 5, label: "Pharmacy", matchTokens: ["pharmacy"] },
    { code: 6, label: "Pre school", matchTokens: ["pre-school", "pre school", "preschool"] },
    { code: 7, label: "Primary health care provider", matchTokens: ["primary health care provider", "cap"] },
    { code: 8, label: "Supermarket", matchTokens: ["supermarket"] }
  ];

  // Which level 2 options are valid for each level 1 option
  // This helps keep the UI clean and prevents inconsistent combinations
  const FILTER2_BY_FILTER1 = {
    1: [1,2],
    2: [4,8],
    3: [5,7],
    4: [3,6]
  };

  // Choropleth travel time categories
  // Your categorisation is based on minutes, mapped to integers 1 to 7
  // Colors are chosen as green to yellow to red
  const TIME_CATS = [
    { cat:1, label:"Less than 5 minutes", color:"#0b5d1e" },
    { cat:2, label:"5 to 10 minutes", color:"#1b8a3b" },
    { cat:3, label:"10 to 15 minutes", color:"#63c66e" },
    { cat:4, label:"15 to 20 minutes", color:"#f1dd4b" },
    { cat:5, label:"20 to 25 minutes", color:"#f39a2b" },
    { cat:6, label:"25 to 30 minutes", color:"#e24a2b" },
    { cat:7, label:"More than 30 minutes", color:"#b30000" }
  ];

  // Layer ids used in both maps so we can refer to them safely
  const LAYERS = {
    perimetersCasing: "perimeters-casing",
    perimetersLine: "perimeters-line",
    perimetersFill: "perimeters-fill-hit",
    gridsFill: "grids-fill",
    gridsLine: "grids-line",
    facilitiesSym: "facilities-sym",
    selectionFill: "selection-fill",
    selectionLine: "selection-line",
    routesLine: "routes-line",
    routesLabels: "routes-labels"
  };

  const elCompare = document.getElementById("compareToggle");
  const elCityA = document.getElementById("cityASelect");
  const elCityB = document.getElementById("cityBSelect");
  const elCityBWrap = document.getElementById("cityBWrap");
  const elFilter1 = document.getElementById("filter1Select");
  const elFilter2 = document.getElementById("filter2Select");
  const elClearAdmin = document.getElementById("clearAdminBtn");
const elSelCells = document.getElementById("selCells");
  const elSelMeta = document.getElementById("selMeta");

  const elShowPaths = document.getElementById("showPaths");
  const elResultsCityA = document.getElementById("resultsCityA");
  const elResultsCityB = document.getElementById("resultsCityB");

  const elPaneB = document.getElementById("paneB");
  const elResultsAText = document.getElementById("resultsAText");
  const elResultsBText = document.getElementById("resultsBText");


  // Home and view navigation
  const elHomeBtn = document.getElementById("homeBtn");
  const elHomeView = document.getElementById("homeView");
  const elMapsView = document.getElementById("maps");
  const elAccessIndexView = document.getElementById("accessIndexView");
  const elOpenGeneralBtn = document.getElementById("openGeneralBtn");
  const elOpenGridBtn = document.getElementById("openGridBtn");
  const elOpenIndexBtn = document.getElementById("openIndexBtn");
  const elCityIndex = document.getElementById("cityIndexSelect");

  const elShowPathsWrap = document.getElementById("showPathsWrap");
  const elGridToolsRow = document.getElementById("gridToolsRow");

  // Formatting helpers so numbers look nice in the UI (thousand separators etc)

  function fmtInt(x){
    return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(x);
  }
  function fmtNumber(x){
    return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(x);
  }
  function fmtPct(x){
    return new Intl.NumberFormat("en-GB", { style:"percent", maximumFractionDigits: 0 }).format(x);
  }
  function fmtEUR(x){
    return new Intl.NumberFormat("en-GB", { style:"currency", currency:"EUR", maximumFractionDigits: 0 }).format(x);
  }



  // Socio data helper
  // socio_economic_variables.json stores COUNTS per grid cell, and the population field can be named in a few ways depending on export.
  function getTotalPop(row){
    const v = row ? (row.total_pop ?? row.tot_pop ?? row.totalPop ?? row.totPop) : undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  // Build the legend HTML from TIME_CATS

  function buildLegend(){
    const wrap = document.getElementById("legendItems");
    wrap.innerHTML = TIME_CATS.map(d => `
      <div class="item">
        <span class="swatch" style="background:${d.color};"></span>
        <span>${d.label}</span>
      </div>
    `).join("");
  }

  buildLegend();


  // =============================
  // View management
  // home: landing page (no map)
  // general: city level results (no cell selection)
  // grid: interactive grid selection (existing behaviour)
  // index: accessibility index preview (satellite)
  // =============================

  function setBodyViewClass(view){
    document.body.classList.remove("view-home", "view-index");
    if(view === "home") document.body.classList.add("view-home");
    if(view === "index") document.body.classList.add("view-index");
  }

  function showEl(el, on){
    if(!el) return;
    if(on) el.classList.remove("hidden");
    else el.classList.add("hidden");
  }

  function updateModeUI(){
    const isGrid = APP.view === "grid";
    const isGeneral = APP.view === "general";

    APP.selectionEnabled = isGrid;

    // Grid only tools
    showEl(elShowPathsWrap, isGrid);
    showEl(elGridToolsRow, isGrid);
    showEl(document.getElementById("hintText"), isGrid);

    // In general mode, we do not use paths at all
    if(isGeneral){
      APP.showPaths = false;
      if(elShowPaths) elShowPaths.checked = false;
    }

    updateResultsHeaders();
    updateSelectionSummary();

    // Make sure maps redraw correctly when they become visible
    if(APP.maps && (isGrid || isGeneral)){
      try{ APP.maps.mapA.resize(); }catch(e){}
      try{ APP.maps.mapB.resize(); }catch(e){}
    }
  }

  function setView(view){
    APP.view = view;
    setBodyViewClass(view);

    showEl(elHomeView, view === "home");
    showEl(elAccessIndexView, view === "index");
    showEl(elMapsView, (view === "general" || view === "grid"));

    // Clear admin selection whenever we leave General results mode
    if(view !== "general"){
      if(APP.stateA && APP.maps) clearAdminSelectionForPane("A");
      if(APP.stateB && APP.maps) clearAdminSelectionForPane("B");
    }

    // When switching between modes, clear selection and hide path layers to keep the UI consistent
    if(view === "general" || view === "index" || view === "home"){
      if(APP.stateA && APP.maps) clearSelectionForPane("A");
      if(APP.stateB && APP.maps) clearSelectionForPane("B");
    }

    if(view === "index"){
      setCompare(false);
      initIndexMapIfNeeded();
      setGlobalBasemapMode("sat");
    }

    if(view === "general" || view === "grid"){
      if(APP.maps){
        try{ APP.maps.mapA.resize(); }catch(e){}
        try{ APP.maps.mapB.resize(); }catch(e){}
      }
      updateEverythingAllPanes();
    }

    updateModeUI();
  }

  function initHomeTabs(){
    const btns = Array.from(document.querySelectorAll(".tabBtn"));
    const panels = {
      whats: document.getElementById("tab-whats"),
      method: document.getElementById("tab-method"),
      results: document.getElementById("tab-results")
    };

    function activateTab(key){
      for(const b of btns){
        b.classList.toggle("active", b.dataset.tab === key);
      }
      for(const k of Object.keys(panels)){
        showEl(panels[k], k === key);
      }
    }

    for(const b of btns){
      b.addEventListener("click", () => activateTab(b.dataset.tab));
    }

    // Results quick actions
    if(elOpenGeneralBtn) elOpenGeneralBtn.addEventListener("click", () => setView("general"));
    if(elOpenGridBtn) elOpenGridBtn.addEventListener("click", () => setView("grid"));
    if(elOpenIndexBtn) elOpenIndexBtn.addEventListener("click", () => setView("index"));

    // Home button in the topbar
    if(elHomeBtn) elHomeBtn.addEventListener("click", () => setView("home"));
  }


  // Minimal CSV parser for lon_lat_city.csv
  // Accepts comma, semicolon, or tab and also handles decimal commas

  function parseCSV(text){
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if(lines.length < 2) return [];
    const header = lines[0];

    let delim = ",";
    if(header.includes(";")) delim = ";";
    else if(header.includes("\t")) delim = "\t";

    const cols = header.split(delim).map(s => s.trim());
    const out = [];

    for(let i=1;i<lines.length;i++){
      const parts = lines[i].split(delim).map(s => s.trim());
      if(parts.length < 3) continue;

      const row = {};
      for(let j=0;j<cols.length;j++) row[cols[j]] = parts[j];

      const cityRaw = row.city || row.City || parts[0];
      const lonRaw = row.lon || row.Lon || row["\"lon\""] || parts[1];
      const latRaw = row.lat || row.Lat || row["\"lat\""] || parts[2];
      const zoomRaw = row.z || row.Z || row.zoom || row.Zoom || row["\"z\""] || parts[3] || "";

      const label = canonCity(cityRaw);
      const key = cityKey(label);

      const lon = Number(String(lonRaw).replace(/"/g, "").replace(/'/g, "").replace(",", "."));
      const lat = Number(String(latRaw).replace(/"/g, "").replace(/'/g, "").replace(",", "."));
      const zoom = Number(String(zoomRaw).replace(/"/g, "").replace(/'/g, "").replace(",", "."));

      if(!label || !key || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      out.push({
        key,
        label,
        center: [lon, lat],
        zoom: Number.isFinite(zoom) ? ((zoom < 7) ? Math.min(zoom + 10, 16) : zoom) : 12
      });
    }
    return out;
  }

function safeGet(obj, key){
    return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
  }

  function stripOuterQuotes(x){
    let s = String(x ?? "").trim();
    if((s.startsWith("\"") && s.endsWith("\"")) || (s.startsWith("'") && s.endsWith("'"))){
      s = s.slice(1, -1);
    }
    return s.trim();
  }

  function canonCity(x){
    // Human readable label
    return stripOuterQuotes(x).replace(/\s+/g, " ").trim().normalize("NFC");
  }

  function cityKey(x){
    // Key used to match across datasets, insensitive to accents, quotes, and a few known aliases
    const base = canonCity(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const aliases = {
      gothenburg: "goteborg",
      goteborg: "goteborg",
      "ga¶teborg": "goteborg",
      malmo: "malmo",
      "malma¶": "malmo",
      oslo: "oslo",
      grenoble: "grenoble",
      sabadell: "sabadell",
      bodrum: "bodrum",
      koszalin: "koszalin"
    };

    return aliases[base] || base;
  }

  function betterCityLabel(current, candidate){
    if(!candidate) return current;
    if(!current) return candidate;
    const curHas = /[^\x00-\x7F]/.test(current);
    const candHas = /[^\x00-\x7F]/.test(candidate);
    if(candHas && !curHas) return candidate;
    if(candidate.length > current.length) return candidate;
    return current;
  }

  function normalizeCityInGeojson(gj){
    if(!gj || !gj.features) return;
    for(const f of gj.features){
      if(!f || !f.properties) continue;

      if(f.properties.city !== undefined){
        const lbl = canonCity(f.properties.city);
        f.properties.city = lbl;
        f.properties.city_key = cityKey(lbl);
      }

      if(f.properties.NOMMUNI !== undefined){
        f.properties.NOMMUNI = String(f.properties.NOMMUNI).trim();
      }
    }
  }

  function normalizeCityInTable(rows){
    if(!Array.isArray(rows)) return;
    for(const r of rows){
      if(r && r.city !== undefined){
        const lbl = canonCity(r.city);
        r.city = lbl;
        r.city_key = cityKey(lbl);
      }
    }
  }

function buildRelationIndex(rows){
    const out = new Map();
    if(!Array.isArray(rows)) return out;
    for(const r of rows){
      const ckey = String(r.city_key || "");
      const pidRaw = r.perimeter_id ?? r.perimeterId ?? r.perimeter ?? r.pid;
      const pid = (pidRaw === undefined || pidRaw === null) ? "" : String(pidRaw);
      const id = (r.id === undefined || r.id === null) ? "" : String(r.id);
      if(!ckey || !pid || !id) continue;
      if(!out.has(ckey)) out.set(ckey, new Map());
      const byPer = out.get(ckey);
      if(!byPer.has(pid)) byPer.set(pid, { ids: new Set(), label: "" });
      byPer.get(pid).ids.add(id);
      const nm = String(r.NOMMUNI || r.nommuni || r.name || "").trim();
      if(nm && !byPer.get(pid).label) byPer.get(pid).label = nm;
    }
    return out;
  }

function toKeyCityFilter(city, f1, f2){
    return `${city}__${f1}__${f2}`;
  }

  function getFilter1Label(code){
    const x = FILTER1.find(d => d.code === code);
    return x ? x.label : "Unknown";
  }
  function getFilter2Label(code){
    const x = FILTER2.find(d => d.code === code);
    return x ? x.label : "Unknown";
  }

  // Update the "Results, <label>" headers using current pane cities or admin selection labels
  function headerLabelForState(state, fallback){
    const key = state?.city ? String(state.city) : "";
    if(APP.view === "general" && state?.generalRegion?.label) return String(state.generalRegion.label);
    const lbl = key ? (APP.data.cityLabels.get(key) || key) : "";
    return lbl || fallback;
  }

function updateResultsHeaders(){
    if(elResultsCityA) elResultsCityA.textContent = headerLabelForState(APP.stateA, "left city");
    if(elResultsCityB) elResultsCityB.textContent = headerLabelForState(APP.stateB, "right city");
  }

  // Decide which tokens are allowed in route filtering
  // Used to keep only the relevant routes for the chosen filters

  function allowedRouteTokens(filter1Code, filter2Code){
    if(!filter1Code) return [];
    if(filter2Code && filter2Code !== 0){
      const f2 = FILTER2.find(d => d.code === filter2Code);
      return f2 ? f2.matchTokens : [];
    }
    const list = FILTER2_BY_FILTER1[filter1Code] || [];
    const tokens = [];
    for(const c of list){
      const f2 = FILTER2.find(d => d.code === c);
      if(f2) tokens.push(...f2.matchTokens);
    }
    return tokens;
  }

  // Compute a bounding box for a set of GeoJSON features
  // Used to fit the map view to a city extent if needed

  function computeBBox(features){
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    function scan(coords){
      for(const c of coords){
        if(Array.isArray(c[0])) scan(c);
        else{
          const x = c[0], y = c[1];
          if(x < minX) minX = x;
          if(y < minY) minY = y;
          if(x > maxX) maxX = x;
          if(y > maxY) maxY = y;
        }
      }
    }

    for(const f of features){
      if(!f.geometry) continue;
      scan(f.geometry.coordinates);
    }

    if(!isFinite(minX)) return null;
    return [minX, minY, maxX, maxY];
  }

  function fitToFeatures(map, features){
    const b = computeBBox(features);
    if(!b) return;
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, duration: 700 });
  }

  async function fetchJSON(url){
    const r = await fetch(url);
    if(!r.ok) throw new Error(`Failed to fetch ${url}`);
    return await r.json();
  }

  async function fetchText(url){
    const r = await fetch(url);
    if(!r.ok) throw new Error(`Failed to fetch ${url}`);
    return await r.text();
  }

  // Quick sanity check: if coordinates exceed lon lat ranges, data is probably projected
  // This is only a warning helper, we do not reproject in the browser

  function looksLikeProjectedCoords(geojson){
    try{
      const f = geojson.features && geojson.features[0];
      if(!f) return false;
      const g = f.geometry;
      if(!g) return false;

      const coords = (g.type === "Point") ? g.coordinates : g.coordinates.flat(2);
      const x = coords[0];
      const y = coords[1];
      return Math.abs(x) > 180 || Math.abs(y) > 90;
    }catch(e){
      return false;
    }
  }

  // Create a simple pin icon as inline SVG so we do not need extra image files

  function makePinDataURI(){
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">
        <path fill="#111" d="M12 2c-3.3 0-6 2.7-6 6c0 4.8 6 14 6 14s6-9.2 6-14c0-3.3-2.7-6-6-6zm0 8.2c-1.2 0-2.2-1-2.2-2.2S10.8 5.8 12 5.8s2.2 1 2.2 2.2S13.2 10.2 12 10.2z"/>
      </svg>
    `.trim();
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  // Create the two MapLibre map instances
  // Pane B can be hidden when compare mode is off

  
  // Basemap helpers
  // We keep both OSM and Satellite layers in the same style and toggle their visibility
  function applyBasemapMode(map, mode){
    if(!map) return;
    const osmVis = (mode === "sat") ? "none" : "visible";
    const satVis = (mode === "sat") ? "visible" : "none";
    try{ map.setLayoutProperty("base-osm", "visibility", osmVis); }catch(e){}
    try{ map.setLayoutProperty("base-sat", "visibility", satVis); }catch(e){}
  }


  // Perimeter styling depends on the basemap
  // - Satellite: white line (better contrast on imagery)
  // - OSM: black dashed line (better contrast on light backgrounds)
  function applyPerimeterTheme(map, mode){
    if(!map) return;

    const main = (mode === "sat") ? "#ffffff" : "#111111";
    const casing = (mode === "sat") ? "#000000" : "#ffffff";

    const mainOpacity = (mode === "sat") ? 0.85 : 0.65;
    const casingOpacity = (mode === "sat") ? 0.18 : 0.22;

    try{
      if(map.getLayer(LAYERS.perimetersLine)){
        map.setPaintProperty(LAYERS.perimetersLine, "line-color", main);
        map.setPaintProperty(LAYERS.perimetersLine, "line-opacity", mainOpacity);
      }
    }catch(e){}

    try{
      if(map.getLayer(LAYERS.perimetersCasing)){
        map.setPaintProperty(LAYERS.perimetersCasing, "line-color", casing);
        map.setPaintProperty(LAYERS.perimetersCasing, "line-opacity", casingOpacity);
      }
    }catch(e){}

    // Accessibility index view perimeter line
    try{
      if(map.getLayer("perimetersIndexLine")){
        map.setPaintProperty("perimetersIndexLine", "line-color", main);
      }
    }catch(e){}
  }

  function setGlobalBasemapMode(mode){
    const m = (mode === "sat") ? "sat" : "osm";
    APP.basemapMode = m;
    try{ document.body.setAttribute("data-basemap", m); }catch(e){}
    if(APP.maps){
      applyBasemapMode(APP.maps.mapA, m);
      applyBasemapMode(APP.maps.mapB, m);
      applyPerimeterTheme(APP.maps.mapA, m);
      applyPerimeterTheme(APP.maps.mapB, m);
    }
    if(APP.indexMap){
      applyBasemapMode(APP.indexMap, m);
      applyPerimeterTheme(APP.indexMap, m);
    }
    if(Array.isArray(APP.basemapCtrls)){
      for(const ctrl of APP.basemapCtrls){
        try{ ctrl.update(); }catch(e){}
      }
    }
  }

  // Custom MapLibre control: OSM or Satellite toggle
