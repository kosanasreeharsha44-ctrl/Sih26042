// ============================================================================
// BhashaSetu - Multilingual Quiz Manager & Student Progress Security Controller
// Teacher Quiz Authoring (4-options, correct answer selection, reordering)
// Student Quiz Runner, Submission, Personal Progress Tracking & RBAC Enforcement
// ============================================================================

import {
  dbGet,
  dbGetAll,
  dbPut,
  dbDelete,
  QuizRecord,
  QuizQuestion,
  QuizSubmissionRecord,
  getStudentProgressForUser,
  getQuizzesForUser,
  getQuizSubmissionsForUser,
  saveQuizSubmission,
  logAudit
} from './db';

import { getCurrentUser, isTeacher, isStudent } from './auth';
import { showToast, switchView, audio } from './app';

// In-memory state for Quiz Authoring
let editingQuizId: string | null = null;
let editingQuestions: QuizQuestion[] = [];

// In-memory state for Quiz Runner (Student Mode)
let activeQuiz: QuizRecord | null = null;
let currentQuestionIndex = 0;
let studentAnswers: Record<number, number> = {};

// Active Filter for Quizzes list ('all' | 'published' | 'draft')
let currentQuizFilter: 'all' | 'published' | 'draft' = 'all';

// ===================== SEED INITIAL QUIZZES =====================
export async function seedDefaultQuizzesIfEmpty() {
  const existing = await dbGetAll<QuizRecord>('quizzes');
  if (existing.length > 0) return;

  const defaultQuizzes: QuizRecord[] = [
    {
      id: 'quiz_nature_ho',
      title: '🌿 Forest Animals & Birds (Ho & Hindi)',
      description: 'Test your understanding of tribal forest biodiversity, animal names in Ho, and nature conservation.',
      language: 'Ho',
      grade: 'Grade 1',
      subject: 'Environmental Studies',
      authorId: 'teacher_sunita',
      authorName: 'Sunita Soren',
      published: true,
      createdAt: Date.now() - 86400000 * 2,
      updatedAt: Date.now(),
      questions: [
        {
          id: 'q1_forest',
          question: 'What is the Ho word for "Tree" (पेड़)?',
          options: ['दारू (Daru / 𑲂𑱵𑲄𑲁)', 'सेता (Seta)', 'दाः (Dah)', 'ओड़ाः (Orah)'],
          correctOptionIndex: 0,
          explanation: '"Daru" (दारू) means Tree in Ho language. Seta means dog and Dah means water.'
        },
        {
          id: 'q2_forest',
          question: 'Which of these is a friendly forest animal that helps maintain soil health?',
          options: ['Earthworm (केंचुआ)', 'Plastic Bottle', 'Iron Wire', 'Smoke'],
          correctOptionIndex: 0,
          explanation: 'Earthworms are natural friends of forest soil and agricultural fields.'
        },
        {
          id: 'q3_forest',
          question: 'How do plants prepare food in the presence of sunlight?',
          options: ['Photosynthesis (प्रकाश संश्लेषण)', 'Cooking on a Stove', 'Sleeping', 'Freezing'],
          correctOptionIndex: 0,
          explanation: 'Green leaves synthesize food through photosynthesis using sunlight, water, and air.'
        }
      ]
    },
    {
      id: 'quiz_numeracy_ho',
      title: '🔢 Counting & Shapes in Mother Tongue',
      description: 'Foundational numeracy quiz testing counting 1 to 10 in Ho and Mundari.',
      language: 'Ho',
      grade: 'Grade 1',
      subject: 'Numeracy & Math',
      authorId: 'teacher_sunita',
      authorName: 'Sunita Soren',
      published: true,
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now(),
      questions: [
        {
          id: 'q1_num',
          question: 'What is the number "Two" called in Ho?',
          options: ['मियाद (Miyad - 1)', 'बारिया (Bariya - 2)', 'आपिया (Apiya - 3)', 'उपोनिया (Uponiya - 4)'],
          correctOptionIndex: 1,
          explanation: 'In Ho counting: 1 is Miyad, 2 is Bariya, 3 is Apiya, and 4 is Uponiya.'
        },
        {
          id: 'q2_num',
          question: 'If you have 3 wild mangoes and pick 2 more, how many do you have in total?',
          options: ['3 mangoes', '4 mangoes', '5 mangoes (मोनेया / Mōneya)', '10 mangoes'],
          correctOptionIndex: 2,
          explanation: '3 + 2 = 5 (Mōneya in Ho language).'
        }
      ]
    },
    {
      id: 'quiz_water_cycle',
      title: '💧 Water in Our Village (झरना और कुआँ)',
      description: 'Classroom discussion on clean drinking water and village wells.',
      language: 'Hindi',
      grade: 'Grade 2',
      subject: 'Environmental Studies',
      authorId: 'teacher_sunita',
      authorName: 'Sunita Soren',
      published: true,
      createdAt: Date.now() - 3600000 * 4,
      updatedAt: Date.now(),
      questions: [
        {
          id: 'q1_water',
          question: 'Why should village well water be boiled or filtered before drinking?',
          options: ['To kill harmful bacteria & germs', 'To change its color', 'To make it salty', 'To make it heavier'],
          correctOptionIndex: 0,
          explanation: 'Boiling kills germs and bacteria, keeping children safe from water-borne diseases.'
        },
        {
          id: 'q2_water',
          question: 'What should we do when rain falls during monsoon?',
          options: ['Harvest and store rainwater for gardens and crops', 'Let it all run into sewage waste', 'Block school paths', 'Stop washing hands'],
          correctOptionIndex: 0,
          explanation: 'Rainwater harvesting replenishes ground water and helps during dry summer months.'
        }
      ]
    }
  ];

  for (const q of defaultQuizzes) {
    await dbPut('quizzes', q);
  }

  // Also seed an initial quiz submission for Asha Kumari if not already present
  const existingSubs = await dbGetAll<QuizSubmissionRecord>('quiz_submissions');
  if (existingSubs.length === 0) {
    const demoSub: QuizSubmissionRecord = {
      id: 'sub_demo_asha_1',
      quizId: 'quiz_nature_ho',
      quizTitle: '🌿 Forest Animals & Birds (Ho & Hindi)',
      studentId: 'student_asha',
      studentName: 'Asha Kumari',
      answers: {
        0: 0,
        1: 0,
        2: 0
      },
      score: 3,
      totalQuestions: 3,
      percentage: 100,
      submittedAt: Date.now() - 86400000
    };
    await saveQuizSubmission(demoSub);
  }
}

