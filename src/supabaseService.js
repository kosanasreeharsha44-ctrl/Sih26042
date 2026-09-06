import { supabase } from "./supabaseClient.js";

// ============================================================================
// Supabase Data & Storage Service
// Real cloud database CRUD & Private Storage operations for BhashaSetu
// Uses RLS with auth.uid()
// ============================================================================

export const STORAGE_BUCKET = "app-files";

/**
 * Get current authenticated Supabase user
 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// ============================================================================
// STORAGE: PRIVATE BUCKET OPERATIONS ("app-files")
// Folder rule strictly enforced: ${auth.uid()}/${featureName}/${itemId}/${uuid}.${ext}
// ============================================================================

/**
 * Uploads any file to the private "app-files" bucket.
 * 
 * Path format strictly follows:
 * ${auth.uid()}/${featureName}/${itemId}/${uuid}.${extension}
 * 
 * @param {object} params
 * @param {string} params.featureName - Feature namespace (e.g. 'lessons', 'resources', 'scans', 'ai-docs')
 * @param {string} params.itemId - Identifier for the entity (e.g. lessonId, resId)
 * @param {File|Blob} params.file - File or Blob object
 * @param {string} [params.fileName] - Original file name
 * @param {string} [params.contentType] - MIME type
 * @returns {Promise<{ path: string|null, signedUrl: string|null, error: any }>}
 */
export async function uploadFileToStorage({
  featureName,
  itemId,
  file,
  fileName = "",
  contentType = ""
}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      console.warn("User not authenticated for Supabase Storage upload");
      return {
        path: null,
        signedUrl: null,
        error: new Error("User must be logged in to upload files to Supabase Storage.")
      };
    }

    const userId = user.id;
    const origName = fileName || (file instanceof File ? file.name : "upload.bin");
    const parts = origName.split(".");
    const rawExt = parts.length > 1 ? parts.pop() : "bin";
    const extension = (rawExt || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");

    const uuid = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

    const safeFeature = String(featureName).replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeItemId = String(itemId).replace(/[^a-zA-Z0-9_-]/g, "_");

    // Important folder rule: every uploaded file path must start with user id:
    // ${auth.uid()}/${featureName}/${itemId}/${uuid}.${extension}
    const storagePath = `${userId}/${safeFeature}/${safeItemId}/${uuid}.${extension}`;

    const mime = contentType || (file instanceof File ? file.type : "application/octet-stream");

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: mime
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError.message);
      return { path: null, signedUrl: null, error: uploadError };
    }

    // Bucket is private - generate signed URL valid for 24 hours
    const { data: signData, error: signError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24);

    if (signError) {
      console.warn("Storage createSignedUrl warning:", signError.message);
    }

    return {
      path: storagePath,
      signedUrl: signData?.signedUrl || null,
      error: null
    };
  } catch (err) {
    console.error("uploadFileToStorage exception:", err);
    return { path: null, signedUrl: null, error: err };
  }
}

/**
 * Generates a signed URL for a file in the private "app-files" bucket.
 * 
 * @param {string} storagePath - Relative path within bucket
 * @param {number} [expiresIn=86400] - Expiration time in seconds (default 24h)
 * @returns {Promise<string|null>}
 */
export async function getSignedUrl(storagePath, expiresIn = 86400) {
  if (!storagePath) return null;
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, expiresIn);

    if (error || !data?.signedUrl) {
      console.warn("getSignedUrl error for path:", storagePath, error?.message);
      return null;
    }
    return data.signedUrl;
  } catch (e) {
    console.warn("getSignedUrl exception:", e);
    return null;
  }
}

/**
 * Removes file(s) from the private "app-files" bucket.
 * 
 * @param {string|string[]} paths - One or more paths
 * @returns {Promise<{ error: any }>}
 */
export async function deleteFileFromStorage(paths) {
  if (!paths) return { error: null };
  const pathList = Array.isArray(paths) ? paths : [paths];
  const validPaths = pathList.filter(Boolean);
  if (validPaths.length === 0) return { error: null };

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(validPaths);

    if (error) {
      console.warn("deleteFileFromStorage warning:", error.message);
      return { error };
    }
    return { error: null };
  } catch (e) {
    console.error("deleteFileFromStorage exception:", e);
    return { error: e };
  }
}

