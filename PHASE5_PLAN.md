# Phase 5 Complete Roadmap - Team Task Management Application

## Overview
Phase 5 adds collaborative features: Checklist Management, Group Chat, Notifications, Real-time (Socket.IO), and Final Polish.

**Current State**: Phase 5A.1 (Checklist Design) COMPLETED. Ready to begin 5A.2.

---

## 5A - Checklist Management

### 5A.1 - Design & Implementation Plan ✅ COMPLETED
**State File**: `5A.1.txt`
- Database layer already exists (Phase 4A migration 20240821190004)
- 5 backend API endpoints defined
- 2 frontend components planned (Checklist, ChecklistItem)
- Authorization: all group members can manage checklist
- Integration into TaskDetail page

---

### 5A.2 - Database / Model Layer
**Objective**: Verify existing Checklist model, associations, and database table.

**Dependencies**: 5A.1 (completed)

**Expected Files to Verify**:
- `backend/src/models/Checklist.js` - Model definition
- `backend/src/models/Task.js` - Task.hasMany(Checklist) association
- `backend/src/models/User.js` - User.hasMany(Checklist) as completer
- `backend/migrations/20240821190004-create-checklists.js` - Migration
- Database: `Checklists` table exists with indexes

**Expected Database Changes**: NONE (already implemented in Phase 4A)

**Expected API Changes**: NONE

**Expected Frontend Changes**: NONE

**Testing Requirements**:
- Verify model loads without errors
- Verify associations work (Task.checklist, Checklist.completer)
- Verify database table structure matches model
- Verify cascade delete on task deletion
- Verify SET NULL on user deletion

**Completion Criteria**:
- All models load correctly
- All associations work
- Database table verified
- Ready for 5A.3

---

### 5A.3 - Checklist Backend API
**Objective**: Implement 5 checklist REST endpoints in taskController.js and routes/tasks.js

**Dependencies**: 5A.2 (verified)

**Expected Files to Modify**:
- `backend/src/controllers/taskController.js` - Add 5 functions
- `backend/src/routes/tasks.js` - Add 5 routes

**Expected Functions to Add**:
1. `getChecklist(req, res)` - GET /api/tasks/:taskId/checklist
2. `addChecklistItem(req, res)` - POST /api/tasks/:taskId/checklist
3. `updateChecklistItem(req, res)` - PUT /api/tasks/:taskId/checklist/:itemId
4. `deleteChecklistItem(req, res)` - DELETE /api/tasks/:taskId/checklist/:itemId
5. `toggleChecklistItem(req, res)` - PUT /api/tasks/:taskId/checklist/:itemId/toggle
6. `sanitizeChecklistItem(item)` - Helper for response formatting

**Expected Routes to Add**:
```javascript
router.get('/tasks/:taskId/checklist', taskController.getChecklist);
router.post('/tasks/:taskId/checklist', taskController.addChecklistItem);
router.put('/tasks/:taskId/checklist/:itemId', taskController.updateChecklistItem);
router.delete('/tasks/:taskId/checklist/:itemId', taskController.deleteChecklistItem);
router.put('/tasks/:taskId/checklist/:itemId/toggle', taskController.toggleChecklistItem);
```

**Authorization**: All endpoints require authentication + group membership (404 if not member). No additional role checks.

**Validation**:
- Title: required, 1-500 chars
- Order: integer >= 0
- isCompleted: boolean (for toggle)

**Expected Database Changes**: NONE (uses existing table)

**Testing Requirements**:
- All 5 endpoints return correct responses
- Auth: 401 without token
- Auth: 404 for non-member / invalid taskId / invalid itemId
- Validation: 400 for missing/invalid title, invalid order
- Toggle: sets/clears completedBy and completedAt correctly
- Items returned ordered by `order` ASC

**Completion Criteria**:
- All 5 endpoints implemented and tested
- Routes mounted correctly
- Follows existing code patterns (sanitization, error handling)
- Ready for 5A.4

---

### 5A.4 - Checklist Frontend UI
**Objective**: Create Checklist and ChecklistItem components, integrate into TaskDetail

