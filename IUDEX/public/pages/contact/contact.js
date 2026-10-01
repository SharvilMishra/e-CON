// ==========================================================================
// e-CON — Contact
// General contact info. The address below is a placeholder — replace it
// with a real one before relying on this page.
// ==========================================================================
import { h, qs } from "../../js/utils.js";
import { back } from "../../js/router.js";

const CONTACT_EMAIL = "hello@example.com"; // TODO: replace with a real address

export async function render(container) {
  container.appendChild(h(`
    <div class="page">
      <div class="page-head">
        <button class="btn btn--icon" id="contact-back" aria-label="Back">‹</button>
        <h1 style="font-size:1.35rem;">Contact</h1>
      </div>
      <div class="card">
        <p class="text-muted" style="margin-bottom:14px;">
          Questions, feedback, or anything else not covered by Support —
          get in touch directly.
        </p>
        <a class="btn btn--primary" style="width:100%; text-align:center;"
           href="mailto:${CONTACT_EMAIL}">Send an email</a>
      </div>
    </div>
  `));

  qs("#contact-back").addEventListener("click", () => back());

  return function teardown() {};
}
