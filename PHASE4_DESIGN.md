# Phase 4 Task Management - Design Document

## Overview

This document describes the design for Phase 4 Task Management, building upon the existing Users, Groups, and GroupMembers infrastructure.

## 1. Database ER Diagram (Text Format)

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Users     │       │   Groups    │       │  Tasks      │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)     │       │ id (PK)     │
│ username    │◄──────│ ownerId     │◄──────│ creatorId   │
│ password    │       │ name        │       │ assigneeId  │
│ displayName │       │ description │       │ groupId     │
│ avatarUrl   │       │ avatarUrl   │       │ title       │
│ onlineStatus│       │ createdAt   │       │ description │
│ createdAt   │       │ updatedAt   │       │ status      │
│ updatedAt   │       └──────┬──────┘       │ priority    │
└─────────────┘              │              │ startDate   │
                             │              │ dueDate     │
                    ┌────────┴────────┐      │ status    │
                    │  GroupMembers   │      │ createdAt │
                    ├─────────────────┤      │ updatedAt │
                    │ id (PK)         │      └─────┬─────┘
                    │ groupId (FK)    │            │
                    │ userId (FK)     │            ▼
                    │ role            │      ┌─────────────┐
                    │ joinedAt        │      │ Checklists  │
                    │ createdAt       │      ├─────────────┤
                    │ updatedAt       │      │ id (PK)     │
                    └─────────────────┘      │ taskId (FK) │
                                            │ title       │
                                            │ isCompleted │
                                            │ order       │
                                            │ completedBy │
                                            │ completedAt │
                                            │ createdAt   │
                                            │ updatedAt   │
                                            └─────────────┘
```

## 2. Table Definitions

### 2.1 Tasks Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, auto-increment | Primary key |
| title | STRING(200) | NOT NULL | Task title |
| description | TEXT | NULLABLE | Task description |
| creatorId | INTEGER | NOT NULL, FK→Users.id | Task creator |
| assigneeId | INTEGER | NULLABLE, FK→Users.id | Task assignee (single for now) |
| groupId | INTEGER | NOT NULL, FK→Groups.id | Group this task belongs to |
| status | ENUM | NOT NULL, DEFAULT 'todo' | todo, in_progress, completed, overdue |
| priority | ENUM | NOT NULL, DEFAULT 'medium' | low, medium, high |
| startDate | DATE | NULLABLE | Task start date |
| dueDate | DATE | NULLABLE | Task due date |
| completedAt | DATE | NULLABLE | When task was completed |
| createdAt | DATE | NOT NULL, DEFAULT NOW | Creation timestamp |
| updatedAt | DATE | NOT NULL, DEFAULT NOW | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `groupId` (for group task listing)
- Index on `assigneeId` (for user task listing)
- Index on `creatorId` (for creator task listing)
- Composite index on `groupId, status` (for filtering)
- Composite index on `assigneeId, status` (for user dashboard)

**Foreign Keys:**
- `creatorId` → Users.id (RESTRICT on delete)
- `assigneeId` → Users.id (SET NULL on delete)
- `groupId` → Groups.id (CASCADE on delete - delete tasks when group deleted)

### 2.2 Checklists Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, auto-increment | Primary key |
| taskId | INTEGER | NOT NULL, FK→Tasks.id | Parent task |
| title | STRING(500) | NOT NULL | Checklist item title |
| isCompleted | BOOLEAN | NOT NULL, DEFAULT false | Completion status |
| order | INTEGER | NOT NULL, DEFAULT 0 | Display order |
| completedBy | INTEGER | NULLABLE, FK→Users.id | Who completed it |
| completedAt | DATE | NULLABLE | When completed |
| createdAt | DATE | NOT NULL, DEFAULT NOW | Creation timestamp |
| updatedAt | DATE | NOT NULL, DEFAULT NOW | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `taskId` (for task checklist loading)
- Composite index on `taskId, order` (for ordered display)

**Foreign Keys:**
- `taskId` → Tasks.id (CASCADE on delete - delete checklists when task deleted)
- `completedBy` → Users.id (SET NULL on delete)

### 2.3 TaskMembers Table (for future multi-assignee support)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, auto-increment | Primary key |
| taskId | INTEGER | NOT NULL, FK→Tasks.id | Task reference |
| userId | INTEGER | NOT NULL, FK→Users.id | Assigned user |
| role | ENUM | NOT NULL, DEFAULT 'assignee' | assignee, reviewer, follower |
| assignedAt | DATE | NOT NULL, DEFAULT NOW | When assigned |
| assignedBy | INTEGER | NOT NULL, FK→Users.id | Who assigned |

**Indexes:**
- Primary key on `id`
- Unique index on `taskId, userId` (prevent duplicate assignments)
- Index on `taskId`
- Index on `userId`

**Foreign Keys:**
- `taskId` → Tasks.id (CASCADE on delete)
- `userId` → Users.id (CASCADE on delete)
- `assignedBy` → Users.id (RESTRICT on delete)

**Note:** This table is designed for future multi-assignee support. For Phase 4, we'll use the single `assigneeId` on Tasks table, but the schema supports easy migration.

## 3. Relationships Summary

```
User 1 ──< owns >── 1 Group
User >──────< Group (many-to-many via GroupMember)
    │                    │
    │                    ▼
    │              Group 1 ──< owns >── 1 Task
    │                    │
    ├──< creates >────── Task
    ├──< assigns >────── Task (single assigneeId for now)
    │                    │
    └──< completes >───── Checklist (via completedBy)
