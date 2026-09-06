import { supabase } from "./supabaseClient.js";

/**
 * Handles user Sign Up using Supabase Auth
 * 
 * 1) Uses supabase.auth.signUp({ email, password })
 * 2) On error, displays a small error message under the form
 * 3) On successful signup:
 *    - Does NOT auto-login
 *    - Redirects the user to the Sign In page (/login?signup=success&email=...)
 *    - Pre-fills / preserves the email for the Sign In form
 * 
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @param {HTMLElement|string} [errorTarget="#auth-error"] - Target element or selector to show error
 * @param {string} [signInPath="/login"] - Path of the Sign In page
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function handleSignUp(email, password, errorTarget = "#auth-error", signInPath = "/login") {
  const errorElement = typeof errorTarget === "string" 
    ? document.querySelector(errorTarget) 
    : errorTarget;

  // Clear any existing error message
  if (errorElement) {
    errorElement.textContent = "";
    errorElement.style.display = "none";
  }

  // Register with Supabase
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  // Basic error handling if signup fails
  if (error) {
    if (errorElement) {
      errorElement.textContent = error.message || "Failed to sign up. Please try again.";
      errorElement.style.color = "#dc2626";
      errorElement.style.display = "block";
    }
    return { data: null, error };
  }

  // 1) Ensure user is NOT auto-logged in
  if (data?.session) {
    try {
      await supabase.auth.signOut();
    } catch (_) {}
  }

  // 2) Cache email in sessionStorage as clean backup across state transitions
  try {
    sessionStorage.setItem("signup_success_email", email);
  } catch (_) {}

  // 3) Show success message and pre-fill email immediately in the UI
  const successElem = document.querySelector("#auth-success-message");
  if (successElem) {
    successElem.textContent = "Your account has been created. Please check your email and verify your address before logging in.";
    successElem.style.display = "block";
  }

  const emailInput = document.querySelector("#gate-input-identity") || document.querySelector('input[type="email"]');
  if (emailInput) {
    emailInput.value = email;
  }

  const groupName = document.getElementById("gate-group-name");
  if (groupName) groupName.style.display = "none";

  const toggleRegBtn = document.getElementById("gate-toggle-reg-mode");
  if (toggleRegBtn) toggleRegBtn.textContent = "Register New Account";

  const regPrompt = document.getElementById("gate-reg-prompt");
  if (regPrompt) regPrompt.textContent = "Need an account?";

  const submitBtn = document.getElementById("gate-submit-btn");
  if (submitBtn) submitBtn.textContent = "Sign In";

  // 4) Redirect user to Sign In page passing email via query parameter
  const encodedEmail = encodeURIComponent(email);
  const targetUrl = `${signInPath}?signup=success&email=${encodedEmail}`;

  if (typeof window !== "undefined") {
    if (window.location.pathname !== signInPath) {
      window.location.href = targetUrl;
    } else {
      try {
        window.history.replaceState({}, document.title, targetUrl);
      } catch (_) {}
    }
  }

  return { data, error: null };
}

export const signUp = handleSignUp;
export default handleSignUp;


