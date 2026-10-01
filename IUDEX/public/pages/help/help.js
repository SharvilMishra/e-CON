// ==========================================================================
// e-CON — Help
// A short FAQ describing how the app's actual features work.
// ==========================================================================
import { h, qs } from "../../js/utils.js";
import { back } from "../../js/router.js";

const FAQ = [
  {
    q: "How do I message someone?",
    a: "Go to Discover, search their @username, open their profile, and tap Message."
  },
  {
    q: "What does a private account do?",
    a: "If someone you message has a private account, your first message becomes a request instead of an open chat. They'll see it under Chats and can Accept or Decline it. Once accepted, it's a normal conversation from then on."
  },
  {
    q: "How do I make my own account private?",
    a: "Settings → Privacy → toggle Private account. This changes what happens when someone new messages you: their first message becomes a request for your approval."
  },
  {
    q: "Can I change my @username?",
    a: "Not yet — usernames are permanent once claimed. This may change in a future update."
  },
  {
    q: "How do I install e-CON on my phone?",
    a: "Settings → Get App → Install app. If that option isn't there, your browser may not support installing, or you may already have it installed."
  },
  {
    q: "What happens if I decline a message request?",
    a: "The sender is told the request was declined. The conversation isn't deleted — you can still read it if you open it again, but it won't become an active chat unless you change your mind by accepting it."
  }
];

export async function render(container) {
  container.appendChild(h(`
    <div class="page">
      <div class="page-head">
        <button class="btn btn--icon" id="help-back" aria-label="Back">‹</button>
        <h1 style="font-size:1.35rem;">Help</h1>
      </div>
      <div class="faq-list">
        ${FAQ.map((item) => `
          <details class="faq-item">
            <summary>${item.q}</summary>
            <p>${item.a}</p>
          </details>`).join("")}
      </div>
    </div>
  `));

  qs("#help-back").addEventListener("click", () => back());

  return function teardown() {};
}
