// ==========================================================
// challenge.js : 데일리 챌린지 (앱을 열면 처음 보이는 화면)
//  - 이달의 퍼즐(7칸 × 5줄 = 35조각)과 달력
//  - 날짜 칸 채우기 → 조각 고르기 → 퍼즐 크게 보기 · 이미지 보기
// 그림 파일: 저장소 맨 위에 puzzle-연도-월.jpg 이름으로 올리면 자동 적용
//   (예: puzzle-2026-11.jpg / 확장자는 jpg, jpeg, png, webp 중 하나, 소문자)
// 저장 데이터는 state.challenge (app.js 의 normalizeChallenge 참고)
// 챌린지를 시작한 달에 한 번, 지금까지 끝낸 Day만큼 지난 칸을 채워 줌 (runChallengeCatchUp)
// ==========================================================

const PUZZLE_COLS = 7;
const PUZZLE_ROWS = 5;
const PUZZLE_TILES = PUZZLE_COLS * PUZZLE_ROWS;   // 35
const PUZZLE_EXTS = ["jpg", "jpeg", "png", "webp"];
const PUZZLE_MAIN_MAX_HEIGHT = 260;               // 챌린지 화면 퍼즐의 최대 높이(px)

// 그 달 그림이 아직 없을 때 보여 줄 기본 풍경 (7:5)
const FALLBACK_PUZZLE = {
  src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 500">' +
    '<rect width="700" height="500" fill="#8fd0f5"/><circle cx="560" cy="115" r="60" fill="#ffd166"/>' +
    '<path d="M0 340 L160 185 L300 320 L440 165 L700 350 L700 500 L0 500Z" fill="#5aa9e6"/>' +
    '<path d="M0 400 L200 300 L390 390 L550 315 L700 380 L700 500 L0 500Z" fill="#3d8bd4"/>' +
    '<rect y="430" width="700" height="70" fill="#f4d58d"/></svg>'),
  w: 700, h: 500
};

let challengeView = null;     // 챌린지 화면에 보이는 달 {y, m}
let challengeBlink = false;   // "밀린 공부 하러 가기!"를 눌러 빈칸을 반짝이는 중
let puzzleMonth = null;       // 퍼즐 크게 보기 화면의 달 ("2026-10")
let puzzleJustOpened = -1;    // 방금 연 조각 번호 (표시용)
let lastCreditMonth = null;   // 결과 화면 "조각 열기!"가 열 달
let catchUpNotice = null;     // 방금 정산으로 채운 칸 수 (조각 고르기 화면 안내용)
const puzzleImageCache = {};

// ---------- 날짜 계산 ----------
function pad2(n) { return String(n).padStart(2, "0"); }
function dateKeyOf(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }
function monthKeyOf(y, m) { return `${y}-${pad2(m)}`; }
function parseDateKey(k) { const [y, m, d] = k.split("-").map(Number); return { y, m, d }; }
function todayParts() { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() }; }
function todayKey() { const t = todayParts(); return dateKeyOf(t.y, t.m, t.d); }
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function monthDiff(a, b) { return (a.y - b.y) * 12 + (a.m - b.m); }

// 보너스 날짜: (35 - 그달 날짜 수)개, 간격 = 날짜 수 ÷ 보너스 개수(버림)
// 31일 → 7,14,21,28 / 30일 → 6,12,18,24,30 / 29일 → 4~24 / 28일 → 4~28
function bonusDays(n) {
  const count = PUZZLE_TILES - n;
  const step = Math.floor(n / count);
  const days = new Set();
  for (let i = 1; i <= count; i++) days.add(i * step);
  return days;
}
function tilesForDate(y, m, d) { return bonusDays(daysInMonth(y, m)).has(d) ? 2 : 1; }

function ensureChallengeStart() {
  if (!state.challenge.startMonth) {
    const t = todayParts();
    state.challenge.startMonth = monthKeyOf(t.y, t.m);
    saveState();
  }
}
function challengeStart() { const [y, m] = state.challenge.startMonth.split("-").map(Number); return { y, m }; }