```

## 4. API Endpoint Proposal

### Task Endpoints (all require authentication)

| Method | Endpoint | Description | Auth Rules |
|--------|----------|-------------|------------|
| POST | `/api/groups/:groupId/tasks` | Create task in group | Member+ |
| GET | `/api/groups/:groupId/tasks` | List tasks in group | Member+ |
| GET | `/api/tasks/:id` | Get task details | Member+ |
| PUT | `/api/tasks/:id` | Update task | Owner/Admin/Assignee |
| DELETE | `/api/tasks/:id` | Delete task | Owner/Admin/Creator |
| PUT | `/api/tasks/:id/assign` | Assign/reassign task | Owner/Admin |
| PUT | `/api/tasks/:id/status` | Update task status | Owner/Admin/Assignee |

### Checklist Endpoints (all require authentication)

| Method | Endpoint | Description | Auth Rules |
|--------|----------|-------------|------------|
| POST | `/api/tasks/:taskId/checklist` | Add checklist item | Member+ |
| GET | `/api/tasks/:taskId/checklist` | List checklist items | Member+ |
| PUT | `/api/checklist/:id` | Update checklist item | Member+ |
| PUT | `/api/checklist/:id/complete` | Toggle completion | Member+ |
| DELETE | `/api/checklist/:id` | Delete checklist item | Owner/Admin/Creator |

### Task Assignment Endpoints (for future multi-assignee)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tasks/:taskId/assignees` | Add assignee |
| GET | `/api/tasks/:taskId/assignees` | List assignees |
| DELETE | `/api/tasks/:taskId/assignees/:userId` | Remove assignee |

## 5. Authorization Rules

### Task Permissions Matrix

| Action | Owner | Admin | Member (Creator) | Member (Assignee) | Member (Other) |
|--------|-------|-------|------------------|-------------------|----------------|
| Create task | ✅ | ✅ | ✅ | ✅ | ✅ |
| View task | ✅ | ✅ | ✅ | ✅ | ✅ |
| Update task | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete task | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assign task | ✅ | ✅ | ✅ | ❌ | ❌ |
| Change status | ✅ | ✅ | ✅ | ✅ | ❌ |
| Add checklist | ✅ | ✅ | ✅ | ✅ | ✅ |
| Complete checklist | ✅ | ✅ | ✅ | ✅ | ✅ |
| Delete checklist | ✅ | ✅ | ✅ | ❌ | ❌ |

### Authorization Logic

- **Owner**: Full access to all tasks in group
- **Admin**: Can manage all tasks, assign tasks, but cannot delete tasks created by owner
- **Creator**: Can update/delete their own tasks, change status
- **Assignee**: Can update status, add/complete checklist items on assigned tasks
- **Member**: Can create tasks, add/complete checklist items on any task they can view

### Checklist Permissions

- Any group member can add checklist items to any task
- Any group member can complete/uncomplete checklist items
- Only Owner/Admin/Creator can delete checklist items

## 6. Frontend Page Proposal

### 6.1 New Pages

| Page | Route | Description |
|------|-------|-------------|
| TaskList | `/groups/:groupId/tasks` | List/filter tasks in group |
| TaskDetail | `/groups/:groupId/tasks/:taskId` | Task detail with checklist |
| TaskForm | `/groups/:groupId/tasks/new` | Create new task |
| TaskForm | `/groups/:groupId/tasks/:taskId/edit` | Edit existing task |
| MyTasks | `/tasks` | Cross-group task dashboard for user |

### 6.2 UI Components

| Component | Purpose |
|-----------|---------|
| TaskCard | Display in list view |
| TaskForm | Create/edit task modal/page |
| TaskDetail | Full task view with sidebar |
| Checklist | Render checklist with completion toggle |
| ChecklistForm | Add/edit checklist item |
| TaskFilter | Filter by status, priority, assignee |
| TaskKanban | Kanban board view (future) |

### 6.3 Integration with Existing Pages

