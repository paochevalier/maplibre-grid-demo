async function init(){
    
    // Load the home intro HTML from an external file
    async function loadHomeIntro(){
      const el = document.getElementById("homeIntro");
      if(!el) return;
      try{
        const r = await fetch("home_description.html", { cache: "no-store" });
        if(r.ok){
          el.innerHTML = await r.text();
        }
      }catch(e){
        // no-op
      }
    }

    await loadHomeIntro();

try{ document.body.setAttribute("data-basemap", APP.basemapMode || "osm"); }catch(e){}

    initHomeTabs();
    initFilterSelectors();

    const [csvText, perimeters, grids, facilities, chloroplethRaw, socioRaw, relationRaw] = await Promise.all([
      fetchText(DATA_PATHS.cityCSV),
      fetchJSON(DATA_PATHS.perimeters),
      fetchJSON(DATA_PATHS.grids),
      fetchJSON(DATA_PATHS.facilities),
      fetchJSON(DATA_PATHS.chloropleth),
      fetchJSON(DATA_PATHS.socio),
      fetchJSON(DATA_PATHS.relation).catch(() => null)
    ]);

    const cityRows = parseCSV(csvText);
    for(const r of cityRows){
      if(!r || !r.key) continue;
      APP.data.cityView.set(String(r.key), { center: r.center, zoom: r.zoom });
      APP.data.cityLabels.set(String(r.key), betterCityLabel(APP.data.cityLabels.get(String(r.key)), String(r.label || r.key)));
    }

    // Normalize city names across all datasets so filters match reliably

    normalizeCityInGeojson(perimeters);
    normalizeCityInGeojson(grids);
    normalizeCityInGeojson(facilities);

    const chlorArr = Array.isArray(chloroplethRaw) ? chloroplethRaw : (chloroplethRaw.data || chloroplethRaw.rows || []);
    normalizeCityInTable(chlorArr);

    const relArr = relationRaw ? (Array.isArray(relationRaw) ? relationRaw : (relationRaw.data || relationRaw.rows || [])) : [];
    if(relArr && relArr.length) normalizeCityInTable(relArr);
    APP.data.relation = relArr;
    APP.data.relByCityPerimeter = buildRelationIndex(relArr);

    APP.data.perimeters = perimeters;
    APP.data.grids = grids;
    APP.data.facilities = facilities;

    APP.data.chloropleth = chlorArr;
    APP.data.socio = Array.isArray(socioRaw) ? socioRaw : (socioRaw.data || socioRaw.rows || []);

    if(looksLikeProjectedCoords(APP.data.facilities)){
      console.warn("facilities.geojson looks projected (not lon/lat). Please export it to WGS84 (EPSG:4326) for MapLibre.");
    }

    // Build id to city index (from grids)
    // Also build a fast lookup: id -> GeoJSON feature (for drawing the dissolved selection polygon)
    for(const f of (APP.data.grids.features || [])){
      const id = String(f.properties?.id ?? "");
      const ckey = String(f.properties?.city_key ?? cityKey(f.properties?.city ?? ""));
      if(id && ckey) APP.data.idToCity.set(id, ckey);

      if(id && ckey){
        if(!APP.data.cityToIds.has(ckey)) APP.data.cityToIds.set(ckey, []);
        APP.data.cityToIds.get(ckey).push(id);
      }

      if(id && f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")){
        APP.data.gridFeatById.set(id, {
          type:"Feature",
          properties:{},
          geometry: f.geometry
        });
      }
    }

// Build socio index
    for(const row of APP.data.socio){
      const id = String(row.id);
      if(!id) continue;
      APP.data.socioById.set(id, row);
    }

    // Build a clean list of study cities
    // We deduplicate using cityKey, so entries like Malmo and Malmö collapse into one option
    const keysSet = new Set();

    for(const f of (APP.data.perimeters.features || [])){
      const key = String(f.properties?.city_key ?? "");
      const lbl = String(f.properties?.city ?? "").trim();
      if(!key) continue;
      keysSet.add(key);
      APP.data.cityLabels.set(key, betterCityLabel(APP.data.cityLabels.get(key), lbl));
    }

    for(const f of (APP.data.grids.features || [])){
      const key = String(f.properties?.city_key ?? "");
      const lbl = String(f.properties?.city ?? "").trim();
      if(!key) continue;
      keysSet.add(key);
      APP.data.cityLabels.set(key, betterCityLabel(APP.data.cityLabels.get(key), lbl));
    }

    for(const key of APP.data.cityView.keys()){
      const k = String(key);
      keysSet.add(k);
      if(!APP.data.cityLabels.has(k)) APP.data.cityLabels.set(k, k);
    }

    const cities = Array.from(keysSet).sort((a,b) => {
      const la = APP.data.cityLabels.get(a) || a;
      const lb = APP.data.cityLabels.get(b) || b;
      return String(la).localeCompare(String(lb), "en", { sensitivity: "base" });
    });

    elCityA.innerHTML = cities.map(k => {
      const lbl = APP.data.cityLabels.get(k) || k;
      return `<option value="${k}">${lbl}</option>`;
    }).join("");

    elCityB.innerHTML = cities.map(k => {
      const lbl = APP.data.cityLabels.get(k) || k;
      return `<option value="${k}">${lbl}</option>`;
    }).join("");
// Create maps
    APP.maps = makeMaps();
    APP.stateA = newPaneState("A");
    APP.stateB = newPaneState("B");

    APP.stateA.city = cities[0] || null;
    APP.stateB.city = cities[1] || cities[0] || null;

    elCityA.value = APP.stateA.city || "";
    elCityB.value = APP.stateB.city || "";

    updateResultsHeaders();

    // Wait for both maps to load
    await new Promise((resolve) => {
      let n = 0;
      function done(){ n += 1; if(n === 2) resolve(); }
      APP.maps.mapA.on("load", done);
      APP.maps.mapB.on("load", done);
    });

    // Add layers and handlers
    addLayers(APP.maps.mapA, APP.stateA);
    addLayers(APP.maps.mapB, APP.stateB);

    setupDraw(APP.maps.mapA, APP.stateA);
    setupDraw(APP.maps.mapB, APP.stateB);

    bindInteractions(APP.maps.mapA, APP.stateA);
    bindInteractions(APP.maps.mapB, APP.stateB);

    // Initial filters
    applyCityFiltersForPane("A");
    applyCityFiltersForPane("B");

    cityFlyTo(APP.maps.mapA, APP.stateA.city);
    cityFlyTo(APP.maps.mapB, APP.stateB.city);

    await updateEverythingAllPanes();

    // UI events
    // Show or hide routes (paths). Default is OFF to keep the map clean.
    APP.showPaths = false;
    if(elShowPaths) elShowPaths.checked = false;

    if(elClearAdmin){
      elClearAdmin.addEventListener("click", async () => {
        if(APP.view !== "general") return;
        const am = getActivePaneStateAndMap();
        if(!am || !am.state) return;
        clearAdminSelectionForPane(am.state.paneId);
        updateResultsHeaders();
        updateSelectionSummary();
        renderResultsForPane(am.state.paneId);
        try{ if(am.map) cityFlyTo(am.map, am.state.city); }catch(e){}
      });
    }

    elShowPaths.addEventListener("change", async (e) => {
      APP.showPaths = !!e.target.checked;
      await updateEverythingAllPanes();
    });

    elCompare.addEventListener("change", async (e) => {
      setCompare(e.target.value === "on");
      updateResultsHeaders();
      await updateEverythingAllPanes();
    });

    elCityA.addEventListener("change", async (e) => {
      APP.stateA.city = e.target.value;
      updateResultsHeaders();
      clearSelectionForPane("A");
      clearAdminSelectionForPane("A");
      cityFlyTo(APP.maps.mapA, APP.stateA.city);
      await updateEverythingForPane("A");
      updateSelectionSummary();
    });

    elCityB.addEventListener("change", async (e) => {
      APP.stateB.city = e.target.value;
      updateResultsHeaders();
      clearSelectionForPane("B");
      clearAdminSelectionForPane("B");
      cityFlyTo(APP.maps.mapB, APP.stateB.city);
      await updateEverythingForPane("B");
      updateSelectionSummary();
    });

    elFilter1.addEventListener("change", async () => {
      refreshFilter2Options();
      clearSelectionForPane("A");
      clearAdminSelectionForPane("A");
      clearSelectionForPane("B");
      clearAdminSelectionForPane("B");
      await updateEverythingAllPanes();
    });

    elFilter2.addEventListener("change", async () => {
      clearSelectionForPane("A");
      clearAdminSelectionForPane("A");
      clearSelectionForPane("B");
      clearAdminSelectionForPane("B");
      await updateEverythingAllPanes();
    });
    document.getElementById("polyBtn").addEventListener("click", () => {
      selectByPolygon();
    });

    document.getElementById("clearBtn").addEventListener("click", () => {
      const pane = (APP.activePane === "B" && APP.compare) ? "B" : "A";
      clearSelectionForPane(pane);
      updateUIAfterSelection();
    });

    // Start on the home view (no map visible)
    setView("home");
  }

  init().catch(err => {
    console.error(err);
    alert("Failed to initialize the app. Check the console for details.");
  });