// ===================== REFRESH QUIZZES LIST (VIEW-QUIZZES) =====================
export async function refreshQuizzesList() {
  const user = getCurrentUser();
  const listContainer = document.getElementById('quizzes-cards-grid');
  if (!listContainer) return;

  // Retrieve quizzes permitted for current user (filtered by RBAC)
  const quizzes = await getQuizzesForUser(user);

  // Apply status filter ('all', 'published', 'draft')
  const filtered = quizzes.filter(q => {
    if (currentQuizFilter === 'all') return true;
    if (currentQuizFilter === 'published') return q.published;
    if (currentQuizFilter === 'draft') return !q.published;
    return true;
  });

  const isTeacherUser = isTeacher();

  // Update Draft tab pill count
  const draftPill = document.getElementById('quiz-pill-draft');
  if (draftPill) {
    if (isTeacherUser) {
      draftPill.style.display = 'inline-block';
      const draftCount = quizzes.filter(q => !q.published).length;
      draftPill.textContent = `Drafts (${draftCount})`;
    } else {
      draftPill.style.display = 'none';
    }
  }

  // Update Create Quiz button visibility
  const createQuizBtn = document.getElementById('btn-open-create-quiz');
  if (createQuizBtn) {
    createQuizBtn.style.display = isTeacherUser ? 'inline-flex' : 'none';
  }

  // Fetch student submissions if student
  let studentSubmissions: QuizSubmissionRecord[] = [];
  if (!isTeacherUser) {
    studentSubmissions = await getQuizSubmissionsForUser(user);
  }

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; background: #FAFBFB; border: 1px dashed var(--border); border-radius: 12px;">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">🎯</div>
        <div style="font-weight: 700; color: var(--ink); font-size: 1.05rem;">No Quizzes Found</div>
        <p style="font-size: 0.82rem; color: var(--ink-soft); max-width: 420px; margin: 6px auto 16px;">
          ${isTeacherUser ? 'Create your first 4-choice multilingual quiz for primary students!' : 'No classroom quizzes are currently published by your teacher.'}
        </p>
        ${isTeacherUser ? `<button type="button" id="btn-empty-create-quiz" class="btn-solid-green" style="width:auto;margin:0 auto;padding:8px 20px;">+ Create Quiz Now</button>` : ''}
      </div>
    `;

    document.getElementById('btn-empty-create-quiz')?.addEventListener('click', () => {
      openQuizEditor();
    });
    return;
  }

  listContainer.innerHTML = filtered.map(q => {
    const isDraft = !q.published;
    const numQ = q.questions ? q.questions.length : 0;
    
    // Check if student already attempted this quiz
    const attempt = studentSubmissions.find(s => s.quizId === q.id);
    const hasAttempted = !!attempt;

    return `
      <div class="tool-card-modern" style="display:flex;flex-direction:column;justify-content:space-between;padding:18px;background:#FFF;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04);transition:transform 0.15s ease,box-shadow 0.15s ease;">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="status-pill-green" style="font-size:0.72rem;padding:2px 8px;">${q.language || 'Ho'}</span>
              <span style="font-size:0.72rem;background:#F1F5F9;color:var(--ink);padding:2px 8px;border-radius:4px;font-weight:600;">${q.grade || 'Grade 1'}</span>
              <span style="font-size:0.72rem;color:var(--ink-soft);">${q.subject || 'General'}</span>
            </div>
            ${isDraft ? `<span style="font-size:0.72rem;background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:99px;font-weight:700;">Draft</span>` : `<span style="font-size:0.72rem;background:#DCFCE7;color:#15803D;padding:2px 8px;border-radius:99px;font-weight:700;">Published</span>`}
          </div>

          <h3 style="font-size:1.05rem;font-weight:700;color:var(--ink);margin:0 0 6px;line-height:1.4;">${q.title}</h3>
          <p style="font-size:0.8rem;color:var(--ink-soft);margin:0 0 12px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
            ${q.description || 'Interactive 4-choice quiz questions designed for foundational learning.'}
          </p>

          <div style="display:flex;align-items:center;gap:14px;font-size:0.76rem;color:var(--ink-soft);margin-bottom:14px;">
            <span>❓ <strong>${numQ}</strong> Questions</span>
            <span>👩‍🏫 <strong>${q.authorName || 'Teacher'}</strong></span>
            ${hasAttempted ? `<span style="color:#15803D;font-weight:700;">✓ Completed (${attempt.percentage}%)</span>` : ''}
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border-light);padding-top:12px;margin-top:auto;">
          ${isTeacherUser ? `
            <div style="display:flex;gap:6px;">
              <button type="button" class="btn-chip btn-edit-quiz" data-quiz-id="${q.id}" style="margin:0;padding:5px 12px;font-size:0.78rem;">
                ✏️ Edit
              </button>
              <button type="button" class="btn-chip btn-view-quiz-subs" data-quiz-id="${q.id}" style="margin:0;padding:5px 12px;font-size:0.78rem;background:#F0FDF4;color:#15803D;border-color:#BBF7D0;">
                📊 Submissions
              </button>
              <button type="button" class="btn-chip btn-delete-quiz" data-quiz-id="${q.id}" style="margin:0;padding:5px 10px;font-size:0.78rem;color:#DC2626;border-color:#FECACA;">
                🗑️
              </button>
            </div>
            <button type="button" class="btn-solid-green btn-preview-quiz" data-quiz-id="${q.id}" style="width:auto;margin:0;padding:5px 14px;font-size:0.78rem;">
              Preview ▶
            </button>
          ` : `
            <div style="font-size:0.78rem;color:var(--ink-soft);">
              ${hasAttempted ? `Score: <strong style="color:#15803D;">${attempt.score}/${attempt.totalQuestions}</strong>` : 'Ready to start'}
            </div>
            <button type="button" class="btn-solid-green btn-take-quiz" data-quiz-id="${q.id}" style="width:auto;margin:0;padding:6px 18px;font-size:0.82rem;font-weight:700;">
              ${hasAttempted ? 'Retake Quiz 🔄' : 'Start Quiz ▶'}
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');

  // Wire action buttons
  if (isTeacherUser) {
    listContainer.querySelectorAll('.btn-edit-quiz').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-quiz-id');
        if (id) openQuizEditor(id);
      });
    });

    listContainer.querySelectorAll('.btn-view-quiz-subs').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-quiz-id');
        if (id) openQuizSubmissionsModal(id);
      });
    });

    listContainer.querySelectorAll('.btn-delete-quiz').forEach(b => {
      b.addEventListener('click', async (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-quiz-id');
        if (!id) return;
        if (confirm('Are you sure you want to delete this quiz?')) {
          await dbDelete('quizzes', id);
          logAudit('DELETE_QUIZ', `Deleted quiz ${id}`);
          showToast('Quiz deleted successfully.', '🗑️');
          await refreshQuizzesList();
          await refreshStudentQuizzesForPortal();
        }
      });
    });

    listContainer.querySelectorAll('.btn-preview-quiz').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-quiz-id');
        if (id) openQuizRunner(id);
      });
    });
  } else {
    listContainer.querySelectorAll('.btn-take-quiz').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-quiz-id');
        if (id) openQuizRunner(id);
      });
    });
  }
}

// ===================== REFRESH STUDENT QUIZZES FOR STUDENT PORTAL =====================
export async function refreshStudentQuizzesForPortal() {
  const container = document.getElementById('student-portal-quizzes-list');
  if (!container) return;

  const user = getCurrentUser();
  const quizzes = await getQuizzesForUser(user);
  const submissions = await getQuizSubmissionsForUser(user);

  if (quizzes.length === 0) {
    container.innerHTML = `
      <div style="padding:16px;background:#FAFBFB;border:1px dashed var(--border);border-radius:8px;text-align:center;font-size:0.8rem;color:var(--ink-soft);">
        No classroom quizzes available right now. Check back soon!
      </div>
    `;
    return;
  }

  container.innerHTML = quizzes.slice(0, 3).map(q => {
    const sub = submissions.find(s => s.quizId === q.id);
    const hasAttempted = !!sub;

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#FFF;border:1px solid var(--border);border-radius:8px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:1.4rem;">🎯</span>
          <div>
            <div style="font-size:0.86rem;font-weight:700;color:var(--ink);">${q.title}</div>
            <div style="font-size:0.72rem;color:var(--ink-soft);margin-top:2px;">
              ${q.questions.length} Questions • ${q.language} • ${q.subject}
              ${hasAttempted ? ` • <strong style="color:#15803D;">Score: ${sub.score}/${sub.totalQuestions} (${sub.percentage}%)</strong>` : ''}
            </div>
          </div>
        </div>
        <button type="button" class="btn-solid-green btn-portal-start-quiz" data-quiz-id="${q.id}" style="width:auto;margin:0;padding:5px 14px;font-size:0.76rem;font-weight:700;">
          ${hasAttempted ? 'Review / Retake ➔' : 'Take Quiz ➔'}
        </button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-portal-start-quiz').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).getAttribute('data-quiz-id');
      if (id) openQuizRunner(id);
    });
  });
}

// ===================== TEACHER QUIZ EDITOR CONTROLLER =====================
export function openQuizEditor(quizId?: string) {
  if (!isTeacher()) {
    showToast('Only teachers can create or edit quizzes.', '⚠️');
    return;
  }

  const modal = document.getElementById('modal-quiz-editor');
  if (!modal) return;

  const titleModal = document.getElementById('quiz-editor-modal-title');
  const idInput = document.getElementById('quiz-edit-id') as HTMLInputElement;
  const titleInput = document.getElementById('quiz-edit-title') as HTMLInputElement;
  const langSelect = document.getElementById('quiz-edit-language') as HTMLSelectElement;
  const gradeSelect = document.getElementById('quiz-edit-grade') as HTMLSelectElement;
  const subjSelect = document.getElementById('quiz-edit-subject') as HTMLSelectElement;
  const descInput = document.getElementById('quiz-edit-desc') as HTMLInputElement;
  const feedback = document.getElementById('quiz-editor-feedback');

  if (feedback) feedback.style.display = 'none';

  if (quizId) {
    editingQuizId = quizId;
    if (titleModal) titleModal.textContent = 'Edit Multilingual Quiz';
    if (idInput) idInput.value = quizId;

    // Load from DB
    dbGet<QuizRecord>('quizzes', quizId).then(q => {
      if (!q) return;
      if (titleInput) titleInput.value = q.title;
      if (langSelect) langSelect.value = q.language || 'Ho';
      if (gradeSelect) gradeSelect.value = q.grade || 'Grade 1';
      if (subjSelect) subjSelect.value = q.subject || 'Environmental Studies';
      if (descInput) descInput.value = q.description || '';
      editingQuestions = q.questions && q.questions.length > 0 ? JSON.parse(JSON.stringify(q.questions)) : [createNewQuestion(1)];
      renderEditorQuestions();
    });
  } else {
    editingQuizId = null;
    if (titleModal) titleModal.textContent = 'Create Multilingual Quiz';
    if (idInput) idInput.value = '';
    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';
    // Start with 2 initial question templates
    editingQuestions = [
      createNewQuestion(1),
      createNewQuestion(2)
    ];
    renderEditorQuestions();
  }

  modal.style.display = 'flex';
}

function createNewQuestion(index: number): QuizQuestion {
  return {
    id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    question: '',
    options: ['', '', '', ''],
    correctOptionIndex: 0,
    explanation: ''
  };
}

function renderEditorQuestions() {
  const container = document.getElementById('quiz-edit-questions-list');
  if (!container) return;

  if (editingQuestions.length === 0) {
    editingQuestions.push(createNewQuestion(1));
  }

  container.innerHTML = editingQuestions.map((q, qIndex) => {
    return `
      <div class="quiz-question-editor-card" data-qindex="${qIndex}" style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;padding:16px;">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #E2E8F0;padding-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="background:var(--green);color:#FFF;width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;">
              ${qIndex + 1}
            </span>
            <strong style="font-size:0.88rem;color:var(--ink);">Question ${qIndex + 1}</strong>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <button type="button" class="btn-chip btn-q-move-up" data-qindex="${qIndex}" ${qIndex === 0 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} style="margin:0;padding:3px 8px;font-size:0.75rem;" title="Move Up">
              ▲ Up
            </button>
            <button type="button" class="btn-chip btn-q-move-down" data-qindex="${qIndex}" ${qIndex === editingQuestions.length - 1 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} style="margin:0;padding:3px 8px;font-size:0.75rem;" title="Move Down">
              ▼ Down
            </button>
            <button type="button" class="btn-chip btn-q-delete" data-qindex="${qIndex}" style="margin:0;padding:3px 8px;font-size:0.75rem;color:#DC2626;border-color:#FECACA;" title="Delete Question">
              🗑️ Delete
            </button>
          </div>
        </div>

        <!-- Question prompt -->
        <div style="margin-bottom:12px;">
          <label style="font-size:0.75rem;font-weight:600;display:block;margin-bottom:4px;color:var(--ink);">Question Text *</label>
          <input type="text" class="input-form-elem q-prompt-input" data-qindex="${qIndex}" value="${escapeHtml(q.question)}" placeholder="e.g. What is the vernacular name for 'Tree' in Ho?" required style="width:100%;">
        </div>

        <!-- Exactly 4 Options with radio selector for correct answer -->
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <label style="font-size:0.75rem;font-weight:600;color:var(--ink);">4 Answer Options (Select which one is Correct)</label>
            <span style="font-size:0.72rem;color:var(--green-dark);font-weight:600;">● Radio button marks correct answer</span>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;">
            ${['A', 'B', 'C', 'D'].map((letter, optIdx) => {
              const isCorrect = q.correctOptionIndex === optIdx;
              const val = q.options[optIdx] || '';
              return `
                <div style="display:flex;align-items:center;gap:8px;background:#FFF;padding:6px 10px;border-radius:8px;border:1px solid ${isCorrect ? 'var(--green)' : '#E2E8F0'};box-shadow:${isCorrect ? '0 0 0 1px var(--green)' : 'none'};">
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;">
                    <input type="radio" name="correct-radio-${qIndex}" class="q-correct-radio" data-qindex="${qIndex}" data-optindex="${optIdx}" ${isCorrect ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--green);cursor:pointer;">
                    <strong style="font-size:0.82rem;color:${isCorrect ? 'var(--green-dark)' : 'var(--ink)'};min-width:20px;">${letter}.</strong>
                  </label>
                  <input type="text" class="input-form-elem q-opt-input" data-qindex="${qIndex}" data-optindex="${optIdx}" value="${escapeHtml(val)}" placeholder="Option ${letter}" required style="flex:1;font-size:0.84rem;padding:6px 10px;">
                  ${isCorrect ? `<span style="font-size:0.72rem;color:var(--green);font-weight:700;">✓ Correct</span>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Optional Explanation -->
        <div>
          <label style="font-size:0.75rem;font-weight:600;display:block;margin-bottom:4px;color:var(--ink-soft);">Explanation / Teacher Note (Shown after student answers)</label>
          <input type="text" class="input-form-elem q-expl-input" data-qindex="${qIndex}" value="${escapeHtml(q.explanation || '')}" placeholder="e.g. Daru (दारू) is the Ho vernacular word for tree." style="width:100%;font-size:0.82rem;">
        </div>
      </div>
    `;
  }).join('');

  // Wire Question Reordering
  container.querySelectorAll('.btn-q-move-up').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-qindex') || '0', 10);
      if (idx > 0) {
        syncEditorInputsToState();
        const temp = editingQuestions[idx];
        editingQuestions[idx] = editingQuestions[idx - 1];
        editingQuestions[idx - 1] = temp;
        renderEditorQuestions();
      }
    });
  });

  container.querySelectorAll('.btn-q-move-down').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-qindex') || '0', 10);
      if (idx < editingQuestions.length - 1) {
        syncEditorInputsToState();
        const temp = editingQuestions[idx];
        editingQuestions[idx] = editingQuestions[idx + 1];
        editingQuestions[idx + 1] = temp;
        renderEditorQuestions();
      }
    });
  });

  // Wire Question Deletion
  container.querySelectorAll('.btn-q-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-qindex') || '0', 10);
      if (editingQuestions.length <= 1) {
        showToast('A quiz must have at least one question.', '⚠️');
        return;
      }
      syncEditorInputsToState();
      editingQuestions.splice(idx, 1);
      renderEditorQuestions();
    });
  });

  // Wire Radio button changes for correct answer
  container.querySelectorAll('.q-correct-radio').forEach(r => {
    r.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const qIdx = parseInt(target.getAttribute('data-qindex') || '0', 10);
      const optIdx = parseInt(target.getAttribute('data-optindex') || '0', 10);
      syncEditorInputsToState();
      editingQuestions[qIdx].correctOptionIndex = optIdx;
      renderEditorQuestions();
    });
  });
}

function syncEditorInputsToState() {
  const container = document.getElementById('quiz-edit-questions-list');
  if (!container) return;

  container.querySelectorAll('.quiz-question-editor-card').forEach(card => {
    const qIdx = parseInt(card.getAttribute('data-qindex') || '0', 10);
    if (!editingQuestions[qIdx]) return;

    const promptInput = card.querySelector('.q-prompt-input') as HTMLInputElement;
    if (promptInput) editingQuestions[qIdx].question = promptInput.value.trim();

    card.querySelectorAll('.q-opt-input').forEach(optInput => {
      const optIdx = parseInt((optInput as HTMLElement).getAttribute('data-optindex') || '0', 10);
      editingQuestions[qIdx].options[optIdx] = (optInput as HTMLInputElement).value.trim();
    });

    const explInput = card.querySelector('.q-expl-input') as HTMLInputElement;
    if (explInput) editingQuestions[qIdx].explanation = explInput.value.trim();
  });
}

async function saveQuizFromEditor(publish: boolean) {
  syncEditorInputsToState();

  const titleInput = document.getElementById('quiz-edit-title') as HTMLInputElement;
  const langSelect = document.getElementById('quiz-edit-language') as HTMLSelectElement;
  const gradeSelect = document.getElementById('quiz-edit-grade') as HTMLSelectElement;
  const subjSelect = document.getElementById('quiz-edit-subject') as HTMLSelectElement;
  const descInput = document.getElementById('quiz-edit-desc') as HTMLInputElement;
  const feedback = document.getElementById('quiz-editor-feedback');

  const title = titleInput?.value.trim();
  if (!title) {
    if (feedback) {
      feedback.style.display = 'block';
      feedback.style.background = '#FEE2E2';
      feedback.style.color = '#B91C1C';
      feedback.textContent = 'Please enter a quiz title.';
    }
    titleInput?.focus();
    return;
  }

  if (editingQuestions.length === 0) {
    if (feedback) {
      feedback.style.display = 'block';
      feedback.style.background = '#FEE2E2';
      feedback.style.color = '#B91C1C';
      feedback.textContent = 'Please add at least one question to the quiz.';
    }
    return;
  }

  // Validate that every question has a prompt, exactly 4 non-empty options, and a selected correct index
  for (let i = 0; i < editingQuestions.length; i++) {
    const q = editingQuestions[i];
    if (!q.question) {
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.background = '#FEE2E2';
        feedback.style.color = '#B91C1C';
        feedback.textContent = `Question ${i + 1} is missing its question text prompt.`;
      }
      return;
    }

    if (!q.options || q.options.length !== 4) {
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.background = '#FEE2E2';
        feedback.style.color = '#B91C1C';
        feedback.textContent = `Question ${i + 1} must have exactly 4 answer options.`;
      }
      return;
    }

    for (let optIdx = 0; optIdx < 4; optIdx++) {
      if (!q.options[optIdx] || q.options[optIdx].trim() === '') {
        if (feedback) {
          feedback.style.display = 'block';
          feedback.style.background = '#FEE2E2';
          feedback.style.color = '#B91C1C';
          feedback.textContent = `Question ${i + 1} option ${['A', 'B', 'C', 'D'][optIdx]} cannot be blank.`;
        }
        return;
      }
    }

    if (q.correctOptionIndex < 0 || q.correctOptionIndex > 3) {
      q.correctOptionIndex = 0;
    }
  }

  const user = getCurrentUser();
  const quizId = editingQuizId || `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const existingQuiz = editingQuizId ? await dbGet<QuizRecord>('quizzes', quizId) : null;

  const quizRecord: QuizRecord = {
    id: quizId,
    title,
    description: descInput?.value.trim() || '',
    language: langSelect?.value || 'Ho',
    grade: gradeSelect?.value || 'Grade 1',
    subject: subjSelect?.value || 'Environmental Studies',
    authorId: user.id,
    authorName: user.name,
    published: publish,
    createdAt: existingQuiz ? existingQuiz.createdAt : Date.now(),
    updatedAt: Date.now(),
    questions: editingQuestions
  };

  await dbPut('quizzes', quizRecord);
  logAudit(editingQuizId ? 'UPDATE_QUIZ' : 'CREATE_QUIZ', `Saved quiz ${quizId} with published=${quizRecord.published}`);

  showToast(publish ? 'Quiz published! Students can now take this quiz.' : 'Quiz saved as draft.', '✓');

  const modal = document.getElementById('modal-quiz-editor');
  if (modal) modal.style.display = 'none';

  await refreshQuizzesList();
  await refreshStudentQuizzesForPortal();
}

// ===================== STUDENT QUIZ RUNNER CONTROLLER =====================
export async function openQuizRunner(quizId: string) {
  const quiz = await dbGet<QuizRecord>('quizzes', quizId);
  if (!quiz) {
    showToast('Quiz not found.', '⚠️');
    return;
  }

  if (isStudent() && !quiz.published) {
    showToast('This quiz is not currently available.', '⚠️');
    return;
  }

  activeQuiz = quiz;
  currentQuestionIndex = 0;
  studentAnswers = {};

  const modal = document.getElementById('modal-quiz-runner');
  if (!modal) return;

  const titleEl = document.getElementById('quiz-runner-title');
  const langBadge = document.getElementById('quiz-runner-lang-badge');
  const subjectEl = document.getElementById('quiz-runner-subject');

  if (titleEl) titleEl.textContent = quiz.title;
  if (langBadge) langBadge.textContent = quiz.language || 'Ho';
  if (subjectEl) subjectEl.textContent = `${quiz.grade || 'Grade 1'} • ${quiz.subject || 'General'}`;

  renderActiveQuestion();
  modal.style.display = 'flex';
}

function renderActiveQuestion() {
  if (!activeQuiz || !activeQuiz.questions || activeQuiz.questions.length === 0) return;

  const total = activeQuiz.questions.length;
  const q = activeQuiz.questions[currentQuestionIndex];
  if (!q) return;

  // Update Progress
  const progText = document.getElementById('quiz-runner-progress-text');
  const ansText = document.getElementById('quiz-runner-answered-text');
  const progBar = document.getElementById('quiz-runner-progress-bar');

  const answeredCount = Object.keys(studentAnswers).length;
  const percentComplete = Math.round(((currentQuestionIndex + 1) / total) * 100);

  if (progText) progText.textContent = `Question ${currentQuestionIndex + 1} of ${total}`;
  if (ansText) ansText.textContent = `${answeredCount} of ${total} Answered`;
  if (progBar) progBar.style.width = `${percentComplete}%`;

  // Question Prompt
  const qText = document.getElementById('quiz-runner-question-text');
  if (qText) qText.textContent = q.question;

  // Options List
  const optionsList = document.getElementById('quiz-runner-options-list');
  if (!optionsList) return;

  const selectedIdx = studentAnswers[currentQuestionIndex];

  optionsList.innerHTML = ['A', 'B', 'C', 'D'].map((letter, idx) => {
    const isSelected = selectedIdx === idx;
    const optionText = q.options[idx] || '';

    return `
      <button type="button" class="quiz-option-card" data-optindex="${idx}" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:14px 18px;border-radius:10px;border:2px solid ${isSelected ? 'var(--green)' : '#E2E8F0'};background:${isSelected ? '#F0FDF4' : '#FFFFFF'};box-shadow:${isSelected ? '0 0 0 1px var(--green)' : '0 1px 3px rgba(0,0,0,0.05)'};cursor:pointer;transition:all 0.15s ease;">
        <span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${isSelected ? 'var(--green)' : '#F1F5F9'};color:${isSelected ? '#FFF' : 'var(--ink)'};font-size:0.85rem;font-weight:700;">
          ${letter}
        </span>
        <span style="font-size:0.95rem;font-weight:600;color:var(--ink);flex:1;line-height:1.4;">
          ${escapeHtml(optionText)}
        </span>
        ${isSelected ? `<span style="color:var(--green);font-size:1.1rem;font-weight:700;">✓</span>` : ''}
      </button>
    `;
  }).join('');

  // Wire Option selection
  optionsList.querySelectorAll('.quiz-option-card').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-optindex') || '0', 10);
      studentAnswers[currentQuestionIndex] = idx;
      renderActiveQuestion();
    });
  });

  // Audio listen button
  const listenBtn = document.getElementById('btn-quiz-listen-question');
  if (listenBtn) {
    listenBtn.onclick = () => {
      audio.speakText(q.question);
    };
  }

  // Navigation Buttons
  const prevBtn = document.getElementById('btn-quiz-prev-q');
  const nextBtn = document.getElementById('btn-quiz-next-q');
  const submitBtn = document.getElementById('btn-quiz-submit-final');

  if (prevBtn) {
    prevBtn.style.visibility = currentQuestionIndex > 0 ? 'visible' : 'hidden';
  }

  if (currentQuestionIndex === total - 1) {
    if (nextBtn) nextBtn.style.display = 'none';
    if (submitBtn) submitBtn.style.display = 'inline-flex';
  } else {
    if (nextBtn) nextBtn.style.display = 'inline-flex';
    if (submitBtn) submitBtn.style.display = 'none';
  }
}

