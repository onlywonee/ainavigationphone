const DEFAULT_POINTS = {
  start: { name: "신사역", lat: 37.5163, lon: 127.0201 },
  end: { name: "고속터미널역", lat: 37.5049, lon: 127.0054 },
};

const map = L.map("map", { zoomControl: false, doubleClickZoom: false }).setView([37.511, 127.012], 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

const startInput = document.getElementById("startInput");
const endInput = document.getElementById("endInput");
const swapBtn = document.getElementById("swapBtn");
const searchRouteBtn = document.getElementById("searchRouteBtn");
const routeSummary = document.getElementById("routeSummary");
const enterTagModeBtn = document.getElementById("enterTagModeBtn");
const searchResults = document.getElementById("searchResults");
const tagInstruction = document.getElementById("tagInstruction");

const dimLayer = document.getElementById("dimLayer");
const loadingSheet = document.getElementById("loadingSheet");
const confirmSheet = document.getElementById("confirmSheet");
const doneCard = document.getElementById("doneCard");
const summaryText = document.getElementById("summaryText");
const doneText = document.getElementById("doneText");
const analyzeBtn = document.getElementById("analyzeBtn");
const voiceBtn = document.getElementById("voiceBtn");

let startPoint = { ...DEFAULT_POINTS.start };
let endPoint = { ...DEFAULT_POINTS.end };
let routeCoords = [];
let routeLine;
let routeHitLine;
let selectedSegmentLine;
let selectedIndices = [];
let selectedFlags = [];
let aiTagMarker;

const TAG_RULE = {
  thresholdMinutes: 8,
  action: "회피",
  rerouteRoad: "성수대로",
};

const flagIcon = L.divIcon({ html: "📍", className: "", iconSize: [22, 22], iconAnchor: [11, 22] });
const tagIcon = L.divIcon({
  html: '<div class="ai-tag-callout"><span class="ai-badge">AI</span><span>8분 기준 · 회피</span></div>',
  className: "",
  iconSize: [168, 44],
  iconAnchor: [24, 24],
});

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatDuration(seconds) {
  const min = Math.round(seconds / 60);
  return `${min}분`;
}

function toLatLng(coords) {
  return coords.map(([lon, lat]) => [lat, lon]);
}

function getDestinationName() {
  const value = endPoint?.name || endInput.value || "목적지";
  return String(value).trim() || "목적지";
}

function getTagSummary() {
  return `${getDestinationName()} 갈 때 - 도착 시간 차이가 ${TAG_RULE.thresholdMinutes}분 이하면 이 구간은 피하고 ${TAG_RULE.rerouteRoad}로 우회합니다.`;
}

function clearAiTagMarker() {
  if (aiTagMarker) {
    map.removeLayer(aiTagMarker);
    aiTagMarker = null;
  }
}

async function geocode(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("accept-language", "ko");
  url.searchParams.set("q", query);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("검색 실패");
  return res.json();
}

function openPanel(type) {
  dimLayer.hidden = false;
  loadingSheet.hidden = true;
  confirmSheet.hidden = true;
  doneCard.hidden = true;
  if (type === "loading") loadingSheet.hidden = false;
  if (type === "confirm") confirmSheet.hidden = false;
  if (type === "done") doneCard.hidden = false;
}

function closePanels() {
  dimLayer.hidden = true;
  loadingSheet.hidden = true;
  confirmSheet.hidden = true;
  doneCard.hidden = true;
}

function clearFlags() {
  selectedFlags.forEach((m) => map.removeLayer(m));
  selectedFlags = [];
  selectedIndices = [];
  if (selectedSegmentLine) {
    map.removeLayer(selectedSegmentLine);
    selectedSegmentLine = null;
  }
}

function findNearestCoordIndex(target) {
  let bestIdx = 0;
  let bestDist = Infinity;
  routeCoords.forEach((coord, idx) => {
    const d = L.latLng(coord[1], coord[0]).distanceTo(target);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

function showSelectedSegment() {
  const sorted = [...selectedIndices].sort((a, b) => a - b);
  const chunk = routeCoords.slice(sorted[0], sorted[1] + 1);
  if (chunk.length < 2) return;

  if (selectedSegmentLine) map.removeLayer(selectedSegmentLine);
  selectedSegmentLine = L.polyline(toLatLng(chunk), {
    color: "#ff4fb8",
    weight: 8,
    opacity: 0.95,
    className: "selected-segment-glow",
  }).addTo(map);

  const sentence = getTagSummary();
  summaryText.textContent = sentence;
  doneText.textContent = sentence;

  openPanel("loading");
  setTimeout(() => {
    if (!loadingSheet.hidden) openPanel("confirm");
  }, 1300);
}

function handleRoutePick(e) {
  if (tagInstruction.hidden) return;

  const idx = findNearestCoordIndex(e.latlng);
  selectedIndices.push(idx);
  const marker = L.marker([routeCoords[idx][1], routeCoords[idx][0]], { icon: flagIcon }).addTo(map);
  selectedFlags.push(marker);

  if (selectedIndices.length === 2) showSelectedSegment();
  if (selectedIndices.length > 2) {
    clearFlags();
    selectedIndices.push(idx);
    selectedFlags.push(L.marker([routeCoords[idx][1], routeCoords[idx][0]], { icon: flagIcon }).addTo(map));
  }
}

function applyRouteLayers(coordinates) {
  routeCoords = coordinates;
  if (routeLine) map.removeLayer(routeLine);
  if (routeHitLine) map.removeLayer(routeHitLine);

  routeLine = L.polyline(toLatLng(coordinates), { color: "#1de46f", weight: 7, opacity: 0.95 }).addTo(map);
  routeHitLine = L.polyline(toLatLng(coordinates), { color: "#fff", weight: 21, opacity: 0.01 }).addTo(map);

  routeHitLine.on("dblclick", () => {
    tagInstruction.hidden = false;
    clearFlags();
    closePanels();
  });
  routeHitLine.on("click", handleRoutePick);

  map.fitBounds(routeLine.getBounds(), { padding: [20, 140] });
}

async function fetchRoute() {
  closePanels();
  clearFlags();
  clearAiTagMarker();
  tagInstruction.hidden = true;

  try {
    const path = `${startPoint.lon},${startPoint.lat};${endPoint.lon},${endPoint.lat}`;
    const url = new URL(`https://router.project-osrm.org/route/v1/driving/${path}`);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    const res = await fetch(url);
    const data = await res.json();
    const route = data.routes[0];
    applyRouteLayers(route.geometry.coordinates);
    routeSummary.textContent = `${formatDuration(route.duration)} · ${formatDistance(route.distance)} · 통행료 없음`;
  } catch {
    routeSummary.textContent = "경로 계산 실패";
  }
}

function renderSearchResults(items, type) {
  searchResults.innerHTML = "";
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "search-item";
    btn.textContent = item.display_name;
    btn.addEventListener("click", () => {
      const point = { name: item.display_name.split(",")[0], lat: Number(item.lat), lon: Number(item.lon) };
      if (type === "start") {
        startPoint = point;
        startInput.value = point.name;
      } else {
        endPoint = point;
        endInput.value = point.name;
      }
      searchResults.hidden = true;
      fetchRoute();
    });
    searchResults.appendChild(btn);
  });
  searchResults.hidden = items.length === 0;
}

async function searchPlace(type) {
  const query = type === "start" ? startInput.value.trim() : endInput.value.trim();
  if (!query) return;
  const items = await geocode(query);
  renderSearchResults(items, type);
}

analyzeBtn.addEventListener("click", () => {
  if (!selectedSegmentLine) return;
  const midIndex = Math.floor((selectedIndices[0] + selectedIndices[1]) / 2);
  const mid = routeCoords[midIndex];
  clearAiTagMarker();
  aiTagMarker = L.marker([mid[1], mid[0]], { icon: tagIcon }).addTo(map);
  openPanel("done");
  tagInstruction.hidden = true;
});

voiceBtn.addEventListener("click", () => {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) {
    openPanel("confirm");
    return;
  }

  const rec = new Speech();
  rec.lang = "ko-KR";
  rec.onresult = (e) => {
    const t = e.results[0][0].transcript;
    summaryText.textContent = `${getDestinationName()} 갈 때 - "${t}" 조건이면 이 구간은 피하고 우회합니다.`;
    doneText.textContent = summaryText.textContent;
    openPanel("confirm");
  };
  rec.onerror = () => openPanel("confirm");
  rec.start();
});

enterTagModeBtn.addEventListener("click", () => {
  tagInstruction.hidden = false;
  clearFlags();
  closePanels();
});

swapBtn.addEventListener("click", () => {
  [startPoint, endPoint] = [endPoint, startPoint];
  [startInput.value, endInput.value] = [endInput.value, startInput.value];
  fetchRoute();
});

searchRouteBtn.addEventListener("click", () => Promise.all([searchPlace("start"), searchPlace("end")]));
startInput.addEventListener("keydown", (e) => e.key === "Enter" && searchPlace("start"));
endInput.addEventListener("keydown", (e) => e.key === "Enter" && searchPlace("end"));
dimLayer.addEventListener("click", closePanels);
map.on("click", () => {
  if (!searchResults.hidden) searchResults.hidden = true;
});

fetchRoute();
