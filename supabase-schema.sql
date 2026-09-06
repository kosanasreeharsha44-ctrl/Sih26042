-- ============================================================================
-- BhashaSetu - Supabase PostgreSQL Database Schema
-- Production Ready with Row Level Security (RLS) & auth.uid() Policies
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 2. USER PROFILES TABLE
-- Linked directly to Supabase auth.users
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  role TEXT CHECK (role IN ('Teacher', 'Student', 'Admin')) DEFAULT 'Teacher',
  school TEXT DEFAULT '',
  district TEXT DEFAULT '',
  state TEXT DEFAULT '',
  grade TEXT DEFAULT '',
  mother_tongue TEXT DEFAULT 'Ho',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- 3. LESSONS TABLE (Curriculum, Bilingual Sheets & OCR Scans)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  topic TEXT DEFAULT '',
  grade TEXT DEFAULT 'Primary',
  subject TEXT DEFAULT 'Curriculum',
  source_lang TEXT DEFAULT 'Hindi',
  target_lang TEXT DEFAULT 'Ho',
  lesson_text TEXT DEFAULT '',
  translated_text TEXT DEFAULT '',
  script_text TEXT DEFAULT '',
  explanation TEXT DEFAULT '',
  voice_text TEXT DEFAULT '',
  worksheet_content TEXT DEFAULT '',
  questions_content TEXT DEFAULT '',
  file_data TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  mime_type TEXT DEFAULT 'image/jpeg',
  storage_path TEXT DEFAULT '',
  completion_pct INTEGER DEFAULT 0,
  published BOOLEAN DEFAULT true,
  approved BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lessons RLS
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lessons"
  ON public.lessons FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own lessons"
  ON public.lessons FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lessons"
  ON public.lessons FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own lessons"
  ON public.lessons FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 4. WORKSHEETS TABLE (Bilingual Worksheets & Exercises)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.worksheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  grade TEXT DEFAULT 'Grade 1',
  subject TEXT DEFAULT 'Language & Math',
  languages TEXT DEFAULT 'Hindi / Ho',
  format TEXT DEFAULT 'PDF Printable',
  size_kb INTEGER DEFAULT 240,
  questions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Worksheets RLS
ALTER TABLE public.worksheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own worksheets"
  ON public.worksheets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own worksheets"
  ON public.worksheets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own worksheets"
  ON public.worksheets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own worksheets"
  ON public.worksheets FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 5. ASSIGNMENTS TABLE (Homework Tasks & Recitations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  grade TEXT DEFAULT 'Grade 1',
  language TEXT DEFAULT 'Ho',
  deadline TEXT DEFAULT '',
  max_score INTEGER DEFAULT 20,
  submissions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Assignments RLS
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assignments"
  ON public.assignments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assignments"
  ON public.assignments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assignments"
  ON public.assignments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own assignments"
  ON public.assignments FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 6. USER HISTORY TABLE (Translations, OCR Lens Scans, Voice Recitations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  source_lang TEXT DEFAULT '',
  target_lang TEXT DEFAULT '',
  source_text TEXT DEFAULT '',
  translated_text TEXT DEFAULT '',
  confidence NUMERIC DEFAULT 1.0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User History RLS
ALTER TABLE public.user_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own history"
  ON public.user_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history"
  ON public.user_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own history"
  ON public.user_history FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 7. RESOURCES TABLE (Curriculum Textbooks, PDFs, Audio Lessons & Media)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  file_name TEXT DEFAULT '',
  file_type TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  category TEXT DEFAULT 'general',
  size_kb INTEGER DEFAULT 0,
  storage_path TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Resources RLS
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own resources"
  ON public.resources FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own resources"
  ON public.resources FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own resources"
  ON public.resources FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- AUTOMATIC PROFILE CREATION TRIGGER ON SIGNUP
-- Creates public.profiles entry whenever a user registers in auth.users
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'Teacher')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 6. NOTES TABLE (Study Notes, Lesson Notes, and Pedagogical Annotations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL DEFAULT 'Untitled Note',
  content TEXT DEFAULT '',
  category TEXT DEFAULT 'study',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on notes
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Notes Policies (User-isolated)
CREATE POLICY "Users can view own notes"
  ON public.notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notes"
  ON public.notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notes"
  ON public.notes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notes"
  ON public.notes FOR DELETE
  USING (auth.uid() = user_id);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON public.notes(created_at DESC);