async function submitActiveQuiz() {
  if (!activeQuiz) return;
  const total = activeQuiz.questions.length;
  const answeredCount = Object.keys(studentAnswers).length;

  if (answeredCount < total) {
    if (!confirm(`You have answered ${answeredCount} of ${total} questions. Are you sure you want to submit?`)) {
      return;
    }
  }

  const user = getCurrentUser();

  // Calculate score
  let correctCount = 0;
  activeQuiz.questions.forEach((q, idx) => {
    if (studentAnswers[idx] === q.correctOptionIndex) {
      correctCount++;
    }
  });

  const percentage = Math.round((correctCount / total) * 100);

  const submission: QuizSubmissionRecord = {
    id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    quizId: activeQuiz.id,
    quizTitle: activeQuiz.title,
    studentId: user.id,
    studentName: user.name,
    answers: studentAnswers,
    score: correctCount,
    totalQuestions: total,
    percentage,
    submittedAt: Date.now()
  };

  // Save submission via permission-enforced saveQuizSubmission in db.ts
  await saveQuizSubmission(submission);

  logAudit('SUBMIT_QUIZ', `Student ${user.name} submitted quiz ${activeQuiz.id} with score ${correctCount}/${total} (${percentage}%)`);

  // Close Runner
  const runnerModal = document.getElementById('modal-quiz-runner');
  if (runnerModal) runnerModal.style.display = 'none';

  // Open Results Modal
  showQuizResults(activeQuiz, submission);

  // Refresh progress and quiz lists
  await refreshQuizzesList();
  await refreshStudentQuizzesForPortal();
  await refreshStudentProgress();
}

