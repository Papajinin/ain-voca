// ==========================================================
// quiz.js : ⑤ 영한 퀴즈(뜻 입력 후 자가채점) · ⑥ 한영 퀴즈(스펠링 입력) 공용 화면
//           + 복습 게임(4지선다, 클리어한 Day에서 시작)
//           + 복습 테스트 = 배구 역전승 (틀린 단어는 맨 뒤로, 다 맞히면 경기 승리)
// 퀴즈가 끝나면 result.js 의 finishQuiz() 로 넘어갑니다.
// 게임 보기 규칙은 buildChoices() 에서 고칩니다.
// 넘어가는 방식(한영 테스트·복습 게임 공통): 정답은 CORRECT_NEXT_DELAY 뒤 자동,
// 오답은 "다음 문제" 버튼을 눌러야 넘어감. 새 문제가 나오면 커서를 입력칸에 넣음
// (아이폰은 화면을 누른 직후에만 키보드가 올라올 수 있음).
// ==========================================================

let currentQuizSet = [];
let currentQuizIndex = 0;
let currentQuizDayNumber = 1;
let quizMissedWords = [];
let quizSource = "day";
let answerTimer = null;
let quizIsGame = false;      // true = 복습 게임(4지선다)
let choiceLocked = false;    // 게임에서 보기를 한 번 누르면 잠금 (연타 방지)
let awaitingNext = false;    // 오답 후 "다음 문제" 버튼을 기다리는 중
let quizIsRally = false;     // true = 복습 테스트(배구 역전승)
let rally = null;            // 복습 테스트 점수: { score, misses(단어 → 틀린 횟수), rival, line }

const CORRECT_NEXT_DELAY = 3000;   // 정답 후 다음 문제까지 (ms)

// 오답: "다음 문제" 버튼을 보여 주고 누를 때까지 기다림
function waitForNextButton() {
  awaitingNext = true;
  document.getElementById("btn-quiz-next").classList.remove("hidden");
}

const TEST_PLACEHOLDER = "뜻을 입력하고 '정답 확인하기'를 누르세요";
const INPUT_BASE = "w-full px-4 py-3 text-center text-lg font-bold rounded-2xl border-2 theme-border bg-black/5 dark:bg-white/5 focus:outline-none focus:border-[color:var(--primary)] transition";

// 입력칸 초기화 (영→한: 뜻, 한→영: 영단어)
function resetAnswerInput(placeholder) {
  const input = document.getElementById("quiz-spell-input");
  input.value = "";
  input.disabled = false;
  input.placeholder = placeholder;
  input.className = INPUT_BASE;
  const feedback = document.getElementById("quiz-feedback-msg");
  feedback.className = "text-xs font-bold mt-2 min-h-[18px]";
  feedback.textContent = "";
}
const GAME_PLACEHOLDER = "알맞은 답을 고르세요";

function cancelPendingAnswer() {
  if (answerTimer !== null) {
    clearTimeout(answerTimer);
    answerTimer = null;
  }
}

function startQuiz(dayNumber, source = "day", customWordList = null, isGame = false, isRally = false) {
  let quizSet;
  if (customWordList) {
    quizSet = [...customWordList];
  } else {
    const categoryWords = getWordsForCategory(state.selectedLevel, state.selectedPosGroup);
    const start = (dayNumber - 1) * state.wordsPerDay;
    const end = start + state.wordsPerDay;
    quizSet = categoryWords.slice(start, end);
  }
  if (quizSet.length === 0) return;

  cancelPendingAnswer();
  quizSource = source;
  quizIsGame = isGame;
  quizIsRally = isRally;
  rally = isRally ? { score: 0, misses: new Map(), rival: pickRallyRival(), line: "" } : null;
  currentQuizDayNumber = dayNumber;
  quizMissedWords = [];
  currentQuizSet = quizSet;

  currentQuizSet.sort(() => Math.random() - 0.5);
  currentQuizIndex = 0;

  renderQuizQuestion();
  switchView("view-quiz");
  if (!quizIsGame) document.getElementById("quiz-spell-input").focus();
}