// ============================================================================
// LESSONS: CRUD OPERATIONS
// ============================================================================

/**
 * 1. LOAD: Fetch all lessons belonging to the authenticated user
 * @returns {Promise<{ data: any[], error: any }>}
 */
export async function fetchLessons() {
  try {
    const { data, error } = await supabase
      .from("lessons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Supabase fetchLessons error:", error.message);
      return { data: [], error };
    }

    // Convert snake_case db fields to camelCase and resolve signed URLs for private files
    const formatted = await Promise.all((data || []).map(async row => {
      let resolvedFileUrl = row.file_data || "";
      let signedUrl = "";
      if (row.storage_path) {
        const signUrl = await getSignedUrl(row.storage_path);
        if (signUrl) {
          signedUrl = signUrl;
          resolvedFileUrl = signUrl;
        }
      }

      return {
        id: row.id,
        title: row.title || "Untitled Lesson",
        topic: row.topic || row.title || "",
        grade: row.grade || "Primary",
        subject: row.subject || "Curriculum",
        sourceLang: row.source_lang || "Hindi",
        targetLang: row.target_lang || "Ho",
        lessonText: row.lesson_text || "",
        translatedText: row.translated_text || "",
        scriptText: row.script_text || "",
        explanation: row.explanation || "",
        voiceText: row.voice_text || "",
        worksheetContent: row.worksheet_content || "",
        questionsContent: row.questions_content || "",
        fileData: resolvedFileUrl,
        storagePath: row.storage_path || "",
        signedUrl: signedUrl || resolvedFileUrl,
        fileName: row.file_name || "",
        mimeType: row.mime_type || "image/jpeg",
        completionPct: row.completion_pct || 0,
        published: row.published ?? true,
        approved: row.approved ?? true,
        syncState: "synced",
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
        authorId: row.user_id || "teacher"
      };
    }));

    return { data: formatted, error: null };
  } catch (err) {
    console.error("fetchLessons exception:", err);
    return { data: [], error: err };
  }
}

