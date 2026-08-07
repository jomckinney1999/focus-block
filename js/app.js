(() => {
  'use strict';

  const STORAGE = {
    settings: 'fb_settings',
    sessions: 'fb_sessions',
    active: 'fb_active',
  };

  const DEFAULT_SETTINGS = {
    startShortcut: 'Start Focus Session',
    endShortcut: 'End Focus Session',
    defaultDuration: 50,
  };

  const RING_CIRCUMFERENCE = 2 * Math.PI * 90;

  let selectedDuration = DEFAULT_SETTINGS.defaultDuration;
  let tickHandle = null;

  // ---------- storage helpers ----------

  function loadSettings() {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE.settings)) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
  }

  function loadSessions() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.sessions)) || [];
    } catch {
      return [];
    }
  }

  function saveSessions(sessions) {
    localStorage.setItem(STORAGE.sessions, JSON.stringify(sessions));
  }

  function loadActive() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.active));
    } catch {
      return null;
    }
  }

  function saveActive(active) {
    if (active) {
      localStorage.setItem(STORAGE.active, JSON.stringify(active));
    } else {
      localStorage.removeItem(STORAGE.active);
    }
  }

  // ---------- date helpers ----------

  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function isSameDay(ts, ref) {
    return dayKey(ts) === dayKey(ref);
  }

  // ---------- streak / stats ----------

  function computeStreak(sessions) {
    const completedDays = new Set(
      sessions.filter((s) => s.completed).map((s) => dayKey(s.start))
    );
    const now = Date.now();
    let cursor = now;
    if (!completedDays.has(dayKey(now))) {
      cursor = now - 86400000; // start from yesterday if today has nothing yet
    }
    let streak = 0;
    while (completedDays.has(dayKey(cursor))) {
      streak += 1;
      cursor -= 86400000;
    }
    return streak;
  }

  function computeBestStreak(sessions) {
    const completedDays = [...new Set(sessions.filter((s) => s.completed).map((s) => dayKey(s.start)))]
      .map((k) => sessions.find((s) => dayKey(s.start) === k).start)
      .sort((a, b) => a - b);
    if (completedDays.length === 0) return 0;
    let best = 1;
    let run = 1;
    for (let i = 1; i < completedDays.length; i++) {
      const gapDays = Math.round((dayStart(completedDays[i]) - dayStart(completedDays[i - 1])) / 86400000);
      if (gapDays === 1) {
        run += 1;
      } else if (gapDays > 1) {
        run = 1;
      }
      best = Math.max(best, run);
    }
    return best;
  }

  function dayStart(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function todayMinutes(sessions) {
    const now = Date.now();
    return sessions
      .filter((s) => isSameDay(s.start, now))
      .reduce((sum, s) => sum + s.actualMinutes, 0);
  }

  function weekStats(sessions) {
    const cutoff = Date.now() - 7 * 86400000;
    const recent = sessions.filter((s) => s.start >= cutoff);
    return {
      minutes: recent.reduce((sum, s) => sum + s.actualMinutes, 0),
      count: recent.length,
    };
  }

  // ---------- screen navigation ----------

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.tab').forEach((el) => {
      el.classList.toggle('active', el.dataset.screen === id);
    });
  }

  // ---------- shortcuts deep link ----------

  function runShortcut(name) {
    if (!name) return;
    window.location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(name);
  }

  // ---------- session lifecycle ----------

  function startSession(minutes) {
    const settings = loadSettings();
    const active = { start: Date.now(), plannedMinutes: minutes };
    saveActive(active);
    runShortcut(settings.startShortcut);
    renderSession(active);
    showScreen('screen-session');
    startTicking();
  }

  function endSession(active, completedNaturally) {
    const elapsedMinutes = (Date.now() - active.start) / 60000;
    const actualMinutes = Math.round(
      completedNaturally ? active.plannedMinutes : Math.min(elapsedMinutes, active.plannedMinutes)
    );
    const sessions = loadSessions();
    sessions.push({
      id: active.start,
      start: active.start,
      plannedMinutes: active.plannedMinutes,
      actualMinutes,
      completed: completedNaturally,
    });
    saveSessions(sessions);
    saveActive(null);
    stopTicking();
    return actualMinutes;
  }

  function startTicking() {
    stopTicking();
    tick();
    tickHandle = setInterval(tick, 1000);
  }

  function stopTicking() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  function tick() {
    const active = loadActive();
    if (!active) {
      stopTicking();
      return;
    }
    const totalSeconds = active.plannedMinutes * 60;
    const elapsedSeconds = Math.floor((Date.now() - active.start) / 1000);
    const remaining = totalSeconds - elapsedSeconds;

    if (remaining <= 0) {
      const actualMinutes = endSession(active, true);
      document.getElementById('complete-sub').textContent =
        `You focused for ${actualMinutes} minute${actualMinutes === 1 ? '' : 's'}.`;
      showScreen('screen-complete');
      return;
    }

    renderRing(remaining, totalSeconds);
  }

  function renderSession(active) {
    const totalSeconds = active.plannedMinutes * 60;
    const elapsedSeconds = Math.floor((Date.now() - active.start) / 1000);
    renderRing(totalSeconds - elapsedSeconds, totalSeconds);
  }

  function renderRing(remainingSeconds, totalSeconds) {
    const m = Math.max(0, Math.floor(remainingSeconds / 60));
    const s = Math.max(0, remainingSeconds % 60);
    document.getElementById('timer-display').textContent =
      `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    const fraction = Math.max(0, remainingSeconds / totalSeconds);
    const offset = RING_CIRCUMFERENCE * (1 - fraction);
    document.getElementById('ring-progress').style.strokeDashoffset = offset;
  }

  // ---------- render: home / history / settings ----------

  function renderHome() {
    const sessions = loadSessions();
    document.getElementById('streak-count').textContent = computeStreak(sessions);
    document.getElementById('today-stat').textContent =
      `${todayMinutes(sessions)} min focused today`;
  }

  function renderHistory() {
    const sessions = loadSessions();
    const week = weekStats(sessions);
    document.getElementById('stat-week-minutes').textContent = week.minutes;
    document.getElementById('stat-week-sessions').textContent = week.count;
    document.getElementById('stat-best-streak').textContent = computeBestStreak(sessions);

    const list = document.getElementById('session-list');
    list.innerHTML = '';
    const sorted = [...sessions].sort((a, b) => b.start - a.start);
    if (sorted.length === 0) {
      list.innerHTML = '<li class="empty-state">No sessions yet. Start one from Home.</li>';
      return;
    }
    for (const s of sorted) {
      const li = document.createElement('li');
      li.className = 'session-item' + (s.completed ? '' : ' incomplete');
      const date = new Date(s.start);
      const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      li.innerHTML = `
        <div>
          <div class="dur">${s.actualMinutes} min</div>
          <div class="meta">${dateStr}, ${timeStr}${s.completed ? '' : ' · ended early'}</div>
        </div>
      `;
      list.appendChild(li);
    }
  }

  function renderSettingsForm() {
    const settings = loadSettings();
    document.getElementById('input-start-shortcut').value = settings.startShortcut;
    document.getElementById('input-end-shortcut').value = settings.endShortcut;
    document.getElementById('input-default-duration').value = settings.defaultDuration;
  }

  // ---------- init / resume on load ----------

  function resumeOrShowHome() {
    const active = loadActive();
    if (active) {
      const totalSeconds = active.plannedMinutes * 60;
      const elapsedSeconds = Math.floor((Date.now() - active.start) / 1000);
      if (elapsedSeconds >= totalSeconds) {
        const actualMinutes = endSession(active, true);
        document.getElementById('complete-sub').textContent =
          `You focused for ${actualMinutes} minute${actualMinutes === 1 ? '' : 's'}.`;
        showScreen('screen-complete');
      } else {
        renderSession(active);
        showScreen('screen-session');
        startTicking();
      }
    } else {
      renderHome();
      showScreen('screen-home');
    }
  }

  // ---------- event wiring ----------

  function wireEvents() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.dataset.screen;
        if (id === 'screen-history') renderHistory();
        if (id === 'screen-home') renderHome();
        showScreen(id);
      });
    });

    document.querySelectorAll('.duration-picker .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (chip.dataset.min === 'custom') {
          document.getElementById('custom-duration-modal').classList.add('active');
          return;
        }
        document.querySelectorAll('.duration-picker .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        selectedDuration = parseInt(chip.dataset.min, 10);
      });
    });

    document.getElementById('btn-cancel-custom').addEventListener('click', () => {
      document.getElementById('custom-duration-modal').classList.remove('active');
    });

    document.getElementById('btn-confirm-custom').addEventListener('click', () => {
      const val = parseInt(document.getElementById('custom-duration-input').value, 10);
      if (val > 0) {
        selectedDuration = val;
        document.querySelectorAll('.duration-picker .chip').forEach((c) => c.classList.remove('active'));
        const customChip = document.querySelector('.duration-picker .chip[data-min="custom"]');
        customChip.textContent = `${val}`;
        customChip.classList.add('active');
      }
      document.getElementById('custom-duration-modal').classList.remove('active');
    });

    document.getElementById('btn-start').addEventListener('click', () => {
      startSession(selectedDuration);
    });

    document.getElementById('btn-end-early').addEventListener('click', () => {
      const ok = confirm(
        "End this session early?\n\nThis only stops the timer in this app — it does NOT turn off Screen Time Downtime or your Focus Mode. You'll need to do that yourself if you really want out."
      );
      if (!ok) return;
      const active = loadActive();
      if (active) endSession(active, false);
      renderHome();
      showScreen('screen-home');
    });

    document.getElementById('btn-end-focus-mode').addEventListener('click', () => {
      const settings = loadSettings();
      runShortcut(settings.endShortcut);
    });

    document.getElementById('btn-back-home').addEventListener('click', () => {
      renderHome();
      showScreen('screen-home');
    });

    document.getElementById('btn-open-settings').addEventListener('click', () => {
      renderSettingsForm();
      showScreen('screen-settings');
    });

    document.getElementById('btn-settings-back').addEventListener('click', () => {
      renderHome();
      showScreen('screen-home');
    });

    document.getElementById('btn-history-back').addEventListener('click', () => {
      renderHome();
      showScreen('screen-home');
    });

    document.getElementById('btn-save-settings').addEventListener('click', () => {
      const settings = {
        startShortcut: document.getElementById('input-start-shortcut').value.trim() || DEFAULT_SETTINGS.startShortcut,
        endShortcut: document.getElementById('input-end-shortcut').value.trim() || DEFAULT_SETTINGS.endShortcut,
        defaultDuration: parseInt(document.getElementById('input-default-duration').value, 10) || DEFAULT_SETTINGS.defaultDuration,
      };
      saveSettings(settings);
      renderHome();
      showScreen('screen-home');
    });

    document.getElementById('btn-reset-data').addEventListener('click', () => {
      const ok = confirm('Reset all sessions, streaks, and settings? This cannot be undone.');
      if (!ok) return;
      localStorage.removeItem(STORAGE.settings);
      localStorage.removeItem(STORAGE.sessions);
      localStorage.removeItem(STORAGE.active);
      location.reload();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const active = loadActive();
        if (active) tick();
      }
    });
  }

  // ---------- boot ----------

  function boot() {
    const settings = loadSettings();
    selectedDuration = settings.defaultDuration;
    const matchingChip = document.querySelector(`.duration-picker .chip[data-min="${selectedDuration}"]`);
    if (matchingChip) {
      document.querySelectorAll('.duration-picker .chip').forEach((c) => c.classList.remove('active'));
      matchingChip.classList.add('active');
    }
    wireEvents();
    resumeOrShowHome();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
