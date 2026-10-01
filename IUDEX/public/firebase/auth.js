// ==========================================================================
// e-CON — Auth Service
//
// Two providers, one account model:
//   • Email + password  (Firebase "Email/Password" provider)
//   • Google            (Firebase "Google" provider)
//
// There is no whitelist. Anyone can create an e-CON account. What gates
// entry to the app is *not* identity but onboarding state: a signed-in
// account without a claimed @username has no usable presence in a
// username-based messenger, so it is routed to the username step instead
// of the app shell.
//
// watchAuthState therefore reports one of three states:
//   { status: "signed-out" }
//   { status: "needs-username", user }   — authenticated, no @username yet
//   { status: "ready", user, profile }   — fully onboarded
// ==========================================================================

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, googleProvider } from "./config.js";
import { getDocById, setDocById, serverTimestamp } from "./firestore.js";
import { syncPublicProfile } from "../services/users.js";

/* -------------------------------------------------------------------------
   Profile seeding
   ------------------------------------------------------------------------- */

/**
 * Create or refresh users/{uid}. Deliberately does NOT touch `username`:
 * that field is owned exclusively by the claim transaction in
 * services/usernames.js, and a careless merge here could clobber it.
 */
async function seedProfile(user, { displayName } = {}) {
  const existing = await getDocById("users", user.uid);

  await setDocById(
    "users",
    user.uid,
    {
      uid: user.uid,
      // Prefer what's already stored — the user may have edited their
      // display name in e-CON after signing up with Google.
      name: existing?.name || displayName || user.displayName || "",
      email: user.email || "",
      photoURL: existing?.photoURL || user.photoURL || "",
      bio: existing?.bio || "",
      lastSeen: serverTimestamp(),
      ...(existing ? {} : { joinedAt: serverTimestamp() })
    },
    true
  );

  const profile = await getDocById("users", user.uid);
  await syncPublicProfile(profile);
  return profile;
}

/* -------------------------------------------------------------------------
   Email + password
   ------------------------------------------------------------------------- */

/**
 * Create a new account. `displayName` is written to the Firebase Auth
 * profile as well as the Firestore doc so it survives a cache clear.
 * The @username is chosen on the next screen, not here.
 */
export async function signUpWithEmail(email, password, displayName = "") {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);

  if (displayName.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim() });
  }
  await seedProfile(cred.user, { displayName: displayName.trim() });

  // Best-effort: a failed verification email must never block sign-up.
  sendEmailVerification(cred.user).catch(() => {});

  return cred.user;
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  await seedProfile(cred.user);
  return cred.user;
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim());
}

/* -------------------------------------------------------------------------
   Google
   ------------------------------------------------------------------------- */

/**
 * Popup first, redirect as a fallback. Installed PWAs and several in-app
 * browsers block popups outright, and the thrown code there
 * ("popup-blocked" / "operation-not-supported-in-this-environment") is
 * indistinguishable to the user from a broken button — so we transparently
 * switch to the redirect flow instead of surfacing an error.
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await seedProfile(result.user);
    return result.user;
  } catch (err) {
    const fallback = [
      "auth/popup-blocked",
      "auth/operation-not-supported-in-this-environment",
      "auth/cancelled-popup-request"
    ];
    if (fallback.includes(err?.code)) {
      await signInWithRedirect(auth, googleProvider);
      return null; // page navigates away; resolved by completeRedirectSignIn()
    }
    throw err;
  }
}

/**
 * Called once at boot. Resolves a pending redirect sign-in, if any.
 * Returns the user, or null when this wasn't a redirect return.
 */
export async function completeRedirectSignIn() {
  try {
    const result = await getRedirectResult(auth);
    if (!result?.user) return null;
    await seedProfile(result.user);
    return result.user;
  } catch (err) {
    console.warn("[auth] redirect sign-in failed:", err?.code || err);
    return null;
  }
}

/* -------------------------------------------------------------------------
   Session
   ------------------------------------------------------------------------- */

export async function logout() {
  await signOut(auth);
}

/**
 * Subscribe to auth + onboarding state.
 *
 * The profile lookup means every callback is one Firestore read, so the
 * caller gets the username without a second round-trip. `refreshAuthState()`
 * re-runs the same logic after the username is claimed, since claiming
 * doesn't change Firebase Auth state and so wouldn't fire this on its own.
 */
let lastCallback = null;

export function watchAuthState(callback) {
  lastCallback = callback;
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({ status: "signed-out" });
      return;
    }
    await emitForUser(user, callback);
  });
}

async function emitForUser(user, callback) {
  let profile = null;
  try {
    profile = await getDocById("users", user.uid);
    if (!profile) profile = await seedProfile(user);
    else await syncPublicProfile(profile);
  } catch (err) {
    console.error("[auth] could not load profile:", err);
    callback({ status: "error", user, error: err });
    return;
  }

  if (!profile?.username) {
    callback({ status: "needs-username", user, profile });
    return;
  }
  callback({ status: "ready", user, profile });
}

/** Re-evaluate onboarding state for the current user (e.g. after a claim). */
export async function refreshAuthState() {
  const user = auth.currentUser;
  if (!user || !lastCallback) return;
  await emitForUser(user, lastCallback);
}

export { updateProfile };
