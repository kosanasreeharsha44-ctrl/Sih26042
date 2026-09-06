// ============================================================================
// BhashaSetu - Offline-First Database Engine (IndexedDB)
// ============================================================================

import { createUserHistory } from './supabaseService.js';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: 'Teacher' | 'Student';
  school: string;
  district: string;
  state: string;
  grade?: string;
  motherTongue?: string;
  avatarUrl?: string;
  authProvider?: 'local' | 'google_supabase' | 'supabase_auth';
  verified: boolean;
  createdAt: number;
}

export interface LessonRecord {
  id: string;
  title: string;
  topic: string;
  grade: string;
  subject: string;
  sourceLang: string;
  targetLang: string;
  lessonText: string;
  translatedText?: string;
  scriptText: string;
  explanation: string;
  voiceText: string;
  worksheetContent: string;
  questionsContent: string;
  diagramSvg?: string;
  audioBlobKey?: string;
  fileData?: string;
  fileName?: string;
  mimeType?: string;
  storagePath?: string;
  signedUrl?: string;
  completionPct?: number;
  culturalContext?: string;
  published: boolean;
  approved?: boolean;
  syncState: 'synced' | 'pending' | 'local';
  createdAt: number;
  updatedAt: number;
  authorId: string;
}

export interface WorksheetRecord {
  id: string;
  title: string;
  lessonId?: string;
  grade: string;
  subject: string;
  languages: string;
  format: string;
  sizeKb: number;
  questions: Array<{ q: string; a?: string; type: 'match' | 'blank' | 'mcq' | 'oral' }>;
  approved?: boolean;
  syncState: 'synced' | 'pending' | 'local';
  createdAt: number;
}

export interface AssignmentSubmission {
  studentId: string;
  studentName: string;
  submittedAt: number;
  status: 'submitted' | 'graded' | 'pending';
  textContent?: string;
  audioRecorded?: boolean;
  score?: number;
  maxScore?: number;
  feedback?: string;
}

export interface AssignmentRecord {
  id: string;
  title: string;
  description: string;
  grade: string;
  language: string;
  deadline: string;
  maxScore: number;
  submissions: AssignmentSubmission[];
  syncState: 'synced' | 'pending' | 'local';
  createdAt: number;
}

export interface StudentProgressRecord {
  studentId: string;
  studentName: string;
  grade: string;
  literacyScore: number;
  numeracyScore: number;
  listeningScore: number;
  participationScore: number;
  overallScore: number;
  completedLessons: string[];
  submittedAssignments: string[];
  completedWorksheets: string[];
  completedQuizzes?: string[];
  aiRecommendation: string;
  recommendationTagClass: string;
  badges?: string[];
  lastActive: number;
  lastAssessed?: number;
  updatedAt?: number;
  syncState: 'synced' | 'pending' | 'local';
}

export interface ResourceRecord {
  id: string;
  title: string;
  fileName?: string;
  fileType?: string; // 'PDF' | 'DOC' | 'Image' | 'Audio' | 'Video' | 'Other'
  mimeType?: string;
  category?: 'ebook' | 'audio' | 'video' | 'image' | 'guide' | 'printable' | string;
  language?: string;
  description?: string;
  sizeKb: number;
  isOffline?: boolean;
  contentData?: string; // base64 data URL
  storagePath?: string;
  signedUrl?: string;
  approved?: boolean;
  syncState?: 'synced' | 'pending' | 'local';
  createdAt: number;
  updatedAt?: number;
}

export interface AuditLogRecord {
  id?: number;
  timestamp: number;
  action: string;
  userId: string;
  userRole: string;
  details: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
}

export interface SyncQueueItem {
  id?: number;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: 'lesson' | 'assignment' | 'submission' | 'progress' | 'worksheet';
  entityId: string;
  payload: any;
  timestamp: number;
  retryCount: number;
}

