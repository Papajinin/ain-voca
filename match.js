// ==========================================================
// match.js : 단어학습 화면의 "짝맞추기" 탭 (카드 뒤집기 게임)
// - 그 Stage 단어로 영어 카드와 뜻 카드를 짝지음. 판은 6쌍(12장), 90초
// - 시작할 때 3초 동안 앞면을 보여 줌
// - 3쌍을 찾으면 빈 6칸에 새 3쌍을 섞어 넣고 1.5초 보여 줌 (남은 카드는 자리 그대로)
//   한 쌍씩 바로 채우면 빈 두 칸이 당연히 짝이라 외울 필요가 없어지기 때문
// - 진도·챌린지·오답노트에는 반영하지 않음. Stage별 최고 기록만 이 기기에 저장
// ==========================================================

const MATCH_TIME = 90;          // 제한 시간(초)
const MATCH_PREVIEW_MS = 3000;  // 시작할 때 앞면 보여 주는 시간
const MATCH_NEWPEEK_MS = 1500;  // 새 카드 보여 주는 시간
const MATCH_BEST_KEY = "AIN_VOCA_MATCH_BEST"; // 진도 저장(AIN_ENG_APP_V2)과 따로

let matchSlots = [];
let matchQueue = [];
let matchOpen = [];
let matchBusy = false;
let matchFound = 0;
let matchMiss = 0;
let matchSinceRefill = 0;
let matchTimer = null;
let matchLeft = MATCH_TIME;
let matchTimeouts = [];

function matchEl() { return document.getElementById("study-area-match"); }

function matchBestKey() {
  return `${state.selectedLevel}|${state.selectedPosGroup}|${state.wordsPerDay}|${currentStudyDay}`;
}
function getMatchBest() {
  try { return JSON.parse(localStorage.getItem(MATCH_BEST_KEY) || "{}")[matchBestKey()] ?? null; } catch (e) { return null; }
}
function setMatchBest(n) {
  try {
    const all = JSON.parse(localStorage.getItem(MATCH_BEST_KEY) || "{}");
    all[matchBestKey()] = n;
    localStorage.setItem(MATCH_BEST_KEY, JSON.stringify(all));
  } catch (e) {}
}

function matchShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function matchBoardPairs() { return Math.min(6, studyWords.length); }

// 다음 단어: Stage 단어를 섞어서 차례로, 다 쓰면 다시 섞음. 판에 있는 단어(skip)는 건너뜀
function matchNextWord(skip) {
  let i = matchQueue.findIndex(w => !skip.has(w));
  if (i < 0) {
    matchQueue = matchShuffle(studyWords.map((_, k) => k).filter(k => !skip.has(k)));
    i = 0;
  }
  const w = matchQueue.splice(i, 1)[0];
  skip.add(w);
  return w;
}
function matchNewCards(pairs) {
  const skip = new Set(matchSlots.filter(c => !c.gone).map(c => c.w));
  const out = [];
  for (let k = 0; k < pairs; k++) {
    const w = matchNextWord(skip);
    out.push({ w, en: true }, { w, en: false });
  }
  return matchShuffle(out);
}

function matchLater(fn, ms) { matchTimeouts.push(setTimeout(fn, ms)); }

function stopMatch() {
  clearInterval(matchTimer);
  matchTimer = null;
  matchTimeouts.forEach(clearTimeout);
  matchTimeouts = [];
  matchBusy = false;
}

// 탭을 열었을 때: 시작 화면
function openMatch() {
  stopMatch();
  const best = getMatchBest();
  matchEl().innerHTML = `
    <div class="match-panel theme-card border theme-border">
      <img src="./volleyball.png" alt="" class="match-ball-big" draggable="false">
      <div class="text-lg font-extrabold">카드 짝맞추기</div>
      <p class="text-sm theme-sub-text">영어 카드와 뜻 카드를 짝지어요.<br>처음 3초 동안 앞면을 보여 줘요. 제한 시간 ${MATCH_TIME}초</p>
      ${best !== null ? `<p class="text-sm font-bold theme-primary-text">최고 기록 ${best}쌍</p>` : ""}
      <button id="btn-match-go" class="w-full py-4 rounded-2xl theme-primary-bg text-white font-extrabold text-base shadow-lg active:scale-95 transition">시작!</button>
    </div>`;
  document.getElementById("btn-match-go").onclick = startMatch;
}

function startMatch() {
  stopMatch();
  matchSlots = [];
  matchQueue = [];
  matchOpen = [];
  matchFound = 0;
  matchMiss = 0;
  matchSinceRefill = 0;
  matchLeft = MATCH_TIME;
  matchSlots = matchNewCards(matchBoardPairs()).map(c => ({ ...c, up: true }));
  matchBusy = true;
  matchEl().innerHTML = `
    <div class="match-stats">
      <div class="match-timer theme-card border theme-border" id="match-timer"><i id="match-bar"></i></div>
      <span class="match-sec theme-sub-text" id="match-sec">${MATCH_TIME}</span>
    </div>
    <div class="match-score theme-sub-text">
      <span>찾은 짝 <b id="match-found">0</b></span>
      <span>틀림 <b id="match-miss">0</b></span>
      <span>최고 <b id="match-best">${getMatchBest() ?? "-"}</b></span>
    </div>
    <div class="match-board" id="match-board"></div>
    <p class="match-msg theme-sub-text" id="match-msg"><b class="theme-primary-text">3초</b> 동안 잘 봐 두세요</p>`;
  document.getElementById("match-board").onclick = onMatchTap;
  renderMatchBoard();
  matchLater(() => {
    matchSlots.forEach(c => { c.up = false; });
    matchBusy = false;
    document.getElementById("match-msg").textContent = "";
    renderMatchBoard();
    startMatchTimer();
  }, MATCH_PREVIEW_MS);
}

