// e-CON — Discover
// Search for a specific @username.
import { h, escapeHTML } from "../../js/utils.js";
import { avatarHTML } from "../../components/avatar.js";
import { navigate } from "../../js/router.js";
import { reportError } from "../../js/ui.js";
import { findPublicUserByUsername, normalizeUsername } from "../../services/usernames.js";

function userRowHTML(user) {
  return `
    <button class="user-row" data-username="${escapeHTML(user.username)}">
      ${avatarHTML(user, 46)}
      <span class="user-row-body">
        <span class="user-row-name">${escapeHTML(user.name || user.username)}</span>
        <span class="user-row-handle">@${escapeHTML(user.username)}</span>
      </span>
      <span class="user-row-chevron" aria-hidden="true">›</span>
    </button>`;
}

export async function render(container) {
  container.appendChild(h(`
    <div class="page">
      <div class="page-head"><h1>Discover</h1></div>
      <form class="field search-field" id="discover-form">
        <div class="input-affix input-affix--lead">
          <span class="input-affix-lead" aria-hidden="true">@</span>
          <input id="discover-search" type="search" placeholder="Search by username"
                 autocapitalize="none" autocorrect="off" spellcheck="false"
                 aria-label="Search by username">
        </div>
        <button class="btn btn--primary" type="submit">Search</button>
      </form>
      <div id="discover-results" aria-live="polite">
        <div class="empty-state"><p>Search for a username to find someone.</p></div>
      </div>
    </div>
  `));

  const input = document.getElementById("discover-search");
  const form = document.getElementById("discover-form");
  const resultsEl = document.getElementById("discover-results");
  let searchToken = 0;
  let active = true;

  resultsEl.addEventListener("click", (event) => {
    const row = event.target.closest(".user-row");
    if (row) navigate("u", row.dataset.username);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = normalizeUsername(input.value);
    const token = ++searchToken;
    if (!username) {
      resultsEl.innerHTML = `<div class="empty-state"><p>Search for a username to find someone.</p></div>`;
      return;
    }
    resultsEl.innerHTML = `<div class="empty-state"><p>Searching for @${escapeHTML(username)}…</p></div>`;
    try {
      const user = await findPublicUserByUsername(username);
      if (!active || token !== searchToken) return;
      resultsEl.innerHTML = user?.username
        ? userRowHTML(user)
        : `<div class="empty-state"><p>No user found for @${escapeHTML(username)}</p></div>`;
    } catch (error) {
      if (!active || token !== searchToken) return;
      reportError(error, "searching usernames");
      resultsEl.innerHTML = `<div class="empty-state"><p>Search failed. Try again in a moment.</p></div>`;
    }
  });

  input.addEventListener("input", () => {
    searchToken += 1;
    if (!input.value) {
      resultsEl.innerHTML = `<div class="empty-state"><p>Search for a username to find someone.</p></div>`;
    } else {
      resultsEl.replaceChildren();
    }
  });

  return function teardown() {
    active = false;
    searchToken += 1;
  };
}
