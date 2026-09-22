(function () {
  "use strict";

  /** @type {{shows: any[], yachts: any[], positions: any[], aisConfigured: boolean}} */
  let data = { shows: [], yachts: [], positions: [], aisConfigured: false };

  /** mmsi (number) -> position */
  let positionsByMmsi = new Map();

  /** show slug -> Show */
  let showsBySlug = new Map();

  const selectedShows = new Set();
  const selectedYachtIds = new Set();

  // The default attribution control renders as a light, nearly full-width bar
  // (the required Esri/OSM credit text is long) which, once the map went
  // full-bleed on mobile, read as a permanent strip across the bottom and
  // could even sit under the floating "show list" pill. It's replaced below
  // with a small "ⓘ" toggle that reveals the same required text on tap —
  // still there, just not permanently on screen.
  const map = L.map("map", { worldCopyJump: true, attributionControl: false }).setView([25, -40], 3);

  // Esri's free Ocean basemap gives an actual nautical-chart look (bathymetry,
  // depth soundings) with no API key. If it's ever unreachable, OpenStreetMap
  // is one click away as a plain fallback.
  const oceanLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 13 },
  );
  const streetLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  });
  oceanLayer.addTo(map);
  L.control.layers({ "Nautical chart": oceanLayer, "Street map": streetLayer }).addTo(map);

  const AttributionToggle = L.Control.extend({
    options: { position: "bottomleft" },
    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-control attribution-toggle");
      const button = L.DomUtil.create("button", "attribution-toggle__button", container);
      button.type = "button";
      button.textContent = "ⓘ";
      button.setAttribute("aria-label", "Map data attribution");
      button.setAttribute("aria-expanded", "false");
      const panel = L.DomUtil.create("div", "attribution-toggle__panel", container);
      panel.innerHTML =
        "Esri, GEBCO, NOAA, National Geographic, Garmin, HERE &middot; " +
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
      L.DomEvent.disableClickPropagation(container);
      button.addEventListener("click", () => {
        const isOpen = container.classList.toggle("is-open");
        button.setAttribute("aria-expanded", String(isOpen));
      });
      return container;
    },
  });
  new AttributionToggle().addTo(map);

  // Leaflet caches the container size at init; on a flex layout the map's
  // real size can still be settling then (and changes again whenever the
  // filters drawer opens/closes), which otherwise leaves a blank strip where
  // Leaflet thinks the map ends but the div doesn't.
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => map.invalidateSize()).observe(document.getElementById("map"));
  } else {
    window.addEventListener("resize", () => map.invalidateSize());
  }

  const markersByMmsi = new Map();
  const markersLayer = L.layerGroup().addTo(map);
  let currentVisibleYachts = [];

  // Below this many screen pixels apart, yachts are shown as one grouped
  // bubble rather than overlapping dots — otherwise a marina full of yachts
  // just looks like a single blob at low zoom. Purely a screen-distance
  // threshold, so it naturally re-splits as the map zooms in.
  const CLUSTER_PIXEL_RADIUS = 45;

  const showFiltersEl = document.getElementById("show-filters");
  const yachtFiltersEl = document.getElementById("yacht-filters");
  const yachtSearchEl = document.getElementById("yacht-search");
  const yachtListEl = document.getElementById("yacht-list");
  const resultsCountEl = document.getElementById("results-count");
  const aisStatusEl = document.getElementById("ais-status");
  const filtersToggleEl = document.getElementById("filters-toggle");
  const filtersEl = document.getElementById("filters");
  const resultsEl = document.getElementById("results");
  const resultsToggleEl = document.getElementById("results-toggle");
  const liveCountEl = document.getElementById("live-count");
  const untrackedCountEl = document.getElementById("untracked-count");

  let lastVisibleCount = 0;

  filtersToggleEl.addEventListener("click", () => {
    const isOpen = filtersEl.classList.toggle("is-open");
    filtersToggleEl.setAttribute("aria-expanded", String(isOpen));
  });

  function updateResultsToggleLabel() {
    const isOpen = !resultsEl.classList.contains("is-collapsed");
    resultsToggleEl.setAttribute("aria-expanded", String(isOpen));
    resultsToggleEl.textContent = isOpen
      ? "✕ Hide list"
      : `☰ ${lastVisibleCount} yacht${lastVisibleCount === 1 ? "" : "s"}`;
  }

  resultsToggleEl.addEventListener("click", () => {
    resultsEl.classList.toggle("is-collapsed");
    updateResultsToggleLabel();
  });

  document.querySelectorAll("[data-clear]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.getAttribute("data-clear");
      if (kind === "shows") selectedShows.clear();
      if (kind === "yachts") selectedYachtIds.clear();
      renderFilterControls();
      renderResults();
    });
  });

  yachtSearchEl.addEventListener("input", () => {
    filterYachtChecklistVisibility(yachtSearchEl.value.trim().toLowerCase());
  });

  function timeAgo(isoString) {
    const seconds = Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  function badgeHtml(show) {
    if (!show) return "";
    return `<span class="badge" style="background:${show.colour}">${show.shortName}</span>`;
  }

  function buildShowFilterChips() {
    showFiltersEl.innerHTML = "";
    for (const show of data.shows) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = show.shortName;
      chip.title = show.name;
      chip.setAttribute("aria-pressed", String(selectedShows.has(show.slug)));
      chip.addEventListener("click", () => {
        if (selectedShows.has(show.slug)) selectedShows.delete(show.slug);
        else selectedShows.add(show.slug);
        chip.setAttribute("aria-pressed", String(selectedShows.has(show.slug)));
        renderResults();
      });
      showFiltersEl.appendChild(chip);
    }
  }

  function buildYachtChecklist() {
    yachtFiltersEl.innerHTML = "";
    const sorted = [...data.yachts].sort((a, b) => a.showName.localeCompare(b.showName));
    for (const yacht of sorted) {
      const label = document.createElement("label");
      label.dataset.searchText = `${yacht.showName} ${yacht.realName}`.toLowerCase();

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedYachtIds.has(yacht.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedYachtIds.add(yacht.id);
        else selectedYachtIds.delete(yacht.id);
        renderResults();
      });

      const text = document.createElement("span");
      const realBit =
        yacht.realName && yacht.realName !== yacht.showName
          ? ` <span class="yacht-real">(${yacht.realName})</span>`
          : "";
      text.innerHTML = `${yacht.showName}${realBit}`;

      label.appendChild(checkbox);
      label.appendChild(text);
      yachtFiltersEl.appendChild(label);
    }
  }

  function filterYachtChecklistVisibility(query) {
    yachtFiltersEl.querySelectorAll("label").forEach((label) => {
      const matches = !query || label.dataset.searchText.includes(query);
      label.style.display = matches ? "" : "none";
    });
  }

  function renderFilterControls() {
    showFiltersEl.querySelectorAll(".chip").forEach((chip, index) => {
      chip.setAttribute("aria-pressed", String(selectedShows.has(data.shows[index].slug)));
    });
    yachtFiltersEl.querySelectorAll("input[type=checkbox]").forEach((checkbox, index) => {
      const sorted = [...data.yachts].sort((a, b) => a.showName.localeCompare(b.showName));
      checkbox.checked = selectedYachtIds.has(sorted[index].id);
    });
  }

  function visibleYachts() {
    return data.yachts.filter(
      (yacht) => selectedShows.has(yacht.show) && selectedYachtIds.has(yacht.id),
    );
  }

  function popupHtml(entries) {
    const rows = entries
      .map(
        (yacht) => `
          <p>${badgeHtml(showsBySlug.get(yacht.show))} Season ${yacht.seasons.join(", ")}</p>
        `,
      )
      .join("");
    const first = entries[0];
    const realBit =
      first.realName && first.realName !== first.showName ? `<p>Real name: <strong>${first.realName}</strong></p>` : "";
    const position = positionsByMmsi.get(first.mmsi);
    const posBit = position
      ? `<p>${position.speedKnots != null ? position.speedKnots.toFixed(1) + " kn" : "speed unknown"} · updated ${timeAgo(position.receivedAt)}</p>`
      : "";
    return `<div class="popup"><h3>${first.showName}</h3>${realBit}${rows}${posBit}</div>`;
  }

  // Greedily groups tracked yachts whose on-screen positions (at the map's
  // current zoom) fall within CLUSTER_PIXEL_RADIUS of an existing group's
  // anchor point. Screen distance, not geographic distance, is what makes
  // this re-group/un-group correctly as the user zooms.
  function clusterByScreenDistance(boats) {
    const clusters = [];
    for (const boat of boats) {
      const point = map.latLngToContainerPoint([boat.position.latitude, boat.position.longitude]);
      const cluster = clusters.find((c) => point.distanceTo(c.point) < CLUSTER_PIXEL_RADIUS);
      if (cluster) cluster.boats.push(boat);
      else clusters.push({ point, boats: [boat] });
    }
    return clusters;
  }

  function clusterIcon(count) {
    return L.divIcon({
      className: "cluster-icon",
      html: `<div class="cluster-bubble">${count}</div>`,
      iconSize: [34, 34],
    });
  }

  function renderMarkers(visible) {
    currentVisibleYachts = visible;
    markersLayer.clearLayers();
    markersByMmsi.clear();

    /** @type {{mmsi: number, position: any, yachts: any[]}[]} */
    const boats = [];
    const boatByMmsi = new Map();
    for (const yacht of visible) {
      if (yacht.mmsi === null) continue;
      const position = positionsByMmsi.get(yacht.mmsi);
      if (!position) continue;
      let boat = boatByMmsi.get(yacht.mmsi);
      if (!boat) {
        boat = { mmsi: yacht.mmsi, position, yachts: [] };
        boatByMmsi.set(yacht.mmsi, boat);
        boats.push(boat);
      }
      boat.yachts.push(yacht);
    }

    for (const cluster of clusterByScreenDistance(boats)) {
      if (cluster.boats.length === 1) {
        const boat = cluster.boats[0];
        const marker = L.circleMarker([boat.position.latitude, boat.position.longitude], {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#1fa3ad",
          fillOpacity: 0.95,
        }).addTo(markersLayer);
        marker.bindPopup(popupHtml(boat.yachts));
        markersByMmsi.set(boat.mmsi, marker);
        continue;
      }

      const lats = cluster.boats.map((b) => b.position.latitude);
      const lngs = cluster.boats.map((b) => b.position.longitude);
      const center = [
        lats.reduce((a, b) => a + b, 0) / lats.length,
        lngs.reduce((a, b) => a + b, 0) / lngs.length,
      ];
      const marker = L.marker(center, { icon: clusterIcon(cluster.boats.length) }).addTo(markersLayer);
      marker.on("click", () => {
        const bounds = L.latLngBounds(
          cluster.boats.map((b) => [b.position.latitude, b.position.longitude]),
        );
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
      });
    }
  }

  function renderList(visible) {
    yachtListEl.innerHTML = "";
    resultsCountEl.textContent = `Yachts (${visible.length})`;

    const liveCount = visible.filter((y) => y.mmsi !== null && positionsByMmsi.has(y.mmsi)).length;
    liveCountEl.textContent = `${liveCount} live`;
    untrackedCountEl.textContent = `${visible.length - liveCount} not tracked`;

    lastVisibleCount = visible.length;
    updateResultsToggleLabel();

    if (visible.length === 0) {
      yachtListEl.innerHTML = '<li class="empty-state">No yachts match the current filters.</li>';
      return;
    }

    const sorted = [...visible].sort(
      (a, b) => a.show.localeCompare(b.show) || a.seasons[0] - b.seasons[0] || a.showName.localeCompare(b.showName),
    );

    for (const yacht of sorted) {
      const li = document.createElement("li");
      li.className = "yacht-card";
      const tracked = yacht.mmsi !== null && positionsByMmsi.has(yacht.mmsi);
      const show = showsBySlug.get(yacht.show);
      const realBit =
        yacht.realName && yacht.realName !== yacht.showName
          ? `<p class="yacht-card__real">Real name: ${yacht.realName}</p>`
          : "";
      const position = tracked ? positionsByMmsi.get(yacht.mmsi) : null;
      const metaBits = [];
      if (yacht.vesselType) metaBits.push(yacht.vesselType);
      if (yacht.homeWaters) metaBits.push(yacht.homeWaters);
      if (position) {
        metaBits.push(
          position.speedKnots != null ? `${position.speedKnots.toFixed(1)} kn` : "speed unknown",
        );
        metaBits.push(`updated ${timeAgo(position.receivedAt)}`);
      } else {
        metaBits.push(data.aisConfigured ? "not currently tracked" : "live tracking not configured");
      }

      li.innerHTML = `
        <div class="yacht-card__top">
          <span class="dot ${tracked ? "dot--live" : "dot--unknown"}"></span>
          <span class="yacht-card__name">${yacht.showName}</span>
          ${badgeHtml(show)}
          <span class="badge" style="background:#63727d">S${yacht.seasons.join(", ")}</span>
        </div>
        ${realBit}
        <div class="yacht-card__meta">${metaBits.map((m) => `<span>${m}</span>`).join("")}</div>
      `;

      if (tracked) {
        li.style.cursor = "pointer";
        li.addEventListener("click", () => {
          const position = positionsByMmsi.get(yacht.mmsi);
          map.setView([position.latitude, position.longitude], Math.max(map.getZoom(), 8));
          // Open a standalone popup rather than relying on the marker for
          // this mmsi: the yacht may still be inside a cluster bubble at
          // this zoom (yachts sharing a marina can sit closer together than
          // the cluster radius resolves even at max zoom), so there may be
          // no individual marker to open a popup on.
          L.popup()
            .setLatLng([position.latitude, position.longitude])
            .setContent(popupHtml(data.yachts.filter((y) => y.mmsi === yacht.mmsi)))
            .openOn(map);
        });
      }

      yachtListEl.appendChild(li);
    }
  }

  function renderResults() {
    const visible = visibleYachts();
    renderMarkers(visible);
    renderList(visible);
  }

  // Clustering is based on screen-pixel distance, which only changes with
  // zoom (panning shifts every marker by the same offset, so their relative
  // distances — and thus the clusters — don't change). Re-run it whenever
  // the zoom settles so clusters split apart as the user zooms in.
  map.on("zoomend", () => renderMarkers(currentVisibleYachts));

  function updateAisStatus() {
    if (!data.aisConfigured) {
      aisStatusEl.textContent =
        "Live tracking isn't configured on this server — showing yacht info only. See .env.example (AISSTREAM_API_KEY).";
    } else if (positionsByMmsi.size === 0) {
      aisStatusEl.textContent = "Connected to the AIS feed — waiting for the tracked yachts to report in.";
    } else {
      aisStatusEl.textContent = `Live: ${positionsByMmsi.size} yacht(s) currently reporting a position.`;
    }
  }

  function applyPositions(positions) {
    positionsByMmsi = new Map(positions.map((p) => [p.mmsi, p]));
  }

  async function loadState() {
    const response = await fetch("/api/state");
    data = await response.json();
    showsBySlug = new Map(data.shows.map((s) => [s.slug, s]));
    applyPositions(data.positions);

    for (const show of data.shows) selectedShows.add(show.slug);
    for (const yacht of data.yachts) selectedYachtIds.add(yacht.id);

    buildShowFilterChips();
    buildYachtChecklist();
    renderResults();
    updateAisStatus();
  }

  async function pollPositions() {
    try {
      const response = await fetch("/api/positions");
      const body = await response.json();
      data.aisConfigured = body.aisConfigured;
      applyPositions(body.positions);
      renderResults();
      updateAisStatus();
    } catch (error) {
      console.error("[positions] poll failed", error);
    }
  }

  loadState().then(() => {
    setInterval(pollPositions, 30_000);
  });
})();