function renderQuizQuestion() {
  const total = currentQuizSet.length;
  const current = currentQuizSet[currentQuizIndex];
  const mode = state.mode;

  document.getElementById("quiz-progress-text").textContent = `${currentQuizIndex + 1} / ${total}`;
  const pct = Math.round(((currentQuizIndex + 1) / total) * 100);
  document.getElementById("quiz-progress-bar").style.width = `${pct}%`;
  // 복습 테스트는 진행 막대 대신 점수판
  document.getElementById("quiz-progress-wrap").style.visibility = quizIsRally ? "hidden" : "";
  document.getElementById("quiz-progress-text").style.visibility = quizIsRally ? "hidden" : "";
  document.getElementById("view-quiz").classList.toggle("rally-on", quizIsRally);   // 점수판만큼 카드 여백을 줄임 (style.css)
  document.getElementById("quiz-rally-board").classList.toggle("hidden", !quizIsRally);
  if (quizIsRally) renderRallyBoard(false);

  document.getElementById("quiz-pos-badge").textContent = `${getKoreanPos(current.pos)} · ${current.level}`;

  document.getElementById("btn-show-answer").classList.add("hidden");
  document.getElementById("quiz-self-eval-buttons").classList.add("hidden");
  document.getElementById("btn-submit-typing").classList.add("hidden");
  document.getElementById("btn-quiz-next").classList.add("hidden");
  awaitingNext = false;
  document.getElementById("quiz-typing-container").classList.add("hidden");
  document.getElementById("quiz-answer-container").classList.remove("hidden");
  document.getElementById("quiz-revealed-meaning").classList.add("hidden");
  document.getElementById("quiz-hidden-placeholder").classList.remove("hidden");
  document.getElementById("quiz-ipa-container").classList.remove("hidden");
  document.getElementById("quiz-correct-label").classList.add("hidden");
  document.getElementById("quiz-my-answer-label").classList.add("hidden");

  // 게임 영역 초기화 (일반 테스트에서는 계속 숨김)
  const choiceBox = document.getElementById("quiz-choice-container");
  choiceBox.innerHTML = "";
  choiceBox.classList.add("hidden");
  document.getElementById("quiz-choice-feedback").classList.add("hidden");
  document.getElementById("quiz-hidden-placeholder").textContent = quizIsGame ? GAME_PLACEHOLDER : TEST_PLACEHOLDER;

  if (quizIsGame) {
    renderChoiceQuestion(current, mode);
  } else if (mode === "en-ko") {
    document.getElementById("quiz-question-primary").textContent = current.word;
    document.getElementById("quiz-ipa").textContent = current.ipa || "";
    document.getElementById("quiz-revealed-meaning").textContent = current.meaning;
    // 뜻을 직접 입력 (새 문제는 키보드가 내려간 상태로 시작)
    document.getElementById("quiz-typing-container").classList.remove("hidden");
    document.getElementById("btn-show-answer").classList.remove("hidden");
    resetAnswerInput("뜻을 입력하세요");
    playTTS(current.word);
  } else {
    document.getElementById("quiz-question-primary").textContent = current.meaning;
    document.getElementById("quiz-ipa-container").classList.add("hidden");
    document.getElementById("quiz-hidden-placeholder").classList.add("hidden");
    document.getElementById("quiz-typing-container").classList.remove("hidden");
    document.getElementById("btn-submit-typing").classList.remove("hidden");

    resetAnswerInput("영단어를 입력하세요...");
    // 새 문제는 키보드가 내려간 상태로 시작 (입력칸을 눌러 입력)
  }

  document.getElementById("btn-play-voice").onclick = () => playTTS(current.word);
  if (!quizIsGame) document.getElementById("quiz-spell-input").focus();
}

// ---------- 복습 테스트 (배구 역전승) ----------
// 10개 이하: 5세트(15점), 세트 2:2, (15−N):13에서 시작 → 다 맞히면 15:13
// 11~20개: 4세트(25점), 세트 2:1, (25−N):23에서 시작 → 다 맞히면 25:23
// 우리 팀 = 지금 학교 테마, 상대 팀 = 나머지 세 학교 중 랜덤
const RALLY_TEAMS = { "theme-dark": "카라스노", "theme-ios": "네코마", "theme-playful": "아오바조사이", "theme-paper": "후쿠로다니" };
const RALLY_ATTACKS = ["스파이크", "퀵오픈", "속공", "시간차 공격", "백어택", "페인트", "서브 에이스"];
const RALLY_DEFENDS = ["상대 디그! 다시 공격해요", "아깝다! 상대가 받아냈어요", "수비에 걸렸어요! 다시 한번"];

