// ==========================================================================
// e-CON — Username Service
//
// A username is the app's primary identity: it's what people search for,
// what appears on profiles, and what a conversation is started from. So it
// must be globally unique, and uniqueness must be enforced by the database
// rather than by an availability check in the UI (two people can pass the
// same check in the same second).
//
// That's what `usernames/{username}` is for: a tiny doc whose *document id*
// is the lowercased username. Firestore document ids are unique by
// definition, so claiming a username is "create this doc if it does not
// exist" inside a transaction — which the database will reject for whoever
// loses the race. The check in the UI is just fast feedback, never the
// guarantee.
// ==========================================================================

import { runTransaction, docRef, getDocById, db, serverTimestamp } from "../firebase/firestore.js";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_PATTERN = /^[a-z][a-z0-9_]*$/;

// Names that would be confusing, impersonating, or that we may want for
// routes/system messages later. Cheap to reserve now, painful to reclaim.
const RESERVED = new Set([
  "econ", "admin", "administrator", "root", "system", "support", "help",
  "about", "settings", "profile", "me", "home", "chat", "chats", "discover",
  "search", "login", "logout", "signin", "signup", "register", "api",
  "official", "staff", "team", "moderator", "mod", "null", "undefined"
]);

export function normalizeUsername(raw = "") {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** Firestore substring-search terms for the app's 3–20 character usernames. */
export function usernameSearchTerms(raw = "") {
  const username = normalizeUsername(raw);
  const terms = new Set();
  for (let start = 0; start < username.length; start += 1) {
    for (let end = start + 1; end <= username.length; end += 1) {
      terms.add(username.slice(start, end));
    }
  }
  return [...terms];
}

/**
 * Returns { valid: true } or { valid: false, reason } with copy that is
 * safe to show directly to the user.
 */
export function validateUsername(raw = "") {
  const name = normalizeUsername(raw);

  if (!name) return { valid: false, reason: "Pick a username." };
  if (name.length < USERNAME_MIN) {
    return { valid: false, reason: `At least ${USERNAME_MIN} characters.` };
  }
  if (name.length > USERNAME_MAX) {
    return { valid: false, reason: `At most ${USERNAME_MAX} characters.` };
  }
  if (!USERNAME_PATTERN.test(name)) {
    return {
      valid: false,
      reason: "Use letters, numbers and underscores. Must start with a letter."
    };
  }
  if (RESERVED.has(name)) return { valid: false, reason: "That username is reserved." };

  return { valid: true, username: name };
}

/**
 * Fast, non-authoritative availability check for live UI feedback.
 * A `true` here can still lose a race — claimUsername() is the real answer.
 */
export async function isUsernameAvailable(raw) {
  const { valid, username } = validateUsername(raw);
  if (!valid) return false;
  const existing = await getDocById("usernames", username);
  return !existing;
}

/**
 * Atomically claim `raw` for `uid`, writing both the reservation doc and
 * the user's profile in one transaction so the two can never disagree.
 *
 * Throws an Error with .code:
 *   USERNAME_INVALID | USERNAME_TAKEN | USERNAME_ALREADY_SET
 */
export async function claimUsername(uid, raw) {
  const { valid, username, reason } = validateUsername(raw);
  if (!valid) {
    const err = new Error(reason);
    err.code = "USERNAME_INVALID";
    throw err;
  }

  await runTransaction(db, async (tx) => {
    const reservationRef = docRef("usernames", username);
    const userRef = docRef("users", uid);

    const [reservation, userSnap] = await Promise.all([
      tx.get(reservationRef),
      tx.get(userRef)
    ]);

    if (reservation.exists()) {
      // Idempotent: re-claiming your own username is a no-op, not an error.
      if (reservation.data().uid === uid) return;
      const err = new Error("That username is already taken.");
      err.code = "USERNAME_TAKEN";
      throw err;
    }

    // Changing an existing username would orphan the old reservation and
    // break links people have already shared, so it's a separate,
    // deliberate operation — not something the onboarding screen can do.
    if (userSnap.exists() && userSnap.data().username) {
      const err = new Error("This account already has a username.");
      err.code = "USERNAME_ALREADY_SET";
      throw err;
    }

    tx.set(reservationRef, { uid, username, claimedAt: serverTimestamp() });
    tx.set(userRef, { username, usernameSetAt: serverTimestamp() }, { merge: true });
  });

  return username;
}

/** Resolve an @username to its owning profile, or null. */
export async function findUserByUsername(raw) {
  const username = normalizeUsername(raw);
  if (!username) return null;

  const reservation = await getDocById("usernames", username);
  if (!reservation?.uid) return null;

  return getDocById("users", reservation.uid);
}
