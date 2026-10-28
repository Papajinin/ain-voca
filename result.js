// ==========================================================
// result.js : ⑦ 결과 화면 (정답률, 오답 목록, 100% 클리어 기록)
// 복습 게임·복습 테스트(배구 역전승) 결과도 이 화면을 함께 씁니다 (문구만 다름, 진도 기록 없음).
// 데일리 챌린지 칸을 채웠으면 "조각 열기!" 카드를 보여 줍니다 (challenge.js).
// ==========================================================

// 결과 화면 맨 위 아이콘 (경우별)
const RESULT_ICON_BASE = "w-20 h-20 rounded-full flex items-center justify-center shadow-inner mt-4 mb-3";
const RESULT_ICONS = {
  trophy: { cls: "bg-emerald-500/10 text-emerald-500 text-4xl", html: `<i class="fa-solid fa-trophy"></i>` },
  ball: { cls: "bg-emerald-500/10", html: `<img class="rally-ball-big" src="./volleyball.png" alt="">` },
  fire: { cls: "bg-amber-500/10 text-amber-500 text-4xl", html: `<i class="fa-solid fa-fire"></i>` }
};

function finishQuiz() {
  const missedCount = quizMissedWords.length;

  // 경우마다 결과 모양을 정함: 아이콘, 제목, 설명, 재도전 버튼, 다음 Stage 버튼
  document.getElementById("result-challenge-card").classList.add("hidden");
  let look;
  if (quizIsRally) look = rallyResult();
  else if (missedCount > 0) look = missedResult(missedCount);
  else if (quizIsGame) look = gameClearResult();
  else if (quizSource === "day") look = stageClearResult();
  else look = notebookClearResult();

  showResultStats(missedCount);
  const icon = RESULT_ICONS[look.icon];
  const iconBadge = document.getElementById("result-icon-badge");
  iconBadge.className = `${RESULT_ICON_BASE} ${icon.cls}`;
  iconBadge.innerHTML = icon.html;
  document.getElementById("result-title").textContent = look.title;
  document.getElementById("result-subtitle").textContent = look.subtitle;
  // 재도전 버튼 문구 (게임이면 게임으로 다시)
  document.getElementById("txt-result-retry-label").textContent =
    quizIsGame ? "틀린 단어만 게임으로 재도전" : "틀린 단어만 재도전 (100% 클리어)";
  document.getElementById("btn-result-retry-missed").classList.toggle("hidden", !look.retry);
  // 다음 Stage 버튼: 마지막 Stage면 숨김
  document.getElementById("btn-result-next-day").classList.toggle("hidden", !(look.next && currentQuizDayNumber < getTotalDays()));

  renderResultList();
  renderHome();
  switchView("view-result");
}

// 위쪽 숫자 두 칸: 보통은 정답률·맞힌 개수, 복습 테스트는 한 번에 득점·다시 쳐서 득점
function showResultStats(missedCount) {
  const total = currentQuizSet.length;
  const correctCount = total - missedCount;
  document.getElementById("result-stat-pct").textContent = quizIsRally ? correctCount : `${Math.round((correctCount / total) * 100)}%`;
  document.getElementById("result-stat-count").textContent = quizIsRally ? missedCount : `${correctCount} / ${total}`;
  document.getElementById("result-stat-pct-label").textContent = quizIsRally ? "한 번에 득점" : "정답률";
  document.getElementById("result-stat-count-label").textContent = quizIsRally ? "다시 쳐서 득점" : "맞힌 개수";
}

// 복습 테스트: 틀린 단어를 끝까지 다시 쳐서 언제나 역전승. 이미 클리어한 Day라 진도는 기록하지 않음
function rallyResult() {
  const S = rallyInfo();
  return {
    icon: "ball", title: "경기 승리!", retry: false, next: true,
    subtitle: `${RALLY_TEAMS[rallyTeamKey()]} ${S.start}:${S.them}에서 ${S.point}:${S.them} 역전 · 세트 스코어 ${S.setUs + 1}:${S.setThem}`
  };
}

// 틀린 단어가 있음 (테스트·게임·오답 복습 공통)
function missedResult(missedCount) {
  return {
    icon: "fire", title: `아쉬워요! (${missedCount}개 오답)`, retry: true, next: false,
    subtitle: quizIsGame
      ? "틀린 단어를 게임으로 다시 도전해보세요!"
      : quizSource === "day"
        ? "100% 완벽히 맞혀야 클리어 인정됩니다. 틀린 단어에 다시 도전해보세요!"
        : "틀린 단어에 다시 도전해보세요!"
  };
}