function rallyTeamKey() {
  return Object.keys(RALLY_TEAMS).find(k => document.body.classList.contains(k)) || state.theme;
}
function pickRallyRival() {
  const others = Object.keys(RALLY_TEAMS).filter(k => k !== rallyTeamKey());
  return RALLY_TEAMS[others[Math.floor(Math.random() * others.length)]];
}
function rallyInfo() {
  const n = currentQuizSet.length;
  return n <= 10
    ? { cap: "FINAL SET · 5세트", point: 15, them: 13, setUs: 2, setThem: 2, start: 15 - n }
    : { cap: "4세트", point: 25, them: 23, setUs: 2, setThem: 1, start: 25 - n };
}
// 바로 전과 같은 문구는 피해서 랜덤
function pickRallyLine(list) {
  let x;
  do { x = list[Math.floor(Math.random() * list.length)]; } while (x === rally.line && list.length > 1);
  rally.line = x;
  return x;
}

function renderRallyBoard(scored) {
  const S = rallyInfo();
  const us = S.start + rally.score;
  const left = currentQuizSet.length - rally.score;
  const back = currentQuizSet.slice(currentQuizIndex).filter(w => rally.misses.has(w)).length;
  document.getElementById("quiz-rally-board").innerHTML = `
    <div class="rally-grid">
      <span class="rally-cap">${S.cap}</span><span class="rally-head">SET</span><span class="rally-head">POINT</span>
      <div class="rally-team"><i></i>${RALLY_TEAMS[rallyTeamKey()]}</div>
      <div class="rally-set">${S.setUs}</div>
      <div class="rally-pts us"><b class="${scored ? "flip" : ""}">${us}</b></div>
      <div class="rally-team them"><i></i>${rally.rival}</div>
      <div class="rally-set">${S.setThem}</div>
      <div class="rally-pts them"><b>${S.them}</b></div>
    </div>
    <div class="rally-foot">${us === S.point - 1 ? '<span class="rally-mp">매치 포인트!</span>' : `<span>역전까지 ${left}점</span>`}<span class="rally-back">${back ? `↩ 다시 칠 공 ${back}개` : ""}</span></div>`;
}

// 맞힘: 점수 올리고 공격 이름, 3초 뒤 다음 문제
function rallyScored() {
  rally.score++;
  renderRallyBoard(true);
  const S = rallyInfo();
  const feedback = document.getElementById("quiz-feedback-msg");
  feedback.className = "mt-2 min-h-[18px]";
  feedback.innerHTML = `<span class="rally-line ok">${pickRallyLine(RALLY_ATTACKS)} 성공!<img src="./volleyball.png" alt="">${S.start + rally.score} : ${S.them}</span>`;
  answerTimer = setTimeout(() => { answerTimer = null; handleQuizAnswer(true); }, CORRECT_NEXT_DELAY);
}
// 틀림: 상대가 받아냄, "다음 문제"를 누르면 이 단어는 맨 뒤로
function rallyDefended(answer) {
  const feedback = document.getElementById("quiz-feedback-msg");
  feedback.className = "mt-2 min-h-[18px]";
  feedback.innerHTML = `<span class="rally-line bad">${pickRallyLine(RALLY_DEFENDS)}</span>` +
    `<small class="rally-sub">${answer ? `정답은 <b>${answer}</b> · ` : ""}이 단어는 마지막에 다시 나와요</small>`;
  waitForNextButton();
}

// ---------- 복습 게임 (4지선다) ----------

// 매 문제마다 새로 섞기 (Day 구성용 고정 섞기와 별개)
function randomShuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 보기 = 정답 1개 + 오답 최대 3개 (순서 무작위)
// 오답 후보: ① 같은 레벨·같은 품사 → 부족하면 ② 같은 품사의 다른 레벨
// 정답과 철자가 같거나 뜻이 같은 단어, 화면에 같은 글자로 보이는 보기는 제외
// (to, the, a, an 처럼 같은 품사가 없으면 정답 1개만 표시)
function buildChoices(current, mode) {
  const label = w => (mode === "en-ko" ? w.meaning : w.word);
  const clashes = w =>
    w === current ||
    w.word.toLowerCase() === current.word.toLowerCase() ||
    w.meaning === current.meaning;

  const samePos = allWords.filter(w => w.pos === current.pos && !clashes(w));
  const sameLevel = randomShuffle(samePos.filter(w => w.level === current.level));
  const otherLevel = randomShuffle(samePos.filter(w => w.level !== current.level));

  const used = new Set([label(current)]);
  const distractors = [];
  for (const w of [...sameLevel, ...otherLevel]) {
    if (distractors.length >= 3) break;
    if (used.has(label(w))) continue;
    used.add(label(w));
    distractors.push(w);
  }
  return randomShuffle([current, ...distractors]);
}

