// ==========================================================
// result.js : ⑦ 결과 화면 (정답률, 오답 목록, 100% 클리어 기록)
// 복습 게임·복습 테스트(배구 역전승) 결과도 이 화면을 함께 씁니다 (문구만 다름, 진도 기록 없음).
// 데일리 챌린지 칸을 채웠으면 "조각 열기!" 카드를 보여 줍니다 (challenge.js).
// ==========================================================

function finishQuiz() {
  const total = currentQuizSet.length;
  const missedCount = quizMissedWords.length;
  const correctCount = total - missedCount;
  const pct = Math.round((correctCount / total) * 100);
  const isAllClear = missedCount === 0;

  document.getElementById("result-stat-pct").textContent = `${pct}%`;
  document.getElementById("result-stat-count").textContent = `${correctCount} / ${total}`;
  document.getElementById("result-stat-pct-label").textContent = quizIsRally ? "한 번에 득점" : "정답률";
  document.getElementById("result-stat-count-label").textContent = quizIsRally ? "다시 쳐서 득점" : "맞힌 개수";

  const iconBadge = document.getElementById("result-icon-badge");
  const title = document.getElementById("result-title");
  const subtitle = document.getElementById("result-subtitle");
  const retryBtn = document.getElementById("btn-result-retry-missed");
  const nextBtn = document.getElementById("btn-result-next-day");

  const isDayQuiz = quizSource === "day";
  document.getElementById("result-challenge-card").classList.add("hidden");

  // 재도전 버튼 문구 (게임이면 게임으로 다시)
  document.getElementById("txt-result-retry-label").textContent =
    quizIsGame ? "틀린 단어만 게임으로 재도전" : "틀린 단어만 재도전 (100% 클리어)";

  if (quizIsRally) {
    // 복습 테스트: 틀린 단어를 끝까지 다시 쳐서 언제나 역전승. 이미 클리어한 Day라 진도는 기록하지 않음
    const S = rallyInfo();
    document.getElementById("result-stat-pct").textContent = total - missedCount;
    document.getElementById("result-stat-count").textContent = missedCount;
    iconBadge.className = "w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center shadow-inner mt-4 mb-3";
    iconBadge.innerHTML = `<img class="rally-ball-big" src="./volleyball.png" alt="">`;
    title.textContent = "경기 승리!";
    subtitle.textContent = `${RALLY_TEAMS[rallyTeamKey()]} ${S.start}:${S.them}에서 ${S.point}:${S.them} 역전 · 세트 스코어 ${S.setUs + 1}:${S.setThem}`;
    retryBtn.classList.add("hidden");
    const totalDays = Math.ceil(getWordsForCategory(state.selectedLevel, state.selectedPosGroup).length / state.wordsPerDay);
    nextBtn.classList.toggle("hidden", currentQuizDayNumber >= totalDays);
  } else if (isAllClear) {
    iconBadge.className = "w-20 h-20 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-4xl shadow-inner mt-4 mb-3";
    iconBadge.innerHTML = `<i class="fa-solid fa-trophy"></i>`;
    retryBtn.classList.add("hidden");

    if (quizIsGame) {
      // 복습 게임: 이미 클리어한 Day라 진도는 기록하지 않음
      title.textContent = "복습 게임 100%!";
      subtitle.textContent = `Stage ${currentQuizDayNumber} 단어를 게임으로 모두 맞혔습니다.`;
      const totalDays = Math.ceil(getWordsForCategory(state.selectedLevel, state.selectedPosGroup).length / state.wordsPerDay);
      nextBtn.classList.toggle("hidden", currentQuizDayNumber >= totalDays);
    } else if (isDayQuiz) {
      title.textContent = `Stage ${currentQuizDayNumber} 100% 클리어!`;
      subtitle.textContent = "모든 단어를 완벽하게 마스터하셨습니다.";

      const clearKey = getClearKey(state.mode, state.selectedLevel, state.selectedPosGroup, currentQuizDayNumber);
      const wasCleared = !!state.clearedDays[clearKey];
      state.clearedDays[clearKey] = true;
      saveState();

      // 데일리 챌린지: 이 Day의 영→한·한→영이 방금 모두 클리어됐으면 칸 채우기
      const credit = challengeCreditForDay(state.selectedLevel, state.selectedPosGroup, currentQuizDayNumber, wasCleared);
      if (credit) {
        lastCreditMonth = credit.mk;
        document.getElementById("txt-result-challenge-title").textContent = `${credit.m}월 ${credit.d}일 칸을 채웠어요!`;
        document.getElementById("txt-result-challenge-sub").innerHTML = credit.count > 0
          ? `<i class="fa-solid fa-puzzle-piece mr-1"></i>조각 ${credit.count}개 획득${credit.bonus ? " (보너스 날짜)" : ""}`
          : "이달의 퍼즐 조각이 이미 모두 열려 있어요";
        document.getElementById("btn-result-open-piece").classList.toggle("hidden", credit.count === 0);
        document.getElementById("result-challenge-card").classList.remove("hidden");
      }

      const totalDays = Math.ceil(getWordsForCategory(state.selectedLevel, state.selectedPosGroup).length / state.wordsPerDay);
      nextBtn.classList.toggle("hidden", currentQuizDayNumber >= totalDays);
    } else {
      title.textContent = "오답 복습 100% 완료!";
      subtitle.textContent = "복습한 단어를 모두 맞혔습니다.";
      nextBtn.classList.add("hidden");
    }
  } else {
    iconBadge.className = "w-20 h-20 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center text-4xl shadow-inner mt-4 mb-3";
    iconBadge.innerHTML = `<i class="fa-solid fa-fire"></i>`;
    title.textContent = `아쉬워요! (${missedCount}개 오답)`;
    subtitle.textContent = quizIsGame
      ? "틀린 단어를 게임으로 다시 도전해보세요!"
      : isDayQuiz
        ? "100% 완벽히 맞혀야 클리어 인정됩니다. 틀린 단어에 다시 도전해보세요!"
        : "틀린 단어에 다시 도전해보세요!";
    retryBtn.classList.remove("hidden");
    nextBtn.classList.add("hidden");
  }

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

  renderHome();
  switchView("view-result");
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
