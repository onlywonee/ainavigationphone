const DEFAULT_POINTS = {
  start: { name: "신사역", lat: 37.5163, lon: 127.0201 },
  end: { name: "고속터미널역", lat: 37.5049, lon: 127.0054 },
};

const map = L.map("map", { zoomControl: false, doubleClickZoom: false }).setView([37.5108, 127.013], 14);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

const startInput = document.getElementById("startInput");
const endInput = document.getElementById("endInput");
const swapBtn = document.getElementById("swapBtn");
const searchRouteBtn = document.getElementById("searchRouteBtn");
const searchResults = document.getElementById("searchResults");

const enterTagModeBtn = document.getElementById("enterTagModeBtn");
const tagHint = document.getElementById("tagHint");
const loadingSheet = document.getElementById("loadingSheet");
const proposalSheet = document.getElementById("proposalSheet");
const completeToast = document.getElementById("completeToast");
const showProposalBtn = document.getElementById("showProposalBtn");
const confirmTagBtn = document.getElementById("confirmTagBtn");
const proposalText = document.getElementById("proposalText");
const completeText = document.getElementById("completeText");

const primaryTime = document.getElementById("primaryTime");
const primaryMeta = document.getElementById("primaryMeta");
const altTime = document.getElementById("altTime");
const altMeta = document.getElementById("altMeta");
const etaChip = document.getElementById("etaChip");

let startPoint = { ...DEFAULT_POINTS.start };
let endPoint = { ...DEFAULT_POINTS.end };
let routeCoords = [];
let routeLine;
let routeHitLine;
let selectedSegmentLine;
let selectedIndices = [];
let selectedFlags = [];
let startMarker;
let endMarker;

const flagIcon = L.divIcon({ html: "📍", className: "", iconSize: [20, 20], iconAnchor: [10, 16] });
const tagIcon = L.divIcon({ html: '<div class="tag-marker"></div>', className: "", iconSize: [16, 16], iconAnchor: [8, 8] });

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatDuration(seconds) {
  const min = Math.round(seconds / 60);
  return `${min}분`;
}

async function geocode(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("accept-language", "ko");
  url.searchParams.set("q", query);
  const res = await fetch(url);
  if (!res.ok) throw new Error("검색 실패");
  return res.json();
}

function hideFlowPanels() {
  loadingSheet.hidden = true;
  proposalSheet.hidden = true;
  completeToast.hidden = true;
}

function renderSearchResults(items, type) {
  searchResults.innerHTML = "";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-item";
    button.textContent = item.display_name;
    button.addEventListener("click", () => {
      const picked = { name: item.display_name.split(",")[0], lat: Number(item.lat), lon: Number(item.lon) };
      if (type === "start") {
        startPoint = picked;
        startInput.value = picked.name;
      } else {
        endPoint = picked;
        endInput.value = picked.name;
      }
      searchResults.hidden = true;
      fetchRoute();
    });
    searchResults.appendChild(button);
  });
  searchResults.hidden = items.length === 0;
}

async function searchPlace(type) {
  const text = (type === "start" ? startInput.value : endInput.value).trim();
  if (!text) return;
  try {
    const list = await geocode(text);
    renderSearchResults(list, type);
  } catch {
    searchResults.innerHTML = '<button class="search-item" type="button">검색 오류</button>';
    searchResults.hidden = false;
  }
}

function toLatLng(coords) {
  return coords.map(([lon, lat]) => [lat, lon]);
}

function clearSelection() {
  selectedFlags.forEach((m) => map.removeLayer(m));
  selectedFlags = [];
  selectedIndices = [];
  if (selectedSegmentLine) {
    map.removeLayer(selectedSegmentLine);
    selectedSegmentLine = null;
  }
}

function distanceForChunk(chunk) {
  return chunk.reduce((sum, point, i) => {
    if (!i) return sum;
    const prev = chunk[i - 1];
    return sum + L.latLng(prev[1], prev[0]).distanceTo(L.latLng(point[1], point[0]));
  }, 0);
}

function nearestIndex(target) {
  let best = 0;
  let dist = Infinity;
  routeCoords.forEach((coord, idx) => {
    const d = L.latLng(coord[1], coord[0]).distanceTo(target);
    if (d < dist) {
      dist = d;
      best = idx;
    }
  });
  return best;
}

function enterAiFlow() {
  hideFlowPanels();
  loadingSheet.hidden = false;
}

