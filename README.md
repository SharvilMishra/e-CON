# e-CON

**A username-based real-time messaging web application.**

Sign up with email and password or with Google, claim a unique `@username`,
find anyone else by theirs, and start a private real-time conversation.
Installable as a PWA. No build step — plain HTML, CSS and ES modules on
Firebase.

```
Sign up / Google  →  Choose unique @username  →  Chats
                                                   ↓
                              Discover  →  Search @username  →  Profile
                                                   ↓
                                    Private real-time conversation
```

---

## What changed from the previous build

This repo used to be **SHIDEEP**, a private two-person app. It is now e-CON,
and the change is architectural, not cosmetic:

| Before | Now |
|---|---|
| Google sign-in only | **Email + password *and* Google** |
| Hard-coded `AUTHORIZED_EMAILS` whitelist | Open sign-up, no whitelist anywhere |
| Identity = your email | Identity = your unique `@username` |
| One permanent partner | Message anyone you can find |
| One global `messages` collection | `conversations/{id}/messages` per pair |
| Voice/video calling | Removed |
| 9-tab nav (gallery, games, music, mood…) | Chats · Discover · Profile · Settings |

The couple-only features (gallery, bucket list, memories, games, music sync,
mood, calling, presence badge) were all built on the assumption that exactly
two people could ever sign in — a global collection with no owner field only
works when there's nobody else in the database. Rather than delete that work,
it's parked in **`_archive/legacy-two-user/`**, which sits outside the
`public/` directory and so is never deployed.

**Nothing in `public/` references the old brand** except two deliberate
migration compatibility points, both commented as such:

- `js/storage.js` — migrates any leftover `shideep_*` localStorage key to its
  `econ_*` equivalent
- `service-worker.js` — its activate handler deletes old `shideep-shell-*`
  caches

### Firebase identifiers

The Firebase project is already named `iudex-34b6f` (project id, auth domain,
storage bucket, `.firebaserc`), so no console-side rename is required. Nothing
in `config.js` needed changing beyond removing the whitelist.

---

## Setup

1. **Firebase Console → Authentication → Sign-in method** — enable both
   **Email/Password** and **Google**.
2. **Authentication → Settings → Authorized domains** — add your deploy
   domain (and `localhost` for local testing), or Google sign-in fails with
   `auth/unauthorized-domain`.
3. **Firestore** — create the database in production mode.
4. Deploy the rules **and the index**:
   ```
   firebase deploy --only firestore:rules,firestore:indexes
   ```
   The index is not optional: the Chats list queries
   `participants array-contains <uid>` ordered by `updatedAt desc`, and
   without the composite index in `firestore.indexes.json` that query fails
   with `failed-precondition`.
5. Serve or deploy `public/`:
   ```
   firebase deploy --only hosting
   ```

`public/firebase/config.js` already holds this project's config. Replace it if
you point e-CON at a different Firebase project.

> Firebase web API keys are not secrets — they identify the project, they
> don't authorize anything. `firestore.rules` is what actually protects data.

---

## Data model

```
users/{uid}
  uid, username, name, email, photoURL, bio
  joinedAt, lastSeen, presence: { online, updatedAt }

usernames/{username}          ← document id IS the username
  uid, username, claimedAt

conversations/{convId}        ← convId = [uidA, uidB].sort().join("_")
  participants:    [uidA, uidB]
  participantInfo: { uid: { username, name, photoURL } }
  lastMessage:     { text, senderId, at }
  typing:          { uid: Timestamp }
  readAt:          { uid: Timestamp }
  updatedAt

conversations/{convId}/messages/{messageId}
  senderId, text, image, replyTo, reactions, timestamp
```

Two decisions worth knowing about:

**Username uniqueness is a document id, not a check.** Two people can pass the
same "is this available?" check in the same second. So `usernames/{username}`
exists purely so that Firestore's own guarantee — document ids are unique —
becomes the constraint. Claiming runs in a transaction that writes both the
reservation and the profile, and whoever loses the race gets a real error.

**Conversation ids are deterministic.** Both clients independently compute the
same id from the two uids, so opening the same chat from two devices can't
create two threads, and no lock or lookup is needed to start one.

`participantInfo` and `lastMessage` are denormalized onto the conversation so
the chat list renders in one query instead of N+1. They're a cache — profile
screens always read `users/{uid}` directly.

---

## Project structure

```
public/
  index.html            metadata, OG/Twitter tags, SW registration
  manifest.json         PWA manifest
  service-worker.js     offline shell + legacy cache cleanup
  css/                  global.css (tokens) · components.css · animations.css
  firebase/
    config.js           SDK handles — no whitelist
    auth.js             email+password, Google, onboarding state
    firestore.js        generic wrappers; paths support subcollections
    rules.md            why the security rules look the way they do
  services/
    usernames.js        validation, availability, transactional claim
    users.js            directory, prefix search, profile updates, presence
    conversations.js    threads, messages, typing, read state
  js/
    app.js              boot + auth-state routing
    authScreen.js       sign in / create account
    usernameScreen.js   claim your @username
    router.js           hash routing with one param
    presence.js         heartbeat
    storage.js          namespaced localStorage + legacy migration
    ui.js  utils.js  installPrompt.js
  components/
    navbar.js  avatar.js  card.js  modal.js  toast.js  loader.js
  pages/
    home/       Chats — live conversation list
    discover/   browse everyone, prefix-search @usernames
    profile/    #/u/<username> and #/me (inline editing)
    chat/       one conversation thread
    settings/   account, install, sign out

_archive/legacy-two-user/   not deployed — the old couple-app features
```

### Routes

| Hash | Screen |
|---|---|
| `#/chats` | conversation list (default) |
| `#/discover` | user directory + `@username` search |
| `#/u/<username>` | someone's profile |
| `#/me` | your own profile |
| `#/chat/<convId>` | a conversation |
| `#/settings` | account & app |

---

## Notes

**Search is a prefix match, server-side.** Firestore has no `LIKE` operator,
so `searchUsersByUsername` uses a range query (`startAt(q)` → `endAt(q\uf8ff)`).
Usernames are stored lowercased because that range is byte-ordered — mixed
case would silently miss matches. Searching for `har` finds `harsh`, but not
`mahar`; substring search would need Algolia or an equivalent.

**Presence is a claim with an expiry.** Firestore has no reliable disconnect
signal — mobile browsers kill tabs without firing anything — so a heartbeat
older than 90 seconds is read as offline no matter what it last claimed.

**Images are links, not uploads.** Firebase Storage isn't enabled on this
project (it needs the Blaze plan), so photos in chat and profile pictures are
pasted URLs. Wiring uploads back in would be a contained change.

**Typing indicators write on the leading edge.** One write when you start
typing, one when you stop — writing per keystroke would cost a document write
per character.

## Worth testing once it's live

- **Both providers, same email.** Sign up with email/password, then try Google
  with the same address — Firebase raises
  `auth/account-exists-with-different-credential`, which the sign-in screen
  reports in plain language.
- **Username races.** Two browsers claiming the same handle at once: one
  should succeed, the other should get "someone just took that one."
- **Deploy the index before opening Chats**, or the list shows the
  `failed-precondition` hint instead of your conversations.
- **Direct link to a conversation you're not in** (`#/chat/<someone-elses-id>`)
  — should show "Conversation unavailable", not an empty thread.

## Not built yet

Blocking and reporting, message pagination beyond the most recent 200,
push notifications, group conversations, and username changes.
