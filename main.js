// ==========================================================
// main.js : 앱 시작 순서 (index.html에서 가장 마지막에 불러옵니다)
// 원래 단일 파일의 시작 순서를 그대로 유지합니다.
// 새 화면 파일을 추가하면 아래에 init 함수 호출을 한 줄 추가합니다.
// ==========================================================
document.addEventListener("DOMContentLoaded", () => {
  // 시작 화면(스플래시): 2.3초 뒤 서서히 사라지고 없어짐. 앱을 새로 열 때만 보임
  const splash = document.getElementById("app-splash");
  if (splash) {
    setTimeout(() => splash.classList.add("splash-fadeout"), 2300);
    setTimeout(() => splash.remove(), 2900);
  }

  loadState();
  parseEmbeddedDatabase();
  initTTS();
  refreshTheme();
  if (window.matchMedia) {
    const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
    if (darkMq.addEventListener) darkMq.addEventListener("change", refreshTheme);
    else if (darkMq.addListener) darkMq.addListener(refreshTheme);
  }

  renderCategoryView();
  renderPosGuideView();
  openChallenge();   // 앱을 열면 데일리 챌린지가 먼저

  // 화면별 버튼 연결
  initCategoryScreen();
  initPosGuideScreen();
  initDaysScreen();
  initStudyScreen();
  initNotebookScreen();
  initSettingsScreen();
  initQuizScreen();
  initResultScreen();
  initChallengeScreen();
  initSync();        // 클라우드 자동 저장 (sync.js): 로그인돼 있으면 클라우드와 맞춤
});
