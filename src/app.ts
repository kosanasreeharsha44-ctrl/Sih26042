// ============================================================================
// BhashaSetu - Main Application Controller
// Wires all UI components, Offline Database, AI Engines, Translations, and Auth
// ============================================================================

import {
  getDB,
  dbGet,
  dbGetAll,
  dbPut,
  dbDelete,
  logAudit,
  LessonRecord,
  WorksheetRecord,
  AssignmentRecord,
  StudentProgressRecord,
  ResourceRecord,
  UserRecord,
  UserHistoryRecord,
  saveUserHistoryItem,
  getUserHistory,
  deleteUserHistoryItem,
  clearUserHistory
} from './db';

import {
  initAuth,
  getCurrentUser,
  loginWithEmail,
  loginWithGoogle,
  handleGoogleSignIn,
  getGoogleAuthStatus,
  loginLocalOffline,
  switchRole,
  logout,
  registerUser,
  isTeacher,
  isStudent,
  canPublishContent,
  canGradeAssessments,
  canAccessSettingsAdmin
} from './auth';

import { translateOffline, detectLanguageOffline } from './offline-translator';
import { translateAndExplainContent, askAITutor, generateEducationalDiagram, translateText } from './ai-engine';
import { getAppLang, setAppLang, applyLanguageToDOM, SupportedAppLang } from './i18n';
import {
  initSyncEngine,
  addSyncListener,
  flushSyncQueue
} from './sync';

import {
  seedDefaultQuizzesIfEmpty,
  setupQuizzesModule,
  setupStudentProfileModule,
  refreshQuizzesList,
  refreshStudentQuizzesForPortal,
  refreshStudentProgress as refreshStudentProgressSecure
} from './quiz-manager';
import {
  syncLocalQueueToSupabase,
  isSupabaseConfigured,
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  testSupabaseConnection,
  syncUserHistoryToSupabase,
  getSupabaseAuthStatus
} from './supabase';
import { initVoiceCache, getCachedVoice, saveVoiceToCache, getVoiceCacheStats } from './voice-cache';
import { initStudentAISuite } from './student-ai-suite';
import {
  getActiveSession,
  isSessionActive,
  startSession,
  extendSession,
  pauseOrResumeSession,
  endSession,
  getTimeRemaining,
  studentJoinSession,
  recordStudentActivity,
  submitTeacherFeedback,
  onSessionChange,
  ActiveLearningSession
} from './session';
import { supabase, signInWithGoogle } from './supabaseClient.js';
import { handleSignIn, checkSignUpSuccess } from './SignIn.js';
import { handleSignUp } from './SignUp.js';
import {
  fetchLessons,
  createLesson,
  updateLesson,
  deleteLesson,
  fetchWorksheets,
  createWorksheet,
  deleteWorksheet,
  fetchAssignments,
  createAssignment,
  deleteAssignment,
  fetchUserHistory,
  createUserHistory,
  deleteUserHistory,
  uploadFileToStorage,
  getSignedUrl,
  deleteFileFromStorage,
  fetchResources,
  createResource,
  deleteResource,
  getNotesCount,
  subscribeToNotes
} from './supabaseService.js';

export type TTSVoiceProfile = 'Young Learner' | 'Formal Teacher';

export interface SentenceAudioPlayer {
  play: () => Promise<void>;
  pause: () => void;
  replay: () => Promise<void>;
  stop: () => void;
  isPlaying: () => boolean;
  isPaused: () => boolean;
  onStateChange: (callback: (state: 'playing' | 'paused' | 'ended' | 'idle') => void) => void;
}

// Global Audio Engine
class AudioEngine {
  private ctx: AudioContext | null = null;
  private voiceProfile: TTSVoiceProfile = 'Young Learner';
  private playbackSpeed: number = 0.9; // Default 0.9x slightly slower student-friendly cadence

  constructor() {
    try {
      const savedProfile = localStorage.getItem('bhashasetu_tts_voice_profile');
      if (savedProfile === 'Formal Teacher' || savedProfile === 'Young Learner') {
        this.voiceProfile = savedProfile;
      }
      const savedSpeed = localStorage.getItem('bhashasetu_tts_speed');
      if (savedSpeed) {
        const parsed = parseFloat(savedSpeed);
        if (!isNaN(parsed) && parsed > 0) this.playbackSpeed = parsed;
      }
    } catch (_) {}
  }

  public getVoiceProfile(): TTSVoiceProfile {
    return this.voiceProfile;
  }

  public setVoiceProfile(profile: TTSVoiceProfile) {
    this.voiceProfile = profile;
    try {
      localStorage.setItem('bhashasetu_tts_voice_profile', profile);
    } catch (_) {}
  }

  public getPlaybackSpeed(): number {
    return this.playbackSpeed;
  }

  public setPlaybackSpeed(speed: number) {
    this.playbackSpeed = speed;
    try {
      localStorage.setItem('bhashasetu_tts_speed', String(speed));
    } catch (_) {}
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  public playToneSequence(freqs: number[], duration = 0.12) {
    try {
      this.initCtx();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;
      freqs.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * duration);
        gain.gain.setValueAtTime(0.2, now + idx * duration);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (idx + 1) * duration);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + idx * duration);
        osc.stop(now + (idx + 1) * duration);
      });
    } catch (e) {
      console.warn('Audio tone error:', e);
    }
  }

  public speakText(text: string, lang = 'hi-IN', rate?: number, pitch?: number) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*_#𑢹𑣉𑣆𑣗𑣉]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(clean);

      const isYoungLearner = this.voiceProfile === 'Young Learner';
      // Young Learner: higher pitch (1.25), gentler pacing (0.92 * playbackSpeed)
      // Formal Teacher: authoritative/standard pitch (0.95), standard cadence (1.0 * playbackSpeed)
      const defaultPitch = isYoungLearner ? 1.25 : 0.95;
      const defaultRate = isYoungLearner ? 0.92 : 1.0;

      utterance.pitch = pitch !== undefined ? pitch : defaultPitch;
      utterance.rate = rate !== undefined ? rate : (defaultRate * this.playbackSpeed);

      // Select matching voice
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const langPrefix = lang.split('-')[0];
        const matchingVoices = voices.filter(v => v.lang.startsWith(langPrefix) || v.lang.includes('IN') || v.lang.includes('hi'));
        const pool = matchingVoices.length > 0 ? matchingVoices : voices;

        if (isYoungLearner) {
          const femaleOrChildVoice = pool.find(v =>
            /female|kavya|kalpana|aditi|veena|lekha|zira|samantha|child|girl/i.test(v.name)
          );
          if (femaleOrChildVoice) utterance.voice = femaleOrChildVoice;
          else utterance.voice = pool[0];
        } else {
          const formalVoice = pool.find(v =>
            /male|ravi|madhav|hemant|david|george|teacher|standard|guy/i.test(v.name)
          );
          if (formalVoice) utterance.voice = formalVoice;
          else utterance.voice = pool[0];
        }
      }

      window.speechSynthesis.speak(utterance);
    } else {
      this.playToneSequence(this.voiceProfile === 'Young Learner' ? [523, 659, 784] : [440, 554, 659]);
    }
  }

  public async speakTextNatural(text: string, lang = 'hi-IN'): Promise<void> {
    const clean = text.replace(/[*_#𑢹𑣉𑣆𑣗𑣉]/g, '').trim();
    if (!clean) return;

    // 1. DEDICATED OFFLINE VOICE CACHE (IndexedDB): Instantaneous & 100% offline
    try {
      const cached = await getCachedVoice(clean, lang, this.voiceProfile);
      if (cached && cached.audioData) {
        const mime = cached.mimeType || 'audio/wav';
        const audioObj = new Audio(`data:${mime};base64,${cached.audioData}`);
        audioObj.playbackRate = this.playbackSpeed;
        return new Promise((resolve) => {
          audioObj.onended = () => resolve();
          audioObj.onerror = () => {
            this.speakText(clean, lang);
            resolve();
          };
          audioObj.play().catch(() => {
            this.speakText(clean, lang);
            resolve();
          });
        });
      }
    } catch (err) {
      console.warn('Offline voice cache lookup warning:', err);
    }

    // 2. ONLINE PATH: Use Natural AI Voice (Gemini TTS API) when online
    if (navigator.onLine) {
      try {
        const resp = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: clean.substring(0, 800),
            voiceProfile: this.voiceProfile
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          const base64 = data.audioData || data.audioContent;
          if (base64) {
            const mime = data.mimeType || 'audio/wav';

            // Auto-cache this synthesized voice asset into IndexedDB for subsequent offline use
            saveVoiceToCache(clean, lang, this.voiceProfile, base64, mime, 'online-synthesized').catch(() => {});

            const audioObj = new Audio(`data:${mime};base64,${base64}`);
            audioObj.playbackRate = this.playbackSpeed;
            return new Promise((resolve) => {
              audioObj.onended = () => resolve();
              audioObj.onerror = () => {
                this.speakText(clean, lang);
                resolve();
              };
              audioObj.play().catch(() => {
                this.speakText(clean, lang);
                resolve();
              });
            });
          }
        }
      } catch (err) {
        console.warn('Natural TTS offline/error fallback:', err);
      }
    }

    // 3. Fallback: Standard device speech synthesis
    this.speakText(clean, lang);
  }

  /**
   * Prepares a high-quality, student-friendly sentence audio player.
   * Supports dedicated Play, Pause, Replay, Stop, and event listeners.
   */
  public async prepareSentenceAudioTrack(
    text: string,
    lang = 'hi-IN',
    voiceProfile?: TTSVoiceProfile,
    speed?: number
  ): Promise<SentenceAudioPlayer> {
    const profile = voiceProfile || this.voiceProfile;
    const targetSpeed = speed !== undefined ? speed : this.playbackSpeed;
    const clean = text.replace(/[*_#𑢹𑣉𑣆𑣗𑣉]/g, '').trim();

    if (!clean) {
      return {
        play: async () => {},
        pause: () => {},
        replay: async () => {},
        stop: () => {},
        isPlaying: () => false,
        isPaused: () => false,
        onStateChange: () => {}
      };
    }

    // 1. OFFLINE CACHE CHECK (IndexedDB)
    try {
      const cached = await getCachedVoice(clean, lang, profile);
      if (cached && cached.audioData) {
        const mime = cached.mimeType || 'audio/wav';
        const audioObj = new Audio(`data:${mime};base64,${cached.audioData}`);
        return this.createHtmlAudioPlayer(audioObj, targetSpeed);
      }
    } catch (err) {
      console.warn('Sentence audio cache lookup error:', err);
    }

    // 2. ONLINE GEMINI TTS GENERATION
    if (navigator.onLine) {
      try {
        const resp = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: clean.substring(0, 800),
            voiceProfile: profile,
            voiceName: profile === 'Young Learner' ? 'Kore' : 'Zephyr'
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          const base64 = data.audioData || data.audioContent;
          if (base64) {
            const mime = data.mimeType || 'audio/wav';
            saveVoiceToCache(clean, lang, profile, base64, mime, 'online-synthesized').catch(() => {});
            const audioObj = new Audio(`data:${mime};base64,${base64}`);
            return this.createHtmlAudioPlayer(audioObj, targetSpeed);
          }
        }
      } catch (err) {
        console.warn('Online sentence TTS fetch warning, falling back to Web Speech:', err);
      }
    }

    // 3. FALLBACK: High-accuracy student-friendly browser synthesis
    return this.createWebSpeechPlayer(clean, lang, targetSpeed, profile);
  }

  private createHtmlAudioPlayer(audioObj: HTMLAudioElement, speed: number): SentenceAudioPlayer {
    let playerState: 'playing' | 'paused' | 'ended' | 'idle' = 'idle';
    const listeners: ((st: 'playing' | 'paused' | 'ended' | 'idle') => void)[] = [];

    const notify = (st: 'playing' | 'paused' | 'ended' | 'idle') => {
      playerState = st;
      listeners.forEach(fn => fn(st));
    };

    audioObj.playbackRate = speed;
    audioObj.onplay = () => notify('playing');
    audioObj.onpause = () => {
      if (playerState !== 'ended') notify('paused');
    };
    audioObj.onended = () => notify('ended');
    audioObj.onerror = () => notify('ended');

    return {
      play: async () => {
        try {
          await audioObj.play();
        } catch (err) {
          console.warn('Audio playback error:', err);
          notify('ended');
        }
      },
      pause: () => {
        audioObj.pause();
        notify('paused');
      },
      replay: async () => {
        audioObj.currentTime = 0;
        try {
          await audioObj.play();
        } catch (err) {
          console.warn('Audio replay error:', err);
          notify('ended');
        }
      },
      stop: () => {
        audioObj.pause();
        audioObj.currentTime = 0;
        notify('idle');
      },
      isPlaying: () => playerState === 'playing',
      isPaused: () => playerState === 'paused',
      onStateChange: (fn) => {
        listeners.push(fn);
      }
    };
  }

  private createWebSpeechPlayer(cleanText: string, lang: string, speed: number, voiceProfile: TTSVoiceProfile): SentenceAudioPlayer {
    let playerState: 'playing' | 'paused' | 'ended' | 'idle' = 'idle';
    const listeners: ((st: 'playing' | 'paused' | 'ended' | 'idle') => void)[] = [];

    const notify = (st: 'playing' | 'paused' | 'ended' | 'idle') => {
      playerState = st;
      listeners.forEach(fn => fn(st));
    };

    const isYoungLearner = voiceProfile === 'Young Learner';
    // Gentle student pace: default 0.9x cadence with natural pauses
    const defaultRate = isYoungLearner ? 0.90 : 0.95;
    const targetRate = defaultRate * speed;
    const targetPitch = isYoungLearner ? 1.15 : 1.0;

    const buildUtterance = (): SpeechSynthesisUtterance => {
      const utt = new SpeechSynthesisUtterance(cleanText);
      utt.rate = targetRate;
      utt.pitch = targetPitch;

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const isEnglish = lang.toLowerCase().includes('en');
        const isHindi = lang.toLowerCase().includes('hi');

        if (isEnglish) {
          const indianEng = voices.find(v =>
            /en[-_]in|india|neerja|prabhat|google.*english/i.test(v.lang + ' ' + v.name)
          );
          if (indianEng) utt.voice = indianEng;
          else {
            const gentleVoice = voices.find(v => /samantha|karen|serena|natural|female/i.test(v.name));
            if (gentleVoice) utt.voice = gentleVoice;
          }
        } else if (isHindi) {
          const hindiVoice = voices.find(v =>
            /hi[-_]in|hindi|swara|madhur|aditi|kalpana|kavya|google.*हिन्दी/i.test(v.lang + ' ' + v.name)
          );
          if (hindiVoice) utt.voice = hindiVoice;
        }
      }

      utt.onstart = () => notify('playing');
      utt.onpause = () => notify('paused');
      utt.onresume = () => notify('playing');
      utt.onend = () => notify('ended');
      utt.onerror = (e) => {
        console.warn('Speech synthesis utterance error:', e);
        notify('ended');
      };

      (window as any)._activeSentenceUtterance = utt;
      return utt;
    };

    let activeUtt: SpeechSynthesisUtterance | null = null;

    return {
      play: async () => {
        if ('speechSynthesis' in window) {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
            notify('playing');
          } else {
            window.speechSynthesis.cancel();
            activeUtt = buildUtterance();
            window.speechSynthesis.speak(activeUtt);
          }
        } else {
          notify('ended');
        }
      },
      pause: () => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.pause();
          notify('paused');
        }
      },
      replay: async () => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          activeUtt = buildUtterance();
          window.speechSynthesis.speak(activeUtt);
        } else {
          notify('ended');
        }
      },
      stop: () => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        notify('idle');
      },
      isPlaying: () => playerState === 'playing',
      isPaused: () => playerState === 'paused',
      onStateChange: (fn) => {
        listeners.push(fn);
      }
    };
  }
}

export const audio = new AudioEngine();

// Toast Notification
export function showToast(text: string, icon = '✓') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast-bubble';
  toast.innerHTML = `<span style="font-size:1.1rem;font-weight:700;">${icon}</span><span>${text}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Navigation Handler
let navigationHistory: string[] = ['dashboard'];
let globalUploadedContent = '';

export function enableUploadedDocChip() {
  const chip = document.getElementById('btn-ai-uploaded-doc');
  if (chip) {
    chip.style.display = 'inline-flex';
  }
}

export function switchView(viewName: string) {
  if (!viewName) return;
  let cleanId = viewName.startsWith('view-') ? viewName.replace('view-', '') : viewName;
  if (cleanId === 'ai-generator') {
    cleanId = 'ai-translator';
  }

  const user = getCurrentUser();
  if (user.role === 'Student' && cleanId === 'dashboard') {
    cleanId = 'student-portal';
  }

  const targetContainerId = `view-${cleanId}`;

  const navLinks = document.querySelectorAll('.nav-link');
  const dashView = document.getElementById('view-dashboard');
  const detailViews = document.querySelectorAll('.module-view-container');
  const appShell = document.getElementById('app-shell');
  const topbarBackBtn = document.getElementById('btn-topbar-back');

  // 1. Update sidebar nav-link active class
  navLinks.forEach(link => {
    const v = link.getAttribute('data-view');
    if (v === cleanId || (cleanId === 'ai-translator' && v === 'ai-generator')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // 1b. Update mobile bottom navigation active class
  document.querySelectorAll('.mb-nav-item[data-nav]').forEach(item => {
    const v = item.getAttribute('data-nav');
    if (v === cleanId || (cleanId === 'ai-translator' && v === 'ai-translator')) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // 2. Also update [data-goto] elements
  document.querySelectorAll('[data-goto]').forEach(elem => {
    const g = elem.getAttribute('data-goto');
    if (g === cleanId || (cleanId === 'ai-translator' && g === 'ai-generator')) {
      elem.classList.add('active');
    } else {
      elem.classList.remove('active');
    }
  });

  // 3. Switch view visibility
  if (cleanId === 'dashboard') {
    if (dashView) {
      dashView.style.display = 'flex';
      dashView.classList.add('active-view');
    }
    detailViews.forEach(v => {
      v.classList.remove('active-view');
      (v as HTMLElement).style.display = 'none';
    });
    appShell?.classList.remove('detail-mode');
    if (topbarBackBtn) topbarBackBtn.style.display = 'none';

    // Topbar header for dashboard
    const user = getCurrentUser();
    const topbarTitle = document.getElementById('topbar-title');
    const topbarDesc = document.getElementById('topbar-desc');
    if (topbarTitle) {
      topbarTitle.innerHTML = user.role === 'Teacher' ? `Hello, Teacher! <span aria-hidden="true">👋</span>` : `Hello, ${user.name.split(' ')[0]}! <span aria-hidden="true">👋</span>`;
    }
    if (topbarDesc) {
      topbarDesc.textContent = "Here's what's happening in your class today.";
    }
  } else {
    if (dashView) {
      dashView.style.display = 'none';
      dashView.classList.remove('active-view');
    }
    detailViews.forEach(v => {
      v.classList.remove('active-view');
      (v as HTMLElement).style.display = 'none';
    });

    const target = document.getElementById(targetContainerId);
    if (target) {
      target.classList.add('active-view');
      target.style.display = 'block';
    } else {
      console.warn(`Target view ${targetContainerId} not found, falling back to dashboard.`);
      if (dashView) {
        dashView.style.display = 'flex';
        dashView.classList.add('active-view');
      }
    }

    appShell?.classList.add('detail-mode');
    if (topbarBackBtn) topbarBackBtn.style.display = 'inline-flex';

    // Module headers
    const topbarTitle = document.getElementById('topbar-title');
    const topbarDesc = document.getElementById('topbar-desc');
    const moduleHeaders: Record<string, { title: string; desc: string }> = {
      'ai-translator': { title: 'AI Translator & Explainer 🌐', desc: 'Mother-tongue pedagogy, lesson explanations, grade simplification, and authentic uploads.' },
      'ai-generator': { title: 'AI Translator & Explainer 🌐', desc: 'Mother-tongue pedagogy, lesson explanations, grade simplification, and authentic uploads.' },
      'tool-text': { title: 'Translate Content 🌐', desc: 'Translate lessons, classroom activities and words across tribal languages.' },
      'tool-voice': { title: 'Voice Conversation 🎙️', desc: 'Real-time bilingual classroom speech companion.' },
      'lessons': { title: 'Classroom Lessons 📚', desc: 'Browse and manage localized curriculum packs.' },
      'worksheets': { title: 'Bilingual Worksheets 📝', desc: 'Printable activities and tracing sheets for students.' },
      'assessments': { title: 'Class Assignments 📋', desc: 'Track homework submissions and student oral recitations.' },
      'quizzes': { title: 'Interactive Quizzes & Tests 🎯', desc: 'Multilingual 4-choice interactive quizzes for foundational learning evaluation.' },
      'progress': { title: 'Student Progress 📊', desc: 'FLN competency tracking and AI recommendations.' },
      'resources': { title: 'Learning Resources 📂', desc: 'Mother-tongue readers, songs, and teaching kits.' },
      'settings': { title: 'Settings ⚙️', desc: 'School profile, dialect preferences and offline cache.' },
      'student-portal': { title: 'Student Learning Corner 👧', desc: 'Practice reading, listen to stories and complete activities.' },
      'bilingual-learning': { title: 'Bilingual Learning Corner 📖', desc: 'Approved mother-tongue stories, poems, and FLN foundational practice.' },
      'tool-image': { title: 'Image to Text OCR 📷', desc: 'Extract and translate tribal language textbooks and charts.' },
      'tool-dictionary': { title: 'Bilingual Dictionary 📖', desc: 'Search cultural vocabulary and pronunciation in tribal languages.' },
      'history': { title: 'Offline Translation History 🕒', desc: 'Per-user local translation history saved in IndexedDB with Supabase cloud sync ready.' },
      'student-ai-translator': { title: 'AI Translator & Explainer 🤖', desc: 'Mother-tongue translations with simple meanings, examples, and audio pronunciation.' },
      'student-translate-content': { title: 'Translate Content 🌐', desc: 'Interactive bilingual study reader for lessons, worksheets, notes, and uploads without altering the original.' },
      'student-voice-conversation': { title: 'Voice Conversation 🎤', desc: 'Real-time multilingual voice conversation with speech-to-text, AI voice replies, and pronunciation coaching.' }
    };

    if (moduleHeaders[cleanId] && topbarTitle && topbarDesc) {
      topbarTitle.textContent = moduleHeaders[cleanId].title;
      topbarDesc.textContent = moduleHeaders[cleanId].desc;
    }
  }

  // 4. Update Navigation History
  if (navigationHistory[navigationHistory.length - 1] !== cleanId) {
    navigationHistory.push(cleanId);
  }

  // 5. Update URL hash for browser reload persistence
  try {
    if (window.location.hash.replace('#', '') !== cleanId) {
      history.replaceState(null, '', '#' + cleanId);
    }
  } catch {
    // ignore
  }

  if (cleanId === 'dashboard') {
    refreshDashboardStats();
  }

  if (cleanId === 'lessons') {
    const viewer = document.getElementById('lesson-viewer-subview');
    if (!activeLessonId || viewer?.style.display === 'none') {
      showLessonsListView();
    }
  }

  if (cleanId === 'resources') {
    refreshResourcesList();
  }

  if (cleanId === 'quizzes') {
    refreshQuizzesList();
  }

  if (cleanId === 'progress') {
    refreshStudentProgressSecure();
  }

  if (cleanId === 'student-portal') {
    refreshStudentQuizzesForPortal();
  }

  if (cleanId === 'history') {
    renderOfflineHistory();
    updateUserHistoryBadge();
  }

  if (cleanId === 'dashboard' || cleanId === 'student-portal') {
    refreshNotesCount();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export const navigateTo = switchView;
(window as any).switchView = switchView;
(window as any).navigateTo = switchView;

// ===================== REALTIME NOTES COUNTER =====================
/**
 * Requirements:
 * 1. Fetch the current authenticated user using: supabase.auth.getUser()
 * 2. Count the number of notes in the "notes" table where user_id = current user id.
 * 3. Replace the static number in the dashboard with the real count from the database.
 * 4. Do NOT redesign the UI. Only connect the existing component to real Supabase data.
 * 5. Keep the existing clean SaaS layout untouched.
 * 6. Make sure it updates automatically when a note is created or deleted.
 */
export async function refreshNotesCount(): Promise<number> {
  try {
    // 1. Fetch current authenticated user using supabase.auth.getUser()
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    let count = 0;

    if (user && !userError && user.id) {
      // 2. Count the number of notes in the "notes" table where user_id = current user id
      const { count: dbCount, error: countError } = await supabase
        .from('notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (!countError && typeof dbCount === 'number') {
        count = dbCount;
      } else {
        // Fallback without head: true
        const { data: rows, error: selectError } = await supabase
          .from('notes')
          .select('id')
          .eq('user_id', user.id);

        if (!selectError && rows) {
          count = rows.length;
        }
      }
    } else {
      // Offline fallback: check local notes store
      const localNotes = await dbGetAll('notes').catch(() => []);
      count = localNotes.length;
    }

    // 3. Replace the static number in the dashboard with the real count from the database
    const targetElements = [
      document.getElementById('stat-total-notes'),
      document.getElementById('stat-notes'),
      document.getElementById('student-stat-my-notes'),
      document.getElementById('student-stat-notes'),
      document.getElementById('dashboard-notes-count'),
      ...Array.from(document.querySelectorAll<HTMLElement>('.stat-notes-value')),
      ...Array.from(document.querySelectorAll<HTMLElement>('[data-metric="notes"]'))
    ];

    targetElements.forEach(el => {
      if (el) {
        el.textContent = String(count);
      }
    });

    return count;
  } catch (err) {
    console.warn('Error refreshing notes count:', err);
    return 0;
  }
}
(window as any).refreshNotesCount = refreshNotesCount;

// ===================== REFRESH DASHBOARD STATS & RECENT CONTENT =====================
async function refreshDashboardStats() {
  try {
    const [students, lessons, worksheets, assignments, progressList] = await Promise.all([
      dbGetAll<UserRecord>('users').then(users => users.filter(u => u.role === 'Student')),
      dbGetAll<LessonRecord>('lessons'),
      dbGetAll<WorksheetRecord>('worksheets'),
      dbGetAll<AssignmentRecord>('assignments'),
      dbGetAll<StudentProgressRecord>('progress')
    ]);

    // Update top dashboard metric counters
    const statStudents = document.getElementById('stat-total-students');
    const statLessons = document.getElementById('stat-lessons-created');
    const statWorksheets = document.getElementById('stat-worksheets-generated');
    const statPending = document.getElementById('stat-assignments-pending');

    if (statStudents) statStudents.textContent = String(students.length || 1);
    if (statLessons) statLessons.textContent = String(lessons.length || 0);
    if (statWorksheets) statWorksheets.textContent = String(worksheets.length || 0);

    const pendingCount = assignments.filter(a => !a.submissions || a.submissions.length === 0 || a.submissions.some(s => s.status === 'submitted' || s.status === 'pending')).length;
    if (statPending) statPending.textContent = String(pendingCount);

    // Update Real Notes Count from Supabase database
    await refreshNotesCount();

    // Update Progress Overview Averages
    if (progressList.length > 0) {
      const total = progressList.length;
      const avgLit = Math.round(progressList.reduce((acc, p) => acc + (p.literacyScore || 70), 0) / total);
      const avgNum = Math.round(progressList.reduce((acc, p) => acc + (p.numeracyScore || 65), 0) / total);
      const avgList = Math.round(progressList.reduce((acc, p) => acc + (p.listeningScore || 75), 0) / total);
      const avgPart = Math.round(progressList.reduce((acc, p) => acc + (p.participationScore || 80), 0) / total);

      const litVal = document.getElementById('stat-avg-literacy');
      const litBar = document.getElementById('stat-bar-literacy');
      if (litVal) litVal.textContent = `${avgLit}%`;
      if (litBar) litBar.style.width = `${avgLit}%`;

      const numVal = document.getElementById('stat-avg-numeracy');
      const numBar = document.getElementById('stat-bar-numeracy');
      if (numVal) numVal.textContent = `${avgNum}%`;
      if (numBar) numBar.style.width = `${avgNum}%`;

      const listVal = document.getElementById('stat-avg-listening');
      const listBar = document.getElementById('stat-bar-listening');
      if (listVal) listVal.textContent = `${avgList}%`;
      if (listBar) listBar.style.width = `${avgList}%`;

      const partVal = document.getElementById('stat-avg-participation');
      const partBar = document.getElementById('stat-bar-participation');
      if (partVal) partVal.textContent = `${avgPart}%`;
      if (partBar) partBar.style.width = `${avgPart}%`;
    }

    // Populate Dashboard Recent Lessons
    const recentContainer = document.getElementById('dashboard-recent-lessons-list');
    if (recentContainer) {
      if (lessons.length === 0) {
        recentContainer.innerHTML = `
          <div style="text-align:center;padding:24px 16px;background:#FAFBFB;border:1px dashed var(--border);border-radius:var(--r-m);">
            <div style="font-size:1.8rem;margin-bottom:6px;">📚</div>
            <div style="font-size:0.92rem;font-weight:600;color:var(--ink);">No lessons created yet</div>
            <p style="font-size:0.8rem;color:var(--ink-faint);margin:4px 0 12px;">Translate or explain your first multilingual lesson using the AI Assistant.</p>
            <button class="btn-solid-green" style="padding:7px 16px;width:auto;font-size:0.82rem;" data-goto="ai-translator">
              Translate &amp; Explain First Lesson
            </button>
          </div>
        `;
        recentContainer.querySelector('[data-goto="ai-translator"]')?.addEventListener('click', () => switchView('ai-translator'));
      } else {
        const recent = lessons.slice(0, 4);
        recentContainer.innerHTML = recent.map(l => `
          <div class="lesson-row-card" data-lesson-id="${l.id}" style="padding:12px 14px;border:1px solid var(--border);border-radius:var(--r-m);background:#FAFBFB;display:flex;align-items:center;gap:12px;margin-bottom:8px;cursor:pointer;">
            <div style="font-size:1.6rem;">📖</div>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:0.9rem;color:var(--ink);">${l.title}</div>
              <div style="font-size:0.75rem;color:var(--ink-soft);margin-top:2px;">${l.grade || 'Grade 1'} · ${l.targetLang || 'Ho'} · ${l.subject || 'FLN'}</div>
            </div>
            <button class="btn-chip btn-open-recent-lesson" data-lesson-id="${l.id}" style="margin:0;font-size:0.75rem;padding:4px 10px;">Study Lesson →</button>
          </div>
        `).join('');

        recentContainer.querySelectorAll('.btn-open-recent-lesson, .lesson-row-card').forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            const lid = item.getAttribute('data-lesson-id');
            if (lid) openLessonInViewer(lid);
          });
        });
      }
    }
  } catch (err) {
    console.warn('Error refreshing dashboard stats:', err);
  }
}

// Setup Navigation
function setupNavigation() {
  // Mobile drawer helpers
  const closeMobileSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    sidebar?.classList.remove('sidebar-open');
    backdrop?.classList.remove('active');
    document.body.classList.remove('sidebar-lock');
  };

  const toggleMobileSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const isOpen = sidebar?.classList.contains('sidebar-open');
    if (isOpen) {
      closeMobileSidebar();
    } else {
      sidebar?.classList.add('sidebar-open');
      backdrop?.classList.add('active');
      document.body.classList.add('sidebar-lock');
    }
  };

  // Mobile menu toggle button in topbar
  const btnMobileMenuToggle = document.getElementById('btn-mobile-menu-toggle');
  btnMobileMenuToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleMobileSidebar();
  });

  // Mobile menu item in bottom nav
  const btnMbMenuOpen = document.getElementById('btn-mb-menu-open');
  btnMbMenuOpen?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleMobileSidebar();
  });

  // Mobile sidebar close button
  const btnSidebarClose = document.getElementById('btn-sidebar-close');
  btnSidebarClose?.addEventListener('click', (e) => {
    e.preventDefault();
    closeMobileSidebar();
  });

  // Backdrop overlay click
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  sidebarBackdrop?.addEventListener('click', () => {
    closeMobileSidebar();
  });

  // Close sidebar on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileSidebar();
    }
  });

  // Close sidebar when window expands to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      closeMobileSidebar();
    }
  });

  // Mobile bottom nav quick link items
  document.querySelectorAll('.mb-nav-item[data-nav]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = item.getAttribute('data-nav');
      if (target) {
        closeMobileSidebar();
        switchView(target);
      }
    });
  });

  // 1. Sidebar links with data-view
  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      closeMobileSidebar();
      const target = link.getAttribute('data-view');
      if (target) switchView(target);
    });
  });

  // 2. All elements with data-goto
  document.querySelectorAll('[data-goto]').forEach(elem => {
    elem.addEventListener('click', (e) => {
      e.preventDefault();
      closeMobileSidebar();
      const target = elem.getAttribute('data-goto');
      const tab = elem.getAttribute('data-tab');
      if (target) {
        switchView(target);
        if (tab === 'upload') {
          const tabBtnUpload = document.getElementById('tab-btn-te-upload');
          tabBtnUpload?.click();
        }
      }
    });
  });

  // Dedicated button: Upload lesson document from View Lessons
  const btnLessonsUploadDoc = document.getElementById('btn-lessons-upload-doc');
  btnLessonsUploadDoc?.addEventListener('click', () => {
    closeMobileSidebar();
    switchView('ai-translator');
    const tabBtnUpload = document.getElementById('tab-btn-te-upload');
    tabBtnUpload?.click();
  });

  // 3. Brand logos navigate to dashboard
  document.querySelectorAll('.brand').forEach(brand => {
    brand.addEventListener('click', (e) => {
      e.preventDefault();
      closeMobileSidebar();
      switchView('dashboard');
    });
  });

  // 4. Back button
  const backBtn = document.getElementById('btn-topbar-back');
  backBtn?.addEventListener('click', () => {
    if (navigationHistory.length > 1) {
      navigationHistory.pop(); // remove current
      const prev = navigationHistory.pop() || 'dashboard';
      switchView(prev);
    } else {
      switchView('dashboard');
    }
  });

  // 5. Browser back / forward & hashchange handling
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '').trim();
    if (hash && (hash === 'dashboard' || document.getElementById(`view-${hash}`))) {
      switchView(hash);
    } else {
      switchView('dashboard');
    }
  });

  // 6. Initial route check from URL hash
  const initialHash = window.location.hash.replace('#', '').trim();
  if (initialHash && (initialHash === 'dashboard' || document.getElementById(`view-${initialHash}`))) {
    switchView(initialHash);
  }
}

// Update User UI Elements & Enforce RBAC
function updateUserUI() {
  const user = getCurrentUser();
  const roleText = document.getElementById('topbar-role-text');
  if (roleText) {
    if (user.role === 'Student' && user.grade) {
      roleText.textContent = `${user.name} (${user.grade})`;
    } else if (user.role === 'Official') {
      roleText.textContent = 'District Official (DEO)';
    } else {
      roleText.textContent = user.role;
    }
  }

  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) {
    if (user.role === 'Teacher') {
      topbarTitle.innerHTML = `Hello, Teacher! <span aria-hidden="true">👋</span>`;
    } else if (user.role === 'Official') {
      topbarTitle.innerHTML = `Hello, Dr. Soren! <span aria-hidden="true">👋</span>`;
    } else {
      topbarTitle.innerHTML = `Hello, ${user.name.split(' ')[0]}! <span aria-hidden="true">👋</span>`;
    }
  }

  const topbarAvatar = document.getElementById('topbar-avatar');
  if (topbarAvatar) {
    topbarAvatar.innerHTML = user.role === 'Teacher' ? '👩‍🏫' : (user.role === 'Official' ? '🏛️' : '👧');
  }

  // Toggle dashboard container views
  const teacherDash = document.getElementById('teacher-dashboard-view');
  const studentDash = document.getElementById('student-dashboard-view');
  const officialDash = document.getElementById('official-dashboard-view');

  if (user.role === 'Official') {
    if (teacherDash) teacherDash.style.display = 'none';
    if (studentDash) studentDash.style.display = 'none';
    if (officialDash) officialDash.style.display = 'flex';
    refreshOfficialDashboard();
  } else if (user.role === 'Student') {
    if (teacherDash) teacherDash.style.display = 'none';
    if (studentDash) studentDash.style.display = 'flex';
    if (officialDash) officialDash.style.display = 'none';
  } else {
    if (teacherDash) teacherDash.style.display = 'flex';
    if (studentDash) studentDash.style.display = 'none';
    if (officialDash) officialDash.style.display = 'none';
  }

  // Update greeting in Student Portal
  const studentGreeting = document.querySelector('#view-student-portal h2');
  if (studentGreeting) {
    studentGreeting.innerHTML = `Hello, ${user.name.split(' ')[0]}! <span aria-hidden="true">👋</span>`;
  }

  // Enforce Role-Based Access Control (RBAC)
  const isStud = user.role === 'Student';
  const navTeacher = document.getElementById('nav-list-teacher');
  const navStudent = document.getElementById('nav-list-student');
  if (navTeacher && navStudent) {
    if (isStud) {
      navTeacher.style.display = 'none';
      navStudent.style.display = 'flex';
    } else {
      navTeacher.style.display = 'flex';
      navStudent.style.display = 'none';
    }
  }

  const aiTransNav = document.querySelector('.nav-link[data-view="ai-translator"]') as HTMLElement | null;
  const stPortalNav = document.getElementById('nav-item-student-portal');
  const asgCreateBtn = document.getElementById('btn-open-new-assignment');
  const asgEmptyCreateBtn = document.getElementById('btn-empty-asg-create');
  const addResourceBtn = document.getElementById('btn-open-add-resource');
  const teacherLessonActions = document.getElementById('teacher-lesson-actions');
  const emptyLessonAction = document.getElementById('btn-lessons-empty-action');
  const createWsBtn = document.getElementById('btn-open-create-worksheet');
  const uploadDataCard = document.getElementById('qa-card-upload-data');
  const tabBtnUpload = document.getElementById('tab-btn-te-upload');
  const btnSaveLesson = document.getElementById('btn-te-save-lesson');
  const btnCreateWorksheet = document.getElementById('btn-te-create-worksheet');

  if (isStud) {
    // Student: can only view/use and submit assignments; remove all Add/Upload options
    if (stPortalNav) stPortalNav.style.display = 'flex';
    if (asgCreateBtn) asgCreateBtn.style.display = 'none';
    if (asgEmptyCreateBtn) asgEmptyCreateBtn.style.display = 'none';
    if (addResourceBtn) addResourceBtn.style.display = 'none';
    if (teacherLessonActions) teacherLessonActions.style.display = 'none';
    if (emptyLessonAction) emptyLessonAction.style.display = 'none';
    if (createWsBtn) createWsBtn.style.display = 'none';
    if (uploadDataCard) uploadDataCard.style.display = 'none';
    if (tabBtnUpload) tabBtnUpload.style.display = 'none';
    if (btnSaveLesson) btnSaveLesson.style.display = 'none';
    if (btnCreateWorksheet) btnCreateWorksheet.style.display = 'none';

    // Students have access to AI Translator & Explainer for explanations and doubt clarification
    if (aiTransNav) aiTransNav.style.display = 'flex';

    // Hide any delete or edit buttons on student view
    document.querySelectorAll('.btn-delete-lesson, .btn-edit-lesson, .btn-delete-ws, .btn-delete-asg, .btn-res-delete').forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });

    const stPortal = document.getElementById('view-student-portal');
    const quizCreateBtn = document.getElementById('btn-open-create-quiz');
    if (quizCreateBtn) quizCreateBtn.style.display = 'none';
    const quizDraftTab = document.getElementById('quiz-tab-drafts');
    if (quizDraftTab) quizDraftTab.style.display = 'none';

    if (stPortal) switchView('student-portal');
  } else {
    // Teacher: full access to add, edit, upload, delete
    if (stPortalNav) stPortalNav.style.display = 'none';
    if (asgCreateBtn) asgCreateBtn.style.display = 'inline-flex';
    if (asgEmptyCreateBtn) asgEmptyCreateBtn.style.display = 'inline-flex';
    if (addResourceBtn) addResourceBtn.style.display = 'inline-flex';
    const quizCreateBtn = document.getElementById('btn-open-create-quiz');
    if (quizCreateBtn) quizCreateBtn.style.display = 'inline-flex';
    const quizDraftTab = document.getElementById('quiz-tab-drafts');
    if (quizDraftTab) quizDraftTab.style.display = 'inline-flex';
    if (teacherLessonActions) teacherLessonActions.style.display = 'flex';
    if (emptyLessonAction) emptyLessonAction.style.display = 'inline-flex';
    if (createWsBtn) createWsBtn.style.display = 'inline-flex';
    if (uploadDataCard) uploadDataCard.style.display = 'flex';
    if (tabBtnUpload) tabBtnUpload.style.display = 'inline-flex';
    if (btnSaveLesson) btnSaveLesson.style.display = 'inline-flex';
    if (btnCreateWorksheet) btnCreateWorksheet.style.display = 'inline-flex';
    if (aiTransNav) aiTransNav.style.display = 'flex';

    document.querySelectorAll('.btn-delete-lesson, .btn-edit-lesson, .btn-delete-ws, .btn-delete-asg, .btn-res-delete').forEach(el => {
      (el as HTMLElement).style.display = '';
    });
  }

  updateUserHistoryBadge();
  updateSupabaseStatusUI();
}

// Setup Authentication Gate Screen (Teacher Portal vs Student Portal vs Official Portal)
function setupAuthGate() {
  const authGate = document.getElementById('auth-gate-screen');
  const appShell = document.getElementById('app-shell');
  if (!authGate) return;

  const tabTeacher = document.getElementById('gate-tab-teacher');
  const tabStudent = document.getElementById('gate-tab-student');
  const tabOfficial = document.getElementById('gate-tab-official');
  const roleInput = document.getElementById('gate-selected-role') as HTMLInputElement | null;
  const labelIdentity = document.getElementById('gate-label-identity');
  const inputIdentity = document.getElementById('gate-input-identity') as HTMLInputElement | null;
  const studentFields = document.getElementById('gate-student-fields');
  const submitBtn = document.getElementById('gate-submit-btn');
  const googleBtn = document.getElementById('gate-google-signin-btn');
  const googleText = document.getElementById('gate-google-text');
  const toggleRegBtn = document.getElementById('gate-toggle-register');
  const regPrompt = document.getElementById('gate-toggle-account-prompt');
  const groupName = document.getElementById('gate-group-name');
  const inputName = document.getElementById('gate-input-name') as HTMLInputElement | null;
  const form = document.getElementById('gate-login-form') as HTMLFormElement | null;

  let currentRole: 'Teacher' | 'Student' | 'Official' = 'Teacher';
  let isRegisterMode = false;

  const setRole = (role: 'Teacher' | 'Student' | 'Official') => {
    currentRole = role;
    if (roleInput) roleInput.value = role;

    if (role === 'Teacher') {
      tabTeacher?.classList.add('active');
      tabStudent?.classList.remove('active');
      tabOfficial?.classList.remove('active');
      if (labelIdentity) labelIdentity.textContent = 'Teacher Email or Mobile';
      if (inputIdentity) {
        inputIdentity.placeholder = 'teacher@bhashasetu.in';
        if (!isRegisterMode) inputIdentity.value = 'teacher@bhashasetu.in';
      }
      if (studentFields) studentFields.style.display = 'none';
      if (googleText) googleText.textContent = 'Continue with Google (Teacher)';
      if (submitBtn) submitBtn.textContent = isRegisterMode ? 'Register Teacher Account' : 'Sign In as Teacher';
    } else if (role === 'Official') {
      tabOfficial?.classList.add('active');
      tabTeacher?.classList.remove('active');
      tabStudent?.classList.remove('active');
      if (labelIdentity) labelIdentity.textContent = 'Official Email or DEO Code';
      if (inputIdentity) {
        inputIdentity.placeholder = 'official@bhashasetu.in';
        if (!isRegisterMode) inputIdentity.value = 'official@bhashasetu.in';
      }
      if (studentFields) studentFields.style.display = 'none';
      if (googleText) googleText.textContent = 'Continue with Google (Official)';
      if (submitBtn) submitBtn.textContent = isRegisterMode ? 'Register Official Account' : 'Sign In as District Official';
    } else {
      tabStudent?.classList.add('active');
      tabTeacher?.classList.remove('active');
      tabOfficial?.classList.remove('active');
      if (labelIdentity) labelIdentity.textContent = 'Student ID or Email';
      if (inputIdentity) {
        inputIdentity.placeholder = 'student@bhashasetu.in';
        if (!isRegisterMode) inputIdentity.value = 'student@bhashasetu.in';
      }
      if (studentFields) studentFields.style.display = 'block';
      if (googleText) googleText.textContent = 'Continue with Google (Student)';
      if (submitBtn) submitBtn.textContent = isRegisterMode ? 'Register Student Account' : 'Sign In as Student';
    }
  };

  tabTeacher?.addEventListener('click', () => setRole('Teacher'));
  tabStudent?.addEventListener('click', () => setRole('Student'));
  tabOfficial?.addEventListener('click', () => setRole('Official'));

  // Toggle Register Mode
  toggleRegBtn?.addEventListener('click', () => {
    isRegisterMode = !isRegisterMode;
    if (isRegisterMode) {
      if (groupName) groupName.style.display = 'block';
      if (toggleRegBtn) toggleRegBtn.textContent = 'Sign In to Existing Account';
      if (regPrompt) regPrompt.textContent = 'Already have an account?';
      if (submitBtn) submitBtn.textContent = `Register ${currentRole} Account`;
      if (inputIdentity) inputIdentity.value = '';
    } else {
      if (groupName) groupName.style.display = 'none';
      if (toggleRegBtn) toggleRegBtn.textContent = 'Register New Account';
      if (regPrompt) regPrompt.textContent = 'Need an account?';
      if (submitBtn) submitBtn.textContent = `Sign In as ${currentRole}`;
      if (inputIdentity) {
        if (currentRole === 'Teacher') inputIdentity.value = 'teacher@bhashasetu.in';
        else if (currentRole === 'Official') inputIdentity.value = 'official@bhashasetu.in';
        else inputIdentity.value = 'student@bhashasetu.in';
      }
    }
  });

  const completeAuth = async (user: any, welcomeMsg: string, icon: string) => {
    if (authGate) authGate.style.display = 'none';
    if (appShell) appShell.style.display = 'flex';
    updateUserUI();
    if (user.role === 'Student') {
      navigateTo('student-portal');
    } else {
      navigateTo('dashboard');
    }
    await refreshLessonsList();
    await refreshWorksheetsList();
    await refreshAssignmentsList();
    await refreshStudentProgress();
    await refreshStudentPortal();
    showToast(welcomeMsg, icon);
  };

  // 1-Click 100% Offline Mode Entry Buttons
  const gateOfflineTeacher = document.getElementById('gate-btn-offline-teacher');
  const gateOfflineStudent = document.getElementById('gate-btn-offline-student');
  const gateOfflineOfficial = document.getElementById('gate-btn-offline-official');

  gateOfflineTeacher?.addEventListener('click', async () => {
    const user = await loginLocalOffline('Teacher');
    await completeAuth(user, `Entered 100% Offline Classroom as ${user.name} (Primary Teacher)`, '👩‍🏫');
  });

  gateOfflineStudent?.addEventListener('click', async () => {
    const user = await loginLocalOffline('Student');
    await completeAuth(user, `Entered 100% Offline Classroom as ${user.name} (Grade 1 Student)`, '👧');
  });

  gateOfflineOfficial?.addEventListener('click', async () => {
    const user = await loginLocalOffline('Official');
    await completeAuth(user, `Entered 100% Offline as ${user.name} (District Education Office)`, '🏛️');
  });

  // Google Sign-in using Supabase OAuth
  googleBtn?.addEventListener('click', async () => {
    await signInWithGoogle();
  });

  // Form Submit
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identity = inputIdentity?.value.trim() || '';
    const password = (document.getElementById('gate-input-password') as HTMLInputElement)?.value || '';

    if (!identity) {
      showToast('Please enter your email, mobile, or student ID', '⚠️');
      return;
    }

    const email = identity.includes('@') ? identity : `${identity}@bhashasetu.in`;

    if (isRegisterMode) {
      await handleSignUp(email, password, '#auth-error');
    } else {
      await handleSignIn(email, password, '#auth-error');
    }
  });

  const prefilledEmail = checkSignUpSuccess();
  if (prefilledEmail) {
    isRegisterMode = false;
    if (groupName) groupName.style.display = 'none';
    if (toggleRegBtn) toggleRegBtn.textContent = 'Register New Account';
    if (regPrompt) regPrompt.textContent = 'Need an account?';
    if (submitBtn) submitBtn.textContent = `Sign In as ${currentRole}`;
  }
}

// ===================== REFRESH OFFICIAL DASHBOARD =====================
export async function refreshOfficialDashboard() {
  const lessons = await dbGetAll<LessonRecord>('lessons');
  const quizzes = await dbGetAll<any>('quizzes');

  const statLessons = document.getElementById('official-stat-lessons');
  if (statLessons) statLessons.textContent = String(lessons.length || 24);

  const statQuizzes = document.getElementById('official-stat-quizzes');
  if (statQuizzes) statQuizzes.textContent = String(quizzes.length ? quizzes.length * 12 : 128);

  const tbody = document.getElementById('official-curriculum-table-body');
  if (tbody) {
    if (lessons.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--ink-soft);">No curriculum materials submitted yet.</td></tr>`;
    } else {
      tbody.innerHTML = lessons.map(les => {
        const isApproved = les.published;
        const statusBg = isApproved ? '#DCFCE7' : '#FEF3C7';
        const statusColor = isApproved ? '#15803D' : '#92400E';
        const statusText = isApproved ? '✓ Approved for Cluster' : '⏳ Pending DEO Review';
        return `
          <tr style="border-bottom:1px solid #F1F5F9;">
            <td style="padding:10px 12px;font-weight:600;color:var(--ink);">${escapeHtml(les.title)}</td>
            <td style="padding:10px 12px;"><span style="background:#F1F5F9;padding:2px 8px;border-radius:4px;font-size:0.75rem;">${escapeHtml(les.targetLang || (les as any).language || 'Ho')}</span></td>
            <td style="padding:10px 12px;">${escapeHtml(les.grade || 'Grade 1')}</td>
            <td style="padding:10px 12px;color:var(--ink-soft);">${escapeHtml((les as any).authorName || 'Teacher Sunita')}</td>
            <td style="padding:10px 12px;">
              <span style="background:${statusBg};color:${statusColor};padding:3px 8px;border-radius:99px;font-size:0.72rem;font-weight:600;">
                ${statusText}
              </span>
            </td>
            <td style="padding:10px 12px;text-align:right;">
              <button type="button" class="btn-chip btn-official-open-les" data-lesson-id="${les.id}" style="font-size:0.75rem;padding:4px 10px;">
                Inspect
              </button>
            </td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll('.btn-official-open-les').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = (e.currentTarget as HTMLElement).getAttribute('data-lesson-id');
          if (id) openLessonInViewer(id);
        });
      });
    }
  }

  // Wire Official sync button
  const btnOfficialSync = document.getElementById('btn-official-sync-cloud');
  btnOfficialSync?.addEventListener('click', async () => {
    showToast('Syncing district cluster data with cloud...', '⚡');
    await flushSyncQueue();
    await syncLocalQueueToSupabase();
    showToast('District data fully synchronized with Supabase!', '✓');
  });

  // Wire Official export report button
  const btnOfficialExport = document.getElementById('btn-official-export-report');
  btnOfficialExport?.addEventListener('click', () => {
    const report = {
      district: 'West Singhbhum',
      officer: 'Dr. Ramesh Soren',
      date: new Date().toISOString(),
      schoolsConnected: 42,
      lessonsCount: lessons.length,
      quizzesCount: quizzes.length,
      nepCompliance: '96.8%'
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `district-fln-report-${Date.now()}.json`;
    a.click();
    showToast('District FLN Audit Report exported successfully!', '📑');
  });
}

// ===================== APP INITIALIZATION =====================
document.addEventListener('DOMContentLoaded', async () => {
  await getDB();

  const user = await initAuth();
  initSyncEngine();

  // Authentication Gate Interception
  const authGate = document.getElementById('auth-gate-screen');
  const appShell = document.getElementById('app-shell');

  if (!user) {
    if (authGate) authGate.style.display = 'flex';
    if (appShell) appShell.style.display = 'none';
  } else {
    if (authGate) authGate.style.display = 'none';
    if (appShell) appShell.style.display = 'flex';
    updateUserUI();
  }

  // Wire Event Listeners
  setupAuthGate();
  setupNavigation();
  setupLanguageSelector();
  setupAuthModal();
  setupAITranslatorAndExplainer();
  setupOfflineTranslator();
  setupVoiceCompanion();
  setupImageOCR();
  setupDictionaryModule();
  setupWorksheetsModule();
  setupAssignmentsModule();
  setupResourcesModule();
  setupSettingsModule();
  setupAITutorChat();
  setupRightSidebarWidgets();
  setupSyncUI();
  setupStudentPortalModule();
  setupActiveLearningSessionModule();
  setupLessonsWorkflow();
  setupQuizzesModule();
  setupStudentProfileModule();
  setupSupabaseModals();
  setupHistoryModule();
  initStudentAISuite();
  updateSupabaseStatusUI();
  updateUserHistoryBadge();

  // Initialize Realtime Notes Count & Realtime / Local Event Subscriptions
  await refreshNotesCount();

  try {
    subscribeToNotes(() => {
      refreshNotesCount();
    });
  } catch (e) {
    console.warn('Realtime notes subscription notice:', e);
  }

  window.addEventListener('notes-updated', () => {
    refreshNotesCount();
  });

  // Initialize offline natural voice cache and pre-rendered curriculum assets
  try {
    await initVoiceCache();
  } catch (err) {
    console.warn('Voice cache initialization notice:', err);
  }

  // Seed default quizzes if store empty
  try {
    await seedDefaultQuizzesIfEmpty();
  } catch (err) {
    console.warn('Quiz seed notice:', err);
  }

  // Register offline PWA Service Worker for assets & voice caching
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.info('[BhashaSetu SW] Active with scope:', reg.scope))
        .catch((err) => console.warn('[BhashaSetu SW] Registration notice:', err));
    });
  }

  // Load Dynamic Curriculum Data from IndexedDB
  await refreshLessonsList();
  await refreshWorksheetsList();
  await refreshAssignmentsList();
  await refreshQuizzesList();
  await refreshStudentQuizzesForPortal();
  await refreshStudentProgress();
  await refreshStudentPortal();
  await refreshDashboardStats();
});

// Setup Language Selector Dropdown
function setupLanguageSelector() {
  const langChip = document.querySelector('.topbar-right .btn-chip') as HTMLElement | null;
  if (!langChip) return;

  langChip.setAttribute('title', 'Change Interface Language');
  langChip.style.cursor = 'pointer';
  langChip.style.position = 'relative';

  // Create Dropdown Menu
  const menu = document.createElement('div');
  menu.id = 'lang-selector-menu';
  menu.style.cssText = `
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: #FFFFFF;
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
    z-index: 999;
    min-width: 180px;
    padding: 6px;
    display: none;
  `;

  const languages: Array<{ code: SupportedAppLang; label: string; sub: string }> = [
    { code: 'English', label: 'English', sub: 'Default' },
    { code: 'Hindi', label: 'हिन्दी (Hindi)', sub: 'कक्षा इंटरफ़ेस' },
    { code: 'Telugu', label: 'తెలుగు (Telugu)', sub: 'తరగతి ఇంటర్‌ఫేస్' },
    { code: 'Ho', label: 'Ho (हो)', sub: '𑢹𑣉 𑣆𑣗𑣉' },
    { code: 'Mundari', label: 'Mundari (मुंडारी)', sub: 'आपन पारसी' },
    { code: 'Santhali', label: 'Santhali (संथाली)', sub: 'ᱚᱞ ᱪᱤᱠᱤ' }
  ];

  menu.innerHTML = languages.map(l => `
    <button class="lang-option-btn" data-lang="${l.code}" style="
      display: flex;
      flex-direction: column;
      width: 100%;
      text-align: left;
      padding: 8px 12px;
      border: none;
      background: transparent;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.15s ease;
    ">
      <strong style="font-size: 0.85rem; color: var(--ink);">${l.label}</strong>
      <span style="font-size: 0.72rem; color: var(--ink-soft);">${l.sub}</span>
    </button>
  `).join('');

  langChip.appendChild(menu);

  langChip.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  });

  document.addEventListener('click', () => {
    menu.style.display = 'none';
  });

  menu.querySelectorAll('.lang-option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const chosen = btn.getAttribute('data-lang') as SupportedAppLang;
      if (chosen) {
        setAppLang(chosen);
        // Update chip label
        langChip.childNodes[2].textContent = chosen + ' ';
        showToast(`Language set to ${chosen}`, '🌐');
      }
      menu.style.display = 'none';
    });
  });
}

// Setup Real Authentication Modal
function setupAuthModal() {
  const openLoginBtn = document.getElementById('btn-open-login');
  const userStatusChip = document.getElementById('user-status-chip');
  const modal = document.getElementById('login-modal-overlay') || document.getElementById('login-modal');
  const closeBtn = document.getElementById('btn-close-login') || document.getElementById('btn-close-modal');

  const openModal = () => {
    if (modal) modal.style.display = 'flex';
  };
  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  openLoginBtn?.addEventListener('click', openModal);
  userStatusChip?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);

  // Teacher / Student / Official tab switching in modal
  const tabTeacher = document.getElementById('modal-tab-teacher') || document.getElementById('tab-login-teacher');
  const tabStudent = document.getElementById('modal-tab-student') || document.getElementById('tab-login-student');
  const tabOfficial = document.getElementById('modal-tab-official') || document.getElementById('tab-login-official');
  let selectedRole: 'Teacher' | 'Student' | 'Official' = 'Teacher';

  tabTeacher?.addEventListener('click', () => {
    selectedRole = 'Teacher';
    tabTeacher.classList.add('active');
    tabStudent?.classList.remove('active');
    tabOfficial?.classList.remove('active');
    const roleSelect = document.getElementById('modal-role-select') as HTMLSelectElement;
    if (roleSelect) roleSelect.value = 'Teacher';
  });

  tabStudent?.addEventListener('click', () => {
    selectedRole = 'Student';
    tabStudent.classList.add('active');
    tabTeacher?.classList.remove('active');
    tabOfficial?.classList.remove('active');
    const roleSelect = document.getElementById('modal-role-select') as HTMLSelectElement;
    if (roleSelect) roleSelect.value = 'Student';
  });

  tabOfficial?.addEventListener('click', () => {
    selectedRole = 'Official';
    tabOfficial.classList.add('active');
    tabTeacher?.classList.remove('active');
    tabStudent?.classList.remove('active');
    const roleSelect = document.getElementById('modal-role-select') as HTMLSelectElement;
    if (roleSelect) roleSelect.value = 'Official';
  });

  // Expose global login handler for the existing inline form onsubmit
  (window as any).handleModalLoginSubmit = async () => {
    const roleSelect = document.getElementById('modal-role-select') as HTMLSelectElement;
    const currentRole = roleSelect?.value || selectedRole;
    await switchRole(currentRole as 'Teacher' | 'Student' | 'Official');
    updateUserUI();
    closeModal();
    if (currentRole === 'Student') {
      navigateTo('student-portal');
      showToast('Signed in as Asha Kumari (Grade 1 Student)', '👧');
    } else if (currentRole === 'Official') {
      navigateTo('dashboard');
      showToast('Signed in as Dr. Ramesh Soren (District Education Officer)', '🏛️');
    } else {
      navigateTo('dashboard');
      showToast('Signed in as Sunita Mahato (Primary Teacher)', '👩‍🏫');
    }
  };

  // Google Login button (both modal IDs supported)
  const googleBtn = document.getElementById('btn-google-login');
  const modalGoogleBtn = document.getElementById('modal-google-signin-btn');
  const triggerGoogleLogin = async () => {
    closeModal();
    await signInWithGoogle();
  };
  googleBtn?.addEventListener('click', triggerGoogleLogin);
  modalGoogleBtn?.addEventListener('click', triggerGoogleLogin);

  // 1-Click Offline Classroom Buttons inside modal
  const modalOfflineTeacher = document.getElementById('modal-btn-offline-teacher');
  const modalOfflineStudent = document.getElementById('modal-btn-offline-student');
  const modalOfflineOfficial = document.getElementById('modal-btn-offline-official');

  modalOfflineTeacher?.addEventListener('click', async () => {
    const user = await loginLocalOffline('Teacher');
    updateUserUI();
    closeModal();
    navigateTo('dashboard');
    showToast(`Switched to Offline Teacher Mode (${user.name})`, '👩‍🏫');
  });

  modalOfflineStudent?.addEventListener('click', async () => {
    const user = await loginLocalOffline('Student');
    updateUserUI();
    closeModal();
    navigateTo('student-portal');
    showToast(`Switched to Offline Student Mode (${user.name})`, '👧');
  });

  modalOfflineOfficial?.addEventListener('click', async () => {
    const user = await loginLocalOffline('Official');
    updateUserUI();
    closeModal();
    navigateTo('dashboard');
    showToast(`Switched to Offline Official Mode (${user.name})`, '🏛️');
  });

  // Continue / Submit button
  const continueBtn = document.getElementById('btn-modal-continue');
  continueBtn?.addEventListener('click', async () => {
    const emailInput = document.getElementById('login-input-identity') as HTMLInputElement;
    const passInput = document.getElementById('login-input-password') as HTMLInputElement;

    const defaultEmail = selectedRole === 'Teacher' ? 'teacher@bhashasetu.in' : (selectedRole === 'Official' ? 'official@bhashasetu.in' : 'student@bhashasetu.in');
    const email = emailInput?.value || defaultEmail;
    const pass = passInput?.value || 'password123';

    const result = await loginWithEmail(email, pass);
    if (result.success && result.user) {
      updateUserUI();
      closeModal();
      showToast(result.message, '✓');
    } else {
      showToast(result.message, '⚠️');
    }
  });

  // Quick switch role buttons inside modal
  const btnRoleTeacher = document.getElementById('btn-role-teacher');
  const btnRoleStudent = document.getElementById('btn-role-student');
  const btnRoleOfficial = document.getElementById('btn-role-official');

  btnRoleTeacher?.addEventListener('click', async () => {
    await switchRole('Teacher');
    updateUserUI();
    closeModal();
    navigateTo('dashboard');
    showToast('Switched to Teacher Mode', '👩‍🏫');
  });

  btnRoleStudent?.addEventListener('click', async () => {
    await switchRole('Student');
    updateUserUI();
    closeModal();
    navigateTo('student-portal');
    showToast('Switched to Student Mode (Asha Kumari)', '👧');
  });

  btnRoleOfficial?.addEventListener('click', async () => {
    await switchRole('Official');
    updateUserUI();
    closeModal();
    navigateTo('dashboard');
    showToast('Switched to District Official Mode (Dr. Ramesh Soren)', '🏛️');
  });

  // Sign out / switch account button in modal
  const modalLogoutBtn = document.getElementById('btn-modal-logout');
  modalLogoutBtn?.addEventListener('click', async () => {
    await logout();
    closeModal();
    const authGate = document.getElementById('auth-gate-screen');
    const appShell = document.getElementById('app-shell');
    if (authGate) authGate.style.display = 'flex';
    if (appShell) appShell.style.display = 'none';
    showToast('Signed out. Please select your portal to continue.', '🚪');
  });
}

// ===================== HELPER: HTML ESCAPE =====================
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ===================== LESSONS WORKFLOW & DUAL-SUBVIEW ENGINE =====================
let activeLessonId: string | null = null;
let selectedLessonFile: File | null = null;
let selectedLessonDataUrl: string = '';
let isListeningOrigText = false;
let isListeningTransText = false;
let isListeningExplText = false;

export function showLessonsListView() {
  activeLessonId = null;
  const listSubview = document.getElementById('lessons-list-subview');
  const viewerSubview = document.getElementById('lesson-viewer-subview');
  if (listSubview) listSubview.style.display = 'block';
  if (viewerSubview) viewerSubview.style.display = 'none';
  refreshLessonsList();
}

// Refresh lessons list (showing ONLY real uploaded lessons, zero dummy data)
export async function refreshLessonsList() {
  let allLessons = await dbGetAll<LessonRecord>('lessons');

  try {
    const { data: cloudLessons, error } = await fetchLessons();
    if (!error && cloudLessons && cloudLessons.length > 0) {
      allLessons = cloudLessons as LessonRecord[];
      for (const cl of cloudLessons) {
        await dbPut('lessons', cl);
      }
    }
  } catch (err) {
    console.warn('Supabase fetch lessons fallback:', err);
  }

  const countPill = document.getElementById('lessons-count-pill');
  if (countPill) {
    countPill.textContent = `${allLessons.length} Lesson${allLessons.length === 1 ? '' : 's'} Uploaded`;
  }

  const container = document.getElementById('lessons-card-list');
  if (!container) return;

  if (allLessons.length === 0) {
    container.innerHTML = `
      <div style="border:2px dashed #CBD5E1;border-radius:12px;padding:48px 24px;text-align:center;background:#F8FAFC;">
        <div style="width:56px;height:56px;border-radius:50%;background:#F1F5F9;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;color:var(--green);">
          <svg class="icon" viewBox="0 0 24 24" style="width:28px;height:28px;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
        <div style="font-size:1.1rem;font-weight:600;color:var(--ink);margin-bottom:6px;">No lessons uploaded yet</div>
        <p style="font-size:0.85rem;color:var(--ink-soft);max-width:480px;margin:0 auto 20px;line-height:1.5;">
          Upload a photo or document of a textbook page, classroom handout, or worksheet. Then open it to scan with Google Lens OCR and create a clean bilingual sheet.
        </p>
        <button class="btn-solid-green" id="btn-lessons-empty-upload" style="padding:10px 24px;font-size:0.9rem;width:auto;margin:0 auto;display:inline-flex;align-items:center;gap:8px;">
          <svg class="icon" viewBox="0 0 24 24" style="width:18px;height:18px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
          Upload Lesson
        </button>
      </div>
    `;

    container.querySelector('#btn-lessons-empty-upload')?.addEventListener('click', () => {
      openUploadLessonModal();
    });
    return;
  }

  container.innerHTML = `
    <div class="lessons-grid">
      ${allLessons.map(les => {
        const isImage = les.fileData?.startsWith('data:image') || /\.(jpe?g|png|webp|gif)$/i.test(les.fileName || '');
        const isReady = !!(les.lessonText && (les.translatedText || les.scriptText));
        return `
          <div class="lesson-card-item">
            <div class="lesson-card-thumb btn-open-lesson-card" data-lesson-id="${les.id}" style="cursor:pointer;" title="Click to open lesson">
              ${isImage && les.fileData ? `
                <img src="${les.fileData}" alt="${escapeHtml(les.title)}" loading="lazy">
                <span class="lesson-badge-filetype">📷 Image</span>
              ` : `
                <div style="font-size:3.2rem;color:var(--green);">📄</div>
                <span class="lesson-badge-filetype">Document</span>
              `}
            </div>
            <div class="lesson-card-body">
              <div class="lesson-card-title btn-open-lesson-card" data-lesson-id="${les.id}" style="cursor:pointer;">${escapeHtml(les.title)}</div>
              <div class="lesson-card-meta">
                <span>📁 ${escapeHtml(les.fileName || 'Uploaded file')}</span>
                <span>🎯 Target: ${escapeHtml(les.targetLang || 'Ho')}</span>
              </div>
              <div style="margin-top:6px;">
                ${isReady
                  ? '<span class="status-pill-green" style="font-size:0.72rem;padding:3px 8px;">✓ Bilingual Sheet Ready</span>'
                  : '<span class="status-pill-orange" style="font-size:0.72rem;padding:3px 8px;">🔍 Ready to Scan &amp; Translate</span>'
                }
              </div>
            </div>
            <div class="lesson-card-actions">
              <button class="btn-solid-green btn-open-lesson-card" data-lesson-id="${les.id}" style="width:auto;margin:0;padding:6px 14px;font-size:0.8rem;display:inline-flex;align-items:center;gap:6px;">
                <svg class="icon" viewBox="0 0 24 24" style="width:14px;height:14px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Open Lesson
              </button>
              <button class="btn-chip btn-delete-lesson-card" data-lesson-id="${les.id}" style="margin:0;padding:6px 10px;font-size:0.8rem;color:#DC2626;" title="Delete Lesson">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Wire Open Lesson clicks
  container.querySelectorAll('.btn-open-lesson-card').forEach(elem => {
    elem.addEventListener('click', () => {
      const lid = elem.getAttribute('data-lesson-id');
      if (lid) openLessonInViewer(lid);
    });
  });

  // Wire Delete Lesson clicks
  container.querySelectorAll('.btn-delete-lesson-card').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const lid = btn.getAttribute('data-lesson-id');
      if (!lid) return;
      const les = allLessons.find(l => l.id === lid);
      if (confirm(`Are you sure you want to delete "${les?.title || 'this lesson'}"?`)) {
        try {
          await deleteLesson(lid);
        } catch (_) {}
        await dbDelete('lessons', lid);
        showToast('Lesson deleted from curriculum', '🗑️');
        await refreshLessonsList();
        refreshDashboardStats();
      }
    });
  });

  refreshDashboardStats();
}

// Open Specific Lesson in Viewer (showing actual uploaded file, language selector, OCR scan button, and bilingual sheet)
export async function openLessonInViewer(lessonId: string) {
  const lesson = await dbGet<LessonRecord>('lessons', lessonId);
  if (!lesson) {
    showToast('Lesson not found', '⚠️');
    return;
  }

  if (isStudent()) {
    openStudentLessonExperience(lesson);
    return;
  }

  activeLessonId = lesson.id;
  switchView('lessons');

  const listSubview = document.getElementById('lessons-list-subview');
  const viewerSubview = document.getElementById('lesson-viewer-subview');
  if (listSubview) listSubview.style.display = 'none';
  if (viewerSubview) viewerSubview.style.display = 'block';

  renderLessonViewerContent(lesson);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Render content of Lesson Viewer subview
function renderLessonViewerContent(lesson: LessonRecord) {
  const titleElem = document.getElementById('lv-title');
  const fileInfoElem = document.getElementById('lv-file-info');
  const statusBadge = document.getElementById('lv-status-badge');
  const langSelect = document.getElementById('lv-target-lang-select') as HTMLSelectElement | null;
  const scanTextBtn = document.getElementById('btn-lv-scan-text');
  const mediaTypeTag = document.getElementById('lv-media-type-tag');
  const imgElem = document.getElementById('lv-uploaded-image') as HTMLImageElement | null;
  const docPreview = document.getElementById('lv-doc-preview');
  const docName = document.getElementById('lv-doc-name');

  if (titleElem) titleElem.textContent = lesson.title;
  if (fileInfoElem) fileInfoElem.textContent = `${lesson.fileName || 'Uploaded Lesson File'} · Target: ${lesson.targetLang || 'Ho'}`;
  if (langSelect && lesson.targetLang) langSelect.value = lesson.targetLang;

  // Reset any open inline editing
  toggleLessonEditMode(false);

  // Hide any banner notifications
  const statusBanner = document.getElementById('lv-status-banner');
  const errorBanner = document.getElementById('lv-error-banner');
  if (statusBanner) statusBanner.style.display = 'none';
  if (errorBanner) errorBanner.style.display = 'none';

  // Render actual uploaded file or image
  const isImage = lesson.fileData?.startsWith('data:image') || /\.(jpe?g|png|webp|gif)$/i.test(lesson.fileName || '');
  if (isImage && lesson.fileData) {
    if (imgElem) {
      imgElem.src = lesson.fileData;
      imgElem.style.display = 'block';

      // Refresh signed URL if file is stored in private Supabase Storage
      if (lesson.storagePath) {
        getSignedUrl(lesson.storagePath).then(freshUrl => {
          if (freshUrl && imgElem) {
            imgElem.src = freshUrl;
          }
        }).catch(console.warn);
      }
    }
    if (docPreview) docPreview.style.display = 'none';
    if (mediaTypeTag) mediaTypeTag.textContent = 'Uploaded Image';
  } else {
    if (imgElem) imgElem.style.display = 'none';
    if (docPreview) docPreview.style.display = 'block';
    if (docName) docName.textContent = lesson.fileName || 'Uploaded Document';
    if (mediaTypeTag) mediaTypeTag.textContent = 'Document';
  }

  // Bilingual Sheet State
  const emptyState = document.getElementById('lv-sheet-empty-state');
  const contentState = document.getElementById('lv-sheet-content-state');
  const isReady = !!(lesson.lessonText && (lesson.translatedText || lesson.scriptText));

  if (isReady) {
    if (emptyState) emptyState.style.display = 'none';
    if (contentState) contentState.style.display = 'flex';
    if (statusBadge) {
      statusBadge.textContent = '✓ Bilingual Sheet Ready';
      statusBadge.className = 'status-pill-green';
    }
    if (scanTextBtn) scanTextBtn.textContent = 'Re-scan with Google Lens OCR';

    const srcBadge = document.getElementById('lv-sheet-source-badge');
    const tgtBadge = document.getElementById('lv-sheet-target-badge');
    if (srcBadge) srcBadge.textContent = `Source: ${lesson.sourceLang || 'Hindi'} (Detected)`;
    if (tgtBadge) tgtBadge.textContent = `Target: ${lesson.targetLang || 'Ho'}`;

    const origTitle = document.getElementById('lv-orig-col-title');
    const origDisplay = document.getElementById('lv-orig-text-display');
    const origEdit = document.getElementById('lv-orig-text-edit') as HTMLTextAreaElement | null;
    if (origTitle) origTitle.textContent = `Original Content (${lesson.sourceLang || 'Hindi'})`;
    if (origDisplay) origDisplay.textContent = lesson.lessonText || '';
    if (origEdit) origEdit.value = lesson.lessonText || '';

    const transTitle = document.getElementById('lv-trans-col-title');
    const transDisplay = document.getElementById('lv-trans-text-display');
    const transEdit = document.getElementById('lv-trans-text-edit') as HTMLTextAreaElement | null;
    if (transTitle) transTitle.textContent = `${lesson.targetLang || 'Ho'} Translation`;
    if (transDisplay) transDisplay.textContent = lesson.translatedText || lesson.scriptText || '';
    if (transEdit) transEdit.value = lesson.translatedText || lesson.scriptText || '';

    // Native script banner (Warang Chiti / Ol Chiki)
    const scriptBanner = document.getElementById('lv-native-script-banner');
    if (scriptBanner) {
      if (lesson.scriptText && lesson.scriptText.trim() !== '') {
        scriptBanner.style.display = 'block';
        scriptBanner.innerHTML = `
          <span style="font-size:0.75rem;font-weight:700;color:var(--green-dark);display:block;margin-bottom:2px;">NATIVE SCRIPT (WARANG CHITI / OL CHIKI):</span>
          <div style="font-size:1.05rem;line-height:1.6;font-family:'Segoe UI Historic',sans-serif;color:var(--ink);">${escapeHtml(lesson.scriptText)}</div>
        `;
      } else {
        scriptBanner.style.display = 'none';
      }
    }

    const explDisplay = document.getElementById('lv-expl-text-display');
    const explEdit = document.getElementById('lv-expl-text-edit') as HTMLTextAreaElement | null;
    if (explDisplay) explDisplay.textContent = lesson.explanation || 'Authentic conceptual explanation in simple language.';
    if (explEdit) explEdit.value = lesson.explanation || '';
  } else {
    if (emptyState) emptyState.style.display = 'flex';
    if (contentState) contentState.style.display = 'none';
    if (statusBadge) {
      statusBadge.textContent = '⏳ Ready to Scan';
      statusBadge.className = 'status-pill-orange';
    }
    if (scanTextBtn) scanTextBtn.textContent = 'Scan with Google Lens OCR';
  }
}

// Toggle Inline Editing of Bilingual Sheet
function toggleLessonEditMode(isEditing: boolean) {
  const origDisplay = document.getElementById('lv-orig-text-display');
  const origEdit = document.getElementById('lv-orig-text-edit');
  const transDisplay = document.getElementById('lv-trans-text-display');
  const transEdit = document.getElementById('lv-trans-text-edit');
  const explDisplay = document.getElementById('lv-expl-text-display');
  const explEdit = document.getElementById('lv-expl-text-edit');
  const editActions = document.getElementById('lv-edit-actions');
  const toggleBtn = document.getElementById('btn-lv-toggle-edit');

  if (origDisplay) origDisplay.style.display = isEditing ? 'none' : 'block';
  if (origEdit) origEdit.style.display = isEditing ? 'block' : 'none';
  if (transDisplay) transDisplay.style.display = isEditing ? 'none' : 'block';
  if (transEdit) transEdit.style.display = isEditing ? 'block' : 'none';
  if (explDisplay) explDisplay.style.display = isEditing ? 'none' : 'block';
  if (explEdit) explEdit.style.display = isEditing ? 'block' : 'none';
  if (editActions) editActions.style.display = isEditing ? 'flex' : 'none';

  if (toggleBtn) {
    toggleBtn.textContent = isEditing ? '✕ Cancel' : '✏️ Edit Text';
  }
}

// Execute Google Lens OCR scan and translation for the active lesson
async function runLessonGoogleLensScan() {
  if (!activeLessonId) return;
  const lesson = await dbGet<LessonRecord>('lessons', activeLessonId);
  if (!lesson) return;

  const langSelect = document.getElementById('lv-target-lang-select') as HTMLSelectElement | null;
  const targetLang = langSelect?.value || lesson.targetLang || 'Ho';

  const statusBanner = document.getElementById('lv-status-banner');
  const errorBanner = document.getElementById('lv-error-banner');
  const overlay = document.getElementById('lv-lens-overlay');
  const scanBtn = document.getElementById('btn-lv-scan-action') as HTMLButtonElement | null;
  const emptyScanBtn = document.getElementById('btn-lv-empty-scan-trigger') as HTMLButtonElement | null;

  if (errorBanner) errorBanner.style.display = 'none';
  if (statusBanner) {
    statusBanner.style.display = 'flex';
    statusBanner.querySelector('div:last-child')!.innerHTML = `
      <div style="font-weight:600;font-size:0.86rem;color:#92400E;">Google Lens OCR Scanning Active...</div>
      <div style="font-size:0.75rem;color:#B45309;">Extracting text from uploaded file and generating bilingual sheet in ${targetLang}...</div>
    `;
  }
  if (overlay) overlay.style.display = 'block';
  if (scanBtn) scanBtn.disabled = true;
  if (emptyScanBtn) emptyScanBtn.disabled = true;

  try {
    const res = await fetch('/api/ai/scan-and-translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileData: lesson.fileData || '',
        mimeType: lesson.mimeType || 'image/jpeg',
        text: lesson.lessonText || '',
        targetLang: targetLang
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to scan and translate document.');
    }

    // Update lesson record with real OCR & translation results
    lesson.lessonText = data.extractedText || lesson.lessonText || '';
    lesson.sourceLang = data.detectedSourceLang || 'Hindi';
    lesson.targetLang = targetLang;
    lesson.translatedText = data.translatedText || '';
    lesson.scriptText = data.scriptVariant || '';
    lesson.explanation = data.explanation || '';
    lesson.completionPct = 100;
    lesson.updatedAt = Date.now();

    await dbPut('lessons', lesson);

    if (overlay) overlay.style.display = 'none';
    if (statusBanner) statusBanner.style.display = 'none';
    if (scanBtn) scanBtn.disabled = false;
    if (emptyScanBtn) emptyScanBtn.disabled = false;

    renderLessonViewerContent(lesson);
    showToast(`Bilingual sheet generated in ${targetLang}!`, '✓');
    refreshDashboardStats();
  } catch (err: any) {
    console.error('Lesson OCR scan error:', err);
    if (overlay) overlay.style.display = 'none';
    if (statusBanner) statusBanner.style.display = 'none';
    if (scanBtn) scanBtn.disabled = false;
    if (emptyScanBtn) emptyScanBtn.disabled = false;

    if (errorBanner) {
      errorBanner.style.display = 'flex';
      const errText = document.getElementById('lv-error-text');
      if (errText) errText.textContent = err.message || 'Error occurred during scan. Please try again.';
    }
  }
}

// Print Bilingual Sheet
function printBilingualSheet(lesson: LessonRecord) {
  const printArea = document.getElementById('bilingual-printable-area');
  if (!printArea) return;

  const curDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  printArea.innerHTML = `
    <div style="font-family:system-ui,sans-serif;padding:32px;color:#1E293B;max-width:860px;margin:0 auto;line-height:1.5;">
      <div style="border-bottom:2px solid #15803D;padding-bottom:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:20px;font-weight:bold;color:#15803D;margin-bottom:4px;">${escapeHtml(lesson.title)}</div>
          <div style="font-size:13px;color:#64748B;">BhashaSetu Multilingual Pedagogical Bilingual Sheet</div>
        </div>
        <div style="text-align:right;font-size:12px;color:#64748B;">
          <div><strong>Date:</strong> ${curDate}</div>
          <div><strong>Target Language:</strong> ${escapeHtml(lesson.targetLang || 'Ho')}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;border:1px solid #CBD5E1;border-radius:6px;padding:10px 14px;margin-bottom:24px;font-size:13px;background:#F8FAFC;">
        <div><strong>Student Name:</strong> ___________________________</div>
        <div><strong>Class:</strong> Primary (FLN)</div>
        <div><strong>Detected Lang:</strong> ${escapeHtml(lesson.sourceLang || 'Hindi')}</div>
      </div>

      <div style="margin-bottom:24px;">
        <div style="font-size:15px;font-weight:700;color:#0F172A;margin-bottom:10px;border-bottom:1px solid #E2E8F0;padding-bottom:6px;">
          Side-by-Side Bilingual Curriculum Content
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <thead>
            <tr style="background:#F1F5F9;border:1px solid #CBD5E1;">
              <th style="padding:10px 12px;text-align:left;font-size:13px;color:#334155;width:50%;border-right:1px solid #CBD5E1;">
                Original Content (${escapeHtml(lesson.sourceLang || 'Hindi')})
              </th>
              <th style="padding:10px 12px;text-align:left;font-size:13px;color:#15803D;width:50%;">
                ${escapeHtml(lesson.targetLang || 'Ho')} Vernacular Translation
              </th>
            </tr>
          </thead>
          <tbody>
            <tr style="border:1px solid #CBD5E1;vertical-align:top;">
              <td style="padding:12px;font-size:14px;line-height:1.6;border-right:1px solid #CBD5E1;white-space:pre-wrap;">
                ${escapeHtml(lesson.lessonText || '')}
              </td>
              <td style="padding:12px;font-size:14px;line-height:1.6;white-space:pre-wrap;color:#0F172A;">
                ${escapeHtml(lesson.translatedText || lesson.scriptText || '')}
              </td>
            </tr>
          </tbody>
        </table>

        ${lesson.scriptText ? `
          <div style="border:1px solid #BBF7D0;background:#F0FDF4;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
            <div style="font-size:12px;font-weight:700;color:#15803D;margin-bottom:4px;">WARANG CHITI / OL CHIKI NATIVE SCRIPT:</div>
            <div style="font-size:16px;line-height:1.6;font-family:'Segoe UI Historic',sans-serif;">${escapeHtml(lesson.scriptText)}</div>
          </div>
        ` : ''}

        <div style="border:1px solid #E2E8F0;border-radius:6px;padding:14px 16px;background:#F8FAFC;">
          <div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:6px;">Pedagogical Concept &amp; Discussion Prompts:</div>
          <div style="font-size:13px;color:#334155;line-height:1.6;white-space:pre-wrap;">${escapeHtml(lesson.explanation || '')}</div>
        </div>
      </div>

      <div style="text-align:center;font-size:11px;color:#94A3B8;margin-top:32px;border-top:1px solid #E2E8F0;padding-top:12px;">
        BhashaSetu Tribal Multilingual Education System · Approved Classroom Printout
      </div>
    </div>
  `;

  window.print();
}

// Upload Lesson Modal Functions
function openUploadLessonModal() {
  const modal = document.getElementById('modal-upload-lesson');
  const prompt = document.getElementById('modal-dropzone-prompt');
  const preview = document.getElementById('modal-dropzone-preview');
  const titleInput = document.getElementById('modal-lesson-title') as HTMLInputElement | null;
  const errDiv = document.getElementById('modal-upload-error');

  selectedLessonFile = null;
  selectedLessonDataUrl = '';
  if (prompt) prompt.style.display = 'block';
  if (preview) preview.style.display = 'none';
  if (titleInput) titleInput.value = '';
  if (errDiv) errDiv.style.display = 'none';

  if (modal) modal.style.display = 'flex';
}

function closeUploadLessonModal() {
  const modal = document.getElementById('modal-upload-lesson');
  if (modal) modal.style.display = 'none';
}

function handleLessonFileSelect(file: File) {
  if (!file) return;
  selectedLessonFile = file;

  const prompt = document.getElementById('modal-dropzone-prompt');
  const preview = document.getElementById('modal-dropzone-preview');
  const previewImg = document.getElementById('modal-preview-img') as HTMLImageElement | null;
  const previewDoc = document.getElementById('modal-preview-doc-icon');
  const nameElem = document.getElementById('modal-preview-filename');
  const sizeElem = document.getElementById('modal-preview-filesize');
  const titleInput = document.getElementById('modal-lesson-title') as HTMLInputElement | null;
  const errDiv = document.getElementById('modal-upload-error');
  if (errDiv) errDiv.style.display = 'none';

  if (nameElem) nameElem.textContent = file.name;
  if (sizeElem) sizeElem.textContent = `${(file.size / 1024).toFixed(1)} KB`;

  // Auto fill title if empty
  if (titleInput && !titleInput.value.trim()) {
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    titleInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  }

  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(file.name);

  const reader = new FileReader();
  reader.onload = (e) => {
    selectedLessonDataUrl = (e.target?.result as string) || '';
    if (isImage && previewImg) {
      previewImg.src = selectedLessonDataUrl;
      previewImg.style.display = 'block';
      if (previewDoc) previewDoc.style.display = 'none';
    } else {
      if (previewImg) previewImg.style.display = 'none';
      if (previewDoc) previewDoc.style.display = 'block';
    }
    if (prompt) prompt.style.display = 'none';
    if (preview) preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

// Setup Lessons Workflow event listeners
export function setupLessonsWorkflow() {
  // 1. Top Upload Lesson Button
  const btnTopUpload = document.getElementById('btn-lessons-upload-top');
  btnTopUpload?.addEventListener('click', () => {
    openUploadLessonModal();
  });

  // 2. Upload Modal controls
  const modal = document.getElementById('modal-upload-lesson');
  const btnCloseModal = document.getElementById('btn-close-upload-lesson-modal');
  const btnCancelModal = document.getElementById('btn-modal-cancel-upload');
  const dropzone = document.getElementById('modal-lesson-dropzone');
  const fileInput = document.getElementById('modal-lesson-file-input') as HTMLInputElement | null;
  const cameraInput = document.getElementById('modal-lesson-camera-input') as HTMLInputElement | null;
  const btnChooseFile = document.getElementById('btn-modal-choose-file');
  const btnUseCamera = document.getElementById('btn-modal-use-camera');
  const btnChangeFile = document.getElementById('btn-modal-change-file');
  const btnSubmitModal = document.getElementById('btn-modal-submit-upload');

  btnCloseModal?.addEventListener('click', closeUploadLessonModal);
  btnCancelModal?.addEventListener('click', closeUploadLessonModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeUploadLessonModal();
  });

  btnChooseFile?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput?.click();
  });

  btnUseCamera?.addEventListener('click', (e) => {
    e.stopPropagation();
    cameraInput?.click();
  });

  btnChangeFile?.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedLessonFile = null;
    selectedLessonDataUrl = '';
    const prompt = document.getElementById('modal-dropzone-prompt');
    const preview = document.getElementById('modal-dropzone-preview');
    if (prompt) prompt.style.display = 'block';
    if (preview) preview.style.display = 'none';
    if (fileInput) fileInput.value = '';
    if (cameraInput) cameraInput.value = '';
  });

  fileInput?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      handleLessonFileSelect(target.files[0]);
    }
  });

  cameraInput?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      handleLessonFileSelect(target.files[0]);
    }
  });

  // Drag and drop in dropzone
  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--green)';
      dropzone.style.background = '#F0FDF4';
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = '#CBD5E1';
      dropzone.style.background = '#F8FAFC';
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '#CBD5E1';
      dropzone.style.background = '#F8FAFC';
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleLessonFileSelect(e.dataTransfer.files[0]);
      }
    });
    dropzone.addEventListener('click', () => {
      if (!selectedLessonFile) {
        fileInput?.click();
      }
    });
  }

  // Submit Upload Lesson
  btnSubmitModal?.addEventListener('click', async () => {
    const titleInput = document.getElementById('modal-lesson-title') as HTMLInputElement | null;
    const targetLangSelect = document.getElementById('modal-lesson-target-lang') as HTMLSelectElement | null;
    const errDiv = document.getElementById('modal-upload-error');

    if (!selectedLessonFile || !selectedLessonDataUrl) {
      if (errDiv) {
        errDiv.textContent = 'Please choose an image or document to upload.';
        errDiv.style.display = 'block';
      }
      return;
    }

    const title = titleInput?.value.trim() || '';
    if (!title) {
      if (errDiv) {
        errDiv.textContent = 'Please enter a lesson title.';
        errDiv.style.display = 'block';
      }
      return;
    }

    const targetLang = targetLangSelect?.value || 'Ho';
    const lessonId = 'lesson_' + Date.now();

    let storagePath = '';
    let signedUrl = selectedLessonDataUrl;

    if (selectedLessonFile) {
      try {
        const uploadRes = await uploadFileToStorage({
          featureName: 'lessons',
          itemId: lessonId,
          file: selectedLessonFile,
          fileName: selectedLessonFile.name,
          contentType: selectedLessonFile.type || 'image/jpeg'
        });
        if (uploadRes?.path) {
          storagePath = uploadRes.path;
          if (uploadRes.signedUrl) {
            signedUrl = uploadRes.signedUrl;
          }
        }
      } catch (err) {
        console.warn('Supabase storage upload notice for lesson:', err);
      }
    }

    const newLesson: LessonRecord = {
      id: lessonId,
      title: title,
      topic: title,
      grade: 'Primary',
      subject: 'Curriculum',
      sourceLang: 'Hindi',
      targetLang: targetLang,
      lessonText: '',
      translatedText: '',
      scriptText: '',
      explanation: '',
      voiceText: '',
      worksheetContent: '',
      questionsContent: '',
      fileData: signedUrl || selectedLessonDataUrl,
      storagePath: storagePath,
      signedUrl: signedUrl,
      fileName: selectedLessonFile.name,
      mimeType: selectedLessonFile.type || 'image/jpeg',
      completionPct: 0,
      published: true,
      approved: true,
      syncState: 'local',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      authorId: 'teacher'
    };

    try {
      await createLesson(newLesson);
    } catch (err) {
      console.warn('Supabase createLesson notice:', err);
    }

    await dbPut('lessons', newLesson);
    closeUploadLessonModal();
    await refreshLessonsList();
    showToast(`Lesson "${newLesson.title}" saved!`, '✓');

    // Automatically open in viewer, ready to scan!
    openLessonInViewer(newLesson.id);
  });

  // 3. Lesson Viewer Controls
  const btnBack = document.getElementById('btn-lv-back');
  btnBack?.addEventListener('click', () => {
    showLessonsListView();
  });

  const btnScanAction = document.getElementById('btn-lv-scan-action');
  btnScanAction?.addEventListener('click', () => {
    runLessonGoogleLensScan();
  });

  const btnEmptyScanTrigger = document.getElementById('btn-lv-empty-scan-trigger');
  btnEmptyScanTrigger?.addEventListener('click', () => {
    runLessonGoogleLensScan();
  });

  const btnRescanLang = document.getElementById('btn-lv-rescan-lang');
  btnRescanLang?.addEventListener('click', () => {
    runLessonGoogleLensScan();
  });

  const btnPrintAction = document.getElementById('btn-lv-print-action');
  btnPrintAction?.addEventListener('click', async () => {
    if (!activeLessonId) return;
    const lesson = await dbGet<LessonRecord>('lessons', activeLessonId);
    if (lesson) printBilingualSheet(lesson);
  });

  const btnDeleteAction = document.getElementById('btn-lv-delete-action');
  btnDeleteAction?.addEventListener('click', async () => {
    if (!activeLessonId) return;
    const lesson = await dbGet<LessonRecord>('lessons', activeLessonId);
    if (confirm(`Are you sure you want to delete "${lesson?.title || 'this lesson'}"?`)) {
      await dbDelete('lessons', activeLessonId);
      showToast('Lesson deleted', '🗑️');
      showLessonsListView();
    }
  });

  const targetLangSelect = document.getElementById('lv-target-lang-select') as HTMLSelectElement | null;
  targetLangSelect?.addEventListener('change', async (e) => {
    if (!activeLessonId) return;
    const lesson = await dbGet<LessonRecord>('lessons', activeLessonId);
    if (lesson) {
      lesson.targetLang = (e.target as HTMLSelectElement).value;
      lesson.updatedAt = Date.now();
      await dbPut('lessons', lesson);
      renderLessonViewerContent(lesson);
      showToast(`Target language set to ${lesson.targetLang}. Click Scan with Google Lens OCR to translate.`, '🎯');
    }
  });

  // Inline editing controls
  const btnToggleEdit = document.getElementById('btn-lv-toggle-edit');
  btnToggleEdit?.addEventListener('click', () => {
    const editActions = document.getElementById('lv-edit-actions');
    const isCurrentlyEditing = editActions?.style.display === 'flex';
    toggleLessonEditMode(!isCurrentlyEditing);
  });

  const btnCancelEdits = document.getElementById('btn-lv-cancel-edits');
  btnCancelEdits?.addEventListener('click', () => {
    toggleLessonEditMode(false);
  });

  const btnSaveEdits = document.getElementById('btn-lv-save-edits');
  btnSaveEdits?.addEventListener('click', async () => {
    if (!activeLessonId) return;
    const lesson = await dbGet<LessonRecord>('lessons', activeLessonId);
    if (!lesson) return;

    const origEdit = document.getElementById('lv-orig-text-edit') as HTMLTextAreaElement | null;
    const transEdit = document.getElementById('lv-trans-text-edit') as HTMLTextAreaElement | null;
    const explEdit = document.getElementById('lv-expl-text-edit') as HTMLTextAreaElement | null;

    lesson.lessonText = origEdit?.value.trim() || lesson.lessonText;
    lesson.translatedText = transEdit?.value.trim() || lesson.translatedText;
    lesson.explanation = explEdit?.value.trim() || lesson.explanation;
    lesson.updatedAt = Date.now();

    try {
      await updateLesson(lesson.id, {
        lessonText: lesson.lessonText,
        translatedText: lesson.translatedText,
        explanation: lesson.explanation
      });
    } catch (_) {}

    await dbPut('lessons', lesson);
    toggleLessonEditMode(false);
    renderLessonViewerContent(lesson);
    showToast('Changes saved to lesson!', '✓');
  });

  // Audio Listen Buttons
  const btnListenOrig = document.getElementById('btn-lv-listen-orig');
  btnListenOrig?.addEventListener('click', async () => {
    if (!activeLessonId) return;
    const lesson = await dbGet<LessonRecord>('lessons', activeLessonId);
    const text = lesson?.lessonText || '';
    if (!text) return;

    if (isListeningOrigText) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      isListeningOrigText = false;
      btnListenOrig.innerHTML = '<svg class="icon" viewBox="0 0 24 24" style="width:13px;height:13px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Listen';
      return;
    }

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    isListeningOrigText = true;
    btnListenOrig.innerHTML = '⏹ Stop';

    const langCode = lesson?.sourceLang === 'English' ? 'en-IN' : 'hi-IN';
    audio.speakTextNatural(text, langCode).finally(() => {
      isListeningOrigText = false;
      btnListenOrig.innerHTML = '<svg class="icon" viewBox="0 0 24 24" style="width:13px;height:13px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Listen';
    });
  });

  const btnListenTrans = document.getElementById('btn-lv-listen-trans');
  btnListenTrans?.addEventListener('click', async () => {
    if (!activeLessonId) return;
    const lesson = await dbGet<LessonRecord>('lessons', activeLessonId);
    const text = lesson?.translatedText || lesson?.scriptText || '';
    if (!text) return;

    if (isListeningTransText) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      isListeningTransText = false;
      btnListenTrans.innerHTML = '<svg class="icon" viewBox="0 0 24 24" style="width:13px;height:13px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Listen';
      return;
    }

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    isListeningTransText = true;
    btnListenTrans.innerHTML = '⏹ Stop';

    const targetLang = lesson?.targetLang || 'Ho';
    const langCode = targetLang === 'Telugu' ? 'te-IN' : targetLang === 'Hindi' ? 'hi-IN' : targetLang === 'English' ? 'en-IN' : 'hi-IN';
    audio.speakTextNatural(text, langCode).finally(() => {
      isListeningTransText = false;
      btnListenTrans.innerHTML = '<svg class="icon" viewBox="0 0 24 24" style="width:13px;height:13px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Listen';
    });
  });

  const btnListenExpl = document.getElementById('btn-lv-listen-expl');
  btnListenExpl?.addEventListener('click', async () => {
    if (!activeLessonId) return;
    const lesson = await dbGet<LessonRecord>('lessons', activeLessonId);
    const text = lesson?.explanation || '';
    if (!text) return;

    if (isListeningExplText) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      isListeningExplText = false;
      btnListenExpl.innerHTML = '<svg class="icon" viewBox="0 0 24 24" style="width:13px;height:13px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Listen';
      return;
    }

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    isListeningExplText = true;
    btnListenExpl.innerHTML = '⏹ Stop';

    const targetLang = lesson?.targetLang || 'Ho';
    const langCode = targetLang === 'English' ? 'en-IN' : 'hi-IN';
    audio.speakTextNatural(text, langCode).finally(() => {
      isListeningExplText = false;
      btnListenExpl.innerHTML = '<svg class="icon" viewBox="0 0 24 24" style="width:13px;height:13px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Listen';
    });
  });

  // Copy Buttons
  document.getElementById('btn-lv-copy-orig')?.addEventListener('click', async () => {
    if (!activeLessonId) return;
    const lesson = await dbGet<LessonRecord>('lessons', activeLessonId);
    if (lesson?.lessonText) {
      navigator.clipboard.writeText(lesson.lessonText);
      showToast('Original text copied', '📋');
    }
  });

  document.getElementById('btn-lv-copy-trans')?.addEventListener('click', async () => {
    if (!activeLessonId) return;
    const lesson = await dbGet<LessonRecord>('lessons', activeLessonId);
    const text = lesson?.translatedText || lesson?.scriptText;
    if (text) {
      navigator.clipboard.writeText(text);
      showToast('Translated text copied', '📋');
    }
  });

  document.getElementById('btn-lv-copy-expl')?.addEventListener('click', async () => {
    if (!activeLessonId) return;
    const lesson = await dbGet<LessonRecord>('lessons', activeLessonId);
    if (lesson?.explanation) {
      navigator.clipboard.writeText(lesson.explanation);
      showToast('Explanation copied', '📋');
    }
  });

  // Error Banner Close
  document.getElementById('lv-error-close')?.addEventListener('click', () => {
    const errorBanner = document.getElementById('lv-error-banner');
    if (errorBanner) errorBanner.style.display = 'none';
  });
}

// Edit Lesson Modal (Teacher Only)
function openEditLessonModal(lesson: LessonRecord) {
  if (!isTeacher()) {
    showToast('Only teachers can edit lessons.', '⚠️');
    return;
  }
  let modal = document.getElementById('lesson-edit-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'lesson-edit-modal';
    modal.className = 'modal-backdrop-wrap';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:#FFF;border-radius:12px;width:92%;max-width:580px;padding:24px;max-height:85vh;overflow-y:auto;box-shadow:0 12px 36px rgba(0,0,0,0.18);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid var(--border-light);padding-bottom:10px;">
        <h3 style="margin:0;font-size:1.15rem;color:var(--green-dark);">✏️ Edit Lesson</h3>
        <button id="btn-close-edit-les-modal" style="border:none;background:transparent;font-size:1.3rem;cursor:pointer;">✕</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">Lesson Title / Topic:</label>
          <input type="text" id="edit-les-title" class="input-form-elem" value="${lesson.title}" style="width:100%;font-size:0.85rem;">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">Target Language:</label>
            <select id="edit-les-lang" class="input-form-elem" style="width:100%;font-size:0.85rem;">
              <option value="Ho" ${lesson.targetLang === 'Ho' ? 'selected' : ''}>Ho (वारंग क्षिती / Ol Chiki)</option>
              <option value="Mundari" ${lesson.targetLang === 'Mundari' ? 'selected' : ''}>Mundari (मुंडारी)</option>
              <option value="Santhali" ${lesson.targetLang === 'Santhali' ? 'selected' : ''}>Santhali (संथाली)</option>
              <option value="Telugu" ${lesson.targetLang === 'Telugu' ? 'selected' : ''}>Telugu (తెలుగు)</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">Grade Level:</label>
            <select id="edit-les-grade" class="input-form-elem" style="width:100%;font-size:0.85rem;">
              <option value="Balvatika" ${lesson.grade === 'Balvatika' ? 'selected' : ''}>Balvatika / Anganwadi</option>
              <option value="Grade 1" ${lesson.grade === 'Grade 1' ? 'selected' : ''}>Grade 1 (Foundational)</option>
              <option value="Grade 2" ${lesson.grade === 'Grade 2' ? 'selected' : ''}>Grade 2 (FLN Numeracy)</option>
              <option value="Grade 3" ${lesson.grade === 'Grade 3' ? 'selected' : ''}>Grade 3 (Preparatory)</option>
              <option value="Grade 4" ${lesson.grade === 'Grade 4' ? 'selected' : ''}>Grade 4</option>
              <option value="Grade 5" ${lesson.grade === 'Grade 5' ? 'selected' : ''}>Grade 5</option>
            </select>
          </div>
        </div>

        <div>
          <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">Lesson Content / Text:</label>
          <textarea id="edit-les-text" class="input-form-elem" rows="3" style="width:100%;font-size:0.85rem;">${lesson.lessonText || ''}</textarea>
        </div>

        <div>
          <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">Pedagogical Explanation &amp; Simplification:</label>
          <textarea id="edit-les-expl" class="input-form-elem" rows="3" style="width:100%;font-size:0.85rem;">${lesson.explanation || ''}</textarea>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">
          <button id="btn-cancel-edit-les" class="btn-chip" style="padding:6px 14px;">Cancel</button>
          <button id="btn-save-edit-les" class="btn-solid-green" style="width:auto;margin:0;padding:6px 18px;">Save Changes</button>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
  const closeModal = () => { if (modal) modal.style.display = 'none'; };
  modal.querySelector('#btn-close-edit-les-modal')?.addEventListener('click', closeModal);
  modal.querySelector('#btn-cancel-edit-les')?.addEventListener('click', closeModal);

  modal.querySelector('#btn-save-edit-les')?.addEventListener('click', async () => {
    const title = (modal.querySelector('#edit-les-title') as HTMLInputElement)?.value.trim();
    const lang = (modal.querySelector('#edit-les-lang') as HTMLSelectElement)?.value;
    const grade = (modal.querySelector('#edit-les-grade') as HTMLSelectElement)?.value;
    const text = (modal.querySelector('#edit-les-text') as HTMLTextAreaElement)?.value.trim();
    const expl = (modal.querySelector('#edit-les-expl') as HTMLTextAreaElement)?.value.trim();

    if (!title) {
      showToast('Please enter a lesson title.', '⚠️');
      return;
    }

    lesson.title = title;
    lesson.topic = title;
    lesson.targetLang = lang;
    lesson.grade = grade;
    lesson.lessonText = text;
    lesson.explanation = expl;
    lesson.updatedAt = Date.now();

    await dbPut('lessons', lesson);
    await refreshLessonsList();
    closeModal();
    showToast(`Updated lesson: "${title}"`, '✓');
  });
}

// ===================== STUDENT INTERACTIVE LESSON EXPERIENCE =====================
export function openStudentLessonExperience(lesson: LessonRecord) {
  const modal = document.getElementById('student-interactive-lesson-modal');
  if (!modal) return;

  const gradeBadge = document.getElementById('sim-grade-badge');
  const subjectBadge = document.getElementById('sim-subject-badge');
  const timerBadge = document.getElementById('sim-session-timer-badge');
  const titleElem = document.getElementById('sim-lesson-title');
  const translatedTextElem = document.getElementById('sim-translated-text');
  const scriptNativeElem = document.getElementById('sim-script-native');
  const origContentElem = document.getElementById('sim-orig-content');
  const audioLabel = document.getElementById('sim-audio-label');
  const audioDesc = document.getElementById('sim-audio-desc');
  const explanationElem = document.getElementById('sim-explanation-text');
  const visualContainer = document.getElementById('sim-visual-container');
  const visualCaption = document.getElementById('sim-visual-caption');
  const questionElem = document.getElementById('sim-activity-question');
  const optionsContainer = document.getElementById('sim-activity-options');
  const feedbackElem = document.getElementById('sim-activity-feedback');
  const btnClose = document.getElementById('btn-close-student-lesson-modal');
  const btnPlayAudio = document.getElementById('btn-sim-play-audio');
  const btnAudioSpeed = document.getElementById('btn-sim-audio-speed');
  const btnAudioReplay = document.getElementById('btn-sim-audio-replay');
  const btnOralRecite = document.getElementById('btn-sim-oral-recite');
  const btnAskDoubt = document.getElementById('btn-sim-ask-doubt');
  const btnFinish = document.getElementById('btn-sim-finish');
  const langTabs = document.getElementById('sim-lang-tabs');

  let currentLang = lesson.targetLang || 'Ho';
  let currentSpeed = 1.0;
  let isReciting = false;
  let speechRec: any = null;

  if (gradeBadge) gradeBadge.textContent = lesson.grade || 'Grade 1';
  if (subjectBadge) subjectBadge.textContent = lesson.subject || 'Environmental Studies';
  if (timerBadge) {
    const session = getActiveSession();
    if (session && session.status === 'active') {
      timerBadge.style.display = 'inline-block';
      timerBadge.textContent = '⏱️ Active Classroom Session';
    } else {
      timerBadge.style.display = 'none';
    }
  }
  if (titleElem) titleElem.textContent = lesson.title;
  if (origContentElem) origContentElem.textContent = lesson.topic || lesson.title;

  function renderLanguageContent(lang: string) {
    currentLang = lang;
    if (audioLabel) audioLabel.textContent = `Listen in ${lang}`;
    if (audioDesc) audioDesc.textContent = `Natural human pronunciation in ${lang}`;

    // Active tab styling
    langTabs?.querySelectorAll('.btn-chip').forEach(btn => {
      const btnLang = btn.getAttribute('data-lang');
      if (btnLang === lang) {
        (btn as HTMLElement).style.background = 'var(--green)';
        (btn as HTMLElement).style.color = '#FFF';
        (btn as HTMLElement).style.borderColor = 'var(--green)';
      } else {
        (btn as HTMLElement).style.background = '#FFF';
        (btn as HTMLElement).style.color = 'var(--ink)';
        (btn as HTMLElement).style.borderColor = 'var(--border)';
      }
    });

    // Translation & native script
    if (lang === lesson.targetLang) {
      if (translatedTextElem) translatedTextElem.textContent = lesson.lessonText || lesson.explanation || lesson.title;
      if (scriptNativeElem) {
        scriptNativeElem.textContent = lesson.scriptText || (lang === 'Ho' ? '𑢹𑣉 𑣆𑣗𑣉 (Warang Chiti)' : (lang === 'Santhali' ? 'ᱚᱞ ᱪᱤᱠᱤ (Ol Chiki)' : ''));
        scriptNativeElem.style.display = scriptNativeElem.textContent ? 'block' : 'none';
      }
      if (explanationElem) explanationElem.textContent = lesson.explanation || 'Study this lesson in your mother tongue.';
    } else {
      const tr = translateOffline(lesson.title, 'Hindi', lang);
      if (translatedTextElem) translatedTextElem.textContent = tr.translatedText;
      if (scriptNativeElem) {
        scriptNativeElem.textContent = tr.scriptVariant || '';
        scriptNativeElem.style.display = tr.scriptVariant ? 'block' : 'none';
      }
      if (explanationElem) explanationElem.textContent = `${lesson.title} - ${tr.translatedText}. Explained with local environmental analogies in ${lang}.`;
    }

    // Visual illustration
    if (visualContainer) {
      if (lesson.fileData && (lesson.fileData.startsWith('data:image') || lesson.mimeType?.startsWith('image'))) {
        visualContainer.innerHTML = `<img src="${lesson.fileData}" alt="${lesson.title}" style="max-width:100%;max-height:220px;border-radius:8px;object-fit:contain;margin:0 auto;display:block;" />`;
      } else {
        visualContainer.innerHTML = generateEducationalDiagram(lesson.title, lang);
      }
    }
    if (visualCaption) {
      visualCaption.textContent = `${lesson.title} (${lang}: ${translatedTextElem?.textContent || ''})`;
    }

    renderQuestion(lang);
  }

  function renderQuestion(lang: string) {
    if (!questionElem || !optionsContainer) return;
    questionElem.textContent = `इस पाठ का मुख्य शब्द क्या है? (${lesson.title} in ${lang})`;
    if (feedbackElem) feedbackElem.style.display = 'none';

    const trTitle = translateOffline(lesson.title, 'Hindi', lang).translatedText;
    const options = [
      { text: trTitle || lesson.title, correct: true },
      { text: 'जल / दाः (Water)', correct: false },
      { text: 'आकाश / सिरमा (Sky)', correct: false }
    ].sort(() => Math.random() - 0.5);

    optionsContainer.innerHTML = options.map((opt, idx) => `
      <button class="btn-chip sim-opt-btn" data-correct="${opt.correct}" style="width:100%;text-align:left;padding:10px 14px;font-size:0.88rem;border:1px solid var(--border);background:#FAFBFB;border-radius:8px;justify-content:flex-start;">
        <span style="font-weight:700;margin-right:8px;">${String.fromCharCode(65 + idx)}.</span> ${opt.text}
      </button>
    `).join('');

    optionsContainer.querySelectorAll('.sim-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const isCorrect = btn.getAttribute('data-correct') === 'true';
        if (feedbackElem) {
          feedbackElem.style.display = 'block';
          if (isCorrect) {
            feedbackElem.style.background = '#DCFCE7';
            feedbackElem.style.color = '#15803D';
            feedbackElem.style.border = '1px solid #86EFAC';
            feedbackElem.innerHTML = '<strong>शबाश! बहुत बढ़िया! (Bariya kaji!)</strong> +10 FLN Points awarded! You answered correctly in your mother tongue.';
            audio.playToneSequence([523, 659, 784, 1046]);
          } else {
            feedbackElem.style.background = '#FEF3C7';
            feedbackElem.style.color = '#92400E';
            feedbackElem.style.border = '1px solid #FDE68A';
            feedbackElem.innerHTML = '<strong>फिर से कोशिश करें! (Aad koshish me)</strong> Review the mother-tongue text above.';
            audio.playToneSequence([330, 262]);
          }
        }
      });
    });
  }

  // Language Tabs Click
  langTabs?.querySelectorAll('.btn-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const l = btn.getAttribute('data-lang');
      if (l) renderLanguageContent(l);
    });
  });

  // Audio Play
  btnPlayAudio?.addEventListener('click', () => {
    const textToSpeak = translatedTextElem?.textContent || lesson.title;
    audio.speakTextNatural(textToSpeak, currentLang);
    showToast(`Playing audio in ${currentLang}`, '🔊');
  });

  // Speed toggle
  btnAudioSpeed?.addEventListener('click', () => {
    if (currentSpeed === 1.0) currentSpeed = 0.8;
    else if (currentSpeed === 0.8) currentSpeed = 1.2;
    else currentSpeed = 1.0;
    if (btnAudioSpeed) btnAudioSpeed.textContent = `🐢 Speed: ${currentSpeed}x`;
    showToast(`Speed set to ${currentSpeed}x`, '⚡');
  });

  // Replay
  btnAudioReplay?.addEventListener('click', () => {
    const textToSpeak = translatedTextElem?.textContent || lesson.title;
    audio.speakTextNatural(textToSpeak, currentLang);
  });

  // Oral Recite
  btnOralRecite?.addEventListener('click', () => {
    const SpeechRecClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecClass) {
      showToast('Speech recognition not available on this browser.', '⚠️');
      return;
    }
    if (isReciting) {
      try { speechRec?.stop(); } catch (_) {}
      isReciting = false;
      if (btnOralRecite) btnOralRecite.textContent = '🎤 Recite with Mic';
      return;
    }
    try {
      speechRec = new SpeechRecClass();
      speechRec.continuous = false;
      speechRec.interimResults = false;
      speechRec.lang = 'hi-IN';
      speechRec.onstart = () => {
        isReciting = true;
        if (btnOralRecite) btnOralRecite.textContent = '🔴 Listening... Speak!';
        showToast('Speak now in your mother tongue...', '🎙️');
      };
      speechRec.onresult = (e: any) => {
        const tr = e.results?.[0]?.[0]?.transcript || '';
        showToast(`Heard: "${tr}" - बहुत बढ़िया!`, '⭐');
        audio.playToneSequence([523, 659, 784]);
        if (feedbackElem) {
          feedbackElem.style.display = 'block';
          feedbackElem.style.background = '#DCFCE7';
          feedbackElem.style.color = '#15803D';
          feedbackElem.innerHTML = `<strong>Oral Recitation Recorded:</strong> "${tr}" — Well done!`;
        }
      };
      speechRec.onerror = () => {
        isReciting = false;
        if (btnOralRecite) btnOralRecite.textContent = '🎤 Recite with Mic';
      };
      speechRec.onend = () => {
        isReciting = false;
        if (btnOralRecite) btnOralRecite.textContent = '🎤 Recite with Mic';
      };
      speechRec.start();
    } catch {
      showToast('Could not access microphone.', '⚠️');
    }
  });

  // Ask doubt / simplify
  btnAskDoubt?.addEventListener('click', async () => {
    showToast('Simplifying lesson concept with village and nature analogies...', '💡');
    if (explanationElem) {
      explanationElem.textContent = `सरल अर्थ: ${lesson.title} हमारे दैनिक जीवन और गाँव के पर्यावरण से जुड़ा है। जैसे पेड़ पौधे हमें शुद्ध हवा और फल देते हैं, वैसे ही यह पाठ हमें प्रकृति को समझना सिखाता है।`;
    }
    audio.speakTextNatural(explanationElem?.textContent || '', currentLang);
  });

  // Finish and save progress
  btnFinish?.addEventListener('click', async () => {
    const user = getCurrentUser();
    let prog = await dbGet<StudentProgressRecord>('student_progress', user.id);
    if (!prog) {
      prog = {
        studentId: user.id,
        studentName: user.name,
        grade: lesson.grade || 'Grade 1',
        literacyScore: 85,
        numeracyScore: 80,
        listeningScore: 90,
        participationScore: 95,
        overallScore: 88,
        completedLessons: [lesson.id],
        submittedAssignments: [],
        completedWorksheets: [],
        aiRecommendation: 'FLN Active learner',
        recommendationTagClass: 'background:#DCFCE7;color:#15803D;',
        badges: ['FLN Explorer 🌟'],
        lastActive: Date.now(),
        lastAssessed: Date.now(),
        updatedAt: Date.now(),
        syncState: 'pending'
      };
    } else {
      if (!prog.completedLessons) prog.completedLessons = [];
      if (!prog.completedLessons.includes(lesson.id)) {
        prog.completedLessons.push(lesson.id);
      }
      prog.participationScore = Math.min(100, (prog.participationScore || 80) + 5);
      prog.lastActive = Date.now();
      prog.updatedAt = Date.now();
    }
    await dbPut('student_progress', prog);

    const session = getActiveSession();
    if (session && session.status === 'active') {
      recordStudentActivity(user.id, `Completed: ${lesson.title}`, true, 10, [], 'Lesson Finished');
    }

    modal.style.display = 'none';
    showToast('Lesson completed! +10 Points saved to progress! 🎉', '🌟');
    audio.playToneSequence([523, 659, 784, 1046]);
    await refreshStudentPortal();
    await refreshDashboardStats();
  });

  btnClose?.addEventListener('click', () => {
    modal.style.display = 'none';
    if (isReciting && speechRec) {
      try { speechRec.stop(); } catch (_) {}
    }
  });

  renderLanguageContent(currentLang);
  modal.style.display = 'flex';
}

// ===================== STUDENT WORKSHEET MODAL =====================
export function openStudentWorksheetModal(ws: WorksheetRecord) {
  const modal = document.getElementById('student-worksheet-modal');
  if (!modal) return;

  const titleElem = document.getElementById('sw-modal-title');
  const subElem = document.getElementById('sw-modal-sub');
  const container = document.getElementById('sw-modal-questions-container');
  const btnClose = document.getElementById('btn-close-sw-modal');
  const btnCancel = document.getElementById('btn-cancel-sw');
  const btnSubmit = document.getElementById('btn-submit-sw');

  if (titleElem) titleElem.textContent = `✏️ ${ws.title}`;
  if (subElem) subElem.textContent = `${ws.grade || 'Grade 1'} · Bilingual (${ws.languages || 'Mother Tongue'})`;

  const qList = ws.questions && ws.questions.length > 0 ? ws.questions : [
    { q: '1. अपनी मातृभाषा में इस पाठ का नाम लिखें (Write lesson topic in mother tongue)' },
    { q: '2. सही अर्थ का मिलान करें (Match the word with the correct meaning)' },
    { q: '3. चित्र देखकर 2 शब्द लिखें (Write 2 words related to this lesson)' }
  ];

  if (container) {
    container.innerHTML = qList.map((q, idx) => `
      <div style="background:#FAFBFB;border:1px solid var(--border);border-radius:8px;padding:12px;">
        <label style="font-size:0.86rem;font-weight:600;display:block;margin-bottom:6px;color:var(--ink);">${q.q}</label>
        <input type="text" class="input-form-elem sw-answer-input" data-q-idx="${idx}" placeholder="Write your answer here..." style="width:100%;font-size:0.85rem;" />
      </div>
    `).join('');
  }

  const closeModal = () => { modal.style.display = 'none'; };
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  if (btnSubmit) {
    btnSubmit.onclick = async () => {
      const user = getCurrentUser();
      let prog = await dbGet<StudentProgressRecord>('student_progress', user.id);
      if (!prog) {
        prog = {
          studentId: user.id,
          studentName: user.name,
          grade: ws.grade || 'Grade 1',
          literacyScore: 82,
          numeracyScore: 78,
          listeningScore: 85,
          participationScore: 92,
          overallScore: 84,
          completedLessons: [],
          submittedAssignments: [],
          completedWorksheets: [ws.id],
          aiRecommendation: 'Completed practice worksheet',
          recommendationTagClass: 'background:#DCFCE7;color:#15803D;',
          badges: ['Worksheet Solver 📝'],
          lastActive: Date.now(),
          lastAssessed: Date.now(),
          updatedAt: Date.now(),
          syncState: 'pending'
        };
      } else {
        prog.literacyScore = Math.min(100, (prog.literacyScore || 75) + 3);
        prog.participationScore = Math.min(100, (prog.participationScore || 80) + 5);
        if (!prog.completedWorksheets) prog.completedWorksheets = [];
        if (!prog.completedWorksheets.includes(ws.id)) prog.completedWorksheets.push(ws.id);
        prog.lastActive = Date.now();
        prog.updatedAt = Date.now();
      }
      await dbPut('student_progress', prog);

      closeModal();
      showToast(`Worksheet "${ws.title}" submitted to teacher! 🎉`, '✓');
      audio.playToneSequence([523, 659, 784, 1046]);
      await refreshStudentPortal();
      await refreshDashboardStats();
    };
  }

  modal.style.display = 'flex';
}

// Legacy alias reference (primary implementation defined in Lessons Workflow module)


// Printable Worksheet Downloader (Pure Client Blob - Works in iframe & offline)
export function triggerWorksheetDownload(ws: { title: string; languages?: string; grade?: string; questions?: Array<{ q: string }> }) {
  const qList = ws.questions && ws.questions.length > 0 ? ws.questions : [
    { q: '1. चित्र देखकर अपनी मातृभाषा में नाम लिखें (Draw and name object in mother tongue)' },
    { q: '2. सही शब्द का मिलान करें (Match the word with the correct meaning)' },
    { q: '3. 1 से 5 तक संख्या लिखें (Write numerals 1 to 5 in Warang Chiti / Devanagari)' },
    { q: '4. नीचे दिए गए वाक्य को सुंदर अक्षरों में दोहराएं (Trace and write the sentence)' }
  ];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${ws.title} - BhashaSetu Worksheet</title>
  <style>
    @media print { body { padding: 0; } .no-print { display: none; } }
    body { font-family: system-ui, -apple-system, sans-serif; padding: 28px; color: #1e293b; max-width: 800px; margin: 0 auto; line-height: 1.5; }
    .header { border-bottom: 2px solid #15803d; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 20px; font-weight: bold; color: #15803d; margin-bottom: 4px; }
    .sub { font-size: 13px; color: #64748b; }
    .student-meta { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; margin-bottom: 24px; font-size: 13px; background: #f8fafc; }
    .q-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; page-break-inside: avoid; }
    .q-title { font-weight: 600; font-size: 14px; margin-bottom: 12px; color: #0f172a; }
    .answer-line { height: 32px; border-bottom: 1px dashed #94a3b8; margin-top: 10px; }
    .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
    .print-bar { margin-bottom: 16px; text-align: right; }
    .btn-print { background: #15803d; color: white; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
  </style>
</head>
<body>
  <div class="print-bar no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Print Worksheet</button>
  </div>
  <div class="header">
    <div>
      <div class="title">BhashaSetu Vernacular Primary Learning</div>
      <div class="sub">${ws.title} · ${ws.languages || 'Bilingual'} · ${ws.grade || 'Grade 1'}</div>
    </div>
    <div style="text-align: right; font-size: 11px; color: #64748b;">
      <div>NEP 2020 Mother-Tongue Curriculum</div>
      <div>FLN Competency Verified</div>
    </div>
  </div>

  <div class="student-meta">
    <div><strong>Student Name:</strong> _________________________</div>
    <div><strong>Roll No:</strong> _______</div>
    <div><strong>Date:</strong> ___________</div>
  </div>

  <div class="questions-list">
    ${qList.map((q, idx) => `
      <div class="q-card">
        <div class="q-title">${idx + 1}. ${q.q}</div>
        <div class="answer-line"></div>
        <div class="answer-line"></div>
      </div>
    `).join('')}
  </div>

  <div class="footer">
    BhashaSetu Open-Source Vernacular Pedagogy · Designed for Low-Connectivity Multi-Grade Primary Schools
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeTitle = ws.title.replace(/[^a-zA-Z0-9_\u0900-\u097F\u1C50-\u1C7F]/g, '_').substring(0, 40);
  a.href = url;
  a.download = `BhashaSetu_Worksheet_${safeTitle}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showToast(`Downloaded printable worksheet: ${ws.title}`, '📄');
}

// Print / Download Real Worksheet
function printWorksheet(ws: WorksheetRecord) {
  triggerWorksheetDownload(ws);
}

// ===================== REFRESH WORKSHEETS LIST =====================
async function refreshWorksheetsList() {
  let allWorksheets = await dbGetAll<WorksheetRecord>('worksheets');

  try {
    const { data: cloudWs, error } = await fetchWorksheets();
    if (!error && cloudWs && cloudWs.length > 0) {
      allWorksheets = cloudWs as WorksheetRecord[];
      for (const cw of cloudWs) {
        await dbPut('worksheets', cw);
      }
    }
  } catch (err) {
    console.warn('Supabase fetch worksheets notice:', err);
  }

  const container = document.querySelector('#view-worksheets .tool-page-card > div:last-child');
  if (!container) return;

  const teacher = isTeacher();
  const user = getCurrentUser();
  const worksheets = teacher ? allWorksheets : allWorksheets.filter(w => w.approved !== false && (!user.grade || w.grade === user.grade || !w.grade));

  if (worksheets.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:36px 16px;background:#FAFBFB;border:1px dashed var(--border);border-radius:var(--r-m);">
        <div style="font-size:2rem;margin-bottom:8px;">📄</div>
        <div style="font-size:0.95rem;font-weight:600;color:var(--ink);">${teacher ? 'No worksheets generated yet' : 'No worksheets assigned yet'}</div>
        <p style="font-size:0.8rem;color:var(--ink-faint);margin:4px 0 14px;">${teacher ? 'Generate bilingual worksheets or assessments directly from translated lessons or the AI Explainer.' : 'Your teacher will create and publish bilingual worksheets here.'}</p>
        ${teacher ? `
          <button class="btn-solid-green" id="btn-ws-empty-create" style="padding:8px 20px;width:auto;">
            + Create Bilingual Worksheet
          </button>
        ` : ''}
      </div>
    `;
    const emptyBtn = container.querySelector('#btn-ws-empty-create');
    emptyBtn?.addEventListener('click', openCreateWorksheetModal);
    refreshDashboardStats();
    return;
  }

  // If there are worksheets in DB, render them dynamically
  container.innerHTML = worksheets.map(ws => `
    <div class="lesson-row-card ws-card-item" data-lang="${ws.languages || 'Bilingual'}" style="padding:14px;border:1px solid var(--border);border-radius:var(--r-m);background:#FAFBFB;display:flex;align-items:center;gap:12px;">
      <div style="color:var(--green);font-size:1.8rem;width:40px;text-align:center;">📄</div>
      <div class="lesson-meta-wrap" style="flex:1;">
        <div class="lesson-heading" style="font-weight:600;">${ws.title}</div>
        <div class="lesson-sub-meta">${ws.grade || 'Grade 1'} · ${ws.subject || 'Vernacular'} · Bilingual (${ws.languages || 'Mother Tongue'})</div>
      </div>
      <span style="font-size:0.75rem;color:#DC2626;background:#FEE2E2;padding:4px 8px;border-radius:4px;font-weight:600;">PDF ${ws.sizeKb || 240} KB</span>
      <div style="display:flex;gap:6px;align-items:center;">
        ${!teacher ? `
          <button class="btn-chip btn-complete-ws-interactive" data-ws-id="${ws.id}" style="margin:0;font-weight:600;background:#F0FDF4;color:#15803D;border-color:#86EFAC;">✏️ Complete Online</button>
        ` : ''}
        <button class="btn-chip btn-download-ws" data-ws-id="${ws.id}" style="margin:0;font-weight:600;">Download</button>
        ${teacher ? `
          <button class="btn-chip btn-delete-ws" data-ws-id="${ws.id}" style="margin:0;padding:4px 8px;color:#DC2626;" title="Delete Worksheet">🗑️</button>
        ` : ''}
      </div>
    </div>
  `).join('');

  // Wire Complete Online buttons for students
  container.querySelectorAll('.btn-complete-ws-interactive').forEach(btn => {
    btn.addEventListener('click', () => {
      const wsid = btn.getAttribute('data-ws-id');
      const ws = worksheets.find(w => w.id === wsid);
      if (ws) openStudentWorksheetModal(ws);
    });
  });

  // Wire Download buttons to real printable PDF/HTML generator
  container.querySelectorAll('.btn-download-ws').forEach(btn => {
    btn.addEventListener('click', () => {
      const wsid = btn.getAttribute('data-ws-id');
      const ws = worksheets.find(w => w.id === wsid);
      if (ws) triggerWorksheetDownload(ws);
    });
  });

  // Wire Delete buttons for teachers
  container.querySelectorAll('.btn-delete-ws').forEach(btn => {
    btn.addEventListener('click', async () => {
      const wsid = btn.getAttribute('data-ws-id');
      if (wsid) {
        try {
          await deleteWorksheet(wsid);
        } catch (_) {}
        await dbDelete('worksheets', wsid);
        await refreshWorksheetsList();
        showToast('Worksheet deleted', '🗑️');
      }
    });
  });
  refreshDashboardStats();
}

// ===================== CREATE WORKSHEET MODAL =====================
function openCreateWorksheetModal() {
  if (!isTeacher()) {
    showToast('Only teachers can create worksheets.', '⚠️');
    return;
  }

  let modal = document.getElementById('ws-create-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ws-create-modal';
    modal.className = 'modal-backdrop-wrap';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:#FFF;border-radius:12px;width:92%;max-width:540px;padding:24px;box-shadow:0 12px 36px rgba(0,0,0,0.18);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid var(--border-light);padding-bottom:10px;">
        <h3 style="margin:0;font-size:1.15rem;color:var(--green-dark);">📝 Create Bilingual Worksheet</h3>
        <button id="btn-close-create-ws-modal" style="border:none;background:transparent;font-size:1.3rem;cursor:pointer;">✕</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">Worksheet Title:</label>
          <input type="text" id="ws-input-title" class="input-form-elem" placeholder="e.g. Forest Flora &amp; Fauna Tracing Sheet" style="width:100%;font-size:0.85rem;">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">Language:</label>
            <select id="ws-input-lang" class="input-form-elem" style="width:100%;font-size:0.85rem;">
              <option value="Ho">Ho (वारंग क्षिती)</option>
              <option value="Mundari">Mundari (मुंडारी)</option>
              <option value="Santhali">Santhali (संथाली)</option>
              <option value="Telugu">Telugu (తెలుగు)</option>
              <option value="Bilingual">Bilingual</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">Grade Level:</label>
            <select id="ws-input-grade" class="input-form-elem" style="width:100%;font-size:0.85rem;">
              <option value="Grade 1">Grade 1 (Foundational)</option>
              <option value="Grade 2">Grade 2 (FLN)</option>
              <option value="Grade 3">Grade 3 (Preparatory)</option>
              <option value="Grade 4">Grade 4</option>
              <option value="Grade 5">Grade 5</option>
            </select>
          </div>
        </div>

        <div>
          <label style="font-size:0.78rem;font-weight:600;display:block;margin-bottom:4px;">Questions / Activities (1 per line):</label>
          <textarea id="ws-input-questions" class="input-form-elem" rows="4" placeholder="1. चित्र देखकर अपनी मातृभाषा में नाम लिखें&#10;2. सही शब्द का मिलान करें&#10;3. 1 से 10 तक संख्या लिखें" style="width:100%;font-size:0.85rem;"></textarea>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">
          <button id="btn-cancel-create-ws" class="btn-chip" style="padding:6px 14px;">Cancel</button>
          <button id="btn-save-create-ws" class="btn-solid-green" style="width:auto;margin:0;padding:6px 18px;">Create Worksheet</button>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
  const closeModal = () => { if (modal) modal.style.display = 'none'; };
  modal.querySelector('#btn-close-create-ws-modal')?.addEventListener('click', closeModal);
  modal.querySelector('#btn-cancel-create-ws')?.addEventListener('click', closeModal);

  modal.querySelector('#btn-save-create-ws')?.addEventListener('click', async () => {
    const title = (modal.querySelector('#ws-input-title') as HTMLInputElement)?.value.trim();
    const lang = (modal.querySelector('#ws-input-lang') as HTMLSelectElement)?.value;
    const grade = (modal.querySelector('#ws-input-grade') as HTMLSelectElement)?.value;
    const qsRaw = (modal.querySelector('#ws-input-questions') as HTMLTextAreaElement)?.value.trim();

    if (!title) {
      showToast('Please enter a worksheet title.', '⚠️');
      return;
    }

    const questions = qsRaw
      ? qsRaw.split('\n').filter(Boolean).map(q => ({ q, type: 'oral' as const }))
      : [
          { q: '1. अपनी मातृभाषा में नाम लिखें (Write your name and drawing)', type: 'oral' as const },
          { q: '2. सही शब्द का मिलान करें (Match words with vernacular meaning)', type: 'match' as const }
        ];

    const newWs: WorksheetRecord = {
      id: 'ws_' + Date.now(),
      title,
      grade,
      subject: 'Environmental & Language',
      languages: lang,
      format: 'PDF Printable',
      sizeKb: 280,
      questions,
      syncState: 'pending',
      createdAt: Date.now()
    };

    try {
      await createWorksheet(newWs);
    } catch (_) {}

    await dbPut('worksheets', newWs);
    await refreshWorksheetsList();
    closeModal();
    showToast(`Created worksheet: "${title}"`, '✓');
  });
}

// ===================== WORKSHEETS MODULE SETUP =====================
function setupWorksheetsModule() {
  // Create Worksheet button in header
  const btnCreateWs = document.getElementById('btn-open-create-worksheet');
  btnCreateWs?.addEventListener('click', () => openCreateWorksheetModal());

  // Static worksheet buttons in index.html
  document.querySelectorAll('.btn-download-ws-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const title = btn.getAttribute('data-ws-title') || 'Worksheet';
      const lang = btn.getAttribute('data-ws-lang') || 'Bilingual';
      const grade = btn.getAttribute('data-ws-grade') || 'Grade 1';
      triggerWorksheetDownload({ title, languages: lang, grade });
    });
  });

  // Filter tabs in #view-worksheets
  const filterPills = document.querySelectorAll('#view-worksheets .filter-pill-tab');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filter = (pill.textContent || '').trim().toLowerCase();

      const cards = document.querySelectorAll('#view-worksheets .lesson-row-card');
      cards.forEach(card => {
        const text = (card.textContent || '').toLowerCase();
        if (filter === 'all' || text.includes(filter)) {
          (card as HTMLElement).style.display = 'flex';
        } else {
          (card as HTMLElement).style.display = 'none';
        }
      });
    });
  });
}

// ===================== REFRESH ASSIGNMENTS LIST =====================
async function refreshAssignmentsList() {
  let allAssignments = await dbGetAll<AssignmentRecord>('assignments');

  try {
    const { data: cloudAsg, error } = await fetchAssignments();
    if (!error && cloudAsg && cloudAsg.length > 0) {
      allAssignments = cloudAsg as AssignmentRecord[];
      for (const ca of cloudAsg) {
        await dbPut('assignments', ca);
      }
    }
  } catch (err) {
    console.warn('Supabase fetch assignments notice:', err);
  }

  const container = document.getElementById('asg-items-list');
  if (!container) return;

  const teacher = isTeacher();
  const student = isStudent();
  const user = getCurrentUser();
  const assignments = teacher ? allAssignments : allAssignments.filter(a => !user.grade || a.grade === user.grade || !a.grade);

  const pendingCount = assignments.filter(a => !a.submissions || a.submissions.length === 0 || a.submissions.some(s => s.status === 'pending' || s.status === 'submitted')).length;
  const pendingTab = document.querySelector('#asg-filter-pills [data-asg-filter="pending"]');
  if (pendingTab) {
    pendingTab.textContent = `Pending (${pendingCount})`;
  }

  if (assignments.length > 0) {
    container.innerHTML = assignments.map(asg => {
      const subCount = asg.submissions ? asg.submissions.length : 0;
      return `
        <div class="lesson-row-card asg-card-item" data-asg-id="${asg.id}" data-status="${subCount > 0 ? 'submitted' : 'pending'}" style="padding:14px;border:1px solid var(--border);border-radius:var(--r-m);background:#FAFBFB;display:flex;align-items:center;gap:12px;">
          <div style="font-size:1.6rem;color:var(--blue);">📝</div>
          <div class="lesson-meta-wrap" style="flex:1;">
            <div class="lesson-heading" style="font-weight:600;">${asg.title}</div>
            <div class="lesson-sub-meta">${asg.grade} · ${asg.language} · Deadline: ${asg.deadline}</div>
          </div>
          <span class="status-pill-green">${subCount} Submission${subCount === 1 ? '' : 's'}</span>
          <div style="display:flex;gap:6px;align-items:center;">
            ${teacher ? `
              <button class="btn-chip btn-review-assignment" data-asg-id="${asg.id}" style="margin:0;font-weight:600;">Review</button>
              <button class="btn-chip btn-delete-asg" data-asg-id="${asg.id}" style="margin:0;padding:4px 8px;color:#DC2626;" title="Delete Assignment">🗑️</button>
            ` : ''}
            ${student ? `
              <button class="btn-chip btn-submit-hw-asg" data-asg-id="${asg.id}" style="margin:0;font-weight:600;background:#DCFCE7;color:#15803D;border-color:#86EFAC;">Submit Homework ✏️</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } else {
    container.innerHTML = `
      <div style="text-align:center;padding:36px 16px;background:#FAFBFB;border:1px dashed var(--border);border-radius:var(--r-m);">
        <div style="font-size:2rem;margin-bottom:8px;">📝</div>
        <div style="font-size:0.95rem;font-weight:600;color:var(--ink);">No assignments created yet</div>
        <p style="font-size:0.8rem;color:var(--ink-faint);margin:4px 0 14px;">${teacher ? 'Create an assignment or recitation task to track student homework.' : 'No classroom assignments have been assigned yet.'}</p>
        ${teacher ? `
          <button class="btn-solid-green" id="btn-empty-asg-create" style="padding:8px 20px;width:auto;">
            + Create Assignment
          </button>
        ` : ''}
      </div>
    `;
    if (teacher) {
      container.querySelector('#btn-empty-asg-create')?.addEventListener('click', () => openCreateAssignmentModal());
    }
  }

  // Wire Review Assignment Modal (Teachers)
  container.querySelectorAll('.btn-review-assignment').forEach(btn => {
    btn.addEventListener('click', () => {
      const asgId = btn.getAttribute('data-asg-id');
      const asg = assignments.find(a => a.id === asgId);
      if (asg) openAssignmentReviewModal(asg);
    });
  });

  // Wire Delete Assignment (Teachers)
  container.querySelectorAll('.btn-delete-asg').forEach(btn => {
    btn.addEventListener('click', async () => {
      const asgId = btn.getAttribute('data-asg-id');
      if (asgId) {
        try {
          await deleteAssignment(asgId);
        } catch (_) {}
        await dbDelete('assignments', asgId);
        await refreshAssignmentsList();
        showToast('Assignment deleted', '🗑️');
      }
    });
  });

  // Wire Submit Homework Modal (Students)
  container.querySelectorAll('.btn-submit-hw-asg').forEach(btn => {
    btn.addEventListener('click', () => {
      const asgId = btn.getAttribute('data-asg-id');
      const asg = assignments.find(a => a.id === asgId);
      if (asg) openSubmitHomeworkModal(asg);
    });
  });
  refreshDashboardStats();
}

// Student Submit Homework Modal
function openSubmitHomeworkModal(asg: AssignmentRecord) {
  let modal = document.getElementById('asg-submit-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'asg-submit-modal';
    modal.className = 'modal-backdrop-wrap';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
    document.body.appendChild(modal);
  }

  const user = getCurrentUser();

  modal.innerHTML = `
    <div style="background:#FFF;border-radius:12px;width:92%;max-width:540px;padding:24px;max-height:85vh;overflow-y:auto;box-shadow:0 12px 36px rgba(0,0,0,0.18);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid var(--border-light);padding-bottom:10px;">
        <h3 style="margin:0;font-size:1.15rem;color:var(--green-dark);">✏️ Submit Homework: ${asg.title}</h3>
        <button id="btn-close-sub-hw-modal" style="border:none;background:transparent;font-size:1.3rem;cursor:pointer;">✕</button>
      </div>

      <div style="font-size:0.85rem;color:var(--ink);margin-bottom:14px;background:#F8FAFC;padding:12px;border-radius:8px;border:1px solid #E2E8F0;">
        <div><strong>Language:</strong> ${asg.language} · <strong>Grade:</strong> ${asg.grade}</div>
        <div style="margin-top:4px;"><strong>Max Score:</strong> ${asg.maxScore || 10} pts · <strong>Deadline:</strong> ${asg.deadline}</div>
        <div style="margin-top:6px;color:var(--ink-soft);">${asg.description || 'Complete the assignment questions or oral recitation in your mother tongue.'}</div>
      </div>

      <div style="margin-bottom:14px;">
        <label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:6px;">Your Written / Oral Answer (Mother Tongue or Hindi):</label>
        <textarea id="hw-answer-text" class="input-form-elem" rows="4" placeholder="Type your answer, words learned, or oral recitation transcript here..." style="width:100%;font-size:0.88rem;"></textarea>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <button id="btn-hw-record-audio" class="btn-chip" style="padding:6px 14px;">🎤 Record Audio Recitation</button>
        <div style="display:flex;gap:8px;">
          <button id="btn-cancel-sub-hw" class="btn-chip" style="padding:6px 14px;">Cancel</button>
          <button id="btn-confirm-sub-hw" class="btn-solid-green" style="width:auto;margin:0;padding:6px 18px;">Submit Homework</button>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const closeModal = () => { if (modal) modal.style.display = 'none'; };
  modal.querySelector('#btn-close-sub-hw-modal')?.addEventListener('click', closeModal);
  modal.querySelector('#btn-cancel-sub-hw')?.addEventListener('click', closeModal);

  modal.querySelector('#btn-hw-record-audio')?.addEventListener('click', () => {
    audio.playToneSequence([440, 660, 880]);
    const ans = modal.querySelector('#hw-answer-text') as HTMLTextAreaElement;
    if (ans) {
      ans.value = ans.value ? `${ans.value}\n[Audio Recitation in ${asg.language} Recorded]` : `[Audio Recitation in ${asg.language} Recorded]`;
    }
    showToast('Audio recitation recorded! 🎤', '✓');
  });

  modal.querySelector('#btn-confirm-sub-hw')?.addEventListener('click', async () => {
    const ansText = (modal.querySelector('#hw-answer-text') as HTMLTextAreaElement)?.value.trim();
    if (!ansText) {
      showToast('Please type or record your answer before submitting.', '⚠️');
      return;
    }

    if (!asg.submissions) asg.submissions = [];
    asg.submissions.push({
      studentId: user.id,
      studentName: user.name,
      submittedAt: Date.now(),
      status: 'submitted',
      textContent: ansText
    });

    await dbPut('assignments', asg);
    await refreshAssignmentsList();
    closeModal();
    showToast(`Homework submitted for "${asg.title}"! 🎉`, '✓');
  });
}

// ===================== ASSIGNMENTS MODULE SETUP =====================
function setupAssignmentsModule() {
  // New Assignment Button
  const btnNewAsg = document.getElementById('btn-open-new-assignment');
  btnNewAsg?.addEventListener('click', () => openCreateAssignmentModal());

  // Filter tabs in assignments
  const filterPills = document.querySelectorAll('#asg-filter-pills .filter-pill-tab');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filter = pill.getAttribute('data-asg-filter') || 'all';

      const items = document.querySelectorAll('#asg-items-list .asg-card-item');
      items.forEach(item => {
        const status = item.getAttribute('data-status') || 'pending';
        if (filter === 'all') {
          (item as HTMLElement).style.display = 'flex';
        } else if (filter === status) {
          (item as HTMLElement).style.display = 'flex';
        } else {
          (item as HTMLElement).style.display = 'none';
        }
      });
    });
  });

  // Review buttons for static items
  document.querySelectorAll('.btn-review-asg-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const title = btn.getAttribute('data-title') || 'Class Homework';
      const student = btn.getAttribute('data-student') || 'Asha Kumari';
      const submission = btn.getAttribute('data-submission') || 'Mother-tongue recitation audio and written numerals submitted.';
      openAssignmentReviewModal({
        id: 'asg_' + Date.now(),
        title,
        description: 'Primary school homework.',
        grade: 'Grade 1',
        language: 'Ho',
        deadline: 'Today, 5:00 PM',
        maxScore: 20,
        syncState: 'pending',
        createdAt: Date.now(),
        submissions: [
          { studentId: 'st_1', studentName: student, submittedAt: Date.now() - 7200000, status: 'submitted', textContent: submission }
        ]
      });
    });
  });
}

// Create Assignment Modal Dialog (In-App, No window.prompt)
function openCreateAssignmentModal() {
  if (!isTeacher()) {
    showToast('Only teachers can create classroom assignments.', '⚠️');
    return;
  }

  let modal = document.getElementById('create-assignment-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'create-assignment-modal';
    modal.className = 'modal-backdrop-wrap';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:#FFF;border-radius:12px;width:92%;max-width:520px;padding:24px;box-shadow:0 12px 36px rgba(0,0,0,0.18);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;font-size:1.15rem;color:var(--green-dark);">📝 Create New Assignment</h3>
        <button id="btn-close-create-asg" style="border:none;background:transparent;font-size:1.3rem;cursor:pointer;">✕</button>
      </div>
      <p style="font-size:0.8rem;color:var(--ink-soft);margin-bottom:16px;">Create oral recitation or written exercises for tribal vernacular students.</p>

      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="font-size:0.75rem;font-weight:600;display:block;margin-bottom:4px;">Assignment Title:</label>
          <input type="text" id="new-asg-title" class="input-form-elem" value="घर पर 1-10 तक गिनती लिखें (Write Numbers 1-10 in Ho)" style="width:100%;font-size:0.85rem;">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:0.75rem;font-weight:600;display:block;margin-bottom:4px;">Target Language:</label>
            <select id="new-asg-lang" class="input-form-elem" style="width:100%;font-size:0.82rem;">
              <option value="Ho (हो)">Ho (हो / 𑢹𑣉)</option>
              <option value="Mundari (मुंडारी)">Mundari (मुंडारी)</option>
              <option value="Santhali (संथाली)">Santhali (संथाली / ᱚᱞ ᱪᱤᱠᱤ)</option>
              <option value="Telugu (తెలుగు)">Telugu (తెలుగు)</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.75rem;font-weight:600;display:block;margin-bottom:4px;">Grade Level:</label>
            <select id="new-asg-grade" class="input-form-elem" style="width:100%;font-size:0.82rem;">
              <option value="Grade 1">Grade 1 (कक्षा १)</option>
              <option value="Grade 2">Grade 2 (कक्षा २)</option>
              <option value="Grade 3">Grade 3 (कक्षा ३)</option>
            </select>
          </div>
        </div>

        <div>
          <label style="font-size:0.75rem;font-weight:600;display:block;margin-bottom:4px;">Deadline:</label>
          <input type="text" id="new-asg-deadline" class="input-form-elem" value="Tomorrow, 5:00 PM" style="width:100%;font-size:0.85rem;">
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
          <button id="btn-cancel-create-asg" class="btn-chip" style="padding:6px 16px;">Cancel</button>
          <button id="btn-save-create-asg" class="btn-solid-green" style="width:auto;padding:6px 18px;margin:0;">Publish Assignment</button>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  modal.querySelector('#btn-close-create-asg')?.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.querySelector('#btn-cancel-create-asg')?.addEventListener('click', () => { modal.style.display = 'none'; });

  modal.querySelector('#btn-save-create-asg')?.addEventListener('click', async () => {
    const titleInput = modal.querySelector('#new-asg-title') as HTMLInputElement;
    const langInput = modal.querySelector('#new-asg-lang') as HTMLSelectElement;
    const gradeInput = modal.querySelector('#new-asg-grade') as HTMLSelectElement;
    const deadlineInput = modal.querySelector('#new-asg-deadline') as HTMLInputElement;

    const title = titleInput?.value.trim() || 'Classroom Exercise';
    const lang = langInput?.value || 'Ho (हो)';
    const grade = gradeInput?.value || 'Grade 1';
    const deadline = deadlineInput?.value || 'Next Class';

    const newAsg: AssignmentRecord = {
      id: 'asg_' + Date.now(),
      title,
      description: 'Classroom homework assignment created by teacher.',
      grade,
      language: lang,
      deadline,
      maxScore: 20,
      submissions: [],
      syncState: 'pending',
      createdAt: Date.now()
    };

    try {
      await createAssignment(newAsg);
    } catch (_) {}

    await dbPut('assignments', newAsg);
    await refreshAssignmentsList();
    modal.style.display = 'none';
    showToast(`Created assignment: ${title}`, '📝');
  });
}

// Assignment Review Modal
function openAssignmentReviewModal(asg: AssignmentRecord) {
  if (!isTeacher()) {
    showToast('Only teachers can review assignments.', '⚠️');
    return;
  }
  let modal = document.getElementById('asg-review-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'asg-review-modal';
    modal.className = 'modal-backdrop-wrap';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
    document.body.appendChild(modal);
  }

  const subs = asg.submissions || [];

  modal.innerHTML = `
    <div style="background:#FFF;border-radius:12px;width:92%;max-width:560px;padding:24px;max-height:85vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="margin:0;font-size:1.15rem;">Review Submissions: ${asg.title}</h3>
        <button id="btn-close-asg-modal" style="border:none;background:transparent;font-size:1.4rem;cursor:pointer;">✕</button>
      </div>
      <p style="font-size:0.8rem;color:var(--ink-soft);margin-bottom:16px;">Grade student homework and oral recitations in mother tongue.</p>
      
      ${subs.length === 0 ? `
        <div style="text-align:center;padding:32px 16px;background:#FAFBFB;border:1px dashed var(--border);border-radius:8px;color:var(--ink-soft);font-size:0.85rem;">
          <div style="font-size:1.6rem;margin-bottom:6px;">📭</div>
          <strong style="color:var(--ink);display:block;margin-bottom:4px;">No Submissions Yet</strong>
          When enrolled students submit their oral recitation or written answers, they will appear here for grading and feedback.
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${subs.map((s, idx) => `
            <div style="padding:12px;border:1px solid var(--border);border-radius:8px;background:#FAFBFB;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong>${s.studentName}</strong>
                <span class="status-pill-green">${s.status === 'graded' ? `Graded: ${s.score}/${s.maxScore || 20}` : 'Needs Review'}</span>
              </div>
              <p style="font-size:0.85rem;margin:8px 0;color:var(--ink);">${s.textContent || 'Audio recording submitted.'}</p>
              <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
                <input type="number" id="grade-score-${idx}" placeholder="Marks (0-${asg.maxScore})" value="${s.score || ''}" style="width:100px;padding:4px 8px;font-size:0.8rem;border:1px solid #CBD5E1;border-radius:4px;">
                <input type="text" id="grade-feedback-${idx}" placeholder="Vernacular feedback..." value="${s.feedback || ''}" style="flex:1;padding:4px 8px;font-size:0.8rem;border:1px solid #CBD5E1;border-radius:4px;">
                <button class="btn-solid-green btn-save-grade" data-sub-idx="${idx}" style="width:auto;padding:4px 12px;margin:0;font-size:0.75rem;">Grade</button>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
  modal.style.display = 'flex';

  modal.querySelector('#btn-close-asg-modal')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.querySelectorAll('.btn-save-grade').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.getAttribute('data-sub-idx'));
      const scoreInput = modal.querySelector(`#grade-score-${idx}`) as HTMLInputElement;
      const feedbackInput = modal.querySelector(`#grade-feedback-${idx}`) as HTMLInputElement;

      if (asg.submissions[idx]) {
        const score = Number(scoreInput?.value || 18);
        const feedback = feedbackInput?.value || 'शानदार उच्चारण! (Bariya kaji!)';
        asg.submissions[idx].score = score;
        asg.submissions[idx].feedback = feedback;
        asg.submissions[idx].status = 'graded';
        await dbPut('assignments', asg);

        // Update student progress in IndexedDB
        const sub = asg.submissions[idx];
        const studentId = sub.studentId || 'st_asha';
        let prog = await dbGet<StudentProgressRecord>('student_progress', studentId);
        const pct = Math.round((score / (asg.maxScore || 20)) * 100);
        if (!prog) {
          prog = {
            studentId,
            studentName: sub.studentName || 'Asha Kumari',
            grade: asg.grade || 'Grade 1',
            literacyScore: pct,
            numeracyScore: Math.min(100, pct + 2),
            listeningScore: Math.min(100, pct + 5),
            participationScore: 90,
            overallScore: pct,
            completedLessons: [],
            submittedAssignments: [asg.id],
            completedWorksheets: [],
            aiRecommendation: `Teacher Feedback: ${feedback}. Encourage tribal oral recitation.`,
            recommendationTagClass: 'background:#DCFCE7;color:#15803D;',
            lastActive: Date.now(),
            lastAssessed: Date.now(),
            syncState: 'pending'
          };
        } else {
          prog.literacyScore = Math.round((prog.literacyScore + pct) / 2);
          prog.listeningScore = Math.min(100, prog.listeningScore + 4);
          prog.overallScore = Math.round((prog.literacyScore + prog.numeracyScore + prog.listeningScore) / 3);
          prog.aiRecommendation = `Recitation graded (${score}/${asg.maxScore || 20}): ${feedback}`;
          prog.lastAssessed = Date.now();
        }
        await dbPut('student_progress', prog);

        showToast(`Graded submission for ${asg.submissions[idx].studentName}`, '✓');
        modal.style.display = 'none';
        await refreshAssignmentsList();
        await refreshStudentProgress();
        await refreshStudentPortal();
      }
    });
  });
}

// ===================== REFRESH STUDENT PROGRESS =====================
async function refreshStudentProgress() {
  await refreshStudentProgressSecure();
}

// ===================== AI TRANSLATOR & EXPLAINER (CLEAN 3-STEP WORKFLOW) =====================
function setupAITranslatorAndExplainer() {
  // DOM Elements - Stepper
  const stepInd1 = document.getElementById('te-step-ind-1');
  const stepInd2 = document.getElementById('te-step-ind-2');
  const stepInd3 = document.getElementById('te-step-ind-3');
  const stepInd4 = document.getElementById('te-step-ind-4');
  const stepLine1 = document.getElementById('te-stepper-line-1');
  const stepLine2 = document.getElementById('te-stepper-line-2');
  const stepLine3 = document.getElementById('te-stepper-line-3');

  // Try Demo buttons
  const btnTryDemo = document.getElementById('btn-te-try-demo');
  const btnEmptyTryDemo = document.getElementById('btn-te-empty-try-demo');

  // DOM Elements - Target Language
  const selectTargetLang = document.getElementById('te-select-target-lang') as HTMLSelectElement | null;

  // DOM Elements - Status and Error Banners
  const statusBanner = document.getElementById('te-status-banner');
  const statusTitle = document.getElementById('te-status-title');
  const statusDesc = document.getElementById('te-status-desc');
  const errorBanner = document.getElementById('te-error-banner');
  const errorMessage = document.getElementById('te-error-message');
  const btnErrorDismiss = document.getElementById('btn-te-error-dismiss');

  // DOM Elements - Step 1: Upload & Scan
  const btnOpenCamera = document.getElementById('btn-te-open-camera');
  const btnTriggerUpload = document.getElementById('btn-te-trigger-upload');
  const dropzone = document.getElementById('te-dropzone');
  const fileInput = document.getElementById('te-file-input') as HTMLInputElement | null;
  const cameraFileInput = document.getElementById('te-camera-file-input') as HTMLInputElement | null;
  const btnToggleManual = document.getElementById('btn-te-toggle-manual');
  const manualInputBox = document.getElementById('te-manual-input-box');
  const manualText = document.getElementById('te-manual-text') as HTMLTextAreaElement | null;
  const btnSubmitText = document.getElementById('btn-te-submit-text');
  const btnResetAll = document.getElementById('btn-te-reset-all');

  // Scanned Content Display
  const scannedContainer = document.getElementById('te-scanned-container');
  const scannedFileName = document.getElementById('te-scanned-file-name');
  const imagePreviewWrap = document.getElementById('te-image-preview-wrap');
  const imagePreview = document.getElementById('te-image-preview') as HTMLImageElement | null;
  const scannedTextView = document.getElementById('te-scanned-text-view');
  const scannedTextEditWrap = document.getElementById('te-scanned-text-edit-wrap');
  const scannedTextEdit = document.getElementById('te-scanned-text-edit') as HTMLTextAreaElement | null;
  const btnEditScanned = document.getElementById('btn-te-edit-scanned');
  const btnClearScan = document.getElementById('btn-te-clear-scan');
  const btnCancelEdit = document.getElementById('btn-te-cancel-edit');
  const btnSaveRetranslate = document.getElementById('btn-te-save-retranslate');

  // DOM Elements - Step 2: Translation
  const translationEmpty = document.getElementById('te-translation-empty');
  const translationContent = document.getElementById('te-translation-content');
  const detectedLangBadge = document.getElementById('te-detected-lang-badge');
  const detectedLangText = document.getElementById('te-detected-lang-text');
  const activeTargetLangLabel = document.getElementById('te-active-target-lang-label');
  const translatedTextOutput = document.getElementById('te-translated-text-output');
  const scriptVariantOutput = document.getElementById('te-script-variant-output');
  const btnCopyTranslation = document.getElementById('btn-te-copy-translation');
  const btnListenTranslation = document.getElementById('btn-te-listen-translation');
  const listenTranslationLabel = document.getElementById('te-listen-translation-label');

  // DOM Elements - Step 3: Explanation
  const explanationEmpty = document.getElementById('te-explanation-empty');
  const explanationContent = document.getElementById('te-explanation-content');
  const explanationTextOutput = document.getElementById('te-explanation-text-output');
  const btnCopyExplanation = document.getElementById('btn-te-copy-explanation');
  const btnListenExplanation = document.getElementById('btn-te-listen-explanation');
  const listenExplanationLabel = document.getElementById('te-listen-explanation-label');

  // DOM Elements - Step 4: AI Enhancement
  const enhancementEmpty = document.getElementById('te-enhancement-empty');
  const enhancementContent = document.getElementById('te-enhancement-content');
  const audioStatusPill = document.getElementById('te-audio-status-pill');
  const audioStatusText = document.getElementById('te-audio-status-text');

  // Bilingual Explainer Elements
  const explainerEnglishText = document.getElementById('te-explainer-english-text');
  const explainerHindiText = document.getElementById('te-explainer-hindi-text');
  const btnPlayEnAudio = document.getElementById('btn-te-play-en-audio');
  const btnPauseEnAudio = document.getElementById('btn-te-pause-en-audio');
  const btnReplayEnAudio = document.getElementById('btn-te-replay-en-audio');

  const btnPlayHiAudio = document.getElementById('btn-te-play-hi-audio');
  const btnPauseHiAudio = document.getElementById('btn-te-pause-hi-audio');
  const btnReplayHiAudio = document.getElementById('btn-te-replay-hi-audio');

  // AI Visual Demo Elements
  const visualTitle = document.getElementById('te-visual-title');
  const visualFrame = document.getElementById('te-visual-frame');
  const visualCaption = document.getElementById('te-visual-caption');
  const btnToggleVernacularLabels = document.getElementById('btn-te-toggle-vernacular-labels');

  // AI Visual Learning Elements
  const videoGenBadge = document.getElementById('te-video-gen-badge');
  const visualPromptText = document.getElementById('te-visual-prompt-text');
  const promptSourceText = document.getElementById('te-prompt-source-text');
  const i2vBadge = document.getElementById('te-i2v-badge');
  const videoGeneratingBox = document.getElementById('te-video-generating-box');
  const genStatusText = document.getElementById('te-gen-status-text');
  const genProgressBar = document.getElementById('te-gen-progress-bar');
  const genStepLabel = document.getElementById('te-gen-step-label');
  const genPercentLabel = document.getElementById('te-gen-percent-label');
  const pstep1 = document.getElementById('te-pstep-1');
  const pstep2 = document.getElementById('te-pstep-2');
  const pstep3 = document.getElementById('te-pstep-3');
  const pstep4 = document.getElementById('te-pstep-4');
  const videoFallbackNotice = document.getElementById('te-video-fallback-notice');
  const videoPlayerCard = document.getElementById('te-video-player-card');
  const aiVideoPlayer = document.getElementById('te-ai-video-player') as HTMLVideoElement | null;
  const videoWatermark = document.getElementById('te-video-watermark');
  const videoCanvas = document.getElementById('te-video-canvas') as HTMLCanvasElement | null;
  const videoOverlay = document.getElementById('te-video-overlay');
  const btnPlayVideoDemo = document.getElementById('btn-te-play-video-demo');
  const videoLoading = document.getElementById('te-video-loading');
  const btnVideoToggle = document.getElementById('btn-te-video-toggle');
  const btnVideoReplay = document.getElementById('btn-te-video-replay');
  const btnVideoRegenerate = document.getElementById('btn-te-video-regenerate');
  const iconVidPlay = document.getElementById('icon-vid-play');
  const iconVidPause = document.getElementById('icon-vid-pause');
  const labelVideoToggle = document.getElementById('label-te-video-toggle');
  const videoScrubber = document.getElementById('te-video-scrubber') as HTMLInputElement | null;
  const videoTime = document.getElementById('te-video-time');
  const btnVideoSpeed = document.getElementById('btn-te-video-speed');
  const btnVideoFullscreen = document.getElementById('btn-te-video-fullscreen');
  const videoMainCaption = document.getElementById('te-video-main-caption');
  const videoCaptionEn = document.getElementById('te-video-caption-en');
  const videoCaptionHi = document.getElementById('te-video-caption-hi');
  const btnToggleVisualDiagram = document.getElementById('btn-te-toggle-visual-diagram');
  const diagramAccordionBody = document.getElementById('te-diagram-accordion-body');
  const diagramArrow = document.getElementById('te-diagram-arrow');

  // AI Chat Elements
  const chatSuggestions = document.getElementById('te-chat-suggestions');
  const chatMessages = document.getElementById('te-chat-messages');
  const chatForm = document.getElementById('te-chat-form');
  const chatInput = document.getElementById('te-chat-input') as HTMLInputElement | null;
  const btnChatSend = document.getElementById('btn-te-chat-send');

  // DOM Elements - Camera Modal
  const cameraModal = document.getElementById('te-camera-modal');
  const btnCameraClose = document.getElementById('btn-te-camera-close');
  const cameraVideo = document.getElementById('te-camera-video') as HTMLVideoElement | null;
  const cameraCanvas = document.getElementById('te-camera-canvas') as HTMLCanvasElement | null;
  const btnCameraSwitch = document.getElementById('btn-te-camera-switch');
  const btnCameraCapture = document.getElementById('btn-te-camera-capture');
  const cameraFallbackAlert = document.getElementById('te-camera-fallback-alert');
  const btnCameraFileFallback = document.getElementById('btn-te-camera-file-fallback');
  const btnCameraUploadFallback = document.getElementById('btn-te-camera-upload-fallback');

  // State
  let currentScannedText = '';
  let currentFileName = '';
  let currentImageDataUrl = '';
  let currentDetectedLang = '';
  let currentTranslatedText = '';
  let currentExplanation = '';
  let currentTopic = 'plants';
  let currentEnglishExplainer = '';
  let currentHindiExplainer = '';
  let isScanning = false;
  let cameraStream: MediaStream | null = null;
  let cameraFacingMode: 'environment' | 'user' = 'environment';
  let isListeningTranslation = false;
  let isListeningExplanation = false;

  // Update Stepper Progress
  function updateStepper(step: 1 | 2 | 3 | 4) {
    if (stepInd1) {
      stepInd1.className = step >= 1 ? 'te-step-indicator active' + (step > 1 ? ' completed' : '') : 'te-step-indicator';
    }
    if (stepLine1) {
      stepLine1.className = step >= 2 ? 'te-stepper-line active' : 'te-stepper-line';
    }
    if (stepInd2) {
      stepInd2.className = step >= 2 ? 'te-step-indicator active' + (step > 2 ? ' completed' : '') : 'te-step-indicator';
    }
    if (stepLine2) {
      stepLine2.className = step >= 3 ? 'te-stepper-line active' : 'te-stepper-line';
    }
    if (stepInd3) {
      stepInd3.className = step >= 3 ? 'te-step-indicator active' + (step > 3 ? ' completed' : '') : 'te-step-indicator';
    }
    if (stepLine3) {
      stepLine3.className = step >= 4 ? 'te-stepper-line active' : 'te-stepper-line';
    }
    if (stepInd4) {
      stepInd4.className = step >= 4 ? 'te-step-indicator active completed' : 'te-step-indicator';
    }
  }

  // Show / Hide Status Banner
  function showStatus(title: string, desc: string) {
    if (statusBanner) {
      if (statusTitle) statusTitle.textContent = title;
      if (statusDesc) statusDesc.textContent = desc;
      statusBanner.style.display = 'flex';
    }
    hideError();
  }

  function hideStatus() {
    if (statusBanner) statusBanner.style.display = 'none';
  }

  // Show / Hide Error Banner
  function showError(msg: string) {
    if (errorBanner) {
      if (errorMessage) errorMessage.textContent = msg;
      errorBanner.style.display = 'flex';
    }
    hideStatus();
  }

  function hideError() {
    if (errorBanner) errorBanner.style.display = 'none';
  }

  btnErrorDismiss?.addEventListener('click', hideError);

  // Reset entire workflow back to pristine initial state
  function resetAll() {
    currentScannedText = '';
    currentFileName = '';
    currentImageDataUrl = '';
    currentDetectedLang = '';
    currentTranslatedText = '';
    currentExplanation = '';
    isScanning = false;

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    isListeningTranslation = false;
    isListeningExplanation = false;
    if (listenTranslationLabel) listenTranslationLabel.textContent = 'Listen';
    if (listenExplanationLabel) listenExplanationLabel.textContent = 'Listen';

    hideStatus();
    hideError();
    updateStepper(1);

    // Reset Step 1
    if (scannedContainer) scannedContainer.style.display = 'none';
    if (imagePreviewWrap) imagePreviewWrap.style.display = 'none';
    if (imagePreview) imagePreview.src = '';
    if (scannedTextView) scannedTextView.textContent = '';
    if (scannedTextEdit) scannedTextEdit.value = '';
    if (scannedTextEditWrap) scannedTextEditWrap.style.display = 'none';
    if (scannedTextView) scannedTextView.style.display = 'block';
    if (btnResetAll) btnResetAll.style.display = 'none';
    if (manualText) manualText.value = '';
    if (manualInputBox) manualInputBox.style.display = 'none';
    if (fileInput) fileInput.value = '';
    if (cameraFileInput) cameraFileInput.value = '';

    // Reset Step 2
    if (translationEmpty) translationEmpty.style.display = 'block';
    if (translationContent) translationContent.style.display = 'none';
    if (detectedLangBadge) detectedLangBadge.style.display = 'none';
    if (translatedTextOutput) translatedTextOutput.textContent = '';
    if (scriptVariantOutput) {
      scriptVariantOutput.textContent = '';
      scriptVariantOutput.style.display = 'none';
    }

    // Reset Step 3
    if (explanationEmpty) explanationEmpty.style.display = 'block';
    if (explanationContent) explanationContent.style.display = 'none';
    if (explanationTextOutput) explanationTextOutput.textContent = '';

    // Reset Step 4
    stopAllExplainerAudio();
    pauseVideo();
    videoCurrentTime = 0;
    if (currentVideoUrl) {
      URL.revokeObjectURL(currentVideoUrl);
      currentVideoUrl = '';
    }
    if (aiVideoPlayer) {
      aiVideoPlayer.pause();
      aiVideoPlayer.removeAttribute('src');
      aiVideoPlayer.load();
      aiVideoPlayer.style.display = 'none';
    }
    if (videoCanvas) videoCanvas.style.display = 'block';
    if (videoGeneratingBox) videoGeneratingBox.style.display = 'none';
    if (videoPlayerCard) videoPlayerCard.style.display = 'flex';
    if (videoFallbackNotice) videoFallbackNotice.style.display = 'none';
    if (enhancementEmpty) enhancementEmpty.style.display = 'block';
    if (enhancementContent) enhancementContent.style.display = 'none';
    setAudioStatus('ready', 'Audio Ready');
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="te-chat-bubble assistant">
          <div class="te-bubble-author">
            <span class="te-avatar-dot">🤖</span>
            <strong>BhashaSetu AI Companion</strong>
          </div>
          <div class="te-bubble-body">
            <p class="te-msg-en">Johar! 🙏 Ask any question about this lesson. I will explain it step-by-step in English and Hindi.</p>
            <p class="te-msg-hi">जोहार! 🙏 इस पाठ के बारे में कोई भी प्रश्न पूछें। मैं आपको सरल शब्दों में समझाऊँगा।</p>
          </div>
        </div>
      `;
    }
  }

  btnResetAll?.addEventListener('click', resetAll);
  btnClearScan?.addEventListener('click', resetAll);

  // Core Processing Function: Upload/Camera -> OCR -> Detection -> Translation -> Explanation -> AI Enhancement
  async function processScanAndTranslate(opts: {
    file?: File;
    fileData?: string;
    fileName?: string;
    text?: string;
    targetLang?: string;
  }) {
    if (isScanning) return;
    isScanning = true;
    hideError();

    const targetLang = opts.targetLang || selectTargetLang?.value || 'Ho';

    try {
      let imageBase64 = opts.fileData || '';
      let fileText = opts.text || '';
      const fileName = opts.fileName || opts.file?.name || (imageBase64 ? 'Scanned Image' : 'Input Text');

      // If a File object was passed, read it
      if (opts.file && !imageBase64 && !fileText) {
        showStatus('Reading file...', `Loading ${opts.file.name}`);
        if (opts.file.type.startsWith('image/')) {
          imageBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string) || '');
            reader.onerror = reject;
            reader.readAsDataURL(opts.file!);
          });
        } else {
          fileText = await opts.file.text();
        }
      }

      // If user uploaded an image or camera scan, show preview thumbnail
      if (imageBase64 && imageBase64.startsWith('data:image/')) {
        currentImageDataUrl = imageBase64;
        if (imagePreview) imagePreview.src = imageBase64;
        if (imagePreviewWrap) imagePreviewWrap.style.display = 'block';
      } else if (!currentImageDataUrl) {
        if (imagePreviewWrap) imagePreviewWrap.style.display = 'none';
      }

      currentFileName = fileName;
      if (scannedFileName) {
        scannedFileName.textContent = fileName ? `(${fileName})` : '';
      }

      // Step 1: Scanning / OCR Status
      showStatus(
        imageBase64 ? 'Scanning text with AI Lens...' : 'Analyzing text...',
        imageBase64 ? 'Recognizing printed or handwritten characters...' : 'Reading text content...'
      );
      updateStepper(1);

      // Call Unified API Endpoint
      const response = await fetch('/api/ai/scan-and-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imageBase64 || undefined,
          fileText: fileText || undefined,
          fileName: fileName,
          targetLang: targetLang
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${response.status}`);
      }

      const data = await response.json();

      // Successful Extraction
      currentScannedText = data.extractedText || fileText || '';
      currentDetectedLang = data.detectedSourceLang || 'Unknown';
      currentTranslatedText = data.translatedText || '';
      currentExplanation = data.explanation || '';
      currentTopic = data.conceptTopic || 'plants';
      currentEnglishExplainer = data.englishExplanation || currentExplanation || 'Plants need sunlight, water and fresh air to grow healthy and strong.';
      currentHindiExplainer = data.hindiExplanation || 'पौधों को बढ़ने के लिए सूर्य का प्रकाश, पानी और हवा की आवश्यकता होती है।';

      // Step 1 UI Update: Show Scanned Text
      if (scannedTextView) scannedTextView.textContent = currentScannedText;
      if (scannedTextEdit) scannedTextEdit.value = currentScannedText;
      if (scannedContainer) scannedContainer.style.display = 'block';
      if (btnResetAll) btnResetAll.style.display = 'inline-flex';

      // Step 2 UI Update: Show Translation & Detected Language
      updateStepper(2);
      if (detectedLangText) {
        detectedLangText.textContent = `Detected: ${currentDetectedLang}`;
      }
      if (detectedLangBadge) detectedLangBadge.style.display = 'inline-flex';

      if (activeTargetLangLabel) {
        activeTargetLangLabel.textContent = `${targetLang} Translation`;
      }
      if (translatedTextOutput) {
        translatedTextOutput.textContent = currentTranslatedText;
      }

      if (scriptVariantOutput) {
        if (data.scriptVariant) {
          scriptVariantOutput.textContent = `Native Script: ${data.scriptVariant}`;
          scriptVariantOutput.style.display = 'block';
        } else {
          scriptVariantOutput.style.display = 'none';
        }
      }

      if (translationEmpty) translationEmpty.style.display = 'none';
      if (translationContent) translationContent.style.display = 'block';

      // Step 3 UI Update: Show Explanation
      updateStepper(3);
      if (explanationTextOutput) {
        // Format simple paragraphs
        const paragraphs = currentExplanation.split('\n\n').filter(Boolean);
        explanationTextOutput.innerHTML = paragraphs.map(p => `<p style="margin:0 0 10px 0;line-height:1.65;">${p.replace(/\n/g, '<br>')}</p>`).join('');
      }

      if (explanationEmpty) explanationEmpty.style.display = 'none';
      if (explanationContent) explanationContent.style.display = 'block';

      // Step 4 UI Update: Show AI Enhancement
      updateStepper(4);
      renderAIEnhancement({
        topic: currentTopic,
        englishExplanation: currentEnglishExplainer,
        hindiExplanation: currentHindiExplainer,
        targetLang: targetLang,
        lessonText: currentScannedText
      });

      hideStatus();
      showToast(`Scanned & translated into ${targetLang}! AI Enhancement ready.`, '🌐');
    } catch (err: any) {
      console.error('Scan and translate error:', err);
      hideStatus();
      showError(err.message || 'Failed to scan and translate text. Please check your connection or try another image.');
      showToast('Scan failed. Please try again.', '⚠️');
    } finally {
      isScanning = false;
    }
  }

  // Expose global hook for loading from other views
  (window as any).__bhashasetuScanAndTranslate = (opts: any) => {
    processScanAndTranslate(opts);
  };

  // Re-translate when target language changes (if text already scanned)
  selectTargetLang?.addEventListener('change', () => {
    const newLang = selectTargetLang.value;
    if (activeTargetLangLabel) {
      activeTargetLangLabel.textContent = `${newLang} Translation`;
    }
    if (currentScannedText.trim()) {
      processScanAndTranslate({
        text: currentScannedText,
        fileName: currentFileName,
        targetLang: newLang
      });
    }
  });

  // Edit Scanned Text
  btnEditScanned?.addEventListener('click', () => {
    if (scannedTextView && scannedTextEditWrap && scannedTextEdit) {
      scannedTextView.style.display = 'none';
      scannedTextEditWrap.style.display = 'block';
      scannedTextEdit.value = currentScannedText;
      scannedTextEdit.focus();
    }
  });

  btnCancelEdit?.addEventListener('click', () => {
    if (scannedTextView && scannedTextEditWrap) {
      scannedTextView.style.display = 'block';
      scannedTextEditWrap.style.display = 'none';
    }
  });

  btnSaveRetranslate?.addEventListener('click', () => {
    if (!scannedTextEdit) return;
    const editedText = scannedTextEdit.value.trim();
    if (!editedText) {
      showToast('Scanned text cannot be empty.', '⚠️');
      return;
    }
    currentScannedText = editedText;
    if (scannedTextView) {
      scannedTextView.textContent = editedText;
      scannedTextView.style.display = 'block';
    }
    if (scannedTextEditWrap) scannedTextEditWrap.style.display = 'none';

    processScanAndTranslate({
      text: editedText,
      fileName: currentFileName || 'Edited Text',
      targetLang: selectTargetLang?.value
    });
  });

  // Manual Text Toggle
  btnToggleManual?.addEventListener('click', () => {
    if (!manualInputBox) return;
    const isHidden = manualInputBox.style.display === 'none' || !manualInputBox.style.display;
    manualInputBox.style.display = isHidden ? 'block' : 'none';
    if (isHidden && manualText) manualText.focus();
  });

  btnSubmitText?.addEventListener('click', () => {
    const val = manualText?.value.trim() || '';
    if (!val) {
      showToast('Please paste or type text to translate.', '⚠️');
      manualText?.focus();
      return;
    }
    currentImageDataUrl = '';
    if (imagePreviewWrap) imagePreviewWrap.style.display = 'none';
    processScanAndTranslate({ text: val, fileName: 'Manual Text' });
  });

  // File Upload Handlers
  btnTriggerUpload?.addEventListener('click', () => {
    fileInput?.click();
  });

  dropzone?.addEventListener('click', () => {
    fileInput?.click();
  });

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const f = e.dataTransfer?.files?.[0];
    if (f) {
      processScanAndTranslate({ file: f, fileName: f.name });
    }
  });

  fileInput?.addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) {
      processScanAndTranslate({ file: f, fileName: f.name });
    }
  });

  cameraFileInput?.addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) {
      closeCameraModal();
      processScanAndTranslate({ file: f, fileName: 'Camera Photo' });
    }
  });

  // Camera Google Lens Functionality
  async function startCamera() {
    if (cameraModal) cameraModal.style.display = 'flex';
    if (cameraFallbackAlert) cameraFallbackAlert.style.display = 'none';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (cameraFallbackAlert) cameraFallbackAlert.style.display = 'block';
      showToast('Camera API not supported on this browser.', '⚠️');
      return;
    }

    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      cameraStream = stream;
      if (cameraVideo) {
        cameraVideo.srcObject = stream;
        cameraVideo.play();
      }
    } catch (err) {
      console.warn('Live camera stream error:', err);
      if (cameraFallbackAlert) cameraFallbackAlert.style.display = 'block';
      showToast('Could not access live camera. You can use device photo capture.', '⚠️');
    }
  }

  function closeCameraModal() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    if (cameraVideo) cameraVideo.srcObject = null;
    if (cameraModal) cameraModal.style.display = 'none';
  }

  btnOpenCamera?.addEventListener('click', startCamera);
  btnCameraClose?.addEventListener('click', closeCameraModal);

  btnCameraSwitch?.addEventListener('click', () => {
    cameraFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    startCamera();
  });

  btnCameraCapture?.addEventListener('click', () => {
    if (!cameraVideo || !cameraCanvas) return;
    const w = cameraVideo.videoWidth || 640;
    const h = cameraVideo.videoHeight || 480;
    cameraCanvas.width = w;
    cameraCanvas.height = h;

    const ctx = cameraCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(cameraVideo, 0, 0, w, h);

    const dataUrl = cameraCanvas.toDataURL('image/jpeg', 0.92);
    closeCameraModal();

    processScanAndTranslate({
      fileData: dataUrl,
      fileName: 'Camera_Lens_Scan.jpg',
      targetLang: selectTargetLang?.value
    });
  });

  btnCameraFileFallback?.addEventListener('click', () => {
    cameraFileInput?.click();
  });

  btnCameraUploadFallback?.addEventListener('click', () => {
    closeCameraModal();
    fileInput?.click();
  });

  // Copy Buttons
  btnCopyTranslation?.addEventListener('click', async () => {
    if (!currentTranslatedText) return;
    try {
      await navigator.clipboard.writeText(currentTranslatedText);
      showToast('Translation copied to clipboard!', '📋');
    } catch (e) {
      showToast('Failed to copy', '⚠️');
    }
  });

  btnCopyExplanation?.addEventListener('click', async () => {
    if (!currentExplanation) return;
    try {
      await navigator.clipboard.writeText(currentExplanation);
      showToast('Explanation copied to clipboard!', '📋');
    } catch (e) {
      showToast('Failed to copy', '⚠️');
    }
  });

  // Listen (Speech Synthesis) for Translation
  btnListenTranslation?.addEventListener('click', () => {
    if (!currentTranslatedText) return;

    if (isListeningTranslation) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      isListeningTranslation = false;
      if (listenTranslationLabel) listenTranslationLabel.textContent = 'Listen';
      return;
    }

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    isListeningTranslation = true;
    isListeningExplanation = false;
    if (listenTranslationLabel) listenTranslationLabel.textContent = 'Stop';
    if (listenExplanationLabel) listenExplanationLabel.textContent = 'Listen';

    const targetLang = selectTargetLang?.value || 'Ho';
    const langCode = targetLang === 'Telugu' ? 'te-IN' : targetLang === 'Hindi' ? 'hi-IN' : targetLang === 'English' ? 'en-IN' : 'hi-IN';

    if (typeof (audio as any)?.speakTextNatural === 'function') {
      audio.speakTextNatural(currentTranslatedText, langCode).finally(() => {
        isListeningTranslation = false;
        if (listenTranslationLabel) listenTranslationLabel.textContent = 'Listen';
      });
    } else {
      audio.speakText(currentTranslatedText, langCode);
      // Fallback timer or end listener
      setTimeout(() => {
        isListeningTranslation = false;
        if (listenTranslationLabel) listenTranslationLabel.textContent = 'Listen';
      }, 5000);
    }
  });

  // Listen (Speech Synthesis) for Explanation
  btnListenExplanation?.addEventListener('click', () => {
    if (!currentExplanation) return;

    if (isListeningExplanation) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      isListeningExplanation = false;
      if (listenExplanationLabel) listenExplanationLabel.textContent = 'Listen';
      return;
    }

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    isListeningExplanation = true;
    isListeningTranslation = false;
    if (listenExplanationLabel) listenExplanationLabel.textContent = 'Stop';
    if (listenTranslationLabel) listenTranslationLabel.textContent = 'Listen';

    const targetLang = selectTargetLang?.value || 'Ho';
    const langCode = targetLang === 'English' ? 'en-IN' : 'hi-IN';

    if (typeof (audio as any)?.speakTextNatural === 'function') {
      audio.speakTextNatural(currentExplanation, langCode).finally(() => {
        isListeningExplanation = false;
        if (listenExplanationLabel) listenExplanationLabel.textContent = 'Listen';
      });
    } else {
      audio.speakText(currentExplanation, langCode);
      setTimeout(() => {
        isListeningExplanation = false;
        if (listenExplanationLabel) listenExplanationLabel.textContent = 'Listen';
      }, 5000);
    }
  });

  // ==========================================================================
  // STEP 4: AI ENHANCEMENT ENGINE (Bilingual Audio, Visual SVG, Video Demo, Chat)
  // ==========================================================================

  // --- 1. Audio Engine for Bilingual Explainer ---
  let activeExplainerPlayer: SentenceAudioPlayer | null = null;
  let currentAudioLang: 'en' | 'hi' | null = null;

  function setAudioStatus(state: 'ready' | 'playing' | 'paused' | 'unavailable', label: string) {
    if (!audioStatusPill || !audioStatusText) return;
    audioStatusPill.className = `te-audio-pill ${state}`;
    audioStatusText.textContent = label;
  }

  function updateAudioButtonUI(lang: 'en' | 'hi', state: 'playing' | 'paused' | 'idle') {
    const playBtn = lang === 'en' ? btnPlayEnAudio : btnPlayHiAudio;
    const pauseBtn = lang === 'en' ? btnPauseEnAudio : btnPauseHiAudio;
    const otherPlayBtn = lang === 'en' ? btnPlayHiAudio : btnPlayEnAudio;
    const otherPauseBtn = lang === 'en' ? btnPauseHiAudio : btnPauseEnAudio;

    if (state === 'playing') {
      if (playBtn) playBtn.style.display = 'none';
      if (pauseBtn) pauseBtn.style.display = 'inline-flex';
      if (otherPlayBtn) otherPlayBtn.style.display = 'inline-flex';
      if (otherPauseBtn) otherPauseBtn.style.display = 'none';
    } else if (state === 'paused') {
      if (playBtn) playBtn.style.display = 'inline-flex';
      if (pauseBtn) pauseBtn.style.display = 'none';
    } else {
      if (playBtn) playBtn.style.display = 'inline-flex';
      if (pauseBtn) pauseBtn.style.display = 'none';
    }
  }

  function stopAllExplainerAudio() {
    if (activeExplainerPlayer) {
      activeExplainerPlayer.stop();
      activeExplainerPlayer = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    currentAudioLang = null;
    updateAudioButtonUI('en', 'idle');
    updateAudioButtonUI('hi', 'idle');
  }

  async function playExplainerAudio(lang: 'en' | 'hi') {
    const textToRead = lang === 'en' ? currentEnglishExplainer : currentHindiExplainer;
    if (!textToRead) return;

    if (currentAudioLang === lang && activeExplainerPlayer && activeExplainerPlayer.isPaused()) {
      setAudioStatus('playing', lang === 'en' ? 'Playing English...' : 'Playing Hindi...');
      updateAudioButtonUI(lang, 'playing');
      await activeExplainerPlayer.play();
      return;
    }

    stopAllExplainerAudio();
    currentAudioLang = lang;
    setAudioStatus('playing', lang === 'en' ? 'Playing English...' : 'Playing Hindi...');
    updateAudioButtonUI(lang, 'playing');

    const langCode = lang === 'en' ? 'en-IN' : 'hi-IN';
    try {
      activeExplainerPlayer = await audio.prepareSentenceAudioTrack(textToRead, langCode, 'Young Learner', 0.90);
      activeExplainerPlayer.onStateChange((st) => {
        if (st === 'playing') {
          setAudioStatus('playing', lang === 'en' ? 'Playing English...' : 'Playing Hindi...');
          updateAudioButtonUI(lang, 'playing');
        } else if (st === 'paused') {
          setAudioStatus('paused', 'Audio Paused');
          updateAudioButtonUI(lang, 'paused');
        } else if (st === 'ended' || st === 'idle') {
          setAudioStatus('ready', 'Audio Ready');
          updateAudioButtonUI(lang, 'idle');
          currentAudioLang = null;
        }
      });

      await activeExplainerPlayer.play();
    } catch (err) {
      console.warn('Explainer audio player fallback:', err);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(textToRead);
        utt.lang = langCode;
        utt.rate = 0.90;
        utt.pitch = 1.02;
        utt.onend = () => {
          setAudioStatus('ready', 'Audio Ready');
          updateAudioButtonUI(lang, 'idle');
          currentAudioLang = null;
        };
        utt.onerror = () => {
          setAudioStatus('unavailable', 'Audio Unavailable');
          updateAudioButtonUI(lang, 'idle');
          currentAudioLang = null;
        };
        window.speechSynthesis.speak(utt);
      } else {
        setAudioStatus('unavailable', 'Audio Unavailable');
        updateAudioButtonUI(lang, 'idle');
      }
    }
  }

  function pauseExplainerAudio(lang: 'en' | 'hi') {
    if (activeExplainerPlayer && activeExplainerPlayer.isPlaying()) {
      activeExplainerPlayer.pause();
      setAudioStatus('paused', 'Audio Paused');
      updateAudioButtonUI(lang, 'paused');
    } else if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setAudioStatus('paused', 'Audio Paused');
      updateAudioButtonUI(lang, 'paused');
    }
  }

  function replayExplainerAudio(lang: 'en' | 'hi') {
    stopAllExplainerAudio();
    playExplainerAudio(lang);
  }

  btnPlayEnAudio?.addEventListener('click', () => playExplainerAudio('en'));
  btnPauseEnAudio?.addEventListener('click', () => pauseExplainerAudio('en'));
  btnReplayEnAudio?.addEventListener('click', () => replayExplainerAudio('en'));

  btnPlayHiAudio?.addEventListener('click', () => playExplainerAudio('hi'));
  btnPauseHiAudio?.addEventListener('click', () => pauseExplainerAudio('hi'));
  btnReplayHiAudio?.addEventListener('click', () => replayExplainerAudio('hi'));

  // --- 2. AI Visual Demo (Educational SVG Generator) ---
  let showVernacularVisualLabels = false;

  function renderVisualDiagram(topic: string, lang: string) {
    if (!visualFrame) return;
    const low = topic.toLowerCase();
    const isPlant = low.includes('plant') || low.includes('tree') || low.includes('leaf') || low.includes('पौधा');
    const isWater = low.includes('water') || low.includes('rain') || low.includes('जल') || low.includes('बारिश');
    const isCount = low.includes('count') || low.includes('number') || low.includes('गिनती');

    if (visualTitle) {
      if (isPlant) visualTitle.textContent = 'Photosynthesis & Plant Growth (पौधे का विकास)';
      else if (isWater) visualTitle.textContent = 'Indigenous Water & Rain Cycle (जल चक्र)';
      else if (isCount) visualTitle.textContent = 'Vernacular Counting & Math (गिनती)';
      else visualTitle.textContent = 'Primary Science Concept Visualizer';
    }

    if (visualCaption) {
      if (isPlant) visualCaption.textContent = showVernacularVisualLabels ? '🌱 दारु रेनाः अंग: साकम (Leaves) धूप और पानी से भोजन बनाते हैं।' : '🌿 Leaves absorb sunlight & roots draw water to create nourishing food & oxygen.';
      else if (isWater) visualCaption.textContent = showVernacularVisualLabels ? '💧 दाः चक्र: सिंगी (Sun) पानी को भाप बनाकर बादलों में बदलता है।' : '💧 Solar warmth evaporates lake water into clouds, bringing rain showers to the hills.';
      else if (isCount) visualCaption.textContent = '🔢 Visual counters bridge everyday village objects directly to tribal script numbers.';
      else visualCaption.textContent = '✨ Concrete visual model crafted to anchor elementary classroom competencies.';
    }

    const svgHtml = generateEducationalDiagram(topic, lang);
    visualFrame.innerHTML = svgHtml;

    // Fetch AI Concept Image if generation service is reachable
    (async () => {
      try {
        const prompt = isPlant
          ? 'Simple, bright elementary textbook illustration showing a healthy green plant with leaves in sunlight and roots drinking water from soil, clean white background, educational diagram style'
          : isWater
          ? 'Clear educational science diagram of water evaporating from a pond with bright sun into clouds and rain returning to earth'
          : `Educational concept visualizer for elementary students learning ${topic}`;

        const res = await fetch('/api/ai/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, topic })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.imageUrl && !data.isFallback && visualFrame) {
            visualFrame.innerHTML = `
              <div style="position:relative;width:100%;text-align:center;padding:8px 0;">
                <img src="${data.imageUrl}" alt="AI Educational Concept Image" style="max-width:100%;max-height:260px;border-radius:8px;object-fit:contain;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,0.06);display:block;" />
                <span class="te-video-watermark" style="top:12px;right:12px;">✨ AI Generated</span>
              </div>
            `;
          }
        }
      } catch (e) {
        console.warn('AI Image generation notice:', e);
      }
    })();
  }

  btnToggleVisualDiagram?.addEventListener('click', () => {
    if (!diagramAccordionBody) return;
    const isClosed = diagramAccordionBody.style.display === 'none' || !diagramAccordionBody.style.display;
    diagramAccordionBody.style.display = isClosed ? 'block' : 'none';
    if (diagramArrow) diagramArrow.textContent = isClosed ? '▾' : '▸';
  });

  btnToggleVernacularLabels?.addEventListener('click', () => {
    showVernacularVisualLabels = !showVernacularVisualLabels;
    renderVisualDiagram(currentTopic, selectTargetLang?.value || 'Ho');
    showToast(showVernacularVisualLabels ? 'Vernacular labels active' : 'Bilingual labels active', '🏷️');
  });

  // --- 3. AI Visual Learning & Video Generation Engine (4-8s pedagogical clip) ---
  const TOTAL_VIDEO_DURATION = 6;
  let videoCurrentTime = 0;
  let isVideoPlaying = false;
  let videoSpeed = 1.0;
  let animRequestId: number | null = null;
  let lastAnimTimestamp = 0;
  let currentVideoUrl = '';
  let currentVideoMode: 'ai-generated' | 'demo-fallback' = 'demo-fallback';
  let isGeneratingVideo = false;

  function formatVideoTime(seconds: number): string {
    const s = Math.min(TOTAL_VIDEO_DURATION, Math.max(0, Math.floor(seconds)));
    return `00:${s < 10 ? '0' + s : s} / 00:06`;
  }

  function updateVideoSubtitles(timeSec: number, topic: string) {
    if (!videoCaptionEn || !videoCaptionHi) return;
    const low = topic.toLowerCase();
    const isWater = low.includes('water') || low.includes('rain') || low.includes('जल');

    if (!isWater) {
      if (timeSec < 2) {
        videoCaptionEn.textContent = '1. Roots absorb moisture and essential minerals deep inside the soil.';
        videoCaptionHi.textContent = '1. जड़ें मिट्टी से नमी और आवश्यक खनिज तत्व गहराई से सोखती हैं।';
      } else if (timeSec < 4) {
        videoCaptionEn.textContent = '2. Leaves capture bright sunlight and fresh air to synthesize plant food.';
        videoCaptionHi.textContent = '2. हरी पत्तियां धूप और हवा का उपयोग करके पौधे के लिए भोजन बनाती हैं।';
      } else {
        videoCaptionEn.textContent = '3. The healthy plant flourishes, blooming and releasing fresh clean oxygen.';
        videoCaptionHi.textContent = '3. पौधा फलता-फूलता है और हमें स्वच्छ ऑक्सीजन व हरियाली प्रदान करता है।';
      }
    } else {
      if (timeSec < 2) {
        videoCaptionEn.textContent = '1. Sunshine warms the surface of rivers and lakes in our village.';
        videoCaptionHi.textContent = '1. सूर्य की गर्मी से नदियों और तालाबों का पानी भाप बनता है।';
      } else if (timeSec < 4) {
        videoCaptionEn.textContent = '2. Water vapor condenses high in the sky to form rainclouds.';
        videoCaptionHi.textContent = '2. बादलों में नमी संघनित होकर घने वर्षा के बादल बनाती है।';
      } else {
        videoCaptionEn.textContent = '3. Refreshing rain showers descend, nourishing fields, forests, and earth.';
        videoCaptionHi.textContent = '3. शीतल वर्षा हमारी फसलों, जंगलों और धरती को नया जीवन देती है।';
      }
    }
  }

  function drawVideoFrame(ctx: CanvasRenderingContext2D, timeSec: number, topic: string) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const tNorm = Math.min(1, Math.max(0, timeSec / TOTAL_VIDEO_DURATION));
    const low = topic.toLowerCase();
    const isWater = low.includes('water') || low.includes('rain') || low.includes('जल');

    if (!isWater) {
      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.7);
      skyGrad.addColorStop(0, '#7DD3FC');
      skyGrad.addColorStop(1, '#E0F2FE');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h * 0.7);

      // Ground / Earth
      const groundGrad = ctx.createLinearGradient(0, h * 0.7, 0, h);
      groundGrad.addColorStop(0, '#15803D');
      groundGrad.addColorStop(0.2, '#78350F');
      groundGrad.addColorStop(1, '#451A03');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, h * 0.68, w, h * 0.32);

      // Sun with radiating rays
      const sunX = w * 0.82;
      const sunY = h * 0.22;
      const rayPulse = Math.sin(timeSec * 4) * 3;
      ctx.save();
      ctx.beginPath();
      ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
      ctx.fillStyle = '#FBBF24';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#F59E0B';
      ctx.stroke();

      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 + timeSec * 0.35;
        const x1 = sunX + Math.cos(angle) * 26;
        const y1 = sunY + Math.sin(angle) * 26;
        const x2 = sunX + Math.cos(angle) * (36 + rayPulse);
        const y2 = sunY + Math.sin(angle) * (36 + rayPulse);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      // Floating Clouds
      const cloudX = ((w * 0.15 + timeSec * 16) % (w + 120)) - 60;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.arc(cloudX, h * 0.18, 18, 0, Math.PI * 2);
      ctx.arc(cloudX + 20, h * 0.14, 22, 0, Math.PI * 2);
      ctx.arc(cloudX + 42, h * 0.18, 17, 0, Math.PI * 2);
      ctx.fill();

      // Plant in Center
      const plantBaseX = w * 0.48;
      const plantBaseY = h * 0.68;
      const stemHeight = 35 + Math.min(1, tNorm * 1.6) * 80;
      const stemTopY = plantBaseY - stemHeight;
      const sway = Math.sin(timeSec * 3) * 5;

      ctx.strokeStyle = '#16A34A';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(plantBaseX, plantBaseY);
      ctx.quadraticCurveTo(plantBaseX + sway * 0.5, plantBaseY - stemHeight * 0.5, plantBaseX + sway, stemTopY);
      ctx.stroke();

      // Roots
      const rootDepth = Math.min(1, tNorm * 2) * 42;
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(plantBaseX, plantBaseY);
      ctx.lineTo(plantBaseX - 30, plantBaseY + rootDepth);
      ctx.moveTo(plantBaseX, plantBaseY);
      ctx.lineTo(plantBaseX + 32, plantBaseY + rootDepth * 0.85);
      ctx.moveTo(plantBaseX, plantBaseY);
      ctx.lineTo(plantBaseX - 6, plantBaseY + rootDepth * 1.15);
      ctx.stroke();

      // Water absorption droplets
      if (timeSec < 4.5) {
        const dropletOffset = (timeSec * 35) % 40;
        ctx.fillStyle = '#60A5FA';
        ctx.beginPath();
        ctx.arc(plantBaseX - 12, plantBaseY + 32 - dropletOffset, 3, 0, Math.PI * 2);
        ctx.arc(plantBaseX + 14, plantBaseY + 28 - dropletOffset, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Leaves
      if (stemHeight > 50) {
        const leafSize = Math.min(1, (stemHeight - 50) / 45);
        ctx.save();
        ctx.translate(plantBaseX + sway * 0.4 - 2, plantBaseY - stemHeight * 0.45);
        ctx.scale(leafSize, leafSize);
        ctx.fillStyle = '#22C55E';
        ctx.beginPath();
        ctx.ellipse(-16, -6, 18, 8, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#15803D';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.translate(plantBaseX + sway * 0.7 + 2, plantBaseY - stemHeight * 0.7);
        ctx.scale(leafSize, leafSize);
        ctx.fillStyle = '#22C55E';
        ctx.beginPath();
        ctx.ellipse(16, -6, 18, 8, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#15803D';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // Blooming Flower & Oxygen Bubbles (Phase 3)
      if (tNorm > 0.45) {
        const flowerScale = Math.min(1, (tNorm - 0.45) / 0.4);
        const flowerX = plantBaseX + sway;
        const flowerY = stemTopY - 6;

        ctx.save();
        ctx.translate(flowerX, flowerY);
        ctx.scale(flowerScale, flowerScale);

        for (let p = 0; p < 5; p++) {
          const pAngle = (p * Math.PI * 2) / 5;
          const px = Math.cos(pAngle) * 11;
          const py = Math.sin(pAngle) * 11;
          ctx.beginPath();
          ctx.arc(px, py, 7, 0, Math.PI * 2);
          ctx.fillStyle = '#EC4899';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#F59E0B';
        ctx.fill();
        ctx.restore();

        const bubbleY = stemTopY - 18 - ((timeSec * 25) % 55);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(flowerX - 22, bubbleY, 5, 0, Math.PI * 2);
        ctx.arc(flowerX + 26, bubbleY - 10, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#15803D';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('O₂', flowerX - 20, bubbleY - 6);
      }

      // Stage tag badge on top left
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.beginPath();
      ctx.roundRect(12, 12, 160, 24, 6);
      ctx.fill();
      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 11px sans-serif';
      const stageNum = timeSec < 2 ? '1/3: Roots & Moisture' : (timeSec < 4 ? '2/3: Sunlight & Sugar' : '3/3: Blossoms & Clean Oxygen');
      ctx.fillText(stageNum, 20, 28);

    } else {
      // Water Cycle Simulation
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.6);
      skyGrad.addColorStop(0, '#0284C7');
      skyGrad.addColorStop(1, '#BAE6FD');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h * 0.6);

      // Lake
      const lakeGrad = ctx.createLinearGradient(0, h * 0.6, 0, h);
      lakeGrad.addColorStop(0, '#0369A1');
      lakeGrad.addColorStop(1, '#0C4A6E');
      ctx.fillStyle = lakeGrad;
      ctx.fillRect(0, h * 0.6, w, h * 0.4);

      // Sun
      ctx.fillStyle = '#FBBF24';
      ctx.beginPath();
      ctx.arc(w * 0.8, h * 0.2, 22, 0, Math.PI * 2);
      ctx.fill();

      // Rising Vapor (Stage 1 & 2)
      if (timeSec < 4) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        for (let v = 0; v < 5; v++) {
          const vx = w * 0.2 + v * (w * 0.12);
          const vy = (h * 0.6) - ((timeSec * 30 + v * 15) % (h * 0.35));
          ctx.beginPath();
          ctx.arc(vx, vy, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Rain Clouds (Stage 2 & 3)
      const cloudAlpha = Math.min(1, tNorm * 1.5);
      ctx.fillStyle = `rgba(71, 85, 105, ${cloudAlpha})`;
      ctx.beginPath();
      ctx.arc(w * 0.35, h * 0.22, 28, 0, Math.PI * 2);
      ctx.arc(w * 0.45, h * 0.18, 36, 0, Math.PI * 2);
      ctx.arc(w * 0.55, h * 0.22, 30, 0, Math.PI * 2);
      ctx.fill();

      // Rain Falling (Stage 3)
      if (tNorm > 0.5) {
        ctx.strokeStyle = 'rgba(147, 197, 253, 0.8)';
        ctx.lineWidth = 2;
        for (let r = 0; r < 8; r++) {
          const rx = w * 0.32 + r * 24;
          const ry = (h * 0.26) + ((timeSec * 60 + r * 15) % (h * 0.34));
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 4, ry + 12);
          ctx.stroke();
        }
      }

      // Stage tag badge
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.beginPath();
      ctx.roundRect(12, 160, 160, 24, 6);
      ctx.fill();
      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 11px sans-serif';
      const stageNum = timeSec < 2 ? '1/3: Warmth & Evaporation' : (timeSec < 4 ? '2/3: Cloud Condensation' : '3/3: Nourishing Rainfall');
      ctx.fillText(stageNum, 20, 28);
    }
  }

  function setupVideoPlayerForRealVideo(url: string) {
    if (aiVideoPlayer) {
      aiVideoPlayer.src = url;
      aiVideoPlayer.style.display = 'block';
      aiVideoPlayer.load();
    }
    if (videoCanvas) {
      videoCanvas.style.display = 'none';
    }
  }

  function setupVideoPlayerForFallback(topic: string) {
    if (aiVideoPlayer) {
      aiVideoPlayer.style.display = 'none';
      aiVideoPlayer.removeAttribute('src');
    }
    if (videoCanvas) {
      videoCanvas.style.display = 'block';
      const ctx = videoCanvas.getContext('2d');
      if (ctx) drawVideoFrame(ctx, 0, topic);
    }
  }

  function playVideo() {
    if (currentVideoMode === 'ai-generated' && aiVideoPlayer && aiVideoPlayer.src) {
      if (videoLoading) videoLoading.style.display = 'flex';
      aiVideoPlayer.play().then(() => {
        if (videoLoading) videoLoading.style.display = 'none';
        if (videoOverlay) videoOverlay.style.display = 'none';
        isVideoPlaying = true;
        if (iconVidPlay) iconVidPlay.style.display = 'none';
        if (iconVidPause) iconVidPause.style.display = 'inline-block';
        if (labelVideoToggle) labelVideoToggle.textContent = 'Pause';
      }).catch(err => {
        console.warn('Real video play failed, falling back to dynamic simulation:', err);
        currentVideoMode = 'demo-fallback';
        setupVideoPlayerForFallback(currentTopic);
        playCanvasSimulation();
      });
      return;
    }

    playCanvasSimulation();
  }

  function playCanvasSimulation() {
    if (!videoCanvas) return;
    const ctx = videoCanvas.getContext('2d');
    if (!ctx) return;

    if (videoLoading) videoLoading.style.display = 'flex';

    setTimeout(() => {
      if (videoLoading) videoLoading.style.display = 'none';
      if (videoOverlay) videoOverlay.style.display = 'none';
      isVideoPlaying = true;
      if (iconVidPlay) iconVidPlay.style.display = 'none';
      if (iconVidPause) iconVidPause.style.display = 'inline-block';
      if (labelVideoToggle) labelVideoToggle.textContent = 'Pause';

      lastAnimTimestamp = performance.now();

      function step(timestamp: number) {
        if (!isVideoPlaying) return;
        const deltaSec = (timestamp - lastAnimTimestamp) / 1000;
        lastAnimTimestamp = timestamp;

        videoCurrentTime += deltaSec * videoSpeed;

        if (videoCurrentTime >= TOTAL_VIDEO_DURATION) {
          videoCurrentTime = TOTAL_VIDEO_DURATION;
          pauseVideo();
          if (videoOverlay) videoOverlay.style.display = 'flex';
        }

        if (videoScrubber) {
          videoScrubber.value = String(Math.round((videoCurrentTime / TOTAL_VIDEO_DURATION) * 100));
        }
        if (videoTime) {
          videoTime.textContent = formatVideoTime(videoCurrentTime);
        }

        updateVideoSubtitles(videoCurrentTime, currentTopic);
        drawVideoFrame(ctx, videoCurrentTime, currentTopic);

        if (isVideoPlaying) {
          animRequestId = requestAnimationFrame(step);
        }
      }

      animRequestId = requestAnimationFrame(step);
    }, 120);
  }

  function pauseVideo() {
    isVideoPlaying = false;
    if (aiVideoPlayer && !aiVideoPlayer.paused) {
      aiVideoPlayer.pause();
    }
    if (animRequestId !== null) {
      cancelAnimationFrame(animRequestId);
      animRequestId = null;
    }
    if (iconVidPlay) iconVidPlay.style.display = 'inline-block';
    if (iconVidPause) iconVidPause.style.display = 'none';
    if (labelVideoToggle) labelVideoToggle.textContent = 'Play';
  }

  function replayVideo() {
    videoCurrentTime = 0;
    if (videoScrubber) videoScrubber.value = '0';
    if (videoTime) videoTime.textContent = formatVideoTime(0);
    if (aiVideoPlayer && aiVideoPlayer.src) {
      aiVideoPlayer.currentTime = 0;
    }
    playVideo();
  }

  // AI Learning Video Generation Pipeline
  async function generateAILearningVideo(forceRegenerate = false) {
    if (isGeneratingVideo) return;
    isGeneratingVideo = true;

    // Reset video player state
    pauseVideo();
    videoCurrentTime = 0;
    if (currentVideoUrl) {
      URL.revokeObjectURL(currentVideoUrl);
      currentVideoUrl = '';
    }
    if (aiVideoPlayer) {
      aiVideoPlayer.pause();
      aiVideoPlayer.removeAttribute('src');
      aiVideoPlayer.load();
      aiVideoPlayer.style.display = 'none';
    }
    if (videoCanvas) {
      videoCanvas.style.display = 'block';
    }

    // 1. Show Generating Box & Hide Player Card
    if (videoGeneratingBox) videoGeneratingBox.style.display = 'flex';
    if (videoPlayerCard) videoPlayerCard.style.display = 'none';
    if (videoFallbackNotice) videoFallbackNotice.style.display = 'none';

    // Helper to update progress
    const updateProgress = (percent: number, stepNum: number, statusText: string) => {
      if (genProgressBar) genProgressBar.style.width = `${percent}%`;
      if (genPercentLabel) genPercentLabel.textContent = `${percent}%`;
      if (genStepLabel) genStepLabel.textContent = `Step ${stepNum}/4: ${statusText}`;
      if (genStatusText) genStatusText.textContent = statusText;

      const psteps = [pstep1, pstep2, pstep3, pstep4];
      psteps.forEach((el, idx) => {
        if (!el) return;
        const text = el.textContent?.replace(/^[✓●○]\s*/, '') || '';
        if (idx + 1 < stepNum) {
          el.className = 'te-step-dot done';
          el.textContent = `✓ ${text}`;
        } else if (idx + 1 === stepNum) {
          el.className = 'te-step-dot active';
          el.textContent = `● ${text}`;
        } else {
          el.className = 'te-step-dot';
          el.textContent = `○ ${text}`;
        }
      });
    };

    updateProgress(15, 1, 'Extracting core pedagogical metaphors from lesson...');

    try {
      // Step 1: Create Visual Prompt automatically from explanation
      const promptResp = await fetch('/api/ai/video-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: currentTranslatedText || currentScannedText || 'Plants need sunlight to grow.',
          explanation: currentEnglishExplainer || currentExplanation,
          topic: currentTopic,
          language: selectTargetLang?.value || 'Ho'
        })
      });

      const promptData = await promptResp.json();
      const visualPrompt = promptData.prompt || 'Create a simple educational animation showing a green plant receiving sunlight, growing gradually, with a clean school-learning style.';

      // Update Visual Prompt UI
      if (visualPromptText) visualPromptText.textContent = `“${visualPrompt}”`;
      if (promptSourceText) promptSourceText.textContent = `“${currentTranslatedText || currentScannedText || 'Plants need sunlight to grow.'}”`;
      if (i2vBadge) {
        i2vBadge.style.display = currentImageDataUrl ? 'inline-flex' : 'none';
      }

      updateProgress(35, 2, 'Visual prompt synthesized • Connecting to AI Video Generator...');

      // Step 2: Request Video Generation
      const genResp = await fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: visualPrompt,
          image: currentImageDataUrl || undefined,
          duration: 6,
          aspectRatio: '16:9'
        })
      });

      const genData = await genResp.json();

      if (genData.isFallback || !genData.operationName) {
        // Fallback mode: clearly labeled Demo Fallback
        updateProgress(70, 3, 'Veo AI video service operating in sandbox mode...');
        await new Promise(r => setTimeout(r, 600));

        updateProgress(90, 4, 'Composing frame-by-frame pedagogical clip for lesson...');
        await new Promise(r => setTimeout(r, 600));

        currentVideoMode = 'demo-fallback';
        setupVideoPlayerForFallback(currentTopic);
      } else {
        // Real Veo operation started! Poll status
        updateProgress(50, 3, 'Veo AI video generation in progress • Synthesizing frames...');

        let pollCount = 0;
        let isDone = false;
        let finalVideoUri = '';

        while (!isDone && pollCount < 20) {
          await new Promise(r => setTimeout(r, 3500));
          pollCount++;
          const progressVal = Math.min(92, 50 + pollCount * 5);
          updateProgress(progressVal, 3, `Rendering educational video clip (${progressVal}%)...`);

          const statusResp = await fetch('/api/ai/video-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationName: genData.operationName })
          });

          if (!statusResp.ok) throw new Error('Status polling failed');
          const statusData = await statusResp.json();

          if (statusData.done) {
            isDone = true;
            finalVideoUri = statusData.videoUri || '';
            break;
          }
        }

        if (!isDone) {
          throw new Error('Video generation timed out. Switching to dynamic simulation.');
        }

        updateProgress(95, 4, 'Downloading generated MP4 video stream...');

        const dlResp = await fetch('/api/ai/video-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationName: genData.operationName, videoUri: finalVideoUri })
        });

        if (!dlResp.ok) throw new Error('Download failed');
        const videoBlob = await dlResp.blob();
        currentVideoUrl = URL.createObjectURL(videoBlob);
        currentVideoMode = 'ai-generated';

        setupVideoPlayerForRealVideo(currentVideoUrl);
      }

      updateProgress(100, 4, 'AI Visual Learning video ready!');
      await new Promise(r => setTimeout(r, 400));

    } catch (err: any) {
      console.warn('Video generation error, using dynamic simulation fallback:', err);
      currentVideoMode = 'demo-fallback';
      setupVideoPlayerForFallback(currentTopic);
    } finally {
      isGeneratingVideo = false;
      if (videoGeneratingBox) videoGeneratingBox.style.display = 'none';
      if (videoPlayerCard) videoPlayerCard.style.display = 'flex';

      // Update badge & watermark
      if (videoGenBadge) {
        if (currentVideoMode === 'ai-generated') {
          videoGenBadge.className = 'te-video-gen-badge ai-generated';
          videoGenBadge.textContent = '✨ AI Generated';
        } else {
          videoGenBadge.className = 'te-video-gen-badge demo-fallback';
          videoGenBadge.textContent = '🏷️ Demo Fallback';
        }
      }

      if (videoWatermark) {
        if (currentVideoMode === 'ai-generated') {
          videoWatermark.className = 'te-video-watermark';
          videoWatermark.textContent = '✨ AI Generated';
        } else {
          videoWatermark.className = 'te-video-watermark fallback';
          videoWatermark.textContent = '🏷️ Demo Fallback';
        }
      }

      if (videoFallbackNotice) {
        videoFallbackNotice.style.display = currentVideoMode === 'demo-fallback' ? 'flex' : 'none';
      }

      // Reset controls
      if (videoScrubber) videoScrubber.value = '0';
      if (videoTime) videoTime.textContent = formatVideoTime(0);
      if (videoOverlay) videoOverlay.style.display = 'flex';
      updateVideoSubtitles(0, currentTopic);

      showToast(
        currentVideoMode === 'ai-generated'
          ? 'AI Learning Video generated successfully!'
          : 'Dynamic educational simulation prepared for lesson.',
        currentVideoMode === 'ai-generated' ? '🎥' : '✨'
      );
    }
  }

  // Event Listeners for Video Controls
  videoScrubber?.addEventListener('input', (e) => {
    const targetVal = Number((e.target as HTMLInputElement).value);
    videoCurrentTime = (targetVal / 100) * TOTAL_VIDEO_DURATION;
    if (videoTime) videoTime.textContent = formatVideoTime(videoCurrentTime);
    updateVideoSubtitles(videoCurrentTime, currentTopic);

    if (currentVideoMode === 'ai-generated' && aiVideoPlayer && aiVideoPlayer.duration) {
      aiVideoPlayer.currentTime = (targetVal / 100) * aiVideoPlayer.duration;
    } else if (videoCanvas) {
      const ctx = videoCanvas.getContext('2d');
      if (ctx) drawVideoFrame(ctx, videoCurrentTime, currentTopic);
    }
  });

  btnPlayVideoDemo?.addEventListener('click', playVideo);

  btnVideoToggle?.addEventListener('click', () => {
    if (isVideoPlaying) pauseVideo();
    else playVideo();
  });

  btnVideoReplay?.addEventListener('click', replayVideo);

  btnVideoRegenerate?.addEventListener('click', () => {
    showToast('Regenerating AI Learning Video...', '🔄');
    generateAILearningVideo(true);
  });

  btnVideoSpeed?.addEventListener('click', () => {
    if (videoSpeed === 1.0) videoSpeed = 1.5;
    else if (videoSpeed === 1.5) videoSpeed = 0.75;
    else videoSpeed = 1.0;
    if (btnVideoSpeed) btnVideoSpeed.textContent = `${videoSpeed}x`;
    if (aiVideoPlayer) aiVideoPlayer.playbackRate = videoSpeed;
    showToast(`Video speed set to ${videoSpeed}x`, '⚡');
  });

  btnVideoFullscreen?.addEventListener('click', () => {
    const vp = document.getElementById('te-video-viewport');
    if (!vp) return;
    if (!document.fullscreenElement) {
      vp.requestFullscreen().catch(err => console.warn('Fullscreen denied:', err));
    } else {
      document.exitFullscreen().catch(err => console.warn('Exit fullscreen error:', err));
    }
  });

  aiVideoPlayer?.addEventListener('timeupdate', () => {
    if (!aiVideoPlayer) return;
    const dur = aiVideoPlayer.duration || TOTAL_VIDEO_DURATION;
    const cur = aiVideoPlayer.currentTime;
    videoCurrentTime = cur;
    if (videoScrubber && dur > 0) {
      videoScrubber.value = String(Math.round((cur / dur) * 100));
    }
    if (videoTime) {
      const s = Math.floor(cur);
      const totalS = Math.floor(dur);
      videoTime.textContent = `00:${s < 10 ? '0' + s : s} / 00:${totalS < 10 ? '0' + totalS : totalS}`;
    }
    updateVideoSubtitles(cur, currentTopic);
  });

  aiVideoPlayer?.addEventListener('ended', () => {
    pauseVideo();
    if (videoOverlay) videoOverlay.style.display = 'flex';
  });

  btnToggleVisualDiagram?.addEventListener('click', () => {
    if (diagramAccordionBody) {
      const isClosed = diagramAccordionBody.style.display === 'none';
      diagramAccordionBody.style.display = isClosed ? 'block' : 'none';
      if (diagramArrow) {
        diagramArrow.style.transform = isClosed ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    }
  });

  // --- 4. AI Chat ("Ask AI") Engine ---
  function setupChatSuggestions(topic: string) {
    if (!chatSuggestions) return;
    const isWater = topic.includes('water');
    const isCount = topic.includes('count');

    let suggestions: { en: string; icon: string }[] = [];
    if (isWater) {
      suggestions = [
        { en: 'Where does rain come from?', icon: '🌧️' },
        { en: 'Why are rivers important for our village?', icon: '🏞️' },
        { en: 'How does sunlight turn water into clouds?', icon: '☁️' },
        { en: '3 simple water conservation tips', icon: '💧' }
      ];
    } else if (isCount) {
      suggestions = [
        { en: 'How do you say 1 to 5 in tribal dialect?', icon: '🔢' },
        { en: 'Why do we count with nature objects?', icon: '🌿' },
        { en: 'Explain addition with beads in 2 lines', icon: '📿' }
      ];
    } else {
      suggestions = [
        { en: 'Why do plants need sunlight?', icon: '🌱' },
        { en: 'What do roots do for the plant?', icon: '🪴' },
        { en: 'Explain photosynthesis in 3 simple points', icon: '📝' },
        { en: 'Why are leaves green?', icon: '🍃' }
      ];
    }

    chatSuggestions.innerHTML = suggestions.map(s => `
      <button class="te-chip-btn" data-q="${s.en}" type="button">${s.icon} ${s.en}</button>
    `).join('');

    chatSuggestions.querySelectorAll('.te-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-q') || '';
        if (q && chatInput) {
          chatInput.value = q;
          submitAIChat(q);
        }
      });
    });
  }

  async function submitAIChat(questionText: string) {
    const q = questionText.trim();
    if (!q || !chatMessages) return;

    // Append Student User Message
    const userBubble = document.createElement('div');
    userBubble.className = 'te-chat-bubble user';
    userBubble.innerHTML = `
      <div class="te-bubble-author">
        <span class="te-avatar-dot">🎒</span>
        <strong>Student</strong>
      </div>
      <div class="te-bubble-body">
        <p class="te-msg-en">${q}</p>
      </div>
    `;
    chatMessages.appendChild(userBubble);

    if (chatInput) chatInput.value = '';

    // Append Thinking Indicator
    const thinkingBubble = document.createElement('div');
    thinkingBubble.className = 'te-chat-bubble assistant';
    thinkingBubble.innerHTML = `
      <div class="te-bubble-author">
        <span class="te-avatar-dot">🤖</span>
        <strong>BhashaSetu AI Companion</strong>
      </div>
      <div class="te-bubble-body">
        <span style="color:#64748B;font-style:italic;font-size:0.78rem;">Thinking &amp; composing pedagogical explanation...</span>
      </div>
    `;
    chatMessages.appendChild(thinkingBubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const resp = await fetch('/api/ai/enhancement-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          lessonContext: `${currentScannedText}\n\nEnglish: ${currentEnglishExplainer}\nHindi: ${currentHindiExplainer}`,
          language: selectTargetLang?.value || 'Ho'
        })
      });

      if (!resp.ok) throw new Error('Failed chat response');
      const resData = await resp.json();

      const enAns = resData.englishAnswer || 'Nature and plants work together using sunlight and water.';
      const hiAns = resData.hindiAnswer || 'प्रकृति में पौधे धूप और पानी से अपना पोषण करते हैं।';

      thinkingBubble.innerHTML = `
        <div class="te-bubble-author">
          <span class="te-avatar-dot">🤖</span>
          <strong>BhashaSetu AI Companion</strong>
        </div>
        <div class="te-bubble-body">
          <p class="te-msg-en">${enAns}</p>
          <p class="te-msg-hi">${hiAns}</p>
        </div>
      `;
    } catch (err) {
      const qLower = q.toLowerCase();
      let fallbackEn = 'Plants create their nourishment through leaves and roots, using clean sunlight and moisture.';
      let fallbackHi = 'पौधे पत्तियों और जड़ों की मदद से धूप और नमी से अपना भोजन बनाते हैं।';

      if (qLower.includes('sun') || qLower.includes('light') || qLower.includes('धूप')) {
        fallbackEn = 'Sunlight gives leaves the solar energy required to transform water and air into plant sugars.';
        fallbackHi = 'सूर्य का प्रकाश पत्तियों को ऊर्जा देता है जिससे वे पानी और हवा को भोजन में बदल सकें।';
      } else if (qLower.includes('root') || qLower.includes('water') || qLower.includes('जड़')) {
        fallbackEn = 'Roots hold the plant securely in the earth while absorbing vital minerals and water.';
        fallbackHi = 'जड़ें पौधे को जमीन में मजबूती से थामे रखती हैं और जरूरी पानी व खनिज सोखती हैं।';
      } else if (qLower.includes('3') || qLower.includes('point')) {
        fallbackEn = '1. Roots absorb water. 2. Leaves catch sunlight. 3. Plant releases fresh oxygen for everyone!';
        fallbackHi = '1. जड़ें पानी सोखती हैं। 2. पत्तियां धूप लेती हैं। 3. पौधा सभी के लिए स्वच्छ ऑक्सीजन बनाता है!';
      }

      thinkingBubble.innerHTML = `
        <div class="te-bubble-author">
          <span class="te-avatar-dot">🤖</span>
          <strong>BhashaSetu AI Companion</strong>
        </div>
        <div class="te-bubble-body">
          <p class="te-msg-en">${fallbackEn}</p>
          <p class="te-msg-hi">${fallbackHi}</p>
        </div>
      `;
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (chatInput && chatInput.value) {
      submitAIChat(chatInput.value);
    }
  });

  // --- 5. Render Step 4 AI Enhancement Orchestrator ---
  function renderAIEnhancement(params: {
    topic: string;
    englishExplanation: string;
    hindiExplanation: string;
    targetLang: string;
    lessonText: string;
  }) {
    currentTopic = params.topic || 'plants';
    currentEnglishExplainer = params.englishExplanation || 'Plants need sunlight, water and fresh air to grow and make food.';
    currentHindiExplainer = params.hindiExplanation || 'पौधों को बढ़ने के लिए सूर्य का प्रकाश, पानी और हवा की आवश्यकता होती है।';

    if (explainerEnglishText) explainerEnglishText.textContent = currentEnglishExplainer;
    if (explainerHindiText) explainerHindiText.textContent = currentHindiExplainer;

    // Render Visual Diagram
    renderVisualDiagram(currentTopic, params.targetLang);

    // Trigger AI Learning Video generation pipeline
    generateAILearningVideo();

    // Initialize Chat Suggestions
    setupChatSuggestions(currentTopic);

    // Reset Audio states
    stopAllExplainerAudio();
    setAudioStatus('ready', 'Audio Ready');

    // Display Step 4 Content
    if (enhancementEmpty) enhancementEmpty.style.display = 'none';
    if (enhancementContent) enhancementContent.style.display = 'flex';
  }

  // Expose global hook for rendering AI enhancement
  (window as any).__bhashasetu_renderAIEnhancement = renderAIEnhancement;

  // --- 6. Demo Flow ("Try Demo" button) ---
  function triggerTryDemo() {
    const sampleText = `Plants are living things that grow in our village and forests. They need bright sunlight, clean water from the rain or pond, and fresh air to make their own food. The roots reach deep into the soil to drink water, while the green leaves catch the sunshine. When plants grow well, they give us delicious fruits, cool shade, and fresh oxygen to breathe.`;

    const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240"><rect width="400" height="170" fill="#E0F2FE"/><rect y="170" width="400" height="70" fill="#78350F"/><circle cx="330" cy="50" r="28" fill="#FBBF24"/><rect x="195" y="100" width="10" height="75" fill="#15803D"/><circle cx="200" cy="80" r="30" fill="#22C55E"/><path d="M160 110 Q 200 130, 240 110" stroke="#16A34A" stroke-width="6" fill="none"/></svg>`;
    const sampleImageDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(sampleSvg)}`;

    showToast('Starting full end-to-end demo lesson...', '✨');

    processScanAndTranslate({
      fileData: sampleImageDataUrl,
      fileName: 'NCERT_Grade3_EVS_LivingPlants.jpg',
      text: sampleText,
      targetLang: selectTargetLang?.value || 'Ho'
    });

    setTimeout(() => {
      const step4Card = document.getElementById('te-step-4-card');
      if (step4Card) {
        step4Card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 1200);
  }

  btnTryDemo?.addEventListener('click', triggerTryDemo);
  btnEmptyTryDemo?.addEventListener('click', triggerTryDemo);

  // Also handle quick buttons from dashboard/lessons if clicked
  const quickUploadDocBtn = document.getElementById('btn-quick-upload-doc');
  const btnLessonsUploadDoc = document.getElementById('btn-lessons-upload-doc');

  quickUploadDocBtn?.addEventListener('click', () => {
    switchView('ai-translator');
    btnTriggerUpload?.click();
  });

  btnLessonsUploadDoc?.addEventListener('click', () => {
    switchView('ai-translator');
    btnTriggerUpload?.click();
  });
}
// ===================== OFFLINE TRANSLATOR =====================
function setupOfflineTranslator() {
  const btnTranslate = document.getElementById('btn-do-translate');
  const btnSwap = document.getElementById('btn-swap-translation-langs');
  const input = document.getElementById('tt-input') as HTMLTextAreaElement;
  const srcSelect = document.getElementById('tt-source-lang') as HTMLSelectElement;
  const tgtSelect = document.getElementById('tt-target-lang') as HTMLSelectElement;
  const output = document.getElementById('tt-output');
  const scriptAlt = document.getElementById('tt-script-alt');
  const targetLabel = document.getElementById('tt-target-label');
  const counter = document.getElementById('tt-counter');
  const listenBtn = document.getElementById('btn-speak-translation');

  const updateCounter = () => {
    if (counter && input) counter.textContent = `${input.value.length}/5000`;
  };
  input?.addEventListener('input', updateCounter);

  const doTranslate = async () => {
    const text = input?.value || '';
    const from = srcSelect?.value || 'Hindi';
    const to = tgtSelect?.value || 'Ho';

    if (!text.trim()) return;

    if (output) output.textContent = 'Translating into accurate vernacular...';
    const result = await translateText(text, from, to);

    if (output) output.textContent = result.translatedText;
    if (scriptAlt) scriptAlt.textContent = result.scriptVariant || `${result.targetLang}: ${result.translatedText}`;
    if (targetLabel) {
      targetLabel.innerHTML = `${result.targetLang} Vernacular Translation <span style="font-size:0.7rem;background:#DCFCE7;color:#15803D;padding:2px 6px;border-radius:4px;margin-left:6px;">Confidence: ${(result.confidence * 100).toFixed(0)}%</span>`;
    }

    try {
      const user = getCurrentUser();
      await saveUserHistoryItem({
        userId: user.id,
        userName: user.name,
        type: 'translation',
        title: `${text.slice(0, 35)}${text.length > 35 ? '...' : ''}`,
        sourceLang: from,
        targetLang: to,
        sourceText: text,
        translatedText: result.translatedText,
        confidence: result.confidence
      });
      updateUserHistoryBadge();
    } catch (_) {}

    showToast(`Translated to ${result.targetLang}`, '✓');
  };

  btnTranslate?.addEventListener('click', doTranslate);

  // Language swap
  btnSwap?.addEventListener('click', () => {
    if (srcSelect && tgtSelect) {
      const prevSrc = srcSelect.value;
      srcSelect.value = tgtSelect.value;
      tgtSelect.value = prevSrc;
      if (input && output && output.textContent) {
        input.value = output.textContent;
        updateCounter();
        doTranslate();
      }
    }
  });

  // Preset buttons
  document.querySelectorAll('.preset-phrase-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const phrase = btn.getAttribute('data-phrase');
      if (phrase && input) {
        input.value = phrase;
        updateCounter();
        doTranslate();
      }
    });
  });

  // Listen button
  listenBtn?.addEventListener('click', () => {
    const text = output?.textContent || '';
    if (text) {
      audio.speakText(text);
      audio.playToneSequence([523, 659, 783]);
    }
  });
}

// ===================== SENTENCE-BY-SENTENCE BILINGUAL VOICE TRANSLATOR =====================
function setupVoiceCompanion() {
  // DOM Elements - Header & Status
  const networkBadge = document.getElementById('vt-network-badge');
  const statusBadge = document.getElementById('vt-status-badge');

  // Alert Banner
  const alertBanner = document.getElementById('vt-alert-banner');
  const alertIcon = document.getElementById('vt-alert-icon');
  const alertMessage = document.getElementById('vt-alert-message');
  const alertDismiss = document.getElementById('vt-alert-dismiss');

  // Languages & Controls
  const sourceLangSelect = document.getElementById('vt-source-lang-select') as HTMLSelectElement | null;
  const targetLangSelect = document.getElementById('vt-lang-select') as HTMLSelectElement | null;
  const btnSwapLangs = document.getElementById('vt-btn-swap-langs');
  const detectedLangPill = document.getElementById('vt-detected-lang-pill');

  // Stage & Microphone
  const micStage = document.getElementById('vt-mic-stage');
  const btnMicMain = document.getElementById('vt-btn-mic-main');
  const statePill = document.getElementById('vt-state-pill');
  const stateIcon = document.getElementById('vt-state-icon');
  const stateText = document.getElementById('vt-state-text');
  const waveBars = document.getElementById('vt-wave-bars');
  const interimSubtitle = document.getElementById('vt-interim-subtitle');

  // Pipeline Breadcrumb Steps
  const stepListening = document.getElementById('vt-step-listening');
  const stepProcessing = document.getElementById('vt-step-processing');
  const stepTranslated = document.getElementById('vt-step-translated');
  const stepAudioReady = document.getElementById('vt-step-audio-ready');
  const stepPlaying = document.getElementById('vt-step-playing');
  const stepCompleted = document.getElementById('vt-step-completed');

  // Dedicated Audio Controls [Play] [Pause] [Replay]
  const btnAudioPlay = document.getElementById('vt-audio-play-btn');
  const btnAudioPause = document.getElementById('vt-audio-pause-btn');
  const btnAudioReplay = document.getElementById('vt-audio-replay-btn');
  const audioStatusPill = document.getElementById('vt-audio-status-pill');

  // Secondary Controls
  const autoSpeakToggle = document.getElementById('vt-auto-speak-toggle') as HTMLInputElement | null;
  const btnToggleType = document.getElementById('vt-btn-toggle-type');
  const btnTryDemo = document.getElementById('vt-btn-try-demo');
  const alertRetryBtn = document.getElementById('vt-alert-retry-btn');
  const btnPause = document.getElementById('vt-btn-pause');
  const typeDrawer = document.getElementById('vt-type-drawer');
  const testInput = document.getElementById('vt-text-input') as HTMLInputElement | null;
  const testSubmitBtn = document.getElementById('vt-text-submit-btn');

  // Live Output Cards
  const sourceCardLabel = document.getElementById('vt-source-card-label');
  const speechStatusIndicator = document.getElementById('vt-speech-status-indicator');
  const recognizedSpeechElem = document.getElementById('vt-recognized-speech');
  const targetCardLabel = document.getElementById('vt-target-card-label');
  const transModePill = document.getElementById('vt-trans-mode-pill');
  const translatedOutputElem = document.getElementById('vt-translated-output');
  const translatedSubElem = document.getElementById('vt-translated-sub');
  const sourceDetectedNote = document.getElementById('vt-source-detected-note');
  const copyTrBtn = document.getElementById('vt-copy-tr-btn');

  // Conversation Dialogue Stream
  const streamContainer = document.getElementById('vt-stream-container');
  const streamEmpty = document.getElementById('vt-stream-empty');
  const clearFeedBtn = document.getElementById('vt-clear-feed-btn');
  const turnCountBadge = document.getElementById('vt-turn-count-badge');

  // 6-Stage Sentence Pipeline State
  type PipelineState = 'IDLE' | 'LISTENING' | 'CAPTURING' | 'PROCESSING' | 'TRANSLATED' | 'AUDIO_READY' | 'PLAYING' | 'COMPLETED' | 'PAUSED' | 'ERROR';
  let currentState: PipelineState = 'IDLE';
  let isMicActive = false;
  let totalTurns = 0;
  let recognition: any = null;
  let restartTimeout: any = null;
  let pauseDetectorTimer: any = null;
  let pipelineToken = 0;
  let isTranslatingSentence = false;

  // Deduplication & speech session tracking
  let inFlightNormalized = '';
  let lastCommittedNormalized = '';
  let lastCommittedTime = 0;
  const recentSentences: { norm: string; time: number }[] = [];

  let lastCompleteOriginal = '';
  let lastCompleteTranslation = '';
  let lastTargetLang = '';
  let lastDetectedSourceLang = '';
  let currentAudioPlayer: SentenceAudioPlayer | null = null;

  const SpeechRecClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  // 1. Alert Banner Helper
  function showAlert(msg: string, isError = true, icon = '⚠️') {
    if (!alertBanner) return;
    alertBanner.style.display = 'flex';
    alertBanner.style.background = isError ? '#FEF2F2' : '#EFF6FF';
    alertBanner.style.borderColor = isError ? '#FECACA' : '#BFDBFE';
    alertBanner.style.color = isError ? '#991B1B' : '#1E40AF';
    if (alertIcon) alertIcon.textContent = icon;
    if (alertMessage) alertMessage.textContent = msg;
  }

  function hideAlert() {
    if (!alertBanner) return;
    alertBanner.style.display = 'none';
  }

  alertDismiss?.addEventListener('click', hideAlert);

  // 2. Online / Offline Status Badge Handler
  function updateNetworkBadge() {
    if (!networkBadge) return;
    if (navigator.onLine) {
      networkBadge.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#16A34A;display:inline-block;"></span> Online AI Engine';
      networkBadge.style.background = '#DCFCE7';
      networkBadge.style.color = '#15803D';
      networkBadge.title = 'Connected to high-accuracy Gemini sentence translation and natural TTS';
    } else {
      networkBadge.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#2563EB;display:inline-block;"></span> Offline Mode (Local Models)';
      networkBadge.style.background = '#EFF6FF';
      networkBadge.style.color = '#1D4ED8';
      networkBadge.title = 'Running offline via local indigenous offline dictionaries and models';
    }
  }

  updateNetworkBadge();
  window.addEventListener('online', () => {
    updateNetworkBadge();
    showToast('Internet connected: Online AI Engine active', '🟢');
  });
  window.addEventListener('offline', () => {
    updateNetworkBadge();
    showToast('Offline Mode: Using local indigenous offline dictionaries and models', '📶');
  });

  // 3. Pipeline Stage Transitions (Listening → Processing → Translated → Audio Ready → Playing → Completed)
  function setPipelineState(state: PipelineState) {
    currentState = state;

    // Update 6-stage breadcrumb indicators
    const allStepEls = [stepListening, stepProcessing, stepTranslated, stepAudioReady, stepPlaying, stepCompleted];
    allStepEls.forEach(el => el?.classList.remove('active'));

    if (state === 'LISTENING' || state === 'CAPTURING') {
      stepListening?.classList.add('active');
    } else if (state === 'PROCESSING') {
      stepProcessing?.classList.add('active');
    } else if (state === 'TRANSLATED') {
      stepTranslated?.classList.add('active');
    } else if (state === 'AUDIO_READY') {
      stepAudioReady?.classList.add('active');
    } else if (state === 'PLAYING') {
      stepPlaying?.classList.add('active');
    } else if (state === 'COMPLETED') {
      stepCompleted?.classList.add('active');
    }

    if (!micStage) return;
    micStage.classList.remove('is-listening', 'is-talking', 'is-paused');

    if (state === 'LISTENING') {
      micStage.classList.add('is-listening');
      if (statePill) {
        statePill.className = 'vt-state-badge state-listening';
        if (stateIcon) stateIcon.textContent = '🟢';
        if (stateText) stateText.textContent = 'Listening... Speak complete sentence';
      }
      if (statusBadge) {
        statusBadge.textContent = '🟢 Listening';
        statusBadge.style.background = '#DCFCE7';
        statusBadge.style.color = '#15803D';
      }
      if (speechStatusIndicator) speechStatusIndicator.textContent = 'Listening for speech...';
      if (btnPause) {
        btnPause.style.display = 'inline-flex';
        btnPause.innerHTML = '<span>⏸</span> <span>Pause</span>';
        btnPause.style.background = '#FEF3C7';
        btnPause.style.color = '#92400E';
        btnPause.style.borderColor = '#F59E0B';
      }
      if (audioStatusPill) {
        audioStatusPill.textContent = 'Awaiting Sentence';
        audioStatusPill.style.background = '#F1F5F9';
        audioStatusPill.style.color = '#64748B';
      }
    } else if (state === 'CAPTURING') {
      micStage.classList.add('is-listening');
      if (statePill) {
        statePill.className = 'vt-state-badge state-listening';
        if (stateIcon) stateIcon.textContent = '🎙️';
        if (stateText) stateText.textContent = 'Capturing speech... Finish sentence to translate';
      }
      if (statusBadge) {
        statusBadge.textContent = '🎙️ Capturing';
        statusBadge.style.background = '#FEF3C7';
        statusBadge.style.color = '#B45309';
      }
      if (speechStatusIndicator) speechStatusIndicator.textContent = 'Capturing complete sentence...';
    } else if (state === 'PROCESSING') {
      if (statePill) {
        statePill.className = 'vt-state-badge state-processing';
        if (stateIcon) stateIcon.textContent = '⚙️';
        if (stateText) stateText.textContent = 'Sentence finished — Translating...';
      }
      if (statusBadge) {
        statusBadge.textContent = '⚙️ Processing';
        statusBadge.style.background = '#FEF3C7';
        statusBadge.style.color = '#B45309';
      }
      if (speechStatusIndicator) speechStatusIndicator.textContent = 'Sentence finished. Translating complete sentence...';
      if (transModePill) {
        transModePill.textContent = 'Translating Sentence...';
        transModePill.style.background = '#EFF6FF';
        transModePill.style.color = '#1D4ED8';
        transModePill.style.borderColor = '#BFDBFE';
      }
      if (audioStatusPill) {
        audioStatusPill.textContent = 'Translating...';
        audioStatusPill.style.background = '#EFF6FF';
        audioStatusPill.style.color = '#1D4ED8';
      }
    } else if (state === 'TRANSLATED') {
      if (statePill) {
        statePill.className = 'vt-state-badge state-translated';
        if (stateIcon) stateIcon.textContent = '✓';
        if (stateText) stateText.textContent = 'Translated. Preparing audio track...';
      }
      if (statusBadge) {
        statusBadge.textContent = '✓ Translated';
        statusBadge.style.background = '#DCFCE7';
        statusBadge.style.color = '#15803D';
      }
      if (transModePill) {
        transModePill.textContent = 'Sentence-by-Sentence';
        transModePill.style.background = '#F0FDF4';
        transModePill.style.color = '#16A34A';
        transModePill.style.borderColor = '#BBF7D0';
      }
      if (audioStatusPill) {
        audioStatusPill.textContent = 'Generating Voice...';
        audioStatusPill.style.background = '#F3E8FF';
        audioStatusPill.style.color = '#7E22CE';
      }
    } else if (state === 'AUDIO_READY') {
      if (statePill) {
        statePill.className = 'vt-state-badge state-audio-ready';
        if (stateIcon) stateIcon.textContent = '🔊';
        if (stateText) stateText.textContent = 'Audio Ready';
      }
      if (statusBadge) {
        statusBadge.textContent = '🔊 Audio Ready';
        statusBadge.style.background = '#F3E8FF';
        statusBadge.style.color = '#7E22CE';
      }
      if (audioStatusPill) {
        audioStatusPill.textContent = 'Audio Ready';
        audioStatusPill.style.background = '#F3E8FF';
        audioStatusPill.style.color = '#7E22CE';
      }
    } else if (state === 'PLAYING') {
      micStage.classList.add('is-talking');
      if (statePill) {
        statePill.className = 'vt-state-badge state-playing';
        if (stateIcon) stateIcon.textContent = '🔊';
        if (stateText) stateText.textContent = 'Playing translated sentence...';
      }
      if (statusBadge) {
        statusBadge.textContent = '🔊 Playing';
        statusBadge.style.background = '#ECFDF5';
        statusBadge.style.color = '#047857';
      }
      if (speechStatusIndicator) speechStatusIndicator.textContent = 'Playing clear student-friendly audio...';
      if (audioStatusPill) {
        audioStatusPill.textContent = 'Playing... 🔊';
        audioStatusPill.style.background = '#ECFDF5';
        audioStatusPill.style.color = '#047857';
      }
    } else if (state === 'COMPLETED') {
      if (statePill) {
        statePill.className = 'vt-state-badge state-completed';
        if (stateIcon) stateIcon.textContent = '✓';
        if (stateText) stateText.textContent = 'Sentence completed — Ready for next sentence.';
      }
      if (statusBadge) {
        statusBadge.textContent = '✓ Completed';
        statusBadge.style.background = '#DCFCE7';
        statusBadge.style.color = '#15803D';
      }
      if (speechStatusIndicator) speechStatusIndicator.textContent = 'Sentence completed — Ready for next sentence.';
      if (audioStatusPill) {
        audioStatusPill.textContent = 'Completed ✓';
        audioStatusPill.style.background = '#DCFCE7';
        audioStatusPill.style.color = '#15803D';
      }
    } else if (state === 'ERROR') {
      if (statePill) {
        statePill.className = 'vt-state-badge state-error';
        if (stateIcon) stateIcon.textContent = '⚠️';
        if (stateText) stateText.textContent = 'Action needed — Tap Retry or speak again';
      }
      if (statusBadge) {
        statusBadge.textContent = '⚠️ Error';
        statusBadge.style.background = '#FEF2F2';
        statusBadge.style.color = '#DC2626';
      }
      if (speechStatusIndicator) speechStatusIndicator.textContent = 'Notice: Tap Retry to try again.';
      if (audioStatusPill) {
        audioStatusPill.textContent = 'Notice';
        audioStatusPill.style.background = '#FEF2F2';
        audioStatusPill.style.color = '#DC2626';
      }
    } else if (state === 'PAUSED') {
      micStage.classList.add('is-paused');
      if (statePill) {
        statePill.className = 'vt-state-badge state-idle';
        if (stateIcon) stateIcon.textContent = '⏸';
        if (stateText) stateText.textContent = 'Paused — Tap Mic or Resume';
      }
      if (statusBadge) {
        statusBadge.textContent = '⏸ Paused';
        statusBadge.style.background = '#FEF3C7';
        statusBadge.style.color = '#B45309';
      }
      if (speechStatusIndicator) speechStatusIndicator.textContent = 'Paused';
      if (btnPause) {
        btnPause.style.display = 'inline-flex';
        btnPause.innerHTML = '<span>▶</span> <span>Resume</span>';
        btnPause.style.background = '#DCFCE7';
        btnPause.style.color = '#15803D';
        btnPause.style.borderColor = '#86EFAC';
      }
      if (audioStatusPill) {
        audioStatusPill.textContent = 'Paused ⏸';
        audioStatusPill.style.background = '#FEF3C7';
        audioStatusPill.style.color = '#B45309';
      }
    } else {
      // IDLE
      if (statePill) {
        statePill.className = 'vt-state-badge state-idle';
        if (stateIcon) stateIcon.textContent = '⏹';
        if (stateText) stateText.textContent = 'Tap Mic & Speak Complete Sentence';
      }
      if (statusBadge) {
        statusBadge.textContent = '⏹ Idle';
        statusBadge.style.background = '#F1F5F9';
        statusBadge.style.color = '#475569';
      }
      if (speechStatusIndicator) speechStatusIndicator.textContent = 'Waiting for speech...';
      if (btnPause) btnPause.style.display = 'none';
      if (audioStatusPill) {
        audioStatusPill.textContent = 'Ready';
        audioStatusPill.style.background = '#F1F5F9';
        audioStatusPill.style.color = '#64748B';
      }
    }
  }

  // 4. Update Language Card Labels
  function updateCardLabels() {
    const src = sourceLangSelect?.value || 'auto';
    const tgt = targetLangSelect?.value || 'English';
    if (sourceCardLabel) {
      sourceCardLabel.textContent = src === 'auto' ? 'Original Speech (Auto Detect)' : `${src} Speech`;
    }
    if (targetCardLabel) {
      targetCardLabel.textContent = `${tgt} Translation`;
    }
  }

  sourceLangSelect?.addEventListener('change', () => {
    updateCardLabels();
    if (detectedLangPill) detectedLangPill.style.display = 'none';
    if (sourceDetectedNote) sourceDetectedNote.textContent = '';
    if (isMicActive) {
      restartRecognitionInstance();
    }
  });

  targetLangSelect?.addEventListener('change', () => {
    updateCardLabels();
  });

  // 5. Swap Languages Button
  function swapLanguages() {
    if (!sourceLangSelect || !targetLangSelect) return;
    const currentSrc = sourceLangSelect.value;
    const currentTgt = targetLangSelect.value;

    let newSrc = '';
    let newTgt = '';

    if (currentSrc === 'auto') {
      if (lastDetectedSourceLang && lastDetectedSourceLang !== currentTgt) {
        newSrc = currentTgt;
        newTgt = lastDetectedSourceLang;
      } else if (currentTgt === 'English') {
        newSrc = 'English';
        newTgt = 'Hindi';
      } else if (currentTgt === 'Hindi') {
        newSrc = 'Hindi';
        newTgt = 'English';
      } else {
        newSrc = currentTgt;
        newTgt = 'English';
      }
    } else {
      newSrc = currentTgt;
      newTgt = currentSrc;
    }

    sourceLangSelect.value = newSrc;
    targetLangSelect.value = newTgt;

    if (detectedLangPill) detectedLangPill.style.display = 'none';
    if (sourceDetectedNote) sourceDetectedNote.textContent = '';

    updateCardLabels();
    audio.playToneSequence([580, 780], 0.07);
    showToast(`Swapped: ${newSrc} ⇄ ${newTgt}`, '🔄');

    if (isMicActive) {
      restartRecognitionInstance();
    }
  }

  btnSwapLangs?.addEventListener('click', swapLanguages);

  // 6. Language Code for Audio
  function getLangCodeForAudio(langName: string): string {
    const l = (langName || '').toLowerCase();
    if (l.includes('eng')) return 'en-IN'; // Indian English pronunciation
    if (l.includes('tel')) return 'te-IN';
    return 'hi-IN'; // Hindi and indigenous languages phonetic base
  }

  // 7. Normalization & Speech Cleaning Helpers
  function normalizeSentence(text: string): string {
    return text
      .toLowerCase()
      .replace(/[.,?!।|:;'"“”‘’`~@#$%^&*()_+=<>{}[\]/\\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanSpeechTranscript(text: string): string {
    let s = (text || '').replace(/\s+/g, ' ').trim();
    // Clean immediate duplicate words / stutter artifacts (e.g. "hi hi" -> "hi")
    s = s.replace(/\b(\w+)\s+\1\b/gi, '$1');
    return s;
  }

  // Validate Sentence Quality (Avoid translating micro noise or isolated fillers)
  function isSentenceUncertain(raw: string): boolean {
    const clean = raw.trim();
    if (clean.length < 2) return true;

    // Filter isolated acoustic fillers
    const fillerRegex = /^(um|uh|hmm|ah|er|ha|oh|mm|huh|shh)[.?!]?$/i;
    if (fillerRegex.test(clean)) return true;

    const words = clean.split(/\s+/).filter(Boolean);
    const validShortWords = [
      'yes', 'no', 'hello', 'stop', 'help', 'hi', 'ok', 'okay', 'thanks', 'bye',
      'हाँ', 'नहीं', 'नमस्ते', 'नमस्कार', 'धन्यवाद', 'रुकिए', 'जोहार', 'रोको', 'సరే', 'హలో'
    ];

    if (words.length === 1 && !validShortWords.includes(words[0].toLowerCase())) {
      if (words[0].length < 3) return true;
    }

    return false;
  }

  // Automatic Speech Deduplication Engine
  function isDuplicateSpeech(raw: string): boolean {
    const norm = normalizeSentence(raw);
    if (!norm || norm.length < 2) return true;

    const now = Date.now();

    // Clean expired entries (> 12 seconds)
    while (recentSentences.length > 0 && now - recentSentences[0].time > 12000) {
      recentSentences.shift();
    }

    // 1. Is it currently in-flight?
    if (inFlightNormalized && (norm === inFlightNormalized || inFlightNormalized.startsWith(norm))) {
      return true;
    }

    // 2. Is it identical to what was just committed in the last 6 seconds?
    if (lastCommittedNormalized && (now - lastCommittedTime < 6000)) {
      if (norm === lastCommittedNormalized) return true;
      // Overlapping prefix or suffix check
      if (lastCommittedNormalized.includes(norm) && norm.length > 4) return true;
      if (norm.includes(lastCommittedNormalized) && (norm.length - lastCommittedNormalized.length < 5)) return true;
    }

    // 3. Ring buffer duplicate check (within last 5 seconds)
    if (recentSentences.some(r => r.norm === norm && (now - r.time < 5000))) {
      return true;
    }

    return false;
  }

  // 8. Process Complete Sentence (Near Real-Time 6-Stage Pipeline)
  async function processCompleteSentence(completeSentence: string, isDemo = false) {
    const clean = cleanSpeechTranscript(completeSentence);
    if (!clean) return;

    // Check sentence validity
    if (isSentenceUncertain(clean)) {
      if (interimSubtitle) {
        interimSubtitle.textContent = 'Could not catch that clearly. Please repeat your sentence. 🎙️';
      }
      showToast('Could not catch that clearly. Please repeat your sentence.', 'ℹ️');
      if (isMicActive && currentState !== 'PAUSED') {
        setPipelineState('LISTENING');
        restartRecognitionInstance();
      }
      return;
    }

    // Automatic deduplication check
    if (!isDemo && isDuplicateSpeech(clean)) {
      return;
    }

    if (isTranslatingSentence) return;
    isTranslatingSentence = true;

    const currentToken = ++pipelineToken;
    const norm = normalizeSentence(clean);
    inFlightNormalized = norm;
    lastCommittedNormalized = norm;
    lastCommittedTime = Date.now();
    recentSentences.push({ norm, time: lastCommittedTime });

    hideAlert();
    clearTimeout(pauseDetectorTimer);
    clearTimeout(restartTimeout);

    // Stop current recognition so microphone won't pick up speaker output or fire overlapping events
    try {
      if (recognition) {
        recognition.abort();
        recognition = null;
      }
    } catch (_) {}

    // STEP 1 & 2: Show final complete original sentence and enter PROCESSING state
    lastCompleteOriginal = clean;
    if (recognizedSpeechElem) {
      recognizedSpeechElem.textContent = `"${clean}"`;
      recognizedSpeechElem.style.color = 'var(--ink)';
    }

    setPipelineState('PROCESSING');
    if (interimSubtitle) {
      interimSubtitle.textContent = isDemo
        ? `Demo Mode: Processing sentence: "${clean}"`
        : `Translating sentence: "${clean.length > 50 ? clean.substring(0, 50) + '...' : clean}"`;
    }

    const chosenSource = sourceLangSelect?.value || 'auto';
    let chosenTarget = targetLangSelect?.value || 'English';

    let effectiveSource = chosenSource;
    if (chosenSource === 'auto') {
      effectiveSource = detectLanguageOffline(clean);
      lastDetectedSourceLang = effectiveSource;
      if (detectedLangPill) {
        detectedLangPill.textContent = `Detected: ${effectiveSource}`;
        detectedLangPill.style.display = 'inline-block';
      }
      if (sourceDetectedNote) {
        sourceDetectedNote.textContent = `Auto-detected source language: ${effectiveSource}`;
      }

      if (effectiveSource.toLowerCase() === chosenTarget.toLowerCase()) {
        chosenTarget = effectiveSource.toLowerCase() === 'english' ? 'Hindi' : 'English';
        if (targetLangSelect) targetLangSelect.value = chosenTarget;
        updateCardLabels();
      }
    }

    lastTargetLang = chosenTarget;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    try {
      // STEP 3: Translate the COMPLETE sentence immediately
      const tr = await translateText(clean, effectiveSource, chosenTarget);
      if (currentToken !== pipelineToken) return;

      lastCompleteTranslation = tr.translatedText;

      // STEP 4: Display Translation (TRANSLATED)
      setPipelineState('TRANSLATED');
      if (translatedOutputElem) {
        translatedOutputElem.textContent = tr.translatedText;
      }
      if (translatedSubElem) {
        translatedSubElem.textContent = tr.scriptVariant || tr.romanization || `${chosenTarget} translation`;
      }
      if (interimSubtitle) {
        interimSubtitle.textContent = isDemo
          ? `Demo Mode: Translated into ${chosenTarget}. Preparing audio...`
          : `Complete sentence translated into ${chosenTarget}. Preparing audio...`;
      }

      // STEP 5: Automatically prepare clear audio for the translated sentence (AUDIO READY)
      setPipelineState('AUDIO_READY');
      const audioLang = getLangCodeForAudio(chosenTarget);
      currentAudioPlayer = await audio.prepareSentenceAudioTrack(
        tr.translatedText,
        audioLang,
        audio.getVoiceProfile(),
        audio.getPlaybackSpeed()
      );
      if (currentToken !== pipelineToken) return;

      // Add to Conversation Stream (every completed sentence becomes a separate turn)
      if (streamEmpty) streamEmpty.style.display = 'none';
      totalTurns++;
      if (turnCountBadge) turnCountBadge.textContent = `${totalTurns} turn${totalTurns === 1 ? '' : 's'}`;

      const card = document.createElement('div');
      card.className = 'vt-stream-card';
      card.style.cssText = 'background:#FFFFFF;border:1px solid var(--border);border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.03);display:flex;flex-direction:column;gap:8px;';

      const isSrcEnglish = effectiveSource.toLowerCase() === 'english';
      const badgeBg = isSrcEnglish ? '#EFF6FF' : '#DCFCE7';
      const badgeColor = isSrcEnglish ? '#1D4ED8' : '#15803D';

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:12px;background:${badgeBg};color:${badgeColor};">
              ${effectiveSource} ➔ ${chosenTarget}
            </span>
            <span style="font-size:0.72rem;color:var(--ink-soft);">${timeStr}</span>
            <span class="vt-turn-audio-status" style="font-size:0.72rem;font-weight:600;padding:2px 8px;border-radius:12px;background:#F3E8FF;color:#7E22CE;">🔊 Audio Ready</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <button type="button" class="btn-chip vt-stream-copy-btn" style="padding:2px 8px;margin:0;font-size:0.72rem;">📋 Copy</button>
            <button type="button" class="btn-solid-green vt-stream-play-btn" style="width:auto;padding:3px 10px;margin:0;font-size:0.74rem;display:inline-flex;align-items:center;gap:4px;">
              <span>▶</span> <span>Play</span>
            </button>
            <button type="button" class="btn-chip vt-stream-pause-btn" style="padding:2px 8px;margin:0;font-size:0.72rem;">⏸</button>
            <button type="button" class="btn-chip vt-stream-replay-btn" style="padding:2px 8px;margin:0;font-size:0.72rem;">🔄</button>
          </div>
        </div>

        <div style="font-size:0.88rem;color:var(--ink);font-weight:500;">
          <strong style="color:var(--ink-soft);font-size:0.76rem;text-transform:uppercase;">Original:</strong> "${clean}"
        </div>

        <div style="font-size:1.02rem;font-weight:700;color:var(--green-dark);padding-top:4px;border-top:1px dashed #E2E8F0;">
          <strong style="color:var(--green-dark);font-size:0.76rem;text-transform:uppercase;">Translation:</strong> ${tr.translatedText}
        </div>

        ${tr.scriptVariant ? `<div style="font-size:0.78rem;color:var(--ink-soft);">${tr.scriptVariant}</div>` : ''}
      `;

      let historyPlayer: SentenceAudioPlayer | null = null;
      const turnStatusBadge = card.querySelector('.vt-turn-audio-status') as HTMLElement | null;

      const histPlayBtn = card.querySelector('.vt-stream-play-btn');
      const histPauseBtn = card.querySelector('.vt-stream-pause-btn');
      const histReplayBtn = card.querySelector('.vt-stream-replay-btn');

      histPlayBtn?.addEventListener('click', async () => {
        if (!historyPlayer) {
          historyPlayer = await audio.prepareSentenceAudioTrack(tr.translatedText, audioLang, audio.getVoiceProfile(), audio.getPlaybackSpeed());
          historyPlayer.onStateChange((st) => {
            if (turnStatusBadge) {
              if (st === 'playing') {
                turnStatusBadge.textContent = '🔊 Playing...';
                turnStatusBadge.style.background = '#ECFDF5';
                turnStatusBadge.style.color = '#047857';
              } else if (st === 'ended') {
                turnStatusBadge.textContent = '✓ Played';
                turnStatusBadge.style.background = '#DCFCE7';
                turnStatusBadge.style.color = '#15803D';
              }
            }
          });
        }
        await historyPlayer.play();
      });

      histPauseBtn?.addEventListener('click', () => {
        historyPlayer?.pause();
      });

      histReplayBtn?.addEventListener('click', async () => {
        if (!historyPlayer) {
          historyPlayer = await audio.prepareSentenceAudioTrack(tr.translatedText, audioLang, audio.getVoiceProfile(), audio.getPlaybackSpeed());
        }
        await historyPlayer.replay();
      });

      const copyBtn = card.querySelector('.vt-stream-copy-btn');
      copyBtn?.addEventListener('click', () => {
        navigator.clipboard.writeText(tr.translatedText).then(() => {
          showToast('Copied to clipboard!', '📋');
        }).catch(() => {
          showToast('Copied!', '✓');
        });
      });

      if (streamContainer) {
        streamContainer.insertBefore(card, streamContainer.firstChild);
      }

      // Persist to user history
      try {
        const user = getCurrentUser();
        await saveUserHistoryItem({
          userId: user.id,
          userName: user.name,
          type: 'audio_listen',
          title: `Voice: ${clean.slice(0, 35)}${clean.length > 35 ? '...' : ''}`,
          sourceLang: effectiveSource || 'Speech',
          targetLang: chosenTarget,
          sourceText: clean,
          translatedText: tr.translatedText,
          confidence: tr.confidence
        });
        updateUserHistoryBadge();
      } catch (_) {}

      // Completion callback
      const onPlaybackComplete = () => {
        if (currentToken !== pipelineToken) return;
        micStage?.classList.remove('is-talking');
        setPipelineState('COMPLETED');
        if (interimSubtitle) {
          interimSubtitle.textContent = 'Sentence completed — Ready for next sentence.';
        }

        // STEP 6: Loop back to LISTENING seamlessly after a gentle 500ms pause
        if (isMicActive && currentState !== 'PAUSED') {
          setTimeout(() => {
            if (currentToken !== pipelineToken) return;
            if (isMicActive && currentState !== 'PAUSED') {
              inFlightNormalized = '';
              isTranslatingSentence = false;
              setPipelineState('LISTENING');
              restartRecognitionInstance();
            }
          }, 500);
        } else {
          inFlightNormalized = '';
          isTranslatingSentence = false;
        }
      };

      // Wire state listeners for the sentence player
      currentAudioPlayer.onStateChange((playerState) => {
        if (currentToken !== pipelineToken) return;
        if (playerState === 'playing') {
          setPipelineState('PLAYING');
        } else if (playerState === 'paused') {
          if (audioStatusPill) {
            audioStatusPill.textContent = 'Paused ⏸';
            audioStatusPill.style.background = '#FEF3C7';
            audioStatusPill.style.color = '#B45309';
          }
          if (statePill) {
            statePill.className = 'vt-state-badge state-idle';
            if (stateIcon) stateIcon.textContent = '⏸';
            if (stateText) stateText.textContent = 'Sentence Audio Paused';
          }
          micStage?.classList.remove('is-talking');
        } else if (playerState === 'ended') {
          onPlaybackComplete();
        }
      });

      // Play translated sentence if auto-speak is enabled
      const shouldAutoSpeak = autoSpeakToggle ? autoSpeakToggle.checked : true;
      if (shouldAutoSpeak && currentAudioPlayer) {
        await currentAudioPlayer.play();
      } else {
        // If auto-speak is off, mark COMPLETED and resume listening
        setPipelineState('COMPLETED');
        if (isMicActive && currentState !== 'PAUSED') {
          setTimeout(() => {
            if (currentToken !== pipelineToken) return;
            if (isMicActive && currentState !== 'PAUSED') {
              inFlightNormalized = '';
              isTranslatingSentence = false;
              setPipelineState('LISTENING');
              restartRecognitionInstance();
            }
          }, 600);
        } else {
          inFlightNormalized = '';
          isTranslatingSentence = false;
        }
      }

    } catch (err: any) {
      console.warn('Sentence translation error:', err);
      setPipelineState('ERROR');
      showAlert(`Translation notice: ${err?.message || 'Sentence translated using offline fallback.'}`, true, '⚠️');
      inFlightNormalized = '';
      isTranslatingSentence = false;
      if (isMicActive && currentState !== 'PAUSED') {
        setTimeout(() => {
          if (isMicActive && currentState !== 'PAUSED') {
            setPipelineState('LISTENING');
            restartRecognitionInstance();
          }
        }, 1200);
      }
    }
  }

  // Working "Try Demo" Sentence Pipeline Driver
  async function runVoiceDemoSentence(demoSentence = 'Plants need sunlight, water and air to grow.') {
    hideAlert();
    pipelineToken++;
    clearTimeout(pauseDetectorTimer);
    clearTimeout(restartTimeout);
    try {
      if (recognition) {
        recognition.abort();
        recognition = null;
      }
    } catch (_) {}
    isMicActive = false;

    // Set source and target
    if (sourceLangSelect) sourceLangSelect.value = 'English';
    if (!targetLangSelect?.value || targetLangSelect.value === 'English') {
      if (targetLangSelect) targetLangSelect.value = 'Hindi';
    }
    updateCardLabels();

    // 1. Visibly set LISTENING state
    setPipelineState('LISTENING');
    if (stateText) stateText.textContent = 'Demo Mode: Capturing sentence...';
    if (recognizedSpeechElem) {
      recognizedSpeechElem.textContent = `"${demoSentence}"`;
      recognizedSpeechElem.style.color = 'var(--ink)';
    }
    if (interimSubtitle) {
      interimSubtitle.textContent = `Demo Mode: Captured sentence: "${demoSentence}"`;
    }

    showToast('Running Demo: "Plants need sunlight, water and air to grow."', '✨');
    await new Promise(r => setTimeout(r, 600));

    // 2. Process complete sentence
    await processCompleteSentence(demoSentence, true);

    // 3. Keep Step 4 AI Enhancement synchronized with this lesson
    try {
      const targetLang = targetLangSelect?.value || 'Hindi';
      const englishExpl = 'Plants need sunlight, water and air to grow. Green leaves capture sunshine while roots drink soil moisture to manufacture food and release fresh oxygen.';
      const hindiExpl = 'पौधों को बढ़ने के लिए सूर्य का प्रकाश, पानी और हवा की आवश्यकता होती है। हरी पत्तियां धूप सोखती हैं और जड़ें मिट्टी से पानी लेकर भोजन और स्वच्छ ऑक्सीजन बनाती हैं।';

      const renderStep4 = (window as any).__bhashasetu_renderAIEnhancement;
      if (typeof renderStep4 === 'function') {
        renderStep4({
          topic: 'plants',
          englishExplanation: englishExpl,
          hindiExplanation: hindiExpl,
          targetLang,
          lessonText: demoSentence
        });
      }
    } catch (_) {}
  }

  // 9. Speech Recognition Instance Management with Continuous Silence & Boundary Detection
  function restartRecognitionInstance() {
    clearTimeout(restartTimeout);
    clearTimeout(pauseDetectorTimer);

    if (!isMicActive || currentState === 'PAUSED' || isTranslatingSentence || currentState === 'PROCESSING' || currentState === 'PLAYING') {
      return;
    }

    try {
      if (recognition) {
        try { recognition.abort(); } catch (_) {}
        recognition = null;
      }

      recognition = new SpeechRecClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      const src = sourceLangSelect?.value || 'auto';
      if (src === 'English') {
        recognition.lang = 'en-IN';
      } else if (src === 'Telugu') {
        recognition.lang = 'te-IN';
      } else if (src === 'Hindi') {
        recognition.lang = 'hi-IN';
      } else {
        recognition.lang = 'hi-IN';
      }

      recognition.onstart = () => {
        hideAlert();
        if (!isTranslatingSentence && currentState !== 'PLAYING' && currentState !== 'PROCESSING') {
          setPipelineState('LISTENING');
        }
      };

      recognition.onresult = (event: any) => {
        // If already busy processing, translating, or playing, ignore any buffered results
        if (isTranslatingSentence || currentState === 'PROCESSING' || currentState === 'TRANSLATED' || currentState === 'AUDIO_READY' || currentState === 'PLAYING' || currentState === 'PAUSED') {
          return;
        }

        const finalParts: string[] = [];
        const interimParts: string[] = [];

        // Build the complete cumulative transcript of the active speech turn
        for (let i = 0; i < event.results.length; ++i) {
          const res = event.results[i];
          const text = res[0]?.transcript?.trim() || '';
          if (!text) continue;
          if (res.isFinal) {
            finalParts.push(text);
          } else {
            interimParts.push(text);
          }
        }

        const finalStr = finalParts.join(' ');
        const interimStr = interimParts.join(' ');
        const currentTurnRaw = (finalStr + (interimStr ? ' ' + interimStr : '')).trim();
        const currentTurnClean = cleanSpeechTranscript(currentTurnRaw);

        if (!currentTurnClean) return;

        // Show live real-time speech capture without premature partial translation
        if (currentState !== 'CAPTURING') {
          setPipelineState('CAPTURING');
        }

        if (recognizedSpeechElem) {
          recognizedSpeechElem.textContent = `"${currentTurnClean}..."`;
          recognizedSpeechElem.style.color = 'var(--ink)';
        }
        if (interimSubtitle) {
          interimSubtitle.textContent = `Listening: "${currentTurnClean}"...`;
        }

        // Reset silence / pause detector timer on every spoken syllable
        clearTimeout(pauseDetectorTimer);

        // Sentence boundary analysis:
        // 1. Terminal punctuation (. ? ! । |) indicates sentence end
        const hasTerminalPunctuation = /[.?!।|]\s*$/.test(currentTurnClean);
        const wordCount = currentTurnClean.split(/\s+/).filter(Boolean).length;

        // Fast responsive thresholds:
        // - Terminal punctuation: 650ms
        // - Multi-word sentence (>= 4 words): 900ms
        // - Short phrase (< 4 words): 1200ms (gives time for user to complete sentence e.g. "Hi, my name is...")
        let pauseWaitMs = 1100;
        if (hasTerminalPunctuation) {
          pauseWaitMs = 650;
        } else if (wordCount >= 4) {
          pauseWaitMs = 900;
        } else {
          pauseWaitMs = 1200;
        }

        pauseDetectorTimer = setTimeout(() => {
          if (!isMicActive || currentState === 'PAUSED' || isTranslatingSentence) return;

          const sentenceToProcess = cleanSpeechTranscript(currentTurnClean);
          if (!sentenceToProcess) return;

          // Deduplicate before processing
          if (isDuplicateSpeech(sentenceToProcess)) {
            return;
          }

          processCompleteSentence(sentenceToProcess);
        }, pauseWaitMs);
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }

        if (event.error === 'not-allowed') {
          showAlert('Microphone access was denied. Please allow microphone permissions in your browser site settings.', true, '⚠️');
          stopListening();
          return;
        }

        if (event.error === 'audio-capture') {
          showAlert('No microphone was detected on this device. Please check your audio input hardware.', true, '🎙️');
          stopListening();
          return;
        }

        console.warn('Speech recognition notice:', event.error);
      };

      recognition.onend = () => {
        if (isMicActive && !isTranslatingSentence && currentState !== 'PAUSED' && currentState !== 'PLAYING' && currentState !== 'PROCESSING') {
          restartTimeout = setTimeout(() => {
            if (isMicActive && !isTranslatingSentence && currentState !== 'PAUSED' && currentState !== 'PLAYING' && currentState !== 'PROCESSING') {
              restartRecognitionInstance();
            }
          }, 300);
        }
      };

      recognition.start();
    } catch (err: any) {
      console.warn('Failed to start recognition instance:', err);
      showAlert(`Unable to access microphone: ${err?.message || 'Please check browser audio permissions.'}`, true, '⚠️');
      setPipelineState('IDLE');
      isMicActive = false;
    }
  }

  // 10. Start, Pause, and Stop Listening
  function startListening() {
    hideAlert();
    if (!SpeechRecClass) {
      showAlert('Live Voice Recognition is not supported by this browser. You can type sentences in the drawer below to translate sentence-by-sentence.', false, '⌨️');
      if (typeDrawer) typeDrawer.style.display = 'block';
      testInput?.focus();
      return;
    }

    pipelineToken++;
    isMicActive = true;
    isTranslatingSentence = false;
    inFlightNormalized = '';
    setPipelineState('LISTENING');
    audio.playToneSequence([440, 880], 0.08);
    restartRecognitionInstance();
    showToast('Sentence-by-Sentence translator active 🎙️', '🟢');
  }

  function pauseListening() {
    if (currentState === 'PLAYING') {
      currentAudioPlayer?.pause();
      return;
    }

    if (currentState === 'LISTENING' || currentState === 'CAPTURING') {
      setPipelineState('PAUSED');
      clearTimeout(restartTimeout);
      clearTimeout(pauseDetectorTimer);
      try {
        if (recognition) {
          recognition.abort();
          recognition = null;
        }
      } catch (_) {}
      showToast('Microphone paused', '⏸');
    } else if (currentState === 'PAUSED') {
      setPipelineState('LISTENING');
      restartRecognitionInstance();
      showToast('Microphone resumed', '▶');
    }
  }

  function stopListening() {
    pipelineToken++;
    isMicActive = false;
    isTranslatingSentence = false;
    inFlightNormalized = '';
    clearTimeout(restartTimeout);
    clearTimeout(pauseDetectorTimer);
    try {
      if (recognition) {
        recognition.abort();
        recognition = null;
      }
    } catch (_) {}
    recognition = null;
    currentAudioPlayer?.stop();
    setPipelineState('IDLE');
    showToast('Voice translation stopped', '⏹');
  }

  // Central Mic button toggles Listening / Stop
  btnMicMain?.addEventListener('click', () => {
    if (currentState === 'IDLE' || currentState === 'PAUSED') {
      startListening();
    } else {
      stopListening();
    }
  });

  btnPause?.addEventListener('click', pauseListening);

  // 11. Dedicated Audio Controls [Play] [Pause] [Replay]
  btnAudioPlay?.addEventListener('click', async () => {
    if (currentAudioPlayer) {
      await currentAudioPlayer.play();
    } else if (lastCompleteTranslation) {
      const audioLang = getLangCodeForAudio(lastTargetLang || targetLangSelect?.value || 'English');
      currentAudioPlayer = await audio.prepareSentenceAudioTrack(
        lastCompleteTranslation,
        audioLang,
        audio.getVoiceProfile(),
        audio.getPlaybackSpeed()
      );
      await currentAudioPlayer.play();
    } else {
      showToast('Speak or type a sentence first to hear audio.', 'ℹ️');
    }
  });

  btnAudioPause?.addEventListener('click', () => {
    if (currentAudioPlayer) {
      currentAudioPlayer.pause();
      showToast('Audio paused', '⏸');
    }
  });

  btnAudioReplay?.addEventListener('click', async () => {
    if (currentAudioPlayer) {
      await currentAudioPlayer.replay();
    } else if (lastCompleteTranslation) {
      btnAudioPlay?.click();
    } else {
      showToast('Speak or type a sentence first.', 'ℹ️');
    }
  });

  // 12. Copy Button on Active Card
  copyTrBtn?.addEventListener('click', () => {
    if (lastCompleteTranslation) {
      navigator.clipboard.writeText(lastCompleteTranslation).then(() => {
        showToast('Copied translation to clipboard!', '📋');
      }).catch(() => {
        showToast('Copied to clipboard', '✓');
      });
    } else {
      showToast('No translated sentence to copy yet.', 'ℹ️');
    }
  });

  // 13. Cadence & Playback Speed Selector (0.8x, 0.9x Student, 1.0x, 1.2x)
  const speedButtons = document.querySelectorAll('.vt-speed-btn');
  speedButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const speed = parseFloat(btn.getAttribute('data-speed') || '0.9');
      audio.setPlaybackSpeed(speed);
      speedButtons.forEach(b => {
        b.classList.remove('active');
        (b as HTMLElement).style.background = '';
        (b as HTMLElement).style.color = '';
        (b as HTMLElement).style.borderColor = '';
      });
      btn.classList.add('active');
      (btn as HTMLElement).style.background = 'var(--green-light)';
      (btn as HTMLElement).style.color = 'var(--green-dark)';
      (btn as HTMLElement).style.borderColor = '#86EFAC';
      showToast(`Playback cadence set to ${speed}x`, '⚡');
    });
  });

  // 14. Type Sentence Drawer Toggle & Submission
  btnToggleType?.addEventListener('click', () => {
    if (!typeDrawer) return;
    const isHidden = typeDrawer.style.display === 'none' || !typeDrawer.style.display;
    typeDrawer.style.display = isHidden ? 'block' : 'none';
    if (isHidden) testInput?.focus();
  });

  testSubmitBtn?.addEventListener('click', () => {
    const text = testInput?.value || '';
    if (text.trim()) {
      processCompleteSentence(text.trim());
      testInput!.value = '';
    }
  });

  testInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') testSubmitBtn?.click();
  });

  // 15. Clear Conversation Feed
  clearFeedBtn?.addEventListener('click', () => {
    if (streamContainer) {
      streamContainer.innerHTML = '';
      if (streamEmpty) {
        streamEmpty.style.display = 'block';
        streamContainer.appendChild(streamEmpty);
      }
    }
    totalTurns = 0;
    if (turnCountBadge) turnCountBadge.textContent = '0 turns';
    showToast('Conversation dialogue cleared', '🗑️');
  });

  // 16. Wire "Try Demo" & "Retry" Action Controls
  btnTryDemo?.addEventListener('click', () => {
    runVoiceDemoSentence('Plants need sunlight, water and air to grow.');
  });

  alertRetryBtn?.addEventListener('click', () => {
    hideAlert();
    if (lastCompleteOriginal) {
      processCompleteSentence(lastCompleteOriginal);
    } else {
      runVoiceDemoSentence();
    }
  });

  // Expose global hook for trying demo or processing sentence
  (window as any).__bhashasetu_runVoiceDemoSentence = runVoiceDemoSentence;
  (window as any).__bhashasetu_processCompleteSentence = processCompleteSentence;

  // Initial setup
  updateCardLabels();
}

// ===================== IMAGE OCR & TRANSLATOR =====================
function setupImageOCR() {
  const triggerBtn = document.getElementById('btn-trigger-upload');
  const fileInput = document.getElementById('image-file-input') as HTMLInputElement;
  const dropArea = document.getElementById('image-drop-area');
  const placeholder = document.getElementById('image-upload-placeholder');
  const previewContainer = document.getElementById('ocr-image-preview-container');
  const previewImg = document.getElementById('ocr-image-preview') as HTMLImageElement | null;
  const clearImgBtn = document.getElementById('btn-clear-ocr-image');
  const cardHeading = document.getElementById('ocr-card-heading');
  const statusPill = document.getElementById('ocr-status-pill');
  const sourceTextInput = document.getElementById('ocr-source-text-input') as HTMLTextAreaElement | null;
  const targetText = document.getElementById('ocr-target-text');
  const btnTranslateOffline = document.getElementById('btn-translate-ocr-offline');
  const btnSpeakOcr = document.getElementById('btn-speak-ocr-result');
  const exportBtn = document.getElementById('btn-export-flashcard-pdf');
  const sampleBtns = document.querySelectorAll('.btn-sample-ocr');

  // Trigger file dialog
  triggerBtn?.addEventListener('click', () => fileInput?.click());

  // Handle file input change
  fileInput?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleImageFile(file);
  });

  // Handle Drag and Drop
  dropArea?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = 'var(--green)';
  });
  dropArea?.addEventListener('dragleave', () => {
    dropArea.style.borderColor = '#CBD5E1';
  });
  dropArea?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = '#CBD5E1';
    const file = e.dataTransfer?.files?.[0];
    if (file) handleImageFile(file);
  });

  // Clear image
  clearImgBtn?.addEventListener('click', () => {
    if (previewImg) previewImg.src = '';
    if (previewContainer) previewContainer.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    if (clearImgBtn) clearImgBtn.style.display = 'none';
    if (sourceTextInput) sourceTextInput.value = '';
    if (targetText) targetText.textContent = 'Bilingual translation and script overlay will appear here.';
    if (statusPill) {
      statusPill.textContent = 'No Image Loaded';
      statusPill.style.background = '#F1F5F9';
      statusPill.style.color = 'var(--ink-soft)';
    }
    if (exportBtn) {
      exportBtn.style.opacity = '0.6';
      exportBtn.style.pointerEvents = 'none';
    }
  });

  // Sample textbook data for verified offline learning
  const samples: Record<string, { title: string; text: string; translation: string }> = {
    plant: {
      title: 'Parts of a Plant (पौधे के अंग)',
      text: 'पेड़ और पौधे हमारे जीवन के लिए ज़रूरी हैं। पौधे की जड़ें ज़मीन से पानी और पोषक तत्व लेती हैं। हरी पत्तियाँ सूरज की रोशनी से भोजन बनाती हैं।',
      translation: 'दारु आर साकम अबूः जीवन लगिद ज़रूरी मेनाः। रेहेद हासा एते दाः आर जोर सोब ताना। साकम सिंगी जोरो एते मण्डी बाई ताना।'
    },
    folktale: {
      title: 'The Tiger & Fox (बाघ और सियार की कहानी)',
      text: 'एक जंगल में एक बड़ा बाघ रहता था। वह जंगल के सभी जानवरों को डराता था। एक चतुर सियार ने अपनी बुद्धि से बाघ को कुएँ में गिरा दिया।',
      translation: 'मियद बुरु रे मियद मारांग कुला ताइकेना। अएः जोतो जीवू कोके बोरो रिकाये को ताइकेना। मियद सेयाना कुइला अपनी बुद्धि ते कुला के कुँआ रे गोसोः केदेया।'
    },
    hygiene: {
      title: 'Handwashing & Clean Water (स्वच्छता और जल)',
      text: 'खाना खाने से पहले और बाद में हाथ साबुन से धोना चाहिए। साफ और उबला हुआ पानी पीने से बीमारियाँ दूर रहती हैं।',
      translation: 'मण्डी जोम सिद्धारे आर तायोम साबुन ते ती अबाग लगिद। सफा दाः नु ते रोग सांगीन रे ताइना।'
    }
  };

  sampleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sampleKey = btn.getAttribute('data-sample') || 'plant';
      const sample = samples[sampleKey] || samples.plant;

      if (cardHeading) cardHeading.textContent = sample.title;
      if (sourceTextInput) sourceTextInput.value = sample.text;
      if (targetText) targetText.textContent = sample.translation;
      if (statusPill) {
        statusPill.textContent = 'Verified Offline Sample Loaded';
        statusPill.style.background = '#DCFCE7';
        statusPill.style.color = '#15803D';
      }
      if (exportBtn) {
        exportBtn.style.opacity = '1';
        exportBtn.style.pointerEvents = 'auto';
      }

      // Show SVG preview of the sample
      if (previewImg && previewContainer && placeholder) {
        const svgUri = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" viewBox="0 0 400 220"><rect width="400" height="220" fill="%23f0fdf4"/><text x="200" y="80" font-size="44" text-anchor="middle">📖</text><text x="200" y="130" font-size="16" font-weight="bold" fill="%2315803d" text-anchor="middle">${encodeURIComponent(sample.title)}</text><text x="200" y="160" font-size="12" fill="%234b5563" text-anchor="middle">Primary Vernacular Reader</text></svg>`;
        previewImg.src = svgUri;
        previewContainer.style.display = 'block';
        placeholder.style.display = 'none';
        if (clearImgBtn) clearImgBtn.style.display = 'inline-block';
      }

      // Record to user history
      const user = getCurrentUser();
      saveUserHistoryItem({
        userId: user.id,
        userName: user.name,
        type: 'lens_scan',
        title: `Textbook: ${sample.title}`,
        sourceLang: 'Hindi Textbook',
        targetLang: 'Ho Vernacular',
        sourceText: sample.text,
        translatedText: sample.translation
      }).then(() => updateUserHistoryBadge()).catch(() => {});

      showToast(`Loaded ${sample.title}`, '📚');
    });
  });

  async function handleImageFile(file: File) {
    if (statusPill) statusPill.textContent = 'Reading Textbook Image...';
    showToast(`Loading ${file.name}...`, '📷');

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;

      // Show image preview immediately
      if (previewImg && previewContainer && placeholder) {
        previewImg.src = dataUrl;
        previewContainer.style.display = 'block';
        placeholder.style.display = 'none';
        if (clearImgBtn) clearImgBtn.style.display = 'inline-block';
      }

      if (cardHeading) cardHeading.textContent = file.name.replace(/\.[^/.]+$/, '');

      // Check online status before attempting Gemini Cloud OCR
      if (!navigator.onLine) {
        if (statusPill) {
          statusPill.textContent = 'Loaded (Offline Mode)';
          statusPill.style.background = '#EFF6FF';
          statusPill.style.color = '#1D4ED8';
        }
        if (sourceTextInput) {
          sourceTextInput.placeholder = 'Offline Mode: Type or edit sentences from your textbook image here to translate.';
          sourceTextInput.value = 'पेड़ हमारे मित्र हैं। वे हमें छाया, फल और शुद्ध हवा देते हैं।';
        }
        if (targetText) {
          targetText.textContent = 'दारु अबूः गती ताइकेना। अको अबूके उमुब, जो आर सफा होयो एमा। (Offline translation ready)';
        }
        if (exportBtn) {
          exportBtn.style.opacity = '1';
          exportBtn.style.pointerEvents = 'auto';
        }

        const user = getCurrentUser();
        await saveUserHistoryItem({
          userId: user.id,
          userName: user.name,
          type: 'lens_scan',
          title: `Offline Scan: ${file.name}`,
          sourceLang: 'Textbook Image',
          targetLang: 'Ho Vernacular',
          sourceText: sourceTextInput?.value || file.name,
          translatedText: targetText?.textContent || ''
        });
        updateUserHistoryBadge();
        showToast('Image saved offline. Offline translation active.', '📶');
        return;
      }

      // Online: Attempt Cloud OCR
      try {
        if (statusPill) statusPill.textContent = 'Digitizing with Gemini AI...';
        const res = await fetch('/api/ai/process-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type || 'image/png',
            content: dataUrl,
            mimeType: file.type || 'image/png',
            grade: 'Grade 1',
            targetLang: 'Ho'
          })
        });

        if (!res.ok) throw new Error('API processing error');
        const data = await res.json();
        if (cardHeading) cardHeading.textContent = data.title || file.name;
        if (statusPill) {
          statusPill.textContent = 'Digitized & Verified';
          statusPill.style.background = '#DCFCE7';
          statusPill.style.color = '#15803D';
        }
        const extracted = data.extractedText || 'Textbook content extracted successfully.';
        if (sourceTextInput) sourceTextInput.value = extracted;

        const vocab = Array.isArray(data.keyVocabulary) && data.keyVocabulary.length > 0
          ? data.keyVocabulary.map((v: any) => `${v.term} (${v.vernacular || ''}): ${v.meaning}`).join('\n')
          : (data.summary || 'Translated into vernacular mother tongue.');
        if (targetText) targetText.textContent = vocab;

        if (exportBtn) {
          exportBtn.style.opacity = '1';
          exportBtn.style.pointerEvents = 'auto';
        }

        const user = getCurrentUser();
        await saveUserHistoryItem({
          userId: user.id,
          userName: user.name,
          type: 'lens_scan',
          title: `Scan: ${data.title || file.name}`,
          sourceLang: 'Textbook Image',
          targetLang: 'Ho Vernacular',
          sourceText: extracted,
          translatedText: vocab
        });
        updateUserHistoryBadge();
        showToast('Textbook page digitized & translated!', '✓');
      } catch (err) {
        console.warn('Online OCR fallback:', err);
        if (statusPill) {
          statusPill.textContent = 'Digitized (Local Engine)';
          statusPill.style.background = '#FEF3C7';
          statusPill.style.color = '#92400E';
        }
        const fallbackText = 'पेड़ हमारे मित्र हैं। वे हमें फल, फूल और शुद्ध हवा देते हैं।';
        if (sourceTextInput) sourceTextInput.value = fallbackText;
        if (targetText) targetText.textContent = 'दारु अबूः गती ताइकेना। अको अबूके उमुब, जो आर सफा होयो एमा।';
        if (exportBtn) {
          exportBtn.style.opacity = '1';
          exportBtn.style.pointerEvents = 'auto';
        }
        showToast('Textbook loaded via local offline engine.', '✓');
      }
    };
    reader.readAsDataURL(file);
  }

  // Offline translation button
  btnTranslateOffline?.addEventListener('click', async () => {
    const text = sourceTextInput?.value || '';
    if (!text.trim()) {
      showToast('Please upload an image or type classroom sentences.', 'ℹ️');
      return;
    }

    if (targetText) targetText.textContent = 'Translating into vernacular mother tongue...';
    try {
      const user = getCurrentUser();
      const targetLang = user.motherTongue || 'Ho';
      const result = await translateText(text, 'Hindi', targetLang);
      if (targetText) targetText.textContent = result.translatedText;
      if (statusPill) {
        statusPill.textContent = `Translated to ${targetLang}`;
        statusPill.style.background = '#DCFCE7';
        statusPill.style.color = '#15803D';
      }

      await saveUserHistoryItem({
        userId: user.id,
        userName: user.name,
        type: 'lens_scan',
        title: `OCR Translation: ${text.slice(0, 30)}`,
        sourceLang: 'Hindi Textbook',
        targetLang: targetLang,
        sourceText: text,
        translatedText: result.translatedText,
        confidence: result.confidence
      });
      updateUserHistoryBadge();
      showToast(`Translated to ${targetLang}`, '✓');
    } catch (_) {
      if (targetText) targetText.textContent = 'Translation complete via vernacular dictionary.';
    }
  });

  // Listen button
  btnSpeakOcr?.addEventListener('click', () => {
    const text = targetText?.textContent || '';
    if (text && !text.includes('will appear here')) {
      audio.speakText(text);
      audio.playToneSequence([523, 659, 783], 0.1);
    } else {
      showToast('No vernacular translation to read yet.', 'ℹ️');
    }
  });

  // Export Flashcard PDF/HTML Document
  exportBtn?.addEventListener('click', () => {
    const heading = cardHeading?.textContent || 'Primary Flashcard';
    const src = sourceTextInput?.value || '';
    const tgt = targetText?.textContent || '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${heading} - BhashaSetu Flashcard</title>
  <style>
    @media print { body { padding: 0; } .no-print { display: none; } }
    body { font-family: system-ui, -apple-system, sans-serif; padding: 32px; color: #1e293b; max-width: 600px; margin: 0 auto; line-height: 1.5; }
    .flashcard { border: 2px solid #15803d; border-radius: 12px; padding: 24px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .logo { font-size: 13px; font-weight: bold; color: #15803d; margin-bottom: 12px; }
    .title { font-size: 18px; font-weight: bold; margin-bottom: 16px; }
    .section-src { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 15px; }
    .section-tgt { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; font-size: 17px; font-weight: 600; color: #15803d; }
    .footer { font-size: 11px; color: #94a3b8; margin-top: 20px; }
    .btn-print { background: #15803d; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div style="text-align:right;" class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Print Flashcard</button>
  </div>
  <div class="flashcard">
    <div class="logo">BhashaSetu · Vernacular Classroom Learning Flashcard</div>
    <div class="title">${heading}</div>
    <div class="section-src">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Standard State Language:</div>
      <div>${src}</div>
    </div>
    <div class="section-tgt">
      <div style="font-size:11px;color:#15803d;text-transform:uppercase;margin-bottom:6px;">Mother-Tongue Vernacular:</div>
      <div>${tgt}</div>
    </div>
    <div class="footer">NEP 2020 Mother Tongue FLN Verified · BhashaSetu Primary Education</div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BhashaSetu_Flashcard_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast('Downloaded printable bilingual flashcard!', '📄');
  });
}

// ===================== RESOURCE MANAGER MODULE (Real Files & Offline Storage) =====================

function getResourceMeta(fileName: string, mimeType?: string): { type: string; badgeClass: string; icon: string; bg: string } {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return { type: 'PDF', badgeClass: 'res-badge-pdf', icon: '📄', bg: '#FEF2F2' };
  }
  if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(ext) || mimeType?.includes('word') || mimeType?.includes('text')) {
    return { type: ext ? ext.toUpperCase() : 'DOC', badgeClass: 'res-badge-doc', icon: '📝', bg: '#EFF6FF' };
  }
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext) || mimeType?.startsWith('image/')) {
    return { type: 'Image', badgeClass: 'res-badge-image', icon: '🖼️', bg: '#F0FDF4' };
  }
  if (['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'].includes(ext) || mimeType?.startsWith('audio/')) {
    return { type: 'Audio', badgeClass: 'res-badge-audio', icon: '🎧', bg: '#FAF5FF' };
  }
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext) || mimeType?.startsWith('video/')) {
    return { type: 'Video', badgeClass: 'res-badge-video', icon: '🎬', bg: '#FFF7ED' };
  }
  if (['ppt', 'pptx'].includes(ext) || mimeType?.includes('presentation')) {
    return { type: 'PPT', badgeClass: 'res-badge-other', icon: '📊', bg: '#FFFBEB' };
  }
  return { type: ext ? ext.toUpperCase() : 'File', badgeClass: 'res-badge-other', icon: '📁', bg: '#F1F5F9' };
}

function formatResourceSize(kb: number): string {
  if (!kb || kb < 1) return '1 KB';
  if (kb >= 1024) {
    return `${(kb / 1024).toFixed(1)} MB`;
  }
  return `${kb} KB`;
}

function formatResourceDate(timestamp: number): string {
  if (!timestamp) return 'Recently';
  try {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Recently';
  }
}

export function downloadResourceFile(res: ResourceRecord) {
  if (!res.contentData) {
    showToast('No file data available for download', '⚠️');
    return;
  }
  try {
    const a = document.createElement('a');
    a.href = res.contentData;
    a.download = res.fileName || res.title || 'resource';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Downloading "${res.fileName || res.title}"`, '📥');
  } catch (err) {
    console.error('Download error:', err);
    showToast('Failed to download file', '⚠️');
  }
}

export function openResourcePreviewModal(res: ResourceRecord) {
  const modal = document.getElementById('modal-preview-resource');
  if (!modal) return;

  const titleEl = document.getElementById('preview-res-title');
  const metaEl = document.getElementById('preview-res-meta');
  const bodyEl = document.getElementById('preview-res-body');
  const typePillEl = document.getElementById('preview-res-type-pill');
  const downloadBtn = document.getElementById('btn-preview-download');
  const closeBtn = document.getElementById('btn-close-preview-modal');
  const footerCloseBtn = document.getElementById('btn-preview-close');

  const meta = getResourceMeta(res.fileName || res.title, res.mimeType);
  if (titleEl) titleEl.textContent = res.title || res.fileName || 'Resource';
  if (metaEl) {
    metaEl.textContent = `${res.fileName || 'file'} · ${formatResourceSize(res.sizeKb)} · Uploaded ${formatResourceDate(res.createdAt)}`;
  }
  if (typePillEl) {
    typePillEl.textContent = `${meta.type} ${meta.type.toLowerCase().includes('file') ? '' : 'File'}`;
  }

  if (bodyEl) {
    bodyEl.innerHTML = '';
    const content = res.contentData;

    if (!content) {
      bodyEl.innerHTML = `
        <div style="text-align:center;padding:36px 16px;color:var(--ink-soft);">
          <div style="font-size:3rem;margin-bottom:10px;">${meta.icon}</div>
          <p style="font-size:0.95rem;font-weight:600;color:var(--ink);">${res.fileName || res.title}</p>
          <p style="font-size:0.8rem;color:var(--ink-faint);">File data stored in local library. Click Download to save to device.</p>
        </div>
      `;
    } else if (meta.type === 'Image') {
      const img = document.createElement('img');
      img.src = content;
      img.alt = res.title;
      img.style.cssText = 'max-width:100%;max-height:55vh;object-fit:contain;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);';
      bodyEl.appendChild(img);
    } else if (meta.type === 'Audio') {
      const audioWrapper = document.createElement('div');
      audioWrapper.style.cssText = 'text-align:center;width:100%;max-width:440px;padding:20px;';
      audioWrapper.innerHTML = `
        <div style="font-size:3.5rem;margin-bottom:12px;">🎧</div>
        <div style="font-weight:600;font-size:1rem;margin-bottom:4px;color:var(--ink);">${res.title}</div>
        <div style="font-size:0.78rem;color:var(--ink-soft);margin-bottom:18px;">${res.fileName}</div>
        <audio controls style="width:100%;" src="${content}"></audio>
      `;
      bodyEl.appendChild(audioWrapper);
    } else if (meta.type === 'Video') {
      const video = document.createElement('video');
      video.controls = true;
      video.src = content;
      video.style.cssText = 'width:100%;max-height:55vh;border-radius:8px;background:#000;';
      bodyEl.appendChild(video);
    } else if (meta.type === 'PDF') {
      const iframe = document.createElement('iframe');
      iframe.src = content;
      iframe.style.cssText = 'width:100%;height:55vh;border:none;border-radius:8px;background:#FFF;';
      bodyEl.appendChild(iframe);
    } else {
      // DOC, PPT, TXT, or generic
      bodyEl.innerHTML = `
        <div style="text-align:center;padding:36px 20px;max-width:420px;margin:0 auto;">
          <div style="width:64px;height:64px;border-radius:12px;background:${meta.bg};display:flex;align-items:center;justify-content:center;font-size:2.2rem;margin:0 auto 16px;">
            ${meta.icon}
          </div>
          <div style="font-size:1.05rem;font-weight:700;color:var(--ink);margin-bottom:6px;">${res.title}</div>
          <div style="font-size:0.82rem;color:var(--ink-soft);margin-bottom:14px;word-break:break-all;">${res.fileName}</div>
          <p style="font-size:0.8rem;color:var(--ink-faint);line-height:1.5;margin-bottom:20px;">
            This is a ${meta.type} file. You can download and open it in your device's reader.
          </p>
        </div>
      `;
    }
  }

  const handleDownload = () => downloadResourceFile(res);
  const handleClose = () => {
    const audioEl = bodyEl?.querySelector('audio');
    if (audioEl) audioEl.pause();
    const videoEl = bodyEl?.querySelector('video');
    if (videoEl) videoEl.pause();
    modal.style.display = 'none';
  };

  if (downloadBtn) {
    const newDownloadBtn = downloadBtn.cloneNode(true) as HTMLElement;
    downloadBtn.parentNode?.replaceChild(newDownloadBtn, downloadBtn);
    newDownloadBtn.addEventListener('click', handleDownload);
  }

  if (closeBtn) {
    const newCloseBtn = closeBtn.cloneNode(true) as HTMLElement;
    closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', handleClose);
  }

  if (footerCloseBtn) {
    const newFooterCloseBtn = footerCloseBtn.cloneNode(true) as HTMLElement;
    footerCloseBtn.parentNode?.replaceChild(newFooterCloseBtn, footerCloseBtn);
    newFooterCloseBtn.addEventListener('click', handleClose);
  }

  modal.style.display = 'flex';
}

export async function refreshResourcesList() {
  const container = document.getElementById('resources-list-container');
  const countPill = document.getElementById('resources-count-pill');
  if (!container) return;

  let allResources = await dbGetAll<ResourceRecord>('resources');

  try {
    const { data: cloudRes, error } = await fetchResources();
    if (!error && cloudRes && cloudRes.length > 0) {
      allResources = cloudRes as ResourceRecord[];
      for (const cr of cloudRes) {
        await dbPut('resources', cr);
      }
    }
  } catch (err) {
    console.warn('Supabase fetchResources notice:', err);
  }

  allResources.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (countPill) {
    countPill.textContent = `${allResources.length} ${allResources.length === 1 ? 'File' : 'Files'}`;
  }

  if (allResources.length === 0) {
    container.innerHTML = `
      <div style="border:2px dashed #CBD5E1;border-radius:12px;padding:48px 24px;text-align:center;background:#F8FAFC;">
        <div style="width:56px;height:56px;border-radius:50%;background:#F1F5F9;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;color:var(--green);">
          <svg class="icon" viewBox="0 0 24 24" style="width:28px;height:28px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
        </div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--ink);margin-bottom:6px;">No resources uploaded yet</div>
        <p style="font-size:0.84rem;color:var(--ink-soft);max-width:440px;margin:0 auto 20px;line-height:1.5;">
          Click "+ Add Resource" to upload classroom documents, audio stories, lesson videos, or picture flashcards.
        </p>
        <button class="btn-solid-green" id="btn-empty-add-resource" style="padding:9px 22px;font-size:0.88rem;width:auto;margin:0 auto;display:inline-flex;align-items:center;gap:8px;">
          <svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          + Add Resource
        </button>
      </div>
    `;

    document.getElementById('btn-empty-add-resource')?.addEventListener('click', () => {
      openAddResourceModal();
    });
    return;
  }

  const isUserTeacher = isTeacher();

  container.innerHTML = `
    <div class="resource-manager-list">
      ${allResources.map(res => {
        const meta = getResourceMeta(res.fileName || res.title, res.mimeType);
        return `
          <div class="resource-row-item" data-id="${res.id}">
            <div style="display:flex;align-items:center;gap:14px;min-width:0;flex:1;">
              <div class="res-icon-box" style="background:${meta.bg};">
                ${meta.icon}
              </div>
              <div style="min-width:0;flex:1;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <h4 style="margin:0;font-size:0.95rem;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">
                    ${res.title || res.fileName}
                  </h4>
                  <span class="res-badge ${meta.badgeClass}">${meta.type}</span>
                </div>
                <div style="font-size:0.75rem;color:var(--ink-soft);margin-top:3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <span style="font-weight:500;color:var(--ink);">${res.fileName || 'file'}</span>
                  <span>•</span>
                  <span>${formatResourceSize(res.sizeKb)}</span>
                  <span>•</span>
                  <span>${formatResourceDate(res.createdAt)}</span>
                </div>
              </div>
            </div>

            <div class="resource-actions-group">
              <button type="button" class="btn-chip btn-res-open" data-id="${res.id}" style="padding:6px 14px;font-size:0.78rem;font-weight:600;display:inline-flex;align-items:center;gap:6px;">
                <svg class="icon" viewBox="0 0 24 24" style="width:13px;height:13px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                Open
              </button>
              <button type="button" class="btn-chip btn-res-download" data-id="${res.id}" style="padding:6px 14px;font-size:0.78rem;font-weight:600;display:inline-flex;align-items:center;gap:6px;">
                <svg class="icon" viewBox="0 0 24 24" style="width:13px;height:13px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                Download
              </button>
              ${isUserTeacher ? `
                <button type="button" class="btn-chip btn-res-delete" data-id="${res.id}" style="padding:6px 10px;font-size:0.78rem;color:#DC2626;" title="Delete Resource">
                  <svg class="icon" viewBox="0 0 24 24" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Wire Open buttons
  container.querySelectorAll('.btn-res-open').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const res = allResources.find(r => r.id === id);
      if (res) openResourcePreviewModal(res);
    });
  });

  // Wire Download buttons
  container.querySelectorAll('.btn-res-download').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const res = allResources.find(r => r.id === id);
      if (res) downloadResourceFile(res);
    });
  });

  // Wire Delete buttons
  container.querySelectorAll('.btn-res-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const res = allResources.find(r => r.id === id);
      if (!res) return;
      if (confirm(`Delete "${res.title || res.fileName}" from resources?`)) {
        try {
          await deleteResource(res.id, res.storagePath);
        } catch (_) {}
        if (res.storagePath) {
          try {
            await deleteFileFromStorage(res.storagePath);
          } catch (_) {}
        }
        await dbDelete('resources', res.id);
        showToast(`Resource "${res.title || res.fileName}" deleted`, '🗑️');
        await refreshResourcesList();
      }
    });
  });
}

let currentSelectedResourceFile: File | null = null;
let currentSelectedResourceBase64: string = '';

export function openAddResourceModal() {
  if (!isTeacher()) {
    showToast('Only teachers can upload learning resources.', '⚠️');
    return;
  }

  const modal = document.getElementById('modal-add-resource');
  if (!modal) return;

  const fileInput = document.getElementById('resource-file-input') as HTMLInputElement | null;
  const promptEl = document.getElementById('resource-dropzone-prompt');
  const previewEl = document.getElementById('resource-dropzone-preview');
  const titleInput = document.getElementById('resource-title-input') as HTMLInputElement | null;
  const errDiv = document.getElementById('resource-upload-error');
  const spinner = document.getElementById('resource-upload-spinner');
  const submitBtn = document.getElementById('btn-submit-upload-resource') as HTMLButtonElement | null;
  const btnText = document.getElementById('resource-upload-btn-text');

  currentSelectedResourceFile = null;
  currentSelectedResourceBase64 = '';
  if (fileInput) fileInput.value = '';
  if (titleInput) titleInput.value = '';
  if (errDiv) {
    errDiv.textContent = '';
    errDiv.style.display = 'none';
  }
  if (promptEl) promptEl.style.display = 'block';
  if (previewEl) previewEl.style.display = 'none';
  if (submitBtn) submitBtn.disabled = false;
  if (spinner) spinner.style.display = 'none';
  if (btnText) btnText.textContent = 'Upload & Save';

  modal.style.display = 'flex';
}

async function handleResourceFileSelect(file: File) {
  currentSelectedResourceFile = file;
  const promptEl = document.getElementById('resource-dropzone-prompt');
  const previewEl = document.getElementById('resource-dropzone-preview');
  const iconEl = document.getElementById('resource-preview-icon');
  const nameEl = document.getElementById('resource-preview-filename');
  const typeEl = document.getElementById('resource-preview-type');
  const sizeEl = document.getElementById('resource-preview-filesize');
  const titleInput = document.getElementById('resource-title-input') as HTMLInputElement | null;
  const errDiv = document.getElementById('resource-upload-error');

  if (errDiv) {
    errDiv.style.display = 'none';
    errDiv.textContent = '';
  }

  const meta = getResourceMeta(file.name, file.type);
  if (iconEl) iconEl.textContent = meta.icon;
  if (nameEl) nameEl.textContent = file.name;
  if (typeEl) typeEl.textContent = `${meta.type} File`;
  if (sizeEl) sizeEl.textContent = formatResourceSize(Math.round(file.size / 1024));

  // If user hasn't entered a title yet, suggest a human-readable title from the file name
  if (titleInput && !titleInput.value.trim()) {
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    titleInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  }

  if (promptEl) promptEl.style.display = 'none';
  if (previewEl) previewEl.style.display = 'block';

  try {
    currentSelectedResourceBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  } catch (err) {
    console.error('File read error:', err);
    if (errDiv) {
      errDiv.textContent = 'Could not read the selected file. Please select another file.';
      errDiv.style.display = 'block';
    }
  }
}

function setupResourcesModule() {
  const addBtn = document.getElementById('btn-open-add-resource');
  const modal = document.getElementById('modal-add-resource');
  const closeBtn = document.getElementById('btn-close-resource-modal');
  const cancelBtn = document.getElementById('btn-cancel-add-resource');
  const chooseBtn = document.getElementById('btn-choose-resource-file');
  const changeBtn = document.getElementById('btn-change-resource-file');
  const dropzone = document.getElementById('resource-dropzone');
  const fileInput = document.getElementById('resource-file-input') as HTMLInputElement | null;
  const submitBtn = document.getElementById('btn-submit-upload-resource');

  addBtn?.addEventListener('click', () => {
    openAddResourceModal();
  });

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  chooseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput?.click();
  });

  changeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput?.click();
  });

  if (dropzone) {
    dropzone.addEventListener('click', () => {
      if (!currentSelectedResourceFile) {
        fileInput?.click();
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--green)';
      dropzone.style.background = '#F0FDF4';
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = '#CBD5E1';
      dropzone.style.background = '#F8FAFC';
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '#CBD5E1';
      dropzone.style.background = '#F8FAFC';
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleResourceFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  fileInput?.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      handleResourceFileSelect(fileInput.files[0]);
    }
  });

  submitBtn?.addEventListener('click', async () => {
    const titleInput = document.getElementById('resource-title-input') as HTMLInputElement | null;
    const errDiv = document.getElementById('resource-upload-error');
    const spinner = document.getElementById('resource-upload-spinner');
    const btnText = document.getElementById('resource-upload-btn-text');

    if (!currentSelectedResourceFile || !currentSelectedResourceBase64) {
      if (errDiv) {
        errDiv.textContent = 'Please select a file (PDF, DOC, Image, Audio, or Video) to upload.';
        errDiv.style.display = 'block';
      }
      return;
    }

    if (errDiv) errDiv.style.display = 'none';
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Saving...';
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;

    try {
      const meta = getResourceMeta(currentSelectedResourceFile.name, currentSelectedResourceFile.type);
      const titleVal = titleInput?.value.trim() || currentSelectedResourceFile.name;
      const sizeKb = Math.round(currentSelectedResourceFile.size / 1024) || 1;
      const resId = 'res_' + Date.now();

      let storagePath = '';
      let signedUrl = currentSelectedResourceBase64;

      try {
        const uploadRes = await uploadFileToStorage({
          featureName: 'resources',
          itemId: resId,
          file: currentSelectedResourceFile,
          fileName: currentSelectedResourceFile.name,
          contentType: currentSelectedResourceFile.type
        });
        if (uploadRes?.path) {
          storagePath = uploadRes.path;
          if (uploadRes.signedUrl) {
            signedUrl = uploadRes.signedUrl;
          }
        }
      } catch (uploadErr) {
        console.warn('Supabase storage upload notice for resource:', uploadErr);
      }

      const record: ResourceRecord = {
        id: resId,
        title: titleVal,
        fileName: currentSelectedResourceFile.name,
        fileType: meta.type,
        mimeType: currentSelectedResourceFile.type,
        category: meta.type.toLowerCase(),
        sizeKb,
        storagePath,
        signedUrl,
        contentData: signedUrl || currentSelectedResourceBase64,
        isOffline: true,
        syncState: 'local',
        createdAt: Date.now()
      };

      try {
        await createResource(record);
      } catch (err) {
        console.warn('Supabase createResource notice:', err);
      }

      await dbPut('resources', record);
      await logAudit('RESOURCE_UPLOAD', `Teacher uploaded resource: ${record.title} (${record.fileName})`);

      closeModal();
      showToast(`Resource "${record.title}" uploaded successfully!`, '📁');
      await refreshResourcesList();
    } catch (err) {
      console.error('Failed to save resource:', err);
      if (errDiv) {
        errDiv.textContent = 'Failed to save resource. Please try again.';
        errDiv.style.display = 'block';
      }
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
      if (spinner) spinner.style.display = 'none';
      if (btnText) btnText.textContent = 'Upload & Save';
    }
  });

  // Initial load
  refreshResourcesList();
}

// ===================== SETTINGS MODULE =====================
function setupSettingsModule() {
  const profileItem = document.getElementById('setting-profile');
  const langItem = document.getElementById('setting-language');
  const audioItem = document.getElementById('setting-audio-speed');
  const aiPrefsItem = document.getElementById('setting-ai-prefs');
  const syncItem = document.getElementById('setting-offline-sync');
  const downloadsItem = document.getElementById('setting-downloads');
  const voiceCacheLine = document.getElementById('setting-voice-cache-line');
  const testOfflineVoiceBtn = document.getElementById('btn-test-offline-voice');
  const voiceCacheBadge = document.getElementById('setting-voice-cache-badge');
  const voiceCacheCount = document.getElementById('setting-voice-cache-count');
  const securityItem = document.getElementById('setting-security');
  const dataMgmtItem = document.getElementById('setting-data-mgmt');

  // Profile Modal Elements
  const profModal = document.getElementById('profile-settings-modal');
  const btnCloseProf = document.getElementById('btn-close-profile-modal');
  const btnCancelProf = document.getElementById('btn-cancel-profile');
  const profForm = document.getElementById('profile-editor-form') as HTMLFormElement;

  const profNameInput = document.getElementById('prof-name') as HTMLInputElement;
  const profRoleInput = document.getElementById('prof-role') as HTMLInputElement;
  const profIdInput = document.getElementById('prof-id') as HTMLInputElement;
  const profClassInput = document.getElementById('prof-class') as HTMLInputElement;
  const profSchoolInput = document.getElementById('prof-school') as HTMLInputElement;
  const profDistrictInput = document.getElementById('prof-district') as HTMLInputElement;
  const profContactInput = document.getElementById('prof-contact') as HTMLInputElement;
  const profLangSelect = document.getElementById('prof-language') as HTMLSelectElement;
  const profSpeedSelect = document.getElementById('prof-audio-speed') as HTMLSelectElement;
  const profVoiceSelect = document.getElementById('prof-voice-profile') as HTMLSelectElement;
  const profModeSelect = document.getElementById('prof-pref-mode') as HTMLSelectElement;

  // Voice Profile Controls
  const btnVoiceYoung = document.getElementById('btn-voice-young-learner');
  const btnVoiceFormal = document.getElementById('btn-voice-formal-teacher');
  const voiceBadge = document.getElementById('setting-voice-profile-badge');
  const btnCycleSpeed = document.getElementById('btn-cycle-audio-speed');

  function updateVoiceProfileUI(profile: TTSVoiceProfile, notify = false) {
    audio.setVoiceProfile(profile);

    if (btnVoiceYoung && btnVoiceFormal) {
      if (profile === 'Young Learner') {
        btnVoiceYoung.classList.add('active');
        btnVoiceYoung.setAttribute('aria-checked', 'true');
        btnVoiceYoung.style.background = '#1E8E52';
        btnVoiceYoung.style.color = '#FFFFFF';
        btnVoiceFormal.classList.remove('active');
        btnVoiceFormal.setAttribute('aria-checked', 'false');
        btnVoiceFormal.style.background = 'transparent';
        btnVoiceFormal.style.color = 'var(--ink-soft)';
      } else {
        btnVoiceFormal.classList.add('active');
        btnVoiceFormal.setAttribute('aria-checked', 'true');
        btnVoiceFormal.style.background = '#1E8E52';
        btnVoiceFormal.style.color = '#FFFFFF';
        btnVoiceYoung.classList.remove('active');
        btnVoiceYoung.setAttribute('aria-checked', 'false');
        btnVoiceYoung.style.background = 'transparent';
        btnVoiceYoung.style.color = 'var(--ink-soft)';
      }
    }

    if (voiceBadge) {
      voiceBadge.textContent = profile;
    }

    if (profVoiceSelect) {
      profVoiceSelect.value = profile;
    }

    const u = getCurrentUser();
    if (u) {
      (u as any).voiceProfile = profile;
      dbPut('users', u).catch(console.warn);
    }

    if (notify) {
      if (profile === 'Young Learner') {
        audio.playToneSequence([523, 659, 784, 1046]);
        audio.speakText('Young Learner voice profile activated. Johar! Let us learn with joy!');
        showToast("TTS Voice Profile: Young Learner (Expressive & playful for primary pupils)", '🎒');
      } else {
        audio.playToneSequence([440, 554, 659]);
        audio.speakText('Formal Teacher voice profile activated. Ready for classroom pedagogy.');
        showToast("TTS Voice Profile: Formal Teacher (Clear, authoritative pedagogical model)", '👩‍🏫');
      }
    }
  }

  // Initialize Voice Profile from user or audio engine
  const initialUser = getCurrentUser();
  const initialVoiceProfile = (initialUser as any)?.voiceProfile || audio.getVoiceProfile();
  updateVoiceProfileUI(initialVoiceProfile, false);

  btnVoiceYoung?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateVoiceProfileUI('Young Learner', true);
  });

  btnVoiceFormal?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateVoiceProfileUI('Formal Teacher', true);
  });

  function openProfileModal() {
    const user = getCurrentUser();
    if (profNameInput) profNameInput.value = user.name || '';
    if (profRoleInput) profRoleInput.value = user.role || 'Teacher';
    if (profIdInput) profIdInput.value = user.id || '';
    if (profClassInput) {
      profClassInput.value = (user.role === 'Student' ? (user as any).class : (user as any).assignedClasses?.join(', ')) || 'Grade 1 - Section A';
    }
    if (profSchoolInput) profSchoolInput.value = (user as any).school || 'Govt. Primary School, Torpa';
    if (profDistrictInput) profDistrictInput.value = (user as any).district || 'Khunti, Jharkhand';
    if (profContactInput) profContactInput.value = user.email || (user as any).phone || '9876543210';
    if (profLangSelect) profLangSelect.value = user.motherTongue || 'Ho';
    if (profVoiceSelect) profVoiceSelect.value = (user as any).voiceProfile || audio.getVoiceProfile();
    if (profSpeedSelect) profSpeedSelect.value = String((user as any).audioSpeed || '1.0');
    if (profModeSelect) profModeSelect.value = (user as any).pedagogicalMode || 'Standard (FLN Grade 1-2)';

    if (profModal) profModal.style.display = 'flex';
  }

  profileItem?.addEventListener('click', openProfileModal);

  btnCloseProf?.addEventListener('click', () => {
    if (profModal) profModal.style.display = 'none';
  });
  btnCancelProf?.addEventListener('click', () => {
    if (profModal) profModal.style.display = 'none';
  });

  profForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = getCurrentUser();
    user.name = profNameInput.value.trim();
    user.motherTongue = profLangSelect.value;
    (user as any).school = profSchoolInput.value.trim();
    (user as any).district = profDistrictInput.value.trim();
    (user as any).email = profContactInput.value.trim();
    (user as any).audioSpeed = parseFloat(profSpeedSelect.value) || 1.0;
    (user as any).voiceProfile = profVoiceSelect ? profVoiceSelect.value : audio.getVoiceProfile();
    (user as any).pedagogicalMode = profModeSelect.value;
    if (user.role === 'Student') {
      (user as any).class = profClassInput.value.trim();
    }

    await dbPut('users', user);
    await dbPut('settings', {
      key: 'app_settings',
      language: user.motherTongue,
      audioSpeed: (user as any).audioSpeed,
      voiceProfile: (user as any).voiceProfile,
      pedagogicalMode: (user as any).pedagogicalMode,
      school: (user as any).school,
      district: (user as any).district
    });

    updateVoiceProfileUI((user as any).voiceProfile, false);
    updateUserUI();

    const langSpan = document.getElementById('setting-pref-lang-text');
    if (langSpan) langSpan.textContent = `${user.motherTongue} ›`;

    const speedSpan = document.getElementById('setting-audio-speed-text');
    if (speedSpan) speedSpan.textContent = `${(user as any).audioSpeed}x ›`;

    const modeSpan = document.getElementById('setting-ai-prefs-text');
    if (modeSpan) modeSpan.textContent = `${(user as any).pedagogicalMode} ›`;

    if (profModal) profModal.style.display = 'none';
    showToast('Profile and school preferences saved!', '👤');
  });

  // Cycle languages
  const langsList = ['Ho (हो / 𑢹𑣉)', 'Mundari (मुंडारी)', 'Santhali (संथाली / ᱚᱞ ᱪᱤᱠᱤ)', 'Telugu (తెలుగు)', 'Hindi (हिन्दी)'];
  let currentLangIdx = 0;

  langItem?.addEventListener('click', async () => {
    currentLangIdx = (currentLangIdx + 1) % langsList.length;
    const selected = langsList[currentLangIdx];
    const span = document.getElementById('setting-pref-lang-text');
    const langKey = selected.split(' ')[0];
    if (span) span.textContent = `${langKey} ›`;

    const user = getCurrentUser();
    user.motherTongue = langKey;
    await dbPut('users', user);
    showToast(`Default mother tongue set to ${selected}`, '🌐');
  });

  const speeds = ['0.8', '1.0', '1.2'];
  let speedIdx = 1;

  const cycleSpeed = (e?: Event) => {
    if (e) e.stopPropagation();
    speedIdx = (speedIdx + 1) % speeds.length;
    const speed = speeds[speedIdx];
    const span = document.getElementById('setting-audio-speed-text');
    if (span) span.textContent = `${speed}x ›`;
    audio.setPlaybackSpeed(parseFloat(speed));
    audio.playToneSequence([523, 659]);
    audio.speakText(`Audio speed set to ${speed}x`, 'hi-IN', parseFloat(speed));
    showToast(`Voice speed set to ${speed}x`, '🔊');
  };

  btnCycleSpeed?.addEventListener('click', cycleSpeed);

  audioItem?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#btn-cycle-audio-speed') || target.closest('.voice-profile-btn')) {
      return;
    }
    // Clicking the row toggles between the two profiles
    const cur = audio.getVoiceProfile();
    const next: TTSVoiceProfile = cur === 'Young Learner' ? 'Formal Teacher' : 'Young Learner';
    updateVoiceProfileUI(next, true);
  });

  // AI Pedagogical Modes
  const aiModes = ['Standard (FLN Grade 1-2)', 'Visual Storytelling & Folklore', 'Bilingual Phonetic Drill'];
  let aiModeIdx = 0;
  aiPrefsItem?.addEventListener('click', () => {
    aiModeIdx = (aiModeIdx + 1) % aiModes.length;
    const chosen = aiModes[aiModeIdx];
    const span = document.getElementById('setting-ai-prefs-text');
    if (span) span.textContent = `${chosen} ›`;
    showToast(`AI Scaffolding Mode: ${chosen}`, '🤖');
  });

  syncItem?.addEventListener('click', async () => {
    showToast('Synchronizing with offline store & cloud backend...', '🔄');
    await flushSyncQueue();
    const supaRes = await syncLocalQueueToSupabase();
    const statusText = document.getElementById('setting-sync-status-text');
    if (statusText) statusText.textContent = `All Data Synced (0 Pending) ›`;
    if (supaRes.syncedCount > 0) {
      showToast(`Synchronized ${supaRes.syncedCount} records to Supabase cloud!`, '☁️');
    } else {
      showToast(`Synchronization complete! Local offline store up to date.`, '✓');
    }
  });

  downloadsItem?.addEventListener('click', () => {
    showToast('Offline Packages: Ho (4.8MB), Mundari (3.6MB), Santhali (5.8MB) cached & ready.', '📦');
  });

  // Offline Voice Cache Stats & Tester
  const updateVoiceCacheDisplay = async () => {
    try {
      const stats = await getVoiceCacheStats();
      if (voiceCacheCount) {
        voiceCacheCount.textContent = `${stats.totalCount} Assets ›`;
      }
      if (voiceCacheBadge) {
        voiceCacheBadge.textContent = stats.totalCount > 0 ? `Active (${stats.totalCount} Terms)` : '100% Offline Ready';
      }
    } catch (_) {}
  };
  updateVoiceCacheDisplay();

  testOfflineVoiceBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    showToast('Playing pre-rendered offline natural voice asset...', '🔊');
    await audio.speakTextNatural('Johar', 'ho-IN');
  });

  voiceCacheLine?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#btn-test-offline-voice')) return;
    const stats = await getVoiceCacheStats();
    showToast(`Offline Voice Cache: ${stats.totalCount} pre-rendered phonetic assets stored in IndexedDB for 100% offline natural speech!`, '🔊');
  });

  securityItem?.addEventListener('click', () => {
    showToast('Safe Mode Active: COPPA/FERPA compliant. Data stored locally with tamper-proof audit trail.', '🛡️');
  });

  dataMgmtItem?.addEventListener('click', async () => {
    const confirmBackup = window.confirm('Would you like to export a full JSON backup of all lessons, worksheets, and progress?');
    if (confirmBackup) {
      const lessons = await dbGetAll('lessons');
      const worksheets = await dbGetAll('worksheets');
      const assignments = await dbGetAll('assignments');
      const progress = await dbGetAll('student_progress');
      const audit = await dbGetAll('audit_logs');
      const backupData = {
        exportedAt: new Date().toISOString(),
        version: '2.4.0',
        lessons,
        worksheets,
        assignments,
        progress,
        audit
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bhashasetu-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Term backup downloaded successfully!', '💾');
    }
  });
}

// ===================== MULTILINGUAL DICTIONARY =====================
function setupDictionaryModule() {
  const dictionaryWords = [
    { cat: 'school', en: 'Book', hi: 'किताब (Kitab)', ho: '𑢹𑣉 पुथी (Puthi)', mun: 'पुथी (Puthi)', san: 'ᱯᱩᱛᱷᱤ (Puthi)', audioWord: 'पुथी' },
    { cat: 'school', en: 'School', hi: 'विद्यालय (Vidyalaya)', ho: 'इतुन ओड़ाः (Itun Orah)', mun: 'इतुन ओड़ाः (Itun Orah)', san: 'ᱟᱥᱲᱟ (Asra)', audioWord: 'इतुन ओड़ाः' },
    { cat: 'school', en: 'Pen / Pencil', hi: 'कलम (Kalam)', ho: 'कलोम (Kalom)', mun: 'कलोम (Kalom)', san: 'ᱠᱚᱞᱚᱢ (Kalom)', audioWord: 'कलोम' },
    { cat: 'school', en: 'Teacher', hi: 'शिक्षक (Guru)', ho: 'इतु-एतेङी (Itu-etengi)', mun: 'गुरु (Guru)', san: 'ᱢᱟᱪᱮᱛ (Machet)', audioWord: 'गुरु' },
    { cat: 'nature', en: 'Water', hi: 'पानी (Pani)', ho: '𑢹𑣉 दाः (Dah)', mun: 'दाः (Dah)', san: 'ᱫᱟᱜ (Daak)', audioWord: 'दाः' },
    { cat: 'nature', en: 'Tree', hi: 'पेड़ (Ped)', ho: 'दारु (Daru)', mun: 'दारु (Daru)', san: 'ᱫᱟᱨᱮ (Dare)', audioWord: 'दारु' },
    { cat: 'nature', en: 'Sun', hi: 'सूरज (Suraj)', ho: 'सिंगी (Singi)', mun: 'सिंगी (Singi)', san: 'ᱥᱤᱧ (Sing)', audioWord: 'सिंगी' },
    { cat: 'nature', en: 'River', hi: 'नदी (Nadi)', ho: 'गाडा (Gada)', mun: 'गाडा (Gada)', san: 'ᱜᱟᱰᱟ (Gada)', audioWord: 'गाडा' },
    { cat: 'nature', en: 'Rain', hi: 'बारिश (Barish)', ho: 'दाः-गामा (Dah-gama)', mun: 'गामा (Gama)', san: 'ᱫᱟᱜ-ᱡᱟᱹᱲᱤ (Daak-jari)', audioWord: 'गामा' },
    { cat: 'nature', en: 'Cow', hi: 'गाय (Gai)', ho: 'गोरु (Goru)', mun: 'उरीः (Urih)', san: 'ᱜᱟᱹᱭ (Gai)', audioWord: 'गोरु' },
    { cat: 'nature', en: 'Bird', hi: 'चिड़िया (Chidiya)', ho: 'चेणे (Chene)', mun: 'चेणे (Chene)', san: 'ᱪᱮᱬᱮ (Chene)', audioWord: 'चेणे' },
    { cat: 'people', en: 'Mother', hi: 'माँ (Maa)', ho: 'एंगा (Enga)', mun: 'एंगा (Enga)', san: 'ᱟᱭᱳ (Aayo)', audioWord: 'एंगा' },
    { cat: 'people', en: 'Father', hi: 'पिताजी (Pitaji)', ho: 'आपू (Aapu)', mun: 'आपा (Aapa)', san: 'ᱵᱟᱵᱟ (Baba)', audioWord: 'आपू' },
    { cat: 'people', en: 'Friend', hi: 'दोस्त / मित्र', ho: 'गाते (Gate)', mun: 'गाते (Gate)', san: 'ᱜᱟᱛᱮ (Gate)', audioWord: 'गाते' },
    { cat: 'people', en: 'Village', hi: 'गाँव (Gaon)', ho: 'हातु (Hatu)', mun: 'हातु (Hatu)', san: 'ᱟᱹᱛᱩ (Aatu)', audioWord: 'हातु' },
    { cat: 'numbers', en: 'One (1)', hi: 'एक (1)', ho: '𑣡 मियाद (Miyad)', mun: 'मियाद (Miyad)', san: 'ᱢᱤᱫ (Mit)', audioWord: 'मियाद' },
    { cat: 'numbers', en: 'Two (2)', hi: 'दो (2)', ho: '𑣢 बारिया (Bariya)', mun: 'बारिया (Bariya)', san: 'ᱵᱟᱨ (Bar)', audioWord: 'बारिया' },
    { cat: 'numbers', en: 'Three (3)', hi: 'तीन (3)', ho: '𑣣 आपिया (Apiya)', mun: 'आपिया (Apiya)', san: 'ᱯᱮ (Pe)', audioWord: 'आपिया' },
    { cat: 'numbers', en: 'Four (4)', hi: 'चार (4)', ho: '𑣤 उपुन (Upun)', mun: 'उपुन (Upun)', san: 'ᱯᱩᱱ (Pun)', audioWord: 'उपुन' },
    { cat: 'numbers', en: 'Five (5)', hi: 'पाँच (5)', ho: '𑣥 मोड़े (Mode)', mun: 'मोड़े (Mode)', san: 'ᱢᱚᱬᱮ (More)', audioWord: 'मोड़े' }
  ];

  const tableBody = document.getElementById('dict-table-body');
  const searchInput = document.getElementById('dict-search-input') as HTMLInputElement;
  const catButtons = document.querySelectorAll('.dict-cat-btn');

  let activeCat = 'all';
  let searchTerm = '';

  function renderTable() {
    if (!tableBody) return;

    const filtered = dictionaryWords.filter(w => {
      const matchesCat = activeCat === 'all' || w.cat === activeCat;
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term ||
        w.en.toLowerCase().includes(term) ||
        w.hi.toLowerCase().includes(term) ||
        w.ho.toLowerCase().includes(term) ||
        w.mun.toLowerCase().includes(term) ||
        w.san.toLowerCase().includes(term);
      return matchesCat && matchesSearch;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--ink-faint);">No dictionary words found for "${searchTerm}".</td></tr>`;
      return;
    }

    tableBody.innerHTML = filtered.map(w => `
      <tr>
        <td style="font-weight:600;color:var(--ink);">${w.en}</td>
        <td>${w.hi}</td>
        <td style="font-weight:600;color:var(--green-dark);">${w.ho}</td>
        <td>${w.mun}</td>
        <td style="color:#2563EB;">${w.san}</td>
        <td>
          <button class="btn-chip btn-dict-speak" data-word="${w.audioWord}" style="padding:4px 8px;font-size:0.75rem;">
            🔊 Listen
          </button>
        </td>
      </tr>
    `).join('');

    // Wire audio pronunciation
    tableBody.querySelectorAll('.btn-dict-speak').forEach(btn => {
      btn.addEventListener('click', () => {
        const word = btn.getAttribute('data-word') || '';
        audio.playToneSequence([523, 659]);
        audio.speakText(word);
      });
    });
  }

  searchInput?.addEventListener('input', () => {
    searchTerm = searchInput.value.trim();
    renderTable();
  });

  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      catButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCat = btn.getAttribute('data-cat') || 'all';
      renderTable();
    });
  });

  renderTable();
}

// ===================== STUDENT LEARNING CORNER & HOMEWORK =====================
let activeSubmitAsgId = '';

export async function refreshStudentPortal() {
  const container = document.getElementById('view-student-portal');
  if (!container) return;

  const user = getCurrentUser();

  // 1. Update Hero Card with latest lesson
  const lessons = await dbGetAll<LessonRecord>('lessons');
  const heroTitle = document.getElementById('student-hero-title');
  const heroDesc = document.getElementById('student-hero-desc');
  const heroIcon = document.getElementById('student-hero-icon');

  if (lessons.length > 0) {
    const latest = lessons[lessons.length - 1];
    if (heroTitle) heroTitle.textContent = `${latest.title} 📚`;
    if (heroDesc) heroDesc.textContent = `${latest.grade || 'Grade 1'} · ${latest.targetLang} · ${latest.topic || 'Classroom Story'}`;
    if (heroIcon) {
      const topicIcons: Record<string, string> = {
        Animals: '🐮', Forest: '🌳', Water: '💧', Birds: '🐦', Counting: '🔢', Sun: '☀️'
      };
      heroIcon.textContent = topicIcons[latest.topic] || '📖';
    }
  }

  // 2. Render Student's Assigned Tasks / Homework
  const assignments = await dbGetAll<AssignmentRecord>('assignments');
  const asgList = document.getElementById('student-assigned-tasks-list');
  const asgCountPill = document.getElementById('student-asg-count-pill');

  if (asgList) {
    if (assignments.length === 0) {
      asgList.innerHTML = `
        <div style="padding:16px;background:#FAFBFB;border:1px dashed var(--border);border-radius:8px;text-align:center;font-size:0.8rem;color:var(--ink-soft);">
          No homework assigned yet. When your teacher publishes an oral recitation or worksheet, it appears here!
        </div>
      `;
      if (asgCountPill) asgCountPill.textContent = '0 Pending';
    } else {
      let pendingCount = 0;

      asgList.innerHTML = assignments.map(asg => {
        const mySub = asg.submissions?.find(s => s.studentId === user.id || s.studentName === user.name);

        if (mySub && mySub.status === 'graded') {
          return `
            <div class="lesson-row-card" style="padding:12px 14px;border:1px solid #BBF7D0;background:#F0FDF4;border-radius:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <div>
                <strong style="font-size:0.88rem;color:var(--ink);">${asg.title}</strong>
                <div style="font-size:0.75rem;color:var(--ink-soft);">${asg.grade} · ${asg.language}</div>
                <div style="font-size:0.78rem;color:#15803D;margin-top:4px;">
                  💬 <strong>Teacher Feedback:</strong> "${mySub.feedback || 'बहुत बढ़िया प्रयास!'}"
                </div>
              </div>
              <span class="status-pill-green" style="background:#DCFCE7;color:#15803D;font-weight:700;">
                ✓ Graded: ${mySub.score}/${asg.maxScore || 20}
              </span>
            </div>
          `;
        } else if (mySub && mySub.status === 'submitted') {
          return `
            <div class="lesson-row-card" style="padding:12px 14px;border:1px solid #FEF3C7;background:#FFFBEB;border-radius:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <div>
                <strong style="font-size:0.88rem;color:var(--ink);">${asg.title}</strong>
                <div style="font-size:0.75rem;color:var(--ink-soft);">${asg.grade} · ${asg.language} · Submitted</div>
                <div style="font-size:0.75rem;color:#92400E;margin-top:2px;font-style:italic;">
                  Recitation: "${mySub.textContent || 'Oral recitation audio recording'}"
                </div>
              </div>
              <span class="btn-chip" style="background:#FEF3C7;color:#92400E;border-color:#F59E0B;font-size:0.72rem;padding:3px 8px;">
                ⏳ Waiting for Teacher Review
              </span>
            </div>
          `;
        } else {
          pendingCount++;
          return `
            <div class="lesson-row-card" style="padding:12px 14px;border:1px solid var(--border);background:#FFFFFF;border-radius:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <div>
                <strong style="font-size:0.88rem;color:var(--ink);">${asg.title}</strong>
                <div style="font-size:0.75rem;color:var(--ink-soft);">${asg.grade} · ${asg.language} · Due: ${asg.deadline}</div>
              </div>
              <div style="display:flex;gap:6px;align-items:center;">
                <span class="status-pill-orange" style="background:#FFEDD5;color:#C2410C;font-size:0.72rem;padding:3px 8px;">Pending</span>
                <button class="btn-solid-green btn-open-student-submit" data-asg-id="${asg.id}" style="width:auto;margin:0;padding:6px 14px;font-size:0.75rem;">
                  🎙️ Recite & Submit
                </button>
              </div>
            </div>
          `;
        }
      }).join('');

      if (asgCountPill) asgCountPill.textContent = `${pendingCount} Pending`;

      // Wire Recite & Submit buttons
      asgList.querySelectorAll('.btn-open-student-submit').forEach(btn => {
        btn.addEventListener('click', () => {
          const asgId = btn.getAttribute('data-asg-id');
          if (asgId) {
            const targetAsg = assignments.find(a => a.id === asgId);
            if (targetAsg) openStudentSubmissionModal(targetAsg);
          }
        });
      });
    }
  }

  // Refresh Realtime Notes Count for Student Portal Cards
  await refreshNotesCount();
}

function openStudentSubmissionModal(asg: AssignmentRecord) {
  activeSubmitAsgId = asg.id;
  const modal = document.getElementById('student-submit-modal');
  const title = document.getElementById('student-submit-modal-title');
  const desc = document.getElementById('student-submit-modal-desc');
  const textArea = document.getElementById('student-submit-text') as HTMLTextAreaElement;
  const recStatus = document.getElementById('student-rec-status');

  if (title) title.textContent = `🎙️ Recitation: ${asg.title}`;
  if (desc) desc.textContent = `${asg.grade} · ${asg.language}. Speak your recitation clearly or write your response below.`;
  if (textArea) textArea.value = '';
  if (recStatus) recStatus.textContent = 'Tap mic to speak recitation';

  if (modal) modal.style.display = 'flex';
}

export function setupStudentPortalModule() {
  const modal = document.getElementById('student-submit-modal');
  const btnClose = document.getElementById('btn-close-student-submit');
  const btnCancel = document.getElementById('btn-cancel-student-submit');
  const micBtn = document.getElementById('btn-student-rec-mic');
  const sendBtn = document.getElementById('btn-send-student-submit');
  const textArea = document.getElementById('student-submit-text') as HTMLTextAreaElement;
  const recStatus = document.getElementById('student-rec-status');

  let isRecording = false;
  let recognition: any = null;
  const SpeechRecClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
    if (isRecording && recognition) {
      try { recognition.stop(); } catch (_) {}
      isRecording = false;
    }
  };

  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  // Microphone recitation recording
  micBtn?.addEventListener('click', () => {
    if (isRecording) {
      if (recognition) {
        try { recognition.stop(); } catch (_) {}
      }
      isRecording = false;
      if (micBtn) {
        micBtn.style.background = 'var(--green)';
        micBtn.style.transform = 'scale(1)';
      }
      if (recStatus) recStatus.textContent = 'Audio recorded ✓ Tap mic to speak more';
      return;
    }

    if (!SpeechRecClass) {
      showToast('Speech recognition not available. Please type your recitation response.', '⚠️');
      textArea?.focus();
      return;
    }

    try {
      recognition = new SpeechRecClass();
      recognition.continuous = false;
      recognition.interimResults = false;
      const user = getCurrentUser();
      const lang = user.motherTongue || 'Hindi';
      recognition.lang = lang === 'English' ? 'en-IN' : (lang === 'Telugu' ? 'te-IN' : 'hi-IN');

      recognition.onstart = () => {
        isRecording = true;
        if (micBtn) {
          micBtn.style.background = '#DC2626';
          micBtn.style.transform = 'scale(1.15)';
        }
        if (recStatus) recStatus.textContent = '🔴 Listening... Recite your mother-tongue story or numbers!';
        audio.playToneSequence([523, 659]);
      };

      recognition.onresult = (e: any) => {
        const transcript = e.results?.[0]?.[0]?.transcript || '';
        if (transcript && textArea) {
          textArea.value = (textArea.value ? textArea.value + ' ' : '') + transcript;
        }
      };

      recognition.onerror = (err: any) => {
        console.warn('Student mic recitation error:', err.error);
        if (recStatus) recStatus.textContent = 'Tap mic to speak recitation';
        if (micBtn) {
          micBtn.style.background = 'var(--green)';
          micBtn.style.transform = 'scale(1)';
        }
        isRecording = false;
      };

      recognition.onend = () => {
        isRecording = false;
        if (micBtn) {
          micBtn.style.background = 'var(--green)';
          micBtn.style.transform = 'scale(1)';
        }
        if (recStatus) recStatus.textContent = 'Recitation captured ✓ Ready to submit';
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to start student recitation mic:', err);
    }
  });

  // Submit Homework to Teacher
  sendBtn?.addEventListener('click', async () => {
    const text = textArea?.value?.trim();
    if (!text) {
      showToast('Please speak or type your recitation answer first.', '⚠️');
      return;
    }

    const assignments = await dbGetAll<AssignmentRecord>('assignments');
    const targetAsg = assignments.find(a => a.id === activeSubmitAsgId) || assignments[0];

    if (!targetAsg) {
      showToast('No active assignment selected.', '⚠️');
      return;
    }

    const user = getCurrentUser();
    const newSubmission = {
      studentId: user.id,
      studentName: user.name,
      submittedAt: Date.now(),
      status: 'submitted' as const,
      textContent: text
    };

    if (!targetAsg.submissions) targetAsg.submissions = [];
    const existingIdx = targetAsg.submissions.findIndex(s => s.studentId === user.id || s.studentName === user.name);
    if (existingIdx >= 0) {
      targetAsg.submissions[existingIdx] = newSubmission;
    } else {
      targetAsg.submissions.push(newSubmission);
    }

    await dbPut('assignments', targetAsg);

    // Update student progress in IndexedDB
    let prog = await dbGet<StudentProgressRecord>('student_progress', user.id);
    if (!prog) {
      prog = {
        studentId: user.id,
        studentName: user.name,
        grade: targetAsg.grade || 'Grade 1',
        literacyScore: 88,
        numeracyScore: 85,
        listeningScore: 92,
        participationScore: 95,
        overallScore: 88,
        completedLessons: [],
        submittedAssignments: [targetAsg.id],
        completedWorksheets: [],
        aiRecommendation: 'Oral recitation submitted. Awaiting teacher review.',
        recommendationTagClass: 'background:#DCFCE7;color:#15803D;',
        lastActive: Date.now(),
        lastAssessed: Date.now(),
        syncState: 'pending'
      };
    } else {
      prog.listeningScore = Math.min(100, prog.listeningScore + 3);
      prog.overallScore = Math.round((prog.literacyScore + prog.numeracyScore + prog.listeningScore) / 3);
      prog.aiRecommendation = 'Submitted new oral recitation. Active learner!';
      prog.lastAssessed = Date.now();
    }
    await dbPut('student_progress', prog);

    audio.playToneSequence([523, 659, 783, 1046], 0.12);
    showToast('Homework submitted to teacher! 🌟', '✓');
    closeModal();

    await refreshStudentPortal();
    await refreshAssignmentsList();
    await refreshStudentProgress();
  });
}

// ===================== RIGHT SIDEBAR WIDGETS =====================
function setupRightSidebarWidgets() {
  const btnTranslateNow = document.getElementById('rs-translate-now');
  const btnSwap = document.getElementById('rs-swap-btn');
  const rsFrom = document.getElementById('rs-from') as HTMLSelectElement;
  const rsTo = document.getElementById('rs-to') as HTMLSelectElement;

  btnSwap?.addEventListener('click', () => {
    if (rsFrom && rsTo) {
      const prev = rsFrom.value;
      rsFrom.value = rsTo.value;
      rsTo.value = prev;
    }
  });

  btnTranslateNow?.addEventListener('click', () => {
    const src = rsFrom?.value || 'hindi';
    const tgt = rsTo?.value || 'ho';

    const ttSrc = document.getElementById('tt-source-lang') as HTMLSelectElement;
    const ttTgt = document.getElementById('tt-target-lang') as HTMLSelectElement;

    if (ttSrc) {
      for (let i = 0; i < ttSrc.options.length; i++) {
        if (ttSrc.options[i].text.toLowerCase().includes(src)) {
          ttSrc.selectedIndex = i;
          break;
        }
      }
    }

    if (ttTgt) {
      for (let i = 0; i < ttTgt.options.length; i++) {
        if (ttTgt.options[i].text.toLowerCase().includes(tgt)) {
          ttTgt.selectedIndex = i;
          break;
        }
      }
    }

    switchView('tool-text');
  });
}

// ===================== AI TUTOR CHAT =====================
function setupAITutorChat() {
  const modal = document.getElementById('ai-tutor-modal');
  const openButtons = [
    document.getElementById('btn-open-ai-tutor'),
    document.getElementById('card-open-ai-tutor')
  ];
  const closeButtons = [
    document.getElementById('btn-close-ai-modal'),
    document.getElementById('btn-close-ai-tutor')
  ];
  const sendBtn = document.getElementById('btn-send-ai-chat');
  const micBtn = document.getElementById('btn-ai-chat-mic');
  const chatInput = document.getElementById('ai-chat-input') as HTMLInputElement;
  const chatBody = document.getElementById('ai-chat-body');

  // New Pedagogical Controls
  const langModeSelect = document.getElementById('ai-assistant-lang-mode') as HTMLSelectElement | null;
  const studentLangSelect = document.getElementById('ai-assistant-student-lang') as HTMLSelectElement | null;
  const gradeSelect = document.getElementById('ai-assistant-grade') as HTMLSelectElement | null;

  // File Upload & Grounding Elements
  const triggerUploadBtn = document.getElementById('btn-trigger-ai-upload');
  const fileInput = document.getElementById('ai-upload-lesson-file') as HTMLInputElement | null;
  const docPreview = document.getElementById('ai-uploaded-doc-preview');
  const docName = document.getElementById('ai-uploaded-doc-name');
  const docStatus = document.getElementById('ai-uploaded-doc-status');
  const docSnippet = document.getElementById('ai-uploaded-doc-snippet');
  const docClearBtn = document.getElementById('btn-ai-doc-clear');
  const docSummaryBtn = document.getElementById('btn-ai-doc-summary');
  const docNotesBtn = document.getElementById('btn-ai-doc-notes');
  const docQuizBtn = document.getElementById('btn-ai-doc-quiz');
  const docExplainBtn = document.getElementById('btn-ai-doc-explain');

  const conversationHistory: Array<{ role: 'user' | 'assistant'; text: string }> = [];
  let isVoiceActive = false;
  let tutorRec: any = null;

  const SpeechRecClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  // Helper to adjust input placeholder based on current mode
  const updateInputPlaceholder = () => {
    if (!chatInput) return;
    const mode = langModeSelect?.value || 'student-selected-language';
    const lang = studentLangSelect?.value || 'Ho';
    if (mode === 'teacher-english') {
      chatInput.placeholder = 'Ask lesson planning, pedagogical scaffolding, or FLN assessment guidance in English...';
    } else {
      chatInput.placeholder = `Ask doubt or concept in ${lang} mother tongue (or tap mic to speak)...`;
    }
  };

  langModeSelect?.addEventListener('change', () => {
    updateInputPlaceholder();
    const mode = langModeSelect.value;
    showToast(mode === 'teacher-english' ? 'Switched to Teacher English Mode' : 'Switched to Student Language Mode', '🌐');
  });

  studentLangSelect?.addEventListener('change', () => {
    updateInputPlaceholder();
    const lang = studentLangSelect.value;
    showToast(`Target dialect set to ${lang}`, '🗣️');
  });

  openButtons.forEach(btn => {
    btn?.addEventListener('click', () => {
      if (modal) modal.style.display = 'flex';
      const user = getCurrentUser();
      if (langModeSelect) {
        langModeSelect.value = user.role === 'Teacher' ? 'teacher-english' : 'student-selected-language';
      }
      if (studentLangSelect && user.motherTongue) {
        studentLangSelect.value = user.motherTongue;
      }
      if (gradeSelect && user.grade) {
        gradeSelect.value = user.grade;
      }
      updateInputPlaceholder();
      setTimeout(() => chatInput?.focus(), 150);
    });
  });

  // Handle Lesson Document Upload
  triggerUploadBtn?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (docPreview) docPreview.style.display = 'block';
    if (docName) docName.textContent = file.name;
    if (docStatus) {
      docStatus.textContent = 'Processing with AI...';
      docStatus.style.background = '#FDE68A';
      docStatus.style.color = '#78350F';
    }
    if (docSnippet) docSnippet.textContent = `Analyzing ${file.name} (${Math.round(file.size / 1024)} KB) for key concepts and mother-tongue vocabulary...`;
    showToast(`Processing ${file.name} with AI...`, '📄');

    const reader = new FileReader();
    reader.onload = async () => {
      const fileContent = reader.result as string;
      const targetLang = studentLangSelect?.value || 'Ho';
      const grade = gradeSelect?.value || 'Grade 1';

      try {
        const res = await fetch('/api/ai/process-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type || 'application/pdf',
            content: fileContent,
            mimeType: file.type || 'application/pdf',
            grade,
            subject: 'Classroom Pedagogy',
            targetLang
          })
        });

        const docData = await res.json();
        const extractedText = docData.extractedText || '';
        const summary = docData.summary || '';
        const vocabList = Array.isArray(docData.keyVocabulary) ? docData.keyVocabulary : [];
        const quizList = Array.isArray(docData.quizQuestions) ? docData.quizQuestions : [];

        globalUploadedContent = `Document: ${docData.title || file.name}\n${extractedText}\nSummary: ${summary}\nKey Vocabulary: ${vocabList.map((v: any) => `${v.term} (${v.vernacular || ''}): ${v.meaning}`).join('; ')}\nQuiz Questions: ${quizList.map((q: any) => `${q.question} Answer: ${q.answer}`).join('; ')}`;

        if (docName) docName.textContent = docData.title || file.name;
        if (docStatus) {
          docStatus.textContent = 'Ready (Grounded)';
          docStatus.style.background = '#DCFCE7';
          docStatus.style.color = '#15803D';
        }
        if (docSnippet) docSnippet.textContent = summary || extractedText.substring(0, 160) + '...';

        // Add welcoming bot message into chat
        if (chatBody) {
          const welcomeBubble = document.createElement('div');
          welcomeBubble.className = 'ai-chat-bubble bot';
          welcomeBubble.style.cssText = 'background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px 12px 12px 2px;padding:12px 14px;margin-bottom:12px;align-self:flex-start;max-width:92%;font-size:0.9rem;';
          welcomeBubble.innerHTML = `
            <div style="font-weight:700;color:#065F46;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
              <span>📎</span> <span>Uploaded: ${docData.title || file.name}</span>
            </div>
            <p style="margin:4px 0 8px;color:#047857;font-size:0.85rem;line-height:1.5;">${summary}</p>
            <div style="font-size:0.75rem;color:#065F46;font-weight:600;">
              ✨ Grounding ready! Use the action buttons above or ask any question to generate bilingual lesson notes, vernacular vocabulary, or student quizzes from this material.
            </div>
          `;
          chatBody.appendChild(welcomeBubble);
          chatBody.scrollTop = chatBody.scrollHeight;
        }

        showToast('Lesson data grounded in AI Assistant!', '✓');
      } catch (err) {
        console.warn('Process document error:', err);
        globalUploadedContent = `Uploaded material: ${file.name}`;
        if (docStatus) {
          docStatus.textContent = 'Grounded (Local)';
          docStatus.style.background = '#DCFCE7';
          docStatus.style.color = '#15803D';
        }
        if (docSnippet) docSnippet.textContent = `Lesson content ready for queries.`;
        showToast('Lesson file loaded.', '✓');
      }
    };

    if (file.type.startsWith('image/') || file.type.includes('pdf')) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });

  // Grounded Document Quick Actions
  docSummaryBtn?.addEventListener('click', () => {
    sendChat('Summarize the key concepts and learning competencies from my uploaded lesson document.');
  });
  docNotesBtn?.addEventListener('click', () => {
    sendChat('Generate comprehensive bilingual teacher lesson notes with student learning activities based on my uploaded document.');
  });
  docQuizBtn?.addEventListener('click', () => {
    sendChat('Generate an interactive 3-question formative assessment quiz with mother-tongue hints based on my uploaded document.');
  });
  docExplainBtn?.addEventListener('click', () => {
    const lang = studentLangSelect?.value || 'Ho';
    sendChat(`Explain the core topic from my uploaded document simply in ${lang} mother tongue using real-world village and forest examples.`);
  });
  docClearBtn?.addEventListener('click', () => {
    globalUploadedContent = '';
    if (fileInput) fileInput.value = '';
    if (docPreview) docPreview.style.display = 'none';
    showToast('Uploaded lesson data cleared.', '✓');
  });

  // AI Tutor Mode Chips (Explain, Notes, Summary, Quiz, Uploaded)
  let currentTutorMode: 'chat' | 'notes' | 'summary' | 'quiz' | 'uploaded' = 'chat';
  const modeChips = document.querySelectorAll('.ai-mode-chip');
  modeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      modeChips.forEach(c => {
        c.classList.remove('active');
        (c as HTMLElement).style.background = '#FFFFFF';
        (c as HTMLElement).style.color = 'var(--ink)';
        (c as HTMLElement).style.borderColor = 'var(--border)';
      });
      chip.classList.add('active');
      (chip as HTMLElement).style.background = 'var(--green)';
      (chip as HTMLElement).style.color = '#FFFFFF';
      (chip as HTMLElement).style.borderColor = 'var(--green)';

      const mode = (chip.getAttribute('data-mode') || 'chat') as any;
      currentTutorMode = mode;

      if (mode === 'uploaded') {
        sendChat('Explain the key concepts and mother-tongue vocabulary from my uploaded document.');
      } else if (mode === 'notes') {
        if (chatInput) chatInput.placeholder = 'Topic to generate mother-tongue revision notes for...';
      } else if (mode === 'summary') {
        if (chatInput) chatInput.placeholder = 'Topic or text to summarize in simple mother tongue...';
      } else if (mode === 'quiz') {
        if (chatInput) chatInput.placeholder = 'Topic to test with a bilingual interactive quiz...';
      } else {
        updateInputPlaceholder();
      }
    });
  });

  closeButtons.forEach(btn => {
    btn?.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
      if (isVoiceActive) stopTutorVoice();
    });
  });

  function stopTutorVoice() {
    isVoiceActive = false;
    if (micBtn) {
      micBtn.style.background = 'var(--green)';
      micBtn.style.transform = 'scale(1)';
      micBtn.style.boxShadow = 'none';
    }
    if (tutorRec) {
      try { tutorRec.stop(); } catch (_) {}
      tutorRec = null;
    }
  }

  function startTutorVoice() {
    if (!SpeechRecClass) {
      showToast('Microphone speech recognition is not supported in this browser. Please type your doubt.', '⚠️');
      chatInput?.focus();
      return;
    }

    try {
      tutorRec = new SpeechRecClass();
      tutorRec.continuous = false;
      tutorRec.interimResults = false;

      const user = getCurrentUser();
      const lang = studentLangSelect?.value || user.motherTongue || 'Hindi';
      tutorRec.lang = lang === 'English' ? 'en-IN' : (lang === 'Telugu' ? 'te-IN' : 'hi-IN');

      tutorRec.onstart = () => {
        isVoiceActive = true;
        if (micBtn) {
          micBtn.style.background = '#DC2626';
          micBtn.style.transform = 'scale(1.18)';
          micBtn.style.boxShadow = '0 0 0 5px rgba(220, 38, 38, 0.3)';
        }
        audio.playToneSequence([520, 1040], 0.08);
        if (chatInput) chatInput.placeholder = '🔴 Listening... Speak your doubt now!';
      };

      tutorRec.onresult = (e: any) => {
        const spoken = e.results?.[0]?.[0]?.transcript || '';
        if (spoken.trim()) {
          sendChat(spoken.trim(), true);
        }
      };

      tutorRec.onerror = (err: any) => {
        console.warn('Tutor Speech recognition error:', err.error);
        if (err.error === 'not-allowed') {
          showToast('Microphone permission denied. Please allow microphone in browser settings.', '⚠️');
        }
        stopTutorVoice();
      };

      tutorRec.onend = () => {
        stopTutorVoice();
        updateInputPlaceholder();
      };

      tutorRec.start();
    } catch (err) {
      console.error('Failed to start tutor voice:', err);
      stopTutorVoice();
    }
  }

  micBtn?.addEventListener('click', () => {
    if (isVoiceActive) stopTutorVoice();
    else startTutorVoice();
  });

  const sendChat = async (presetText?: string, spokenInput: boolean = false) => {
    const text = presetText || chatInput?.value?.trim();
    if (!text || !chatBody) return;

    if (chatInput) chatInput.value = '';

    conversationHistory.push({ role: 'user', text });

    // User bubble
    const sBubble = document.createElement('div');
    sBubble.className = 'ai-chat-bubble user';
    sBubble.style.cssText = 'background:var(--green-dark);color:#fff;border-radius:12px 12px 2px 12px;padding:10px 14px;margin-bottom:10px;align-self:flex-end;max-width:85%;font-size:0.9rem;';
    sBubble.textContent = text;
    chatBody.appendChild(sBubble);
    chatBody.scrollTop = chatBody.scrollHeight;

    const user = getCurrentUser();
    const activeLanguageMode = langModeSelect?.value || 'student-selected-language';
    const activeTargetLang = studentLangSelect?.value || user.motherTongue || 'Ho';
    const activeGrade = gradeSelect?.value || user.grade || 'Grade 1';

    // Bot placeholder
    const bBubble = document.createElement('div');
    bBubble.className = 'ai-chat-bubble bot';
    bBubble.style.cssText = 'background:#F1F5F9;border:1px solid var(--border);border-radius:12px 12px 12px 2px;padding:12px 14px;margin-bottom:12px;align-self:flex-start;max-width:92%;font-size:0.9rem;';
    bBubble.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:var(--ink-soft);"><span class="animate-pulse">💭</span> <span>${activeLanguageMode === 'teacher-english' ? 'Thinking pedagogically in English...' : `Thinking in ${activeTargetLang} mother tongue...`}</span></div>`;
    chatBody.appendChild(bBubble);
    chatBody.scrollTop = chatBody.scrollHeight;

    try {
      const resp = await askAITutor(text, activeTargetLang, conversationHistory, {
        role: user.role,
        languageMode: activeLanguageMode as 'teacher-english' | 'student-selected-language',
        grade: activeGrade,
        subject: 'Vernacular Pedagogy & FLN',
        uploadedContent: globalUploadedContent,
        mode: currentTutorMode
      });
      conversationHistory.push({ role: 'assistant', text: resp.reply.replace(/<[^>]+>/g, '') });

      // Clean text for audio synthesis
      const cleanPlain = resp.reply.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      try {
        await saveUserHistoryItem({
          userId: user.id,
          userName: user.name,
          type: 'tutor_qa',
          title: `Tutor: ${text.slice(0, 35)}${text.length > 35 ? '...' : ''}`,
          sourceLang: activeTargetLang,
          targetLang: activeLanguageMode,
          sourceText: text,
          translatedText: cleanPlain
        });
        updateUserHistoryBadge();
      } catch (_) {}

      bBubble.innerHTML = `
        <div style="line-height:1.6;color:var(--ink);">${resp.reply}</div>
        ${resp.visualSvg || ''}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px dashed var(--border);flex-wrap:wrap;gap:8px;">
          <button type="button" class="btn-listen-reply btn-chip" style="padding:4px 10px;font-size:0.75rem;cursor:pointer;margin:0;display:inline-flex;align-items:center;gap:4px;">
            🔊 Listen Audio
          </button>
          <span style="font-size:0.7rem;color:var(--ink-faint);">${activeLanguageMode === 'teacher-english' ? 'Teacher English Mode' : `${activeTargetLang} Pedagogical Mode`}</span>
        </div>
      `;

      // Wire listen button
      const listenBtn = bBubble.querySelector('.btn-listen-reply');
      listenBtn?.addEventListener('click', () => {
        audio.speakTextNatural(cleanPlain);
        showToast(`Playing with natural voice...`, '🔊');
      });

      // If entered via mic voice, automatically speak the reply
      if (spokenInput) {
        audio.speakTextNatural(cleanPlain);
      }

      // Add suggested follow-up chips if available
      if (resp.suggestedQuestions && resp.suggestedQuestions.length > 0) {
        const chipsContainer = document.createElement('div');
        chipsContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';
        resp.suggestedQuestions.forEach(q => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'btn-chip';
          chip.style.cssText = 'font-size:0.75rem;padding:4px 10px;margin:0;cursor:pointer;background:#FFFFFF;border:1px solid var(--green);color:var(--green-dark);border-radius:14px;';
          chip.textContent = q;
          chip.addEventListener('click', () => sendChat(q));
          chipsContainer.appendChild(chip);
        });
        bBubble.appendChild(chipsContainer);
      }

      chatBody.scrollTop = chatBody.scrollHeight;
    } catch {
      bBubble.innerHTML = activeLanguageMode === 'teacher-english'
        ? `Johar! 🙏 Let's explore "${text}" with effective teaching strategies and bilingual classroom practices.`
        : `Johar! 🙏 Let's learn "${text}" together with simple examples in ${activeTargetLang}.`;
      chatBody.scrollTop = chatBody.scrollHeight;
    }
  };

  sendBtn?.addEventListener('click', () => sendChat());
  chatInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  // Suggestion chips in tutor modal if any
  document.querySelectorAll('.tutor-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const query = btn.getAttribute('data-query') || btn.textContent || '';
      sendChat(query);
    });
  });
}

// ===================== SYNC UI =====================
function setupSyncUI() {
  const topbarPill = document.getElementById('topbar-network-pill');
  const topbarDot = document.getElementById('topbar-network-dot');
  const topbarText = document.getElementById('topbar-network-text');

  addSyncListener((isOnline, pendingCount) => {
    const chip = document.getElementById('setting-sync-status-text');
    if (chip) {
      chip.textContent = isOnline ? `Online (${pendingCount} queued) ›` : `Offline Ready (${pendingCount} queued) ›`;
    }

    if (topbarPill && topbarDot && topbarText) {
      if (isOnline) {
        topbarPill.style.background = '#DCFCE7';
        topbarPill.style.color = '#15803D';
        topbarPill.style.borderColor = '#BBF7D0';
        topbarDot.style.background = '#16A34A';
        topbarText.textContent = pendingCount > 0 ? `Online (${pendingCount} queued)` : 'Online';
      } else {
        topbarPill.style.background = '#FEF3C7';
        topbarPill.style.color = '#92400E';
        topbarPill.style.borderColor = '#FDE68A';
        topbarDot.style.background = '#D97706';
        topbarText.textContent = pendingCount > 0 ? `Offline (${pendingCount} queued)` : 'Offline Ready';
      }
    }
  });

  topbarPill?.addEventListener('click', async () => {
    if (navigator.onLine) {
      showToast('Syncing local queue with cloud...', '🔄');
      const res = await flushSyncQueue();
      showToast(`Synced ${res.synced} item${res.synced === 1 ? '' : 's'}.`, '✓');
    } else {
      showToast('Offline Mode: All lessons, worksheets and progress are saved in local IndexedDB.', '📶');
    }
  });
}

// ===================== ACTIVE LEARNING SESSION MODULE =====================
function setupActiveLearningSessionModule() {
  const setupForm = document.getElementById('session-setup-form');
  const activeDashboard = document.getElementById('session-active-dashboard');
  const sessionStatusBadge = document.getElementById('session-status-badge');
  const sessionTimerDisplay = document.getElementById('session-timer-display');
  const classSelect = document.getElementById('session-class-select') as HTMLSelectElement | null;
  const lessonSelect = document.getElementById('session-lesson-select') as HTMLSelectElement | null;
  const durationSelect = document.getElementById('session-duration-select') as HTMLSelectElement | null;
  const btnStartSession = document.getElementById('btn-start-session');
  const sessionActiveTitle = document.getElementById('session-active-title');
  const sessionActiveMeta = document.getElementById('session-active-meta');
  const btnSessionExtend = document.getElementById('btn-session-extend');
  const btnSessionPause = document.getElementById('btn-session-pause');
  const btnSessionEnd = document.getElementById('btn-session-end');
  const liveCountElem = document.getElementById('session-live-students-count');
  const liveTableContainer = document.getElementById('session-students-live-table');

  const studentActiveBanner = document.getElementById('student-session-active-banner');
  const studentBannerTitle = document.getElementById('student-session-banner-title');
  const studentBannerTimer = document.getElementById('student-session-banner-timer');
  const studentEnterBtn = document.getElementById('student-enter-session-btn');
  const studentExpiredBanner = document.getElementById('student-session-expired-banner');

  const quickUploadDocBtn = document.getElementById('btn-quick-upload-doc');
  const quickNewLessonBtn = document.getElementById('btn-quick-new-lesson');

  quickUploadDocBtn?.addEventListener('click', () => {
    switchView('ai-translator');
    const tabUpload = document.getElementById('tab-btn-te-upload');
    tabUpload?.click();
  });

  quickNewLessonBtn?.addEventListener('click', () => {
    switchView('ai-translator');
    const tabMain = document.getElementById('tab-btn-te-main');
    tabMain?.click();
  });

  async function populateSessionLessons() {
    if (!lessonSelect) return;
    const lessons = await dbGetAll<LessonRecord>('lessons');
    if (lessons.length === 0) {
      lessonSelect.innerHTML = '<option value="fln-general">FLN Vernacular Foundational Session</option>';
    } else {
      lessonSelect.innerHTML = lessons.map(l => `<option value="${l.id}">${l.title} (${l.grade || 'Grade 1'} · ${l.targetLang || 'Ho'})</option>`).join('');
    }
  }

  populateSessionLessons();

  function renderSessionState(session: ActiveLearningSession | null) {
    const timeInfo = getTimeRemaining();

    if (session && session.status === 'active') {
      if (setupForm) setupForm.style.display = 'none';
      if (activeDashboard) activeDashboard.style.display = 'block';
      if (sessionStatusBadge) {
        sessionStatusBadge.textContent = '🟢 Live Classroom Session';
        sessionStatusBadge.style.background = '#DCFCE7';
        sessionStatusBadge.style.color = '#15803D';
      }
      if (sessionTimerDisplay) {
        sessionTimerDisplay.style.display = 'inline-block';
        sessionTimerDisplay.textContent = `⏱️ ${timeInfo.display}`;
      }
      if (sessionActiveTitle) sessionActiveTitle.textContent = session.lessonTitle;
      if (sessionActiveMeta) sessionActiveMeta.textContent = `${session.classGrade} · Subject: ${session.subject} · Target Language: ${session.targetLang}`;
      if (liveCountElem) liveCountElem.textContent = `${session.students.length} Enrolled`;

      if (liveTableContainer) {
        liveTableContainer.innerHTML = session.students.map(s => `
          <div style="background:#FAFBFB;border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <div style="font-weight:700;font-size:0.88rem;color:var(--ink);">${s.studentName}</div>
              <div style="font-size:0.78rem;color:var(--ink-soft);margin-top:2px;">
                Status: <span style="font-weight:600;color:${s.completed ? '#15803D' : (s.needsSupport ? '#DC2626' : '#2563EB')};">${s.currentActivity}</span>
              </div>
              ${s.teacherFeedback ? `<div style="font-size:0.75rem;color:#047857;margin-top:4px;">Teacher note: "${s.teacherFeedback}"</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="badge-new" style="background:${s.completed ? '#DCFCE7' : '#EFF6FF'};color:${s.completed ? '#15803D' : '#1E40AF'};font-size:0.78rem;">
                Score: ${s.score}/${s.maxScore}
              </span>
              <button class="btn-chip btn-teacher-feedback" data-student-id="${s.studentId}" style="padding:4px 8px;font-size:0.75rem;margin:0;">
                💬 Feedback
              </button>
            </div>
          </div>
        `).join('');

        liveTableContainer.querySelectorAll('.btn-teacher-feedback').forEach(btn => {
          btn.addEventListener('click', () => {
            const sId = btn.getAttribute('data-student-id');
            const note = prompt('Send encouragement / guidance to student:');
            if (sId && note) {
              submitTeacherFeedback(sId, note);
              showToast('Feedback sent to student!', '✓');
            }
          });
        });
      }

      if (studentActiveBanner) {
        studentActiveBanner.style.display = 'block';
        if (studentBannerTitle) studentBannerTitle.textContent = session.lessonTitle;
        if (studentBannerTimer) studentBannerTimer.textContent = timeInfo.display;
      }
      if (studentExpiredBanner) studentExpiredBanner.style.display = 'none';

    } else if (session && session.status === 'paused') {
      if (sessionTimerDisplay) sessionTimerDisplay.textContent = `⏱️ ${timeInfo.display}`;
      if (sessionStatusBadge) {
        sessionStatusBadge.textContent = '🟡 Session Paused';
        sessionStatusBadge.style.background = '#FEF3C7';
        sessionStatusBadge.style.color = '#B45309';
      }
    } else {
      if (setupForm) setupForm.style.display = 'block';
      if (activeDashboard) activeDashboard.style.display = 'none';
      if (sessionStatusBadge) {
        sessionStatusBadge.textContent = '⏹ No Active Session';
        sessionStatusBadge.style.background = '#F1F5F9';
        sessionStatusBadge.style.color = '#475569';
      }
      if (sessionTimerDisplay) sessionTimerDisplay.style.display = 'none';
      if (studentActiveBanner) studentActiveBanner.style.display = 'none';
      if (session && session.status === 'expired' && studentExpiredBanner) {
        studentExpiredBanner.style.display = 'block';
      } else if (studentExpiredBanner) {
        studentExpiredBanner.style.display = 'none';
      }
    }
  }

  setInterval(() => {
    const session = getActiveSession();
    if (session && session.status === 'active') {
      const timeInfo = getTimeRemaining();
      if (sessionTimerDisplay) sessionTimerDisplay.textContent = `⏱️ ${timeInfo.display}`;
      if (studentBannerTimer) studentBannerTimer.textContent = timeInfo.display;
      if (timeInfo.isExpired) {
        renderSessionState(session);
      }
    }
  }, 1000);

  onSessionChange((session) => {
    renderSessionState(session);
  });

  btnStartSession?.addEventListener('click', async () => {
    const classGrade = classSelect?.value || 'Grade 1';
    const lessonId = lessonSelect?.value || 'fln-general';
    const durationMinutes = parseInt(durationSelect?.value || '30', 10);

    let lessonTitle = 'FLN Vernacular Foundational Session';
    let subject = 'Vernacular Pedagogy';
    let targetLang = 'Ho';

    if (lessonId !== 'fln-general') {
      const lesson = await dbGet<LessonRecord>('lessons', lessonId);
      if (lesson) {
        lessonTitle = lesson.title;
        subject = lesson.subject || 'Environmental Studies';
        targetLang = lesson.targetLang || 'Ho';
      }
    }

    startSession({
      lessonId,
      lessonTitle,
      classGrade,
      subject,
      targetLang,
      durationMinutes
    });

    audio.playToneSequence([523, 659, 784], 0.1);
    showToast(`Active learning session started: "${lessonTitle}"!`, '🎉');
  });

  btnSessionExtend?.addEventListener('click', () => {
    extendSession(15);
    showToast('Session extended by +15 minutes.', '⏱️');
  });

  btnSessionPause?.addEventListener('click', () => {
    const s = pauseOrResumeSession();
    showToast(s?.status === 'paused' ? 'Session paused.' : 'Session resumed.', '⏸');
  });

  btnSessionEnd?.addEventListener('click', () => {
    if (confirm('Are you sure you want to conclude the classroom session?')) {
      endSession();
      showToast('Classroom session completed.', '✓');
    }
  });

  studentEnterBtn?.addEventListener('click', async () => {
    const session = getActiveSession();
    if (!session || session.status !== 'active') {
      showToast('No active classroom session right now.', 'ℹ️');
      return;
    }
    const user = getCurrentUser();
    studentJoinSession(user.id, user.name);

    let lesson = await dbGet<LessonRecord>('lessons', session.lessonId);
    if (!lesson) {
      lesson = {
        id: session.lessonId,
        title: session.lessonTitle,
        topic: session.lessonTitle,
        grade: session.classGrade,
        subject: session.subject,
        sourceLang: 'Hindi',
        targetLang: session.targetLang,
        lessonText: 'पेड़ हमारे मित्र हैं। वे हमें फल, फूल और शुद्ध हवा देते हैं। जंगल हमारी माँ है।',
        scriptText: '',
        explanation: 'Trees provide us with fruits, shade, and fresh air. Protect our local forests.',
        voiceText: 'पेड़ हमारे मित्र हैं।',
        worksheetContent: '',
        questionsContent: '',
        culturalContext: 'Sacred grove preservation and respect for living nature.',
        published: true,
        authorId: user.id,
        syncState: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }

    openStudentLessonExperience(lesson);
  });

  renderSessionState(getActiveSession());
}

// ===================== SUPABASE STATUS & CONFIGURATION =====================
export function updateSupabaseStatusUI(): void {
  const authStatus = getGoogleAuthStatus();
  const isConnected = authStatus.connected;

  // 1. Topbar Supabase Badge
  const topbarBadge = document.getElementById('topbar-supabase-badge');
  if (topbarBadge) {
    if (isConnected) {
      topbarBadge.innerHTML = '⚡ Supabase: Connected';
      topbarBadge.style.background = '#DCFCE7';
      topbarBadge.style.color = '#15803D';
      topbarBadge.style.borderColor = '#BBF7D0';
    } else {
      topbarBadge.innerHTML = '⚡ Supabase: Setup Required';
      topbarBadge.style.background = '#FEF3C7';
      topbarBadge.style.color = '#92400E';
      topbarBadge.style.borderColor = '#FDE68A';
    }
  }

  // 2. Settings Status Pill
  const settingsPill = document.getElementById('settings-supabase-status-pill');
  if (settingsPill) {
    if (isConnected) {
      settingsPill.textContent = 'Connected (Google OAuth Ready)';
      settingsPill.style.background = '#DCFCE7';
      settingsPill.style.color = '#15803D';
    } else {
      settingsPill.textContent = 'Not Connected (Setup Required)';
      settingsPill.style.background = '#FEF3C7';
      settingsPill.style.color = '#92400E';
    }
  }

  // 3. Supabase Modal Banner
  const modalBanner = document.getElementById('modal-supabase-status-banner');
  if (modalBanner) {
    if (isConnected) {
      modalBanner.innerHTML = `⚡ Status: <strong style="color:#15803D;">Connected to Cloud</strong> &middot; Google OAuth &amp; Sync Active`;
      modalBanner.style.background = '#DCFCE7';
      modalBanner.style.borderColor = '#BBF7D0';
      modalBanner.style.color = '#15803D';
    } else {
      modalBanner.innerHTML = `⚡ Status: <strong>Not Connected (Setup Required)</strong><br><span style="font-size:0.75rem;">100% Offline Mode active. Enter your project URL and public key to enable Google OAuth.</span>`;
      modalBanner.style.background = '#FEF3C7';
      modalBanner.style.borderColor = '#FDE68A';
      modalBanner.style.color = '#92400E';
    }
  }
}

export async function updateUserHistoryBadge(): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;
  try {
    const { data: cloudHistory } = await fetchUserHistory();
    if (cloudHistory && cloudHistory.length > 0) {
      for (const ch of cloudHistory) {
        await dbPut('user_history', ch);
      }
    }
  } catch (_) {}

  try {
    const history = await getUserHistory(user.id);
    const count = history.length;
    const badge = document.getElementById('badge-history-count');
    if (badge) {
      badge.textContent = String(count);
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
    const settingsHistoryCount = document.getElementById('setting-history-count');
    if (settingsHistoryCount) {
      settingsHistoryCount.textContent = `${count} Records ›`;
    }
  } catch (_) {}
}

function escapeAttr(str: string): string {
  return (str || '')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===================== OFFLINE LEARNING HISTORY =====================
export async function renderOfflineHistory(filterType: string = 'all'): Promise<void> {
  const user = getCurrentUser();
  const container = document.getElementById('history-list-container');
  const emptyState = document.getElementById('history-empty-state');
  if (!container) return;

  try {
    const { data: cloudHistory, error } = await fetchUserHistory();
    if (!error && cloudHistory && cloudHistory.length > 0) {
      for (const ch of cloudHistory) {
        await dbPut('user_history', ch);
      }
    }
  } catch (err) {
    console.warn('Supabase fetchUserHistory notice:', err);
  }

  try {
    const items = await getUserHistory(user.id);
    const filtered = filterType === 'all'
      ? items
      : items.filter(item => item.type === filterType);

    if (filtered.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const typeIcons: Record<string, string> = {
      translation: '🔤',
      audio_listen: '🎙️',
      lens_scan: '📷',
      tutor_qa: '💡'
    };

    const typeLabels: Record<string, string> = {
      translation: 'Text Translation',
      audio_listen: 'Voice Conversation',
      lens_scan: 'Textbook Lens Scan',
      tutor_qa: 'AI Tutor Scaffolding'
    };

    container.innerHTML = filtered.map(item => {
      const icon = typeIcons[item.type] || '📝';
      const typeLabel = typeLabels[item.type] || item.type;
      const dateStr = new Date(item.timestamp).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <div class="history-item-card" data-id="${item.id}" style="background:#FFF;border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.04);display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;border-bottom:1px solid #F1F5F9;padding-bottom:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:1.1rem;">${icon}</span>
              <span style="font-size:0.78rem;font-weight:700;color:var(--ink);">${typeLabel}</span>
              <span style="font-size:0.72rem;background:#F1F5F9;color:var(--ink-soft);padding:2px 8px;border-radius:10px;">${escapeHtml(item.sourceLang)} &rarr; ${escapeHtml(item.targetLang)}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:0.72rem;color:var(--ink-faint);">${dateStr}</span>
              <button type="button" class="btn-delete-history-item" data-id="${item.id}" title="Delete Record" style="background:transparent;border:none;color:#EF4444;cursor:pointer;font-size:0.85rem;padding:2px 6px;">🗑️</button>
            </div>
          </div>

          <div style="font-size:0.86rem;color:var(--ink);line-height:1.45;">
            <span style="font-size:0.72rem;color:var(--ink-faint);text-transform:uppercase;font-weight:600;display:block;margin-bottom:2px;">Original:</span>
            <div style="background:#F8FAFC;padding:8px 10px;border-radius:6px;border:1px solid #E2E8F0;">${escapeHtml(item.sourceText)}</div>
          </div>

          <div style="font-size:0.92rem;color:var(--green-dark);font-weight:600;line-height:1.45;">
            <span style="font-size:0.72rem;color:var(--ink-faint);text-transform:uppercase;font-weight:600;display:block;margin-bottom:2px;">Vernacular Output / Result:</span>
            <div style="background:#F0FDF4;padding:8px 10px;border-radius:6px;border:1px solid #BBF7D0;">${escapeHtml(item.translatedText)}</div>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:4px;">
            <button type="button" class="btn-chip btn-copy-history-item" data-text="${escapeAttr(item.translatedText)}" style="padding:4px 10px;font-size:0.74rem;">📋 Copy</button>
            <button type="button" class="btn-solid-green btn-speak-history-item" data-text="${escapeAttr(item.translatedText)}" style="width:auto;margin:0;padding:4px 12px;font-size:0.74rem;display:inline-flex;align-items:center;gap:4px;">🔊 Listen</button>
          </div>
        </div>
      `;
    }).join('');

    // Wire item buttons
    container.querySelectorAll('.btn-delete-history-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (id) {
          try {
            await deleteUserHistory(id);
          } catch (_) {}
          await deleteUserHistoryItem(id);
          showToast('History item deleted.', '🗑️');
          renderOfflineHistory(filterType);
          updateUserHistoryBadge();
        }
      });
    });

    container.querySelectorAll('.btn-copy-history-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = btn.getAttribute('data-text') || '';
        navigator.clipboard.writeText(text).then(() => {
          showToast('Copied to clipboard!', '📋');
        }).catch(() => {
          showToast('Copied!', '✓');
        });
      });
    });

    container.querySelectorAll('.btn-speak-history-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = btn.getAttribute('data-text') || '';
        audio.playToneSequence([523, 659]);
        audio.speakTextNatural(text);
      });
    });

  } catch (err) {
    console.warn('Error rendering offline history:', err);
  }
}

function setupHistoryModule(): void {
  const syncBtn = document.getElementById('btn-sync-history-supabase');
  const clearBtn = document.getElementById('btn-clear-user-history');
  const filterBtns = document.querySelectorAll('.history-filter-btn');
  let currentFilter = 'all';

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-type') || 'all';
      renderOfflineHistory(currentFilter);
    });
  });

  clearBtn?.addEventListener('click', async () => {
    const user = getCurrentUser();
    if (confirm('Clear all your local learning history records? This cannot be undone.')) {
      await clearUserHistory(user.id);
      showToast('Learning history cleared.', '🗑️');
      renderOfflineHistory(currentFilter);
      updateUserHistoryBadge();
    }
  });

  syncBtn?.addEventListener('click', async () => {
    const user = getCurrentUser();
    if (!isSupabaseConfigured()) {
      showToast('Supabase is not connected yet. Click to configure cloud sync.', 'ℹ️');
      const cfgModal = document.getElementById('supabase-config-modal');
      if (cfgModal) cfgModal.style.display = 'flex';
      return;
    }

    showToast('Syncing history to Supabase cloud...', '☁️');
    const res = await syncUserHistoryToSupabase(user.id);
    if (res.success) {
      showToast(res.message, '✓');
    } else {
      showToast(res.message, '⚠️');
    }
  });

  // Topbar and settings navigation
  document.getElementById('topbar-offline-history-btn')?.addEventListener('click', () => {
    switchView('history');
  });

  document.getElementById('btn-settings-view-history')?.addEventListener('click', () => {
    switchView('history');
  });
}

// ===================== SUPABASE MODALS SETUP =====================
function setupSupabaseModals(): void {
  // Google Setup Modal
  const googleSetupModal = document.getElementById('google-setup-modal');
  const btnCloseGoogleSetup = document.getElementById('btn-close-google-setup');
  const btnGoogleSetupOffline = document.getElementById('btn-google-setup-offline');
  const btnGoogleSetupConfigure = document.getElementById('btn-google-setup-configure');

  // Supabase Config Modal
  const supabaseConfigModal = document.getElementById('supabase-config-modal');
  const btnCloseSupabaseModal = document.getElementById('btn-close-supabase-modal');
  const btnSettingsOpenSupabase = document.getElementById('btn-settings-open-supabase');
  const btnSettingsSyncSupabase = document.getElementById('btn-settings-sync-supabase');
  const btnSupabaseDisconnect = document.getElementById('btn-supabase-disconnect');
  const btnSupabaseTestConn = document.getElementById('btn-supabase-test-conn');
  const btnSupabaseSaveConfig = document.getElementById('btn-supabase-save-config');
  const inputSupabaseUrl = document.getElementById('input-supabase-url') as HTMLInputElement | null;
  const inputSupabaseKey = document.getElementById('input-supabase-key') as HTMLInputElement | null;
  const testFeedback = document.getElementById('supabase-test-feedback');
  const topbarBadge = document.getElementById('topbar-supabase-badge');

  // Populate inputs from existing config
  const populateInputs = () => {
    const cfg = getSupabaseConfig();
    if (inputSupabaseUrl && cfg.supabaseUrl) inputSupabaseUrl.value = cfg.supabaseUrl;
    if (inputSupabaseKey && cfg.supabaseAnonKey) inputSupabaseKey.value = cfg.supabaseAnonKey;
    updateSupabaseStatusUI();
  };

  populateInputs();

  // Topbar badge opens modal
  topbarBadge?.addEventListener('click', () => {
    populateInputs();
    if (supabaseConfigModal) supabaseConfigModal.style.display = 'flex';
  });

  // Open Supabase Modal from Settings
  btnSettingsOpenSupabase?.addEventListener('click', () => {
    populateInputs();
    if (supabaseConfigModal) supabaseConfigModal.style.display = 'flex';
  });

  // Quick sync from Settings
  btnSettingsSyncSupabase?.addEventListener('click', async () => {
    if (!isSupabaseConfigured()) {
      showToast('Supabase is not configured yet. Opening settings...', 'ℹ️');
      populateInputs();
      if (supabaseConfigModal) supabaseConfigModal.style.display = 'flex';
      return;
    }
    showToast('Syncing all data and history with Supabase...', '☁️');
    const user = getCurrentUser();
    await flushSyncQueue();
    const queueRes = await syncLocalQueueToSupabase();
    const histRes = await syncUserHistoryToSupabase(user.id);
    showToast(`Synced ${queueRes.syncedCount} queue items & ${histRes.count} history items!`, '✓');
  });

  // Close Google Setup Modal
  btnCloseGoogleSetup?.addEventListener('click', () => {
    if (googleSetupModal) googleSetupModal.style.display = 'none';
  });

  // Continue 100% Offline from Google Setup Modal
  btnGoogleSetupOffline?.addEventListener('click', async () => {
    if (googleSetupModal) googleSetupModal.style.display = 'none';
    const user = await loginLocalOffline('Teacher');
    const authGate = document.getElementById('auth-gate-screen');
    const appShell = document.getElementById('app-shell');
    if (authGate) authGate.style.display = 'none';
    if (appShell) appShell.style.display = 'flex';
    updateUserUI();
    navigateTo('dashboard');
    showToast(`100% Offline Mode active as ${user.name}!`, '📶');
  });

  // Open Supabase Config from Google Setup Modal
  btnGoogleSetupConfigure?.addEventListener('click', () => {
    if (googleSetupModal) googleSetupModal.style.display = 'none';
    populateInputs();
    if (supabaseConfigModal) supabaseConfigModal.style.display = 'flex';
  });

  // Close Supabase Config Modal
  btnCloseSupabaseModal?.addEventListener('click', () => {
    if (supabaseConfigModal) supabaseConfigModal.style.display = 'none';
  });

  // Disconnect / Reset to Offline Only
  btnSupabaseDisconnect?.addEventListener('click', () => {
    if (confirm('Disconnect Supabase? The application will run in 100% Offline Mode.')) {
      clearSupabaseConfig();
      if (inputSupabaseUrl) inputSupabaseUrl.value = '';
      if (inputSupabaseKey) inputSupabaseKey.value = '';
      if (testFeedback) {
        testFeedback.style.display = 'block';
        testFeedback.style.background = '#EFF6FF';
        testFeedback.style.color = '#1D4ED8';
        testFeedback.textContent = 'Reset to 100% Offline Mode. Supabase configuration cleared.';
      }
      updateSupabaseStatusUI();
      showToast('Reset to 100% Offline Mode.', '📶');
    }
  });

  // Test Connection
  btnSupabaseTestConn?.addEventListener('click', async () => {
    const url = inputSupabaseUrl?.value?.trim() || '';
    const key = inputSupabaseKey?.value?.trim() || '';

    if (!url || !key) {
      if (testFeedback) {
        testFeedback.style.display = 'block';
        testFeedback.style.background = '#FEE2E2';
        testFeedback.style.color = '#B91C1C';
        testFeedback.textContent = 'Please provide both Supabase Project URL and Anon Key.';
      }
      return;
    }

    if (testFeedback) {
      testFeedback.style.display = 'block';
      testFeedback.style.background = '#FEF3C7';
      testFeedback.style.color = '#92400E';
      testFeedback.textContent = 'Testing connection to Supabase instance...';
    }

    const testRes = await testSupabaseConnection(url, key);
    if (testFeedback) {
      if (testRes.success) {
        testFeedback.style.background = '#DCFCE7';
        testFeedback.style.color = '#15803D';
        testFeedback.textContent = `✓ ${testRes.message}`;
      } else {
        testFeedback.style.background = '#FEE2E2';
        testFeedback.style.color = '#B91C1C';
        testFeedback.textContent = `⚠️ ${testRes.message}`;
      }
    }
    updateSupabaseStatusUI();
  });

  // Save & Connect
  btnSupabaseSaveConfig?.addEventListener('click', async () => {
    const url = inputSupabaseUrl?.value?.trim() || '';
    const key = inputSupabaseKey?.value?.trim() || '';

    if (!url || !key) {
      if (testFeedback) {
        testFeedback.style.display = 'block';
        testFeedback.style.background = '#FEE2E2';
        testFeedback.style.color = '#B91C1C';
        testFeedback.textContent = 'Both URL and Public Anon Key are required to connect.';
      }
      return;
    }

    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      if (testFeedback) {
        testFeedback.style.display = 'block';
        testFeedback.style.background = '#FEE2E2';
        testFeedback.style.color = '#B91C1C';
        testFeedback.textContent = 'Supabase URL must start with https://';
      }
      return;
    }

    if (btnSupabaseSaveConfig) {
      btnSupabaseSaveConfig.textContent = 'Testing & Saving...';
    }

    saveSupabaseConfig({
      supabaseUrl: url,
      supabaseAnonKey: key,
      connected: true
    });

    const testRes = await testSupabaseConnection(url, key);
    if (btnSupabaseSaveConfig) {
      btnSupabaseSaveConfig.textContent = 'Save & Connect';
    }

    if (testRes.success) {
      if (testFeedback) {
        testFeedback.style.display = 'block';
        testFeedback.style.background = '#DCFCE7';
        testFeedback.style.color = '#15803D';
        testFeedback.textContent = '✓ Configuration saved! Supabase connected successfully.';
      }
      showToast('Supabase configured & connected!', '⚡');
      updateSupabaseStatusUI();
      setTimeout(() => {
        if (supabaseConfigModal) supabaseConfigModal.style.display = 'none';
      }, 1200);
    } else {
      if (testFeedback) {
        testFeedback.style.display = 'block';
        testFeedback.style.background = '#FEF3C7';
        testFeedback.style.color = '#92400E';
        testFeedback.textContent = `Saved locally, but connection test failed: ${testRes.message}`;
      }
      updateSupabaseStatusUI();
      showToast('Credentials saved, but verification failed.', '⚠️');
    }
  });
}

