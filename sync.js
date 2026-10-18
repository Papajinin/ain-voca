// ==========================================================
// sync.js : 클라우드 자동 저장 (Firebase 구글 로그인 + Firestore)
//  - 설정 화면의 "자동 저장 (클라우드)" 칸
//  - 로그인하면: 앱을 열 때 클라우드와 맞추고, 진도가 바뀔 때마다 몇 초 뒤 자동 저장
//  - 폰에도 예전처럼 저장(localStorage)하므로 로그인하지 않아도, 인터넷이 끊겨도 앱은 그대로 동작
//  - 클라우드 위치: users/{로그인한 사람 uid} 문서 하나 (state 를 글자로 통째로 저장)
//  - 누가 쓸 수 있는지는 Firebase 관리 화면의 Firestore "규칙"에서 정합니다 (이메일 목록)
// 저장 키 AIN_ENG_SYNC_META 는 "마지막으로 맞춘 시각" 같은 기록용이며 진도(state)와 별개입니다.
// ==========================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB__KSCE69_SJVvMuQJyw2Tq29xVXKP_XA",
  authDomain: "ain-word.firebaseapp.com",
  projectId: "ain-word",
  storageBucket: "ain-word.firebasestorage.app",
  messagingSenderId: "188536319141",
  appId: "1:188536319141:web:46ec7cae27d036a618f14c"
};

const SYNC_META_KEY = "AIN_ENG_SYNC_META";
const CLOUD_SAVE_DELAY = 2000;          // 진도가 바뀐 뒤 클라우드에 보내기까지 (ms)
const SYNC_EXCLUDE = ["ttsVoice"];      // 기기마다 다른 값은 올리지 않음 (목소리 이름은 기기마다 다름)

let cloudAuth = null;
let cloudDb = null;
let cloudUser = null;
let cloudReady = false;      // 앱을 연 뒤 클라우드와 맞추기가 끝났는지 (끝나야 자동 저장 시작)
let cloudChecking = false;
let cloudTimer = null;
let cloudStatus = "off";     // off | checking | pending | saving | saved | error | offline | choosing
let cloudErrorText = "";
let pendingCloudChoice = null;

// ---------- 기록(meta) ----------
function loadSyncMeta() {
  try { return JSON.parse(localStorage.getItem(SYNC_META_KEY)) || {}; } catch (e) { return {}; }
}
function saveSyncMeta(m) {
  try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(m)); } catch (e) { console.warn(e); }
}

// ---------- 도우미 ----------
function cloudPayloadState() {
  const copy = JSON.parse(JSON.stringify(state));
  SYNC_EXCLUDE.forEach(k => delete copy[k]);
  return copy;
}

// 키 순서와 상관없이 같은 내용인지 비교하려고 키를 정렬해서 글자로 만듦
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

function progressSummary(s) {
  const cleared = Object.values(s.clearedDays || {}).filter(Boolean).length;
  const tiles = Object.values((s.challenge && s.challenge.tiles) || {})
    .reduce((sum, t) => sum + (Array.isArray(t) ? t.length : 0), 0);
  const notes = Array.isArray(s.notebook) ? s.notebook.length : 0;
  return { cleared, tiles, notes };
}

function hasProgress(s) {
  const p = progressSummary(s);
  const days = Object.keys((s.challenge && s.challenge.days) || {}).length;
  return p.cleared > 0 || p.tiles > 0 || p.notes > 0 || days > 0;
}

function summaryText(s) {
  const p = progressSummary(s);
  return `클리어 기록 ${p.cleared}개 · 퍼즐 조각 ${p.tiles}개 · 오답노트 ${p.notes}개`;
}

function formatCloudTime(ms) {
  const d = new Date(ms);
  const h = d.getHours();
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  const t = new Date();
  const sameDay = d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  return `${sameDay ? "오늘" : `${d.getMonth() + 1}월 ${d.getDate()}일`} ${ampm} ${h12}:${mm}`;
}

function cloudErrorMessage(err) {
  const code = (err && err.code) || "";
  if (code === "permission-denied") return "이 계정은 저장 권한이 없어요. Firebase 규칙의 이메일 목록을 확인해 주세요.";
  if (code === "unavailable" || navigator.onLine === false) return "인터넷에 연결되면 다시 저장할게요.";
  if (code === "auth/unauthorized-domain") return "이 주소가 Firebase의 승인된 도메인에 없어요.";
  if (code === "auth/network-request-failed") return "인터넷 연결을 확인해 주세요.";
  return `문제가 생겼어요 (${code || "알 수 없음"})`;
}

// ---------- 상태 표시 (설정 화면) ----------
function setCloudStatus(status, err) {
  cloudStatus = status;
  cloudErrorText = err ? cloudErrorMessage(err) : "";
  renderCloudStatus();
}