const CHOICE_BASE = "w-full px-4 py-3 rounded-2xl border text-left font-bold text-[15px] flex items-center justify-between transition";

function renderChoiceQuestion(current, mode) {
  choiceLocked = false;
  document.getElementById("quiz-question-primary").textContent = mode === "en-ko" ? current.word : current.meaning;
  document.getElementById("quiz-ipa").textContent = mode === "en-ko" ? (current.ipa || "") : "";
  if (mode !== "en-ko") document.getElementById("quiz-ipa-container").classList.add("hidden");
  document.getElementById("quiz-revealed-meaning").textContent = mode === "en-ko" ? current.meaning : current.word;

  const choiceBox = document.getElementById("quiz-choice-container");
  buildChoices(current, mode).forEach(w => {
    const btn = document.createElement("button");
    btn.className = `${CHOICE_BASE} theme-card theme-border active:scale-95`;
    const text = document.createElement("span");
    text.textContent = mode === "en-ko" ? w.meaning : w.word;
    const mark = document.createElement("i");
    btn.appendChild(text);
    btn.appendChild(mark);
    btn.onclick = () => pickChoice(btn, w === current);
    btn.dataset.correct = w === current ? "1" : "0";
    choiceBox.appendChild(btn);
  });
  choiceBox.classList.remove("hidden");

  if (mode === "en-ko") playTTS(current.word);
}

function pickChoice(pickedBtn, isCorrect) {
  if (choiceLocked) return;
  choiceLocked = true;
  const current = currentQuizSet[currentQuizIndex];

  document.querySelectorAll("#quiz-choice-container button").forEach(btn => {
    const mark = btn.lastChild;
    if (btn.dataset.correct === "1") {
      btn.className = `${CHOICE_BASE} border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300`;
      mark.className = "fa-solid fa-check";
    } else if (btn === pickedBtn) {
      btn.className = `${CHOICE_BASE} border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300`;
      mark.className = "fa-solid fa-xmark";
    } else {
      btn.className = `${CHOICE_BASE} theme-card theme-border opacity-50`;
    }
  });

  // 카드에 정답 공개 + 결과 문구 (한영 테스트처럼 자동 진행)
  document.getElementById("quiz-hidden-placeholder").classList.add("hidden");
  document.getElementById("quiz-revealed-meaning").classList.remove("hidden");
  const fb = document.getElementById("quiz-choice-feedback");
  fb.className = `text-xs font-bold mt-1.5 ${isCorrect ? "text-emerald-600" : "text-rose-600"}`;
  fb.textContent = isCorrect ? "정답입니다!" : `오답! 정답: ${state.mode === "en-ko" ? current.meaning : current.word}`;

  if (state.mode !== "en-ko") playTTS(current.word);

  if (isCorrect) {
    answerTimer = setTimeout(() => { answerTimer = null; handleQuizAnswer(true); }, CORRECT_NEXT_DELAY);
  } else {
    waitForNextButton();
  }
}

function validateSpelling(userInput, targetWord) {
  const trimmed = userInput.trim();
  const isStrictCapital = /^[A-Z]/.test(targetWord);
  if (isStrictCapital) return trimmed === targetWord;
  return trimmed.toLowerCase() === targetWord.toLowerCase();
}

function handleQuizAnswer(isCorrect) {
  const current = currentQuizSet[currentQuizIndex];
  if (!isCorrect) {
    if (!quizMissedWords.includes(current)) quizMissedWords.push(current);
    // 복습 게임의 오답은 오답노트에 넣지 않음
    if (!quizIsGame && !state.notebook.some(w => w.word === current.word)) {
      state.notebook.push(current);
      saveState();
    }
  }

  if (quizIsRally && !isCorrect) {
    rally.misses.set(current, (rally.misses.get(current) || 0) + 1);
    currentQuizSet.push(currentQuizSet.splice(currentQuizIndex, 1)[0]);   // 틀린 단어는 맨 뒤로
  } else {
    currentQuizIndex++;
  }
  if (currentQuizIndex < currentQuizSet.length) {
    renderQuizQuestion();
  } else {
    finishQuiz();
  }
}

