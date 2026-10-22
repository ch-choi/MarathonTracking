# Marathon Tracking

여러 마라톤 참가자의 기록을 한 화면에서 조회하고, 배번별 이름을 수정해 관리하는 정적 웹 앱입니다.

## 주요 기능

- MyResult 대회 검색 및 배번별 기록 조회
- 배번별 이름 수정 및 공유 링크 생성
- `Full`/`10K` 코스 구분에 따른 Wari-gari GPX 표시
- Full과 10K 배번이 섞인 경우 코스별 맵 분리 표시
- 여러 주자의 위치를 코스 맵 핀으로 표시
- 모바일 반응형 레이아웃

## 데이터 흐름

- 기록 검색: MyResult via Supabase Edge Function `myresult-search-v5`
- 코스 데이터: Wari-gari via Supabase Edge Function `wari-jtbc-route`
- 지도/고도 렌더링: `gpx-viewer.html`
- 코스 GPX 데이터는 Wari-gari에서 가져오며, 지도 렌더링에는 Leaflet을 사용합니다.
- 배번과 수정 이름은 브라우저 저장소에 저장되고, 공유 링크에는 수정된 이름만 `names` 파라미터로 포함됩니다.

## 로컬 실행

정적 파일 서버로 프로젝트 디렉터리를 제공하면 됩니다. `file://`로 직접 열어도 기본 화면은 확인할 수 있지만, iframe과 외부 요청 확인에는 HTTP 서버를 권장합니다.

## 배포

- GitHub: https://github.com/ch-choi/MarathonTracking
- Production: https://marathontracking.changhyunchoe.workers.dev/