// 그 달에서 아직 못 채운 지난 날짜 (오늘 제외)
function missedDays(v) {
  const t = todayParts();
  const isNow = v.y === t.y && v.m === t.m;
  const last = isNow ? t.d - 1 : daysInMonth(v.y, v.m);
  const result = [];
  for (let d = 1; d <= last; d++) {
    if (!state.challenge.days[dateKeyOf(v.y, v.m, d)]) result.push(d);
  }
  return result;
}

// 시작한 달부터 이번 달까지, 밀린 날짜가 있는 달 목록 (최근 달이 먼저)
function monthsWithMissed() {
  const t = todayParts();
  const start = challengeStart();
  const list = [];
  let v = { y: t.y, m: t.m };
  while (monthDiff(v, start) >= 0) {
    if (missedDays(v).length > 0) list.push({ ...v });
    v = v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 };
  }
  return list;
}

// 지금 채우는 중인 날짜 (없거나 이미 채웠거나 미래면 null → 오늘 기준)
function getChallengeFillingKey() {
  const f = state.challenge.filling;
  if (!f || state.challenge.days[f] || f > todayKey()) return null;
  return f;
}

// ---------- 칸 채우기 (result.js 에서 호출) ----------
// Day 테스트를 처음 100% 통과했고(복습 아님), 같은 Day의 반대 모드도 이미 클리어였다면
// "채우는 날짜"(없으면 오늘)의 칸을 채우고 열 수 있는 조각을 준다.
function challengeCreditForDay(level, group, day, wasCleared) {
  if (wasCleared) return null;
  const otherMode = state.mode === "en-ko" ? "ko-en" : "en-ko";
  if (!state.clearedDays[getClearKey(otherMode, level, group, day)]) return null;

  ensureChallengeStart();
  const c = state.challenge;
  const target = getChallengeFillingKey() || todayKey();
  if (c.days[target]) return null;   // 오늘 칸도 이미 채움

  c.days[target] = true;
  logToday().ch.push(target);
  const { y, m, d } = parseDateKey(target);
  const mk = monthKeyOf(y, m);
  const earned = tilesForDate(y, m, d);
  const remaining = PUZZLE_TILES - (c.tiles[mk] || []).length - (c.pending[mk] || 0);
  const give = Math.max(0, Math.min(earned, remaining));
  if (give > 0) c.pending[mk] = (c.pending[mk] || 0) + give;
  c.filling = null;   // 채운 뒤에는 다시 오늘 기준
  saveState();
  return { y, m, d, mk, count: give, bonus: earned === 2 };
}

// ---------- 지난 진도 한 번 정산 ----------
// 챌린지를 시작한 달에 딱 한 번: 영→한·한→영을 모두 끝낸 Day 수만큼
// 1일부터 차례로 지난 칸을 채움 (오늘 칸은 제외, 이미 채운 칸 수만큼은 뺌)
function countDaysClearedBothModes() {
  let count = 0;
  Object.keys(state.clearedDays).forEach(key => {
    if (!state.clearedDays[key] || !key.startsWith("en-ko_")) return;
    if (state.clearedDays["ko-en_" + key.slice("en-ko_".length)]) count++;
  });
  return count;
}

function runChallengeCatchUp() {
  const c = state.challenge;
  if (c.catchUpDone) return;
  ensureChallengeStart();
  c.catchUpDone = true;   // 결과와 상관없이 한 번만

  const t = todayParts();
  if (c.startMonth !== monthKeyOf(t.y, t.m)) { saveState(); return; }

  // 업데이트 뒤 공부로 이미 채운 칸은 그 Day가 이미 센 것이므로 뺌
  const alreadyFilled = Object.keys(c.days).filter(k => c.days[k]).length;
  let credits = Math.max(0, countDaysClearedBothModes() - alreadyFilled);
  const mk = monthKeyOf(t.y, t.m);
  let filled = 0;
  for (let d = 1; d < t.d && credits > 0; d++) {
    const key = dateKeyOf(t.y, t.m, d);
    if (c.days[key]) continue;
    c.days[key] = true;
    const remaining = PUZZLE_TILES - (c.tiles[mk] || []).length - (c.pending[mk] || 0);
    const give = Math.max(0, Math.min(tilesForDate(t.y, t.m, d), remaining));
    if (give > 0) c.pending[mk] = (c.pending[mk] || 0) + give;
    credits--;
    filled++;
  }
  if (filled > 0) catchUpNotice = { m: t.m, days: filled };
  saveState();
}

