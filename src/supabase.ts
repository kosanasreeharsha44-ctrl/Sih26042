// ============================================================================
// BhashaSetu - Supabase Cloud Production Backend Data & Storage Service Layer
// Seamlessly connects with PostgreSQL / Supabase Realtime & Storage
// Works offline-first with IndexedDB sync queue when offline!
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  dbGetAll,
  dbGet,
  dbPut,
  dbDelete,
  logAudit,
  UserRecord,
  UserHistoryRecord,
  LessonRecord,
  WorksheetRecord,
  AssignmentRecord,
  StudentProgressRecord,
  ResourceRecord,
  SyncQueueItem
} from './db';
import { enqueueSync } from './sync';

export { enqueueSync as queueSyncAction };

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  connected: boolean;
  lastSyncTimestamp?: number;
  autoSyncIntervalSec: number;
}

// Supabase PostgreSQL Relational Schema Definitions
export interface SupabaseProfile {
  id: string; // auth.uid()
  email: string;
  name: string;
  role: 'Teacher' | 'Student' | 'Admin';
  school?: string;
  district?: string;
  state?: string;
  grade?: string;
  mother_tongue?: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseClass {
  id: string;
  teacher_id: string;
  name: string;
  grade: string;
  mother_tongue: string;
  academic_year: string;
  created_at: string;
}

export interface SupabaseLesson {
  id: string;
  teacher_id: string;
  class_id?: string;
  title: string;
  topic: string;
  grade: string;
  subject: string;
  source_lang: string;
  target_lang: string;
  lesson_text: string;
  script_text?: string;
  explanation?: string;
  voice_text?: string;
  worksheet_content?: string;
  questions_content?: string;
  published: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SupabaseWorksheet {
  id: string;
  lesson_id?: string;
  title: string;
  grade: string;
  subject: string;
  languages: string;
  format: string;
  questions: any[];
  version: number;
  created_at: string;
}

export interface SupabaseAssignment {
  id: string;
  lesson_id?: string;
  title: string;
  description: string;
  grade: string;
  language: string;
  deadline: string;
  max_score: number;
  version: number;
  created_at: string;
}

export interface SupabaseSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  student_name: string;
  submitted_at: string;
  status: 'submitted' | 'graded';
  text_content?: string;
  voice_audio_url?: string;
  attachment_url?: string;
  score?: number;
  feedback?: string;
  graded_at?: string;
}

export interface SupabaseResource {
  id: string;
  uploader_id: string;
  title: string;
  category: 'ebook' | 'audio' | 'video' | 'image' | 'guide' | 'printable';
  language: string;
  description?: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  is_public: boolean;
  created_at: string;
}

export interface SupabaseStudentProgress {
  id: string;
  student_id: string;
  grade: string;
  literacy_score: number;
  numeracy_score: number;
  listening_score: number;
  participation_score: number;
  overall_score: number;
  completed_lessons: string[];
  submitted_assignments: string[];
  completed_worksheets: string[];
  ai_recommendation?: string;
  last_active: string;
  updated_at: string;
}

// Local Storage Key for runtime config overrides
const SUPABASE_CONFIG_KEY = 'bhashasetu_supabase_config';

export function getSupabaseConfig(): SupabaseConfig {
  try {
    const saved = localStorage.getItem(SUPABASE_CONFIG_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    // fallback
  }

  return {
    supabaseUrl: (window as any).__SUPABASE_URL__ || '',
    supabaseAnonKey: (window as any).__SUPABASE_ANON_KEY__ || '',
    connected: false,
    autoSyncIntervalSec: 60
  };
}

export function saveSupabaseConfig(config: Partial<SupabaseConfig>): void {
  const current = getSupabaseConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(updated));
  // Reset cached client instance when config changes
  supabaseInstance = null;
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(SUPABASE_CONFIG_KEY);
  supabaseInstance = null;
}

export function isSupabaseConfigured(): boolean {
  const cfg = getSupabaseConfig();
  return Boolean(
    cfg.supabaseUrl &&
    cfg.supabaseAnonKey &&
    cfg.supabaseUrl.startsWith('http') &&
    !cfg.supabaseUrl.includes('YOUR_') &&
    !cfg.supabaseAnonKey.includes('YOUR_')
  );
}

// Single official @supabase/supabase-js client singleton
let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!supabaseInstance) {
    const cfg = getSupabaseConfig();
    try {
      supabaseInstance = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      });
    } catch (e) {
      console.warn('Failed to initialize Supabase client:', e);
      return null;
    }
  }
  return supabaseInstance;
}

