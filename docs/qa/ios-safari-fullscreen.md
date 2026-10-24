# iOS Safari 로컬 전체화면 검증

- 날짜: 2026-10-24
- 환경: Xcode CoreSimulator, iPhone 17 Pro, iOS 26.5, Mobile Safari
- 로컬 주소: `http://127.0.0.1:8766/?mock=1`
- 데이터: 앱의 Full/10K 테스트 기록. 실제 MyResult/Supabase 기록 조회 검증은 이번 범위에 포함하지 않았다.
- 도구: XcodeBuildMCP 부팅·화면 캡처, Apple simctl URL 열기, XcodeBuildMCP 번들 AXe의 물리 터치.

## 확인 결과

- Full과 10K 각각 오른쪽 위 버튼으로 Safari 콘텐츠 영역 전체로 확대된다. 브라우저 주소창·상태바는 유지된다.
- 바깥 카드와 고도 그래프가 전체화면 지도를 제한하지 않는다.
- Full 코스의 10/20/30/40km 표식과 테스트 주자 #5050 핀이 전체화면에서도 보인다.
- Full/10K 코스 전체가 확대 화면 안에 맞춰진다.
- 닫기 버튼을 누르면 카드·고도 그래프가 다시 표시된다.
- 복귀 시 페이지 스크롤이 이동하는 현상을 발견해 `setMapFullscreen`에서 진입 직전 스크롤 좌표를 보관하고 종료 시 복원하도록 수정했다. 수정 후 Full 진입/종료를 재검증했다.
- 관련 Node 회귀 테스트와 app.js 문법 검사가 통과했다.

## 화면 기록

- `ios-26-5-before-fullscreen.jpg`: 진입 전 Full 지도
- `ios-26-5-full-fullscreen.jpg`: Full 확대, 거리 표식과 주자 핀
- `ios-26-5-10k-fullscreen.jpg`: 10K 확대
- `ios-26-5-after-fullscreen.jpg`: 종료 후 지도·그래프 복원

실물 iPhone, 구버전 iOS 및 운영 배포 주소는 이번에 검증하지 않았다.
