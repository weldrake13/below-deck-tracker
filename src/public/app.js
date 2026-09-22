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

  const map = L.map("map", { worldCopyJump: true }).setView([25, -40], 3);
  // Default is bottom-right, which on mobile collides with the floating
  // "show list" button that overlays the bottom of the full-screen map.
  map.attributionControl.setPosition("bottomleft");

  // Esri's free Ocean basemap gives an actual nautical-chart look (bathymetry,
  // depth soundings) with no API key. If it's ever unreachable, OpenStreetMap
  // is one click away as a plain fallback.
  const oceanLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Esri, GEBCO, NOAA, National Geographic, Garmin, HERE",
      maxZoom: 13,
    },
  );
  const streetLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  });
  oceanLayer.addTo(map);
  L.control.layers({ "Nautical chart": oceanLayer, "Street map": streetLayer }).addTo(map);

  const markersByMmsi = new Map();

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

  function renderMarkers(visible) {
    const visibleMmsis = new Set();
    const entriesByMmsi = new Map();
    for (const yacht of visible) {
      if (yacht.mmsi === null) continue;
      if (!positionsByMmsi.has(yacht.mmsi)) continue;
      visibleMmsis.add(yacht.mmsi);
      if (!entriesByMmsi.has(yacht.mmsi)) entriesByMmsi.set(yacht.mmsi, []);
      entriesByMmsi.get(yacht.mmsi).push(yacht);
    }

    // Remove markers that are no longer visible.
    for (const [mmsi, marker] of markersByMmsi) {
      if (!visibleMmsis.has(mmsi)) {
        map.removeLayer(marker);
        markersByMmsi.delete(mmsi);
      }
    }

    for (const mmsi of visibleMmsis) {
      const position = positionsByMmsi.get(mmsi);
      const entries = entriesByMmsi.get(mmsi);
      let marker = markersByMmsi.get(mmsi);
      if (!marker) {
        marker = L.circleMarker([position.latitude, position.longitude], {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#1fa3ad",
          fillOpacity: 0.95,
        }).addTo(map);
        markersByMmsi.set(mmsi, marker);
      } else {
        marker.setLatLng([position.latitude, position.longitude]);
      }
      marker.bindPopup(popupHtml(entries));
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
          map.setView([position.latitude, position.longitude], 8);
          markersByMmsi.get(yacht.mmsi)?.openPopup();
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