// ===================== SHOW QUIZ RESULTS MODAL =====================
function showQuizResults(quiz: QuizRecord, submission: QuizSubmissionRecord) {
  const modal = document.getElementById('modal-quiz-result');
  if (!modal) return;

  const emoji = document.getElementById('quiz-result-emoji');
  const title = document.getElementById('quiz-result-title');
  const quizName = document.getElementById('quiz-result-quizname');
  const scoreFrac = document.getElementById('quiz-result-score-fraction');
  const pctEl = document.getElementById('quiz-result-percentage');
  const statusPill = document.getElementById('quiz-result-status-pill');

  if (quizName) quizName.textContent = quiz.title;
  if (scoreFrac) scoreFrac.textContent = `${submission.score} / ${submission.totalQuestions}`;
  if (pctEl) pctEl.textContent = `${submission.percentage}%`;

  const isPassed = submission.percentage >= 60;
  if (isPassed) {
    if (emoji) emoji.textContent = '🏆';
    if (title) title.textContent = `Great Job, ${submission.studentName.split(' ')[0]}!`;
    if (statusPill) {
      statusPill.textContent = 'Passed ⭐';
      statusPill.style.color = '#15803D';
    }
  } else {
    if (emoji) emoji.textContent = '🌱';
    if (title) title.textContent = `Good Effort, ${submission.studentName.split(' ')[0]}!`;
    if (statusPill) {
      statusPill.textContent = 'Review & Retry 🔁';
      statusPill.style.color = '#B45309';
    }
  }

  // Render question reviews
  const reviewContainer = document.getElementById('quiz-result-questions-review');
  if (reviewContainer) {
    reviewContainer.innerHTML = quiz.questions.map((q, idx) => {
      const selected = submission.answers[idx];
      const isCorrect = selected === q.correctOptionIndex;
      const selectedText = selected !== undefined ? q.options[selected] : 'Not answered';
      const correctText = q.options[q.correctOptionIndex];

      return `
        <div style="background:#F8FAFC;border:1px solid ${isCorrect ? '#BBF7D0' : '#FECACA'};border-radius:10px;padding:14px;">
          <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">
            <span style="font-size:1.1rem;line-height:1;">${isCorrect ? '✅' : '❌'}</span>
            <div>
              <strong style="font-size:0.88rem;color:var(--ink);">${idx + 1}. ${escapeHtml(q.question)}</strong>
            </div>
          </div>

          <div style="font-size:0.8rem;margin-left:26px;display:flex;flex-direction:column;gap:4px;">
            <div style="color:${isCorrect ? '#15803D' : '#DC2626'};">
              Your Answer: <strong>${escapeHtml(selectedText)}</strong>
            </div>
            ${!isCorrect ? `
              <div style="color:#15803D;">
                Correct Answer: <strong>${escapeHtml(correctText)}</strong>
              </div>
            ` : ''}
            ${q.explanation ? `
              <div style="font-size:0.75rem;color:var(--ink-soft);background:#FFF;padding:6px 10px;border-radius:6px;border:1px solid #E2E8F0;margin-top:4px;">
                💡 <strong>Explanation:</strong> ${escapeHtml(q.explanation)}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  modal.style.display = 'flex';
}

// ===================== TEACHER QUIZ SUBMISSIONS MODAL =====================
export async function openQuizSubmissionsModal(quizId: string) {
  if (!isTeacher()) {
    showToast('Only teachers can view class submissions.', '⚠️');
    return;
  }

  const quiz = await dbGet<QuizRecord>('quizzes', quizId);
  const modal = document.getElementById('modal-quiz-submissions');
  const titleEl = document.getElementById('quiz-submissions-modal-title');
  const subEl = document.getElementById('quiz-submissions-modal-sub');
  const container = document.getElementById('quiz-submissions-list-container');

  if (!modal || !container) return;

  if (titleEl) titleEl.textContent = `Student Submissions: ${quiz?.title || 'Quiz'}`;
  if (subEl) subEl.textContent = `${quiz?.grade || 'Grade 1'} • Total Questions: ${quiz?.questions.length || 0}`;

  const allSubmissions = await dbGetAll<QuizSubmissionRecord>('quiz_submissions');
  const quizSubs = allSubmissions.filter(s => s.quizId === quizId);

  if (quizSubs.length === 0) {
    container.innerHTML = `
      <div style="padding:24px;text-align:center;color:var(--ink-soft);background:#FAFBFB;border:1px dashed var(--border);border-radius:8px;">
        No student submissions recorded for this quiz yet.
      </div>
    `;
  } else {
    container.innerHTML = `
      <table class="progress-data-table" style="width:100%;">
        <thead>
          <tr>
            <th>Student Name</th>
            <th>Score</th>
            <th>Accuracy</th>
            <th>Status</th>
            <th>Submitted At</th>
          </tr>
        </thead>
        <tbody>
          ${quizSubs.map(s => {
            const passed = s.percentage >= 60;
            return `
              <tr>
                <td><strong>${s.studentName}</strong></td>
                <td>${s.score} / ${s.totalQuestions}</td>
                <td><strong>${s.percentage}%</strong></td>
                <td><span class="${passed ? 'status-pill-green' : 'btn-chip'}" style="font-size:0.72rem;">${passed ? 'Passed ⭐' : 'Needs Practice'}</span></td>
                <td style="font-size:0.75rem;color:var(--ink-soft);">${new Date(s.submittedAt).toLocaleDateString()}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  modal.style.display = 'flex';
}

// ===================== STUDENT PROFILE MODAL (NO ADD RESOURCE OPTION) =====================
export function openStudentProfileModal() {
  const modal = document.getElementById('modal-student-profile');
  if (!modal) return;

  const user = getCurrentUser();
  const nameEl = document.getElementById('sp-profile-name');
  const idEl = document.getElementById('sp-profile-id');
  const gradeEl = document.getElementById('sp-profile-grade');
  const schoolEl = document.getElementById('sp-profile-school');
  const distEl = document.getElementById('sp-profile-district');
  const langEl = document.getElementById('sp-profile-language');

  if (nameEl) nameEl.textContent = user.name || 'Asha Kumari';
  if (idEl) idEl.textContent = user.id || 'student_asha';
  if (gradeEl) gradeEl.textContent = (user as any).class || 'Grade 1';
  if (schoolEl) schoolEl.textContent = (user as any).school || 'Govt. Tribal Primary School, Chaibasa';
  if (distEl) distEl.textContent = (user as any).district || 'West Singhbhum, Jharkhand';
  if (langEl) langEl.textContent = `${user.motherTongue || 'Ho'} (वारंग क्षिती / Warang Chiti)`;

  modal.style.display = 'flex';
}

// ===================== REFRESH STUDENT PROGRESS (STRICT PRIVACY ENFORCEMENT) =====================
export async function refreshStudentProgress() {
  const user = getCurrentUser();
  const tbody = document.getElementById('student-progress-table-body');
  if (!tbody) return;

  const isStud = isStudent();

  // 1. Update Headings based on Role
  const viewTitle = document.getElementById('progress-view-title');
  const viewSub = document.getElementById('progress-view-sub');
  const overviewHeading = document.getElementById('progress-overview-heading');
  const perfHeading = document.getElementById('progress-performance-heading');
  const thStudent = document.getElementById('progress-th-student');

  const labelLit = document.getElementById('progress-label-literacy');
  const labelNum = document.getElementById('progress-label-numeracy');
  const labelLis = document.getElementById('progress-label-listening');
  const labelPart = document.getElementById('progress-label-participation');

  const personalQuizCard = document.getElementById('student-personal-quiz-summary');

  if (isStud) {
    if (viewTitle) viewTitle.textContent = 'My Progress & Learning Competencies';
    if (viewSub) viewSub.textContent = 'Your personal mother-tongue FLN scores, quiz results, and teacher recommendations.';
    if (overviewHeading) overviewHeading.textContent = 'My Learning Competency Overview';
    if (perfHeading) perfHeading.textContent = 'My Verified Performance Card';
    if (thStudent) thStudent.textContent = 'My Student Profile';

    if (labelLit) labelLit.textContent = 'My Literacy';
    if (labelNum) labelNum.textContent = 'My Numeracy';
    if (labelLis) labelLis.textContent = 'My Listening Skills';
    if (labelPart) labelPart.textContent = 'My Overall FLN Score';

    if (personalQuizCard) personalQuizCard.style.display = 'block';
  } else {
    if (viewTitle) viewTitle.textContent = 'Student Progress & Class Insights';
    if (viewSub) viewSub.textContent = 'Competency tracking and AI-driven recommendations for teachers.';
    if (overviewHeading) overviewHeading.textContent = 'Class Overview';
    if (perfHeading) perfHeading.textContent = 'Student Performance';
    if (thStudent) thStudent.textContent = 'Student';

    if (labelLit) labelLit.textContent = 'Average Literacy';
    if (labelNum) labelNum.textContent = 'Average Numeracy';
    if (labelLis) labelLis.textContent = 'Listening Skills';
    if (labelPart) labelPart.textContent = 'Participation';

    if (personalQuizCard) personalQuizCard.style.display = 'none';
  }

  // 2. Fetch Data with Strict RBAC (Student gets ONLY their own record)
  const records = await getStudentProgressForUser(user);

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;padding:32px 16px;color:var(--ink-soft);">
          <div style="font-size:1.8rem;margin-bottom:6px;">📊</div>
          <div style="font-weight:600;color:var(--ink);">${isStud ? 'No personal records found' : 'No student records found'}</div>
          <div style="font-size:0.8rem;color:var(--ink-faint);margin-top:2px;">Complete quizzes, oral recitations, and assignments to generate competency scores.</div>
        </td>
      </tr>
    `;
    const litElem = document.getElementById('progress-avg-literacy');
    const numElem = document.getElementById('progress-avg-numeracy');
    const lisElem = document.getElementById('progress-avg-listening');
    const partElem = document.getElementById('progress-avg-participation');
    if (litElem) litElem.textContent = '0%';
    if (numElem) numElem.textContent = '0%';
    if (lisElem) lisElem.textContent = '0%';
    if (partElem) partElem.textContent = '0%';
    return;
  }

  // 3. Render Table
  tbody.innerHTML = records.map(r => `
    <tr>
      <td><strong>${r.studentName}</strong> ${isStud ? '<span class="status-pill-green" style="font-size:0.68rem;padding:2px 6px;margin-left:6px;">Me</span>' : ''}</td>
      <td>${r.literacyScore}%</td>
      <td>${r.numeracyScore}%</td>
      <td>${r.listeningScore}%</td>
      <td><strong>${r.overallScore}%</strong></td>
      <td><span class="ai-tag-recommend" style="${r.recommendationTagClass || 'background:#DCFCE7;color:#15803D;padding:2px 8px;border-radius:4px;'}">${r.aiRecommendation}</span></td>
    </tr>
  `).join('');

  // 4. Calculate or show student stats
  const avgLit = Math.round(records.reduce((acc, r) => acc + (r.literacyScore || 0), 0) / records.length);
  const avgNum = Math.round(records.reduce((acc, r) => acc + (r.numeracyScore || 0), 0) / records.length);
  const avgLis = Math.round(records.reduce((acc, r) => acc + (r.listeningScore || 0), 0) / records.length);
  const avgPart = Math.round(records.reduce((acc, r) => acc + (r.overallScore || 0), 0) / records.length);

  const litElem = document.getElementById('progress-avg-literacy');
  const numElem = document.getElementById('progress-avg-numeracy');
  const lisElem = document.getElementById('progress-avg-listening');
  const partElem = document.getElementById('progress-avg-participation');

  if (litElem) litElem.textContent = `${avgLit}%`;
  if (numElem) numElem.textContent = `${avgNum}%`;
  if (lisElem) lisElem.textContent = `${avgLis}%`;
  if (partElem) partElem.textContent = `${avgPart}%`;

  // 5. If Student, populate their personal quiz results grid
  if (isStud) {
    const quizSubmissions = await getQuizSubmissionsForUser(user);
    const badgeCount = document.getElementById('student-quiz-badge-count');
    if (badgeCount) badgeCount.textContent = `${quizSubmissions.length} Quizzes Completed`;

    const quizGrid = document.getElementById('student-quiz-results-grid');
    if (quizGrid) {
      if (quizSubmissions.length === 0) {
        quizGrid.innerHTML = `
          <div style="font-size:0.8rem;color:var(--ink-soft);padding:10px 0;">
            No quizzes completed yet. Go to <a href="#quizzes" style="color:var(--green);font-weight:600;">Interactive Quizzes</a> to take your first test!
          </div>
        `;
      } else {
        const allQuizzes = await dbGetAll<QuizRecord>('quizzes');
        quizGrid.innerHTML = quizSubmissions.map(sub => {
          const q = allQuizzes.find(item => item.id === sub.quizId);
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;background:#FFF;padding:10px 14px;border-radius:8px;border:1px solid #BBF7D0;">
              <div>
                <strong style="font-size:0.86rem;color:var(--ink);">${q?.title || sub.quizTitle || 'Classroom Quiz'}</strong>
                <div style="font-size:0.74rem;color:var(--ink-soft);margin-top:2px;">
                  Score: <strong>${sub.score} / ${sub.totalQuestions}</strong> • Submitted: ${new Date(sub.submittedAt).toLocaleDateString()}
                </div>
              </div>
              <span class="status-pill-green" style="font-size:0.75rem;font-weight:700;">
                ${sub.percentage}% Accuracy ⭐
              </span>
            </div>
          `;
        }).join('');
      }
    }
  }
}

