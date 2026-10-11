---
name: Draft persistence policy
description: The enrollment portal must not persist category-entry or incomplete wizard data before final submission.
---

Do not save category-entry forms, PINs, or incomplete enrollment wizard answers to the database, local storage, or session storage. Keep unfinished work in memory only; clear it on refresh and sign-out. Persist an application only after the applicant completes final submission.

**Why:** The user explicitly repeated that entry drafts must not be saved and authorized clearing all unfinished applications on the signed-in account.

**How to apply:** Keep draft editing paths client-memory-only, reject API writes to `draft` records, and remove legacy database draft rows only within the authenticated owner scope. Never delete submitted applications as part of draft cleanup.
