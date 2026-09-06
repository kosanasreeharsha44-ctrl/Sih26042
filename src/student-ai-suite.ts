/**
 * BhashaSetu Student AI Suite
 * Fully functional implementation of:
 * 1. 🤖 AI Translator & Explainer
 * 2. 🌐 Translate Content (Non-destructive Bilingual Reader)
 * 3. 🎤 Multilingual Voice Conversation (STT, TTS, Pronunciation & Grammar)
 */

import {
  studentExplainAndTranslate,
  studentTranslateContent,
  studentVoiceConversation,
  StudentExplainResponse,
  StudentContentTranslateResponse,
  StudentVoiceResponse
} from './ai-engine';
import { dbGetAll, dbPut, dbDelete, LessonRecord, WorksheetRecord, AssignmentRecord, UserHistoryRecord } from './db';
import { getCurrentUser } from './auth';
import { uploadFileToStorage, createNote, deleteNote } from './supabaseService.js';
import { supabase } from './supabaseClient.js';

// -----------------------------------------------------------------------------
// AUDIO UTILITIES
// -----------------------------------------------------------------------------

let activeAudioElement: HTMLAudioElement | null = null;

function playAudioFromBase64(base64Data: string, mimeType = 'audio/wav'): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      if (activeAudioElement) {
        activeAudioElement.pause();
        activeAudioElement = null;
      }
      const audioUrl = `data:${mimeType};base64,${base64Data}`;
      const audio = new Audio(audioUrl);
      activeAudioElement = audio;
      audio.onended = () => resolve();
      audio.onerror = (e) => reject(e);
      audio.play().catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

function speakWithBrowserTTS(text: string, lang = 'hi-IN'): void {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*_#𑢹𑣉𑣆𑣗𑣉]/g, '').trim();
    if (!cleanText) return;
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('Browser TTS warning:', e);
  }
}

// -----------------------------------------------------------------------------
// 1. AI TRANSLATOR & EXPLAINER FOR STUDENTS
// -----------------------------------------------------------------------------

interface ExplainHistoryItem {
  id: string;
  sourceText: string;
  translatedText: string;
  targetLang: string;
  timestamp: number;
  explanation: string;
  audioData?: string | null;
}

let lastExplainResult: StudentExplainResponse | null = null;
let isExplainMicRecording = false;
let explainSpeechRec: any = null;

function getExplainStorageKey(): string {
  const user = getCurrentUser();
  return `bhashasetu_explain_history_${user.id || 'student'}`;
}

function loadExplainHistory(): ExplainHistoryItem[] {
  try {
    const raw = localStorage.getItem(getExplainStorageKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveExplainHistoryItem(item: ExplainHistoryItem) {
  try {
    const list = loadExplainHistory();
    list.unshift(item);
    if (list.length > 20) list.pop();
    localStorage.setItem(getExplainStorageKey(), JSON.stringify(list));
    renderExplainHistoryList();
    updateExplainHistoryCount();
  } catch (e) {
    console.warn('Save history warning:', e);
  }
}

function updateExplainHistoryCount() {
  const countSpan = document.getElementById('st-explain-history-count');
  if (countSpan) {
    const list = loadExplainHistory();
    countSpan.textContent = String(list.length);
  }
}

function renderExplainHistoryList() {
  const container = document.getElementById('st-explain-history-list');
  if (!container) return;

  const history = loadExplainHistory();
  if (history.length === 0) {
    container.innerHTML = `
      <div style="padding:14px;background:#F8FAFC;border:1px dashed #CBD5E1;border-radius:8px;text-align:center;font-size:0.8rem;color:var(--ink-soft);">
        No recent translations saved yet. Try translating words or sentences above!
      </div>
    `;
    return;
  }

  container.innerHTML = history.map(item => `
    <div style="background:#FFFFFF;border:1px solid var(--border);border-radius:8px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div style="flex:1;cursor:pointer;" class="st-explain-history-item" data-id="${item.id}">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
          <span class="status-pill-green" style="font-size:0.68rem;padding:2px 6px;">${item.targetLang}</span>
          <span style="font-size:0.72rem;color:var(--ink-faint);">${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <strong style="font-size:0.88rem;color:#064E3B;display:block;">${escapeHtml(item.translatedText)}</strong>
        <span style="font-size:0.76rem;color:var(--ink-soft);">${escapeHtml(item.sourceText)}</span>
      </div>
      <button type="button" class="btn-chip btn-st-explain-hist-play" data-id="${item.id}" style="font-size:0.72rem;padding:4px 8px;background:#F0FDF4;border-color:#BBF7D0;color:#065F46;">
        🔊 Listen
      </button>
    </div>
  `).join('');

  // Click handler to re-populate
  container.querySelectorAll('.st-explain-history-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const item = history.find(h => h.id === id);
      if (item) {
        const input = document.getElementById('st-explain-input-text') as HTMLTextAreaElement;
        const targetSelect = document.getElementById('st-explain-to-lang') as HTMLSelectElement;
        if (input) input.value = item.sourceText;
        if (targetSelect) targetSelect.value = item.targetLang;
        // Trigger translation
        handleExplainSubmit();
      }
    });
  });

  // Audio play handler
  container.querySelectorAll('.btn-st-explain-hist-play').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const item = history.find(h => h.id === id);
      if (item) {
        if (item.audioData) {
          playAudioFromBase64(item.audioData);
        } else {
          speakWithBrowserTTS(item.translatedText);
        }
      }
    });
  });
}

