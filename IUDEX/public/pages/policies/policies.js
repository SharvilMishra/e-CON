// ==========================================================================
// e-CON — Privacy & Policies
//
// This describes what the app's own code actually collects and does,
// factually — it is NOT reviewed legal text. The draft banner below is
// deliberate and should stay visible until a real privacy policy (ideally
// reviewed by someone qualified to write one) replaces this page.
// ==========================================================================
import { h, qs } from "../../js/utils.js";
import { back } from "../../js/router.js";

export async function render(container) {
  container.appendChild(h(`
    <div class="page">
      <div class="page-head">
        <button class="btn btn--icon" id="policies-back" aria-label="Back">‹</button>
        <h1 style="font-size:1.35rem;">Privacy & Policies</h1>
      </div>

      <div class="policy-draft-banner">
        <strong>Draft — not legal advice.</strong> This page describes what
        the app's code actually does, in plain language. It is not a
        reviewed privacy policy or terms of service, and shouldn't be
        relied on as one.
      </div>

      <div class="policy-body">
        <h3>What e-CON collects</h3>
        <p>When you create an account: your email address, and whichever
        sign-in method you used (email/password or Google). When you set up
        your profile: your chosen @username, display name, and anything you
        add to your bio or profile photo link. While you use the app: the
        messages you send, who you send them to, read receipts, typing
        status, and whether you're currently online.</p>

        <h3>How it's stored</h3>
        <p>Everything is stored in Firebase (Google Cloud infrastructure).
        Messages between two people live in that conversation only — access
        is restricted by the app's security rules to the two participants.</p>

        <h3>How it's used</h3>
        <p>Solely to run the messaging features themselves: showing your
        profile to people who search for it, delivering messages, showing
        read receipts and online status, and enforcing private-account
        approval where you've turned that on.</p>

        <h3>What isn't built yet</h3>
        <p>There's currently no way to export or permanently delete your
        account and its data from within the app. There's no blocking or
        reporting system yet either.</p>

        <h3>Questions</h3>
        <p>Reach out via the Contact page for anything not covered here.</p>
      </div>
    </div>
  `));

  qs("#policies-back").addEventListener("click", () => back());

  return function teardown() {};
}
