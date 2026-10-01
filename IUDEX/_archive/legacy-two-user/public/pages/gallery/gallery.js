// ==========================================================================
// IUDEX — Shared Gallery (GAL-001..008)
// Images are added by pasting a URL rather than uploading a file, so the
// project can run entirely on Firebase's free Spark plan (no Storage).
// ==========================================================================
import { h, escapeHTML, timeAgo, debounce } from "../../js/utils.js";
import { skeleton } from "../../components/loader.js";
import { openModal, confirmDialog } from "../../components/modal.js";
import { showToast } from "../../components/toast.js";
import { reportError } from "../../js/ui.js";
import {
  subscribe, updateDocById, deleteDocById, createDoc, orderBy
} from "../../firebase/firestore.js";
import { auth } from "../../firebase/config.js";

const REACTION_EMOJIS = ["❤️", "😍", "😂", "🔥", "😮"];
let allPhotos = [];

function isLikelyImageUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function render(container) {
  container.appendChild(
    h(`
      <div class="page">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h1>Gallery</h1>
          <button class="btn btn--primary btn--icon" id="add-photo-btn" aria-label="Add photo">+</button>
        </div>
        <div class="field" style="margin-bottom:20px;">
          <input id="gallery-search" type="text" placeholder="Search photos or albums…">
        </div>
        <div id="gallery-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          ${skeleton("height:150px;")}${skeleton("height:150px;")}${skeleton("height:150px;")}${skeleton("height:150px;")}
        </div>
      </div>
    `)
  );

  const gridEl = document.getElementById("gallery-grid");

  function renderGrid(photos) {
    if (!photos.length) {
      gridEl.style.display = "block";
      gridEl.innerHTML = `
        <div class="empty-state">
          <div style="font-size:32px;">📷</div>
          <p>No photos yet. Tap + and paste a link to your first one.</p>
        </div>`;
      return;
    }
    gridEl.style.display = "grid";
    gridEl.innerHTML = photos
      .map(
        (p, i) => `
        <button class="card--interactive stagger-item" style="--stagger-index:${i}; padding:0; border-radius:16px; overflow:hidden; border:1px solid var(--border); position:relative; aspect-ratio:1;" data-id="${p.id}">
          <img src="${p.url}" alt="${escapeHTML(p.title || "")}" style="width:100%; height:100%; object-fit:cover;" loading="lazy" onerror="this.style.opacity=0.25">
          ${p.album ? `<span class="eyebrow" style="position:absolute; bottom:6px; left:6px; background:rgba(0,0,0,0.55); padding:2px 8px; border-radius:999px; color:#fff;">${escapeHTML(p.album)}</span>` : ""}
        </button>`
      )
      .join("");

    gridEl.querySelectorAll("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const photo = photos.find((p) => p.id === btn.dataset.id);
        openViewer(photo);
      });
    });
  }

  // GAL-005/007: live gallery, newest first
  const unsubscribe = subscribe("gallery", [orderBy("timestamp", "desc")], (photos) => {
    allPhotos = photos;
    renderGrid(photos);
  });

  // GAL-007: search photos
  document.getElementById("gallery-search").addEventListener(
    "input",
    debounce((e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) return renderGrid(allPhotos);
      renderGrid(
        allPhotos.filter(
          (p) => p.title?.toLowerCase().includes(q) || p.album?.toLowerCase().includes(q)
        )
      );
    }, 200)
  );

  // GAL-001: add photo by URL (no Storage upload — see header note)
  document.getElementById("add-photo-btn").addEventListener("click", () => {
    const close = openModal({
      title: "Add a photo",
      bodyHTML: `
        <div style="display:flex; flex-direction:column; gap:16px;">
          <div class="field">
            <label for="photo-url">Image URL</label>
            <input id="photo-url" type="url" placeholder="https://…">
            <span class="text-muted" style="font-size:0.78rem;">Paste a link — e.g. from Google Photos "share" (set to public), Imgur, or any direct image link.</span>
          </div>
          <div class="field">
            <label for="photo-title">Title (optional)</label>
            <input id="photo-title" type="text" maxlength="80" placeholder="A day at the beach">
          </div>
          <div class="field">
            <label for="photo-album">Album (optional)</label>
            <input id="photo-album" type="text" maxlength="40" placeholder="Trips">
          </div>
        </div>
      `,
      actions: [
        { label: "Cancel", variant: "ghost" },
        {
          label: "Add",
          variant: "primary",
          closeOnClick: false,
          onClick: async () => {
            const urlInput = document.getElementById("photo-url");
            const url = urlInput.value.trim();
            if (!isLikelyImageUrl(url)) {
              showToast("That doesn't look like a valid image link", "error");
              urlInput.focus();
              return;
            }
            try {
              await createDoc("gallery", {
                title: document.getElementById("photo-title").value.trim() || null,
                url,
                uploadedBy: auth.currentUser?.uid || null,
                timestamp: new Date(),
                album: document.getElementById("photo-album").value.trim() || null,
                reactions: {},
                comments: []
              });
              showToast("Photo added", "success");
              close();
            } catch (err) {
              reportError(err, "adding photo");
            }
          }
        }
      ]
    });
    setTimeout(() => document.getElementById("photo-url")?.focus(), 50);
  });

  return unsubscribe;
}