- **Groups page**: Add "Tasks" link/button per group
- **Group Detail**: Add "Tasks" tab/section
- **Dashboard**: Add "My Tasks" section showing assigned tasks
- **Navigation**: Add Tasks link in group navigation

## 7. Migration Plan

### 7.1 Migration Files (in order)

1. `20240821190003-create-tasks.js` - Create Tasks table
2. `20240821190004-create-checklists.js` - Create Checklists table
3. `20240821190005-create-task-members.js` - Create TaskMembers table (future-proofing)

### 7.2 Migration Order Dependencies

```
Users (exists)
    │
    ▼
Groups (exists)
    │
    ▼
GroupMembers (exists)
    │
    ▼
Tasks (depends on Users, Groups)
    │
    ▼
Checklists (depends on Tasks, Users)
    │
    ▼
TaskMembers (depends on Tasks, Users) - optional
```

### 7.3 Rollback Strategy

Each migration has a `down` function that drops the table. Order of rollback:
1. TaskMembers
2. Checklists
3. Tasks

## 8. Risks and Decisions

### 8.1 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Single assignee limitation | Cannot assign to multiple users | TaskMembers table designed for future migration |
| Status auto-overdue | Tasks don't auto-transition to overdue | Add cron job or compute on read |
| Checklist ordering | Drag-drop reordering complexity | Simple order integer, UI can handle later |
| Large group task lists | Performance with many tasks | Pagination + indexes |
| Concurrent checklist updates | Race conditions | Optimistic locking or transactions |

### 8.2 Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single `assigneeId` on Tasks | Simpler for Phase 4; TaskMembers table ready for multi-assignee |
| Checklist items on separate table | Flexible, supports ordering, completion tracking |
| `completedBy` on checklist | Audit trail for who completed what |
| `overdue` as computed status | Avoids cron jobs; computed on read |
| Cascade delete on group | Cleanup when group deleted |
| SET NULL on assignee delete | Preserve task history when user deleted |
| Status as ENUM | Data integrity, clear state machine |

### 8.3 Future Compatibility

| Future Feature | How Supported |
|----------------|---------------|
| Multi-assignee | TaskMembers table exists |
| Comments | Can add Messages table with taskId |
| Attachments | Can add Attachments table with taskId |
| Notifications | Can add Notifications with taskId |
| Activity history | Can add ActivityLog table |
| Time tracking | Can add TimeEntries table with taskId |
| Labels/tags | Can add Labels table + TaskLabels junction |
| Recurring tasks | Can add recurrence fields to Tasks |
| Subtasks | Can add parentTaskId self-ref on Tasks |

## 9. API Response Format

### Task Object

```json
{
  "id": 1,
  "title": "Prepare monthly report",
  "description": "Collect and review data",
  "creatorId": 1,
  "assigneeId": 2,
  "groupId": 1,
  "status": "in_progress",
  "priority": "high",
  "startDate": "2024-01-01",
  "dueDate": "2024-01-31",
  "completedAt": null,
  "createdAt": "2024-01-01T10:00:00Z",
  "updatedAt": "2024-01-15T14:30:00Z",
  "creator": { "id": 1, "username": "john", "displayName": "John Doe" },
  "assignee": { "id": 2, "username": "jane", "displayName": "Jane Smith" },
  "checklist": [
    { "id": 1, "title": "Collect data", "isCompleted": true, "order": 1, "completedBy": 2, "completedAt": "2024-01-10T10:00:00Z" },
    { "id": 2, "title": "Review numbers", "isCompleted": false, "order": 2 }
  ]
}
```

### Checklist Item Object

```json
{
  "id": 1,
  "taskId": 1,
  "title": "Collect data",
  "isCompleted": true,
  "order": 1,
  "completedBy": 2,
  "completedAt": "2024-01-10T10:00:00Z",
  "createdAt": "2024-01-01T10:00:00Z",
  "updatedAt": "2024-01-10T10:00:00Z"
}
```

## 10. Implementation Phases

### Phase 4A - Backend Core (Week 1)
- Task model + migration
- Checklist model + migration
- Task CRUD endpoints
- Checklist CRUD endpoints
- Authorization middleware

### Phase 4B - Backend Advanced (Week 2)
- Task assignment endpoint
- Status transition validation
- Task filtering/search
- Pagination
- TaskMembers table (optional)

### Phase 4C - Frontend Core (Week 3)
- TaskList page
- TaskDetail page
- TaskForm (create/edit)
- Checklist component

### Phase 4D - Frontend Advanced (Week 4)
- Task filtering/sorting
- Kanban board view (optional)
- MyTasks dashboard
- Integration with Group pages

---

**Document Status**: Design review ready for approval
**Next Step**: Implementation upon approval