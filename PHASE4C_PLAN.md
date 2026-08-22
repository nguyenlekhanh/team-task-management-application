# Phase 4C: Task Management Frontend - Plan

## Goal
Implement Task Management frontend UI with full CRUD operations, filtering, sorting, pagination, and integration with Group pages.

## Pages

### 1. TaskList Page (`/groups/:groupId/tasks`)
**Purpose**: Display paginated, filterable, sortable list of tasks for a group.

**Features**:
- Task table/cards with: title, status badge, priority badge, assignee avatar/name, due date, created date
- **Filters** (collapsible sidebar or top bar):
  - Status dropdown (todo, in_progress, completed, overdue)
  - Priority dropdown (low, medium, high, urgent)
  - Assignee dropdown (group members)
  - Creator dropdown
  - Search input (title + description)
  - Date range picker (createdAt range)
- **Sorting**: clickable column headers (createdAt, updatedAt, title, status, priority, dueDate)
- **Pagination**: page number, page size selector (10, 20, 50), total count
- **Empty state**: "No tasks found" with "Create Task" button
- **Create Task button** (opens CreateTask modal)

**Role-based visibility**:
- All members: view tasks
- Owner/Admin: see all tasks, can create
- Member: can create tasks

---

### 2. TaskDetail Page (`/groups/:groupId/tasks/:taskId`)
**Purpose**: View and edit a single task with full details.

**Sections**:
1. **Header**: Task title, status badge, priority badge, group name link
2. **Metadata**: creator, assignee (with avatar), createdAt, updatedAt, dueDate, startDate
3. **Description**: markdown-supported description (read/edit)
4. **Checklist** (Phase 5 - placeholder):
   - List of checklist items with checkboxes
   - Add item input
   - Reorder (drag-drop placeholder)
5. **Activity/Comments** (Phase 6 placeholder)

**Actions (role-based)**:
- **Owner/Admin**: Edit, Delete, Assign, Change Status
- **Creator**: Edit, Delete, Change Status
- **Assignee**: Update Status, Add/Complete Checklist
- **Member**: View only, Add/Complete Checklist items

---

### 3. CreateTask Modal (`/groups/:groupId/tasks/new`)
**Trigger**: "Create Task" button on TaskList page

**Form Fields**:
- Title (required, max 200 chars)
- Description (textarea, max 5000 chars)
- Assignee (dropdown: group members, optional)
- Priority (dropdown: low, medium, high, urgent) - default: medium
- Start Date (date picker, optional)
- Due Date (date picker, optional)
- Status: auto-set to "todo"

**Actions**: Cancel, Create Task (POST /api/groups/:groupId/tasks)

---

### 4. EditTask Modal (`/groups/:groupId/tasks/:taskId/edit`)
**Trigger**: Edit button on TaskDetail page (role-gated)

**Form Fields**: Same as CreateTask, pre-filled with current values

**Actions**: Cancel, Save Changes (PUT /api/tasks/:id)

---

### 5. MyTasks Page (`/tasks`)
**Purpose**: Cross-group dashboard showing all tasks assigned to or created by current user.

**Features**:
- Tabs: "Assigned to Me", "Created by Me", "All"
- Same filters/sorting as TaskList
- Group name badge on each task (link to group)
- Quick status update from list

---

## Components

### 1. TaskCard
**Props**: task, onClick, onStatusChange?, onAssign?
**Renders**: Compact card with title, status badge, priority badge, assignee avatar, due date

### 2. TaskFilter
**Props**: filters, onChange, groupMembers
**Renders**: Collapsible filter panel with all filter controls

### 3. TaskStatusBadge
**Props**: status
**Variants**: todo (gray), in_progress (blue), completed (green), overdue (red)

### 4. PriorityBadge
**Props**: priority
**Variants**: low (gray), medium (yellow), high (orange), urgent (red)

### 5. Checklist Component (Phase 5)
**Props**: items, onToggle, onAdd, onReorder, canEdit
**Renders**: Draggable list with checkboxes, inline add, delete buttons

### 5. TaskFilter
**Props**: filters, onChange, groupMembers
**Renders**: Collapsible sidebar or top bar with all filters

---

## API Integration

### Endpoints Used
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/groups/:groupId/tasks` | List tasks with filters, pagination, sorting |
| GET | `/api/tasks/:id` | Get task detail with checklist |
| POST | `/api/groups/:groupId/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| PUT | `/api/tasks/:id/assign` | Assign/reassign task |
| PUT | `/api/tasks/:id/status` | Update task status |

