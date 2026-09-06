import { supabase } from "./supabaseClient.js";

/**
 * Checks if user was redirected from a successful signup.
 * If so, displays the success message above the form and pre-fills the email input.
 * 
 * @param {HTMLElement|string} [successTarget="#auth-success-message"] - Container above the form
 * @param {HTMLElement|string} [emailTarget="#gate-input-identity"] - Email input field
 * @returns {string|null} The pre-filled email if applicable
 */
export function checkSignUpSuccess(
  successTarget = "#auth-success-message",
  emailTarget = "#gate-input-identity"
) {
  if (typeof window === "undefined") return null;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const hasSignupFlag = urlParams.get("signup") === "success";
    const storedEmail = sessionStorage.getItem("signup_success_email");
    const queryEmail = urlParams.get("email");
    const email = queryEmail || storedEmail;

    if (hasSignupFlag || storedEmail) {
      // 1) Find or create success banner container above the form
      let successElement = typeof successTarget === "string"
        ? document.querySelector(successTarget)
        : successTarget;

      if (!successElement) {
        const form = document.querySelector("form#gate-login-form") || document.querySelector("form");
        if (form && form.parentNode) {
          successElement = document.createElement("div");
          successElement.id = "auth-success-message";
          successElement.style.cssText = "display:none;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;padding:12px 14px;border-radius:10px;font-size:0.84rem;margin-bottom:14px;line-height:1.45;text-align:left;";
          form.parentNode.insertBefore(successElement, form);
        }
      }

      if (successElement) {
        successElement.textContent = "Your account has been created. Please check your email and verify your address before logging in.";
        successElement.style.display = "block";
      }

      // 2) Pre-fill the email input field with the registered email
      if (email) {
        const emailInput = typeof emailTarget === "string"
          ? (document.querySelector(emailTarget) || document.querySelector('input[type="email"]') || document.querySelector('#gate-input-identity'))
          : emailTarget;

        if (emailInput && 'value' in emailInput) {
          emailInput.value = decodeURIComponent(email);
        }
      }

      // 3) Ensure form is in Sign In mode (if switch button exists)
      const toggleRegBtn = document.getElementById("gate-toggle-reg-mode");
      const groupName = document.getElementById("gate-group-name");
      if (groupName) groupName.style.display = "none";
      if (toggleRegBtn) toggleRegBtn.textContent = "Register New Account";

      // 4) Clean URL params and session storage
      try {
        sessionStorage.removeItem("signup_success_email");
        if (hasSignupFlag) {
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      } catch (_) {}

      return email;
    }
  } catch (err) {
    console.warn("Sign in page check error:", err);
  }

  return null;
}

// Automatically check on load
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => checkSignUpSuccess());
  } else {
    checkSignUpSuccess();
  }
}

/**
 * Handles user Sign In using Supabase Auth
 * 
 * 1) Uses supabase.auth.signInWithPassword({ email, password })
 * 2) On error, displays a small error message under the form
 * 3) Only redirects to the Home page ("/") when a real session exists after login
 * 
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @param {HTMLElement|string} [errorTarget="#auth-error"] - Target element or selector to show error
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function handleSignIn(email, password, errorTarget = "#auth-error") {
  const errorElement = typeof errorTarget === "string" 
    ? document.querySelector(errorTarget) 
    : errorTarget;

  // Clear any existing error message
  if (errorElement) {
    errorElement.textContent = "";
    errorElement.style.display = "none";
  }

  // Authenticate with Supabase
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // Handle Supabase error
  if (error) {
    if (errorElement) {
      errorElement.textContent = error.message || "Failed to sign in. Please check your credentials.";
      errorElement.style.color = "#dc2626";
      errorElement.style.display = "block";
    }
    return { data: null, error };
  }

  // Only redirect when a real session exists after login
  if (data?.session) {
    window.location.href = "/";
    return { data, error: null };
  } else {
    if (errorElement) {
      errorElement.textContent = "Please check your email and verify your address before logging in.";
      errorElement.style.color = "#dc2626";
      errorElement.style.display = "block";
    }
    return { data, error: null };
  }
}

/**
 * Protect private pages with supabase.auth.getSession()
 * If no session exists, redirect to /login
 * 
 * @param {string} [loginUrl="/login"]
 * @returns {Promise<any>}
 */
export async function protectPrivatePages(loginUrl = "/login") {
  const currentPath = window.location.pathname;
  if (currentPath === loginUrl || currentPath === "/login" || currentPath === "/signup") {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  const session = data?.session;

  if (!session) {
    window.location.href = loginUrl;
    return null;
  }

  return session;
}

export const signIn = handleSignIn;
export { signInWithGoogle, loginWithGoogle } from "./supabaseClient.js";
export default handleSignIn;