**Dependencies**: 5A.3 (backend API working)

**Expected Files to Create**:
- `frontend/src/components/Checklist.jsx` - Main component
- `frontend/src/components/ChecklistItem.jsx` - Individual item

**Expected Files to Modify**:
- `frontend/src/pages/TaskDetail.jsx` - Replace placeholder with Checklist component
- `frontend/src/services/api.js` - Verify endpoints (already defined)

**UI Features**:
- Progress indicator: "X of Y completed" + visual bar
- Ordered list with checkboxes
- Completed items: strikethrough, completer name, timestamp
- Add item: inline input at bottom
- Edit item: click title → inline edit → save
- Delete item: confirmation → remove
- Optimistic updates for toggle
- Skeleton loading state
- Empty state with prompt

**Testing Requirements**:
- Component renders in TaskDetail
- Progress indicator updates correctly
- Add/edit/delete/toggle all work
- Optimistic updates feel instant
- Error handling shows toast
- Build succeeds (`npm run build`)

**Completion Criteria**:
- Both components created and working
- Integrated into TaskDetail
- Progress indicator visible
- All interactions functional
- Build passes

---

### 5A.5 - Checklist Testing & Integration
**Objective**: End-to-end testing of checklist feature

**Dependencies**: 5A.3, 5A.4

**Testing Requirements**:
- Backend: All 5 endpoints tested (see 5A.3)
- Frontend: Build test + manual UI tests (see 5A.4)
- Integration:
  - Create task → open detail → add 3 items → complete 2 → verify progress 2/3
  - Multi-user: user A adds, user B completes → shows user B as completer
  - Task deletion cascades to checklist
  - User deletion SET NULL on completedBy
- Update PROJECT_PROGRESS.md and PROJECT_RESULT.md

**Completion Criteria**:
- All tests pass
- Documentation updated
- Ready for 5B.1

---

## 5B - Group Chat

### 5B.1 - Design & Implementation Plan
**Objective**: Plan group chat feature (messages, task comments, realtime)

**Dependencies**: 5A.5 (completed)

**Planning Scope**:
- Database: Messages table (group messages + task comments)
- Backend: Message CRUD + pagination
- Frontend: Chat panel in GroupDetail, comments in TaskDetail
- Real-time: Socket.IO integration (deferred to 5D)

**Key Design Decisions**:
- Messages table: senderId, groupId (nullable), taskId (nullable), content, createdAt
- Group chat: messages with groupId, no taskId
- Task comments: messages with taskId, groupId for auth
- Pagination: 50 messages per page, load older
- Authorization: group members can read/write

**Expected Files**:
- Migration: `20240821190006-create-messages.js`
- Model: `backend/src/models/Message.js`
- Controller: `backend/src/controllers/messageController.js`
- Routes: `backend/src/routes/messages.js`
- Frontend: Chat components, integration into GroupDetail/TaskDetail

**Completion Criteria**: Detailed plan document `5B.1.txt` created

---

### 5B.2 - Database / Model Layer
**Objective**: Create Messages table, model, associations

**Dependencies**: 5B.1

**Expected Files**:
- `backend/migrations/20240821190006-create-messages.js`
- `backend/src/models/Message.js`
- Update `backend/src/models/index.js`
- Update `User.js`, `Group.js`, `Task.js` with associations

**Database Schema**:
- id (PK), senderId (FK→Users), groupId (FK→Groups, nullable), taskId (FK→Tasks, nullable), content (TEXT), createdAt
- Indexes: groupId, taskId, (groupId, createdAt), (taskId, createdAt)
- FK: senderId→Users (CASCADE), groupId→Groups (CASCADE), taskId→Tasks (CASCADE)

**Associations**:
- User.hasMany(Message, as: 'sentMessages')
- Message.belongsTo(User, as: 'sender')
- Group.hasMany(Message, as: 'messages')
- Message.belongsTo(Group, as: 'group')
- Task.hasMany(Message, as: 'comments')
- Message.belongsTo(Task, as: 'task')

**Completion Criteria**: Migration runs, models load, associations work

---