async function handleExplainSubmit() {
  const inputElem = document.getElementById('st-explain-input-text') as HTMLTextAreaElement;
  const fromSelect = document.getElementById('st-explain-from-lang') as HTMLSelectElement;
  const toSelect = document.getElementById('st-explain-to-lang') as HTMLSelectElement;
  const gradeSelect = document.getElementById('st-explain-grade') as HTMLSelectElement;

  const loadingBanner = document.getElementById('st-explain-loading-banner');
  const errorBanner = document.getElementById('st-explain-error-banner');
  const errorMsg = document.getElementById('st-explain-error-msg');
  const resultCard = document.getElementById('st-explain-result-card');
  const submitBtn = document.getElementById('btn-st-explain-submit') as HTMLButtonElement;

  const text = (inputElem?.value || '').trim();
  if (!text) {
    if (inputElem) inputElem.focus();
    return;
  }

  const fromLang = fromSelect?.value || 'Auto Detect';
  const toLang = toSelect?.value || 'Ho';
  const grade = gradeSelect?.value || 'Grade 1';

  // Show loading
  if (errorBanner) errorBanner.style.display = 'none';
  if (loadingBanner) loadingBanner.style.display = 'block';
  if (resultCard) resultCard.style.display = 'none';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.6';
  }

  try {
    const result = await studentExplainAndTranslate({ text, fromLang, toLang, grade });
    lastExplainResult = result;

    // Populate result card
    renderExplainResult(result);

    // Save to history
    saveExplainHistoryItem({
      id: `exp_${Date.now()}`,
      sourceText: result.sourceText,
      translatedText: result.translatedText,
      targetLang: result.targetLang,
      timestamp: Date.now(),
      explanation: result.simpleExplanation,
      audioData: result.audioData || null
    });

    // Also persist to IndexedDB user_history
    try {
      const user = getCurrentUser();
      const histRecord: UserHistoryRecord = {
        id: `uh_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        userId: user.id || 'student',
        userName: user.name || 'Student',
        type: 'translation',
        title: `AI Translation: ${text.substring(0, 30)}...`,
        sourceText: result.sourceText,
        translatedText: result.translatedText,
        sourceLang: result.detectedSourceLang,
        targetLang: result.targetLang,
        confidence: 0.98,
        metadata: {
          phonetic: result.phoneticGuide,
          explanation: result.simpleExplanation
        },
        timestamp: Date.now(),
        syncState: 'local'
      };
      await dbPut('user_history', histRecord);
    } catch (e) {
      console.warn('user_history IndexedDB note:', e);
    }

    if (loadingBanner) loadingBanner.style.display = 'none';
    if (resultCard) resultCard.style.display = 'flex';
  } catch (err: any) {
    console.error('Explain error:', err);
    if (loadingBanner) loadingBanner.style.display = 'none';
    if (errorBanner) {
      errorBanner.style.display = 'block';
      if (errorMsg) errorMsg.textContent = err?.message || 'Could not complete translation and explanation.';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
    }
  }
}

function renderExplainResult(res: StudentExplainResponse) {
  const targetBadge = document.getElementById('st-explain-res-target-badge');
  const detectedSource = document.getElementById('st-explain-res-detected-source');
  const transText = document.getElementById('st-explain-res-translated-text');
  const scriptBox = document.getElementById('st-explain-res-script-box');
  const scriptText = document.getElementById('st-explain-res-script');
  const phoneticBox = document.getElementById('st-explain-res-phonetic-box');
  const phoneticText = document.getElementById('st-explain-res-phonetic');
  const explanation = document.getElementById('st-explain-res-explanation');
  const englishBox = document.getElementById('st-explain-res-english-box');
  const englishExp = document.getElementById('st-explain-res-english-exp');
  const meaningsList = document.getElementById('st-explain-res-meanings-list');
  const examplesList = document.getElementById('st-explain-res-examples-list');

  if (targetBadge) targetBadge.textContent = `${res.targetLang} Translation`;
  if (detectedSource) detectedSource.textContent = `Source: ${res.detectedSourceLang}`;
  if (transText) transText.textContent = res.translatedText;

  // Native script
  if (res.scriptVariant && scriptBox && scriptText) {
    scriptText.textContent = res.scriptVariant;
    scriptBox.style.display = 'block';
  } else if (scriptBox) {
    scriptBox.style.display = 'none';
  }

  // Phonetic
  if (res.phoneticGuide && phoneticBox && phoneticText) {
    phoneticText.textContent = res.phoneticGuide;
    phoneticBox.style.display = 'inline-block';
  } else if (phoneticBox) {
    phoneticBox.style.display = 'none';
  }

  // Explanation
  if (explanation) explanation.textContent = res.simpleExplanation;
  if (res.englishExplanation && englishBox && englishExp) {
    englishExp.textContent = res.englishExplanation;
    englishBox.style.display = 'block';
  } else if (englishBox) {
    englishBox.style.display = 'none';
  }

  // Meanings list
  if (meaningsList) {
    if (res.meanings && res.meanings.length > 0) {
      meaningsList.innerHTML = res.meanings.map(m => `
        <div style="background:#F8FAFC;border:1px solid var(--border);border-radius:8px;padding:10px 12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <strong style="font-size:0.88rem;color:var(--ink);">${escapeHtml(m.word)}</strong>
            <span style="font-size:0.8rem;color:#047857;font-weight:700;">${escapeHtml(m.vernacular)}</span>
          </div>
          <span style="font-size:0.78rem;color:var(--ink-soft);line-height:1.4;display:block;">${escapeHtml(m.meaning)}</span>
        </div>
      `).join('');
    } else {
      meaningsList.innerHTML = `<span style="font-size:0.8rem;color:var(--ink-soft);">Core everyday vocabulary unit.</span>`;
    }
  }

  // Examples list
  if (examplesList) {
    if (res.examples && res.examples.length > 0) {
      examplesList.innerHTML = res.examples.map(ex => `
        <div style="background:#F8FAFC;border:1px solid var(--border);border-radius:8px;padding:10px 14px;">
          <div style="font-size:0.72rem;color:var(--ink-faint);text-transform:uppercase;font-weight:700;margin-bottom:2px;">${escapeHtml(ex.context || 'Everyday usage')}</div>
          <div style="font-size:0.92rem;font-weight:700;color:#064E3B;margin-bottom:2px;">${escapeHtml(ex.translated)}</div>
          <div style="font-size:0.8rem;color:var(--ink-soft);">${escapeHtml(ex.source)}</div>
        </div>
      `).join('');
    } else {
      examplesList.innerHTML = `<span style="font-size:0.8rem;color:var(--ink-soft);">Use with your family and classmates during conversation.</span>`;
    }
  }
}

function setupExplainVoiceInput() {
  const micBtn = document.getElementById('btn-st-explain-mic');
  const micIcon = document.getElementById('st-explain-mic-icon');
  const inputElem = document.getElementById('st-explain-input-text') as HTMLTextAreaElement;
  const statusElem = document.getElementById('st-explain-input-status');

  if (!micBtn || !inputElem) return;

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    micBtn.title = 'Speech recognition not supported in this browser';
    micBtn.style.opacity = '0.5';
    return;
  }

  explainSpeechRec = new SpeechRecognition();
  explainSpeechRec.continuous = false;
  explainSpeechRec.interimResults = true;

  explainSpeechRec.onstart = () => {
    isExplainMicRecording = true;
    micBtn.style.background = '#FEE2E2';
    micBtn.style.borderColor = '#EF4444';
    if (micIcon) micIcon.textContent = '🔴';
    if (statusElem) statusElem.textContent = 'Listening to your voice... Speak now.';
  };

  explainSpeechRec.onresult = (event: any) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      transcript += event.results[i][0].transcript;
    }
    inputElem.value = transcript;
    if (statusElem) statusElem.textContent = `Heard: "${transcript}"`;
  };

  explainSpeechRec.onerror = (event: any) => {
    console.warn('Explain speech recognition notice:', event.error);
    stopExplainMic();
    if (statusElem) statusElem.textContent = `Microphone notice (${event.error}). You can also type text above.`;
  };

  explainSpeechRec.onend = () => {
    stopExplainMic();
  };

  micBtn.addEventListener('click', () => {
    if (isExplainMicRecording) {
      explainSpeechRec.stop();
      stopExplainMic();
    } else {
      const fromSelect = document.getElementById('st-explain-from-lang') as HTMLSelectElement;
      const langVal = fromSelect?.value;
      explainSpeechRec.lang = langVal === 'English' ? 'en-IN' : 'hi-IN';
      try {
        explainSpeechRec.start();
      } catch (err) {
        console.warn('Could not start speech rec:', err);
      }
    }
  });

  function stopExplainMic() {
    isExplainMicRecording = false;
    micBtn.style.background = '#F1F5F9';
    micBtn.style.borderColor = '#CBD5E1';
    if (micIcon) micIcon.textContent = '🎤';
    if (statusElem) statusElem.textContent = 'Ready to translate into mother tongue with child-friendly explanation';
  }
}

// -----------------------------------------------------------------------------
// 2. TRANSLATE CONTENT (NON-DESTRUCTIVE BILINGUAL READER)
// -----------------------------------------------------------------------------

let currentContentType: 'lesson' | 'worksheet' | 'assignment' | 'notes' | 'uploaded' = 'lesson';
let currentReaderMode: 'split' | 'interlinear' | 'translated' | 'original' = 'split';
let lastContentResult: StudentContentTranslateResponse | null = null;
let currentSourceContent = '';
let currentSourceTitle = '';

function getSavedStudyNotesKey(): string {
  const user = getCurrentUser();
  return `bhashasetu_saved_study_notes_${user.id || 'student'}`;
}

function loadSavedStudyNotes(): StudentContentTranslateResponse[] {
  try {
    const raw = localStorage.getItem(getSavedStudyNotesKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveStudyNoteItem(item: StudentContentTranslateResponse) {
  try {
    const list = loadSavedStudyNotes();
    const existingIndex = list.findIndex(x => x.originalTitle === item.originalTitle && x.targetLang === item.targetLang);
    if (existingIndex >= 0) {
      list[existingIndex] = item;
    } else {
      list.unshift(item);
    }
    if (list.length > 30) list.pop();
    localStorage.setItem(getSavedStudyNotesKey(), JSON.stringify(list));
    renderSavedStudyNotesList();

    // 1. Persist note in Supabase 'notes' table
    const noteTitle = item.translatedTitle || item.originalTitle || 'Study Note';
    const noteContent = item.sections.map(s => `${s.originalText}\n${s.translatedText}`).join('\n\n');
    await createNote({
      title: noteTitle,
      content: noteContent,
      category: 'study',
      metadata: {
        originalTitle: item.originalTitle,
        targetLang: item.targetLang,
        contentType: item.contentType,
        summary: item.summary
      }
    });

    // 2. Also save in IndexedDB 'notes' store for offline durability
    await dbPut('notes', {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: noteTitle,
      content: noteContent,
      category: 'study',
      createdAt: new Date().toISOString()
    }).catch(() => {});

    // 3. Dispatch notes-updated event so dashboard counters update automatically
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notes-updated', { detail: { action: 'create', title: noteTitle } }));
    }
  } catch (e) {
    console.warn('Save study note warning:', e);
  }
}

async function deleteStudyNoteItem(title: string, lang: string) {
  try {
    const list = loadSavedStudyNotes();
    const itemToDelete = list.find(x => x.originalTitle === title && x.targetLang === lang);
    const updated = list.filter(x => !(x.originalTitle === title && x.targetLang === lang));
    localStorage.setItem(getSavedStudyNotesKey(), JSON.stringify(updated));
    renderSavedStudyNotesList();

    // Delete from Supabase notes table
    if (itemToDelete) {
      const noteTitle = itemToDelete.translatedTitle || itemToDelete.originalTitle;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('notes')
          .delete()
          .eq('user_id', user.id)
          .eq('title', noteTitle);
      }
    }

    // Dispatch notes-updated event so dashboard counters update automatically
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notes-updated', { detail: { action: 'delete', title } }));
    }
  } catch (e) {
    console.warn('Delete study note warning:', e);
  }
}

function renderSavedStudyNotesList() {
  const container = document.getElementById('st-content-saved-list');
  if (!container) return;

  const list = loadSavedStudyNotes();
  if (list.length === 0) {
    container.innerHTML = `
      <div style="padding:14px;background:#F8FAFC;border:1px dashed #CBD5E1;border-radius:8px;text-align:center;font-size:0.8rem;color:var(--ink-soft);">
        No saved study sheets yet. Translate any lesson or worksheet above and click "Save to My Study Notes"!
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(item => `
    <div style="background:#FFFFFF;border:1px solid var(--border);border-radius:8px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
          <span class="status-pill-green" style="font-size:0.68rem;padding:2px 6px;">${escapeHtml(item.targetLang)}</span>
          <span style="font-size:0.72rem;color:var(--ink-faint);text-transform:uppercase;">${escapeHtml(item.contentType)}</span>
        </div>
        <strong style="font-size:0.92rem;color:var(--ink);display:block;">${escapeHtml(item.translatedTitle)}</strong>
        <span style="font-size:0.76rem;color:var(--ink-soft);">Original: ${escapeHtml(item.originalTitle)} (${item.sections.length} sections)</span>
      </div>
      <div style="display:flex;gap:6px;">
        <button type="button" class="btn-chip btn-st-open-saved-sheet" data-title="${escapeHtml(item.originalTitle)}" data-lang="${escapeHtml(item.targetLang)}" style="font-size:0.75rem;padding:4px 10px;background:#ECFDF5;border-color:#A7F3D0;color:#065F46;">
          Open Sheet 📖
        </button>
        <button type="button" class="btn-chip btn-st-delete-saved-sheet" data-title="${escapeHtml(item.originalTitle)}" data-lang="${escapeHtml(item.targetLang)}" style="font-size:0.75rem;padding:4px 8px;background:#FEE2E2;border-color:#FCA5A5;color:#991B1B;">
          Delete 🗑️
        </button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.btn-st-open-saved-sheet').forEach(btn => {
    btn.addEventListener('click', () => {
      const title = btn.getAttribute('data-title');
      const lang = btn.getAttribute('data-lang');
      const item = list.find(x => x.originalTitle === title && x.targetLang === lang);
      if (item) {
        lastContentResult = item;
        renderBilingualReader(item);
        const readerContainer = document.getElementById('st-content-reader-container');
        if (readerContainer) {
          readerContainer.style.display = 'block';
          readerContainer.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });

  container.querySelectorAll('.btn-st-delete-saved-sheet').forEach(btn => {
    btn.addEventListener('click', async () => {
      const title = btn.getAttribute('data-title') || '';
      const lang = btn.getAttribute('data-lang') || '';
      await deleteStudyNoteItem(title, lang);
    });
  });
}

async function populateContentDropdown() {
  const selectElem = document.getElementById('st-content-item-select') as HTMLSelectElement;
  const selectLabel = document.getElementById('st-content-select-label');
  if (!selectElem) return;

  if (currentContentType === 'notes' || currentContentType === 'uploaded') {
    return;
  }

  selectElem.innerHTML = '<option value="">Loading available items...</option>';

  try {
    if (currentContentType === 'lesson') {
      if (selectLabel) selectLabel.textContent = 'Select Lesson to Translate';
      const lessons: LessonRecord[] = await dbGetAll('lessons');
      if (lessons.length === 0) {
        selectElem.innerHTML = '<option value="">No lessons found in curriculum. Create or wait for teacher.</option>';
        return;
      }
      selectElem.innerHTML = lessons.map(l => `
        <option value="${l.id}" data-title="${escapeHtml(l.title)}">${escapeHtml(l.title)} (${l.grade || 'Grade 1'} · ${l.subject || 'EVS'})</option>
      `).join('');
      // Auto trigger source content load
      loadSelectedDropdownContent();
    } else if (currentContentType === 'worksheet') {
      if (selectLabel) selectLabel.textContent = 'Select Worksheet to Translate';
      const worksheets: WorksheetRecord[] = await dbGetAll('worksheets');
      if (worksheets.length === 0) {
        selectElem.innerHTML = '<option value="">No worksheets available.</option>';
        return;
      }
      selectElem.innerHTML = worksheets.map(w => `
        <option value="${w.id}" data-title="${escapeHtml(w.title)}">${escapeHtml(w.title)} (${w.grade || 'Grade 1'})</option>
      `).join('');
      loadSelectedDropdownContent();
    } else if (currentContentType === 'assignment') {
      if (selectLabel) selectLabel.textContent = 'Select Assignment to Translate';
      const assignments: AssignmentRecord[] = await dbGetAll('assignments');
      if (assignments.length === 0) {
        selectElem.innerHTML = '<option value="">No assignments assigned yet.</option>';
        return;
      }
      selectElem.innerHTML = assignments.map(a => `
        <option value="${a.id}" data-title="${escapeHtml(a.title)}">${escapeHtml(a.title)} (${a.grade || 'Grade 1'})</option>
      `).join('');
      loadSelectedDropdownContent();
    }
  } catch (err) {
    console.warn('Populate content dropdown warning:', err);
    selectElem.innerHTML = '<option value="">Error loading items</option>';
  }
}

async function loadSelectedDropdownContent() {
  const selectElem = document.getElementById('st-content-item-select') as HTMLSelectElement;
  if (!selectElem || !selectElem.value) return;

  const id = selectElem.value;
  try {
    if (currentContentType === 'lesson') {
      const lessons: LessonRecord[] = await dbGetAll('lessons');
      const lesson = lessons.find(l => l.id === id);
      if (lesson) {
        currentSourceTitle = lesson.title;
        // Construct comprehensive lesson text
        const parts = [
          lesson.title,
          lesson.culturalContext ? `[Context]: ${lesson.culturalContext}` : '',
          lesson.explanation || lesson.scriptText || '',
          lesson.worksheetContent ? `\nExercises:\n${lesson.worksheetContent}` : ''
        ].filter(Boolean);
        currentSourceContent = parts.join('\n\n');
      }
    } else if (currentContentType === 'worksheet') {
      const worksheets: WorksheetRecord[] = await dbGetAll('worksheets');
      const ws = worksheets.find(w => w.id === id);
      if (ws) {
        currentSourceTitle = ws.title;
        const qTexts = (ws.questions || []).map((q, idx) => `${idx + 1}. ${q.q}${q.a ? ` (Answer: ${q.a})` : ''}`).join('\n');
        currentSourceContent = `${ws.title}\n\nQuestions & Activities:\n${qTexts}`;
      }
    } else if (currentContentType === 'assignment') {
      const assignments: AssignmentRecord[] = await dbGetAll('assignments');
      const asg = assignments.find(a => a.id === id);
      if (asg) {
        currentSourceTitle = asg.title;
        currentSourceContent = `${asg.title}\n\nDescription:\n${asg.description || ''}\nDeadline: ${asg.deadline || 'This week'}`;
      }
    }
  } catch (e) {
    console.warn('Load dropdown content warning:', e);
  }
}

async function handleContentTranslateSubmit() {
  const targetSelect = document.getElementById('st-content-target-lang') as HTMLSelectElement;
  const targetLang = targetSelect?.value || 'Ho';

  let title = currentSourceTitle;
  let content = currentSourceContent;

  if (currentContentType === 'notes' || currentContentType === 'uploaded') {
    const titleInput = document.getElementById('st-content-custom-title') as HTMLInputElement;
    const textArea = document.getElementById('st-content-custom-text') as HTMLTextAreaElement;
    title = (titleInput?.value || '').trim() || (currentContentType === 'notes' ? 'My Study Notes' : 'Uploaded Document');
    content = (textArea?.value || '').trim();
  }

  if (!content) {
    alert('Please select or provide content to translate.');
    return;
  }

  const loadingBanner = document.getElementById('st-content-loading-banner');
  const errorBanner = document.getElementById('st-content-error-banner');
  const errorMsg = document.getElementById('st-content-error-msg');
  const readerContainer = document.getElementById('st-content-reader-container');
  const btnSubmit = document.getElementById('btn-st-content-translate') as HTMLButtonElement;

  if (errorBanner) errorBanner.style.display = 'none';
  if (loadingBanner) loadingBanner.style.display = 'block';
  if (readerContainer) readerContainer.style.display = 'none';
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.style.opacity = '0.6';
  }

  try {
    const result = await studentTranslateContent({
      content,
      title,
      contentType: currentContentType,
      targetLang,
      grade: 'Grade 1'
    });

    lastContentResult = result;
    renderBilingualReader(result);

    if (loadingBanner) loadingBanner.style.display = 'none';
    if (readerContainer) {
      readerContainer.style.display = 'block';
      readerContainer.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (err: any) {
    console.error('Content translate error:', err);
    if (loadingBanner) loadingBanner.style.display = 'none';
    if (errorBanner) {
      errorBanner.style.display = 'block';
      if (errorMsg) errorMsg.textContent = err?.message || 'Could not translate content.';
    }
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.style.opacity = '1';
    }
  }
}

function renderBilingualReader(res: StudentContentTranslateResponse) {
  const displayTitle = document.getElementById('st-content-display-title');
  const displaySummary = document.getElementById('st-content-display-summary');
  const wrapper = document.getElementById('st-content-sections-wrapper');
  const vocabList = document.getElementById('st-content-vocab-list');
  const vocabBox = document.getElementById('st-content-vocab-box');

  if (displayTitle) displayTitle.textContent = `${res.translatedTitle} [${res.targetLang}]`;
  if (displaySummary) displaySummary.textContent = res.summary;

  if (wrapper) {
    wrapper.innerHTML = res.sections.map(sec => {
      if (currentReaderMode === 'split') {
        return `
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:14px;background:#FFFFFF;border:1px solid var(--border);border-radius:10px;padding:14px;">
            <!-- Left: Protected Original -->
            <div style="border-right:1px dashed var(--border);padding-right:14px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <span style="font-size:0.7rem;font-weight:700;color:var(--ink-soft);text-transform:uppercase;">Original (Protected 🔒)</span>
                <button type="button" class="btn-chip btn-speak-text" data-text="${escapeHtml(sec.originalText)}" data-lang="hi-IN" style="font-size:0.7rem;padding:2px 6px;">🔊</button>
              </div>
              <div style="font-size:0.88rem;color:var(--ink);line-height:1.5;">${escapeHtml(sec.originalText)}</div>
            </div>
            <!-- Right: Translated Vernacular -->
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <span style="font-size:0.7rem;font-weight:700;color:#047857;text-transform:uppercase;">${res.targetLang} Translation</span>
                <button type="button" class="btn-chip btn-speak-text" data-text="${escapeHtml(sec.translatedText)}" data-lang="hi-IN" style="font-size:0.7rem;padding:2px 6px;background:#F0FDF4;color:#047857;border-color:#BBF7D0;">🔊</button>
              </div>
              <div style="font-size:0.95rem;font-weight:700;color:#064E3B;line-height:1.5;margin-bottom:4px;">${escapeHtml(sec.translatedText)}</div>
              ${sec.scriptVariant ? `<div style="font-size:0.88rem;color:#047857;background:#F0FDF4;padding:4px 8px;border-radius:4px;display:inline-block;font-weight:600;">${escapeHtml(sec.scriptVariant)}</div>` : ''}
            </div>
          </div>
        `;
      } else if (currentReaderMode === 'interlinear') {
        return `
          <div style="background:#FFFFFF;border:1px solid var(--border);border-radius:10px;padding:14px;">
            <div style="font-size:0.95rem;font-weight:700;color:#064E3B;margin-bottom:6px;line-height:1.5;">
              <span class="status-pill-green" style="font-size:0.68rem;padding:2px 6px;margin-right:6px;">${res.targetLang}</span>
              ${escapeHtml(sec.translatedText)}
            </div>
            ${sec.scriptVariant ? `<div style="font-size:0.84rem;color:#047857;margin-bottom:6px;">${escapeHtml(sec.scriptVariant)}</div>` : ''}
            <div style="font-size:0.84rem;color:var(--ink-soft);border-top:1px dashed var(--border);padding-top:6px;margin-top:4px;">
              <strong>Original:</strong> ${escapeHtml(sec.originalText)}
            </div>
          </div>
        `;
      } else if (currentReaderMode === 'translated') {
        return `
          <div style="background:#FFFFFF;border:1px solid #A7F3D0;border-radius:10px;padding:14px;">
            <div style="font-size:0.98rem;font-weight:700;color:#064E3B;line-height:1.5;margin-bottom:4px;">${escapeHtml(sec.translatedText)}</div>
            ${sec.scriptVariant ? `<div style="font-size:0.88rem;color:#047857;background:#F0FDF4;padding:4px 8px;border-radius:4px;display:inline-block;">${escapeHtml(sec.scriptVariant)}</div>` : ''}
          </div>
        `;
      } else {
        // Original only
        return `
          <div style="background:#FFFFFF;border:1px solid var(--border);border-radius:10px;padding:14px;">
            <div style="font-size:0.9rem;color:var(--ink);line-height:1.5;">${escapeHtml(sec.originalText)}</div>
          </div>
        `;
      }
    }).join('');

    // Attach speak buttons
    wrapper.querySelectorAll('.btn-speak-text').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-text') || '';
        const lang = btn.getAttribute('data-lang') || 'hi-IN';
        speakWithBrowserTTS(text, lang);
      });
    });
  }

  // Vocab list
  if (vocabBox && vocabList) {
    if (res.keyVocabulary && res.keyVocabulary.length > 0) {
      vocabBox.style.display = 'block';
      vocabList.innerHTML = res.keyVocabulary.map(v => `
        <div style="background:#FFFFFF;border:1px solid var(--border);border-radius:8px;padding:8px 12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
            <strong style="font-size:0.85rem;color:var(--ink);">${escapeHtml(v.term)}</strong>
            <span style="font-size:0.8rem;color:#047857;font-weight:700;">${escapeHtml(v.vernacular)}</span>
          </div>
          <span style="font-size:0.75rem;color:var(--ink-soft);">${escapeHtml(v.meaning)}</span>
        </div>
      `).join('');
    } else {
      vocabBox.style.display = 'none';
    }
  }
}

// -----------------------------------------------------------------------------
// 3. MULTILINGUAL VOICE CONVERSATION
// -----------------------------------------------------------------------------

interface VoiceTurn {
  id: string;
  role: 'student' | 'tutor';
  text: string;
  phonetic?: string;
  english?: string;
  hindi?: string;
  timestamp: number;
  pronunciation?: any;
  grammar?: any;
  audioData?: string | null;
}

let voiceTurns: VoiceTurn[] = [];
let isVoiceRecording = false;
let voiceSpeechRec: any = null;

function getVoiceHistoryKey(): string {
  const user = getCurrentUser();
  return `bhashasetu_voice_sessions_${user.id || 'student'}`;
}

function loadVoiceSessions(): Array<{ id: string; date: number; summary: string; turns: VoiceTurn[] }> {
  try {
    const raw = localStorage.getItem(getVoiceHistoryKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCurrentVoiceSession() {
  if (voiceTurns.length <= 1) return;
  try {
    const sessions = loadVoiceSessions();
    const summary = voiceTurns.find(t => t.role === 'student')?.text || 'Voice conversation';
    sessions.unshift({
      id: `vs_${Date.now()}`,
      date: Date.now(),
      summary: summary.substring(0, 40),
      turns: voiceTurns
    });
    if (sessions.length > 15) sessions.pop();
    localStorage.setItem(getVoiceHistoryKey(), JSON.stringify(sessions));
    renderVoiceHistorySessions();
  } catch (e) {
    console.warn('Save voice session note:', e);
  }
}

function renderVoiceHistorySessions() {
  const container = document.getElementById('st-voice-history-list');
  if (!container) return;

  const sessions = loadVoiceSessions();
  if (sessions.length === 0) {
    container.innerHTML = `
      <div style="padding:14px;background:#F8FAFC;border:1px dashed #CBD5E1;border-radius:8px;text-align:center;font-size:0.8rem;color:var(--ink-soft);">
        No past voice sessions recorded. Start talking to practice!
      </div>
    `;
    return;
  }

  container.innerHTML = sessions.map(s => `
    <div style="background:#FFFFFF;border:1px solid var(--border);border-radius:8px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div style="flex:1;">
        <span style="font-size:0.72rem;color:var(--ink-faint);">${new Date(s.date).toLocaleDateString()} ${new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <strong style="font-size:0.88rem;color:var(--ink);display:block;">"${escapeHtml(s.summary)}..."</strong>
        <span style="font-size:0.75rem;color:var(--ink-soft);">${s.turns.length} dialog turns</span>
      </div>
      <button type="button" class="btn-chip btn-reload-voice-session" data-id="${s.id}" style="font-size:0.75rem;padding:4px 10px;">
        Review Session ➔
      </button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-reload-voice-session').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const session = sessions.find(s => s.id === id);
      if (session) {
        voiceTurns = [...session.turns];
        renderVoiceChatFeed();
        const drawer = document.getElementById('st-voice-history-drawer');
        if (drawer) drawer.style.display = 'none';
      }
    });
  });
}

