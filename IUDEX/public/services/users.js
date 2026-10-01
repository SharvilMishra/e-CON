// ==========================================================================
// e-CON — User Directory Service
// Discovery and search over the public `users` collection.
// ==========================================================================

import {
  getDocById, setDocById, subscribeDoc, serverTimestamp
} from "../firebase/firestore.js";
import { auth } from "../firebase/config.js";

export async function getUserById(uid) {
  return getDocById("users", uid);
}

/** Keep the deliberately minimal, signed-in-readable Discover profile current. */
export async function syncPublicProfile(profile) {
  if (!profile?.uid) return;
  await setDocById("publicProfiles", profile.uid, {
    username: profile.username || "",
    name: profile.name || "",
    photoURL: profile.photoURL || ""
  }, false);
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
