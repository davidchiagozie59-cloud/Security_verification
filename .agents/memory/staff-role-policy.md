---
name: Staff role boundaries
description: The enrollment portal's least-privilege responsibilities for admin, sub-admin, and moderator accounts.
---

Admin can review applications, manage users and roles, change portal settings, and manage support. Sub-admin can review all enrollment details and manage support, but cannot manage accounts or portal settings. Moderator access is limited to support conversations.

**Why:** The user explicitly requires sub-admins to review all enrollment details and staff to handle support, but does not grant moderators broader enrollment or account powers. Keep access least-privileged.

**How to apply:** Enforce these boundaries in API authorization as well as navigation. Treat frontend visibility as presentation only; add server checks whenever adding a staff endpoint.
