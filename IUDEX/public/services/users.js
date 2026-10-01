// ==========================================================================
// e-CON — User Profile Service
// Profile updates, public Discover search, and presence.
// ==========================================================================

import {
  getAll, getDocById, setDocById, subscribeDoc, serverTimestamp,
  where, orderBy, limit
} from "../firebase/firestore.js";
import { auth } from "../firebase/config.js";
import { normalizeUsername, usernameSearchTerms } from "./usernames.js";

const DISCOVER_RESULT_LIMIT = 30;

export async function getUserById(uid) {
  return getDocById("users", uid);
}

/** Keep the deliberately minimal, signed-in-readable Discover profile current. */
export async function syncPublicProfile(profile) {
  if (!profile?.uid) return false;
  try {
    await setDocById("publicProfiles", profile.uid, {
      username: profile.username || "",
      name: profile.name || "",
      photoURL: profile.photoURL || "",
      searchTerms: usernameSearchTerms(profile.username || "")
    }, false);
    return true;
  } catch (error) {
    // Keep authentication and profile editing usable if Firestore rules have
    // not yet been deployed; Discover will report its own query errors.
    console.warn("[e-CON] public Discover profile sync deferred:", error?.code || error);
    return false;
  }
}

/** Query only public profiles whose indexed username contains the keyword. */
export async function searchPublicProfilesByUsername(raw) {
  const username = normalizeUsername(raw);
  if (!username) return [];

  const matches = await getAll("publicProfiles", [
    where("searchTerms", "array-contains", username),
    orderBy("username", "asc"),
    limit(DISCOVER_RESULT_LIMIT)
  ]);
  return matches
    .filter((profile) => profile.id !== auth.currentUser?.uid)
    .map(({ username: handle, name, photoURL }) => ({
      username: handle,
      name: name || handle,
      photoURL: photoURL || ""
    }));
}

export function subscribeUser(uid, cb) {
  return subscribeDoc("users", uid, cb);
}

/** Update the signed-in user's own editable profile fields. */
export async function updateMyProfile({ name, bio, photoURL }) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in.");

  const patch = { updatedAt: serverTimestamp() };
  if (name !== undefined) patch.name = name.trim().slice(0, 50);
  if (bio !== undefined) patch.bio = bio.trim().slice(0, 160);
  if (photoURL !== undefined) patch.photoURL = photoURL.trim();

  await setDocById("users", uid, patch, true);
  const profile = await getDocById("users", uid);
  await syncPublicProfile(profile);
  return profile;
}

/**
 * A private account doesn't stop appearing in Discover or search — hiding
 * someone by search is a different feature (findability) than this one
 * (who can start a conversation with you). It only changes what happens
 * when a new person messages them for the first time: see
 * services/conversations.js for the request/accept/decline flow this gates.
 */
export async function setPrivateAccount(isPrivate) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in.");
  await setDocById("users", uid, { private: !!isPrivate }, true);
}

export function isPrivateAccount(user) {
  return !!user?.private;
}

/**
 * Presence is a claim with an expiry, not a fact: Firestore has no reliable
 * disconnect signal (mobile OSes just kill the tab), so a heartbeat that
 * stopped 5 minutes ago is treated as offline here regardless of what the
 * last write claimed.
 */
const STALE_MS = 90000;

export function isOnline(user) {
  const at = user?.presence?.updatedAt;
  const ms = at?.toMillis ? at.toMillis() : null;
  return !!user?.presence?.online && !!ms && Date.now() - ms < STALE_MS;
}
