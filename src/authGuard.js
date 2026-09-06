import { supabase } from "./supabaseClient.js";

/**
 * Protects private pages with supabase.auth.getSession().
 * If no session exists, redirects to /login.
 * 
 * @param {string} [loginUrl="/login"] - Redirect destination if unauthenticated
 * @param {string[]} [publicPaths=["/login", "/signup"]] - Publicly accessible paths
 * @returns {Promise<any>} The authenticated session, or null if redirected
 */
export async function protectPrivatePages(loginUrl = "/login", publicPaths = ["/login", "/signup"]) {
  const currentPath = window.location.pathname;

  // Don't redirect if already on a public page
  if (publicPaths.includes(currentPath)) {
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

export const requireAuth = protectPrivatePages;
export default protectPrivatePages;
