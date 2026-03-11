class BasemapToggleControl{
    constructor(){
      this._map = null;
      this._container = null;
      this._btnOSM = null;
      this._btnSAT = null;
    }
    onAdd(map){
      this._map = map;
      const container = document.createElement("div");
      container.className = "maplibregl-ctrl maplibregl-ctrl-group basemap-toggle-ctrl";

      const b1 = document.createElement("button");
      b1.type = "button";
      b1.textContent = "OSM";
      b1.addEventListener("click", () => setGlobalBasemapMode("osm"));

      const b2 = document.createElement("button");
      b2.type = "button";
      b2.textContent = "Sat";
      b2.addEventListener("click", () => setGlobalBasemapMode("sat"));

      container.appendChild(b1);
      container.appendChild(b2);

      this._container = container;
      this._btnOSM = b1;
      this._btnSAT = b2;

      this.update();
      return container;
    }
    onRemove(){
      if(this._container && this._container.parentNode){
        this._container.parentNode.removeChild(this._container);
      }
      this._map = null;
    }
    update(){
      const mode = APP.basemapMode || "osm";
      if(this._btnOSM) this._btnOSM.classList.toggle("active", mode === "osm");
      if(this._btnSAT) this._btnSAT.classList.toggle("active", mode === "sat");
    }
  }

  // Create the two MapLibre map instances
  // Pane B can be hidden when compare mode is off
  function makeMaps(){
    const mapA = new maplibregl.Map({
      container: "mapA",
      style: BASE_STYLE,
      center: [2.13, 41.44],
      zoom: 12
    });

    const mapB = new maplibregl.Map({
      container: "mapB",
      style: BASE_STYLE,
      center: [2.13, 41.44],
      zoom: 12
    });

    mapA.addControl(new maplibregl.NavigationControl(), "top-right");
    mapB.addControl(new maplibregl.NavigationControl(), "top-right");

    mapA.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-right");
    mapB.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-right");

    // Basemap toggle next to the attribution control (the small "i")
    const ctrlA = new BasemapToggleControl();
    const ctrlB = new BasemapToggleControl();
    mapA.addControl(ctrlA, "top-right");
    mapB.addControl(ctrlB, "top-right");

    if(Array.isArray(APP.basemapCtrls)){
      APP.basemapCtrls.push(ctrlA, ctrlB);
    }

    mapA.on("load", () => { const m = APP.basemapMode || "osm"; applyBasemapMode(mapA, m); applyPerimeterTheme(mapA, m); });
    mapB.on("load", () => { const m = APP.basemapMode || "osm"; applyBasemapMode(mapB, m); applyPerimeterTheme(mapB, m); });

    return { mapA, mapB };
  }


