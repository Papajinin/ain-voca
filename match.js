// ==========================================================
// match.js : 단어학습 화면의 "짝맞추기" 탭 (카드 뒤집기 게임)
// - 그 Stage 단어로 영어 카드와 뜻 카드를 짝지음. 판은 6쌍(12장), 10단어 이하 Stage는 5쌍(10장). 90초
//   (10단어에 6쌍이면 판마다 단어가 너무 많이 겹쳐서)
// - 판마다 가장 오래 안 나온 단어부터 고름 (같으면 무작위)
// - 판마다 12장을 3초 동안 보여 주고 뒤집음. 시간은 멈추지 않음
// - 5쌍을 찾으면 그 판은 끝(마지막 2장은 저절로 알게 되므로). 남은 1쌍은 짝으로 세지 않고
//   다음 판에 꼭 들어감 → 남은 단어 + 새 단어 5개로 새 판
// - 진도·챌린지·오답노트에는 반영하지 않음. Stage별 최고 기록은 따로 저장하고
//   텍스트 백업·클라우드에 함께 담음 (합칠 때는 Stage마다 높은 기록을 남김)
// ==========================================================

const MATCH_TIME = 90;          // 제한 시간(초)
const MATCH_PREVIEW_MS = 3000;  // 판마다 앞면 보여 주는 시간
const MATCH_BEST_KEY = "AIN_VOCA_MATCH_BEST"; // 진도 저장(AIN_ENG_APP_V2)과 따로

let matchSlots = [];
let matchSeen = {};   // 단어마다 마지막으로 나온 판 번호
let matchDeals = 0;   // 지금까지 깐 판 수
let matchOpen = [];
let matchBusy = false;
let matchFound = 0;
let matchMiss = 0;
let matchRounds = 0; // 깬 판 수
let matchTimer = null;
let matchLeft = MATCH_TIME;
let matchTimeouts = [];

function matchEl() { return document.getElementById("study-area-match"); }

function matchBestKey() {
  return `${state.selectedLevel}|${state.selectedPosGroup}|${state.wordsPerDay}|${currentStudyDay}`;
}
function getMatchBest() {
  return loadMatchBestAll()[matchBestKey()] ?? null;
}
function setMatchBest(n) {
  const all = loadMatchBestAll();
  all[matchBestKey()] = n;
  try { localStorage.setItem(MATCH_BEST_KEY, JSON.stringify(all)); } catch (e) {}
  if (typeof onMatchBestSaved === "function") onMatchBestSaved(); // 클라우드 자동 저장 (sync.js)
}

// 최고 기록 전체 { "A1|noun|10|3": 12, ... } — 텍스트 백업·클라우드에도 함께 담음
function loadMatchBestAll() {
  try {
    const all = JSON.parse(localStorage.getItem(MATCH_BEST_KEY) || "{}");
    return all && typeof all === "object" && !Array.isArray(all) ? all : {};
  } catch (e) { return {}; }
}

// 백업·클라우드에서 받은 기록을 합침: Stage마다 더 높은 기록을 남김 (이상한 값은 버림)
function mergeMatchBest(other) {
  if (!other || typeof other !== "object" || Array.isArray(other)) return;
  const all = loadMatchBestAll();
  let changed = false;
  Object.keys(other).forEach(k => {
    const n = other[k];
    if (!Number.isInteger(n) || n <= 0) return;
    if (all[k] === undefined || n > all[k]) { all[k] = n; changed = true; }
  });
  if (changed) try { localStorage.setItem(MATCH_BEST_KEY, JSON.stringify(all)); } catch (e) {}
}

// 이 기기에만 있거나 더 높은 기록이 있는지 (있으면 클라우드에 올려야 함)
function hasMatchBestBeyond(other) {
  const o = other && typeof other === "object" ? other : {};
  const all = loadMatchBestAll();
  return Object.keys(all).some(k => Number.isInteger(all[k]) && all[k] > 0 && !(o[k] >= all[k]));
}

function matchBoardPairs() { return studyWords.length <= 10 ? Math.min(5, studyWords.length) : 6; }

