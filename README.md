# 구간 태깅 내비게이션 프로토타입

OpenStreetMap + OSRM 기반으로 동작하는 정적 프로토타입입니다.

## 실행

```bash
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173` 접속.

## 프로토타입 플로우

1. 기본 경로 표시: **신사역 → 고속터미널역**
2. 경로를 더블클릭하면 구간 개인화(태깅) 모드 진입
3. 시각적 루트보다 넓은 클릭 영역(약 3배)에서 2개 깃발로 구간 선택
4. AI 에이전트 시트에서 음성/텍스트 맥락 입력
5. 규칙 기반 해석 결과 확인 후 태깅 Y/N
6. 태깅 완료 시 지도에 태그 아이콘 고정 (누적)
7. 태깅 반영 경로 재설정 Y/N

## 사용 API

- 지도 타일: OpenStreetMap
- 경로 API: OSRM demo (`https://router.project-osrm.org/route/v1/driving/...`)
- 장소 검색: Nominatim (`https://nominatim.openstreetmap.org/search`)
