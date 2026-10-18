// ==========================================================
// settings.js : ⑨ 설정 화면 (테마, 다크모드 연동, 세트 크기, 음성, 백업/복원/초기화)
// 헤더의 설정(톱니바퀴) 버튼도 여기서 연결합니다.
// 테마 색상 자체는 style.css 에서 고칩니다.
// ==========================================================

// 버튼 연결 (main.js에서 1번 호출)
function initSettingsScreen() {
  document.getElementById("btn-open-settings").onclick = () => {
    document.getElementById("setting-voice-speed").value = state.ttsSpeed;
    document.getElementById("lbl-voice-speed").textContent = `${state.ttsSpeed}x`;
    document.getElementById("setting-auto-dark").checked = state.autoDark;
    if (typeof renderCloudStatus === "function") renderCloudStatus();   // 자동 저장 칸 (sync.js)

    document.querySelectorAll(".btn-wpd").forEach(b => {
      const c = parseInt(b.getAttribute("data-count"), 10);
      if (c === state.wordsPerDay) {
        b.className = "btn-wpd px-4 py-2 rounded-xl border theme-border font-bold text-xs flex-1 theme-primary-bg text-white";
      } else {
        b.className = "btn-wpd px-4 py-2 rounded-xl border theme-border font-bold text-xs flex-1";
      }
    });

    switchView("view-settings");
  };
  document.getElementById("btn-settings-back").onclick = () => {
    renderHome();
    switchView("view-home");
  };

  document.querySelectorAll(".theme-choice-btn").forEach(btn => {
    btn.onclick = () => {
      const th = btn.getAttribute("data-theme");
      if (state.autoDark && isSystemDark() && th !== "theme-dark") {
        state.autoDark = false;
        document.getElementById("setting-auto-dark").checked = false;
      }
      applyTheme(th);
    };
  });

  document.querySelectorAll(".btn-wpd").forEach(btn => {
    btn.onclick = () => {
      const count = parseInt(btn.getAttribute("data-count"), 10);
      state.wordsPerDay = count;
      saveState();
      document.querySelectorAll(".btn-wpd").forEach(b => {
        b.className = "btn-wpd px-4 py-2 rounded-xl border theme-border font-bold text-xs flex-1";
      });
      btn.className = "btn-wpd px-4 py-2 rounded-xl border theme-border font-bold text-xs flex-1 theme-primary-bg text-white";
    };
  });

  document.getElementById("setting-voice-select").onchange = (e) => {
    state.ttsVoice = e.target.value;
    saveState();
  };

  const speedInput = document.getElementById("setting-voice-speed");
  speedInput.oninput = (e) => {
    state.ttsSpeed = parseFloat(e.target.value);
    document.getElementById("lbl-voice-speed").textContent = `${state.ttsSpeed}x`;
    saveState();
  };

  document.getElementById("btn-test-voice").onclick = () => playTTS("apple");

  document.getElementById("setting-auto-dark").onchange = (e) => {
    state.autoDark = e.target.checked;
    saveState();
    refreshTheme();
  };

  document.getElementById("btn-export-data").onclick = () => {
    const jsonStr = JSON.stringify(state);
    navigator.clipboard.writeText(jsonStr).then(() => {
      alert("진도 데이터가 클립보드에 복사되었습니다!\n메모장 등에 보관해 두세요.");
    }).catch(() => {
      prompt("아래 텍스트를 복사해 안전한 곳에 저장하세요:", jsonStr);
    });
  };

  document.getElementById("btn-import-data").onclick = () => {
    const input = prompt("백업해 두었던 진도 텍스트 코드를 붙여넣어 주세요:");
    if (!input) return;
    try {
      const parsed = JSON.parse(input);
      if (!isValidBackup(parsed)) throw new Error("invalid backup");
      if (Array.isArray(parsed.notebook)) {
        parsed.notebook = parsed.notebook
          .map(n => n && allWords.find(w => w.word === n.word && w.pos === normalizePosTag(n.pos)))
          .filter(Boolean);
      }
      state = { ...state, ...parsed };
      saveState();
      alert("진도가 완벽하게 복원되었습니다!");
      location.reload();
    } catch (e) {
      alert("올바르지 않은 백업 데이터입니다. 형식을 확인해 주세요.");
    }
  };

  document.getElementById("btn-reset-data").onclick = () => {
    if (window.confirm("모든 학습 진도와 오답 노트가 초기화됩니다. 진행할까요?")) {
      state.clearedDays = {};
      state.notebook = [];
      saveState();
      renderCategoryView();
      switchView("view-categories");
    }
  };
}
