// ==========================================================================
// IUDEX — Music Player (shell singleton)
// Unlike every other feature module, this is NOT owned by a page. It's
// initialized once when the app shell mounts and lives for the entire
// session, so switching to Chat/Games/etc. — or locking the screen — never
// tears down the YT player or the Firestore room/queue listeners.
// Both the full Music page and the persistent mini-player subscribe to the
// state this module broadcasts; neither one talks to Firestore or YT
// directly anymore.
// ==========================================================================
import { showToast } from "../components/toast.js";
import {
  subscribeRoom, ensureRoom, updateRoom, expectedPosition,
  subscribeQueue, addToQueue, removeFromQueue, getMyRole
} from "./musicSync.js";

let initialized = false;
let player = null;
let playerReady = false;
let lastLoadedVideoId; // undefined = never applied yet

let room = null;
let queue = [];
let liveDuration = 0;

const listeners = new Set();
let progressTimer = null;

function broadcast() {
  const snapshot = {
    room,
    queue,
    playerReady,
    position: playerReady && player?.getCurrentTime ? player.getCurrentTime() : expectedPosition(room),
    duration: liveDuration
  };
  listeners.forEach((fn) => {
    try { fn(snapshot); } catch (e) { console.warn("[musicPlayer] listener error:", e); }
  });
}

/** Subscribe to player state. Fires immediately with the current snapshot. */
export function subscribeMusicState(fn) {
  listeners.add(fn);
  fn({
    room,
    queue,
    playerReady,
    position: playerReady && player?.getCurrentTime ? player.getCurrentTime() : expectedPosition(room),
    duration: liveDuration
  });
  return () => listeners.delete(fn);
}

// ---- YouTube IFrame API loader ----
let ytApiPromise = null;
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      resolve(window.YT);
    };
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

function thumbnailFor(videoId) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// ---- Media Session — lock screen / notification controls ----
function updateMediaSession() {
  if (!("mediaSession" in navigator)) return;
  if (!room?.videoId) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
    return;
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: room.title || "YouTube video",
    artist: room.author || "e-CON",
    album: "e-CON",
    artwork: [
      { src: room.thumbnail || thumbnailFor(room.videoId), sizes: "480x360", type: "image/jpeg" }
    ]
  });
  navigator.mediaSession.playbackState = room.isPlaying ? "playing" : "paused";
}

function wireMediaSessionActions() {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.setActionHandler("play", () => togglePlayPause());
  navigator.mediaSession.setActionHandler("pause", () => togglePlayPause());
  navigator.mediaSession.setActionHandler("nexttrack", () => skip());
  try {
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) commitSeek(details.seekTime);
    });
  } catch { /* not supported everywhere — safe to skip */ }
}

// ---- Apply remote room state onto the local YT player ----
function applyRoomState() {
  updateMediaSession();
  broadcast();
  if (!playerReady) return;

  if (room?.videoId !== lastLoadedVideoId) {
    lastLoadedVideoId = room?.videoId ?? null;
    if (room?.videoId) {
      if (room.isPlaying) {
        player.loadVideoById({ videoId: room.videoId, startSeconds: expectedPosition(room) });
      } else {
        // cueVideoById never autoplays — avoids an audible flash when
        // joining/reloading into a room that's already paused.
        player.cueVideoById({ videoId: room.videoId, startSeconds: expectedPosition(room) });
      }
    } else {
      player.stopVideo();
    }
    return;
  }

  if (!room?.videoId) return;

  const target = expectedPosition(room);
  const current = player.getCurrentTime ? player.getCurrentTime() : 0;
  if (Math.abs(current - target) > 1.5) {
    player.seekTo(target, true);
  }
  if (room.isPlaying) player.playVideo();
  else player.pauseVideo();
}

function startProgressTimer() {
  stopProgressTimer();
  progressTimer = setInterval(() => {
    if (!playerReady) return;
    liveDuration = player.getDuration ? player.getDuration() : 0;
    broadcast();
  }, 500);
}
function stopProgressTimer() {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = null;
}

// ---- Public actions (used by both the mini-player and the full page) ----
export async function togglePlayPause() {
  if (!room?.videoId) return;
  const nextIsPlaying = !room.isPlaying;
  const pos = playerReady && player?.getCurrentTime ? player.getCurrentTime() : expectedPosition(room);
  try {
    await updateRoom({ isPlaying: nextIsPlaying, position: pos });
  } catch (err) {
    showToast("Couldn't update playback.", "error");
  }
}

export async function commitSeek(newPos) {
  try {
    await updateRoom({ position: newPos, isPlaying: room?.isPlaying ?? false });
    if (playerReady) player.seekTo(newPos, true);
  } catch (err) {
    showToast("Couldn't seek.", "error");
  }
}

export async function playFromQueue(item) {
  try {
    await updateRoom({
      videoId: item.videoId,
      title: item.title || "YouTube video",
      author: item.author || "",
      thumbnail: item.thumbnail || thumbnailFor(item.videoId),
      position: 0,
      isPlaying: true
    });
    await removeFromQueue(item.id);
  } catch (err) {
    showToast("Couldn't play that song.", "error");
  }
}

export async function skip() {
  const next = queue[0];
  if (next) {
    await playFromQueue(next);
  } else {
    try {
      await updateRoom({ videoId: null, title: "", author: "", thumbnail: "", position: 0, isPlaying: false });
    } catch { /* room may already be empty — fine */ }
  }
}

export { addToQueue, removeFromQueue, getMyRole };

export function getPlayerCurrentTime() {
  return playerReady && player?.getCurrentTime ? player.getCurrentTime() : expectedPosition(room);
}

/** Called once from app.js when the shell mounts. Safe to call more than once. */
export function initMusicPlayer(targetElId) {
  if (initialized) return;
  initialized = true;

  ensureRoom().catch(() => { /* non-fatal — room will be created on first song add */ });

  subscribeRoom((doc) => {
    room = doc;
    applyRoomState();
  });

  subscribeQueue((docs) => {
    queue = docs;
    broadcast();
  });

  loadYouTubeAPI()
    .then((YT) => {
      player = new YT.Player(targetElId, {
        height: "1",
        width: "1",
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: () => {
            playerReady = true;
            startProgressTimer();
            wireMediaSessionActions();
            if (room) applyRoomState();
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.ENDED && getMyRole() === "P1") {
              skip();
            }
            updateMediaSession();
          },
          onError: () => {
            showToast("That video can't be played — it may be private or removed.", "error");
          }
        }
      });
    })
    .catch(() => {
      showToast("Couldn't load YouTube. Check your connection.", "error");
    });
}