### 5B.3 - Backend API
**Objective**: Message CRUD endpoints for group chat and task comments

**Dependencies**: 5B.2

**Endpoints**:
- GET /api/groups/:groupId/messages - List group messages (paginated)
- POST /api/groups/:groupId/messages - Send group message
- GET /api/tasks/:taskId/comments - List task comments (paginated)
- POST /api/tasks/:taskId/comments - Add task comment
- PUT /api/messages/:id - Edit message (sender only)
- DELETE /api/messages/:id - Delete message (sender or owner/admin)

**Authorization**:
- Read: group members
- Write: group members
- Edit/Delete: sender, or group owner/admin

**Completion Criteria**: All endpoints implemented, tested, documented

---

### 5B.4 - Frontend Chat UI
**Objective**: Chat UI in GroupDetail, comments in TaskDetail

**Dependencies**: 5B.3

**Components**:
- `ChatPanel.jsx` - GroupDetail sidebar/panel
- `MessageList.jsx` - Message display with pagination
- `MessageInput.jsx` - Input + send
- `CommentSection.jsx` - TaskDetail comments
- `CommentItem.jsx` - Individual comment

**Features**:
- Real-time feel (polling until Socket.IO)
- Load more (pagination)
- Timestamps, sender avatar/name
- Edit/delete own messages
- Task comments linked to task

**Completion Criteria**: Components work, integrated, build passes

---

### 5B.5 - Testing & Integration
**Objective**: Test chat feature end-to-end

**Dependencies**: 5B.3, 5B.4

**Tests**:
- Group chat: send, receive, paginate, edit, delete
- Task comments: add, view, edit, delete
- Permissions: owner/admin can delete any, users only own
- Cross-feature: message appears in both group chat and task comments (if taskId set)
- Update docs

**Completion Criteria**: All tests pass, docs updated, ready for 5C.1

---

## 5C - Notifications

### 5C.1 - Design & Implementation Plan
**Objective**: Plan notification system

**Dependencies**: 5B.5

**Scope**:
- Database: Notifications table
- Triggers: task assigned, deadline approaching, new message, task completed, mentioned
- Delivery: in-app (bell icon), email (future), realtime (5D)
- Preferences: per-user notification settings

**Database Schema**:
- id, recipientId, senderId, taskId (nullable), type (enum), message, isRead, createdAt
- Indexes: recipientId+isRead, recipientId+createdAt
- FK: recipientId→Users (CASCADE), senderId→Users (SET NULL), taskId→Tasks (SET NULL)

**Notification Types**:
- TASK_ASSIGNED
- DEADLINE_APPROACHING (24h before)
- NEW_MESSAGE
- TASK_COMPLETED
- MENTION (@username in comment)

**Completion Criteria**: Plan document `5C.1.txt` created

---

### 5C.2 - Database / Model Layer
**Objective**: Create Notifications table and model

**Dependencies**: 5C.1

**Files**:
- Migration: `20240821190007-create-notifications.js`
- Model: `backend/src/models/Notification.js`
- Associations in User.js, Task.js

**Completion Criteria**: Migration runs, model works

---

### 5C.3 - Backend API
**Objective**: Notification CRUD + trigger logic

**Dependencies**: 5C.2

**Endpoints**:
- GET /api/notifications - List user notifications (paginated, filter unread)
- PUT /api/notifications/:id/read - Mark as read
- PUT /api/notifications/read-all - Mark all as read
- DELETE /api/notifications/:id - Delete notification

**Trigger Logic** (in existing controllers):
- Task assignment → create TASK_ASSIGNED notification
- Task completion → create TASK_COMPLETED for creator/assignee
- New message → create NEW_MESSAGE for group members (except sender)
- Deadline cron → create DEADLINE_APPROACHING (daily job)
- @mention in comment → create MENTION

**Completion Criteria**: API + triggers work, tested

---

### 5C.4 - Frontend Notification UI
**Objective**: Notification bell, dropdown, settings

**Dependencies**: 5C.3

