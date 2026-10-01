// e-CON — Discover
// Search username substrings without loading a user directory.
import { h, escapeHTML } from "../../js/utils.js";
import { avatarHTML } from "../../components/avatar.js";
import { navigate } from "../../js/router.js";
import { reportError } from "../../js/ui.js";
import { normalizeUsername } from "../../services/usernames.js";
import { searchPublicProfilesByUsername } from "../../services/users.js";

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
      <div id="discover-results" aria-live="polite"></div>
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
      resultsEl.replaceChildren();
      return;
    }
    resultsEl.innerHTML = `<div class="empty-state"><p>Searching...</p></div>`;
    try {
      const users = await searchPublicProfilesByUsername(username);
      if (!active || token !== searchToken) return;
      resultsEl.innerHTML = users.length
        ? `<div class="eyebrow" style="margin:22px 0 12px;">Search: ${escapeHTML(username)}</div>${users.map(userRowHTML).join("")}`
        : `<div class="empty-state"><p>No users found for "${escapeHTML(username)}"</p></div>`;
    } catch (error) {
      if (!active || token !== searchToken) return;
      reportError(error, "searching usernames");
      resultsEl.innerHTML = `<div class="empty-state"><p>Unable to search right now. Please try again.</p></div>`;
    }
  });

  input.addEventListener("input", () => {
    searchToken += 1;
    resultsEl.replaceChildren();
  });

  return function teardown() {
    active = false;
    searchToken += 1;
  };
}