// ---------- 퍼즐 그림 불러오기 ----------
function loadPuzzleImage(mk, done) {
  if (puzzleImageCache[mk]) { done(puzzleImageCache[mk]); return; }
  let i = 0;
  const tryNext = () => {
    if (i >= PUZZLE_EXTS.length) { puzzleImageCache[mk] = FALLBACK_PUZZLE; done(FALLBACK_PUZZLE); return; }
    const src = `./puzzle-${mk}.${PUZZLE_EXTS[i++]}`;
    const img = new Image();
    img.onload = () => {
      puzzleImageCache[mk] = { src, w: img.naturalWidth || 7, h: img.naturalHeight || 5 };
      done(puzzleImageCache[mk]);
    };
    img.onerror = tryNext;
    img.src = src;
  };
  tryNext();
}

// 퍼즐 판 그리기: 판은 그림 비율 그대로, maxHeight를 넘으면 비율 유지한 채 줄임
function renderPuzzleBoard(container, mk, { maxHeight, picking = false, highlight = false }) {
  container.dataset.month = mk;
  loadPuzzleImage(mk, (img) => {
    if (container.dataset.month !== mk) return;   // 그사이 다른 달로 바뀜
    const opened = new Set(state.challenge.tiles[mk] || []);
    container.style.aspectRatio = `${img.w} / ${img.h}`;
    container.style.width = `min(100%, ${Math.floor(maxHeight * img.w / img.h)}px)`;
    container.innerHTML = "";

    const picture = document.createElement("img");
    picture.src = img.src;
    picture.alt = "";
    picture.draggable = false;
    picture.className = "absolute inset-0 w-full h-full";
    container.appendChild(picture);

    const grid = document.createElement("div");
    grid.className = "absolute inset-0 grid";
    grid.style.gridTemplateColumns = `repeat(${PUZZLE_COLS}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${PUZZLE_ROWS}, 1fr)`;
    for (let i = 0; i < PUZZLE_TILES; i++) {
      const tile = document.createElement("div");
      if (opened.has(i)) {
        // 열린 조각에는 선을 그리지 않음 → 붙은 조각끼리는 한 장의 그림처럼 이어짐
        if (highlight && i === puzzleJustOpened) tile.style.boxShadow = "inset 0 0 0 3px var(--primary)";
      } else {
        tile.className = `bg-gray-200 dark:bg-gray-800 border theme-border flex items-center justify-center theme-sub-text${picking ? " puzzle-pick" : ""}`;
        tile.innerHTML = '<i class="fa-solid fa-lock text-[10px]"></i>';
        if (picking) {
          tile.setAttribute("role", "button");
          tile.setAttribute("aria-label", `${i + 1}번 조각 열기`);
          tile.onclick = () => pickPuzzleTile(mk, i);
        }
      }
      grid.appendChild(tile);
    }
    container.appendChild(grid);
  });
}

// ---------- 챌린지 화면 ----------
function openChallenge() {
  runChallengeCatchUp();
  // 고르지 않은 조각이 남아 있으면 먼저 고르기 화면으로 (앱을 닫아도 조각이 사라지지 않게)
  const pendingMonth = Object.keys(state.challenge.pending).find(k => state.challenge.pending[k] > 0);
  if (pendingMonth) { openPuzzle(pendingMonth); return; }
  renderChallenge();
  switchView("view-challenge");
}