// Create the satellite preview map for the Accessibility index section
  function initIndexMapIfNeeded(){
    if(APP.indexMap) return;

    APP.indexMap = new maplibregl.Map({
      container: "mapIndex",
      style: BASE_STYLE,
      center: [2.13, 41.44],
      zoom: 12
    });

    APP.indexMap.addControl(new maplibregl.NavigationControl(), "top-right");

    APP.indexMap.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-right");

    const ctrlI = new BasemapToggleControl();
    APP.indexMap.addControl(ctrlI, "top-right");
    if(Array.isArray(APP.basemapCtrls)) APP.basemapCtrls.push(ctrlI);


    APP.indexMap.on("load", () => {
      const m = APP.basemapMode || "osm";
      applyBasemapMode(APP.indexMap, m);
      applyPerimeterTheme(APP.indexMap, m);

      // Add perimeters to provide a city context on the satellite basemap
      if(APP.data.perimeters){
        APP.indexMap.addSource("perimetersIndex", { type:"geojson", data: APP.data.perimeters });
        APP.indexMap.addLayer({
          id: "perimetersIndexLine",
          type: "line",
          source: "perimetersIndex",
          paint: {
            "line-color": "#ffffff",
            "line-width": 3,
            "line-opacity": 0.85
          }
        });
      
        // Ensure the perimeter color matches the current basemap mode
        applyPerimeterTheme(APP.indexMap, APP.basemapMode || "osm");
}

      // Populate city select once data is ready
      if(elCityIndex && elCityA && elCityA.options.length){
        elCityIndex.innerHTML = Array.from(elCityA.options).map(o => `<option value="${o.value}">${o.textContent}</option>`).join("");
        elCityIndex.value = elCityA.value;
        applyIndexCityFilter(elCityIndex.value);
      }
    });

    if(elCityIndex){
      elCityIndex.addEventListener("change", () => applyIndexCityFilter(elCityIndex.value));
    }
  }

  function applyIndexCityFilter(city){
    if(!APP.indexMap) return;
    if(!city) return;

    // Filter the perimeters line, then fly to the city view if available
    if(APP.indexMap.getLayer("perimetersIndexLine")){
      APP.indexMap.setFilter("perimetersIndexLine", ["==", ["to-string", ["get","city_key"]], String(city)]);
    }

    const v = APP.data.cityView.get(String(city));
    if(v){
      const z = Number.isFinite(v.zoom) ? v.zoom : 4;
      APP.indexMap.flyTo({ center: v.center, zoom: z, duration: 900 });
    }
  }

  const APP = {
    data: {
      cityView: new Map(),
      cityLabels: new Map(),
      perimeters: null,
      grids: null,
      facilities: null,
      chloropleth: null,
      socio: null,
      socioById: new Map(),
      idToCity: new Map(),
      cityToIds: new Map(),
      gridFeatById: new Map(),
      gridCentroidsByCity: new Map()
    },
    maps: null,
    compare: false,
    activePane: "A",
    stateA: null,
    stateB: null,
    routeCache: new Map(),
    showPaths: false,
    basemapMode: "osm",
    basemapCtrls: [],
    basemapToken: 0,

    // View mode
    view: "home",
    uiMode: "grid",
    selectionEnabled: true,

    // Accessibility index preview map (satellite)
    indexMap: null
  };

  // Each pane keeps its own selection and interaction state so compare mode is independent

  function newPaneState(paneId){
    return {
      paneId,
      city: null,
      selectedIds: new Set(),
      timeCatById: new Map(),
      timeCatStateIds: new Set(),
      draw: null,

      // Two separate popups so grid tooltips and facility tooltips do not fight each other
      popupGrid: new maplibregl.Popup({ closeButton:false, closeOnClick:false }),
      popupFacility: new maplibregl.Popup({ closeButton:false, closeOnClick:false }),
      popupAdmin: new maplibregl.Popup({ closeButton:false, closeOnClick:false }),

      // General results mode: optional admin area selection (cluster of touching municipalities)
      generalRegion: null,
      generalRegionIds: null,

      // Avoid binding the same event handlers multiple times (important when switching basemaps)
      eventsBound: false
    };
  }

  // Add Mapbox Draw to allow polygon selection

  function setupDraw(map, state){
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: false, trash: false }
    });
    map.addControl(draw);
    state.draw = draw;
  }

  // Add sources and layers to a map
  // Perimeters always visible
  // Grids and facilities appear only after filter selection
  // Routes appear only after cells are selected

  function addLayers(map, state){
        map.addSource("perimeters", { type:"geojson", data: APP.data.perimeters });

    // Perimeters hit area: invisible fill layer used for hover and click inside polygons
    map.addLayer({
      id: LAYERS.perimetersFill,
      type:"fill",
      source:"perimeters",
      paint:{
        "fill-color":"#000000",
        "fill-opacity":0.01
      }
    });

    // Perimeters style: lighter and more readable than a thick solid black line
    // We draw a subtle casing below, then a dashed main line above.
    map.addLayer({
      id: LAYERS.perimetersCasing,
      type:"line",
      source:"perimeters",
      paint:{
        "line-color":"#ffffff",
        "line-width": 5.5,
        "line-opacity":0.22
      }
    });

    map.addLayer({
      id: LAYERS.perimetersLine,
      type:"line",
      source:"perimeters",
      paint:{
        "line-color":"#111111",
        "line-width": 2.8,
        "line-opacity":0.65,
        "line-dasharray":[2,2]
      }
    });


    // Admin area highlight (General results mode)
    // We keep a separate source for the selected cluster of touching municipalities
    const adminSourceId = `adminSel_${state.paneId}`;
    const adminFillId = `adminSelFill_${state.paneId}`;
    const adminLineId = `adminSelLine_${state.paneId}`;

    map.addSource(adminSourceId, { type:"geojson", data: { type:"FeatureCollection", features: [] } });

    map.addLayer({
      id: adminFillId,
      type:"fill",
      source: adminSourceId,
      paint:{
        "fill-color":"#111111",
        "fill-opacity":0.08
      },
      layout:{ visibility:"none" }
    });

    map.addLayer({
      id: adminLineId,
      type:"line",
      source: adminSourceId,
      paint:{
        "line-color":"#111111",
        "line-width":2.8,
        "line-opacity":0.9
      },
      layout:{ visibility:"none" }
    });

    map.addSource("grids", { type:"geojson", data: APP.data.grids, promoteId:"id" });
    map.addLayer({
      id: LAYERS.gridsFill,
      type:"fill",
      source:"grids",
      paint:{
        "fill-color":[
          "case",
          ["!=", ["feature-state","time_cat"], null],
          [
            "match",
            ["feature-state","time_cat"],
            1, TIME_CATS[0].color,
            2, TIME_CATS[1].color,
            3, TIME_CATS[2].color,
            4, TIME_CATS[3].color,
            5, TIME_CATS[4].color,
            6, TIME_CATS[5].color,
            7, TIME_CATS[6].color,
            "rgba(0,0,0,0)"
          ],
          "rgba(0,0,0,0)"
        ],
        "fill-opacity":[
          "case",
          ["boolean", ["feature-state","selected"], false],
          0.75,
          0.55
        ]
      },
      layout: { visibility: "none" }
    });

    map.addLayer({
      id: LAYERS.gridsLine,
      type:"line",
      source:"grids",
      paint:{
        "line-color":[
          "case",
          ["boolean", ["feature-state","selected"], false],
          "#000000",
          "#111111"
        ],
        "line-width":["case", ["boolean", ["feature-state","selected"], false], 2.2, 0],
        "line-opacity":["case", ["boolean", ["feature-state","selected"], false], 0.95, 0]
      },
      layout: { visibility: "none" }
    });

    // Selection geometry (dissolved polygon) drawn on top of the grids
    // This helps the user "see" the selected area as one shape.
    map.addSource("selection", { type:"geojson", data: { type:"FeatureCollection", features: [] } });

    map.addLayer({
      id: LAYERS.selectionFill,
      type:"fill",
      source:"selection",
      paint:{
        "fill-color":"#111111",
        "fill-opacity":0.06
      },
      layout:{ visibility:"none" }
    });

    map.addLayer({
      id: LAYERS.selectionLine,
      type:"line",
      source:"selection",
      paint:{
        "line-color":"#111111",
        "line-width":2.2,
        "line-opacity":0.85
      },
      layout:{ visibility:"none" }
    });

    map.addSource("facilities", { type:"geojson", data: APP.data.facilities });

    // Facilities are rendered as circles (reliable across browsers and avoids missing icon issues)
    // Tooltip is handled in bindInteractions (mousemove on this layer)
    map.addLayer({
      id: LAYERS.facilitiesSym,
      type:"circle",
      source:"facilities",
      paint:{
        "circle-radius":5,
        "circle-color":"#111111",
        "circle-opacity":0.9,
        "circle-stroke-color":"#ffffff",
        "circle-stroke-width":1.2
      },
      layout:{ visibility:"none" }
    });
map.addSource("routes", { type:"geojson", data: { type:"FeatureCollection", features: [] } });
    map.addLayer({
      id: LAYERS.routesLine,
      type:"line",
      source:"routes",
      paint:{
        "line-color":"#000000",
        "line-width":2,
        "line-opacity":0.75
      }
    });

    map.addLayer({
      id: LAYERS.routesLabels,
      type:"symbol",
      source:"routes",
      layout:{
        "symbol-placement":"line",
        "symbol-spacing": 220,

        // Distance label on top of the path
        // For line placement, text-offset moves the text slightly away from the line
        "text-field":[
          "concat",
          ["get","distance_input"],
          " km"
        ],
        "text-size":11,
        "text-offset":[0, -1.2],
        "text-keep-upright": true
      },
      paint:{
        "text-halo-color":"#ffffff",
        "text-halo-width":2
      }
    });

    map.setLayoutProperty(LAYERS.routesLine, "visibility", "none");
    map.setLayoutProperty(LAYERS.routesLabels, "visibility", "none");
  }

  // Wire mouse and click interactions: selection, hover modes, tooltips

  function bindInteractions(map, state){
    if(state.eventsBound) return;
    state.eventsBound = true;

    map.on("click", () => { APP.activePane = state.paneId; });

    map.on("mouseenter", LAYERS.gridsFill, () => { if(APP.view === "grid") map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", LAYERS.gridsFill, () => { map.getCanvas().style.cursor = ""; });


    // Grid tooltip: show the cell id on hover
    map.on("mousemove", LAYERS.gridsFill, (e) => {
      if(APP.view !== "grid") return;
      const f = e.features && e.features[0];
      if(!f) return;
      const pid = safeGet(f.properties, "id");
      if(pid === null || pid === undefined) return;

      // If we are hovering a grid cell, remove the facility popup (if any)
      state.popupFacility.remove();

      state.popupGrid
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-size:12px;"><b>Cell id</b>: ${String(pid)}</div>`)
        .addTo(map);
    });

    map.on("mouseleave", LAYERS.gridsFill, () => { state.popupGrid.remove(); });
    map.on("click", LAYERS.gridsFill, (e) => {
      if(!APP.selectionEnabled) return;
      const f = e.features && e.features[0];
      if(!f) return;
      const pid = safeGet(f.properties, "id");
      if(pid === null || pid === undefined) return;
      toggleGridSelection(map, state, String(pid));
      updateUIAfterSelection();
    });

    // Perimeters tooltip and click selection for General results mode
    map.on("mouseenter", LAYERS.perimetersFill, () => { if(APP.view === "general") map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", LAYERS.perimetersFill, () => { map.getCanvas().style.cursor = ""; });

    map.on("mousemove", LAYERS.perimetersFill, (e) => {
      if(APP.view !== "general") return;
      const f = e.features && e.features[0];
      if(!f) return;
      const nm = String(f.properties?.NOMMUNI ?? "").trim() || "NA";

      // Remove other popups so we keep only one tooltip at a time
      state.popupGrid.remove();
      state.popupFacility.remove();

      state.popupAdmin
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-size:12px;"><b>Name of the city</b>: ${nm}</div>`)
        .addTo(map);
    });

    map.on("mouseleave", LAYERS.perimetersFill, () => {
      state.popupAdmin.remove();
    });

    map.on("click", LAYERS.perimetersFill, (e) => {
      if(APP.view !== "general") return;
      const f = e.features && e.features[0];
      if(!f) return;
      selectTouchingPerimetersCluster(map, state, f);
    });

    // If the pointer is exactly on the perimeter stroke, MapLibre targets the line layer.
    // We bind the same handlers on the line layer to keep behavior consistent.
    map.on("mouseenter", LAYERS.perimetersLine, () => { if(APP.view === "general") map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", LAYERS.perimetersLine, () => { map.getCanvas().style.cursor = ""; });

    map.on("mousemove", LAYERS.perimetersLine, (e) => {
      if(APP.view !== "general") return;
      const f = e.features && e.features[0];
      if(!f) return;
      const nm = String(f.properties?.NOMMUNI ?? "").trim() || "NA";

      state.popupGrid.remove();
      state.popupFacility.remove();

      state.popupAdmin
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-size:12px;"><b>Name of the city</b>: ${nm}</div>`)
        .addTo(map);
    });

    map.on("mouseleave", LAYERS.perimetersLine, () => { state.popupAdmin.remove(); });

    map.on("click", LAYERS.perimetersLine, (e) => {
      if(APP.view !== "general") return;
      const f = e.features && e.features[0];
      if(!f) return;
      selectTouchingPerimetersCluster(map, state, f);
    });

    map.on("mousemove", LAYERS.facilitiesSym, (e) => {
      const f = e.features && e.features[0];
      if(!f) return;
      const name = safeGet(f.properties, "BPE_type_name") || "Facility";
      state.popupGrid.remove();
      state.popupFacility.setLngLat(e.lngLat).setHTML(`<div style="font-size:12px;font-weight:700;">${String(name)}</div>`).addTo(map);
    });

    map.on("mouseleave", LAYERS.facilitiesSym, () => { state.popupFacility.remove(); });
  }

  // Selection management
  // We use MapLibre feature state to visually mark selected grid cells

    function promotedGridId(id){
    const ss = String(id);
    return (/^\d+$/).test(ss) ? Number(ss) : ss;
  }

function selectGrid(map, state, id){
    if(state.selectedIds.has(id)) return;
    state.selectedIds.add(id);
    map.setFeatureState({ source:"grids", id: promotedGridId(id) }, { selected:true });
  }
  function unselectGrid(map, state, id){
    if(!state.selectedIds.has(id)) return;
    state.selectedIds.delete(id);
    map.setFeatureState({ source:"grids", id: promotedGridId(id) }, { selected:false });
  }
  function toggleGridSelection(map, state, id){
    if(state.selectedIds.has(id)) unselectGrid(map, state, id);
    else selectGrid(map, state, id);
  }


  // Build and draw a dissolved polygon of the currently selected grid cells
  // This runs after every selection update.
  function updateSelectionGeometryForPane(paneId){
    const state = paneId === "A" ? APP.stateA : APP.stateB;
    const map = paneId === "A" ? APP.maps.mapA : APP.maps.mapB;

    const ids = Array.from(state.selectedIds);
    if(ids.length === 0){
      map.getSource("selection").setData({ type:"FeatureCollection", features: [] });
      map.setLayoutProperty(LAYERS.selectionFill, "visibility", "none");
      map.setLayoutProperty(LAYERS.selectionLine, "visibility", "none");
      return;
    }

    // Collect the polygon features of selected cells
    const feats = [];
    for(const id of ids){
      const f = APP.data.gridFeatById.get(String(id));
      if(f) feats.push(f);
    }

    if(feats.length === 0){
      map.getSource("selection").setData({ type:"FeatureCollection", features: [] });
      map.setLayoutProperty(LAYERS.selectionFill, "visibility", "none");
      map.setLayoutProperty(LAYERS.selectionLine, "visibility", "none");
      return;
    }

    // Try to dissolve with iterative union
    let merged = null;
    let unionOk = true;

    try{
      for(const f of feats){
        if(!merged) merged = f;
        else{
          const u = turf.union(merged, f);
          if(u) merged = u;
        }
      }
    }catch(err){
      unionOk = false;
    }

    const data = unionOk && merged
      ? { type:"FeatureCollection", features: [merged] }
      : { type:"FeatureCollection", features: feats };

    map.getSource("selection").setData(data);
    map.setLayoutProperty(LAYERS.selectionFill, "visibility", "visible");
    map.setLayoutProperty(LAYERS.selectionLine, "visibility", "visible");
  }

  function clearSelectionForPane(paneId){
    const state = paneId === "A" ? APP.stateA : APP.stateB;
    const map = paneId === "A" ? APP.maps.mapA : APP.maps.mapB;

    for(const id of state.selectedIds){
      map.setFeatureState({ source:"grids", id: promotedGridId(id) }, { selected:false });
    }
    state.selectedIds.clear();

    map.getSource("routes").setData({ type:"FeatureCollection", features: [] });
    map.setLayoutProperty(LAYERS.routesLine, "visibility", "none");
    map.setLayoutProperty(LAYERS.routesLabels, "visibility", "none");

    // Also clear the dissolved selection polygon
    map.getSource("selection").setData({ type:"FeatureCollection", features: [] });
    map.setLayoutProperty(LAYERS.selectionFill, "visibility", "none");
    map.setLayoutProperty(LAYERS.selectionLine, "visibility", "none");
  }


  function getAdminIdsForState(state){
    if(!state || !state.city) return [];
    if(APP.view === "general" && Array.isArray(state.generalRegionIds) && state.generalRegionIds.length){
      return state.generalRegionIds;
    }
    return APP.data.cityToIds.get(String(state.city)) || [];
  }

  function setAdminHighlight(map, state, features){
    const srcId = `adminSel_${state.paneId}`;
    const fillId = `adminSelFill_${state.paneId}`;
    const lineId = `adminSelLine_${state.paneId}`;

    const fc = { type:"FeatureCollection", features: features || [] };
    try{
      const src = map.getSource(srcId);
      if(src) src.setData(fc);
    }catch(e){}

    const vis = (features && features.length) ? "visible" : "none";
    try{ map.setLayoutProperty(fillId, "visibility", vis); }catch(e){}
    try{ map.setLayoutProperty(lineId, "visibility", vis); }catch(e){}
  }

  function clearAdminSelectionForPane(paneId){
    const state = paneId === "A" ? APP.stateA : APP.stateB;
    const map = paneId === "A" ? APP.maps.mapA : APP.maps.mapB;

    state.generalRegion = null;
    state.generalRegionIds = null;

    if(map) setAdminHighlight(map, state, []);
  }

  function ensureGridCentroidsForCity(city){
    const key = String(city);
    if(APP.data.gridCentroidsByCity.has(key)) return APP.data.gridCentroidsByCity.get(key);

    const out = [];
    for(const f of (APP.data.grids.features || [])){
      const c = String(f.properties?.city_key ?? "");
      if(String(c) !== key) continue;

      const id = String(f.properties?.id ?? "");
      if(!id) continue;

      try{
        const pt = turf.centroid(f);
        const coords = pt && pt.geometry && pt.geometry.coordinates;
        if(coords && coords.length === 2) out.push({ id, coord: coords });
      }catch(e){}
    }

    APP.data.gridCentroidsByCity.set(key, out);
    return out;
  }

  function idsInsideAnyPolygon(city, polygons){
    const centroids = ensureGridCentroidsForCity(city);
    if(!centroids.length) return [];

    const out = [];
    if(!polygons || !polygons.length) return out;

    // Precompute bbox union for quick reject
    let bbox = null;
    try{
      bbox = turf.bbox({ type:"FeatureCollection", features: polygons });
    }catch(e){}

    for(const item of centroids){
      const coord = item.coord;
      if(bbox){
        if(coord[0] < bbox[0] || coord[0] > bbox[2] || coord[1] < bbox[1] || coord[1] > bbox[3]) continue;
      }

      const p = turf.point(coord);

      let inside = false;
      for(const poly of polygons){
        try{
          if(turf.booleanPointInPolygon(p, poly)){
            inside = true;
            break;
          }
        }catch(e){}
      }
      if(inside) out.push(item.id);
    }
    return out;
  }

  function selectTouchingPerimetersCluster(map, state, seedFeature){
    if(!seedFeature || !seedFeature.properties) return;

    const city = String(state.city || "");
    if(!city) return;

    const seedName = String(seedFeature.properties.NOMMUNI || seedFeature.properties.name || seedFeature.properties.NOM || "").trim() || "Selected area";

    // Toggle off if user clicks the same seed again
    if(state.generalRegion && state.generalRegion.seedName === seedName){
      clearAdminSelectionForPane(state.paneId);
      updateResultsHeaders();
      updateSelectionSummary();
      renderResultsForPane(state.paneId);
      return;
    }


    // Prefer the explicit relation table: perimeter_id -> grid ids
    let pidRaw = seedFeature.properties.perimeter_id ?? seedFeature.properties.perimeterId ?? seedFeature.properties.pid ?? seedFeature.properties.id;
    let pid = (pidRaw === undefined || pidRaw === null) ? "" : String(pidRaw);

    // If perimeter_id is missing on the feature, try to resolve it from the relation index using the perimeter name (NOMMUNI)
    if((!pid || pid === "undefined") && APP.data.relByCityPerimeter){
      const byPer = APP.data.relByCityPerimeter.get(String(city));
      if(byPer){
        const target = String(seedName || "").trim().toLowerCase();
        for(const [k, v] of byPer.entries()){
          const lbl = String(v?.label || "").trim().toLowerCase();
          if(lbl && lbl === target){
            pid = String(k);
            break;
          }
        }
      }
    }

    if(pid && APP.data.relByCityPerimeter){
      const byPer = APP.data.relByCityPerimeter.get(String(city));
      const rel = byPer ? byPer.get(String(pid)) : null;

      if(rel && rel.ids && rel.ids.size){
        const label = rel.label || seedName;

        // Some municipalities are split into multiple perimeter features.
        // Highlight all pieces that share the same perimeter_id (or same NOMMUNI as a fallback).
        const highlightFeats = (APP.data.perimeters.features || []).filter(ff => {
          const c = String(ff.properties?.city_key ?? "");
          if(c !== String(city)) return false;
          const p = ff.properties?.perimeter_id ?? ff.properties?.perimeterId ?? ff.properties?.pid ?? ff.properties?.id;
          const nm = String(ff.properties?.NOMMUNI ?? ff.properties?.name ?? "").trim();
          return (String(p ?? "") === String(pid)) || (nm && nm === String(label));
        });

        const feats = highlightFeats.length ? highlightFeats : [seedFeature];

        state.generalRegion = { seedName: label, label: label, features: feats, perimeterId: String(pid) };
        state.generalRegionIds = Array.from(rel.ids);

        setAdminHighlight(map, state, feats);
        try{ fitToFeatures(map, feats); }catch(e){}

        updateResultsHeaders();
        updateSelectionSummary();
        renderResultsForPane(state.paneId);
        return;
      }
    }
    // Candidates: all perimeters inside the study city
    const candidates = (APP.data.perimeters.features || []).filter(f => String(f.properties?.city_key ?? "") === city);

    // Build an index list so we can keep track of what is already selected
    const selected = [];
    const selectedIdx = new Set();
    const queue = [];

    // Seed: match by NOMMUNI when possible, fall back to the clicked geometry reference
    let seedIndex = -1;
    for(let i=0;i<candidates.length;i++){
      const nm = String(candidates[i].properties?.NOMMUNI ?? "").trim();
      if(nm && nm === seedName){ seedIndex = i; break; }
    }
    if(seedIndex < 0) seedIndex = 0;

    queue.push(seedIndex);
    selectedIdx.add(seedIndex);

    // Precompute bboxes for speed
    const bboxes = candidates.map(f => {
      try{ return turf.bbox(f); }catch(e){ return null; }
    });

    function bboxIntersects(a,b){
      if(!a || !b) return true;
      return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
    }

    while(queue.length){
      const i = queue.pop();
      const a = candidates[i];
      selected.push(a);

      for(let j=0;j<candidates.length;j++){
        if(selectedIdx.has(j)) continue;
        if(!bboxIntersects(bboxes[i], bboxes[j])) continue;

        const b = candidates[j];
        let touch = false;

        try{
          if(typeof turf.booleanTouches === "function"){
            touch = turf.booleanTouches(a, b);
          }else{
            touch = turf.booleanIntersects(a, b);
          }
        }catch(e){
          touch = false;
        }

        if(!touch){
          // Tolerant fallback for borderline cases
          try{ touch = turf.booleanIntersects(a, b); }catch(e){}
        }

        if(touch){
          selectedIdx.add(j);
          queue.push(j);
        }
      }
    }

    state.generalRegion = { seedName, label: seedName, features: selected };

    // Compute the grid ids covered by this cluster of touching municipalities
    state.generalRegionIds = idsInsideAnyPolygon(city, selected);

    setAdminHighlight(map, state, selected);

    // Optionally zoom to the selected cluster
    try{
      fitToFeatures(map, selected);
    }catch(e){}

    updateResultsHeaders();
    updateSelectionSummary();
    renderResultsForPane(state.paneId);
  }

  function getActivePaneStateAndMap(){
    if(APP.activePane === "B" && APP.compare){
      return { state: APP.stateB, map: APP.maps.mapB };
    }
    APP.activePane = "A";
    return { state: APP.stateA, map: APP.maps.mapA };
  }

  function setCompare(on){
    APP.compare = on;
    if(on){
      elCityBWrap.classList.remove("hidden");
      elPaneB.classList.remove("hidden");
    }else{
      elCityBWrap.classList.add("hidden");
      elPaneB.classList.add("hidden");
      APP.activePane = "A";
    }
    updateUIAfterSelection();
  }

  // Apply city, filter 1, filter 2 to the datasets and update map layers
  // This is called when the user changes filters

  function applyCityFiltersForPane(paneId){
    const state = paneId === "A" ? APP.stateA : APP.stateB;
    const map = paneId === "A" ? APP.maps.mapA : APP.maps.mapB;

    const ckey = state.city;
    if(!ckey) return;

    map.setFilter(LAYERS.perimetersCasing, ["==", ["to-string", ["get","city_key"]], String(ckey)]);
    map.setFilter(LAYERS.perimetersLine, ["==", ["to-string", ["get","city_key"]], String(ckey)]);

    map.setFilter(LAYERS.gridsFill, ["==", ["to-string", ["get","city_key"]], String(ckey)]);
    map.setFilter(LAYERS.gridsLine, ["==", ["to-string", ["get","city_key"]], String(ckey)]);

    const f1 = Number(elFilter1.value) || 0;
    const f2 = Number(elFilter2.value) || 0;

    if(f1 > 0){
      const base = ["all",
        ["==", ["to-string", ["get","city_key"]], String(ckey)],
        ["==", ["to-number", ["get","filter_1_code"]], f1]
      ];
      if(f2 > 0){
        base.push(["==", ["to-number", ["get","filter_2_code"]], f2]);
      }
      map.setFilter(LAYERS.facilitiesSym, base);
      map.setLayoutProperty(LAYERS.facilitiesSym, "visibility", "visible");
    }else{
      map.setLayoutProperty(LAYERS.facilitiesSym, "visibility", "none");
    }
  }

function setGridVisibilityForPane(paneId){
    const map = paneId === "A" ? APP.maps.mapA : APP.maps.mapB;
    const f1 = Number(elFilter1.value) || 0;
    const vis = f1 > 0 ? "visible" : "none";
    map.setLayoutProperty(LAYERS.gridsFill, "visibility", vis);
    const lineVis = (f1 > 0 && APP.view === "grid") ? "visible" : "none";
    map.setLayoutProperty(LAYERS.gridsLine, "visibility", lineVis);
}

  // Build a lookup map: grid id -> time_cat for the chosen city and filters

  function buildTimeCatMap(city, filter1Code, filter2Code){
    const out = new Map();
    if(!APP.data.chloropleth) return out;

    const f1 = Number(filter1Code) || 0;
    let f2 = Number(filter2Code) || 0;

    if(f1 <= 0) return out;

    if(f2 <= 0) f2 = 0;

    for(const row of APP.data.chloropleth){
      if(String(row.city_key) !== String(city)) continue;
      if(Number(row.filter_1_code) !== f1) continue;
      if(Number(row.filter_2_code) !== f2) continue;

      const id = String(row.id);
      const cat = Number(row.time_cat);

      if(!id || !Number.isFinite(cat)) continue;
      out.set(id, cat);
    }
    return out;
  }

  // Push time_cat values into MapLibre feature state so the fill color updates

  function applyChoroplethForPane(paneId){
    const state = paneId === "A" ? APP.stateA : APP.stateB;
    const map = paneId === "A" ? APP.maps.mapA : APP.maps.mapB;

    const city = state.city;
    const cityLabel = city ? (APP.data.cityLabels.get(String(city)) || String(city)) : "";
    const f1 = Number(elFilter1.value) || 0;
    const f2 = Number(elFilter2.value) || 0;

    const newMap = buildTimeCatMap(city, f1, f2);

    for(const id of state.timeCatStateIds){
      map.setFeatureState({ source:"grids", id: promotedGridId(id) }, { time_cat: null });
    }
    state.timeCatStateIds.clear();

    for(const [id, cat] of newMap.entries()){
      map.setFeatureState({ source:"grids", id: promotedGridId(id) }, { time_cat: cat });
      state.timeCatStateIds.add(id);
    }

    state.timeCatById = newMap;
  }

  function cityFlyTo(map, ckey){
    const view = APP.data.cityView.get(String(ckey));
    if(view){
      const z = Number.isFinite(view.zoom) ? view.zoom : 4;
      map.flyTo({ center: view.center, zoom: z, duration: 900 });
      return;
    }
    const feats = (APP.data.perimeters.features || []).filter(f => String(f.properties?.city_key ?? "") === String(ckey));
    if(feats.length) fitToFeatures(map, feats);
  }

// Populate the dropdowns and connect UI events

  function initFilterSelectors(){
    elFilter1.innerHTML = `<option value="0">None</option>` + FILTER1.map(d => `<option value="${d.code}">${d.label}</option>`).join("");
    elFilter2.innerHTML = `<option value="0">All (level 1 only)</option>`;
    elFilter2.disabled = true;
  }

  function refreshFilter2Options(){
    const f1 = Number(elFilter1.value) || 0;

    if(f1 <= 0){
      elFilter2.innerHTML = `<option value="0">All (level 1 only)</option>`;
      elFilter2.value = "0";
      elFilter2.disabled = true;
      return;
    }

    const allowed = FILTER2_BY_FILTER1[f1] || [];
    const items = [ FILTER2.find(d => d.code === 0), ...allowed.map(c => FILTER2.find(d => d.code === c)) ].filter(Boolean);

    elFilter2.innerHTML = items.map(d => `<option value="${d.code}">${d.label}</option>`).join("");
    elFilter2.disabled = false;

    if(!items.some(d => String(d.code) === String(elFilter2.value))){
      elFilter2.value = "0";
    }
  }

  // Routes loading
  // Each selected grid id can have a dedicated GeoJSON file under linestring_by_id/
  // We cache them in memory so repeated selections are fast

  async function fetchRouteFile(id){
    if(APP.routeCache.has(id)) return APP.routeCache.get(id);
    const url = `${DATA_PATHS.routesDir}/${encodeURIComponent(id)}.geojson`;
    const fc = await fetchJSON(url);
    APP.routeCache.set(id, fc);
    return fc;
  }

  // Update the routes layer for the current selection
  // Only keep route features compatible with the chosen filters

  async function updateRoutesForPane(paneId){
    const state = paneId === "A" ? APP.stateA : APP.stateB;
    const map = paneId === "A" ? APP.maps.mapA : APP.maps.mapB;

    const f1 = Number(elFilter1.value) || 0;
    const f2 = Number(elFilter2.value) || 0;

    // If the user does not want to show paths, keep routes hidden and skip fetching
    if(!APP.showPaths){
      map.getSource("routes").setData({ type:"FeatureCollection", features: [] });
      map.setLayoutProperty(LAYERS.routesLine, "visibility", "none");
      map.setLayoutProperty(LAYERS.routesLabels, "visibility", "none");
      return;
    }

    if(f1 <= 0 || state.selectedIds.size === 0){
      map.getSource("routes").setData({ type:"FeatureCollection", features: [] });
      map.setLayoutProperty(LAYERS.routesLine, "visibility", "none");
      map.setLayoutProperty(LAYERS.routesLabels, "visibility", "none");
      return;
    }

    const tokens = allowedRouteTokens(f1, f2).map(s => String(s).toLowerCase());
    const wantAll = tokens.length === 0;

    const ids = Array.from(state.selectedIds);

    const limit = 20;
    const results = [];
    for(let i=0;i<ids.length;i+=limit){
      const slice = ids.slice(i, i+limit);
      const batch = await Promise.allSettled(slice.map(k => fetchRouteFile(k)));
      results.push(...batch);
    }

    const allFeatures = [];
    for(const r of results){
      if(r.status !== "fulfilled") continue;
      const fc = r.value;
      const feats = (fc && fc.features) ? fc.features : [];
      for(const f of feats){
        const idFac = String(f.properties?.id_facility ?? "").toLowerCase();
        if(wantAll){
          allFeatures.push(f);
        }else{
          const ok = tokens.some(t => idFac.startsWith(t));
          if(ok) allFeatures.push(f);
        }
      }
    }

    map.getSource("routes").setData({ type:"FeatureCollection", features: allFeatures });

    const vis = allFeatures.length ? "visible" : "none";
    map.setLayoutProperty(LAYERS.routesLine, "visibility", vis);
    map.setLayoutProperty(LAYERS.routesLabels, "visibility", vis);
  }

  // Aggregate socio economic variables for a set of selected ids

  // Important: in socio_economic_variables.json, all variables are COUNTS of persons per grid cell (not proportions).
  // That means:
  // - We SUM them across selected cells
  // - Percentages are computed as (count / total_pop)

function sumSocioForIds(ids){
    let totalPop = 0;
    let matchedRows = 0;

    let women = 0;
    let men = 0;

    let u5 = 0;
    let u15 = 0;
    let age75 = 0;

    let unemployed = 0;
    let poor60 = 0;

    let incomeWeightedSum = 0;
    let incomeWeight = 0;

    for(const id of ids){
      const row = APP.data.socioById.get(String(id));
      if(!row) continue;

      const tp = getTotalPop(row);
      if(!Number.isFinite(tp)) continue;
      matchedRows += 1;
      totalPop += tp;

      const w = Number(row.dones);
      const m = Number(row.homes);
      if(Number.isFinite(w)) women += w;
      if(Number.isFinite(m)) men += m;

      const a0_4 = Number(row.de_0_a_4);
      const a5_9 = Number(row.de_5_a_9);
      const a10_14 = Number(row.de_10_a_14);

      if(Number.isFinite(a0_4)) u5 += a0_4;
      if([a0_4,a5_9,a10_14].every(Number.isFinite)) u15 += (a0_4 + a5_9 + a10_14);

      const a75_79 = Number(row.de_75_a_79);
      const a80_84 = Number(row.de_80_a_84);
      const a85_89 = Number(row.de_85_a_89);
      const a90_94 = Number(row.de_90_a_94);
      const a95_99 = Number(row.de_95_a_99);
      const a100 = Number(row.x100_o_mes);

      const parts = [a75_79,a80_84,a85_89,a90_94,a95_99,a100].filter(Number.isFinite);
      if(parts.length) age75 += parts.reduce((a,b)=>a+b,0);

      const unemp = Number(row.unemployed);
      if(Number.isFinite(unemp)) unemployed += unemp;

      const p60 = Number(row.pop_poor_under_60);
      if(Number.isFinite(p60)) poor60 += p60;

      const inc = Number(row.renda_mitjana_UC_2023);
      if(Number.isFinite(inc)){
        incomeWeightedSum += inc * tp;
        incomeWeight += tp;
      }
    }

    const income = incomeWeight > 0 ? incomeWeightedSum / incomeWeight : null;

    return { totalPop, women, men, u5, u15, age75, unemployed, poor60, income, matchedRows };
  }

  function computePopulationOver15(state){
    let popOver15 = 0;
    for(const id of state.selectedIds){
      const cat = state.timeCatById.get(String(id));
      if(!(Number.isFinite(cat) && cat >= 4)) continue;
      const row = APP.data.socioById.get(String(id));
      if(!row) continue;
      const tp = getTotalPop(row);
      if(Number.isFinite(tp)) popOver15 += tp;
    }
    return popOver15;
  }

  function computeIncomeCity(city){
    let wSum = 0;
    let w = 0;

    for(const [id, row] of APP.data.socioById.entries()){
      const idCity = APP.data.idToCity.get(String(id));
      if(idCity && String(idCity) !== String(city)) continue;

      const tp = getTotalPop(row);
      const inc = Number(row.renda_mitjana_UC_2023);
      if(!Number.isFinite(tp) || !Number.isFinite(inc)) continue;
      wSum += tp * inc;
      w += tp;
    }
    return w > 0 ? (wSum / w) : null;
  }

  // Convert aggregated values into readable English sentences in the right panel

  function renderGridResultsForPane(paneId){
    const state = paneId === "A" ? APP.stateA : APP.stateB;
    const city = state.city;

    const f1 = Number(elFilter1.value) || 0;
    const f2 = Number(elFilter2.value) || 0;

    const targetLabel = (f2 > 0) ? getFilter2Label(f2) : (f1 > 0 ? getFilter1Label(f1) : "service");

    if(f1 <= 0){
      const msg = "Pick filter level 1 to enable the choropleth, facilities, routes, and the results panel.";
      if(paneId === "A") elResultsAText.textContent = msg;
      else elResultsBText.textContent = msg;
      return;
    }

    if(state.selectedIds.size === 0){
      const msg = "Select grid cells to compute results for the selected area.";
      if(paneId === "A") elResultsAText.textContent = msg;
      else elResultsBText.textContent = msg;
      return;
    }

    const sums = sumSocioForIds(state.selectedIds);

    if((sums.matchedRows || 0) === 0){
      const msg = "No socio economic data match the selected grid ids. Check that socio_economic_variables.json uses the same id as grids.geojson.";
      if(paneId === "A") elResultsAText.textContent = msg;
      else elResultsBText.textContent = msg;
      return;
    }

    const popOver15 = computePopulationOver15(state);

    const tp = sums.totalPop || 0;

    const pctWomen = tp > 0 ? sums.women / tp : 0;
    const pctMen = tp > 0 ? sums.men / tp : 0;
    const pctU5 = tp > 0 ? sums.u5 / tp : 0;
    const pctU15 = tp > 0 ? sums.u15 / tp : 0;
    const pct75 = tp > 0 ? sums.age75 / tp : 0;
    const pctUnemp = tp > 0 ? sums.unemployed / tp : 0;
    const pctPoor60 = tp > 0 ? sums.poor60 / tp : 0;

    const incomeSelected = sums.income;
    const incomeCity = computeIncomeCity(city);

    const html = `
      <p><b>Accessibility</b><br>
      Out of <b>${fmtInt(tp)}</b> people in the selected cells, <b>${fmtInt(popOver15)}</b> are more than 15 minutes away from <b>${targetLabel}</b>.</p>

      <p><b>Population profile</b><br>
      ${fmtPct(pctMen)} men (${fmtInt(sums.men)}) and ${fmtPct(pctWomen)} women (${fmtInt(sums.women)}).<br>
      ${fmtPct(pctU5)} are children under 5 (${fmtInt(sums.u5)}).<br>
      ${fmtPct(pctU15)} are children under 15 (${fmtInt(sums.u15)}).<br>
      ${fmtPct(pct75)} are 75 years old and over (${fmtInt(sums.age75)}).</p>

      <p><b>Socio economic indicators</b><br>
      ${fmtPct(pctUnemp)} are unemployed (${fmtInt(sums.unemployed)}).<br>
      ${fmtPct(pctPoor60)} live below the poverty threshold (income under 60% of the median) (${fmtInt(sums.poor60)}).</p>

      <p><b>Income</b><br>
      For the selected area, the average income per consumption unit is <b>${incomeSelected === null ? "NA" : fmtEUR(incomeSelected)}</b>
      compared with <b>${incomeCity === null ? "NA" : fmtEUR(incomeCity)}</b> for the whole territory.</p>
    `;

    if(paneId === "A") elResultsAText.innerHTML = html;
    else elResultsBText.innerHTML = html;
  }
  // City level results without selection (general results mode)
  function sumSocioSplitByAccess(ids, timeCatById){
    const allIds = ids;

    const accessIds = [];
    const noAccessIds = [];

    for(const id of allIds){
      const cat = timeCatById.get(String(id));
      // Treat missing travel time as no access so the split always sums to the full population
      if(Number.isFinite(cat) && cat <= 3) accessIds.push(String(id));
      else noAccessIds.push(String(id));
    }

    const all = sumSocioForIds(allIds);
    const access = sumSocioForIds(accessIds);
    const noAccess = sumSocioForIds(noAccessIds);

    return { all, access, noAccess };
  }

  function pctWithin(part, total){
    if(!(Number.isFinite(part) && Number.isFinite(total) && total > 0)) return 0;
    return part / total;
  }

  function renderGeneralResultsForPane(paneId){
    const state = paneId === "A" ? APP.stateA : APP.stateB;
    const city = state.city;

    const f1 = Number(elFilter1.value) || 0;
    const f2 = Number(elFilter2.value) || 0;

    if(f1 <= 0){
      const msg = "Pick filter level 1 to enable the choropleth and the results panel.";
      if(paneId === "A") elResultsAText.textContent = msg;
      else elResultsBText.textContent = msg;
      return;
    }

    // Collect all grid ids for this city or for the selected admin cluster
    const ids = getAdminIdsForState(state);

    if(!ids || ids.length === 0){
      const msg = "No grid data is available for this city yet. Perimeters can be displayed, but city level results require grids and socio economic data.";
      if(paneId === "A") elResultsAText.textContent = msg;
      else elResultsBText.textContent = msg;
      return;
    }

    // Build time categories for the chosen filters
    const timeMap = buildTimeCatMap(city, f1, f2);

    const split = sumSocioSplitByAccess(ids, timeMap);
    const totalPop = split.all.totalPop || 0;
    const popNoAccess = split.noAccess.totalPop || 0;

    const targetLabel = (f2 > 0) ? getFilter2Label(f2) : getFilter1Label(f1);

    const areaLabel = (APP.view === "general" && state.generalRegion?.label) ? String(state.generalRegion.label) : String(city);

    const cityIncome = (split.all && split.all.income !== undefined && split.all.income !== null) ? split.all.income : computeIncomeCity(city);

    const pNoAccess = pctWithin(popNoAccess, totalPop);

    function blockStats(s){
      const tp = s.totalPop || 0;
      const menPct = pctWithin(s.men, tp);
      const womenPct = pctWithin(s.women, tp);
      const u5Pct = pctWithin(s.u5, tp);
      const u15Pct = pctWithin(s.u15, tp);
      const a75Pct = pctWithin(s.age75, tp);
      const unempPct = pctWithin(s.unemployed, tp);
      const poorPct = pctWithin(s.poor60, tp);

      const inc = s.income;

      return `
        <div><span class="k">Population</span><br>${fmtInt(tp)} people</div>

        <div><span class="k">Population profile</span><br>
          ${fmtPct(menPct)} men (${fmtInt(s.men)})<br>
          ${fmtPct(womenPct)} women (${fmtInt(s.women)})<br>
          ${fmtPct(u5Pct)} children under 5 (${fmtInt(s.u5)})<br>
          ${fmtPct(u15Pct)} children under 15 (${fmtInt(s.u15)})<br>
          ${fmtPct(a75Pct)} 75 and over (${fmtInt(s.age75)})
        </div>

        <div><span class="k">Socio economic indicators</span><br>
          ${fmtPct(unempPct)} unemployed (${fmtInt(s.unemployed)})<br>
          ${fmtPct(poorPct)} below poverty threshold (${fmtInt(s.poor60)})
        </div>

        <div><span class="k">Income</span><br>
          Average income per consumption unit: <b>${inc === null ? "NA" : fmtEUR(inc)}</b><br>
          <span style="opacity:0.75;">City reference: ${cityIncome === null ? "NA" : fmtEUR(cityIncome)}</span>
        </div>
      `;
    }

    const html = `
      <p><b>Accessibility</b><br>
      Out of <b>${fmtInt(totalPop)}</b> people in <b>${areaLabel}</b>, <b>${fmtInt(popNoAccess)}</b> are more than 15 minutes away from <b>${targetLabel}</b> (${fmtPct(pNoAccess)} of the total population).</p>

      <table class="splitTable" aria-label="Accessibility split">
        <thead>
          <tr>
            <th class="good">Access under 15 minutes</th>
            <th class="bad">More than 15 minutes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="good">${blockStats(split.access)}</td>
            <td class="bad">${blockStats(split.noAccess)}</td>
          </tr>
        </tbody>
      </table>
`;

    if(paneId === "A") elResultsAText.innerHTML = html;
    else elResultsBText.innerHTML = html;
  }

  function renderResultsForPane(paneId){
    if(APP.view === "general") return renderGeneralResultsForPane(paneId);
    return renderGridResultsForPane(paneId);
  }


  
function updateSelectionSummary(){
    const { state } = getActivePaneStateAndMap();

    if(APP.view === "general"){
      const city = state.city;
      const cityLabel = city ? (APP.data.cityLabels.get(String(city)) || String(city)) : "";
      const f1 = Number(elFilter1.value) || 0;
      const f2 = Number(elFilter2.value) || 0;

      if(!city || f1 <= 0){
        elSelCells.textContent = "0";
        elSelMeta.textContent = "Pick a city and filter level 1 to see city level results.";
        return;
      }

      const ids = getAdminIdsForState(state);
      const sums = sumSocioForIds(ids);
      const timeMap = buildTimeCatMap(city, f1, f2);

      let popNoAccess = 0;
      for(const id of ids){
        const cat = timeMap.get(String(id));
        const row = APP.data.socioById.get(String(id));
        if(!row) continue;
        const tp = getTotalPop(row);
        if(!Number.isFinite(tp)) continue;

        if(!(Number.isFinite(cat) && cat <= 3)) popNoAccess += tp;
      }

      const totalPop = sums.totalPop || 0;
      const pctNoAccess = totalPop > 0 ? (popNoAccess / totalPop) : 0;

      elSelCells.textContent = fmtInt(totalPop);
      const areaLabel = (APP.view === "general" && state.generalRegion?.label) ? state.generalRegion.label : cityLabel;
      elSelMeta.textContent = `${areaLabel} overview, ${fmtPct(pctNoAccess)} more than 15 minutes (active pane)`;
      return;
    }

    // Grid mode (interactive selection)
    const sums = sumSocioForIds(state.selectedIds);

    elSelCells.textContent = fmtInt(state.selectedIds.size);
    if(state.selectedIds.size > 0 && (sums.matchedRows || 0) === 0){
      elSelMeta.textContent = `Selected cells, NA people (no socio match, check ids)`;
    }else{
      elSelMeta.textContent = `Selected cells, ${fmtInt(sums.totalPop || 0)} people (active pane)`;
    }
  }


  // High level update for one pane
  // Called when filters, city, or selection change

  async function updateEverythingForPane(paneId){
    setGridVisibilityForPane(paneId);
    applyCityFiltersForPane(paneId);

    const f1 = Number(elFilter1.value) || 0;
    if(f1 > 0){
      applyChoroplethForPane(paneId);
    }

    updateSelectionGeometryForPane(paneId);
    await updateRoutesForPane(paneId);
    renderResultsForPane(paneId);
  }

  // High level update for both panes (compare mode)
  // Keeps the UI consistent when global filters change

  async function updateEverythingAllPanes(){
    await updateEverythingForPane("A");
    if(APP.compare) await updateEverythingForPane("B");
    updateSelectionSummary();
  }

  // One place to refresh: routes, KPIs, right panel text
  // Called after any selection change

  function updateUIAfterSelection(){
    updateSelectionSummary();

    const pane = (APP.activePane === "B" && APP.compare) ? "B" : "A";
    updateSelectionGeometryForPane(pane);

    updateRoutesForPane(pane);
    renderResultsForPane("A");
    if(APP.compare) renderResultsForPane("B");
  }

  function selectByPolygon(){
    if(!APP.selectionEnabled) return;
    const { state, map } = getActivePaneStateAndMap();
    if(!state.draw) return;

    state.draw.deleteAll();
    state.draw.changeMode("draw_polygon");

    const onCreate = (e) => {
      try{
        const poly = e.features && e.features[0];
        if(!poly) return;

        const bbox = turf.bbox(poly);
        const sw = map.project([bbox[0], bbox[1]]);
        const ne = map.project([bbox[2], bbox[3]]);

        const candidates = map.queryRenderedFeatures([ [sw.x, ne.y], [ne.x, sw.y] ], { layers: [LAYERS.gridsFill] });

        for(const f of candidates){
          const id = String(f.properties?.id ?? "");
          if(!id) continue;

          const center = turf.centroid(f);
          if(turf.booleanPointInPolygon(center, poly)){
            selectGrid(map, state, id);
          }
        }
        updateUIAfterSelection();
      }finally{
        state.draw.deleteAll();
        map.off("draw.create", onCreate);
      }
    };

    map.on("draw.create", onCreate);
  }

  // App bootstrap
  // Load datasets, build UI, create maps, add layers, bind events