// 새 판: 지난 판에 남은 단어(carry)를 먼저 넣고, 나머지는 가장 오래 안 나온 단어부터
function matchNewBoard(carry) {
  matchDeals++;
  const words = carry === undefined ? [] : [carry];
  const rest = randomShuffle(studyWords.map((_, k) => k).filter(k => k !== carry))
    .sort((a, b) => (matchSeen[a] ?? 0) - (matchSeen[b] ?? 0)); // 섞은 뒤 정렬: 같은 순위끼리는 무작위
  while (words.length < matchBoardPairs()) words.push(rest.shift());
  words.forEach(w => { matchSeen[w] = matchDeals; });
  return randomShuffle(words.flatMap(w => [{ w, en: true }, { w, en: false }]));
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
      <p class="text-sm theme-sub-text">영어 카드와 뜻 카드를 짝지어요.<br>판마다 3초 동안 앞면을 보여 줘요. 제한 시간 ${MATCH_TIME}초</p>
      ${best !== null ? `<p class="text-sm font-bold theme-primary-text">최고 기록 ${best}쌍</p>` : ""}
      <button id="btn-match-go" class="w-full py-4 rounded-2xl theme-primary-bg text-white font-extrabold text-base shadow-lg active:scale-95 transition">시작!</button>
    </div>`;
  document.getElementById("btn-match-go").onclick = startMatch;
}

function startMatch() {
  stopMatch();
  matchSlots = [];
  matchSeen = {};
  matchDeals = 0;
  matchOpen = [];
  matchFound = 0;
  matchMiss = 0;
  matchRounds = 0;
  matchLeft = MATCH_TIME;
  matchEl().innerHTML = `
    <div class="match-stats">
      <div class="match-timer theme-card border theme-border" id="match-timer"><i id="match-bar"></i></div>
      <span class="match-sec theme-sub-text" id="match-sec">${MATCH_TIME}</span>
    </div>
    <div class="match-score theme-sub-text">
      <span>찾은 짝 <b id="match-found">0</b></span>
      <span>판 <b id="match-rounds">0</b></span>
      <span>틀림 <b id="match-miss">0</b></span>
      <span>최고 <b id="match-best">${getMatchBest() ?? "-"}</b></span>
    </div>
    <div class="match-board${matchBoardPairs() === 5 ? " five" : ""}" id="match-board"></div>
    <p class="match-msg theme-sub-text" id="match-msg"></p>`;
  document.getElementById("match-board").onclick = onMatchTap;
  dealMatch(undefined, true);
}

// 판 깔기: 12장을 3초 보여 주고 뒤집음. 첫 판이 뒤집힐 때 시간이 흐르기 시작
function dealMatch(carry, first) {
  matchSlots = matchNewBoard(carry).map(c => ({ ...c, up: true }));
  matchOpen = [];
  matchBusy = true;
  document.getElementById("match-msg").innerHTML = first
    ? `<b class="theme-primary-text">3초</b> 동안 잘 봐 두세요`
    : `<b class="theme-primary-text">새 판!</b> 3초 동안 잘 봐 두세요`;
  renderMatchBoard();
  matchLater(() => {
    matchSlots.forEach(c => { c.up = false; });
    matchBusy = false;
    document.getElementById("match-msg").textContent = "";
    renderMatchBoard();
    if (first) startMatchTimer();
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
  document.getElementById("match-rounds").textContent = matchRounds;
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
    renderMatchBoard();
    matchLater(() => {
      a.gone = d.gone = true;
      a.ok = d.ok = false;
      matchBusy = false;
      renderMatchBoard();
      // 남은 짝이 1쌍(판이 1쌍뿐이면 0쌍)이면 판 끝. 남은 단어는 다음 판으로
      const left = matchSlots.filter(c => !c.gone && c.en).map(c => c.w);
      if (left.length <= (matchBoardPairs() > 1 ? 1 : 0) && matchLeft > 0) {
        matchRounds++;
        dealMatch(left[0], false);
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

function finishMatch() {
  stopMatch();
  const best = getMatchBest();
  const isBest = matchFound > 0 && (best === null || matchFound > best);
  if (isBest) setMatchBest(matchFound);
  matchEl().innerHTML = `
    <div class="match-panel theme-card border theme-border">
      <p class="text-sm theme-sub-text">${MATCH_TIME}초 동안 찾은 짝</p>
      <div class="match-big theme-primary-text">${matchFound}</div>
      <p class="text-sm theme-sub-text">깬 판 ${matchRounds} · 틀림 ${matchMiss}번 · ${isBest ? "<b class='theme-primary-text'>최고 기록!</b>" : `최고 기록 ${best ?? 0}쌍`}</p>
      <button id="btn-match-again" class="w-full py-4 rounded-2xl theme-primary-bg text-white font-extrabold text-base shadow-lg active:scale-95 transition">다시 하기</button>
      <button id="btn-match-back" class="w-full py-3.5 rounded-2xl theme-card border theme-border theme-primary-text font-extrabold text-sm active:scale-95 transition">카드형으로 단어 보기</button>
    </div>`;
  document.getElementById("btn-match-again").onclick = startMatch;
  document.getElementById("btn-match-back").onclick = () => setStudyMode("card");
}