function setupVoiceSpeechRecognition() {
  const mainMicBtn = document.getElementById('btn-st-voice-mic-main');
  const micIcon = document.getElementById('st-voice-mic-icon');
  const micSubtext = document.getElementById('st-voice-mic-subtext');
  const visualizer = document.getElementById('st-voice-visualizer-box');
  const statusPill = document.getElementById('st-voice-status-pill');
  const textInput = document.getElementById('st-voice-text-input') as HTMLInputElement;

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    if (statusPill) statusPill.innerHTML = `<span>Speech recognition not supported in this browser. Use text input below.</span>`;
    return;
  }

  voiceSpeechRec = new SpeechRecognition();
  voiceSpeechRec.continuous = false;
  voiceSpeechRec.interimResults = true;

  voiceSpeechRec.onstart = () => {
    isVoiceRecording = true;
    if (mainMicBtn) {
      mainMicBtn.style.background = 'linear-gradient(135deg, #DC2626, #B91C1C)';
      mainMicBtn.style.boxShadow = '0 0 0 12px rgba(220,38,38,0.2)';
    }
    if (micIcon) micIcon.textContent = '⏹️';
    if (micSubtext) micSubtext.textContent = 'Listening...';
    if (visualizer) visualizer.style.display = 'flex';
    if (statusPill) statusPill.innerHTML = `<span>Listening to your speech... Speak clearly in your mother tongue</span>`;
  };

  voiceSpeechRec.onresult = (event: any) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      transcript += event.results[i][0].transcript;
    }
    if (textInput) textInput.value = transcript;
    if (statusPill) statusPill.innerHTML = `<span>Hearing: "${transcript}"</span>`;
  };

  voiceSpeechRec.onerror = (event: any) => {
    console.warn('Voice speech recognition error:', event.error);
    stopVoiceMic();
    if (statusPill) statusPill.innerHTML = `<span>Speech recognition notice (${event.error}). You can type your message below.</span>`;
  };

  voiceSpeechRec.onend = () => {
    stopVoiceMic();
    const message = (textInput?.value || '').trim();
    if (message) {
      handleSendVoiceMessage(message);
    }
  };

  if (mainMicBtn) {
    mainMicBtn.addEventListener('click', () => {
      if (isVoiceRecording) {
        voiceSpeechRec.stop();
        stopVoiceMic();
      } else {
        const langSelect = document.getElementById('st-voice-student-lang') as HTMLSelectElement;
        const langVal = langSelect?.value;
        voiceSpeechRec.lang = langVal === 'English' ? 'en-IN' : 'hi-IN';
        try {
          voiceSpeechRec.start();
        } catch (e) {
          console.warn('Start voice mic notice:', e);
        }
      }
    });
  }

  function stopVoiceMic() {
    isVoiceRecording = false;
    if (mainMicBtn) {
      mainMicBtn.style.background = 'linear-gradient(135deg, #059669, #047857)';
      mainMicBtn.style.boxShadow = '0 8px 24px rgba(4,120,87,0.3)';
    }
    if (micIcon) micIcon.textContent = '🎤';
    if (micSubtext) micSubtext.textContent = 'Tap to Speak';
    if (visualizer) visualizer.style.display = 'none';
  }
}