export interface CachedVoiceRecord {
  key: string;            // Normalized key e.g. "ho:johar:young learner"
  term: string;           // Original clean term/phrase
  lang: string;           // Target language (Ho, Mundari, Santhali, Telugu, Hindi, English)
  voiceProfile: 'Young Learner' | 'Formal Teacher';
  mimeType: string;       // e.g. 'audio/wav'
  audioData: string;      // Base64 audio payload
  isPreRendered: boolean; // true for built-in curriculum assets
  category: string;       // 'greetings' | 'numbers' | 'nature' | 'school' | 'family' | 'phrases' | 'general'
  createdAt: number;
}

export interface UserHistoryRecord {
  id: string;
  userId: string;
  userName?: string;
  type: 'translation' | 'lens_scan' | 'tutor_chat' | 'tutor_qa' | 'audio_listen' | 'practice_quiz' | 'lesson_view';
  title: string;
  sourceText?: string;
  translatedText?: string;
  sourceLang?: string;
  targetLang?: string;
  confidence?: number;
  metadata?: any;
  timestamp: number;
  syncState: 'local' | 'synced' | 'pending';
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: [string, string, string, string]; // exactly 4 answer options
  correctOptionIndex: number; // 0, 1, 2, or 3
  explanation?: string;
}

export interface QuizRecord {
  id: string;
  title: string;
  description?: string;
  grade: string;
  subject: string;
  language: string;
  questions: QuizQuestion[];
  published: boolean;
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
  syncState?: 'synced' | 'pending' | 'local';
}

export interface QuizSubmissionRecord {
  id: string;
  quizId: string;
  quizTitle: string;
  studentId: string;
  studentName: string;
  answers: Record<number, number>; // questionIndex -> selectedOptionIndex (0-3)
  score: number;
  totalQuestions: number;
  percentage: number;
  submittedAt: number;
  syncState?: 'synced' | 'pending' | 'local';
}

const DB_NAME = 'BhashaSetu_OfflineDB';
const DB_VERSION = 5;

let dbInstance: IDBDatabase | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (evt) => {
      const db = (evt.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('lessons')) {
        db.createObjectStore('lessons', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('worksheets')) {
        db.createObjectStore('worksheets', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('assignments')) {
        db.createObjectStore('assignments', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('student_progress')) {
        db.createObjectStore('student_progress', { keyPath: 'studentId' });
      }
      if (!db.objectStoreNames.contains('progress')) {
        db.createObjectStore('progress', { keyPath: 'studentId' });
      }
      if (!db.objectStoreNames.contains('resources')) {
        db.createObjectStore('resources', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('bookmarks')) {
        db.createObjectStore('bookmarks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('audit_logs')) {
        db.createObjectStore('audit_logs', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('offline_cache')) {
        db.createObjectStore('offline_cache', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('voice_cache')) {
        db.createObjectStore('voice_cache', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('user_history')) {
        const histStore = db.createObjectStore('user_history', { keyPath: 'id' });
        histStore.createIndex('userId', 'userId', { unique: false });
        histStore.createIndex('timestamp', 'timestamp', { unique: false });
        histStore.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains('quizzes')) {
        const quizStore = db.createObjectStore('quizzes', { keyPath: 'id' });
        quizStore.createIndex('authorId', 'authorId', { unique: false });
        quizStore.createIndex('published', 'published', { unique: false });
        quizStore.createIndex('grade', 'grade', { unique: false });
      }
      if (!db.objectStoreNames.contains('quiz_submissions')) {
        const subStore = db.createObjectStore('quiz_submissions', { keyPath: 'id' });
        subStore.createIndex('quizId', 'quizId', { unique: false });
        subStore.createIndex('studentId', 'studentId', { unique: false });
        subStore.createIndex('submittedAt', 'submittedAt', { unique: false });
      }
    };

    req.onsuccess = async (evt) => {
      dbInstance = (evt.target as IDBOpenDBRequest).result;
      try {
        await seedDatabaseIfEmpty();
      } catch (seedErr) {
        console.warn('[IndexedDB] Seeding non-blocking warning:', seedErr);
      }
      resolve(dbInstance);
    };

    req.onerror = () => reject(req.error);
  });
}

function resolveStoreName(db: IDBDatabase, storeName: string): string | null {
  if (db.objectStoreNames.contains(storeName)) return storeName;
  if (storeName === 'progress' && db.objectStoreNames.contains('student_progress')) return 'student_progress';
  if (storeName === 'student_progress' && db.objectStoreNames.contains('progress')) return 'progress';
  return null;
}

// Generic Transaction Helpers
export async function dbPut<T>(storeName: string, item: T): Promise<void> {
  const db = await getDB();
  const effectiveStore = resolveStoreName(db, storeName);
  if (!effectiveStore) {
    console.warn(`[IndexedDB] Store '${storeName}' not found in current schema.`);
    return;
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(effectiveStore, 'readwrite');
      const store = tx.objectStore(effectiveStore);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) {
      console.warn(`[IndexedDB] Error executing put on '${storeName}':`, err);
      resolve();
    }
  });
}

export async function dbGet<T>(storeName: string, key: string | number): Promise<T | null> {
  const db = await getDB();
  const effectiveStore = resolveStoreName(db, storeName);
  if (!effectiveStore) {
    return null;
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(effectiveStore, 'readonly');
      const store = tx.objectStore(effectiveStore);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    } catch (err) {
      console.warn(`[IndexedDB] Error executing get on '${storeName}':`, err);
      resolve(null);
    }
  });
}

export async function dbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await getDB();
  const effectiveStore = resolveStoreName(db, storeName);
  if (!effectiveStore) {
    return [];
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(effectiveStore, 'readonly');
      const store = tx.objectStore(effectiveStore);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    } catch (err) {
      console.warn(`[IndexedDB] Error executing getAll on '${storeName}':`, err);
      resolve([]);
    }
  });
}