export function getSupabaseAuthStatus(): {
  connected: boolean;
  status: 'CONNECTED' | 'SETUP_REQUIRED';
  message: string;
  config: SupabaseConfig;
} {
  const configured = isSupabaseConfigured();
  const cfg = getSupabaseConfig();
  return {
    connected: configured,
    status: configured ? 'CONNECTED' : 'SETUP_REQUIRED',
    message: configured
      ? 'Supabase backend connected & ready for Google OAuth.'
      : 'Supabase Not Connected / Setup Required. Provide Supabase URL & Anon Key in Settings to activate real Google Login.',
    config: cfg
  };
}

// Real Supabase Google OAuth sign-in flow (No fake auth)
export async function signInWithGoogleOAuth(): Promise<{
  success: boolean;
  data?: any;
  error?: string;
  status: 'CONNECTED' | 'SETUP_REQUIRED' | 'ERROR';
}> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      status: 'SETUP_REQUIRED',
      error: 'Supabase is not connected yet. Supabase URL and Anon Key are required to connect Google Login without faking authentication.'
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      status: 'SETUP_REQUIRED',
      error: 'Supabase client could not be initialized. Please check your credentials.'
    };
  }

  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });

    if (error) {
      return { success: false, status: 'ERROR', error: error.message };
    }
    return { success: true, status: 'CONNECTED', data };
  } catch (err: any) {
    return { success: false, status: 'ERROR', error: err?.message || 'OAuth initialization error' };
  }
}

// Retrieve active Supabase user session (if any exists from real OAuth callback)
export async function getSupabaseSession(): Promise<{ user: any; session: any } | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) return null;
    return { user: session.user, session };
  } catch (err) {
    console.warn('Error reading Supabase session:', err);
    return null;
  }
}

// Sign out from Supabase
export async function signOutSupabase(): Promise<void> {
  const client = getSupabaseClient();
  if (client) {
    try {
      await client.auth.signOut();
    } catch (_) {}
  }
}

// Listen to auth state changes from Supabase
export function onSupabaseAuthStateChange(callback: (event: string, session: any) => void): { unsubscribe: () => void } {
  const client = getSupabaseClient();
  if (!client) {
    return { unsubscribe: () => {} };
  }
  const { data: { subscription } } = client.auth.onAuthStateChange(callback);
  return subscription;
}

// REST API helper for Supabase PostgREST endpoints
async function supabaseFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const cfg = getSupabaseConfig();
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured yet. Offline mode active.');
  }

  const cleanUrl = cfg.supabaseUrl.replace(/\/+$/, '');
  const url = `${cleanUrl}/rest/v1/${endpoint.replace(/^\/+/, '')}`;

  const headers: Record<string, string> = {
    'apikey': cfg.supabaseAnonKey,
    'Authorization': `Bearer ${cfg.supabaseAnonKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...(options.headers as Record<string, string> || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase API error (${response.status}): ${errorText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }
  return await response.text();
}

// Connection test
export async function testSupabaseConnection(url?: string, key?: string): Promise<{ success: boolean; message: string }> {
  const targetUrl = url || getSupabaseConfig().supabaseUrl;
  const targetKey = key || getSupabaseConfig().supabaseAnonKey;

  if (!targetUrl || !targetKey) {
    return { success: false, message: 'Please provide both Supabase URL and Anon Key.' };
  }

  try {
    const cleanUrl = targetUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': targetKey,
        'Authorization': `Bearer ${targetKey}`
      }
    });

    if (res.ok || res.status === 200 || res.status === 404) {
      saveSupabaseConfig({ supabaseUrl: targetUrl, supabaseAnonKey: targetKey, connected: true });
      await logAudit('SUPABASE_CONNECTED', `Successfully connected to Supabase backend: ${targetUrl}`);
      return { success: true, message: 'Successfully verified connection to Supabase cloud instance!' };
    } else {
      return { success: false, message: `Server returned status ${res.status}: ${res.statusText}` };
    }
  } catch (err: any) {
    return { success: false, message: `Connection failed: ${err?.message || 'Network unreachable'}` };
  }
}

// Supabase Storage Upload for Educational Media (PDFs, Audio recordings, Worksheets)
export async function uploadToSupabaseStorage(
  bucketName: string,
  filePath: string,
  fileData: Blob | ArrayBuffer,
  contentType: string
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  const cfg = getSupabaseConfig();
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase storage is offline. File saved locally in browser IndexedDB.' };
  }

  try {
    const cleanUrl = cfg.supabaseUrl.replace(/\/+$/, '');
    const uploadUrl = `${cleanUrl}/storage/v1/object/${bucketName}/${filePath}`;

    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'apikey': cfg.supabaseAnonKey,
        'Authorization': `Bearer ${cfg.supabaseAnonKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: fileData
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `Upload failed: ${err}` };
    }

    const publicUrl = `${cleanUrl}/storage/v1/object/public/${bucketName}/${filePath}`;
    return { success: true, publicUrl };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Storage error' };
  }
}

