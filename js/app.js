/**
 * TOEIC 30-Day Master Web App
 * Core Application Engine
 */

// =============================================================================
// 1. Audio & TTS Sound Synthesizer (Web Audio API & Web Speech API)
// =============================================================================
class SoundEngine {
  constructor() {
    this.audioCtx = null;
    this.speechSynth = window.speechSynthesis;
    this.voices = [];
    this.accent = localStorage.getItem('TOEIC_ACCENT') || 'us'; // 'us', 'uk', 'au', 'random'
    this.speechRate = parseFloat(localStorage.getItem('TOEIC_RATE') || '0.95');
    this.initVoices();
  }

  initAudioCtx() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.audioCtx = new AudioContext();
    }
  }

  initVoices() {
    if (!this.speechSynth) return;
    const loadVoices = () => {
      this.voices = this.speechSynth.getVoices();
    };
    loadVoices();
    if (this.speechSynth.onvoiceschanged !== undefined) {
      this.speechSynth.onvoiceschanged = loadVoices;
    }
  }

  getVoiceForAccent(accent) {
    if (!this.voices || !this.voices.length) {
      this.voices = this.speechSynth ? this.speechSynth.getVoices() : [];
    }
    let targetLang = 'en-US';
    if (accent === 'uk') targetLang = 'en-GB';
    if (accent === 'au') targetLang = 'en-AU';
    if (accent === 'random') {
      const accents = ['en-US', 'en-GB', 'en-AU'];
      targetLang = accents[Math.floor(Math.random() * accents.length)];
    }

    // 尋找對應語言的優質自然語音
    const matched = this.voices.find(v => v.lang === targetLang && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Karen')))
                 || this.voices.find(v => v.lang === targetLang)
                 || this.voices.find(v => v.lang.startsWith(targetLang.slice(0, 2)))
                 || null;
    return matched;
  }

  setAccent(newAccent) {
    this.accent = newAccent;
    localStorage.setItem('TOEIC_ACCENT', newAccent);
  }

  setSpeechRate(rate) {
    this.speechRate = rate;
    localStorage.setItem('TOEIC_RATE', rate.toString());
  }

  speak(text, customRate = null) {
    if (!this.speechSynth) return;
    this.speechSynth.cancel();
    const cleanText = text.replace(/[*_#\[\]]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = customRate || this.speechRate;
    
    const voice = this.getVoiceForAccent(this.accent);
    if (voice) utterance.voice = voice;
    this.speechSynth.speak(utterance);
  }

  // 純代碼合成清脆音效（零外部檔案依賴，100% 離線可用）
  playCorrectSound() {
    try {
      this.initAudioCtx();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15); // G5
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {}
  }

  playWrongSound() {
    try {
      this.initAudioCtx();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.2);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {}
  }

  playComboSound(combo) {
    try {
      this.initAudioCtx();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      const baseFreq = 440 + Math.min(combo * 40, 600);
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.2);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {}
  }
}

// =============================================================================
// 2. Game Save Manager (Save Slots System)
// =============================================================================
class SaveManager {
  constructor() {
    this.currentSlotId = 1;
    this.maxSlots = 5;
    this.saveData = this.loadFromStorage();
  }

  getDefaultSlotData(id, name) {
    return {
      id: id,
      name: name || `存檔槽位 ${id}`,
      currentDay: 1,
      streak: 1,
      lastActiveDate: new Date().toISOString().split('T')[0],
      totalDaysActive: 1,
      xp: 0,
      wordStatus: {}, // { wordId: { box: 1..5, nextDue: timestamp, wrong: 0 } }
      bookmarks: [],
      updatedAt: Date.now()
    };
  }

  loadFromStorage() {
    const raw = localStorage.getItem('TOEIC_MASTER_SAVES');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        this.currentSlotId = parsed.currentSlotId || 1;
        return parsed.slots || {};
      } catch (e) {
        console.error('Failed to parse saves from localStorage', e);
      }
    }
    // 初始化 5 個槽位
    const initSlots = {};
    for (let i = 1; i <= this.maxSlots; i++) {
      initSlots[i] = this.getDefaultSlotData(i, i === 1 ? '主力通關進度' : `備用槽位 ${i}`);
    }
    return initSlots;
  }

  saveToStorage() {
    const payload = {
      currentSlotId: this.currentSlotId,
      slots: this.saveData
    };
    localStorage.setItem('TOEIC_MASTER_SAVES', JSON.stringify(payload));
  }

  getActiveSlot() {
    if (!this.saveData[this.currentSlotId]) {
      this.saveData[this.currentSlotId] = this.getDefaultSlotData(this.currentSlotId);
    }
    return this.saveData[this.currentSlotId];
  }

  switchSlot(slotId) {
    if (this.saveData[slotId]) {
      this.currentSlotId = slotId;
      this.saveToStorage();
      return true;
    }
    return false;
  }

  updateActiveSlot(callback) {
    const slot = this.getActiveSlot();
    callback(slot);
    slot.updatedAt = Date.now();
    this.checkDailyStreak(slot);
    this.saveToStorage();
  }

  checkDailyStreak(slot) {
    const today = new Date().toISOString().split('T')[0];
    if (!slot.lastActiveDate) {
      slot.lastActiveDate = today;
      slot.streak = 1;
      slot.totalDaysActive = 1;
      return;
    }
    if (slot.lastActiveDate === today) return; // 今日已打卡

    const lastDate = new Date(slot.lastActiveDate);
    const currentDate = new Date(today);
    const diffDays = Math.round((currentDate - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      slot.streak = (slot.streak || 0) + 1;
      slot.totalDaysActive = (slot.totalDaysActive || 0) + 1;
    } else if (diffDays > 1) {
      // 斷簽重新累計
      slot.streak = 1;
      slot.totalDaysActive = (slot.totalDaysActive || 0) + 1;
    }
    slot.lastActiveDate = today;
  }

  // 匯出當前槽位為 JSON 檔案
  exportCurrentSlotJson() {
    const slot = this.getActiveSlot();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(slot, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `toeic_save_slot${slot.id}_${new Date().toISOString().slice(0,10)}.json`);
    dlAnchorElem.click();
  }

  // 從 JSON 載入進度
  importSlotJson(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === 'object') {
        const slotId = this.currentSlotId;
        parsed.id = slotId;
        this.saveData[slotId] = parsed;
        this.saveToStorage();
        return true;
      }
    } catch (e) {
      alert('存檔格式無效，請確認為正確的 JSON 檔案！');
    }
    return false;
  }

  // 產生 Base64 存檔代碼
  generateSaveCode() {
    const slot = this.getActiveSlot();
    const jsonStr = JSON.stringify(slot);
    return 'TOEIC-' + btoa(unescape(encodeURIComponent(jsonStr)));
  }

  // 載入 Base64 存檔代碼
  loadSaveCode(code) {
    try {
      let trimmed = code.trim();
      if (trimmed.startsWith('TOEIC-')) trimmed = trimmed.replace('TOEIC-', '');
      const jsonStr = decodeURIComponent(escape(atob(trimmed)));
      const parsed = JSON.parse(jsonStr);
      if (parsed) {
        parsed.id = this.currentSlotId;
        this.saveData[this.currentSlotId] = parsed;
        this.saveToStorage();
        return true;
      }
    } catch (e) {
      alert('存檔密碼格式錯誤或已損壞！');
    }
    return false;
  }
}