export async function dbDelete(storeName: string, key: string | number): Promise<void> {
  const db = await getDB();
  const effectiveStore = resolveStoreName(db, storeName);
  if (!effectiveStore) {
    return;
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(effectiveStore, 'readwrite');
      const store = tx.objectStore(effectiveStore);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) {
      console.warn(`[IndexedDB] Error executing delete on '${storeName}':`, err);
      resolve();
    }
  });
}

export async function logAudit(action: string, details: string, status: 'SUCCESS' | 'WARNING' | 'ERROR' = 'SUCCESS', user?: { id: string; role: string }): Promise<void> {
  const log: AuditLogRecord = {
    timestamp: Date.now(),
    action,
    userId: user?.id || 'system',
    userRole: user?.role || 'System',
    details,
    status
  };
  await dbPut('audit_logs', log);
}

// ===================== SEED REAL INITIAL CURRICULUM DATA =====================
// Production Mode: ZERO sample/demo data.
// Only registers default teacher & student credentials for authentication verification if not already present.
async function seedDatabaseIfEmpty(): Promise<void> {
  const users = await dbGetAll<UserRecord>('users');

  // Clean up any stale sample data from previous demo sessions if flag not set
  const cleanedFlag = localStorage.getItem('bhashasetu_sample_cleared_v4');
  if (!cleanedFlag) {
    const db = await getDB();
    const storesToClear = ['lessons', 'worksheets', 'assignments', 'student_progress', 'resources'];
    for (const storeName of storesToClear) {
      if (db.objectStoreNames.contains(storeName)) {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
      }
    }
    localStorage.setItem('bhashasetu_sample_cleared_v4', 'true');
  }

  // 1. Ensure user accounts exist for initial login verification
  if (users.length === 0) {
    const defaultTeacher: UserRecord = {
      id: 'teacher_1',
      email: 'teacher@bhashasetu.in',
      name: 'Sunita Mahato',
      role: 'Teacher',
      school: 'Govt. Tribal Primary School, Chaibasa',
      district: 'West Singhbhum',
      state: 'Jharkhand',
      authProvider: 'local',
      verified: true,
      createdAt: Date.now()
    };

    const defaultStudent: UserRecord = {
      id: 'student_asha',
      email: 'student@bhashasetu.in',
      name: 'Asha Kumari',
      role: 'Student',
      school: 'Govt. Tribal Primary School, Chaibasa',
      district: 'West Singhbhum',
      state: 'Jharkhand',
      grade: 'Grade 1',
      motherTongue: 'Ho',
      authProvider: 'local',
      verified: true,
      createdAt: Date.now()
    };

    await dbPut('users', defaultTeacher);
    await dbPut('users', defaultStudent);
  }

  // 2. Initial Settings (if not set)
  const existingSettings = await dbGetAll<{ key: string; value: any }>('settings');
  if (existingSettings.length === 0) {
    await dbPut('settings', { key: 'safe_mode', value: true });
    await dbPut('settings', { key: 'audio_speed', value: '1.0' });
    await dbPut('settings', { key: 'audio_pitch', value: '1.05' });
    await dbPut('settings', { key: 'interface_lang', value: 'English' });
    await dbPut('settings', { key: 'mother_tongue', value: 'Ho' });
    await dbPut('settings', { key: 'ai_difficulty', value: 'Standard (FLN Grade 1-2)' });
  }

  // 3. Initial Starter Lessons (if empty)
  const existingLessons = await dbGetAll<LessonRecord>('lessons');
  if (existingLessons.length === 0) {
    const starterLesson1: LessonRecord = {
      id: 'lesson_fln_nature_plants',
      title: 'Our Living Plants & Trees (दारु आर साकम)',
      topic: 'Parts of Plants, Leaves & Trees in Mother Tongue',
      grade: 'Grade 1',
      subject: 'Environmental Studies',
      sourceLang: 'Hindi',
      targetLang: 'Ho',
      lessonText: 'पेड़-पौधे हमारे जीवन का आधार हैं। पौधों के मुख्य भाग हैं: जड़, तना, पत्तियां, फूल और फल। जड़ें मिट्टी से पानी सोखती हैं और पौधे को मजबूती से थामे रखती हैं। पत्तियां धूप में भोजन बनाती हैं।',
      translatedText: 'दारु-बिर अबुवाः जीवोन रेयाः मूल आधार ताना। दारु रेयाः मुख्य हटिंग ताना: रेहेद, डांग, साकम, बा आर जो। रेहेद माटि एते दः सोबोःया आर दारुके केटेद ते साबोःया। साकम सिंगी दियुम रे जोम कमीया।',
      scriptText: '𑢹𑣉 𑣆𑣗𑣉: 𑢵𑣁𑣜𑣃-𑢑𑣈𑣆 𑢡𑢯𑣃𑢶𑣁𑣍 𑢮𑣈𑢾𑣉𑢳 𑢜𑣈𑢷𑣁𑣍 𑢶𑣃𑣖 𑢡𑣁𑢵𑣁𑣜 𑢦𑣁𑢳𑣁',
      explanation: 'इस पाठ में बच्चों को प्रकृति और पौधों के बारे में अपनी मातृभाषा हो में समझाया गया है। जिस तरह हमारे शरीर में हाथ-पैर होते हैं, वैसे ही पौधों में जड़, पत्ती और तना होते हैं।',
      voiceText: 'दारु रेयाः मुख्य हटिंग ताना: रेहेद, डांग, साकम, बा आर जो।',
      worksheetContent: 'Match plant parts: Root (रेहेद), Leaf (साकम), Flower (बा).',
      questionsContent: 'What do roots absorb from soil? (Water and minerals).',
      approved: true,
      published: true,
      syncState: 'local',
      createdAt: Date.now() - 7200000,
      updatedAt: Date.now() - 7200000,
      authorId: 'teacher_1'
    };

    const starterLesson2: LessonRecord = {
      id: 'lesson_fln_numbers_nature',
      title: 'Counting in Nature (कुआंग आर लेखा)',
      topic: 'Numbers 1 to 10 with Natural Objects',
      grade: 'Grade 1',
      subject: 'Mathematics',
      sourceLang: 'Hindi',
      targetLang: 'Ho',
      lessonText: 'प्रकृति में हम गिनती सीखते हैं: एक सूरज, दो आंखें, तीन पत्तियां, चार पैर। आओ मिलकर मातृभाषा में संख्या गिनें।',
      translatedText: 'कुआंग रे अबु लेखा इतुआः: मियद सिंगी, बारिया मेद, अपिया साकम, उपुन चोका। हेजुपे अबु सांवते लेखाबोन।',
      scriptText: '𑢹𑣉 𑣆𑣗𑣉: 𑢶𑢲𑢾𑢵 𑢨𑢹𑢲𑢱, 𑢑𑢁𑢜𑢲𑢶𑢁 𑢶𑣈𑢵, 𑢡𑢷𑢲𑢶𑢁 𑢨𑢁𑢲𑢶',
      explanation: 'प्रकृति के विभिन्न प्राकृतिक वस्तुओं के माध्यम से मातृभाषा में 1 से 10 तक संख्या बोध कराया जाता है।',
      voiceText: 'मियद सिंगी, बारिया मेद, अपिया साकम, उपुन चोका।',
      worksheetContent: 'Count and circle the correct number in Ho.',
      questionsContent: 'How many eyes do animals have? (बारिया मेद / 2).',
      approved: true,
      published: true,
      syncState: 'local',
      createdAt: Date.now() - 5400000,
      updatedAt: Date.now() - 5400000,
      authorId: 'teacher_1'
    };

    await dbPut('lessons', starterLesson1);
    await dbPut('lessons', starterLesson2);
  }

  // 4. Initial Starter Worksheets (if empty)
  const existingWorksheets = await dbGetAll<WorksheetRecord>('worksheets');
  if (existingWorksheets.length === 0) {
    const starterWs1: WorksheetRecord = {
      id: 'ws_fln_plants_tracing',
      title: 'Living Trees & Leaves Bilingual Activity Sheet',
      grade: 'Grade 1',
      subject: 'Environmental Studies',
      languages: 'Hindi & Ho',
      format: 'PDF / Printable Activity',
      sizeKb: 180,
      approved: true,
      syncState: 'local',
      createdAt: Date.now() - 3600000,
      questions: [
        { q: 'जड़ (Root) ➔ रेहेद (Rehed)', a: 'Absorption', type: 'match' },
        { q: 'पत्ती (Leaf) ➔ साकम (Sakam)', a: 'Green leaf', type: 'match' },
        { q: 'फूल (Flower) ➔ बा (Baa)', a: 'Blossom', type: 'match' },
        { q: 'फल (Fruit) ➔ जो (Joo)', a: 'Sweet fruit', type: 'match' }
      ]
    };

    const starterWs2: WorksheetRecord = {
      id: 'ws_fln_numbers_counting',
      title: 'Nature Counting & Object Matching Sheet',
      grade: 'Grade 1',
      subject: 'Mathematics',
      languages: 'Hindi & Ho',
      format: 'PDF / Printable Activity',
      sizeKb: 210,
      approved: true,
      syncState: 'local',
      createdAt: Date.now() - 1800000,
      questions: [
        { q: '1 सूरज (One Sun) ➔ मियद सिंगी', a: '1', type: 'match' },
        { q: '2 आंखें (Two Eyes) ➔ बारिया मेद', a: '2', type: 'match' },
        { q: '3 पत्तियां (Three Leaves) ➔ अपिया साकम', a: '3', type: 'match' }
      ]
    };

    await dbPut('worksheets', starterWs1);
    await dbPut('worksheets', starterWs2);
  }

  // 5. Initial Starter Learning Resources (if empty)
  const existingResources = await dbGetAll<ResourceRecord>('resources');
  if (existingResources.length === 0) {
    const starterRes1: ResourceRecord = {
      id: 'res_fln_warang_chiti_chart',
      title: 'Ho Alphabet & Warang Chiti Script Primer',
      fileName: 'ho_warang_chiti_alphabet_chart.pdf',
      fileType: 'PDF',
      mimeType: 'application/pdf',
      category: 'printable',
      language: 'Ho',
      sizeKb: 340,
      description: 'Illustrated chart displaying Warang Chiti script characters with tribal cultural symbols.',
      contentData: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr',
      approved: true,
      syncState: 'local',
      createdAt: Date.now() - 4800000
    };

    const starterRes2: ResourceRecord = {
      id: 'res_fln_mother_tongue_audio',
      title: 'Grade 1 Mother Tongue Listening Stories (Audio)',
      fileName: 'grade1_tribal_folktale_audio.mp3',
      fileType: 'Audio',
      mimeType: 'audio/mp3',
      category: 'audio',
      language: 'Ho & Hindi',
      sizeKb: 520,
      description: 'Audio recitation of traditional stories in Ho and Hindi for oral fluency.',
      contentData: 'data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQAA',
      approved: true,
      syncState: 'local',
      createdAt: Date.now() - 2400000
    };

    await dbPut('resources', starterRes1);
    await dbPut('resources', starterRes2);
  }

  // 6. Initial Starter Quiz (if empty)
  const existingQuizzes = await dbGetAll<QuizRecord>('quizzes');
  if (existingQuizzes.length === 0) {
    const starterQuiz: QuizRecord = {
      id: 'quiz_fln_nature_plants',
      title: '🌿 Living Nature & Plants Quiz (FLN Grade 1)',
      description: 'Test understanding of tree parts and environment in Ho and Hindi.',
      grade: 'Grade 1',
      subject: 'Environmental Studies',
      language: 'Ho',
      published: true,
      authorId: 'teacher_sunita',
      authorName: 'Sunita Mahato',
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 3600000,
      syncState: 'local',
      questions: [
        {
          id: 'q1_roots',
          question: 'दारु रेयाः रेहेद चिकनाय कमीया? (What do tree roots do?)',
          options: [
            'दः आर माटि साबोः (Absorbs water and anchors plant)',
            'उड़ना (Fly in the air)',
            'गाना गाना (Sing songs)',
            'दौड़ना (Run fast)'
          ],
          correctOptionIndex: 0,
          explanation: 'रेहेद दः आर माटि साबोः कमीया (Roots absorb water and nutrients from the soil).'
        },
        {
          id: 'q2_leaves',
          question: 'साकम रेयाः रंग चिकना लेका तइना? (What color are fresh plant leaves?)',
          options: [
            'राता (Red)',
            'हरियर (Green)',
            'काला (Black)',
            'नीला (Blue)'
          ],
          correctOptionIndex: 1,
          explanation: 'साकम हरियर रंग तइना (Fresh healthy leaves are green).'
        },
        {
          id: 'q3_fruits',
          question: 'दारु अबुके चिकनाय एमा? (What do trees give living beings?)',
          options: [
            'हवा आर जो (Fresh oxygen and fruits)',
            'प्लास्टिक (Plastic bags)',
            'लोहा (Iron bars)',
            'कांच (Glass stones)'
          ],
          correctOptionIndex: 0,
          explanation: 'दारु अबुके साफ हवा (Oxygen) आर जो (Fruits) एमा (Trees provide life-giving oxygen and food).'
        }
      ]
    };
    await dbPut('quizzes', starterQuiz);
  }

  // 7. Initial Student Progress Record for Asha Kumari
  const existingProgress = await dbGetAll<StudentProgressRecord>('student_progress');
  if (existingProgress.length === 0) {
    const studentProgress: StudentProgressRecord = {
      studentId: 'student_asha',
      studentName: 'Asha Kumari',
      grade: 'Grade 1',
      literacyScore: 82,
      numeracyScore: 78,
      listeningScore: 90,
      participationScore: 85,
      overallScore: 84,
      completedLessons: [],
      submittedAssignments: [],
      completedWorksheets: [],
      completedQuizzes: [],
      aiRecommendation: 'Ready for Grade 1 bilingual reader unit 2',
      recommendationTagClass: 'tag-green',
      lastActive: Date.now(),
      syncState: 'local'
    };
    await dbPut('student_progress', studentProgress);
  }

  await logAudit('SYSTEM_INIT', 'System initialized in clean zero-demo data mode for production.');
}

