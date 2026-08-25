# API Reference

Base URL: `/api` — all request/response bodies are JSON.
Errors use one envelope everywhere: `{ "error": "<safe message>" }` with appropriate HTTP status (400 validation, 401 auth, 403 permission, 404 not-found/blind, 409 conflict, 413 payload too large, 429 rate-limited, 500 generic).

Authentication: `Authorization: Bearer <JWT>` (15-minute expiry) or the httpOnly `token` cookie set at login.

---

## Health
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /health | public | `{ status, timestamp, message }` |

## Auth (`/auth`)
| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | /register | public | username, password (≥6), displayName, avatarUrl? | 409 if username taken; returns `{ token, user }`; sets httpOnly cookie |
| POST | /login | public | username, password | Generic `Invalid credentials` on failure; brute-force lockout (429) after repeated failures per IP; returns `{ token, user }` + cookie |
| POST | /logout | public | – | Clears the token cookie (stateless JWT itself remains valid until expiry) |
| GET | /me | any valid token | – | Current user snapshot |

## Users (`/users`)
| Method | Path | Auth | Body/Notes |
|---|---|---|---|
| GET | /me | Bearer/cookie | Own profile (never includes password) |
| PUT | /me | Bearer/cookie | Allowed fields only: displayName, avatarUrl, onlineStatus |
| PUT | /me/password | Bearer/cookie | currentPassword, newPassword (min 6); wrong current password → 401 |

## Groups (`/groups`)
| Method | Path | Auth | Roles / notes |
|---|---|---|---|
| POST | / | Bearer | Create; creator becomes owner |
| GET | / | Bearer | Own groups with role info |
| GET | /:id | member | Blind 404 otherwise |
| PUT | /:id | owner/admin | name/description/avatarUrl (ownerId not assignable) |
| DELETE | /:id | owner | Cascades tasks/messages/memberships; evicts realtime rooms |
| GET | /:id/members | member | Members + roles |
| POST | /:id/members | owner/admin | userId, role(member/admin) |
| DELETE | /:id/members/:userId | owner/admin | Cannot remove owner; admin cannot remove admin; evicts sockets |
| PUT | /:id/members/:userId | owner | Change role (admin/member) |

## Tasks (`/groups/:groupId/tasks`, `/tasks`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | /groups/:groupId/tasks | member | title ≤200 req.; optional description ≤5000, assigneeId (must be member), priority(low/medium/high/urgent), startDate, dueDate |
| GET | /groups/:groupId/tasks | member | Filters: status, priority, assigneeId, creatorId, search, date range; sort; pagination page/limit(≤100) |
| GET | /tasks | Bearer | Cross-group "my tasks" (same filters) |
| GET | /tasks/:id | member | Includes checklist |
| PUT | /tasks/:id | owner/admin/creator/assignee | Partial update; dates validated |
| DELETE | /tasks/:id | owner/admin/creator | Admin cannot delete owner-created tasks |
| PUT | /tasks/:id/assign | owner/admin | assigneeId must be group member |
| PUT | /tasks/:id/status | owner/admin/creator/assignee | todo/in_progress/completed/overdue; sets completedAt on completion |

## Checklist (`/tasks/:taskId/checklist`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | / | member | Ordered by `order` asc, completer info included |
| POST | / | member | title ≤500 req.; optional integer order (appends if omitted) |
| PUT | /:itemId | member | title/order |
| PUT | /:itemId/toggle | member | { isCompleted: boolean }; sets/clears completedBy+completedAt |
| DELETE | /:itemId | member | Removes item |

## Chat & comments (`Messages`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /groups/:groupId/messages?limit&before&page | member | Newest-first, cursor (`before`) or page pagination; limit ≤100 |
| POST | /groups/:groupId/messages | member | content ≤5000; broadcasts `message:new`; triggers NEW_MESSAGE/MENTION notifications |
| GET | /tasks/:taskId/comments?limit&before&page | member | Oldest-first; messageType=comment |
| POST | /tasks/:taskId/comments | member | content ≤5000; broadcasts `comment:new`; triggers notifications incl. MENTION for @username group members |
| PUT | /messages/:id | sender only | Edit content |
| DELETE | /messages/:id | sender or group owner/admin | Hard delete |

## Notifications (`/notifications`)
All recipient-scoped: users only ever see their own rows.
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /?page&limit(≤100)&isRead&type&before | Bearer | `{ items, pagination:{total,page,limit,totalPages,hasMore} }` newest first |
| GET | /unread-count | Bearer | `{ unreadCount }` |
| PUT | /:id/read | recipient | Sets isRead+readAt |
| PUT | /read-all | Bearer | Marks all own as read; returns updatedCount |
| DELETE | /:id | recipient | Hard delete |
| GET | /preferences | Bearer | taskAssigned/taskCompleted/newMessage/deadlineApproaching/mention booleans (default all true) |
| PUT | /preferences | Bearer | Partial merge; unknown keys/non-boolean values → 400 |

Types: TASK_ASSIGNED · TASK_COMPLETED · NEW_MESSAGE · DEADLINE_APPROACHING · MENTION

---

## Socket.IO contract

Endpoint: same origin as API (path `/socket.io`). Handshake auth: `auth.token = <JWT>` (httpOnly cookie fallback). Auth-classified handshake failures return `connect_error` with reasons mirroring REST (`Authentication required`, `Invalid token`, `Token expired`, `User not found`) and the client stops retrying.

### Client → Server (all require a connected authenticated socket)
| Event | Payload | Ack | Authorization |
|---|---|---|---|
| `group:join` | `{ groupId:int }` | `{ok:true}` or `{ok:false,error}` | GroupMember row required (DB check); rate-limited |
| `group:leave` | `{ groupId:int }` | `{ok:true}` | safe |
| `task:join` | `{ taskId:int }` | ack | Task exists + group membership |
| `task:leave` | `{ taskId:int }` | `{ok:true}` | safe |
| `foundation:whoami` | – | `{ userId, username, rooms[] }` | self-scoped diagnostic |

Unknown events are ignored. Clients cannot name arbitrary rooms.

### Server → Client
| Event | Room | Payload | Emitted when |
|---|---|---|---|
| `message:new` | `group:{groupId}` | sanitized message row (identical to REST POST response `item`) | after REST message commit |
| `comment:new` | `task:{taskId}` | sanitized comment row | after REST comment commit |
| `notification:new` | `user:{recipientId}` | sanitizeNotification(row) | after notification persistence (all five types; preference-filtered before creation) |
| `notification:unread-count` | `user:{recipientId}` | `{ unreadCount }` (authoritative DB value) | after fan-out batch |
| `presence:updated` | co-member `group:{gid}` rooms | `{ userId, online, at }` | connection-derived 0→1 and grace-expired→0 transitions |
| `error` | socket | `{ event, message }` | unauthorized/malformed joins |

Delivery is best-effort: REST is authoritative; clients resync via REST after reconnect.