/**
 * 2. CREATE: Insert a new lesson for the authenticated user
 * @param {object} lesson - The lesson data to save
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function createLesson(lesson) {
  try {
    const user = await getCurrentUser();
    const userId = user?.id;

    const payload = {
      user_id: userId,
      title: lesson.title || "Untitled Lesson",
      topic: lesson.topic || lesson.title || "",
      grade: lesson.grade || "Primary",
      subject: lesson.subject || "Curriculum",
      source_lang: lesson.sourceLang || lesson.source_lang || "Hindi",
      target_lang: lesson.targetLang || lesson.target_lang || "Ho",
      lesson_text: lesson.lessonText || lesson.lesson_text || "",
      translated_text: lesson.translatedText || lesson.translated_text || "",
      script_text: lesson.scriptText || lesson.script_text || "",
      explanation: lesson.explanation || "",
      voice_text: lesson.voiceText || lesson.voice_text || "",
      worksheet_content: lesson.worksheetContent || lesson.worksheet_content || "",
      questions_content: lesson.questionsContent || lesson.questions_content || "",
      file_data: lesson.fileData || lesson.file_data || "",
      file_name: lesson.fileName || lesson.file_name || "",
      mime_type: lesson.mimeType || lesson.mime_type || "image/jpeg",
      storage_path: lesson.storagePath || lesson.storage_path || "",
      published: lesson.published ?? true
    };

    if (lesson.id && !lesson.id.startsWith("les_")) {
      payload.id = lesson.id;
    }

    const { data, error } = await supabase
      .from("lessons")
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.warn("Supabase createLesson error:", error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    console.error("createLesson exception:", err);
    return { data: null, error: err };
  }
}

/**
 * 3. UPDATE: Modify an existing lesson
 * @param {string} id - The lesson ID
 * @param {object} updates - Fields to update
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function updateLesson(id, updates) {
  try {
    const payload = {
      updated_at: new Date().toISOString()
    };

    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.topic !== undefined) payload.topic = updates.topic;
    if (updates.grade !== undefined) payload.grade = updates.grade;
    if (updates.subject !== undefined) payload.subject = updates.subject;
    if (updates.sourceLang !== undefined || updates.source_lang !== undefined) {
      payload.source_lang = updates.sourceLang ?? updates.source_lang;
    }
    if (updates.targetLang !== undefined || updates.target_lang !== undefined) {
      payload.target_lang = updates.targetLang ?? updates.target_lang;
    }
    if (updates.lessonText !== undefined || updates.lesson_text !== undefined) {
      payload.lesson_text = updates.lessonText ?? updates.lesson_text;
    }
    if (updates.translatedText !== undefined || updates.translated_text !== undefined) {
      payload.translated_text = updates.translatedText ?? updates.translated_text;
    }
    if (updates.scriptText !== undefined || updates.script_text !== undefined) {
      payload.script_text = updates.scriptText ?? updates.script_text;
    }
    if (updates.explanation !== undefined) payload.explanation = updates.explanation;
    if (updates.voiceText !== undefined || updates.voice_text !== undefined) {
      payload.voice_text = updates.voiceText ?? updates.voice_text;
    }
    if (updates.worksheetContent !== undefined || updates.worksheet_content !== undefined) {
      payload.worksheet_content = updates.worksheetContent ?? updates.worksheet_content;
    }
    if (updates.questionsContent !== undefined || updates.questions_content !== undefined) {
      payload.questions_content = updates.questionsContent ?? updates.questions_content;
    }
    if (updates.fileData !== undefined || updates.file_data !== undefined) {
      payload.file_data = updates.fileData ?? updates.file_data;
    }
    if (updates.fileName !== undefined || updates.file_name !== undefined) {
      payload.file_name = updates.fileName ?? updates.file_name;
    }
    if (updates.mimeType !== undefined || updates.mime_type !== undefined) {
      payload.mime_type = updates.mimeType ?? updates.mime_type;
    }
    if (updates.storagePath !== undefined || updates.storage_path !== undefined) {
      payload.storage_path = updates.storagePath ?? updates.storage_path;
    }
    if (updates.published !== undefined) payload.published = updates.published;

    const { data, error } = await supabase
      .from("lessons")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.warn("Supabase updateLesson error:", error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    console.error("updateLesson exception:", err);
    return { data: null, error: err };
  }
}

/**
 * 4. DELETE: Remove a lesson by ID and remove its storage file
 * @param {string} id - The lesson ID
 * @returns {Promise<{ error: any }>}
 */
export async function deleteLesson(id) {
  try {
    // 1. Fetch lesson to get storage_path
    const { data: lesson } = await supabase
      .from("lessons")
      .select("storage_path")
      .eq("id", id)
      .maybeSingle();

    if (lesson?.storage_path) {
      await deleteFileFromStorage(lesson.storage_path);
    }

    // 2. Delete database row
    const { error } = await supabase
      .from("lessons")
      .delete()
      .eq("id", id);

    if (error) {
      console.warn("Supabase deleteLesson error:", error.message);
      return { error };
    }

    return { error: null };
  } catch (err) {
    console.error("deleteLesson exception:", err);
    return { error: err };
  }
}

// ============================================================================
// WORKSHEETS: CRUD OPERATIONS
// ============================================================================

