const destinations = [
  { name: "국민대학교", eta: "16분", distance: "17km", toll: "통행료 없음" },
  { name: "청덕초등학교", eta: "22분", distance: "21km", toll: "통행료 1,200원" },
  { name: "서울숲", eta: "13분", distance: "11km", toll: "통행료 없음" },
  { name: "코엑스", eta: "18분", distance: "14km", toll: "통행료 없음" },
  { name: "성수역", eta: "15분", distance: "12km", toll: "통행료 없음" },
];

const input = document.getElementById("destinationInput");
const searchButton = document.getElementById("searchButton");
const suggestionList = document.getElementById("suggestionList");
const routeTo = document.getElementById("routeTo");
const routeSummary = document.getElementById("routeSummary");
const completionText = document.getElementById("completionText");

function renderSuggestions(keyword = "") {
  const value = keyword.trim().toLowerCase();
  const filtered = destinations.filter(({ name }) => name.toLowerCase().includes(value));

  suggestionList.innerHTML = "";

  filtered.forEach((item) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${item.name} · ${item.eta}`;
    btn.addEventListener("click", () => selectDestination(item));
    li.appendChild(btn);
    suggestionList.appendChild(li);
  });

  if (filtered.length === 0) {
    const li = document.createElement("li");
    li.textContent = "검색 결과가 없어요.";
    suggestionList.appendChild(li);
  }
}

function selectDestination(item) {
  routeTo.textContent = item.name;
  routeSummary.textContent = `예상 ${item.eta} · ${item.distance} · ${item.toll}`;
  completionText.textContent = `${item.name} 갈 때 - 도착 시간 차이가 8분 이하면 이 구간은 피하고 성수대로로 우회합니다.`;
  input.value = item.name;
}

function runSearch() {
  const keyword = input.value.trim();
  renderSuggestions(keyword);

  const exact = destinations.find(({ name }) => name === keyword);
  if (exact) {
    selectDestination(exact);
    return;
  }

  const partial = destinations.find(({ name }) => name.includes(keyword));
  if (partial) {
    selectDestination(partial);
  }
}

input.addEventListener("input", (e) => renderSuggestions(e.target.value));
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});
searchButton.addEventListener("click", runSearch);

renderSuggestions();