function renderChallenge() {
  ensureChallengeStart();
  const t = todayParts();
  if (!challengeView || monthDiff(challengeView, t) > 0) challengeView = { y: t.y, m: t.m };
  const v = challengeView;
  const mk = monthKeyOf(v.y, v.m);
  const c = state.challenge;
  const total = daysInMonth(v.y, v.m);
  const bonus = bonusDays(total);
  const isNow = v.y === t.y && v.m === t.m;
  const missed = missedDays(v);

  document.getElementById("challenge-title").textContent = `${v.m}월의 챌린지`;
  document.getElementById("challenge-count").textContent = `${(c.tiles[mk] || []).length}/${PUZZLE_TILES}`;
  document.getElementById("challenge-month-label").textContent = `${v.y}년 ${v.m}월`;
  document.getElementById("btn-challenge-prev").style.visibility = monthDiff(v, challengeStart()) > 0 ? "visible" : "hidden";
  document.getElementById("btn-challenge-next").style.visibility = isNow ? "hidden" : "visible";

  renderPuzzleBoard(document.getElementById("challenge-board"), mk, { maxHeight: PUZZLE_MAIN_MAX_HEIGHT });

  // 달력
  const cal = document.getElementById("challenge-calendar");
  cal.innerHTML = "";
  const firstWeekday = new Date(v.y, v.m - 1, 1).getDay();
  for (let i = 0; i < firstWeekday; i++) cal.appendChild(document.createElement("div"));

  const base = "h-9 rounded-xl flex items-center justify-center text-xs font-bold relative";
  for (let d = 1; d <= total; d++) {
    const key = dateKeyOf(v.y, v.m, d);
    const star = bonus.has(d) ? '<i class="fa-solid fa-star absolute top-0.5 right-1 text-[8px] theme-primary-text"></i>' : "";
    const isFuture = isNow && d > t.d;
    const isToday = isNow && d === t.d;
    let cell;
    if (isFuture) {
      cell = document.createElement("div");
      cell.className = `${base} bg-gray-200 dark:bg-gray-800 theme-sub-text`;
      cell.innerHTML = `<i class="fa-solid fa-lock text-[10px]"></i>${star}`;
    } else if (c.days[key]) {
      cell = document.createElement("div");
      cell.className = `${base} bg-emerald-500/15 text-emerald-600 dark:text-emerald-400`;
      cell.innerHTML = `<i class="fa-solid fa-circle-check text-base"></i>${star}`;
    } else {
      cell = document.createElement("button");
      cell.className = `${base} theme-card border ${isToday ? "border-2 theme-primary-text" : "theme-border"} active:scale-95 transition${challengeBlink && missed.includes(d) ? " challenge-blink" : ""}`;
      if (isToday) cell.style.borderColor = "var(--primary)";
      cell.innerHTML = `${isToday ? "오늘" : d}${star}`;
      cell.setAttribute("aria-label", `${v.m}월 ${d}일 채우기`);
      cell.onclick = () => startChallengeFilling(key);
    }
    cal.appendChild(cell);
  }

  // 아래 버튼
  const btn = document.getElementById("btn-challenge-main");
  const hint = document.getElementById("challenge-hint");
  const todayDone = !!c.days[todayKey()];
  const missedMonths = monthsWithMissed();
  hint.textContent = challengeBlink && missedMonths.length > 0 ? "반짝이는 칸 중에서 채울 날짜를 골라요" : "";

  if (!todayDone) {
    btn.textContent = "오늘의 공부!";
    btn.className = "w-full py-4 rounded-2xl theme-primary-bg text-white font-extrabold text-base shadow-lg active:scale-95 transition";
    btn.onclick = () => startChallengeFilling(todayKey());
  } else if (missedMonths.length > 0) {
    btn.textContent = "밀린 공부 하러 가기!";
    btn.className = "w-full py-4 rounded-2xl theme-primary-bg text-white font-extrabold text-base shadow-lg active:scale-95 transition";
    btn.onclick = () => {
      challengeBlink = true;
      if (missedDays(challengeView).length === 0) challengeView = { ...missedMonths[0] };
      renderChallenge();
    };
  } else {
    btn.textContent = "오늘 공부 완료! 내일 새 조각이 열려요";
    btn.className = "w-full py-4 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold text-sm";
    btn.onclick = null;
  }
}

