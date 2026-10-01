// ==========================================================================
// e-CON — Support
// A simple "how to reach us" page. The contact address below is a
// placeholder — replace it with a real support inbox before relying on
// this page.
// ==========================================================================
import { h, qs } from "../../js/utils.js";
import { back } from "../../js/router.js";

const SUPPORT_EMAIL = "support@example.com"; // TODO: replace with a real address

export async function render(container) {
  container.appendChild(h(`
    <div class="page">
      <div class="page-head">
        <button class="btn btn--icon" id="support-back" aria-label="Back">‹</button>
        <h1 style="font-size:1.35rem;">Support</h1>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <p class="text-muted" style="margin-bottom:14px;">
          Having a problem with e-CON — something not loading, a message that
          won't send, a bug you've hit? Check the Help section first for
          common questions, and reach out below if that doesn't cover it.
        </p>
        <a class="btn btn--primary" style="width:100%; text-align:center;"
           href="mailto:${SUPPORT_EMAIL}?subject=e-CON%20support">Email support</a>
      </div>
      <p class="field-hint">Response times aren't guaranteed — this is a small, independently run app.</p>
    </div>
  `));

  qs("#support-back").addEventListener("click", () => back());

  return function teardown() {};
}