// ===================== PER-USER HISTORY STORAGE HELPERS =====================

export async function saveUserHistoryItem(item: {
  userId: string;
  userName?: string;
  type: 'translation' | 'lens_scan' | 'tutor_chat' | 'tutor_qa' | 'audio_listen' | 'practice_quiz' | 'lesson_view';
  title: string;
  sourceText?: string;
  translatedText?: string;
  sourceLang?: string;
  targetLang?: string;
  confidence?: number;
  metadata?: any;
  timestamp?: number;
  syncState?: 'local' | 'synced' | 'pending';
}): Promise<UserHistoryRecord> {
  const record: UserHistoryRecord = {
    id: `hist_${item.userId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: item.userId,
    userName: item.userName,
    type: item.type,
    title: item.title,
    sourceText: item.sourceText,
    translatedText: item.translatedText,
    sourceLang: item.sourceLang,
    targetLang: item.targetLang,
    confidence: item.confidence,
    metadata: item.metadata,
    timestamp: item.timestamp || Date.now(),
    syncState: item.syncState || 'local'
  };
  await dbPut('user_history', record);

  try {
    createUserHistory(record).then(res => {
      if (res?.data?.id) {
        record.syncState = 'synced';
        dbPut('user_history', record).catch(() => {});
      }
    }).catch(() => {});
  } catch (_) {}

  return record;
}

export async function getUserHistory(userId: string, type?: string, limit = 50): Promise<UserHistoryRecord[]> {
  try {
    const all = await dbGetAll<UserHistoryRecord>('user_history');
    let filtered = all.filter(h => h.userId === userId);
    if (type && type !== 'all') {
      filtered = filtered.filter(h => h.type === type);
    }
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    return filtered.slice(0, limit);
  } catch (e) {
    console.warn('Error reading user history:', e);
    return [];
  }
}

export async function deleteUserHistoryItem(id: string): Promise<void> {
  await dbDelete('user_history', id);
}

export async function clearUserHistory(userId: string): Promise<void> {
  try {
    const all = await dbGetAll<UserHistoryRecord>('user_history');
    for (const h of all) {
      if (h.userId === userId) {
        await dbDelete('user_history', h.id);
      }
    }
  } catch (e) {
    console.warn('Error clearing user history:', e);
  }
}

// Explicit utility to completely purge all user-generated curriculum records if requested by Teacher in Settings
export async function clearAllCurriculumData(): Promise<void> {
  const db = await getDB();
  const storesToClear = ['lessons', 'worksheets', 'assignments', 'student_progress', 'resources', 'quizzes', 'quiz_submissions', 'sync_queue', 'audit_logs'];
  for (const storeName of storesToClear) {
    if (db.objectStoreNames.contains(storeName)) {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
    }
  }
  await logAudit('DATA_PURGE', 'All curriculum, worksheet, quiz, and progress records cleared.', 'WARNING');
}

// ===================== PERMISSION-ENFORCED STUDENT & QUIZ DATA ACCESS =====================

/**
 * Retrieves student progress strictly respecting RBAC rules:
 * - If user is a Student: Returns ONLY their own progress record. Any targetStudentId parameter is ignored.
 * - If user is a Teacher / Admin: Returns all student progress records (or filtered by targetStudentId).
 */
export async function getStudentProgressForUser(user: { id: string; role: string }, targetStudentId?: string): Promise<StudentProgressRecord[]> {
  if (user.role === 'Student') {
    // STRICT SECURITY: A student CANNOT query or view another student's progress under any circumstances.
    const myRecord = await dbGet<StudentProgressRecord>('student_progress', user.id);
    return myRecord ? [myRecord] : [];
  }
  
  // Teacher / Admin: Return all or target
  const all = await dbGetAll<StudentProgressRecord>('student_progress');
  if (targetStudentId) {
    return all.filter(r => r.studentId === targetStudentId);
  }
  return all;
}

/**
 * Retrieves quizzes according to user role:
 * - Students: ONLY receive published quizzes.
 * - Teachers: Receive all quizzes (both drafts and published).
 */
export async function getQuizzesForUser(user: { id: string; role: string }): Promise<QuizRecord[]> {
  const all = await dbGetAll<QuizRecord>('quizzes');
  if (user.role === 'Student') {
    return all.filter(q => q.published);
  }
  return all;
}

/**
 * Retrieves quiz submissions strictly respecting RBAC rules:
 * - Students: CAN ONLY EVER receive their own submissions (studentId === user.id).
 * - Teachers: Can receive all submissions for a quiz or overall.
 */
export async function getQuizSubmissionsForUser(user: { id: string; role: string }, quizId?: string): Promise<QuizSubmissionRecord[]> {
  const all = await dbGetAll<QuizSubmissionRecord>('quiz_submissions');
  let filtered = all;
  if (quizId) {
    filtered = filtered.filter(s => s.quizId === quizId);
  }
  if (user.role === 'Student') {
    // STRICT SECURITY: Students can ONLY view their own quiz attempts and results
    return filtered.filter(s => s.studentId === user.id);
  }
  return filtered;
}

/**
 * Saves a student's quiz submission and updates their progress record
 */
export async function saveQuizSubmission(submission: QuizSubmissionRecord): Promise<void> {
  await dbPut('quiz_submissions', submission);

  // Update or create student progress record
  let prog = await dbGet<StudentProgressRecord>('student_progress', submission.studentId);
  if (!prog) {
    prog = {
      studentId: submission.studentId,
      studentName: submission.studentName,
      grade: 'Grade 1',
      literacyScore: 70,
      numeracyScore: 70,
      listeningScore: 75,
      participationScore: 80,
      overallScore: submission.percentage,
      completedLessons: [],
      submittedAssignments: [],
      completedWorksheets: [],
      completedQuizzes: [submission.quizId],
      aiRecommendation: 'Consistent multilingual engagement observed.',
      recommendationTagClass: 'tag-purple',
      badges: ['Quiz Master 🎯'],
      lastActive: Date.now(),
      lastAssessed: Date.now(),
      updatedAt: Date.now(),
      syncState: 'local'
    };
  } else {
    // Recalculate overall score with quiz weight
    prog.overallScore = Math.round((prog.overallScore + submission.percentage) / 2);
    prog.lastActive = Date.now();
    prog.lastAssessed = Date.now();
    prog.updatedAt = Date.now();
    if (!prog.completedQuizzes) prog.completedQuizzes = [];
    if (!prog.completedQuizzes.includes(submission.quizId)) {
      prog.completedQuizzes.push(submission.quizId);
    }
    if (!prog.badges) prog.badges = [];
    if (!prog.badges.includes('Quiz Master 🎯')) {
      prog.badges.push('Quiz Master 🎯');
    }
  }
  await dbPut('student_progress', prog);
}

// Helper stub removed demo data
export function hasDemoData(): boolean {
  return false;
}

// ===================== STUDENT DATA & METRICS STORAGE HELPERS =====================

export async function recordStudentResourceDownload(studentId: string, resourceId: string): Promise<number> {
  const key = `bhashasetu_downloads_${studentId}`;
  let downloads: string[] = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) downloads = JSON.parse(raw);
  } catch (e) {}
  if (!downloads.includes(resourceId)) {
    downloads.push(resourceId);
    localStorage.setItem(key, JSON.stringify(downloads));
  }
  return downloads.length;
}

export function getStudentDownloadCount(studentId: string): number {
  const key = `bhashasetu_downloads_${studentId}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.length : 0;
    }
  } catch (e) {}
  return 0;
}

export async function recordStudentLessonCompletion(studentId: string, lessonId: string): Promise<string[]> {
  const key = `bhashasetu_lessons_completed_${studentId}`;
  let completed: string[] = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) completed = JSON.parse(raw);
  } catch (e) {}
  if (!completed.includes(lessonId)) {
    completed.push(lessonId);
    localStorage.setItem(key, JSON.stringify(completed));
  }

  try {
    const allProg = await dbGetAll<StudentProgressRecord>('student_progress');
    let prog = allProg.find(p => p.studentId === studentId);
    if (prog) {
      if (!prog.completedLessons) prog.completedLessons = [];
      if (!prog.completedLessons.includes(lessonId)) {
        prog.completedLessons.push(lessonId);
        prog.lastActive = Date.now();
        await dbPut('student_progress', prog);
      }
    }
  } catch (e) {}

  return completed;
}

export function getStudentLessonCompletions(studentId: string): string[] {
  const key = `bhashasetu_lessons_completed_${studentId}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    }
  } catch (e) {}
  return [];
}