// Synchronize all pending items in sync_queue to Supabase
export async function syncLocalQueueToSupabase(): Promise<{ syncedCount: number; errors: string[] }> {
  if (!isSupabaseConfigured() || !navigator.onLine) {
    return { syncedCount: 0, errors: ['Offline or Supabase not configured. Changes remain queued in IndexedDB.'] };
  }

  const queueItems = await dbGetAll<SyncQueueItem>('sync_queue');
  if (queueItems.length === 0) {
    return { syncedCount: 0, errors: [] };
  }

  let syncedCount = 0;
  const errors: string[] = [];

  for (const item of queueItems) {
    try {
      const tableName = item.entity; // e.g. 'lessons', 'worksheets', 'assignments'
      const action = (item.action || '').toUpperCase();
      if (action === 'CREATE' || action === 'UPDATE') {
        await supabaseFetch(tableName, {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify(item.payload)
        });
      } else if (action === 'DELETE') {
        const id = item.payload?.id || item.entityId;
        if (id) {
          await supabaseFetch(`${tableName}?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE'
          });
        }
      }

      if (item.id !== undefined) {
        await dbDelete('sync_queue', item.id);
      }
      syncedCount++;
    } catch (err: any) {
      errors.push(`Failed sync on ${item.entity} (${item.entityId}): ${err.message}`);
    }
  }

  saveSupabaseConfig({ lastSyncTimestamp: Date.now() });
  await logAudit('SUPABASE_SYNC', `Synchronized ${syncedCount} offline operations to Supabase cloud.`);
  return { syncedCount, errors };
}

// Synchronize user history records to Supabase user_history table
export async function syncUserHistoryToSupabase(userId: string): Promise<{ success: boolean; count: number; message: string }> {
  if (!isSupabaseConfigured() || !navigator.onLine) {
    return {
      success: false,
      count: 0,
      message: 'Offline or Supabase not connected. History safely stored in browser IndexedDB.'
    };
  }

  try {
    const allHistory = await dbGetAll<UserHistoryRecord>('user_history');
    const userItems = allHistory.filter(item => !userId || item.userId === userId);

    if (userItems.length === 0) {
      return { success: true, count: 0, message: 'No history records to sync.' };
    }

    let synced = 0;
    for (const item of userItems) {
      await supabaseFetch('user_history', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          id: item.id,
          user_id: item.userId,
          user_name: item.userName,
          type: item.type,
          title: item.title,
          source_lang: item.sourceLang,
          target_lang: item.targetLang,
          source_text: item.sourceText,
          translated_text: item.translatedText,
          confidence: item.confidence,
          metadata: item.metadata || {},
          created_at: new Date(item.timestamp).toISOString()
        })
      });
      synced++;
    }

    return {
      success: true,
      count: synced,
      message: `Successfully synced ${synced} learning history records to Supabase cloud.`
    };
  } catch (err: any) {
    return {
      success: false,
      count: 0,
      message: `Sync notice: ${err?.message || 'Cloud endpoint unavailable. Retaining in IndexedDB.'}`
    };
  }
}