function updateSelectedSegment() {
  const sorted = [...selectedIndices].sort((a, b) => a - b);
  const segment = routeCoords.slice(sorted[0], sorted[1] + 1);
  if (segment.length < 2) return;

  if (selectedSegmentLine) map.removeLayer(selectedSegmentLine);
  selectedSegmentLine = L.polyline(toLatLng(segment), {
    color: "#ff5eb7",
    weight: 8,
    opacity: 0.95,
    className: "selected-segment-glow",
  }).addTo(map);

  const meters = Math.round(distanceForChunk(segment));
  const sentence = `${endPoint.name} 갈 때 도착 시간 차이가 8분 이하면, 선택한 ${formatDistance(meters)} 구간은 피하고 우회합니다.`;
  proposalText.textContent = sentence;
  completeText.textContent = sentence;

  enterAiFlow();
}

function onRoutePick(e) {
  if (tagHint.hidden) return;
  const idx = nearestIndex(e.latlng);
  const marker = L.marker([routeCoords[idx][1], routeCoords[idx][0]], { icon: flagIcon }).addTo(map);
  selectedFlags.push(marker);
  selectedIndices.push(idx);

  if (selectedIndices.length === 2) updateSelectedSegment();
  if (selectedIndices.length > 2) {
    clearSelection();
    selectedIndices = [idx];
    selectedFlags = [marker];
  }
}

function applyRoute(coords) {
  routeCoords = coords;
  clearSelection();
  hideFlowPanels();
  tagHint.hidden = true;

  if (routeLine) map.removeLayer(routeLine);
  if (routeHitLine) map.removeLayer(routeHitLine);

  routeLine = L.polyline(toLatLng(coords), { color: "#17c96d", weight: 7, opacity: 0.95 }).addTo(map);
  routeHitLine = L.polyline(toLatLng(coords), { color: "#fff", weight: 21, opacity: 0.01 }).addTo(map);
  routeHitLine.on("dblclick", () => { tagHint.hidden = false; });
  routeHitLine.on("click", onRoutePick);

  if (startMarker) map.removeLayer(startMarker);
  if (endMarker) map.removeLayer(endMarker);
  startMarker = L.marker([startPoint.lat, startPoint.lon]).addTo(map);
  endMarker = L.marker([endPoint.lat, endPoint.lon]).addTo(map);

  map.fitBounds(routeLine.getBounds(), { padding: [36, 36] });
}

async function fetchRoute() {
  hideFlowPanels();
  tagHint.hidden = true;
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${startPoint.lon},${startPoint.lat};${endPoint.lon},${endPoint.lat}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes?.length) throw new Error();
    const route = data.routes[0];
    applyRoute(route.geometry.coordinates);

    const eta = formatDuration(route.duration);
    const dist = formatDistance(route.distance);
    primaryTime.textContent = eta;
    etaChip.textContent = eta;
    primaryMeta.textContent = `${dist} · 통행료 없음`;
    altTime.textContent = `${Math.max(1, Math.round(route.duration / 60) + 1)}분`;
    altMeta.textContent = `${dist} · 통행료 없음`;
  } catch {
    primaryMeta.textContent = "경로 계산 실패";
  }
}

enterTagModeBtn.addEventListener("click", () => {
  tagHint.hidden = false;
  hideFlowPanels();
});

showProposalBtn.addEventListener("click", () => {
  loadingSheet.hidden = true;
  proposalSheet.hidden = false;
});

document.getElementById("voiceBtn").addEventListener("click", () => {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) {
    loadingSheet.hidden = true;
    proposalSheet.hidden = false;
    return;
  }

  const rec = new Speech();
  rec.lang = "ko-KR";
  rec.maxAlternatives = 1;
  rec.onresult = () => {
    loadingSheet.hidden = true;
    proposalSheet.hidden = false;
  };
  rec.onerror = () => {
    loadingSheet.hidden = true;
    proposalSheet.hidden = false;
  };
  rec.start();
});

confirmTagBtn.addEventListener("click", () => {
  if (selectedIndices.length !== 2) return;
  const sorted = [...selectedIndices].sort((a, b) => a - b);
  const mid = routeCoords[Math.floor((sorted[0] + sorted[1]) / 2)];
  L.marker([mid[1], mid[0]], { icon: tagIcon }).addTo(map);
  proposalSheet.hidden = true;
  completeToast.hidden = false;
  setTimeout(() => {
    completeToast.hidden = true;
    tagHint.hidden = true;
  }, 2200);
});

searchRouteBtn.addEventListener("click", () => Promise.all([searchPlace("start"), searchPlace("end")]));
startInput.addEventListener("keydown", (e) => { if (e.key === "Enter") searchPlace("start"); });
endInput.addEventListener("keydown", (e) => { if (e.key === "Enter") searchPlace("end"); });

swapBtn.addEventListener("click", () => {
  [startPoint, endPoint] = [endPoint, startPoint];
  [startInput.value, endInput.value] = [endInput.value, startInput.value];
  fetchRoute();
});

map.on("click", () => { if (!searchResults.hidden) searchResults.hidden = true; });
fetchRoute();
