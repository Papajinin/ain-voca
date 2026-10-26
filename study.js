// ==========================================================
// study.js : ④ 단어학습 화면 (카드형 / 목록형 / 짝맞추기)
// 클리어한 Day(현재 모드 기준)는 하단 버튼이 [복습 테스트 / 복습 게임] 2개로 바뀝니다.
// ==========================================================

let studyWords = [];
let currentStudyIndex = 0;
let currentStudyDay = 1;
let studyDisplayMode = 'card';

function openStudyView(dayNumber) {
  currentStudyDay = dayNumber;
  const categoryWords = getWordsForCategory(state.selectedLevel, state.selectedPosGroup);
  const start = (dayNumber - 1) * state.wordsPerDay;
  const end = start + state.wordsPerDay;
  studyWords = categoryWords.slice(start, end);

  currentStudyIndex = 0;
  document.getElementById("study-header-title").textContent = `Stage ${dayNumber} 단어 학습 (${studyWords.length}단어)`;

  // 현재 모드에서 클리어한 Day면 복습 버튼 2개, 아니면 기존 테스트 버튼 1개
  const isCleared = !!state.clearedDays[getClearKey(state.mode, state.selectedLevel, state.selectedPosGroup, dayNumber)];
  document.getElementById("btn-start-quiz-from-study").classList.toggle("hidden", isCleared);
  document.getElementById("study-review-buttons").classList.toggle("hidden", !isCleared);

  setStudyMode('card');
  renderStudyCard();
  renderStudyList();
  switchView("view-study");
}

// 보기 방식 탭: 카드형 / 목록형 / 짝맞추기(match.js)
const STUDY_TAB_ON = "flex-1 py-1.5 text-xs font-bold rounded-lg transition text-white theme-primary-bg shadow-sm";
const STUDY_TAB_OFF = "flex-1 py-1.5 text-xs font-bold rounded-lg transition theme-sub-text";

function setStudyMode(mode) {
  studyDisplayMode = mode;
  stopMatch(); // 게임 중에 탭을 바꾸면 멈춤
  const tabs = { card: "btn-study-view-card", list: "btn-study-view-list", match: "btn-study-view-match" };
  const areas = { card: "study-area-card", list: "study-area-list", match: "study-area-match" };
  Object.keys(tabs).forEach(m => {
    document.getElementById(tabs[m]).className = m === mode ? STUDY_TAB_ON : STUDY_TAB_OFF;
    document.getElementById(areas[m]).classList.toggle("hidden", m !== mode);
  });
  // 짝맞추기 중에는 아래 테스트 버튼을 숨겨서 카드 판이 작은 화면에 들어가게
  document.getElementById("study-bottom").classList.toggle("hidden", mode === "match");

  if (mode === "card") renderStudyCard();
  else if (mode === "list") renderStudyList();
  else openMatch();
}

function renderStudyCard() {
  if (studyWords.length === 0) return;
  const cur = studyWords[currentStudyIndex];
  const total = studyWords.length;

  document.getElementById("study-card-counter").textContent = `${currentStudyIndex + 1} / ${total}`;
  document.getElementById("study-card-pos-badge").textContent = `${getKoreanPos(cur.pos)} · ${cur.level}`;
  document.getElementById("study-card-word").textContent = cur.word;
  document.getElementById("study-card-ipa").textContent = cur.ipa || "";
  document.getElementById("study-card-meaning").textContent = cur.meaning;

  document.getElementById("btn-study-play-voice").onclick = () => playTTS(cur.word);
  playTTS(cur.word);
}

function renderStudyList() {
  const container = document.getElementById("study-words-list-container");
  container.innerHTML = "";

  studyWords.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "theme-card p-3 rounded-2xl border theme-border flex items-center justify-between";
    row.innerHTML = `
      <div class="flex items-center space-x-3">
        <span class="w-6 text-center text-xs font-black theme-sub-text">${idx + 1}</span>
        <div>
          <div class="font-bold text-sm flex items-center space-x-1.5">
            <span>${item.word}</span>
            ${item.ipa ? `<span class="text-[11px] theme-sub-text font-mono">${item.ipa}</span>` : ''}
            <span class="text-[10px] theme-badge px-1 py-0.5 rounded font-semibold">${getKoreanPos(item.pos)}</span>
          </div>
          <div class="text-xs font-semibold theme-primary-text mt-0.5">${item.meaning}</div>
        </div>
      </div>
      <button class="w-8 h-8 rounded-full theme-badge flex items-center justify-center active:scale-90 transition" onclick="playTTS('${ttsArg(item.word)}')">
        <i class="fa-solid fa-volume-high text-xs"></i>
      </button>
    `;
    container.appendChild(row);
  });
}

// 버튼 연결 (main.js에서 1번 호출)
function initStudyScreen() {
  document.getElementById("btn-study-exit").onclick = () => { stopMatch(); switchView("view-home"); };
  document.getElementById("btn-study-view-card").onclick = () => setStudyMode('card');
  document.getElementById("btn-study-view-list").onclick = () => setStudyMode('list');
  document.getElementById("btn-study-view-match").onclick = () => setStudyMode('match');

  document.getElementById("btn-study-prev").onclick = () => {
    if (currentStudyIndex > 0) {
      currentStudyIndex--;
      renderStudyCard();
    }
  };
  document.getElementById("btn-study-next").onclick = () => {
    if (currentStudyIndex < studyWords.length - 1) {
      currentStudyIndex++;
      renderStudyCard();
    }
  };

  document.getElementById("btn-start-quiz-from-study").onclick = () => {
    startQuiz(currentStudyDay);
  };
  // 복습 테스트: 기존 테스트와 동일
  document.getElementById("btn-review-test").onclick = () => {
    startQuiz(currentStudyDay);
  };
  // 복습 게임: 4지선다 (quiz.js)
  document.getElementById("btn-review-game").onclick = () => {
    startQuiz(currentStudyDay, "day", null, true);
  };
}