// ===================== INITIALIZE ALL QUIZ & PROFILE LISTENERS =====================
export function setupQuizzesModule() {
  // Filter Tabs in view-quizzes
  const filterTabs = document.querySelectorAll('.quiz-filter-tab');
  filterTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      filterTabs.forEach(t => t.classList.remove('active'));
      const target = e.currentTarget as HTMLElement;
      target.classList.add('active');
      const filter = target.getAttribute('data-filter') as 'all' | 'published' | 'draft';
      currentQuizFilter = filter || 'all';
      refreshQuizzesList();
    });
  });

  // Teacher Create Quiz Button
  const btnCreate = document.getElementById('btn-open-create-quiz');
  btnCreate?.addEventListener('click', () => {
    openQuizEditor();
  });

  // Quiz Editor Form Controls
  const btnAddQuestion = document.getElementById('btn-quiz-add-question');
  btnAddQuestion?.addEventListener('click', () => {
    syncEditorInputsToState();
    editingQuestions.push(createNewQuestion(editingQuestions.length + 1));
    renderEditorQuestions();
  });

  const btnCloseEditor = document.getElementById('btn-close-quiz-editor');
  const btnCancelEditor = document.getElementById('btn-quiz-cancel');
  const closeEditor = () => {
    const modal = document.getElementById('modal-quiz-editor');
    if (modal) modal.style.display = 'none';
  };
  btnCloseEditor?.addEventListener('click', closeEditor);
  btnCancelEditor?.addEventListener('click', closeEditor);

  const btnSaveDraft = document.getElementById('btn-quiz-save-draft');
  btnSaveDraft?.addEventListener('click', () => {
    saveQuizFromEditor(false);
  });

  const btnPublish = document.getElementById('btn-quiz-publish');
  btnPublish?.addEventListener('click', () => {
    saveQuizFromEditor(true);
  });

  // Quiz Runner Controls
  const btnCloseRunner = document.getElementById('btn-close-quiz-runner');
  btnCloseRunner?.addEventListener('click', () => {
    const modal = document.getElementById('modal-quiz-runner');
    if (modal) modal.style.display = 'none';
  });

  const btnPrevQ = document.getElementById('btn-quiz-prev-q');
  btnPrevQ?.addEventListener('click', () => {
    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
      renderActiveQuestion();
    }
  });

  const btnNextQ = document.getElementById('btn-quiz-next-q');
  btnNextQ?.addEventListener('click', () => {
    if (activeQuiz && currentQuestionIndex < activeQuiz.questions.length - 1) {
      currentQuestionIndex++;
      renderActiveQuestion();
    }
  });

  const btnSubmitFinal = document.getElementById('btn-quiz-submit-final');
  btnSubmitFinal?.addEventListener('click', () => {
    submitActiveQuiz();
  });

  // Quiz Results Controls
  const btnCloseResult = document.getElementById('btn-quiz-result-close');
  btnCloseResult?.addEventListener('click', () => {
    const modal = document.getElementById('modal-quiz-result');
    if (modal) modal.style.display = 'none';
  });

  const btnResultViewProgress = document.getElementById('btn-quiz-result-view-progress');
  btnResultViewProgress?.addEventListener('click', () => {
    const modal = document.getElementById('modal-quiz-result');
    if (modal) modal.style.display = 'none';
    switchView('progress');
  });

  // Quiz Submissions Modal Controls
  const btnCloseSubs = document.getElementById('btn-close-quiz-submissions');
  btnCloseSubs?.addEventListener('click', () => {
    const modal = document.getElementById('modal-quiz-submissions');
    if (modal) modal.style.display = 'none';
  });
}

export function setupStudentProfileModule() {
  // Student action card for opening profile
  const cardProfile = document.getElementById('card-open-student-profile');
  cardProfile?.addEventListener('click', () => {
    openStudentProfileModal();
  });

  // Topbar avatar click: if student, open student profile modal directly
  const topbarAvatar = document.getElementById('topbar-avatar');
  topbarAvatar?.addEventListener('click', (e) => {
    if (isStudent()) {
      e.stopPropagation();
      openStudentProfileModal();
    }
  });

  // Close Student Profile Modal
  const btnCloseSp = document.getElementById('btn-close-student-profile');
  const btnSpClose = document.getElementById('btn-sp-close');
  const closeSp = () => {
    const modal = document.getElementById('modal-student-profile');
    if (modal) modal.style.display = 'none';
  };
  btnCloseSp?.addEventListener('click', closeSp);
  btnSpClose?.addEventListener('click', closeSp);

  // Link inside Student Profile to View Progress
  const btnSpProgress = document.getElementById('btn-sp-view-progress');
  btnSpProgress?.addEventListener('click', () => {
    closeSp();
    switchView('progress');
  });
}

// Helper to escape HTML characters
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