**Components**:
- `NotificationBell.jsx` - Header bell with unread count
- `NotificationDropdown.jsx` - List with mark-read actions
- `NotificationSettings.jsx` - Profile tab for preferences

**Features**:
- Unread count badge
- Click to mark read
- Link to relevant task/group
- Settings: toggle types on/off

**Completion Criteria**: UI works, integrated, build passes

---

### 5C.5 - Testing & Integration
**Objective**: Test notifications end-to-end

**Dependencies**: 5C.3, 5C.4

**Tests**:
- Trigger each notification type
- Verify delivery to correct users
- Mark read/unread
- Settings filter correctly
- Update docs

**Completion Criteria**: All tests pass, docs updated, ready for 5D.1

---

## 5D - Realtime / Socket.IO

### 5D.1 - Design & Architecture Plan
**Objective**: Plan Socket.IO integration

**Dependencies**: 5C.5

**Architecture**:
- Backend: Socket.IO server alongside Express
- Events: connection, join-room, leave-room, message, task-update, notification
- Rooms: group rooms, task rooms, user rooms
- Auth: JWT token in handshake
- Frontend: Socket context, auto-reconnect

**Events**:
- Client→Server: joinGroup, leaveGroup, joinTask, sendMessage, updateTask
- Server→Client: newMessage, taskUpdated, newNotification, userJoined, userLeft

**Scalability**: Single server for now, Redis adapter later

**Completion Criteria**: Plan document `5D.1.txt` created

---

### 5D.2 - Backend Socket.IO
**Objective**: Implement Socket.IO server

**Dependencies**: 5D.1

**Files**:
- `backend/src/socket/index.js` - Socket setup
- `backend/src/socket/handlers/` - Event handlers
- Update `backend/src/server.js` - Attach Socket.IO

**Features**:
- JWT auth on connection
- Room management (group, task, user)
- Message broadcast to group room
- Task update broadcast to task room
- Notification emit to user room
- Connection/disconnection logging

**Dependencies**: Install `socket.io`

**Completion Criteria**: Server runs, handles connections, rooms work

---

### 5D.3 - Realtime Chat Integration
**Objective**: Replace polling with Socket.IO for chat

**Dependencies**: 5D.2

**Frontend**:
- `frontend/src/contexts/SocketContext.jsx` - Socket connection
- `frontend/src/hooks/useSocket.js` - Hook for components
- Update ChatPanel, MessageList to use realtime

**Features**:
- Instant message delivery
- Typing indicators (optional)
- Online status in member list
- Reconnection handling

**Completion Criteria**: Chat works realtime, no polling

---

### 5D.4 - Realtime Notifications
**Objective**: Push notifications via Socket.IO

**Dependencies**: 5D.2

**Features**:
- New notification → emit to user room
- Bell updates instantly
- Works across tabs

**Completion Criteria**: Notifications realtime

---

### 5D.5 - Testing & Integration
**Objective**: Test all realtime features

**Dependencies**: 5D.2, 5D.3, 5D.4

**Tests**:
- Multiple clients: messages sync instantly
- Reconnection: state recovers
- Notifications: appear without refresh
- Task updates: reflect in other clients
- Load test: 50+ concurrent connections
- Update docs

**Completion Criteria**: All realtime works, docs updated, ready for 5E.1

---

## 5E - Final Integration & Polish

### 5E.1 - Full System Integration
**Objective**: Verify all features work together

**Dependencies**: 5D.5

**Focus Areas**:
- User flow: register → create group → create task → add checklist → chat → get notifications
- Cross-feature: task comment creates notification, appears realtime
- Data consistency: cascade deletes, foreign keys
- Performance: query optimization, indexes

**Tests**: Full integration test suite

**Completion Criteria**: System works end-to-end

---

### 5E.2 - Error Handling & UX Polish
**Objective**: Improve error handling, loading states, UX

**Dependencies**: 5E.1

**Improvements**:
- Global error boundary (React)
- API error handling middleware (Express)
- Better loading skeletons
- Empty states everywhere
- Form validation messages
- Toast notifications for all actions
- Keyboard navigation
- Accessibility (ARIA, focus management)

