import { createClient } from "@supabase/supabase-js";

// ============================================================================
// Supabase Client Configuration
// Replace SUPABASE_URL and SUPABASE_PUBLIC_KEY with your project credentials:
// ============================================================================

// Paste your Supabase Project URL here:
const SUPABASE_URL = "https://knnupyxcrryxvhnscnix.supabase.co";

// Paste your Supabase Anon / Public Key here:
const SUPABASE_PUBLIC_KEY = "sb_publishable_X-7buRKk_-s69_9TfKttQA_SSttSJHy";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);

/**
 * Initiates Google OAuth login via Supabase.
 * 
 * @param {object} [options={}] - Optional configuration (e.g. redirectTo, scopes)
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function signInWithGoogle(options = {}) {
  // Clear any existing error message
  const errorElement = document.querySelector("#auth-error");
  if (errorElement) {
    errorElement.textContent = "";
    errorElement.style.display = "none";
  }

  const redirectTo = options.redirectTo || (typeof window !== "undefined" ? window.location.origin : "");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      ...options,
    },
  });

  if (error) {
    console.error("Google sign in error:", error.message);
    if (errorElement) {
      errorElement.textContent = error.message || "Failed to sign in with Google.";
      errorElement.style.color = "#dc2626";
      errorElement.style.display = "block";
    }
    return { data: null, error };
  }

  return { data, error: null };
}

export const loginWithGoogle = signInWithGoogle;
export const handleGoogleSignIn = signInWithGoogle;