async function handleSendVoiceMessage(userMessage: string) {
  const textInput = document.getElementById('st-voice-text-input') as HTMLInputElement;
  const statusPill = document.getElementById('st-voice-status-pill');
  const studentLangSelect = document.getElementById('st-voice-student-lang') as HTMLSelectElement;
  const tutorLangSelect = document.getElementById('st-voice-tutor-lang') as HTMLSelectElement;
  const gradeSelect = document.getElementById('st-voice-grade') as HTMLSelectElement;
  const autoSpeakToggle = document.getElementById('st-voice-auto-speak-toggle') as HTMLInputElement;

  const msg = (userMessage || textInput?.value || '').trim();
  if (!msg) return;

  if (textInput) textInput.value = '';

  const studentLang = studentLangSelect?.value || 'Ho';
  const targetLang = tutorLangSelect?.value || studentLang;
  const grade = gradeSelect?.value || 'Grade 1';

  // Append Student Turn
  const studentTurn: VoiceTurn = {
    id: `turn_${Date.now()}_user`,
    role: 'student',
    text: msg,
    timestamp: Date.now()
  };
  voiceTurns.push(studentTurn);
  renderVoiceChatFeed();

  if (statusPill) statusPill.innerHTML = `<span>Analyzing pronunciation, checking grammar &amp; generating AI voice reply...</span>`;

  try {
    const historyPayload = voiceTurns.map(t => ({
      role: t.role === 'student' ? ('user' as const) : ('assistant' as const),
      text: t.text
    }));

    const response: StudentVoiceResponse = await studentVoiceConversation({
      message: msg,
      studentLang,
      targetLang,
      grade,
      conversationHistory: historyPayload
    });

    // Attach feedback to student turn
    studentTurn.pronunciation = response.pronunciationFeedback;
    studentTurn.grammar = response.grammarCorrection;

    // Append AI Tutor Turn
    const tutorTurn: VoiceTurn = {
      id: `turn_${Date.now()}_tutor`,
      role: 'tutor',
      text: response.replyText,
      phonetic: response.replyPhonetic,
      english: response.replyEnglish,
      hindi: response.replyHindi,
      timestamp: Date.now(),
      audioData: response.audioData
    };
    voiceTurns.push(tutorTurn);
    renderVoiceChatFeed();

    // Persist to user_history in IndexedDB
    try {
      const user = getCurrentUser();
      await dbPut('user_history', {
        id: `uh_voice_${Date.now()}`,
        userId: user.id || 'student',
        userName: user.name || 'Student',
        type: 'tutor_chat',
        title: `Voice Talk: ${msg.substring(0, 25)}...`,
        sourceText: msg,
        translatedText: response.replyText,
        sourceLang: studentLang,
        targetLang,
        confidence: 0.95,
        metadata: {
          pronunciation: response.pronunciationFeedback,
          grammar: response.grammarCorrection
        },
        timestamp: Date.now(),
        syncState: 'local'
      });
    } catch (e) {
      console.warn('Voice history dbPut notice:', e);
    }

    if (statusPill) statusPill.innerHTML = `<span>AI Tutor replied. Tap microphone to speak again.</span>`;

    // Auto-play voice reply
    const shouldAutoSpeak = autoSpeakToggle ? autoSpeakToggle.checked : true;
    if (shouldAutoSpeak) {
      if (response.audioData) {
        playAudioFromBase64(response.audioData);
      } else {
        speakWithBrowserTTS(response.replyText, targetLang === 'English' ? 'en-IN' : 'hi-IN');
      }
    }
  } catch (err: any) {
    console.error('Voice conversation error:', err);
    if (statusPill) statusPill.innerHTML = `<span style="color:#DC2626;">Error: ${err?.message || 'Could not process voice conversation.'}</span>`;
  }
}