**Completion Criteria**: Polished UX, no console errors

---

### 5E.3 - Security Review
**Objective**: Security audit and hardening

**Dependencies**: 5E.1

**Checks**:
- JWT: secure, httpOnly, short expiry, refresh tokens
- Rate limiting on auth endpoints
- Input sanitization (XSS prevention)
- CORS configuration
- SQL injection prevention (Sequelize safe)
- Authorization on all endpoints
- Password requirements
- HTTPS enforcement (production)
- Environment variables secured

**Completion Criteria**: Security checklist passed

---

### 5E.4 - Performance Review
**Objective**: Optimize performance

**Dependencies**: 5E.1

**Checks**:
- Database: query analysis, missing indexes
- API: response times, pagination
- Frontend: bundle size, code splitting, lazy loading
- Socket.IO: memory usage, connection handling
- Caching: where applicable

**Tools**: Lighthouse, SQLite EXPLAIN, React DevTools Profiler

**Completion Criteria**: Performance benchmarks met

---

### 5E.5 - Final Testing & Documentation
**Objective**: Final validation and documentation

**Dependencies**: 5E.1-5E.4

**Testing**:
- Regression test all features
- Cross-browser (Chrome, Firefox, Safari)
- Mobile responsive
- Load testing
- Security scan

**Documentation**:
- API documentation (OpenAPI/Swagger)
- Deployment guide
- Developer guide
- User guide
- Update PROJECT_PROGRESS.md, PROJECT_RESULT.md

**Completion Criteria**: All tests pass, docs complete, ready for production

---

## Summary: Phase 5 Sub-Phase Order

```
5A.1 ✅ → 5A.2 → 5A.3 → 5A.4 → 5A.5
    → 5B.1 → 5B.2 → 5B.3 → 5B.4 → 5B.5
    → 5C.1 → 5C.2 → 5C.3 → 5C.4 → 5C.5
    → 5D.1 → 5D.2 → 5D.3 → 5D.4 → 5D.5
    → 5E.1 → 5E.2 → 5E.3 → 5E.4 → 5E.5
```

## Key Dependencies Summary

| Phase | Depends On |
|-------|------------|
| 5A.2 | 5A.1 ✅ |
| 5A.3 | 5A.2 |
| 5A.4 | 5A.3 |
| 5A.5 | 5A.3, 5A.4 |
| 5B.1 | 5A.5 |
| 5B.2 | 5B.1 |
| 5B.3 | 5B.2 |
| 5B.4 | 5B.3 |
| 5B.5 | 5B.3, 5B.4 |
| 5C.1 | 5B.5 |
| 5C.2 | 5C.1 |
| 5C.3 | 5C.2 |
| 5C.4 | 5C.3 |
| 5C.5 | 5C.3, 5C.4 |
| 5D.1 | 5C.5 |
| 5D.2 | 5D.1 |
| 5D.3 | 5D.2 |
| 5D.4 | 5D.2 |
| 5D.5 | 5D.2, 5D.3, 5D.4 |
| 5E.1 | 5D.5 |
| 5E.2 | 5E.1 |
| 5E.3 | 5E.1 |
| 5E.4 | 5E.1 |
| 5E.5 | 5E.1-5E.4 |

---

## File Inventory: Expected State Files

```
5A.1.txt ✅
5A.2.txt (to create)
5A.3.txt (to create)
5A.4.txt (to create)
5A.5.txt (to create)

5B.1.txt (to create)
5B.2.txt (to create)
5B.3.txt (to create)
5B.4.txt (to create)
5B.5.txt (to create)

5C.1.txt (to create)
5C.2.txt (to create)
5C.3.txt (to create)
5C.4.txt (to create)
5C.5.txt (to create)

5D.1.txt (to create)
5D.2.txt (to create)
5D.3.txt (to create)
5D.4.txt (to create)
5D.5.txt (to create)

5E.1.txt (to create)
5E.2.txt (to create)
5E.3.txt (to create)
5E.4.txt (to create)
5E.5.txt (to create)
```

---

## Next Action
**Begin 5A.2**: Verify existing Checklist database/model layer