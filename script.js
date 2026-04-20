const DEFAULT_POINTS = {
  start: { name: "신사역", lat: 37.5163, lon: 127.0201 },
  end: { name: "고속터미널역", lat: 37.5049, lon: 127.0054 },
};

const map = L.map("map", {
  zoomControl: false,
  doubleClickZoom: false,
}).setView([37.595, 126.988], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

const startInput = document.getElementById("startInput");
const endInput = document.getElementById("endInput");
const swapBtn = document.getElementById("swapBtn");
const searchRouteBtn = document.getElementById("searchRouteBtn");
const routeTitle = document.getElementById("routeTitle");
const routeSummary = document.getElementById("routeSummary");
const searchResults = document.getElementById("searchResults");
const enterTagModeBtn = document.getElementById("enterTagModeBtn");
const tagInstruction = document.getElementById("tagInstruction");

const agentSheet = document.getElementById("agentSheet");
const selectedInfo = document.getElementById("selectedInfo");
const contextInput = document.getElementById("contextInput");
const voiceBtn = document.getElementById("voiceBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const analysisResult = document.getElementById("analysisResult");
const confirmYes = document.getElementById("confirmYes");
const confirmNo = document.getElementById("confirmNo");
const rerouteBox = document.getElementById("rerouteBox");
const rerouteYes = document.getElementById("rerouteYes");
const rerouteNo = document.getElementById("rerouteNo");

let startPoint = { ...DEFAULT_POINTS.start };
let endPoint = { ...DEFAULT_POINTS.end };
let routeCoords = [];
let routeLine;
let routeHitLine;
let selectedSegmentLine;
let startMarker;
let endMarker;
let selectedIndices = [];
let selectedFlags = [];
let tagMarkers = [];

const taggedSegments = [];

const flagIcon = L.divIcon({
  html: "🚩",
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 18],
});

const tagIcon = L.divIcon({
  html: '<div class="tag-marker">T</div>',
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatDuration(seconds) {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}시간 ${m}분`;
}

function toLatLng(coords) {
  return coords.map(([lon, lat]) => [lat, lon]);
}

async function geocode(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("accept-language", "ko");
  url.searchParams.set("q", query);

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error("검색 API 실패");
  return res.json();
}

function renderSearchResults(items, type) {
  searchResults.innerHTML = "";
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "search-item";
    btn.textContent = item.display_name;
    btn.type = "button";
    btn.addEventListener("click", () => {
      const point = {
        name: item.display_name.split(",")[0],
        lat: Number(item.lat),
        lon: Number(item.lon),
      };
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

  try {
    const items = await geocode(query);
    if (items.length === 0) {
      searchResults.innerHTML = '<button class="search-item" type="button">검색 결과 없음</button>';
      searchResults.hidden = false;
      return;
    }
    renderSearchResults(items, type);
  } catch (error) {
    searchResults.innerHTML = '<button class="search-item" type="button">검색 중 오류가 발생했습니다.</button>';
    searchResults.hidden = false;
  }
}

function clearFlags() {
  selectedFlags.forEach((marker) => map.removeLayer(marker));
  selectedFlags = [];
  selectedIndices = [];

  if (selectedSegmentLine) {
    map.removeLayer(selectedSegmentLine);
    selectedSegmentLine = null;
  }
}

function exitTagMode() {
  tagInstruction.hidden = true;
  clearFlags();
}

function findNearestCoordIndex(targetLatLng) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  routeCoords.forEach((coord, index) => {
    const ll = L.latLng(coord[1], coord[0]);
    const dist = ll.distanceTo(targetLatLng);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function updateSelectedSegment() {
  if (selectedIndices.length !== 2) return;

  const sorted = [...selectedIndices].sort((a, b) => a - b);
  const chunk = routeCoords.slice(sorted[0], sorted[1] + 1);
  if (chunk.length < 2) return;

  if (selectedSegmentLine) map.removeLayer(selectedSegmentLine);

  selectedSegmentLine = L.polyline(toLatLng(chunk), {
    color: "#72d8ff",
    weight: 9,
    opacity: 0.95,
    className: "selected-segment-glow",
  }).addTo(map);

  const segmentMeters = chunk.reduce((sum, cur, i) => {
    if (i === 0) return sum;
    const prev = chunk[i - 1];
    return sum + L.latLng(prev[1], prev[0]).distanceTo(L.latLng(cur[1], cur[0]));
  }, 0);

  selectedInfo.textContent = `선택 구간 길이 ${formatDistance(segmentMeters)} · 포인트 ${sorted[0]}~${sorted[1]}`;
  agentSheet.hidden = false;
}

function handleRoutePick(e) {
  if (tagInstruction.hidden) return;

  const idx = findNearestCoordIndex(e.latlng);
  selectedIndices.push(idx);

  const flag = L.marker([routeCoords[idx][1], routeCoords[idx][0]], {
    icon: flagIcon,
  }).addTo(map);
  selectedFlags.push(flag);

  if (selectedIndices.length === 2) {
    updateSelectedSegment();
  }

  if (selectedIndices.length > 2) {
    clearFlags();
    const firstIdx = findNearestCoordIndex(e.latlng);
    selectedIndices = [firstIdx];
    selectedFlags.push(
      L.marker([routeCoords[firstIdx][1], routeCoords[firstIdx][0]], {
        icon: flagIcon,
      }).addTo(map),
    );
  }
}

function applyRouteLayers(coordinates) {
  routeCoords = coordinates;

  if (routeLine) map.removeLayer(routeLine);
  if (routeHitLine) map.removeLayer(routeHitLine);

  routeLine = L.polyline(toLatLng(coordinates), {
    color: "#1de46f",
    weight: 7,
    opacity: 0.95,
  }).addTo(map);

  routeHitLine = L.polyline(toLatLng(coordinates), {
    color: "#ffffff",
    weight: 21,
    opacity: 0.01,
  }).addTo(map);
  routeHitLine.on("dblclick", () => {
    tagInstruction.hidden = false;
    selectedInfo.textContent = "경로에서 시작/끝 깃발을 선택해주세요.";
  });
  routeHitLine.on("click", handleRoutePick);

  if (startMarker) map.removeLayer(startMarker);
  if (endMarker) map.removeLayer(endMarker);

  startMarker = L.marker([startPoint.lat, startPoint.lon]).addTo(map).bindPopup("출발");
  endMarker = L.marker([endPoint.lat, endPoint.lon]).addTo(map).bindPopup("도착");

  map.fitBounds(routeLine.getBounds(), { padding: [20, 20] });
}

async function fetchRoute(options = {}) {
  routeTitle.textContent = `${startPoint.name} → ${endPoint.name}`;
  routeSummary.textContent = "경로 계산 중...";
  exitTagMode();
  agentSheet.hidden = true;
  rerouteBox.hidden = true;

  try {
    let path = `${startPoint.lon},${startPoint.lat};${endPoint.lon},${endPoint.lat}`;
    if (options.via) {
      path = `${startPoint.lon},${startPoint.lat};${options.via.lon},${options.via.lat};${endPoint.lon},${endPoint.lat}`;
    }

    const url = new URL(`https://router.project-osrm.org/route/v1/driving/${path}`);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("alternatives", "false");

    const res = await fetch(url);
    if (!res.ok) throw new Error("OSRM API 오류");

    const data = await res.json();
    if (!data.routes || data.routes.length === 0) throw new Error("경로가 없습니다.");

    const route = data.routes[0];
    applyRouteLayers(route.geometry.coordinates);

    routeSummary.textContent = `${formatDuration(route.duration)} · ${formatDistance(route.distance)} · 태그 ${taggedSegments.length}개`;
  } catch (error) {
    routeSummary.textContent = "경로 계산 실패. 다시 시도해주세요.";
  }
}

function simpleInterpretation(text) {
  const value = text.trim();
  if (!value) return "입력이 비어 있어 기본 규칙(혼잡 시 회피)으로 태깅합니다.";

  let reason = "일반";
  if (/퇴근|막히|정체/.test(value)) reason = "교통혼잡";
  if (/유료|통행료|비용/.test(value)) reason = "비용민감";
  if (/안전|야간|어두/.test(value)) reason = "안전우선";
  if (/빨리|시간|지연/.test(value)) reason = "도착시간우선";

  return `분석결과: ${reason}. 조건 발생 시 선택 구간을 회피하고 대체 경로를 우선 추천합니다.`;
}

function midpointForSelectedSegment() {
  const sorted = [...selectedIndices].sort((a, b) => a - b);
  const start = routeCoords[sorted[0]];
  const end = routeCoords[sorted[1]];
  const midLon = (start[0] + end[0]) / 2;
  const midLat = (start[1] + end[1]) / 2;

  return {
    lon: midLon + 0.01,
    lat: midLat + 0.01,
  };
}

function lockTagOnMap() {
  const sorted = [...selectedIndices].sort((a, b) => a - b);
  taggedSegments.push(sorted);

  const midIndex = Math.floor((sorted[0] + sorted[1]) / 2);
  const mid = routeCoords[midIndex];
  const marker = L.marker([mid[1], mid[0]], { icon: tagIcon }).addTo(map);
  tagMarkers.push(marker);

  routeSummary.textContent = routeSummary.textContent.replace(/태그 \d+개/, `태그 ${taggedSegments.length}개`);
}

enterTagModeBtn.addEventListener("click", () => {
  tagInstruction.hidden = false;
  selectedInfo.textContent = "경로를 터치해 2개의 깃발을 지정하세요.";
});

searchRouteBtn.addEventListener("click", () => {
  Promise.all([searchPlace("start"), searchPlace("end")]);
});

startInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchPlace("start");
});

endInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchPlace("end");
});

swapBtn.addEventListener("click", () => {
  [startPoint, endPoint] = [endPoint, startPoint];
  [startInput.value, endInput.value] = [endInput.value, startInput.value];
  fetchRoute();
});

analyzeBtn.addEventListener("click", () => {
  analysisResult.textContent = simpleInterpretation(contextInput.value);
});

confirmYes.addEventListener("click", () => {
  if (selectedIndices.length !== 2) {
    analysisResult.textContent = "먼저 경로에서 시작/끝 구간을 선택해주세요.";
    return;
  }
  lockTagOnMap();
  rerouteBox.hidden = false;
});

confirmNo.addEventListener("click", () => {
  analysisResult.textContent = "태깅을 취소했습니다.";
  rerouteBox.hidden = true;
  clearFlags();
});

rerouteYes.addEventListener("click", () => {
  if (selectedIndices.length !== 2) return;
  const via = midpointForSelectedSegment();
  fetchRoute({ via });
  rerouteBox.hidden = true;
  analysisResult.textContent = "태깅 조건 반영 경로로 재탐색했습니다.";
});

rerouteNo.addEventListener("click", () => {
  rerouteBox.hidden = true;
  analysisResult.textContent = "현재 경로를 유지합니다.";
  clearFlags();
  tagInstruction.hidden = true;
});

voiceBtn.addEventListener("click", () => {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) {
    analysisResult.textContent = "이 브라우저는 음성 입력을 지원하지 않습니다. 텍스트 입력을 사용해주세요.";
    return;
  }

  const recognition = new Speech();
  recognition.lang = "ko-KR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    contextInput.value = text;
    analysisResult.textContent = `음성 인식: ${text}`;
  };

  recognition.onerror = () => {
    analysisResult.textContent = "음성 인식 중 오류가 발생했습니다.";
  };

  recognition.start();
});

map.on("click", () => {
  if (!searchResults.hidden) searchResults.hidden = true;
});

fetchRoute();
