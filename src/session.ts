// ============================================================================
// BhashaSetu - Classroom Active Learning Session Engine
// Provides timed classroom session management, live student progress tracking,
// real-time countdown, and teacher feedback loop.
// ============================================================================

export interface SessionStudentStatus {
  studentId: string;
  studentName: string;
  joinedAt: number;
  currentActivity: string;
  completed: boolean;
  score: number;
  maxScore: number;
  mistakes: string[];
  needsSupport: boolean;
  lastResponse?: string;
  teacherFeedback?: string;
}

export interface ActiveLearningSession {
  id: string;
  lessonId: string;
  lessonTitle: string;
  classGrade: string;
  subject: string;
  targetLang: string;
  durationMinutes: number;
  startedAt: number;
  expiresAt: number;
  status: 'active' | 'paused' | 'expired' | 'ended';
  students: SessionStudentStatus[];
}

const SESSION_STORAGE_KEY = 'bhashasetu_active_learning_session';
const SESSION_EVENT_NAME = 'bhashasetu:session_update';

// Enrolled classroom student roster for demo & authentic classroom monitoring
const DEFAULT_CLASS_ROSTER: Array<{ id: string; name: string }> = [
  { id: 'student_asha', name: 'Asha Kumari' },
  { id: 'student_birsa', name: 'Birsa Soren' },
  { id: 'student_sunita', name: 'Sunita Hembrom' },
  { id: 'student_mangal', name: 'Mangal Ho' }
];

export function getActiveSession(): ActiveLearningSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session: ActiveLearningSession = JSON.parse(raw);
    
    // Check if expired
    if (session.status === 'active' && Date.now() >= session.expiresAt) {
      session.status = 'expired';
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      notifySessionChange(session);
    }
    return session;
  } catch (err) {
    console.error('Failed to parse active session:', err);
    return null;
  }
}

function saveSession(session: ActiveLearningSession | null) {
  if (!session) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } else {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }
  notifySessionChange(session);
}

function notifySessionChange(session: ActiveLearningSession | null) {
  window.dispatchEvent(new CustomEvent(SESSION_EVENT_NAME, { detail: session }));
}

export function onSessionChange(callback: (session: ActiveLearningSession | null) => void): () => void {
  const handler = (evt: Event) => {
    const customEvt = evt as CustomEvent<ActiveLearningSession | null>;
    callback(customEvt.detail !== undefined ? customEvt.detail : getActiveSession());
  };
  window.addEventListener(SESSION_EVENT_NAME, handler);
  window.addEventListener('storage', (evt) => {
    if (evt.key === SESSION_STORAGE_KEY) {
      callback(getActiveSession());
    }
  });
  return () => {
    window.removeEventListener(SESSION_EVENT_NAME, handler);
  };
}

export function isSessionActive(): boolean {
  const session = getActiveSession();
  return session !== null && session.status === 'active';
}

export function startSession(params: {
  lessonId: string;
  lessonTitle: string;
  classGrade: string;
  subject: string;
  targetLang: string;
  durationMinutes: number;
}): ActiveLearningSession {
  const now = Date.now();
  const expiresAt = now + params.durationMinutes * 60 * 1000;

  const initialStudents: SessionStudentStatus[] = DEFAULT_CLASS_ROSTER.map(r => ({
    studentId: r.id,
    studentName: r.name,
    joinedAt: now,
    currentActivity: 'Enrolled in Session',
    completed: false,
    score: 0,
    maxScore: 10,
    mistakes: [],
    needsSupport: false
  }));

  const session: ActiveLearningSession = {
    id: 'session_' + now,
    lessonId: params.lessonId,
    lessonTitle: params.lessonTitle,
    classGrade: params.classGrade,
    subject: params.subject,
    targetLang: params.targetLang,
    durationMinutes: params.durationMinutes,
    startedAt: now,
    expiresAt,
    status: 'active',
    students: initialStudents
  };

  saveSession(session);
  return session;
}

export function extendSession(additionalMinutes: number = 15): ActiveLearningSession | null {
  const session = getActiveSession();
  if (!session) return null;
  const now = Date.now();
  const baseTime = session.status === 'expired' ? now : Math.max(now, session.expiresAt);
  session.expiresAt = baseTime + additionalMinutes * 60 * 1000;
  session.durationMinutes += additionalMinutes;
  session.status = 'active';
  saveSession(session);
  return session;
}

export function pauseOrResumeSession(): ActiveLearningSession | null {
  const session = getActiveSession();
  if (!session) return null;
  if (session.status === 'active') {
    session.status = 'paused';
  } else if (session.status === 'paused') {
    session.status = 'active';
  }
  saveSession(session);
  return session;
}

export function endSession(): void {
  const session = getActiveSession();
  if (session) {
    session.status = 'ended';
    saveSession(session);
  } else {
    saveSession(null);
  }
}

export function getTimeRemaining(): { minutes: number; seconds: number; isExpired: boolean; display: string } {
  const session = getActiveSession();
  if (!session || session.status === 'ended') {
    return { minutes: 0, seconds: 0, isExpired: true, display: '00:00' };
  }

  if (session.status === 'paused') {
    const totalRemaining = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
    const m = Math.floor(totalRemaining / 60);
    const s = totalRemaining % 60;
    return {
      minutes: m,
      seconds: s,
      isExpired: false,
      display: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} (Paused)`
    };
  }

  const diffMs = session.expiresAt - Date.now();
  if (diffMs <= 0) {
    if (session.status !== 'expired') {
      session.status = 'expired';
      saveSession(session);
    }
    return { minutes: 0, seconds: 0, isExpired: true, display: '00:00' };
  }

  const totalSec = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return { minutes, seconds, isExpired: false, display };
}

export function studentJoinSession(studentId: string, studentName: string): void {
  const session = getActiveSession();
  if (!session) return;
  const existing = session.students.find(s => s.studentId === studentId);
  if (!existing) {
    session.students.push({
      studentId,
      studentName,
      joinedAt: Date.now(),
      currentActivity: 'Joined Lesson',
      completed: false,
      score: 0,
      maxScore: 10,
      mistakes: [],
      needsSupport: false
    });
  } else {
    existing.currentActivity = 'Active in Lesson';
  }
  saveSession(session);
}

export function recordStudentActivity(
  studentId: string,
  activity: string,
  completed: boolean,
  score: number,
  mistakes: string[] = [],
  response?: string
): void {
  const session = getActiveSession();
  if (!session) return;
  const student = session.students.find(s => s.studentId === studentId);
  if (student) {
    student.currentActivity = activity;
    student.completed = completed;
    student.score = score;
    if (mistakes.length) student.mistakes = mistakes;
    if (response) student.lastResponse = response;
  }
  saveSession(session);
}

export function requestStudentSupport(studentId: string, reason: string = 'Needs concept clarification'): void {
  const session = getActiveSession();
  if (!session) return;
  const student = session.students.find(s => s.studentId === studentId);
  if (student) {
    student.needsSupport = true;
    student.mistakes.push(reason);
  }
  saveSession(session);
}

export function submitTeacherFeedback(studentId: string, feedback: string): void {
  const session = getActiveSession();
  if (!session) return;
  const student = session.students.find(s => s.studentId === studentId);
  if (student) {
    student.teacherFeedback = feedback;
    student.needsSupport = false;
  }
  saveSession(session);
}