// 복습 게임 100%: 이미 클리어한 Day라 진도는 기록하지 않음
function gameClearResult() {
  return { icon: "trophy", title: "복습 게임 100%!", subtitle: `Stage ${currentQuizDayNumber} 단어를 게임으로 모두 맞혔습니다.`, retry: false, next: true };
}

// Stage 100% 클리어: 진도 기록 + 데일리 챌린지 칸 채우기
function stageClearResult() {
  const clearKey = getClearKey(state.mode, state.selectedLevel, state.selectedPosGroup, currentQuizDayNumber);
  const wasCleared = !!state.clearedDays[clearKey];
  state.clearedDays[clearKey] = true;
  saveState();

  // 데일리 챌린지: 이 Day의 영→한·한→영이 방금 모두 클리어됐으면 칸 채우기
  const credit = challengeCreditForDay(state.selectedLevel, state.selectedPosGroup, currentQuizDayNumber, wasCleared);
  if (credit) showChallengeCredit(credit);
  return { icon: "trophy", title: `Stage ${currentQuizDayNumber} 100% 클리어!`, subtitle: "모든 단어를 완벽하게 마스터하셨습니다.", retry: false, next: true };
}

// 오답노트 모아 테스트 100%
function notebookClearResult() {
  return { icon: "trophy", title: "오답 복습 100% 완료!", subtitle: "복습한 단어를 모두 맞혔습니다.", retry: false, next: false };
}

// "○월 ○일 칸을 채웠어요!" 카드
function showChallengeCredit(credit) {
  lastCreditMonth = credit.mk;
  document.getElementById("txt-result-challenge-title").textContent = `${credit.m}월 ${credit.d}일 칸을 채웠어요!`;
  document.getElementById("txt-result-challenge-sub").innerHTML = credit.count > 0
    ? `<i class="fa-solid fa-puzzle-piece mr-1"></i>조각 ${credit.count}개 획득${credit.bonus ? " (보너스 날짜)" : ""}`
    : "이달의 퍼즐 조각이 이미 모두 열려 있어요";
  document.getElementById("btn-result-open-piece").classList.toggle("hidden", credit.count === 0);
  document.getElementById("result-challenge-card").classList.remove("hidden");
}

// 아래 단어 목록: 틀린 단어는 빨강, 복습 테스트는 단어별 틀린 횟수
function renderResultList() {
  const listContainer = document.getElementById("result-words-list");
  listContainer.innerHTML = "";
  currentQuizSet.forEach(item => {
    const isWrong = quizMissedWords.some(w => w.word === item.word);
    const row = document.createElement("div");
    row.className = `p-2.5 rounded-xl border flex items-center justify-between ${isWrong ? 'bg-rose-50/50 border-rose-200 text-rose-800 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300' : 'theme-card border-emerald-200/50 text-emerald-800 dark:border-emerald-500/30 dark:text-emerald-300'}`;
    row.innerHTML = `
      <div class="flex items-center space-x-2">
        <i class="fa-solid ${isWrong ? 'fa-xmark text-rose-500' : 'fa-check text-emerald-500'} font-bold"></i>
        <div>
          <span class="font-bold">${item.word}</span>
          ${item.ipa ? `<span class="text-[11px] opacity-75 ml-1">${item.ipa}</span>` : ''}
          <span class="text-[10px] opacity-60 ml-1 font-semibold">[${getKoreanPos(item.pos)}]</span>
          ${quizIsRally && rally.misses.has(item) ? `<span class="text-[10px] font-bold ml-1">${rally.misses.get(item)}번 틀림</span>` : ''}
          <div class="text-[11px] opacity-90">${item.meaning}</div>
        </div>
      </div>
      <button class="w-7 h-7 rounded-full theme-card border theme-border flex items-center justify-center" onclick="playTTS('${ttsArg(item.word)}')">
        <i class="fa-solid fa-volume-high text-[11px]"></i>
      </button>
    `;
    listContainer.appendChild(row);
  });
}

// 버튼 연결 (main.js에서 1번 호출)
function initResultScreen() {
  document.getElementById("btn-result-home").onclick = () => {
    renderHome();
    switchView("view-home");
  };
  document.getElementById("btn-result-next-day").onclick = () => {
    openStudyView(currentQuizDayNumber + 1);
  };
  document.getElementById("btn-result-open-piece").onclick = () => {
    if (lastCreditMonth) openPuzzle(lastCreditMonth);
  };
  document.getElementById("btn-result-retry-missed").onclick = () => {
    startQuiz(currentQuizDayNumber, quizSource, [...quizMissedWords], quizIsGame);
  };
}