function startMatchTimer() {
  const t0 = Date.now();
  matchTimer = setInterval(() => {
    // 다른 화면으로 가면 조용히 멈춤
    if (!matchEl().offsetParent) { stopMatch(); return; }
    matchLeft = Math.max(0, MATCH_TIME - (Date.now() - t0) / 1000);
    document.getElementById("match-sec").textContent = Math.ceil(matchLeft);
    document.getElementById("match-bar").style.transform = `scaleX(${matchLeft / MATCH_TIME})`;
    document.getElementById("match-timer").classList.toggle("low", matchLeft <= 15);
    if (matchLeft <= 0) finishMatch();
  }, 200);
}

function renderMatchBoard() {
  document.getElementById("match-board").innerHTML = matchSlots.map((c, i) => {
    const item = studyWords[c.w];
    const cls = ["match-card", c.up && "up", c.ok && "ok", c.no && "no", c.gone && "gone", c.isNew && "new"].filter(Boolean).join(" ");
    const front = c.en
      ? `<small>EN</small><span class="match-en">${item.word}</span>`
      : `<small>뜻</small><span class="match-ko theme-primary-text">${item.meaning}</span>`;
    return `<button type="button" class="${cls}" data-i="${i}" aria-label="${c.up ? (c.en ? item.word : item.meaning) : "뒤집힌 카드"}">
      <span class="match-in"><span class="match-face match-back theme-primary-bg"><img src="./volleyball.png" alt="" draggable="false"></span><span class="match-face match-front theme-card border theme-border">${front}</span></span>
    </button>`;
  }).join("");
  document.getElementById("match-found").textContent = matchFound;
  document.getElementById("match-miss").textContent = matchMiss;
}

function onMatchTap(e) {
  const b = e.target.closest(".match-card");
  if (!b || matchBusy) return;
  const c = matchSlots[b.dataset.i];
  if (c.up || c.gone) return;
  c.up = true;
  matchOpen.push(c);
  if (c.en) playTTS(studyWords[c.w].word);
  renderMatchBoard();
  if (matchOpen.length < 2) return;

  const [a, d] = matchOpen;
  matchOpen = [];
  matchBusy = true;
  if (a.w === d.w && a.en !== d.en) {
    a.ok = d.ok = true;
    matchFound++;
    matchSinceRefill++;
    renderMatchBoard();
    matchLater(() => {
      a.gone = d.gone = true;
      a.ok = d.ok = false;
      matchBusy = false;
      renderMatchBoard();
      const refillAt = matchBoardPairs() === 6 ? 3 : matchBoardPairs();
      if (matchSinceRefill === refillAt && matchLeft > 0) {
        matchSinceRefill = 0;
        refillMatch();
      }
    }, 450);
  } else {
    a.no = d.no = true;
    matchMiss++;
    renderMatchBoard();
    matchLater(() => {
      a.up = d.up = a.no = d.no = false;
      matchBusy = false;
      renderMatchBoard();
    }, 800);
  }
}

// 빈칸에 새 카드를 섞어 넣고 잠깐 보여 줌
function refillMatch() {
  const empty = matchSlots.map((c, i) => (c.gone ? i : -1)).filter(i => i >= 0);
  const cards = matchNewCards(empty.length / 2);
  empty.forEach((i, k) => { matchSlots[i] = { ...cards[k], up: true, isNew: true }; });
  matchBusy = true;
  document.getElementById("match-msg").textContent = `새 카드 ${empty.length / 2}쌍!`;
  renderMatchBoard();
  matchLater(() => {
    matchSlots.forEach(c => { if (c.isNew) { c.up = false; c.isNew = false; } });
    matchBusy = false;
    document.getElementById("match-msg").textContent = "";
    renderMatchBoard();
  }, MATCH_NEWPEEK_MS);
}

function finishMatch() {
  stopMatch();
  const best = getMatchBest();
  const isBest = matchFound > 0 && (best === null || matchFound > best);
  if (isBest) setMatchBest(matchFound);
  matchEl().innerHTML = `
    <div class="match-panel theme-card border theme-border">
      <p class="text-sm theme-sub-text">${MATCH_TIME}초 동안 찾은 짝</p>
      <div class="match-big theme-primary-text">${matchFound}</div>
      <p class="text-sm theme-sub-text">틀림 ${matchMiss}번 · ${isBest ? "<b class='theme-primary-text'>최고 기록!</b>" : `최고 기록 ${best ?? 0}쌍`}</p>
      <button id="btn-match-again" class="w-full py-4 rounded-2xl theme-primary-bg text-white font-extrabold text-base shadow-lg active:scale-95 transition">다시 하기</button>
      <button id="btn-match-back" class="w-full py-3.5 rounded-2xl theme-card border theme-border theme-primary-text font-extrabold text-sm active:scale-95 transition">카드형으로 단어 보기</button>
    </div>`;
  document.getElementById("btn-match-again").onclick = startMatch;
  document.getElementById("btn-match-back").onclick = () => setStudyMode("card");
}