// =============================================================================
// 3. Main Application Controller
// =============================================================================
class ToeicApp {
  constructor() {
    this.sound = new SoundEngine();
    this.saveManager = new SaveManager();
    this.data = window.TOEIC_DATA || { totalDays: 30, totalWords: 0, days: [] };
    
    // Study Mode State
    this.studyDay = 1;
    this.studyIndex = 0;
    this.studyWordList = [];
    this.isCardFlipped = false;
    this.isClozeMasked = false;
    this.isShuffle = false;

    // Quiz Mode State
    this.quizQueue = [];
    this.quizIndex = 0;
    this.quizCombo = 0;
    this.maxQuizQuestions = 10;
    this.currentQuestion = null;

    this.initTheme();
    this.bindEvents();
    this.renderHome();
  }

  // Theme Initializer
  initTheme() {
    const savedTheme = localStorage.getItem('TOEIC_THEME') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const target = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', target);
    localStorage.setItem('TOEIC_THEME', target);
  }

  // Navigation Routing
  switchView(viewId) {
    document.querySelectorAll('.main-view').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');

    // Update Bottom & Desktop Nav Active State
    document.querySelectorAll('.bottom-tab, .nav-link').forEach(el => {
      if (el.getAttribute('data-target') === viewId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // View Refresh
    if (viewId === 'view-home') this.renderHome();
    if (viewId === 'view-days') this.renderAllDays();
    if (viewId === 'view-saves') this.renderSaveSlots();
    if (viewId === 'view-bookmarks') this.renderBookmarks();
    if (viewId === 'view-quiz') {
      if (!this.quizQueue || !this.quizQueue.length || this.quizIndex >= this.quizQueue.length) {
        const slot = this.saveManager.getActiveSlot();
        this.startQuizMode(slot.currentDay || 1);
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Bind UI Events
  bindEvents() {
    // Navigation clicks
    document.querySelectorAll('[data-target]').forEach(el => {
      el.addEventListener('click', () => {
        this.switchView(el.getAttribute('data-target'));
      });
    });

    document.getElementById('nav-brand').addEventListener('click', () => this.switchView('view-home'));
    document.getElementById('theme-toggle-btn').addEventListener('click', () => this.toggleTheme());

    // Home Actions
    document.getElementById('btn-quick-study').addEventListener('click', () => {
      const slot = this.saveManager.getActiveSlot();
      this.startStudyMode(slot.currentDay || 1);
    });

    document.getElementById('btn-quick-quiz').addEventListener('click', () => {
      const slot = this.saveManager.getActiveSlot();
      this.startQuizMode(slot.currentDay || 1);
    });

    document.getElementById('link-all-days').addEventListener('click', () => this.switchView('view-days'));

    // Study Card Events
    const flashcard = document.getElementById('flashcard');
    flashcard.addEventListener('click', (e) => {
      // 避免點擊發音或收藏按鈕時觸發翻卡
      if (e.target.closest('button')) return;
      this.flipCard();
    });

    document.getElementById('btn-study-back').addEventListener('click', () => this.switchView('view-home'));
    document.getElementById('btn-study-cloze-toggle').addEventListener('click', () => this.toggleClozeMask());
    document.getElementById('btn-study-shuffle').addEventListener('click', () => this.toggleShuffle());

    document.getElementById('story-drawer-toggle').addEventListener('click', () => {
      const drawer = document.getElementById('story-drawer');
      drawer.classList.toggle('open');
      const arrow = document.getElementById('story-drawer-arrow');
      arrow.textContent = drawer.classList.contains('open') ? '▲' : '▼';
    });

    document.getElementById('card-bookmark-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleCurrentBookmark();
    });

    document.getElementById('btn-audio-front').addEventListener('click', (e) => {
      e.stopPropagation();
      this.speakCurrentWord();
    });

    document.getElementById('btn-audio-back').addEventListener('click', (e) => {
      e.stopPropagation();
      this.speakCurrentWord();
    });

    document.getElementById('btn-audio-example').addEventListener('click', (e) => {
      e.stopPropagation();
      this.speakCurrentExample();
    });

    // SRS Evaluation Buttons
    document.getElementById('btn-eval-hard').addEventListener('click', () => this.evaluateCurrentWord(1));
    document.getElementById('btn-eval-good').addEventListener('click', () => this.evaluateCurrentWord(3));
    document.getElementById('btn-eval-easy').addEventListener('click', () => this.evaluateCurrentWord(5));

    // Quiz Next Button
    document.getElementById('btn-quiz-next').addEventListener('click', () => this.nextQuizQuestion());

    // Save Management
    document.getElementById('btn-export-file').addEventListener('click', () => this.saveManager.exportCurrentSlotJson());
    document.getElementById('file-import-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (this.saveManager.importSlotJson(evt.target.result)) {
          alert('存檔載入成功！');
          this.renderSaveSlots();
          this.renderHome();
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('btn-show-save-code').addEventListener('click', () => {
      const code = this.saveManager.generateSaveCode();
      document.getElementById('modal-title').textContent = '通關存檔密碼';
      document.getElementById('modal-desc').textContent = '複製以下代碼，傳送給自己或在任何設備貼上即可秒恢復所有學習進度：';
      const ta = document.getElementById('modal-textarea');
      ta.value = code;
      ta.readOnly = true;
      document.getElementById('btn-modal-action').textContent = '複製代碼';
      document.getElementById('btn-modal-action').onclick = () => {
        navigator.clipboard.writeText(code);
        alert('存檔密碼已複製到剪貼簿！');
      };
      document.getElementById('save-code-modal').classList.add('open');
    });

    document.getElementById('btn-load-save-code').addEventListener('click', () => {
      document.getElementById('modal-title').textContent = '載入存檔密碼';
      document.getElementById('modal-desc').textContent = '請在此貼上通關存檔密碼（格式如 TOEIC-xxxx...）：';
      const ta = document.getElementById('modal-textarea');
      ta.value = '';
      ta.readOnly = false;
      document.getElementById('btn-modal-action').textContent = '確認載入';
      document.getElementById('btn-modal-action').onclick = () => {
        if (this.saveManager.loadSaveCode(ta.value)) {
          alert('進度還原成功！');
          document.getElementById('save-code-modal').classList.remove('open');
          this.renderSaveSlots();
          this.renderHome();
        }
      };
      document.getElementById('save-code-modal').classList.add('open');
    });

    document.getElementById('btn-modal-close').addEventListener('click', () => {
      document.getElementById('save-code-modal').classList.remove('open');
    });

    // Bookmarks Quiz
    document.getElementById('btn-quiz-weak').addEventListener('click', () => {
      const slot = this.saveManager.getActiveSlot();
      const bks = slot.bookmarks || [];
      if (bks.length < 4) {
        alert('待加強字庫至少需 4 個單字才能組成測驗！請在學習中多點擊星號收藏。');
        return;
      }
      this.startWeakWordsQuiz();
    });

    // SRS Review Trigger Buttons
    const triggerSrsReview = () => this.startSrsReviewMode();
    const btnSrs = document.getElementById('btn-srs-review');
    if (btnSrs) btnSrs.addEventListener('click', triggerSrsReview);
    const cardSrs = document.getElementById('card-due-srs-trigger');
    if (cardSrs) cardSrs.addEventListener('click', triggerSrsReview);

    // Audio Settings Modal Events
    const audioModal = document.getElementById('audio-settings-modal');
    const btnAudioSettings = document.getElementById('btn-audio-settings');
    if (btnAudioSettings && audioModal) {
      btnAudioSettings.addEventListener('click', () => {
        document.querySelectorAll('.btn-accent-opt').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.accent === this.sound.accent);
        });
        document.querySelectorAll('.btn-rate-opt').forEach(btn => {
          btn.classList.toggle('active', parseFloat(btn.dataset.rate) === this.sound.speechRate);
        });
        audioModal.classList.add('open');
      });
    }

    document.querySelectorAll('.btn-accent-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-accent-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.sound.setAccent(btn.dataset.accent);
      });
    });

    document.querySelectorAll('.btn-rate-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-rate-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.sound.setSpeechRate(parseFloat(btn.dataset.rate));
      });
    });

    const btnAudioTest = document.getElementById('btn-audio-test');
    if (btnAudioTest) {
      btnAudioTest.addEventListener('click', () => {
        this.sound.speak("Welcome to TOEIC Master. Let's start practicing!");
      });
    }

    const btnAudioSave = document.getElementById('btn-audio-save');
    if (btnAudioSave && audioModal) {
      btnAudioSave.addEventListener('click', () => {
        audioModal.classList.remove('open');
      });
    }

    if (audioModal) {
      audioModal.addEventListener('click', (e) => {
        if (e.target === audioModal) audioModal.classList.remove('open');
      });
    }

    // Desktop Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // 僅在 Study Mode 啟用快捷鍵
      if (document.getElementById('view-study').classList.contains('active')) {
        if (e.code === 'Space') {
          e.preventDefault();
          this.flipCard();
        } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
          this.evaluateCurrentWord(1);
        } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
          this.evaluateCurrentWord(3);
        } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
          this.evaluateCurrentWord(5);
        }
      }
    });
  }

  // =============================================================================
  // Renderers: Home Dashboard
  // =============================================================================
  renderHome() {
    const slot = this.saveManager.getActiveSlot();
    const wordStatus = slot.wordStatus || {};

    // 統計掌握字數 (box >= 4)
    let masteredCount = 0;
    let dueSrsCount = 0;
    const now = Date.now();

    Object.values(wordStatus).forEach(st => {
      if (st.box >= 4) masteredCount++;
      if (st.nextDue && st.nextDue <= now) dueSrsCount++;
    });

    // 戰力等級計算
    let levelName = "Lv.1 新手";
    let estScore = "500~550";
    if (masteredCount > 900) {
      levelName = "Lv.20 900+金色傳說";
      estScore = "900~990";
    } else if (masteredCount > 500) {
      levelName = "Lv.12 700+藍本精銳";
      estScore = "700~850";
    } else if (masteredCount > 200) {
      levelName = "Lv.6 600+綠本達人";
      estScore = "600~690";
    }

    document.getElementById('streak-count').textContent = slot.streak || 1;
    document.getElementById('level-title').textContent = levelName;
    document.getElementById('stat-mastered').textContent = masteredCount;
    document.getElementById('stat-due-srs').textContent = dueSrsCount;
    const btnSrsCount = document.getElementById('btn-srs-count');
    if (btnSrsCount) btnSrsCount.textContent = dueSrsCount;
    document.getElementById('stat-power-score').textContent = estScore;
    document.getElementById('stat-days-active').textContent = slot.totalDaysActive || 1;
    document.getElementById('current-day-num').textContent = slot.currentDay || 1;

    // 渲染首頁前 6 個天數卡片
    const grid = document.getElementById('home-days-grid');
    grid.innerHTML = '';
    const previewDays = this.data.days.slice(0, 6);
    previewDays.forEach(d => {
      grid.appendChild(this.createDayCard(d, slot));
    });
  }

  createDayCard(dayData, slot) {
    const card = document.createElement('div');
    card.className = 'day-card';
    
    // 計算該天單字完成率
    const wordStatus = slot.wordStatus || {};
    let dayMastered = 0;
    dayData.words.forEach(w => {
      if (wordStatus[w.id] && wordStatus[w.id].box >= 3) dayMastered++;
    });
    const percent = Math.round((dayMastered / (dayData.wordCount || 1)) * 100);

    card.innerHTML = `
      <div>
        <div class="day-card-header">
          <span class="day-badge">Day ${dayData.day.toString().padStart(2, '0')}</span>
          <span class="day-theme-tag">${dayData.theme || '核心單元'}</span>
        </div>
        <div class="day-card-title">${dayData.title}</div>
      </div>
      <div>
        <div class="day-progress-bar-bg">
          <div class="day-progress-bar-fill" style="width: ${percent}%;"></div>
        </div>
        <div class="day-card-footer">
          <span>掌握度 ${percent}%</span>
          <span>${dayData.wordCount} 詞</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      this.startStudyMode(dayData.day);
    });

    return card;
  }

  renderAllDays() {
    const slot = this.saveManager.getActiveSlot();
    const grid = document.getElementById('all-days-grid');
    grid.innerHTML = '';
    this.data.days.forEach(d => {
      grid.appendChild(this.createDayCard(d, slot));
    });
  }

  // =============================================================================
  // Flashcard Study & SRS Review Mode Logic
  // =============================================================================
  startSrsReviewMode() {
    const slot = this.saveManager.getActiveSlot();
    const wordStatus = slot.wordStatus || {};
    const now = Date.now();

    // 收集所有到期 (nextDue <= now) 或 曾被評估為待加強 (box === 1) 的單字
    const dueWordIds = [];
    Object.keys(wordStatus).forEach(id => {
      const st = wordStatus[id];
      if ((st.nextDue && st.nextDue <= now) || (st.box === 1)) {
        dueWordIds.push(id);
      }
    });

    const dueWords = [];
    this.data.days.forEach(d => {
      d.words.forEach(w => {
        if (dueWordIds.includes(w.id)) {
          dueWords.push(w);
        }
      });
    });

    if (!dueWords.length) {
      alert('🎉 太棒了！目前暫無艾賓浩斯到期的待複習單字。\n您可以前往「單元課程」繼續背誦新單元，或至「錯題庫」主動加強！');
      return;
    }

    this.studyDay = null; // 特別標記為跨單元 SRS 模式
    this.studyIndex = 0;
    this.studyWordList = this.isShuffle ? this.shuffleArray(dueWords) : [...dueWords];
    this.isCardFlipped = false;
    this.isClozeMasked = false;

    document.getElementById('study-day-badge').textContent = `🔔 SRS 間隔精熟複習 (${dueWords.length} 詞)`;
    document.getElementById('story-drawer-content').textContent = '（SRS 間隔重複精熟模式：專注消滅遺忘曲線上的弱點單字）';

    this.switchView('view-study');
    this.renderStudyCard();
  }

  startStudyMode(dayNum) {
    const dayData = this.data.days.find(d => d.day === dayNum);
    if (!dayData || !dayData.words.length) {
      alert('該單元目前尚無單字資料！');
      return;
    }

    this.studyDay = dayNum;
    this.studyIndex = 0;
    this.studyWordList = this.isShuffle ? this.shuffleArray(dayData.words) : [...dayData.words];
    this.isCardFlipped = false;
    this.isClozeMasked = false;

    // 更新槽位當前學習天數
    this.saveManager.updateActiveSlot(slot => {
      slot.currentDay = dayNum;
    });

    document.getElementById('study-day-badge').textContent = `Day ${dayNum.toString().padStart(2, '0')} - ${dayData.title}`;
    
    // 填入主題情境故事
    const storyContent = document.getElementById('story-drawer-content');
    storyContent.textContent = dayData.story || '（本單元暫無情境故事）';

    this.switchView('view-study');
    this.renderStudyCard();
  }

  renderStudyCard() {
    const word = this.studyWordList[this.studyIndex];
    if (!word) return;

    // Reset Flip State
    const card = document.getElementById('flashcard');
    card.classList.remove('flipped');
    this.isCardFlipped = false;

    // Counter
    document.getElementById('study-progress-counter').textContent = `${this.studyIndex + 1} / ${this.studyWordList.length}`;

    // Stars
    const starStr = '★'.repeat(word.stars || 1);
    document.getElementById('card-stars').textContent = starStr;

    // SRS Mastery Badge
    const slot = this.saveManager.getActiveSlot();
    const srsBadge = document.getElementById('card-srs-badge');
    if (srsBadge) {
      const wordStatus = (slot.wordStatus && slot.wordStatus[word.id]) || null;
      if (!wordStatus || !wordStatus.box) {
        srsBadge.textContent = '🌱 初學單字';
        srsBadge.className = 'card-srs-badge';
      } else if (wordStatus.box === 1) {
        srsBadge.textContent = '🔴 Lv.1 待加強';
        srsBadge.className = 'card-srs-badge box-1';
      } else if (wordStatus.box === 2) {
        srsBadge.textContent = '🟠 Lv.2 複習 1 階';
        srsBadge.className = 'card-srs-badge box-1';
      } else if (wordStatus.box === 3) {
        srsBadge.textContent = '🟡 Lv.3 熟悉 (3天)';
        srsBadge.className = 'card-srs-badge box-3';
      } else if (wordStatus.box === 4) {
        srsBadge.textContent = '🟢 Lv.4 牢固 (7天)';
        srsBadge.className = 'card-srs-badge box-3';
      } else if (wordStatus.box >= 5) {
        srsBadge.textContent = '👑 Lv.5 精熟掌握';
        srsBadge.className = 'card-srs-badge box-5';
      }
    }

    // Bookmark
    const isBookmarked = (slot.bookmarks || []).includes(word.id);
    const bkmkBtn = document.getElementById('card-bookmark-btn');
    bkmkBtn.textContent = isBookmarked ? '★' : '☆';
    bkmkBtn.classList.toggle('active', isBookmarked);

    // Front Content
    const frontWord = document.getElementById('card-front-word');
    if (this.isClozeMasked) {
      frontWord.textContent = word.word.charAt(0) + ' _ _ _ ' + word.word.slice(-1);
    } else {
      frontWord.textContent = word.word;
    }
    document.getElementById('card-front-phonetic').textContent = word.phonetic || '';

    // Back Content
    document.getElementById('card-back-word').textContent = word.word;

    // Pos & Meanings
    const posBox = document.getElementById('card-pos-meanings');
    posBox.innerHTML = '';
    word.posMeanings.forEach(pm => {
      const div = document.createElement('div');
      div.className = 'meaning-item';
      div.innerHTML = `<span class="pos-pill">${pm.pos}</span> ${pm.meaning}`;
      posBox.appendChild(div);
    });

    // Examples
    const exBox = document.getElementById('card-example-box');
    if (word.examples && word.examples.length) {
      exBox.style.display = 'block';
      const firstEx = word.examples[0];
      document.getElementById('card-example-en').textContent = firstEx.en;
      document.getElementById('card-example-zh').textContent = firstEx.zh ? `（${firstEx.zh}）` : '';
    } else {
      exBox.style.display = 'none';
    }

    // Tips
    const tipsBox = document.getElementById('card-tips-box');
    if (word.tips && word.tips.length) {
      tipsBox.style.display = 'block';
      document.getElementById('card-tips-content').innerHTML = word.tips.map(t => `<div>• ${t}</div>`).join('');
    } else {
      tipsBox.style.display = 'none';
    }
  }

  flipCard() {
    const card = document.getElementById('flashcard');
    card.classList.toggle('flipped');
    this.isCardFlipped = card.classList.contains('flipped');
  }

  toggleClozeMask() {
    this.isClozeMasked = !this.isClozeMasked;
    const btn = document.getElementById('btn-study-cloze-toggle');
    btn.style.color = this.isClozeMasked ? 'var(--accent-blue)' : '';
    this.renderStudyCard();
  }

  // Fisher-Yates 真正均勻隨機打亂演算法
  shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    const btn = document.getElementById('btn-study-shuffle');
    
    if (this.isShuffle) {
      btn.style.color = '#ffffff';
      btn.style.background = 'var(--accent-gold)';
      btn.style.borderColor = 'var(--accent-gold)';
      this.studyWordList = this.shuffleArray(this.studyWordList);
    } else {
      btn.style.color = '';
      btn.style.background = '';
      btn.style.borderColor = '';
      const dayData = this.data.days.find(d => d.day === this.studyDay);
      this.studyWordList = dayData ? [...dayData.words] : this.studyWordList;
    }
    this.studyIndex = 0;
    this.renderStudyCard();
  }

  speakCurrentWord() {
    const word = this.studyWordList[this.studyIndex];
    if (word) this.sound.speak(word.word);
  }

  speakCurrentExample() {
    const word = this.studyWordList[this.studyIndex];
    if (word && word.examples && word.examples.length) {
      this.sound.speak(word.examples[0].en, 0.9);
    }
  }

  toggleCurrentBookmark() {
    const word = this.studyWordList[this.studyIndex];
    if (!word) return;

    this.saveManager.updateActiveSlot(slot => {
      if (!slot.bookmarks) slot.bookmarks = [];
      const idx = slot.bookmarks.indexOf(word.id);
      if (idx > -1) {
        slot.bookmarks.splice(idx, 1);
      } else {
        slot.bookmarks.push(word.id);
      }
    });

    this.renderStudyCard();
  }

  evaluateCurrentWord(targetBox) {
    const word = this.studyWordList[this.studyIndex];
    if (!word) return;

    // 計算艾賓浩斯間隔時間 (毫秒)
    const now = Date.now();
    let intervalHours = 4;
    if (targetBox === 3) intervalHours = 72; // 3 天
    if (targetBox >= 5) intervalHours = 168; // 7 天

    const nextDue = now + intervalHours * 60 * 60 * 1000;

    this.saveManager.updateActiveSlot(slot => {
      if (!slot.wordStatus) slot.wordStatus = {};
      const current = slot.wordStatus[word.id] || { box: 1, wrong: 0 };
      current.box = targetBox;
      current.nextDue = nextDue;
      current.lastReviewed = now;
      if (targetBox === 1) current.wrong = (current.wrong || 0) + 1;
      slot.wordStatus[word.id] = current;
      slot.xp = (slot.xp || 0) + (targetBox >= 3 ? 10 : 2);
    });

    if (targetBox >= 3) {
      this.sound.playCorrectSound();
    }

    // 前進下一個單字
    if (this.studyIndex < this.studyWordList.length - 1) {
      this.studyIndex++;
      this.renderStudyCard();
    } else {
      if (this.studyDay) {
        alert(`🎉 恭喜完成 Day ${this.studyDay} 單字學習！建議進行一次 Part 5 克漏字實戰測驗加強記憶！`);
      } else {
        alert(`🎉 恭喜完成本次 SRS 間隔精熟複習！您的多益記憶庫已成功抗遺忘！`);
      }
      this.switchView('view-home');
    }
  }

  // =============================================================================
  // Part 5 Cloze Quiz Logic
  // =============================================================================
  startQuizMode(dayNum) {
    const dayData = this.data.days.find(d => d.day === dayNum);
    if (!dayData || !dayData.words.length) {
      alert('該單元目前尚無測驗資料！');
      return;
    }

    // 挑選含有例句的單字作為考題
    const eligibleWords = dayData.words.filter(w => w.examples && w.examples.length > 0);
    if (eligibleWords.length < 4) {
      alert('可生成測驗題目的單字不足！');
      return;
    }

    // 隨機洗牌挑選 10 題
    const shuffled = [...eligibleWords].sort(() => 0.5 - Math.random());
    this.quizQueue = shuffled.slice(0, Math.min(this.maxQuizQuestions, shuffled.length));
    this.quizIndex = 0;
    this.quizCombo = 0;

    document.getElementById('quiz-badge').textContent = `Day ${dayNum.toString().padStart(2, '0')} Part 5 實戰`;
    this.switchView('view-quiz');
    this.renderQuizQuestion();
  }

  startWeakWordsQuiz() {
    const slot = this.saveManager.getActiveSlot();
    const bks = slot.bookmarks || [];
    
    // 從全部單字中搜集這些單字物件
    const weakWordObjs = [];
    this.data.days.forEach(d => {
      d.words.forEach(w => {
        if (bks.includes(w.id) && w.examples && w.examples.length > 0) {
          weakWordObjs.push(w);
        }
      });
    });

    if (weakWordObjs.length < 4) {
      alert('待加強單字庫中具備例句的題目不足 4 題！');
      return;
    }

    const shuffled = [...weakWordObjs].sort(() => 0.5 - Math.random());
    this.quizQueue = shuffled.slice(0, Math.min(15, shuffled.length));
    this.quizIndex = 0;
    this.quizCombo = 0;

    document.getElementById('quiz-badge').textContent = `錯題特訓專攻`;
    this.switchView('view-quiz');
    this.renderQuizQuestion();
  }

  renderQuizQuestion() {
    const word = this.quizQueue[this.quizIndex];
    if (!word) {
      this.finishQuiz();
      return;
    }

    this.currentQuestion = word;
    document.getElementById('quiz-counter').textContent = `第 ${this.quizIndex + 1} / ${this.quizQueue.length} 題`;

    // 顯示 Combo
    const comboEl = document.getElementById('combo-badge');
    if (this.quizCombo >= 2) {
      comboEl.textContent = `🔥 COMBO x${this.quizCombo}`;
      comboEl.classList.add('show');
    } else {
      comboEl.classList.remove('show');
    }

    // 取得例句並進行挖空
    const ex = word.examples[0];
    let clozeSentence = ex.cloze;
    // 如果挖空標籤未命中，手動替換目標字
    if (!clozeSentence.includes('______')) {
      const reg = new RegExp(word.word, 'gi');
      clozeSentence = ex.en.replace(reg, '______');
    }

    document.getElementById('quiz-sentence').innerHTML = clozeSentence.replace('______', '<span class="cloze-blank">______</span>');
    document.getElementById('quiz-translation').textContent = ex.zh ? `（${ex.zh}）` : '';

    // 生成四個選項 (1 正確 + 3 隨機干擾)
    const options = [word.word];
    // 搜集其他所有單字庫作為干擾項
    const pool = [];
    this.data.days.forEach(d => {
      d.words.forEach(w => {
        if (w.word !== word.word) pool.push(w.word);
      });
    });

    const shuffledPool = pool.sort(() => 0.5 - Math.random());
    for (let w of shuffledPool) {
      if (!options.includes(w)) options.push(w);
      if (options.length === 4) break;
    }
    options.sort(() => 0.5 - Math.random());

    // 渲染選項按鈕
    const optContainer = document.getElementById('quiz-options');
    optContainer.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];

    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-opt-btn';
      btn.innerHTML = `<strong>(${letters[idx]})</strong> <span>${opt}</span>`;
      btn.addEventListener('click', () => this.handleQuizAnswer(opt, btn));
      optContainer.appendChild(btn);
    });

    // 隱藏解析與下一題按鈕
    document.getElementById('quiz-feedback-box').className = 'quiz-feedback-box';
    document.getElementById('btn-quiz-next').style.display = 'none';
  }

  handleQuizAnswer(selectedWord, btn) {
    const isCorrect = selectedWord.toLowerCase() === this.currentQuestion.word.toLowerCase();
    const allBtns = document.querySelectorAll('.quiz-opt-btn');
    allBtns.forEach(b => b.disabled = true);

    const feedback = document.getElementById('quiz-feedback-box');
    feedback.classList.add('show');

    if (isCorrect) {
      btn.classList.add('correct');
      this.quizCombo++;
      this.sound.playCorrectSound();
      if (this.quizCombo >= 2) this.sound.playComboSound(this.quizCombo);

      feedback.innerHTML = `
        <div style="color: var(--accent-emerald); font-weight: 700; margin-bottom: 4px;">✅ 正確！答得太棒了！</div>
        <div style="font-size: 0.9rem; color: var(--text-secondary);">
          <strong>${this.currentQuestion.word}</strong> ${this.currentQuestion.phonetic || ''} 
          - ${this.currentQuestion.posMeanings.map(pm => pm.meaning).join('、')}
        </div>
      `;

      // 獎勵 XP
      this.saveManager.updateActiveSlot(slot => {
        slot.xp = (slot.xp || 0) + 15;
      });
    } else {
      btn.classList.add('wrong');
      this.quizCombo = 0;
      this.sound.playWrongSound();

      // 找出正確選項加亮
      allBtns.forEach(b => {
        if (b.innerText.includes(this.currentQuestion.word)) b.classList.add('correct');
      });

      // 自動將錯題加入生詞本
      this.saveManager.updateActiveSlot(slot => {
        if (!slot.bookmarks) slot.bookmarks = [];
        if (!slot.bookmarks.includes(this.currentQuestion.id)) {
          slot.bookmarks.push(this.currentQuestion.id);
        }
      });

      feedback.innerHTML = `
        <div style="color: var(--accent-rose); font-weight: 700; margin-bottom: 4px;">❌ 答錯了！已為您自動收錄至「錯題生詞庫」</div>
        <div style="font-size: 0.9rem; color: var(--text-secondary);">
          正確答案是：<strong>${this.currentQuestion.word}</strong>（${this.currentQuestion.posMeanings.map(pm => pm.meaning).join('、')}）
        </div>
      `;
    }

    document.getElementById('btn-quiz-next').style.display = 'inline-flex';
  }

  nextQuizQuestion() {
    this.quizIndex++;
    this.renderQuizQuestion();
  }

  finishQuiz() {
    alert(`🎉 恭喜完成本次 Part 5 實戰測驗！維持每天練習，迅速建立多益語感！`);
    this.switchView('view-home');
  }

  // =============================================================================
  // Save Slots View & Bookmarks View
  // =============================================================================
  renderSaveSlots() {
    const list = document.getElementById('slots-list');
    list.innerHTML = '';
    const currentId = this.saveManager.currentSlotId;

    for (let i = 1; i <= this.saveManager.maxSlots; i++) {
      const slot = this.saveManager.saveData[i] || this.saveManager.getDefaultSlotData(i);
      const isCurrent = slot.id === currentId;

      let mastered = 0;
      Object.values(slot.wordStatus || {}).forEach(st => {
        if (st.box >= 4) mastered++;
      });

      const dateStr = slot.updatedAt ? new Date(slot.updatedAt).toLocaleString('zh-TW', { hour12: false }) : '無存檔';

      const card = document.createElement('div');
      card.className = `slot-card ${isCurrent ? 'current' : ''}`;
      card.innerHTML = `
        <div class="slot-header">
          <div class="slot-name">
            <span>🎮 ${slot.name}</span>
            ${isCurrent ? '<span class="slot-current-badge">目前使用中</span>' : ''}
          </div>
          <span style="font-size: 0.8rem; color: var(--text-muted);">槽位 ${slot.id}</span>
        </div>
        <div class="slot-details">
          <div class="slot-meta-item">
            <span class="slot-meta-label">已掌握單字</span>
            <span class="slot-meta-val" style="color: var(--accent-gold);">${mastered} 詞</span>
          </div>
          <div class="slot-meta-item">
            <span class="slot-meta-label">連續打卡</span>
            <span class="slot-meta-val" style="color: var(--accent-rose);">${slot.streak || 0} 天</span>
          </div>
          <div class="slot-meta-item">
            <span class="slot-meta-label">當前學習進度</span>
            <span class="slot-meta-val">Day ${slot.currentDay || 1}</span>
          </div>
          <div class="slot-meta-item">
            <span class="slot-meta-label">最後存檔時間</span>
            <span class="slot-meta-val" style="font-size: 0.8rem;">${dateStr}</span>
          </div>
        </div>
        <div class="slot-actions">
          ${!isCurrent ? `<button class="btn-slot primary" data-switch="${slot.id}">載入此進度</button>` : ''}
          <button class="btn-slot" data-rename="${slot.id}">重新命名</button>
        </div>
      `;

      const switchBtn = card.querySelector('[data-switch]');
      if (switchBtn) {
        switchBtn.addEventListener('click', () => {
          this.saveManager.switchSlot(slot.id);
          this.renderSaveSlots();
          this.renderHome();
        });
      }

      const renameBtn = card.querySelector('[data-rename]');
      if (renameBtn) {
        renameBtn.addEventListener('click', () => {
          const newName = prompt('請輸入新的存檔槽位名稱：', slot.name);
          if (newName && newName.trim()) {
            slot.name = newName.trim();
            this.saveManager.saveToStorage();
            this.renderSaveSlots();
          }
        });
      }

      list.appendChild(card);
    }
  }

  renderBookmarks() {
    const list = document.getElementById('bookmarks-list');
    list.innerHTML = '';
    const slot = this.saveManager.getActiveSlot();
    const bks = slot.bookmarks || [];

    if (!bks.length) {
      list.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">🌟</div>
          <div>目前生詞與錯題庫空空如也！</div>
          <div style="font-size: 0.85rem; margin-top: 4px;">在單字卡點擊星號收藏，或測驗答錯時會自動記錄在這裡。</div>
        </div>
      `;
      return;
    }

    // 查詢單字
    const wordsMap = {};
    this.data.days.forEach(d => {
      d.words.forEach(w => {
        wordsMap[w.id] = w;
      });
    });

    bks.forEach(wId => {
      const w = wordsMap[wId];
      if (!w) return;

      const item = document.createElement('div');
      item.className = 'day-card';
      item.style.flexDirection = 'row';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.innerHTML = `
        <div>
          <div style="font-size: 1.1rem; font-weight: 700;">${w.word} <small style="color: var(--text-muted); font-weight: 400;">${w.phonetic || ''}</small></div>
          <div style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 2px;">
            ${w.posMeanings.map(pm => `<span class="pos-pill">${pm.pos}</span> ${pm.meaning}`).join(' ')}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="icon-btn" title="朗讀發音" data-speak="${w.word}">🔊</button>
          <button class="icon-btn" title="移出生詞庫" data-del="${w.id}" style="color: var(--accent-rose);">✕</button>
        </div>
      `;

      item.querySelector('[data-speak]').addEventListener('click', () => this.sound.speak(w.word));
      item.querySelector('[data-del]').addEventListener('click', () => {
        this.saveManager.updateActiveSlot(s => {
          s.bookmarks = (s.bookmarks || []).filter(id => id !== w.id);
        });
        this.renderBookmarks();
      });

      list.appendChild(item);
    });
  }
}

// Initialize Application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ToeicApp();
});