function renderCloudStatus() {
  const outBox = document.getElementById("cloud-logged-out");
  const inBox = document.getElementById("cloud-logged-in");
  if (!outBox || !inBox) return;
  outBox.classList.toggle("hidden", !!cloudUser);
  inBox.classList.toggle("hidden", !cloudUser);
  if (!cloudUser) return;

  document.getElementById("txt-cloud-email").textContent = cloudUser.email || "";

  const labels = {
    checking: "확인 중", pending: "저장 대기", saving: "저장 중", saved: "저장됨",
    error: "저장 안 됨", offline: "연결 안 됨", choosing: "선택 필요", off: "확인 중"
  };
  const badge = document.getElementById("cloud-status-badge");
  badge.textContent = labels[cloudStatus] || "";
  const base = "shrink-0 text-[10px] px-2 py-0.5 rounded font-bold";
  if (cloudStatus === "saved") {
    badge.className = `${base} bg-emerald-500/10 text-emerald-700 dark:text-emerald-400`;
  } else if (cloudStatus === "error" || cloudStatus === "offline") {
    badge.className = `${base} bg-rose-500/10 text-rose-700 dark:text-rose-400`;
  } else {
    badge.className = `${base} theme-badge`;
  }

  const m = loadSyncMeta();
  document.getElementById("txt-cloud-last-saved").textContent =
    m.lastSavedAt && m.uid === cloudUser.uid ? `마지막 저장: ${formatCloudTime(m.lastSavedAt)}` : "마지막 저장: 아직 없음";

  const errEl = document.getElementById("txt-cloud-error");
  errEl.textContent = cloudErrorText;
  errEl.classList.toggle("hidden", !cloudErrorText);
}

function showLoginError(textOrErr) {
  const el = document.getElementById("txt-cloud-login-error");
  if (!el) return;
  el.textContent = typeof textOrErr === "string" ? textOrErr : `로그인하지 못했어요. ${cloudErrorMessage(textOrErr)}`;
  el.classList.remove("hidden");
}

// ---------- 자동 저장 ----------
// app.js 의 saveState() 가 폰에 저장할 때마다 부릅니다
function onLocalStateSaved() {
  const m = loadSyncMeta();
  if (!m.dirty) { m.dirty = true; saveSyncMeta(m); }
  if (!cloudUser || !cloudReady) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(uploadCloudState, CLOUD_SAVE_DELAY);
  setCloudStatus("pending");
}

function uploadCloudState() {
  clearTimeout(cloudTimer);
  cloudTimer = null;
  if (!cloudUser || !cloudReady || !cloudDb) return Promise.resolve();
  const uid = cloudUser.uid;
  const now = Date.now();
  const payload = cloudPayloadState();
  setCloudStatus("saving");
  return cloudDb.collection("users").doc(uid).set({
    state: JSON.stringify(payload),
    clientUpdatedAt: now,
    summary: progressSummary(payload),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    const m = loadSyncMeta();
    m.uid = uid;
    m.lastSyncedAt = now;
    m.lastSavedAt = now;
    if (!cloudTimer) m.dirty = false;   // 저장하는 사이에 또 바뀌었으면 다음 저장을 위해 남겨 둠
    saveSyncMeta(m);
    setCloudStatus(cloudTimer ? "pending" : "saved");
  }).catch(err => {
    console.warn(err);
    setCloudStatus(err.code === "permission-denied" ? "error" : (navigator.onLine === false ? "offline" : "error"), err);
  });
}

// ---------- 앱을 열 때 클라우드와 맞추기 ----------
function runInitialCloudSync() {
  if (!cloudUser || !cloudDb || cloudChecking || cloudReady) return;
  cloudChecking = true;
  setCloudStatus("checking");
  const uid = cloudUser.uid;

  cloudDb.collection("users").doc(uid).get().then(doc => {
    cloudChecking = false;
    if (!cloudUser || cloudUser.uid !== uid) return;
    const m = loadSyncMeta();

    // 1) 클라우드가 비어 있음 → 이 폰의 진도를 처음으로 올림
    if (!doc.exists) { cloudReady = true; uploadCloudState(); return; }

    const data = doc.data() || {};
    let cloudState = null;
    try { cloudState = JSON.parse(data.state); } catch (e) { cloudState = null; }
    if (!cloudState || !isValidBackup(cloudState)) { cloudReady = true; uploadCloudState(); return; }
    const cloudAt = data.clientUpdatedAt || 0;

    // 2) 지난번에 이 폰에서 맞춘 뒤 클라우드가 그대로 → 폰에서 바뀐 게 있으면 올림
    if (m.uid === uid && m.lastSyncedAt === cloudAt) {
      cloudReady = true;
      if (m.dirty) { uploadCloudState(); return; }
      setCloudStatus("saved");
      return;
    }

    // 3) 내용이 똑같음 → 맞춘 것으로 기록만
    const local = cloudPayloadState();
    if (stableStringify(local) === stableStringify(cloudState)) {
      saveSyncMeta({ uid, lastSyncedAt: cloudAt, lastSavedAt: cloudAt, dirty: false });
      cloudReady = true;
      setCloudStatus("saved");
      return;
    }

    // 4) 폰에서 바뀐 게 없음(또는 이 폰에 진도가 없음) → 클라우드 진도를 가져옴
    const localChanged = m.uid === uid ? !!m.dirty : hasProgress(state);
    if (!localChanged) { applyCloudState(cloudState, cloudAt, uid); return; }

    // 5) 양쪽이 다름 → 어느 쪽을 쓸지 물어봄
    showCloudChoice(local, cloudState, cloudAt, uid);
  }).catch(err => {
    cloudChecking = false;
    console.warn(err);
    setCloudStatus(err.code === "permission-denied" ? "error" : "offline", err);
  });
}

