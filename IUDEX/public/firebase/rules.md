# e-CON — Security Rules

e-CON is a **public, username-based messenger**. Anyone may create an account,
so there is no longer an email whitelist anywhere — not in `auth.js`, not in
`config.js`, and not here. Access is scoped entirely by `request.auth.uid`.

Deploy with the Firebase CLI:

```
firebase deploy --only firestore:rules,firestore:indexes
```

The authoritative copy lives in `firestore.rules` at the project root. This
file explains *why* it's shaped the way it is.

---

## The model in one line

Public profile projections and username reservations are readable by any
signed-in user for Discover search. Full profiles are read by signed-in users
for profile screens; everything else is readable only by conversation
participants.

## Collections

### `publicProfiles/{uid}`

Discover queries this projection instead of `users/{uid}`. It contains only
`username`, `name`, `photoURL`, and derived `searchTerms`; writes are limited
to the profile owner and the allowed field names are enforced by the rules.
`searchTerms` contains all normalized username substrings so Firestore can
match partial keywords without reading the user collection.

### `users/{uid}`

| Operation | Who |
|---|---|
| read | any signed-in user |
| create / update | only `uid` itself |
| delete | nobody |

Profile reads are available to signed-in users. Discover avoids reading this
collection and uses the smaller `publicProfiles` projection instead.

The update rule additionally pins `username`: once set, a direct profile write
cannot change it. Handles are only ever assigned by the transaction below, and
without this pin a user could write any handle straight onto their own profile
without ever touching the reservation doc.

### `usernames/{username}`

The document **id is the username**. Firestore document ids are unique by
definition, so this collection *is* the uniqueness constraint — the
availability check in the UI is only fast feedback and can lose a race.

Create-only, and the payload must point at the caller's own uid. No updates and
no deletes, so a handle cannot be stolen or silently reassigned. (The trade-off
is that usernames are permanent; changing one would need a deliberate migration
that moves the reservation and rewrites `participantInfo` on existing threads.)

### `conversations/{convId}`

`convId` is the two participant uids, sorted and joined with `_`. That makes
"open a chat with this person" a pure computation rather than a lookup-and-
create, so two devices can't race into two separate threads for the same pair.

`get` is split from `list` for one specific reason: the first thing
`openConversationWith()` does is read a conversation that usually **doesn't
exist yet**. With no document there is no `resource`, so a participants check
would throw and deny. For that case the id itself is the proof of membership.

`update` pins `participants`. Without it, a participant could add a third uid
to an existing thread and retroactively hand a stranger the whole history.

### `conversations/{convId}/messages/{messageId}`

Membership is resolved via `get()` on the parent conversation, guarded by
`exists()` first — `get()` on a missing document returns null, and reading
`.data` off null throws instead of denying cleanly.

Anyone in the thread may **update** a message, because that's how reactions
work — but `senderId` and `text` are immutable, so you cannot rewrite what
the other person said. **Delete** is restricted to the author.

> Each message read costs one extra document read for the parent lookup.
> Firestore caches that `get()` within a single rule evaluation, so it's one
> lookup per request, not per message.

### Everything else

Denied. Any collection not listed above has no `allow` rule, and Firestore
denies by default.

## Required index

The chat list queries `participants array-contains <uid>` ordered by
`updatedAt desc`, which needs the composite index in
`firestore.indexes.json`. Without it the query fails with
`failed-precondition` — the Chats screen detects that specific code and says
so rather than showing an empty list.

## Auth providers

Enable both in **Firebase Console → Authentication → Sign-in method**:

- **Email/Password**
- **Google**

Also add your deploy domain under **Authentication → Settings → Authorized
domains**, or Google sign-in fails with `auth/unauthorized-domain`.

## What is *not* enforced here

- **Blocking / reporting.** There's no block list yet, so anyone can open a
  conversation with anyone. Adding it means a `blocks/{uid}/blocked/{peerUid}`
  collection plus a check in the conversation `create` rule.
- **Rate limiting.** Firestore rules can't express "N writes per minute".
  A spam-resistant build needs App Check or a Cloud Function.
- **Message content.** No validation on length or shape beyond the immutability
  pins above.