export async function fetchWorksheets() {
  try {
    const { data, error } = await supabase
      .from("worksheets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return { data: [], error };

    const formatted = (data || []).map(row => ({
      id: row.id,
      title: row.title,
      lessonId: row.lesson_id,
      grade: row.grade || "Primary",
      subject: row.subject || "General",
      languages: row.languages || "Hindi / Ho",
      format: row.format || "PDF",
      sizeKb: row.size_kb || 250,
      questions: row.questions || [],
      approved: true,
      syncState: "synced",
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    }));

    return { data: formatted, error: null };
  } catch (err) {
    return { data: [], error: err };
  }
}

export async function createWorksheet(ws) {
  try {
    const user = await getCurrentUser();
    const payload = {
      user_id: user?.id,
      title: ws.title,
      lesson_id: ws.lessonId || null,
      grade: ws.grade || "Primary",
      subject: ws.subject || "General",
      languages: ws.languages || "Hindi / Ho",
      format: ws.format || "PDF",
      size_kb: ws.sizeKb || 250,
      questions: ws.questions || []
    };

    const { data, error } = await supabase
      .from("worksheets")
      .insert([payload])
      .select()
      .single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function deleteWorksheet(id) {
  try {
    const { error } = await supabase
      .from("worksheets")
      .delete()
      .eq("id", id);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ============================================================================
// ASSIGNMENTS: CRUD OPERATIONS
// ============================================================================

export async function fetchAssignments() {
  try {
    const { data, error } = await supabase
      .from("assignments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return { data: [], error };

    const formatted = (data || []).map(row => ({
      id: row.id,
      title: row.title,
      description: row.description || "",
      grade: row.grade || "Grade 1-2",
      language: row.language || "Ho",
      deadline: row.deadline || "",
      maxScore: row.max_score || 100,
      submissions: row.submissions || [],
      syncState: "synced",
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    }));

    return { data: formatted, error: null };
  } catch (err) {
    return { data: [], error: err };
  }
}

export async function createAssignment(asg) {
  try {
    const user = await getCurrentUser();
    const payload = {
      user_id: user?.id,
      title: asg.title,
      description: asg.description || "",
      grade: asg.grade || "Grade 1-2",
      language: asg.language || "Ho",
      deadline: asg.deadline || "",
      max_score: asg.maxScore || 100,
      submissions: asg.submissions || []
    };

    const { data, error } = await supabase
      .from("assignments")
      .insert([payload])
      .select()
      .single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function deleteAssignment(id) {
  try {
    const { error } = await supabase
      .from("assignments")
      .delete()
      .eq("id", id);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ============================================================================
// USER LEARNING HISTORY (Translations, Lens Scans, Notes): CRUD OPERATIONS
// ============================================================================

export async function fetchUserHistory() {
  try {
    const { data, error } = await supabase
      .from("user_history")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return { data: [], error };

    const formatted = (data || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name || "",
      type: row.type,
      title: row.title,
      sourceLang: row.source_lang,
      targetLang: row.target_lang,
      sourceText: row.source_text,
      translatedText: row.translated_text,
      confidence: row.confidence,
      metadata: row.metadata,
      timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      syncState: "synced"
    }));

    return { data: formatted, error: null };
  } catch (err) {
    return { data: [], error: err };
  }
}

export async function createUserHistory(item) {
  try {
    const user = await getCurrentUser();
    const payload = {
      user_id: user?.id,
      type: item.type,
      title: item.title,
      source_lang: item.sourceLang || item.source_lang || "",
      target_lang: item.targetLang || item.target_lang || "",
      source_text: item.sourceText || item.source_text || "",
      translated_text: item.translatedText || item.translated_text || "",
      confidence: item.confidence ?? 1.0,
      metadata: item.metadata || {}
    };

    const { data, error } = await supabase
      .from("user_history")
      .insert([payload])
      .select()
      .single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function deleteUserHistory(id) {
  try {
    const { data: item } = await supabase
      .from("user_history")
      .select("metadata")
      .eq("id", id)
      .maybeSingle();

    if (item?.metadata?.storage_path) {
      await deleteFileFromStorage(item.metadata.storage_path);
    }

    const { error } = await supabase
      .from("user_history")
      .delete()
      .eq("id", id);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ============================================================================
// RESOURCES: CRUD & STORAGE OPERATIONS
// ============================================================================

export async function fetchResources() {
  try {
    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Supabase fetchResources warning:", error.message);
      return { data: [], error };
    }

    const formatted = await Promise.all((data || []).map(async row => {
      let signedUrl = "";
      if (row.storage_path) {
        signedUrl = (await getSignedUrl(row.storage_path)) || "";
      }
      return {
        id: row.id,
        title: row.title,
        fileName: row.file_name,
        fileType: row.file_type,
        mimeType: row.mime_type,
        category: row.category || "general",
        sizeKb: row.size_kb || 0,
        storagePath: row.storage_path || "",
        signedUrl: signedUrl,
        contentData: signedUrl,
        isOffline: false,
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        syncState: "synced"
      };
    }));

    return { data: formatted, error: null };
  } catch (err) {
    return { data: [], error: err };
  }
}

export async function createResource(resource) {
  try {
    const user = await getCurrentUser();
    const payload = {
      user_id: user?.id,
      title: resource.title || resource.fileName || "Untitled Resource",
      file_name: resource.fileName || "",
      file_type: resource.fileType || "",
      mime_type: resource.mimeType || "",
      category: resource.category || "general",
      size_kb: resource.sizeKb || 0,
      storage_path: resource.storagePath || resource.storage_path || ""
    };

    if (resource.id && !resource.id.startsWith("res_")) {
      payload.id = resource.id;
    }

    const { data, error } = await supabase
      .from("resources")
      .insert([payload])
      .select()
      .single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function deleteResource(id, storagePath = "") {
  try {
    let path = storagePath;
    if (!path) {
      const { data: res } = await supabase
        .from("resources")
        .select("storage_path")
        .eq("id", id)
        .maybeSingle();
      path = res?.storage_path || "";
    }

    if (path) {
      await deleteFileFromStorage(path);
    }

    const { error } = await supabase
      .from("resources")
      .delete()
      .eq("id", id);

    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ============================================================================
// 6. NOTES CRUD, REALTIME SUBSCRIPTION & COUNTER
// ============================================================================

/**
 * Counts the number of notes in the "notes" table where user_id = current user id.
 * Fetches the authenticated user using supabase.auth.getUser()
 * @param {string|null} [explicitUserId=null] - Optional user ID override
 * @returns {Promise<{ count: number, error: any }>}
 */
export async function getNotesCount(explicitUserId = null) {
  try {
    let userId = explicitUserId;
    if (!userId) {
      // 1. Fetch current authenticated user using supabase.auth.getUser()
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return { count: 0, error: userError || new Error("No authenticated user found") };
      }
      userId = user.id;
    }

    // 2. Count the number of notes in the "notes" table where user_id = current user id
    const { count, error } = await supabase
      .from("notes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    if (error) {
      console.warn("getNotesCount error:", error.message);
      // Fallback query without head:true
      const { data: rows, error: selectError } = await supabase
        .from("notes")
        .select("id")
        .eq("user_id", userId);

      if (!selectError && rows) {
        return { count: rows.length, error: null };
      }
      return { count: 0, error };
    }

    return { count: count ?? 0, error: null };
  } catch (err) {
    console.error("getNotesCount exception:", err);
    return { count: 0, error: err };
  }
}

/**
 * Fetches notes for current authenticated user
 */
export async function fetchNotes() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { data: [], error: userError || new Error("Not authenticated") };

    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    return { data: data || [], error };
  } catch (err) {
    return { data: [], error: err };
  }
}

/**
 * Creates a new note in "notes" table
 */
export async function createNote(note) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { data: null, error: userError || new Error("Not authenticated") };

    const payload = {
      user_id: user.id,
      title: note.title || "Untitled Note",
      content: note.content || note.text || "",
      category: note.category || "study",
      metadata: note.metadata || {}
    };

    if (note.id && !note.id.startsWith("local_")) {
      payload.id = note.id;
    }

    const { data, error } = await supabase
      .from("notes")
      .insert([payload])
      .select()
      .single();

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("notes-updated", { detail: { action: "create", data } }));
    }

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Deletes a note by id
 */
export async function deleteNote(id) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    let query = supabase.from("notes").delete().eq("id", id);
    if (user) {
      query = query.eq("user_id", user.id);
    }
    const { error } = await query;

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("notes-updated", { detail: { action: "delete", id } }));
    }

    return { error };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Subscribes to real-time changes on the "notes" table
 */
export function subscribeToNotes(callback) {
  const channel = supabase
    .channel("notes-live-channel")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notes" },
      (payload) => {
        if (typeof callback === "function") callback(payload);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("notes-updated", { detail: payload }));
        }
      }
    )
    .subscribe();

  return channel;
}