// 날짜 칸(또는 "오늘의 공부!")을 누르면: 채울 날짜를 정하고 학습단계(Day 목록)로
function startChallengeFilling(dateKey) {
  state.challenge.filling = dateKey;
  challengeBlink = false;
  saveState();
  renderHome();
  switchView("view-home");
}

// ---------- 퍼즐 크게 보기 · 조각 고르기 ----------
function openPuzzle(mk) {
  puzzleMonth = mk;
  puzzleJustOpened = -1;
  renderPuzzleViewer();
  switchView("view-puzzle");
}

function renderPuzzleViewer() {
  const mk = puzzleMonth;
  const m = Number(mk.split("-")[1]);
  const pending = state.challenge.pending[mk] || 0;
  document.getElementById("puzzle-title").textContent = `${m}월의 퍼즐`;
  document.getElementById("puzzle-count").textContent = `${(state.challenge.tiles[mk] || []).length}/${PUZZLE_TILES}`;

  const msg = document.getElementById("puzzle-message");
  msg.className = `text-center text-sm font-extrabold mb-3${pending > 0 ? " theme-primary-text" : ""}`;
  msg.textContent = pending > 0 ? `열 조각을 골라요 (${pending}개)` : (puzzleJustOpened >= 0 ? "조각이 열렸어요!" : "그림을 감상해요");
  document.getElementById("puzzle-submessage").textContent = pending > 0
    ? (catchUpNotice ? `지금까지 공부한 만큼 ${catchUpNotice.m}월 1일부터 ${catchUpNotice.days}칸을 채웠어요! 잠긴 조각을 눌러요` : "잠긴 조각 중 하나를 눌러요")
    : "";
  if (pending === 0) catchUpNotice = null;

  renderPuzzleBoard(document.getElementById("puzzle-board-large"), mk, {
    maxHeight: Math.max(220, Math.round(window.innerHeight * 0.5)),
    picking: pending > 0,
    highlight: true
  });

  // 이전·다음 달 버튼: 챌린지 시작한 달 ~ 이번 달. 조각 고르는 중에는 숨김
  const v = { y: Number(mk.split("-")[0]), m }, t = todayParts(), busy = puzzlePicking();
  document.getElementById("btn-puzzle-prev").style.visibility = !busy && monthDiff(v, challengeStart()) > 0 ? "visible" : "hidden";
  document.getElementById("btn-puzzle-next").style.visibility = !busy && monthDiff(t, v) > 0 ? "visible" : "hidden";

  document.getElementById("btn-puzzle-back").classList.toggle("hidden", pending > 0);
  document.getElementById("puzzle-pick-lock").classList.toggle("hidden", pending === 0);
}

function pickPuzzleTile(mk, index) {
  const c = state.challenge;
  if (!(c.pending[mk] > 0)) return;
  const opened = c.tiles[mk] || (c.tiles[mk] = []);
  if (opened.includes(index)) return;
  opened.push(index);
  logToday().tl++;
  c.pending[mk] -= 1;
  if (c.pending[mk] <= 0) delete c.pending[mk];
  puzzleJustOpened = index;
  saveState();
  renderPuzzleViewer();
}

// 크게 보기에서 이전·다음 달로 (버튼, 스와이프). 챌린지 달력도 같은 달로 → 돌아가면 보던 달
function puzzlePicking() { return Object.values(state.challenge.pending).some(n => n > 0); }
function movePuzzleMonth(d) {
  if (puzzlePicking()) return;
  const [y, m] = puzzleMonth.split("-").map(Number);
  const v = m + d < 1 ? { y: y - 1, m: 12 } : m + d > 12 ? { y: y + 1, m: 1 } : { y, m: m + d };
  if (monthDiff(v, challengeStart()) < 0 || monthDiff(todayParts(), v) < 0) return;
  puzzleMonth = monthKeyOf(v.y, v.m);
  puzzleJustOpened = -1;
  challengeView = v;
  renderPuzzleViewer();
}