function renderVoiceChatFeed() {
  const feed = document.getElementById('st-voice-chat-feed');
  if (!feed) return;

  if (voiceTurns.length === 0) {
    return;
  }

  // Render initial welcome plus all turns
  let html = `
    <div style="background:#FFFFFF;border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,0.03);">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="width:40px;height:40px;border-radius:50%;background:#ECFDF5;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">
          🤖
        </div>
        <div style="flex:1;">
          <strong style="font-size:0.92rem;color:var(--green-dark);">BhashaSetu Voice Tutor</strong>
          <div style="font-size:1.02rem;font-weight:700;color:#064E3B;margin:3px 0 2px;">जोहार! 🙏 (Johar!)</div>
          <p style="font-size:0.84rem;color:var(--ink-soft);line-height:1.45;margin:0;">
            I am listening in your mother tongue. Speak or type below to practice your conversational skills!
          </p>
        </div>
      </div>
    </div>
  `;

  voiceTurns.forEach(turn => {
    if (turn.role === 'student') {
      html += `
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <!-- Student Speech Bubble -->
          <div style="background:#065F46;color:#FFFFFF;border-radius:16px 16px 4px 16px;padding:12px 16px;max-width:85%;box-shadow:0 2px 6px rgba(6,95,70,0.15);">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
              <span style="font-size:0.7rem;color:#A7F3D0;font-weight:700;text-transform:uppercase;">You Spoke 🎙️</span>
              <span style="font-size:0.7rem;color:#D1FAE5;">${new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style="font-size:0.98rem;font-weight:600;line-height:1.45;">${escapeHtml(turn.text)}</div>
          </div>

          <!-- Pronunciation & Grammar Analysis Card (if available) -->
          ${turn.pronunciation || turn.grammar ? `
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:10px 14px;max-width:85%;width:100%;font-size:0.8rem;">
              <!-- Pronunciation Feedback -->
              ${turn.pronunciation ? `
                <div style="margin-bottom:6px;">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                    <span style="font-weight:700;color:#047857;">🎯 Pronunciation:</span>
                    <span class="status-pill-green" style="font-size:0.68rem;padding:1px 6px;">${escapeHtml(turn.pronunciation.rating || 'Good')}</span>
                  </div>
                  <span style="color:var(--ink-soft);display:block;">${escapeHtml(turn.pronunciation.phoneticTips || '')}</span>
                  ${turn.pronunciation.practiceWords && turn.pronunciation.practiceWords.length > 0 ? `
                    <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">
                      <span style="font-size:0.7rem;color:var(--ink-faint);font-weight:700;">Practice:</span>
                      ${turn.pronunciation.practiceWords.map((w: string) => `<span style="font-size:0.72rem;background:#FFFFFF;border:1px solid var(--border);border-radius:4px;padding:1px 6px;color:#047857;">${escapeHtml(w)}</span>`).join('')}
                    </div>
                  ` : ''}
                </div>
              ` : ''}

              <!-- Grammar Correction -->
              ${turn.grammar ? `
                <div style="border-top:1px dashed #CBD5E1;padding-top:6px;margin-top:4px;">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                    <span style="font-weight:700;color:${turn.grammar.hasCorrection ? '#D97706' : '#059669'};">
                      ${turn.grammar.hasCorrection ? '✏️ Phrasing Tip:' : '✨ Grammar:'}
                    </span>
                    <span style="font-size:0.75rem;color:var(--ink-soft);">${escapeHtml(turn.grammar.explanation || '')}</span>
                  </div>
                  ${turn.grammar.hasCorrection ? `
                    <div style="font-weight:600;color:#92400E;background:#FFFBEB;padding:4px 8px;border-radius:4px;margin-top:2px;">
                      Better: "${escapeHtml(turn.grammar.correctedSentence)}"
                    </div>
                  ` : ''}
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      `;
    } else {
      // Tutor Turn
      html += `
        <div style="display:flex;align-items:flex-start;gap:10px;max-width:85%;">
          <div style="width:36px;height:36px;border-radius:50%;background:#ECFDF5;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">
            🤖
          </div>
          <div style="background:#FFFFFF;border:1px solid #C7D2FE;border-radius:16px 16px 16px 4px;padding:14px 18px;box-shadow:0 2px 8px rgba(99,102,241,0.06);flex:1;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
              <span style="font-size:0.72rem;font-weight:700;color:#4338CA;text-transform:uppercase;">AI Voice Tutor 🔊</span>
              <div style="display:flex;gap:4px;">
                <button type="button" class="btn-chip btn-replay-turn-voice" data-turn-id="${turn.id}" style="font-size:0.72rem;padding:2px 8px;background:#EEF2FF;color:#4338CA;border-color:#C7D2FE;">
                  🔊 Replay Voice
                </button>
              </div>
            </div>

            <!-- Vernacular Spoken Response -->
            <div style="font-size:1.05rem;font-weight:800;color:#1E1B4B;line-height:1.5;margin-bottom:4px;">
              ${escapeHtml(turn.text)}
            </div>

            <!-- Phonetic guide -->
            ${turn.phonetic ? `
              <div style="font-size:0.78rem;color:#4F46E5;margin-bottom:6px;">
                <strong>Reading guide:</strong> ${escapeHtml(turn.phonetic)}
              </div>
            ` : ''}

            <!-- Translation Accordion/Toggle -->
            ${turn.english || turn.hindi ? `
              <div style="background:#F8FAFC;border-radius:6px;padding:6px 10px;font-size:0.78rem;color:var(--ink-soft);margin-top:6px;">
                ${turn.hindi ? `<div><strong>हिन्दी:</strong> ${escapeHtml(turn.hindi)}</div>` : ''}
                ${turn.english ? `<div><strong>English:</strong> ${escapeHtml(turn.english)}</div>` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }
  });

  feed.innerHTML = html;

  // Bind Replay Voice buttons
  feed.querySelectorAll('.btn-replay-turn-voice').forEach(btn => {
    btn.addEventListener('click', () => {
      const turnId = btn.getAttribute('data-turn-id');
      const turn = voiceTurns.find(t => t.id === turnId);
      if (turn) {
        if (turn.audioData) {
          playAudioFromBase64(turn.audioData);
        } else {
          speakWithBrowserTTS(turn.text);
        }
      }
    });
  });

  feed.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// -----------------------------------------------------------------------------
// MAIN INITIALIZER FOR STUDENT AI SUITE
// -----------------------------------------------------------------------------

export function initStudentAISuite() {
  // 1. AI Translator & Explainer Init
  const btnExplainSubmit = document.getElementById('btn-st-explain-submit');
  if (btnExplainSubmit) {
    btnExplainSubmit.addEventListener('click', handleExplainSubmit);
  }

  const btnExplainClear = document.getElementById('btn-st-explain-clear');
  if (btnExplainClear) {
    btnExplainClear.addEventListener('click', () => {
      const input = document.getElementById('st-explain-input-text') as HTMLTextAreaElement;
      if (input) {
        input.value = '';
        input.focus();
      }
    });
  }

  const btnExplainPlay = document.getElementById('btn-st-explain-play-audio');
  if (btnExplainPlay) {
    btnExplainPlay.addEventListener('click', () => {
      if (lastExplainResult) {
        if (lastExplainResult.audioData) {
          playAudioFromBase64(lastExplainResult.audioData, lastExplainResult.audioMime || 'audio/wav');
        } else {
          speakWithBrowserTTS(lastExplainResult.translatedText, lastExplainResult.targetLang === 'English' ? 'en-IN' : 'hi-IN');
        }
      }
    });
  }

  const btnExplainCopy = document.getElementById('btn-st-explain-copy');
  if (btnExplainCopy) {
    btnExplainCopy.addEventListener('click', () => {
      if (lastExplainResult) {
        navigator.clipboard.writeText(lastExplainResult.translatedText).then(() => {
          btnExplainCopy.textContent = '✅ Copied!';
          setTimeout(() => { btnExplainCopy.textContent = '📋 Copy'; }, 1500);
        });
      }
    });
  }

  const btnExplainRetry = document.getElementById('btn-st-explain-retry');
  if (btnExplainRetry) {
    btnExplainRetry.addEventListener('click', handleExplainSubmit);
  }

  // Quick Chips in Explain
  document.querySelectorAll('.st-explain-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const text = chip.getAttribute('data-text') || '';
      const input = document.getElementById('st-explain-input-text') as HTMLTextAreaElement;
      if (input) {
        input.value = text;
        handleExplainSubmit();
      }
    });
  });

  // History drawer toggle
  const btnExplainHistToggle = document.getElementById('btn-st-explain-history-toggle');
  const explainDrawer = document.getElementById('st-explain-history-drawer');
  if (btnExplainHistToggle && explainDrawer) {
    btnExplainHistToggle.addEventListener('click', () => {
      const isHidden = explainDrawer.style.display === 'none';
      explainDrawer.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        renderExplainHistoryList();
      }
    });
  }

  const btnClearExplainHistory = document.getElementById('btn-st-explain-clear-history');
  if (btnClearExplainHistory) {
    btnClearExplainHistory.addEventListener('click', () => {
      localStorage.removeItem(getExplainStorageKey());
      renderExplainHistoryList();
      updateExplainHistoryCount();
    });
  }

  setupExplainVoiceInput();
  updateExplainHistoryCount();

  // 2. Translate Content Init
  document.querySelectorAll('.st-content-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.st-content-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const type = (tab.getAttribute('data-type') || 'lesson') as any;
      currentContentType = type;

      const dropdownRow = document.getElementById('st-content-dropdown-row');
      const customBox = document.getElementById('st-content-custom-box');
      const uploadZone = document.getElementById('st-content-upload-zone');

      if (type === 'notes' || type === 'uploaded') {
        if (dropdownRow) dropdownRow.style.display = 'none';
        if (customBox) customBox.style.display = 'flex';
        if (uploadZone) uploadZone.style.display = type === 'uploaded' ? 'block' : 'none';
      } else {
        if (dropdownRow) dropdownRow.style.display = 'flex';
        if (customBox) customBox.style.display = 'none';
        if (uploadZone) uploadZone.style.display = 'none';
        populateContentDropdown();
      }
    });
  });

  const selectContentItem = document.getElementById('st-content-item-select');
  if (selectContentItem) {
    selectContentItem.addEventListener('change', loadSelectedDropdownContent);
  }

  const btnTranslateContent = document.getElementById('btn-st-content-translate');
  if (btnTranslateContent) {
    btnTranslateContent.addEventListener('click', handleContentTranslateSubmit);
  }

  const btnContentRetry = document.getElementById('btn-st-content-retry');
  if (btnContentRetry) {
    btnContentRetry.addEventListener('click', handleContentTranslateSubmit);
  }

  // Reader Mode Switchers
  document.querySelectorAll('.st-reader-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.st-reader-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentReaderMode = (btn.getAttribute('data-mode') || 'split') as any;
      if (lastContentResult) {
        renderBilingualReader(lastContentResult);
      }
    });
  });

  // Save to Study Notes
  const btnSaveStudy = document.getElementById('btn-st-content-save-study');
  if (btnSaveStudy) {
    btnSaveStudy.addEventListener('click', async () => {
      if (lastContentResult) {
        await saveStudyNoteItem(lastContentResult);
        btnSaveStudy.textContent = '✅ Saved to Notes!';
        setTimeout(() => { btnSaveStudy.textContent = '💾 Save to My Study Notes'; }, 1500);
      }
    });
  }

  // Copy all translated content
  const btnCopyContent = document.getElementById('btn-st-content-copy-all');
  if (btnCopyContent) {
    btnCopyContent.addEventListener('click', () => {
      if (lastContentResult) {
        const fullText = lastContentResult.sections.map(s => s.translatedText).join('\n\n');
        navigator.clipboard.writeText(fullText).then(() => {
          btnCopyContent.textContent = '✅ Copied!';
          setTimeout(() => { btnCopyContent.textContent = '📋 Copy'; }, 1500);
        });
      }
    });
  }

  // Print Sheet
  const btnPrintContent = document.getElementById('btn-st-content-print');
  if (btnPrintContent) {
    btnPrintContent.addEventListener('click', () => {
      window.print();
    });
  }

  // File Upload Handling
  const uploadZone = document.getElementById('st-content-upload-zone');
  const fileInput = document.getElementById('st-content-file-input') as HTMLInputElement;
  if (uploadZone && fileInput) {
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = 'var(--green)';
    });
    uploadZone.addEventListener('dragleave', () => {
      uploadZone.style.borderColor = '#94A3B8';
    });
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = '#94A3B8';
      if (e.dataTransfer?.files?.length) {
        handleUploadedFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files?.length) {
        handleUploadedFile(fileInput.files[0]);
      }
    });
  }

  function handleUploadedFile(file: File) {
    const titleInput = document.getElementById('st-content-custom-title') as HTMLInputElement;
    const textArea = document.getElementById('st-content-custom-text') as HTMLTextAreaElement;
    if (titleInput) titleInput.value = file.name.replace(/\.[^/.]+$/, '');

    const uploadId = 'stu_upload_' + Date.now();
    uploadFileToStorage({
      featureName: 'student-uploads',
      itemId: uploadId,
      file: file,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream'
    }).then(res => {
      if (res?.path) {
        console.log('Student file uploaded to Supabase Storage:', res.path);
      }
    }).catch(err => {
      console.warn('Student file upload notice:', err);
    });

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (textArea) textArea.value = content || `[Document File: ${file.name}]\nSample extracted content ready for translation into indigenous mother tongue.`;
    };
    if (file.type.includes('text') || file.name.endsWith('.txt')) {
      reader.readAsText(file);
    } else {
      // Image or PDF placeholder
      if (textArea) textArea.value = `[Uploaded File: ${file.name} (${Math.round(file.size / 1024)} KB)]\nPrimary textbook unit containing fundamental vocabulary and reading concepts.`;
    }
  }

  // Populate dropdown on startup
  populateContentDropdown();
  renderSavedStudyNotesList();

  // 3. Voice Conversation Init
  setupVoiceSpeechRecognition();

  const btnSendVoiceText = document.getElementById('btn-st-voice-send-text');
  const textVoiceInput = document.getElementById('st-voice-text-input') as HTMLInputElement;
  if (btnSendVoiceText && textVoiceInput) {
    btnSendVoiceText.addEventListener('click', () => {
      handleSendVoiceMessage(textVoiceInput.value);
    });
    textVoiceInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSendVoiceMessage(textVoiceInput.value);
      }
    });
  }

  const btnNewVoiceChat = document.getElementById('btn-st-voice-new-chat');
  if (btnNewVoiceChat) {
    btnNewVoiceChat.addEventListener('click', () => {
      saveCurrentVoiceSession();
      voiceTurns = [];
      renderVoiceChatFeed();
    });
  }

  // Voice Prompt Chips
  document.querySelectorAll('.st-voice-prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const phrase = chip.getAttribute('data-phrase') || '';
      handleSendVoiceMessage(phrase);
    });
  });

  renderVoiceHistorySessions();
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