// 버튼·입력 연결 (main.js에서 1번 호출)
function initQuizScreen() {
  document.getElementById("btn-quiz-exit").onclick = () => {
    if (quizSource === "notebook") {
      renderNotebook();
      switchView("view-notebook");
    } else {
      switchView("view-study");
    }
  };

  // 영→한: 뜻을 입력해야 정답을 볼 수 있음 → 내가 쓴 답과 정답을 나란히 → 틀렸음/맞았음
  function revealEnKoAnswer() {
    const btn = document.getElementById("btn-show-answer");
    if (btn.classList.contains("hidden")) return;
    const myInput = document.getElementById("quiz-spell-input");
    const msg = document.getElementById("quiz-feedback-msg");
    if (!myInput.value.trim()) {
      msg.className = "text-xs font-bold mt-2 min-h-[18px] theme-sub-text";
      msg.textContent = "뜻을 먼저 입력해 주세요";
      myInput.focus();
      return;
    }
    myInput.blur();   // 키보드를 내려 정답과 채점 버튼이 보이게 (잠그기 전에)
    myInput.disabled = true;
    msg.textContent = "";
    document.getElementById("quiz-my-answer-label").classList.remove("hidden");
    document.getElementById("quiz-correct-label").classList.remove("hidden");
    document.getElementById("quiz-hidden-placeholder").classList.add("hidden");
    document.getElementById("quiz-revealed-meaning").classList.remove("hidden");
    btn.classList.add("hidden");
    document.getElementById("quiz-self-eval-buttons").classList.remove("hidden");
  }
  document.getElementById("btn-show-answer").onclick = revealEnKoAnswer;

  // 복습 테스트는 채점 버튼을 누르면 점수판 문구를 보여 준 뒤 넘어감 (한→영과 같게)
  function rallyEval(isCorrect) {
    if (answerTimer !== null || awaitingNext) return;
    document.getElementById("quiz-self-eval-buttons").classList.add("hidden");
    if (isCorrect) rallyScored();
    else rallyDefended("");
  }
  document.getElementById("btn-eval-correct").onclick = () => quizIsRally ? rallyEval(true) : handleQuizAnswer(true);
  document.getElementById("btn-eval-wrong").onclick = () => quizIsRally ? rallyEval(false) : handleQuizAnswer(false);

  const input = document.getElementById("quiz-spell-input");
  const submitBtn = document.getElementById("btn-submit-typing");
  const feedback = document.getElementById("quiz-feedback-msg");

  function processSpellingCheck() {
    const current = currentQuizSet[currentQuizIndex];
    const val = input.value;
    if (!val.trim()) return;

    const isCorrect = validateSpelling(val, current.word);
    input.blur();   // 키보드를 내려 정답 철자와 버튼이 가려지지 않게 (잠그기 전에)
    input.disabled = true;
    submitBtn.classList.add("hidden");
    playTTS(current.word);

    if (isCorrect) {
      input.className = "w-full px-4 py-3 text-center text-lg font-bold rounded-2xl border-2 border-emerald-500 bg-emerald-50 text-emerald-800 transition";
      feedback.className = "text-xs font-bold mt-2 text-emerald-600";
      if (quizIsRally) return rallyScored();
      feedback.textContent = `정답입니다! [${current.word}]`;
      answerTimer = setTimeout(() => { answerTimer = null; handleQuizAnswer(true); }, CORRECT_NEXT_DELAY);
    } else {
      input.className = "w-full px-4 py-3 text-center text-lg font-bold rounded-2xl border-2 border-rose-500 bg-rose-50 text-rose-800 transition";
      if (quizIsRally) return rallyDefended(current.word);
      feedback.className = "text-xs font-bold mt-2 text-rose-600";
      feedback.textContent = `오답! 정답: ${current.word}`;
      waitForNextButton();
    }
  }

  submitBtn.onclick = processSpellingCheck;

  // 오답 후 "다음 문제" (연타해도 한 번만)
  document.getElementById("btn-quiz-next").onclick = () => {
    if (!awaitingNext) return;
    awaitingNext = false;
    document.getElementById("btn-quiz-next").classList.add("hidden");
    handleQuizAnswer(false);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || quizIsGame) return;
    if (state.mode === "en-ko") revealEnKoAnswer();
    else processSpellingCheck();
  });
}