// ---------- 이미지 보기 (화면 전체, 비율 유지한 최대 크기) ----------
// 폰을 세워 들고 있는데 그림이 가로로 길면 90도 돌려서 더 크게 (화면 회전 잠금이 켜져 있어도 폰만 돌리면 크게 보임)
// 돌린 판도 화면 정가운데 (부모가 가운데 정렬, 돌리는 중심도 판의 가운데)
function renderPuzzleFullscreen() {
  const board = document.getElementById("puzzle-board-full");
  const W = window.innerWidth, H = window.innerHeight;
  loadPuzzleImage(puzzleMonth, (img) => {
    const rotate = img.w > img.h && H > W;
    renderPuzzleBoard(board, puzzleMonth, { maxHeight: rotate ? W - 16 : H });
    if (rotate) {
      // 돌리기 전 기준: 판 가로는 화면 세로까지, 판 세로는 화면 가로까지 (가장자리에 조금 여백)
      board.style.width = `${Math.floor(Math.min(H - 24, (W - 16) * img.w / img.h))}px`;
      board.style.flexShrink = "0";
      board.style.transform = "rotate(90deg)";
    } else {
      board.style.flexShrink = "";
      board.style.transform = "";
    }
  });
}
function openPuzzleFullscreen() {
  document.getElementById("puzzle-fullscreen").classList.remove("hidden");
  renderPuzzleFullscreen();
}
function closePuzzleFullscreen() {
  document.getElementById("puzzle-fullscreen").classList.add("hidden");
}

// 버튼 연결 (main.js에서 1번 호출)
function initChallengeScreen() {
  document.getElementById("btn-open-challenge").onclick = () => openChallenge();
  document.getElementById("btn-challenge-board").onclick = () => {
    openPuzzle(monthKeyOf(challengeView.y, challengeView.m));
  };
  document.getElementById("btn-challenge-prev").onclick = () => {
    challengeView = challengeView.m === 1 ? { y: challengeView.y - 1, m: 12 } : { y: challengeView.y, m: challengeView.m - 1 };
    renderChallenge();
  };
  document.getElementById("btn-challenge-next").onclick = () => {
    challengeView = challengeView.m === 12 ? { y: challengeView.y + 1, m: 1 } : { y: challengeView.y, m: challengeView.m + 1 };
    renderChallenge();
  };
  document.getElementById("btn-challenge-categories").onclick = () => {
    renderCategoryView();
    switchView("view-categories");
  };

  document.getElementById("btn-puzzle-back").onclick = () => openChallenge();
  document.getElementById("btn-puzzle-prev").onclick = () => movePuzzleMonth(-1);
  document.getElementById("btn-puzzle-next").onclick = () => movePuzzleMonth(1);
  // 퍼즐 판을 왼쪽으로 밀면 다음 달, 오른쪽으로 밀면 이전 달 (사진 앱과 같은 방향)
  const swipeArea = document.getElementById("puzzle-board-large").parentElement;
  let sx = null, sy = 0;
  swipeArea.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  swipeArea.addEventListener("touchend", (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) movePuzzleMonth(dx < 0 ? 1 : -1);
  }, { passive: true });
  document.getElementById("btn-puzzle-fullscreen").onclick = () => openPuzzleFullscreen();
  document.getElementById("btn-puzzle-fullscreen-close").onclick = () => closePuzzleFullscreen();

  // 폰을 돌리면 이미지 보기를 새 화면 크기에 맞게 다시 그림
  window.addEventListener("resize", () => {
    if (!document.getElementById("puzzle-fullscreen").classList.contains("hidden")) renderPuzzleFullscreen();
  });
}
