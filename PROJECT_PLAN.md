# Team Task Management Application - Project Plan

## Project Overview

A collaboration platform combining task management, group communication, and team workflow tracking.

## Architecture

### High-Level Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   (React/Vite)  │◄──►│   (Node/Express)│◄──►│   (SQLite)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                               │
                               ▼
                     ┌─────────────────┐
                     │   Realtime      │
                     │   (Socket.IO)   │
                     └─────────────────┘
```

### Components - IMPLEMENTATION STATUS
1. **Frontend**: React + Vite with TailwindCSS - **IMPLEMENTED (Phase 1 complete)**
2. **Backend**: Node.js + Express API server - **IMPLEMENTED (Phase 1 complete)**
3. **Database**: SQLite with ORM (Sequelize) - **IMPLEMENTED (Users, Groups, GroupMembers, Tasks, Checklists, TaskMembers, Messages, Notifications tables)**
4. **Realtime**: Socket.IO for chat functionality - **NOT IMPLEMENTED**

## Folder Structure - ACTUAL vs PLANNED

```
project-root/
├── backend/                          ✅ EXISTS
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js           ✅ EXISTS
│   │   ├── controllers/
│   │   │   ├── authController.js     ✅ EXISTS
│   │   │   ├── healthController.js   ✅ EXISTS
│   │   │   ├── userController.js     ✅ EXISTS
│   │   │   └── groupController.js    ✅ EXISTS
│   │   ├── middleware/
│   │   │   └── auth.js               ✅ EXISTS
│   │   ├── models/
│   │   │   ├── User.js               ✅ EXISTS
│   │   │   ├── Group.js              ✅ EXISTS
│   │   │   ├── GroupMember.js        ✅ EXISTS
│   │   │   └── index.js              ✅ EXISTS
│   │   ├── routes/
│   │   │   ├── auth.js               ✅ EXISTS
│   │   │   ├── index.js              ✅ EXISTS
│   │   │   ├── users.js              ✅ EXISTS
│   │   │   └── groups.js             ✅ EXISTS
│   │   ├── utils/                    ⚠️ EXISTS (empty)
│   │   ├── app.js                    ✅ EXISTS
│   │   └── server.js                 ✅ EXISTS
│   ├── migrations/
│   │   ├── 20240821190000-create-users.js      ✅ EXISTS
│   │   ├── 20240821190001-create-groups.js     ✅ EXISTS
│   │   └── 20240821190002-create-group-members.js ✅ EXISTS
│   ├── package.json                  ✅ EXISTS
│   ├── .env                          ✅ EXISTS
│   └── data/
│       └── team-management.sqlite    ✅ EXISTS
├── frontend/                         ✅ EXISTS (FULLY IMPLEMENTED)
│   ├── src/
│   │   ├── components/
│   │   │   └── AddMemberModal.jsx    ✅ EXISTS
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx       ✅ EXISTS
│   │   ├── hooks/                    ⚠️ EXISTS (empty)
│   │   ├── pages/
│   │   │   ├── Login.jsx             ✅ EXISTS
│   │   │   ├── Register.jsx          ✅ EXISTS
│   │   │   ├── Dashboard.jsx         ✅ EXISTS
│   │   │   ├── Profile.jsx           ✅ EXISTS
│   │   │   ├── Groups.jsx            ✅ EXISTS
│   │   │   └── GroupDetail.jsx       ✅ EXISTS
│   │   ├── services/
│   │   │   └── api.js                ✅ EXISTS
│   │   ├── App.jsx                   ✅ EXISTS
│   │   ├── main.jsx                  ✅ EXISTS
│   │   └── index.css                 ✅ EXISTS
│   ├── public/
│   │   └── vite.svg                  ✅ EXISTS
│   ├── package.json                  ✅ EXISTS
│   ├── vite.config.js                ✅ EXISTS
│   ├── index.html                    ✅ EXISTS
│   ├── tailwind.config.js            ✅ EXISTS
│   ├── postcss.config.js             ✅ EXISTS
│   └── .env                          ✅ EXISTS
├── database/
│   └── migrations/
│       └── .gitkeep                  ✅ EXISTS
├── PROJECT_PLAN.md                   ✅ EXISTS
├── PROJECT_PROGRESS.md               ✅ EXISTS
├── PROJECT_RESULT.md                 ✅ EXISTS
└── README.md                         ✅ EXISTS
```

## Database Design - IMPLEMENTATION STATUS

### Tables

#### 1. Users ✅ IMPLEMENTED
- `id` (PK, auto-increment) ✅
- `username` (unique) ✅
- `password` (hashed) ✅
- `display_name` ✅ (displayName in model)
- `avatar_url` ✅ (avatarUrl in model)
- `online_status` (default: false) ✅
- `created_at` ✅
- `updated_at` ✅

#### 2. Groups ✅ IMPLEMENTED
- `id` (PK, auto-increment) ✅
- `name` ✅
- `description` ✅
- `avatar_url` ✅
- `owner_id` (FK to Users) ✅
- `created_at` ✅
- `updated_at` ✅

#### 3. GroupMembers ✅ IMPLEMENTED
- `id` (PK, auto-increment) ✅
- `group_id` (FK to Groups) ✅
- `user_id` (FK to Users) ✅
- `role` (owner, admin, member) ✅
- `joined_at` ✅
- `created_at` ✅
- `updated_at` ✅
- Unique constraint on (group_id, user_id) ✅
- Indexes on group_id, user_id ✅

#### 4. Tasks ✅ IMPLEMENTED (Phase 4B-1)
- `id` (PK, auto-increment) ✅
- `title` (STRING, NOT NULL) ✅
- `description` (TEXT, nullable) ✅
- `creatorId` (FK to Users, NOT NULL) ✅
- `assigneeId` (FK to Users, nullable - single assignee for now) ✅
- `groupId` (FK to Groups, NOT NULL) ✅
- `status` (ENUM: todo, in_progress, completed, overdue, DEFAULT 'todo') ✅
- `priority` (ENUM: low, medium, high, urgent, DEFAULT 'medium') ✅
- `startDate` (DATE, nullable) ✅
- `dueDate` (DATE, nullable) ✅
- `completedAt` (DATE, nullable) ✅
- `createdAt` (DATE, DEFAULT NOW) ✅
- `updatedAt` (DATE, DEFAULT NOW) ✅

#### 5. Checklists ✅ IMPLEMENTED (Database layer - Phase 4A)
- `id` (PK, auto-increment) ✅
- `taskId` (FK to Tasks, NOT NULL) ✅
- `title` (STRING, NOT NULL) ✅
- `isCompleted` (BOOLEAN, DEFAULT false) ✅
- `order` (INTEGER, DEFAULT 0) ✅
- `completedBy` (FK to Users, nullable) ✅
- `completedAt` (DATE, nullable) ✅
- `createdAt` (DATE, DEFAULT NOW) ✅
- `updatedAt` (DATE, DEFAULT NOW) ✅

#### 6. TaskMembers ✅ IMPLEMENTED (for future multi-assignee support)
- `id` (PK, auto-increment) ✅
- `taskId` (FK to Tasks, NOT NULL) ✅
- `userId` (FK to Users, NOT NULL) ✅
- `role` (ENUM: assignee, reviewer, follower, DEFAULT 'assignee') ✅
- `assignedAt` (DATE, DEFAULT NOW) ✅
- `assignedBy` (FK to Users, NOT NULL) ✅
- Unique constraint on (taskId, userId) ✅
- Indexes on taskId, userId ✅

#### 7. Messages ❌ NOT IMPLEMENTED (Phase 6)
- `id` (PK, auto-increment)
- `senderId` (FK to Users)
- `groupId` (FK to Groups, nullable for task comments)
- `taskId` (FK to Tasks, nullable)
- `content`
- `createdAt`

### 7. Notifications ✅ IMPLEMENTED (Database layer - Phase 5C.2)
- `id` (PK, auto-increment) ✅
- `recipientId` (FK to Users, NOT NULL, CASCADE on delete) ✅
- `senderId` (FK to Users, nullable, SET NULL on delete) ✅
- `taskId` (FK to Tasks, nullable, SET NULL on delete) ✅
- `groupId` (FK to Groups, nullable, CASCADE on delete) ✅
- `messageId` (FK to Messages, nullable, SET NULL on delete) ✅
- `type` (STRING 50, NOT NULL; app-layer enum: TASK_ASSIGNED, TASK_COMPLETED, NEW_MESSAGE, DEADLINE_APPROACHING, MENTION) ✅
- `title` (STRING 200, NOT NULL) ✅
- `message` (TEXT, NOT NULL) ✅
- `isRead` (BOOLEAN, DEFAULT false) ✅
- `readAt` (DATE, nullable) ✅
- `metadata` (JSON, nullable) ✅
- `createdAt`, `updatedAt` ✅

## Development Roadmap - ACTUAL STATUS

### Phase 0: Project Planning ✅ COMPLETED
- Define architecture ✅
- Define folder structure ✅
- Design database schema ✅
- Create project plan and progress documents ✅

### Phase 1: Project Foundation ✅ COMPLETED (Backend + Frontend)
- Set up React + Vite frontend ✅ COMPLETED
- Set up Express backend ✅ COMPLETED
- Configure SQLite database ✅ COMPLETED
- Implement basic routing and layout ✅ COMPLETED
- Set up API structure ✅ COMPLETED

### Phase 2: User System ✅ COMPLETED
- User registration ✅ IMPLEMENTED
- User login/logout ✅ IMPLEMENTED
- User profile management ✅ IMPLEMENTED
- Authentication middleware ✅ IMPLEMENTED
- Change password ✅ IMPLEMENTED

### Phase 3: Team Groups ✅ COMPLETED (Backend + Frontend)
- Create groups ✅ IMPLEMENTED
- Add/remove members ✅ IMPLEMENTED
- Group settings ✅ IMPLEMENTED
- Group member management ✅ IMPLEMENTED
- Role-based authorization (owner, admin, member) ✅ IMPLEMENTED

### Phase 4: Task Management ✅ PHASE 4B-2 COMPLETED (Backend Advanced)
- Create/edit tasks ✅ IMPLEMENTED
- Assign tasks ✅ IMPLEMENTED
- Task filtering ✅ IMPLEMENTED
- Task dashboard ❌ NOT STARTED (Frontend - Phase 4C)
- Task assignment endpoint ✅ IMPLEMENTED
- Task status update endpoint ✅ IMPLEMENTED
- Task filtering/search enhancements ✅ IMPLEMENTED
- Pagination support ✅ IMPLEMENTED

### Phase 4C: Task Management Frontend ❌ NOT STARTED
- Task list page ❌
- Task detail page ❌
- Task creation/edit form ❌
- Task filtering UI ❌
- Integration with Group pages ❌

### Phase 5: Task Checklist ✅ COMPLETED
- Add checklist items ✅
- Complete/delete items ✅
- Progress calculation ✅

### Phase 6: Group Chat ✅ COMPLETED
- Group messaging ✅
- Task comments ✅
- Real-time communication ❌ (planned for Phase 5D)

### Phase 7: Notification System - PHASE 5C.1 DESIGN COMPLETED
- Task assignment notifications 📋 PLANNED
- Deadline alerts 📋 PLANNED
- Message notifications 📋 PLANNED

### Phase 8: UI Improvement ❌ NOT STARTED
- Responsive design ❌
- Mobile-friendly layout ❌
- Enhanced dashboard ❌

### Phase 9: Testing and Deployment ❌ NOT STARTED
- Unit tests ❌
- Error handling ❌
- Security improvements ❌
- Deployment guide ❌

## Feature Priorities

1. **Core Functionality**: User system, groups, task management
2. **Communication**: Group chat, task comments
3. **Engagement**: Notifications, progress tracking
4. **UX**: Responsive design, mobile optimization

## Phase 4 Design Section

### Database Design - Phase 4 Task Management

#### 4. Tasks ✅ DESIGNED
- `id` (PK, auto-increment)
- `title` (STRING, NOT NULL)
- `description` (TEXT, nullable)
- `creatorId` (FK to Users, NOT NULL)
- `assigneeId` (FK to Users, nullable - single assignee for now)
- `groupId` (FK to Groups, NOT NULL)
- `priority` (ENUM: low, medium, high, DEFAULT 'medium')
- `startDate` (DATE, nullable)
- `dueDate` (DATE, nullable)
- `status` (ENUM: todo, in_progress, completed, overdue, DEFAULT 'todo')
- `completedAt` (DATE, nullable)
- `createdAt` (DATE, DEFAULT NOW)
- `updatedAt` (DATE, DEFAULT NOW)

#### 5. Checklists ✅ DESIGNED
- `id` (PK, auto-increment)
- `taskId` (FK to Tasks, NOT NULL)
- `title` (STRING, NOT NULL)
- `isCompleted` (BOOLEAN, DEFAULT false)
- `order` (INTEGER, DEFAULT 0)
- `completedBy` (FK to Users, nullable)
- `completedAt` (DATE, nullable)
- `createdAt` (DATE, DEFAULT NOW)
- `updatedAt` (DATE, DEFAULT NOW)

#### 6. TaskMembers ✅ DESIGNED (for future multi-assignee support)
- `id` (PK, auto-increment)
- `taskId` (FK to Tasks, NOT NULL)
- `userId` (FK to Users, NOT NULL)
- `role` (ENUM: assignee, reviewer, follower, DEFAULT 'assignee')
- `assignedAt` (DATE, DEFAULT NOW)
- `assignedBy` (FK to Users, NOT NULL)
- Unique constraint on (taskId, userId)

### Relationships
- User 1:N Tasks (creator)
- User 1:N Tasks (assignee - single for now)
- Group 1:N Tasks
- Task 1:N Checklists
- Task N:M Users (via TaskMembers - future multi-assignee)

### API Endpoints (Proposed)
- POST /api/groups/:groupId/tasks - Create task
- GET /api/groups/:groupId/tasks - List tasks (with filters)
- GET /api/tasks/:id - Get task details
- PUT /api/tasks/:id - Update task
- DELETE /api/tasks/:id - Delete task
- PUT /api/tasks/:id/assign - Assign/reassign task
- PUT /api/tasks/:id/status - Update task status
- POST /api/tasks/:taskId/checklist - Add checklist item
- GET /api/tasks/:taskId/checklist - List checklist items
- PUT /api/checklist/:id - Update checklist item
- PUT /api/checklist/:id/complete - Toggle completion
- DELETE /api/checklist/:id - Delete checklist item

### Authorization Rules
- Owner: Full access to all tasks in group
- Admin: Manage all tasks, assign tasks, cannot delete owner's tasks
- Creator: Update/delete own tasks, change status
- Assignee: Update status, add/complete checklist items
- Member: Create tasks, add/complete checklist items

### Frontend Pages (Proposed)
- TaskList: /groups/:groupId/tasks
- TaskDetail: /groups/:groupId/tasks/:taskId
- TaskForm: /groups/:groupId/tasks/new and /edit
- MyTasks: /tasks (cross-group dashboard)

### Migration Plan
1. 20240821190003-create-tasks.js
2. 20240821190004-create-checklists.js
3. 20240821190005-create-task-members.js (future-proofing)

### Risks and Decisions
- Single assignee for Phase 4, TaskMembers table for future multi-assignee
- Checklist ordering with integer, drag-drop later
- Overdue status computed on read, no cron needed
- Cascade delete on group, SET NULL on assignee delete
- TaskMembers table created now for future-proofing

## Technology Decisions - INSTALLATION STATUS

- **ORM**: Sequelize (mature SQLite support, migrations) ✅ INSTALLED
- **Auth**: JSON Web Tokens (JWT) ✅ INSTALLED (jsonwebtoken)
- **Password Hashing**: bcrypt ✅ INSTALLED (bcryptjs)
- **State Management**: React Context API (lightweight for this scope) ✅ IMPLEMENTED
- **HTTP Client**: Axios ✅ INSTALLED
- **Form Validation**: React Hook Form + Zod ❌ NOT INSTALLED
- **UI Icons**: Lucide React ❌ NOT INSTALLED
- **Date Handling**: date-fns ❌ NOT INSTALLED
- **Cookie Parsing**: cookie-parser ✅ INSTALLED
- **Realtime**: Socket.IO ❌ NOT INSTALLED
- **Frontend Build**: Vite ✅ INSTALLED
- **Frontend Framework**: React 18 ✅ INSTALLED
- **Frontend Routing**: React Router DOM v6 ✅ INSTALLED
- **Styling**: TailwindCSS ✅ INSTALLED

## API Design Guidelines

- Use RESTful conventions ✅ FOLLOWED
- Standard HTTP status codes ✅ FOLLOWED
- Consistent JSON response format ✅ FOLLOWED
- JWT-based authentication ✅ IMPLEMENTED
- Request validation middleware ❌ NOT IMPLEMENTED

## Current Phase

**Phase 7.3: Per-Member Workload Drill-Down** - **COMPLETED** (per-member assigned-task stats + unassigned bucket via additive `GET /api/groups/:id/members?include=stats` — one aggregation query, 3 queries total, blind-404 preserved, forged identity ignored; Dashboard accordion drill-down with nested workload table + ARIA; shared computeTaskStats refactor keeps 7.2 group-stats output identical; 25-assertion suite green)

**Phase 7.2: Team Productivity Detail** - **COMPLETED** (per-group productivity stats via additive `GET /api/groups?include=stats` — single attributes-only aggregation query, no new route; Dashboard "My Groups" upgraded to per-group table with counts + completion progress bars; no-param response unchanged; 21-assertion productivity suite green)

**Phase 7.1: Dashboard & Team Productivity Overview** - **COMPLETED** (read-only overview above existing cards; 4 parallel fetches from assigned/created/notifications/groups/health; derived overdue/dueSoon via isTaskOverdue; no new backend route; 10-assertion dashboard suite green)

**Phase 6.7: Task List Actions & Coverage** - **COMPLETED** (Task List inline Status/Priority/Assignee selects + Delete, permission-aware per-row saving, server-authoritative updates, pagination edge handling; no new endpoints; build + battery green)

**Phase 6.6: Task UX Polish** - **COMPLETED** (shared taskDisplay helpers, aria enhancements for TaskForm/Checklist/pagination, consistent overdue/date formatting, responsive polish; frontend-only changes; build green)

**Phase 6.5: My Tasks** - **COMPLETED** (cross-group view at /tasks via existing GET /api/tasks + new server-derived scope param [assigned|created]; fixed crash-level missing Link import, triple headers, wrong view semantics; debounced search, overdue indicator, differentiated empty states; new 13-assertion mytasks suite incl. forged-identity override checks. Full battery green.)

**Phase 6.4: Task Workflow** - **COMPLETED** (Task Detail status control made server-authoritative: uses PUT /tasks/:id/status response incl. server-managed completedAt, saving state + duplicate guard, errors surfaced via getApiErrorMessage; transition-based TASK_COMPLETED notification dedupe verified live; full battery green)

**Phase 6.3: Task Create/Edit** - **COMPLETED** (new routes /groups/:groupId/tasks/new and /tasks/:taskId/edit with shared react-hook-form TaskForm; legacy modal forms retired in favor of page-based flows; status intentionally excluded from edit form — dedicated endpoint owns it; live payload smoke test + full battery green)

**Phase 6.2: Task Detail** - **COMPLETED** (existing Phase 4C detail page audited and hardened: group name row linking to group, overdue-consistent due-date display, normalized error messages via getApiErrorMessage, true two-column layout with checklist+comments in main column and actions/members sidebar; description whitespace preserved. Full backend battery green.)

**Phase 6.1: Task List** - **COMPLETED** (existing Phase 4C task list audited against the revised Phase 6 scope and hardened: debounced server-side search, initial-load-only spinner + inline refresh state, overdue indication, creator/start-date columns, responsive overflow fix, differentiated empty states; dead code removed. Full backend battery green.)

## Roadmap Note — Phase Numbering Revision
A revised roadmap now numbers the Task Management Frontend & Workflow effort as **Phase 6** (6.1 Task List → 6.2 Task Detail → …). This supersedes the historical in-document labels where "Phase 4C" covered the original task frontend and "Phase 6" covered group chat. Completed work is unchanged; only the forward-looking numbering moved. Progress for the new phase is recorded in `5F.1.txt` onward.

## Project Completion Summary
All phases through 5E.5 are COMPLETED (foundation/auth/groups/tasks backend/checklist/chat/notifications/realtime/integration/error/security/performance/docs), and revised **Phase 6.1–6.6** are COMPLETED (Task List → Detail → Create/Edit → Workflow → My Tasks → UX Polish) on top of that foundation. Final test state: 9 suites green + REST regression sweep; production build passing; docs consolidated under docs/.

## Recommended Next Steps (future work, NOT started)
- **Phase 7: Dashboard & Team Productivity** (next — not started)
- Later Phase 6 sub-phases per revised roadmap
- Phase 9 candidates: refresh tokens/token revocation, broader REST rate limiting, HTTPS/HSTS/CSP at proxy, email/push channels

## Phase 6.7 Update
**Phase 6.7: Task List Actions & Coverage** - **COMPLETED** (Task List inline row actions: Status via PUT /tasks/:id/status (overdue excluded), Priority/Assignee via PUT /tasks/:id, Delete with confirm; per-row saving, aria-busy/labels, overdue derived via shared helper; no new backend endpoints or realtime events)

## Phase 6.6 Update
**Phase 6.6: Task UX Polish** - **COMPLETED** (shared taskDisplay helpers, aria improvements for TaskForm/Checklist/pagination, consistent overdue/date formatting across TaskList/MyTasks/TaskDetail, responsive polish; no backend changes; build green)

## Phase 6.5 Update
**Phase 6.1–6.4 progress note:** Task List hardening, Task Detail hardening, page-based Create/Edit (modals retired), and server-authoritative status workflow were all COMPLETED after the summary above; see `5F.1.txt`–`5F.4.txt`.

**Phase 6.5: My Tasks** - **COMPLETED** (cross-group view at /tasks; new server-derived `scope` param on GET /api/tasks [assigned|created] overriding any client-supplied identity filters; frontend rewritten — fixed crash-level missing Link import, triple headers, wrong view semantics; debounced search, overdue indicator, differentiated empty states; new 13-assertion mytasks suite incl. forged-identity override checks. Full battery green.)

(End of file)