// 클라우드 진도로 바꾸고 앱을 새로 엶 (목소리 설정은 이 기기 것 유지)
function applyCloudState(cloudState, cloudAt, uid) {
  const keepVoice = state.ttsVoice;
  state = { ...state, ...cloudState, ttsVoice: keepVoice };
  normalizeChallenge();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.warn(e); }
  saveSyncMeta({ uid, lastSyncedAt: cloudAt, lastSavedAt: cloudAt, dirty: false });
  location.reload();
}

function showCloudChoice(local, cloudState, cloudAt, uid) {
  pendingCloudChoice = { cloudState, cloudAt, uid };
  setCloudStatus("choosing");
  document.getElementById("txt-cloud-choice-local").textContent = summaryText(local);
  document.getElementById("txt-cloud-choice-cloud").textContent =
    `${summaryText(cloudState)}${cloudAt ? ` · ${formatCloudTime(cloudAt)} 저장` : ""}`;
  const open = () => document.getElementById("cloud-choice-modal").classList.remove("hidden");
  // 시작 화면이 아직 보이면 사라진 뒤에 띄움
  if (document.getElementById("app-splash")) setTimeout(open, 3000);
  else open();
}

function closeCloudChoice() {
  document.getElementById("cloud-choice-modal").classList.add("hidden");
}

// ---------- 로그인 / 로그아웃 ----------
function cloudLogin() {
  document.getElementById("txt-cloud-login-error").classList.add("hidden");
  if (!cloudAuth) {
    showLoginError("인터넷에 연결한 뒤 앱을 완전히 종료하고 다시 열어 주세요.");
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  cloudAuth.signInWithPopup(provider).catch(err => {
    // 팝업이 안 되는 환경(홈 화면 앱 등)이면 화면 이동 방식으로 다시 시도
    if (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment") {
      return cloudAuth.signInWithRedirect(provider).catch(showLoginError);
    }
    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return;
    console.warn(err);
    showLoginError(err);
  });
}

function cloudLogout() {
  if (!cloudAuth || !cloudUser) return;
  if (!window.confirm("로그아웃하면 자동 저장이 멈춰요.\n이 폰의 진도는 그대로 남아요. 로그아웃할까요?")) return;
  const flush = cloudTimer && cloudReady ? uploadCloudState() : Promise.resolve();
  flush.then(() => cloudAuth.signOut()).then(() => saveSyncMeta({}));
}

// ---------- 시작 (main.js에서 1번 호출) ----------
function initSync() {
  document.getElementById("btn-cloud-login").onclick = cloudLogin;
  document.getElementById("btn-cloud-logout").onclick = cloudLogout;
  document.getElementById("btn-cloud-save-now").onclick = () => {
    if (cloudReady) uploadCloudState();
    else runInitialCloudSync();
  };
  document.getElementById("btn-cloud-choose-local").onclick = () => {
    closeCloudChoice();
    pendingCloudChoice = null;
    cloudReady = true;
    uploadCloudState();
  };
  document.getElementById("btn-cloud-choose-cloud").onclick = () => {
    if (!pendingCloudChoice) return;
    if (!window.confirm("클라우드의 진도로 바꿀까요?\n이 폰의 진도는 사라져요.")) return;
    const c = pendingCloudChoice;
    pendingCloudChoice = null;
    closeCloudChoice();
    applyCloudState(c.cloudState, c.cloudAt, c.uid);
  };

  // 앱을 닫거나 다른 앱으로 갈 때 기다리던 저장을 바로 보냄
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (cloudTimer) uploadCloudState();
    } else if (cloudUser && !cloudReady) {
      runInitialCloudSync();
    }
  });
  window.addEventListener("online", () => {
    if (!cloudUser) return;
    if (!cloudReady) runInitialCloudSync();
    else if (loadSyncMeta().dirty) uploadCloudState();
  });

  // Firebase 프로그램을 못 받아 왔으면(인터넷 없음) 폰 저장만으로 동작
  if (typeof firebase === "undefined") { renderCloudStatus(); return; }
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    cloudAuth = firebase.auth();
    cloudDb = firebase.firestore();
  } catch (e) {
    console.warn(e);
    cloudAuth = null;
    cloudDb = null;
    renderCloudStatus();
    return;
  }

  cloudAuth.getRedirectResult().catch(err => { console.warn(err); showLoginError(err); });
  cloudAuth.onAuthStateChanged(user => {
    cloudUser = user;
    cloudReady = false;
    cloudChecking = false;
    clearTimeout(cloudTimer);
    cloudTimer = null;
    if (user) runInitialCloudSync();
    else setCloudStatus("off");
    renderCloudStatus();
  });
}