### API Service
Extend `frontend/src/services/api.js`:
```javascript
export const taskApi = {
  list: (groupId, params) => api.get(`/groups/${groupId}/tasks`, { params }),
  get: (id) => api.get(`/tasks/${id}`),
  create: (groupId, data) => api.post(`/groups/${groupId}/tasks`, data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  delete: (id) => api.delete(`/tasks/${id}`),
  assign: (id, data) => api.put(`/tasks/${id}/assign`, data),
  updateStatus: (id, data) => api.put(`/tasks/${id}/status`, data),
}
```

---

## UI Requirements

### Role-Based Actions
| Action | Owner | Admin | Creator | Assignee | Member |
|--------|-------|-------|---------|----------|--------|
| View Task | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Task | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit Task | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete Task | ✅ | ✅* | ✅ | ❌ | ❌ |
| Assign Task | ✅ | ✅ | ❌ | ❌ | ❌ |
| Change Status | ✅ | ✅ | ✅ | ✅ | ❌ |

*Admin cannot delete owner's tasks

### Permission UI
- Hide/disable buttons user cannot access
- Show tooltip on disabled buttons explaining why
- Backend still enforces (frontend is UX only)

---

## Loading/Error States

### Loading
- Skeleton loaders for TaskList and TaskDetail
- Spinner on form submissions
- Optimistic updates for status changes

### Error Handling
- Toast notifications for API errors
- Inline form validation errors
- 401 → redirect to login
- 403 → toast "Permission denied"
- 404 → "Not found" state with back link
- 500 → toast "Server error, please try again"

---

## Testing Checklist

- [ ] `npm run build` succeeds
- [ ] Authentication flow: login → redirect to dashboard → navigate to groups → tasks
- [ ] Task CRUD: create → list → view → edit → delete
- [ ] Permissions: owner/admin/member/assignee all correct
- [ ] Filters: status, priority, assignee, creator, search, date range
- [ ] Pagination: page navigation, limit selector
- [ ] Sorting: all columns, both directions
- [ ] Search: title + description
- [ ] Date range filter
- [ ] Assignee filter dropdown (group members only)
- [ ] Pagination: first/prev/next/last, page size selector
- [ ] Sorting: all columns, both directions
- [ ] Create task modal: validation, submit, close
- [ ] Edit task modal: pre-fill, save, cancel
- [ ] Delete task: confirmation modal
- [ ] Assign task modal: member dropdown, only owner/admin
- [ ] Status update: owner/admin/creator/assignee only
- [ ] Build succeeds: `npm run build` passes

---

## Phase 4C Implementation Order

1. **API Service** - Extend `api.js` with `taskApi`
2. **Types** - TypeScript interfaces for Task, TaskFilters, TaskPagination
3. **API Service** - Add `taskApi` to `services/api.js`
4. **TaskList Page** - Main list with filters, pagination, sorting
3. **TaskDetail Page** - Full task view with actions
4. **CreateTask Modal** - Form with validation
4. **EditTask Modal** - Pre-filled form
5. **TaskFilter Component** - Reusable filter sidebar
5. **TaskCard Component** - Reusable card
5. **TaskFilter** - Reusable filter component
5. **TaskStatusBadge/PriorityBadge** - Badge components
5. **Integration** - Add routes to App.jsx, link from GroupDetail
6. **Permission Helpers** - `canEditTask`, `canDeleteTask`, `canAssignTask`, `canUpdateStatus`
7. **MyTasks Page** - Cross-group dashboard

---

## Dependencies to Install (if needed)
- `lucide-react` for icons (already planned)
- `date-fns` for date formatting
- `react-hook-form` + `zod` for form validation (optional but recommended)

---

## Acceptance Criteria
- [ ] All pages render without console errors
- [ ] All API calls use centralized `api.js` service
- [ ] Role-based permissions enforced on both frontend and backend
- [ ] Loading skeletons shown during data fetch
- [ ] Error toasts shown for failed requests
- [ ] Responsive design (mobile/tablet/desktop)
- [ ] Keyboard navigation works (tab order, enter to submit)
- [ ] Accessibility: ARIA labels, semantic HTML, focus management
- [ ] `npm run build` passes without warnings
- [ ] `npm run dev` starts without errors