// GAL-004: full-screen viewer, with comments/reactions/download/delete
function openViewer(photo) {
  const reactionButtons = REACTION_EMOJIS.map(
    (emoji) => `<button class="reaction-btn" data-emoji="${emoji}" style="font-size:20px; padding:6px 10px; border-radius:999px; background:rgba(255,255,255,0.05);">${emoji}</button>`
  ).join("");

  const commentsHTML = (photo.comments || [])
    .map((c) => `<div style="margin-bottom:8px;"><span class="text-secondary">${escapeHTML(c.text)}</span> <span class="eyebrow">${timeAgo(c.at)}</span></div>`)
    .join("") || `<p class="text-muted">No comments yet.</p>`;

  const close = openModal({
    title: photo.title || "Photo",
    bodyHTML: `
      <img src="${photo.url}" alt="" style="width:100%; border-radius:16px; margin-bottom:16px;">
      <div style="display:flex; gap:8px; margin-bottom:16px;">${reactionButtons}</div>
      <div style="margin-bottom:12px;">${commentsHTML}</div>
      <div class="field" style="flex-direction:row; gap:8px;">
        <input id="new-comment-input" type="text" placeholder="Add a comment…" style="flex:1;">
        <button class="btn btn--ghost" id="post-comment-btn">Post</button>
      </div>
    `,
    actions: [
      { label: "Open original", variant: "ghost", closeOnClick: false, onClick: () => window.open(photo.url, "_blank", "noopener") },
      { label: "Delete", variant: "danger", closeOnClick: false, onClick: () => handleDelete(photo) }
    ]
  });

  document.querySelectorAll(".reaction-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const uid = auth.currentUser.uid;
        const reactions = { ...(photo.reactions || {}), [uid]: btn.dataset.emoji };
        await updateDocById("gallery", photo.id, { reactions });
        showToast("Reaction added", "success");
      } catch (err) {
        reportError(err, "reacting to photo");
      }
    });
  });

  document.getElementById("post-comment-btn").addEventListener("click", async () => {
    const input = document.getElementById("new-comment-input");
    const text = input.value.trim();
    if (!text) return;
    try {
      const comments = [...(photo.comments || []), { text, uid: auth.currentUser.uid, at: new Date() }];
      await updateDocById("gallery", photo.id, { comments });
      input.value = "";
      showToast("Comment added", "success");
      close();
    } catch (err) {
      reportError(err, "posting comment");
    }
  });

  function handleDelete(p) {
    confirmDialog("This photo will be removed for both of you. (The original stays wherever you linked it from — this only removes it from e-CON.)", {
      onConfirm: async () => {
        try {
          await deleteDocById("gallery", p.id);
          showToast("Photo removed", "info");
        } catch (err) {
          reportError(err, "removing photo");
        }
      }
    });
  }
}
