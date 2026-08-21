# Team Task Management Application

A collaboration platform combining task management, group communication, and team workflow tracking.

## Project Structure

```
project-root/
├── backend/          # Node.js + Express API server (IMPLEMENTED)
├── frontend/         # React + Vite + TailwindCSS application (IMPLEMENTED)
├── database/         # SQLite migrations
├── PROJECT_PLAN.md   # Project architecture and roadmap
├── PROJECT_PROGRESS.md # Phase tracking document
├── PROJECT_RESULT.md # Implementation verification report
└── README.md         # This document
```

## Getting Started

### Prerequisites

- Node.js >= v20.19.0 (Note: Currently running v18.19.1, sqlite3 may show warnings)
- npm or yarn

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration (JWT_SECRET required)

# Start server
npm run dev  # Development mode with nodemon
# or
npm start    # Production mode
```

Backend will run on `http://localhost:3000`

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server (with API proxy to backend)
npm run dev
```

Frontend will run on `http://localhost:5173` (proxies `/api` to `http://localhost:3000`)

### Frontend Production Build

```bash
cd frontend
npm run build  # Creates optimized build in dist/
npx serve -s dist  # Serve production build
```

### Available Scripts

**Backend:**
- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm test` - Run tests (not implemented)

**Frontend:**
- `npm run dev` - Start Vite development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

### API Endpoints

#### Health Check
```bash
GET http://localhost:3000/api/health

Response:
{
  "status": "ok",
  "timestamp": "2026-...",
  "message": "Server is running"
}
```

#### Authentication
```bash
# Register new user
POST http://localhost:3000/api/auth/register
{
  "username": "testuser",
  "password": "testpass123",
  "displayName": "Test User"
}

# Login
POST http://localhost:3000/api/auth/login
{
  "username": "testuser",
  "password": "testpass123"
}

# Get current user (requires valid JWT token)
GET http://localhost:3000/api/auth/me
Authorization: Bearer <token>

# Logout
POST http://localhost:3000/api/auth/logout
Authorization: Bearer <token>
```

#### User Profile
```bash
# Get profile (requires valid JWT token)
GET http://localhost:3000/api/users/me
Authorization: Bearer <token>

# Update profile (requires valid JWT token)
PUT http://localhost:3000/api/users/me
Authorization: Bearer <token>
{
  "displayName": "New Name",
  "avatarUrl": "https://example.com/avatar.png",
  "onlineStatus": true
}

# Change password (requires valid JWT token)
PUT http://localhost:3000/api/users/me/password
Authorization: Bearer <token>
{
  "currentPassword": "oldpass",
  "newPassword": "newpass123"
}
```

#### Groups
```bash
# Create group (requires valid JWT token)
POST http://localhost:3000/api/groups
Authorization: Bearer <token>
{
  "name": "My Group",
  "description": "Group description",
  "avatarUrl": "https://example.com/avatar.png"
}

# List user's groups (requires valid JWT token)
GET http://localhost:3000/api/groups
Authorization: Bearer <token>

# Get group (requires valid JWT token, must be member)
GET http://localhost:3000/api/groups/1
Authorization: Bearer <token>

# Update group (requires valid JWT token, owner/admin only)
PUT http://localhost:3000/api/groups/1
Authorization: Bearer <token>
{
  "name": "New Name",
  "description": "Updated description"
}

# Delete group (requires valid JWT token, owner only)
DELETE http://localhost:3000/api/groups/1
Authorization: Bearer <token>
```

#### Group Members
```bash
# List group members (requires valid JWT token, must be member)
GET http://localhost:3000/api/groups/1/members
Authorization: Bearer <token>

# Add member (requires valid JWT token, owner/admin only)
POST http://localhost:3000/api/groups/1/members
Authorization: Bearer <token>
{
  "userId": 2,
  "role": "member"
}

# Remove member (requires valid JWT token, owner/admin only, cannot remove owner)
DELETE http://localhost:3000/api/groups/1/members/2
Authorization: Bearer <token>

# Change member role (requires valid JWT token, owner only, cannot change owner)
PUT http://localhost:3000/api/groups/1/members/2
Authorization: Bearer <token>
{
  "role": "admin"
}
```

### Frontend Pages

- **Login** (`/login`) - Username/password authentication
- **Register** (`/register`) - New user registration
- **Dashboard** (`/dashboard`) - Protected route showing user info and backend health status
- **Profile** (`/profile`) - Protected route with Profile Settings and Change Password tabs

## Git Initialization and Workflow

### Initialize Git Repository

```bash
# From project root
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial project structure"

# Add remote origin
git remote add origin <your-repository-url>
```

### Git Ignore Rules

The `.gitignore` file at the project root ignores:

**Node.js:**
- `node_modules/` - Dependencies not tracked in repo
- `package-lock.json` - Generated lock file
- npm/yarn/pnpm logs and temporary files

**Environment:**
- `.env` - Local environment variables (never committed)
- `.env.*` - Any environment file variants
- `!.env.example` - Example file is committed for reference

**Frontend:**
- `dist/`, `build/` - Build output directories
- `.vite/` - Vite development cache
- `coverage/` - Test coverage reports

**Backend:**
- `uploads/` - User uploaded files
- `logs/` - Application logs
- Temporary and runtime files

**Database:**
- `*.sqlite`, `*.sqlite3`, `*.db` - SQLite database files
- `data/` - Generated database files

**IDE:**
- `.vscode/`, `.idea/` - IDE specific settings
- `*.swp`, `*.swo` - Vim swap files

**Operating System:**
- `.DS_Store` - macOS directory metadata
- `Thumbs.db` - Windows directory metadata

**Security:**
- Certificates and private keys should never be committed

### Recommended Commit Workflow

1. **Feature branches**: Create a branch for each feature/bugfix
   ```bash
   git checkout -b feature/username-system
   ```

2. **Commit frequently**: Small, atomic commits
   ```bash
   git add .
   git commit -m "feat: add user registration endpoint"
   ```

3. **Pull before pushing**: Always pull latest changes
   ```bash
   git pull origin main --rebase
   ```

4. **Push and create PR**: Submit feature branch for review
   ```bash
   git push origin feature/username-system
   ```

5. **Never commit**: 
   - `.env` files with real secrets
   - `node_modules/`
   - Database files with production data
   - Build artifacts

## Project Phases

See `PROJECT_PLAN.md` for the complete 9-phase development roadmap with implementation status.

## Technology Stack

- **Frontend**: React 18 + Vite 5 + TailwindCSS 3 (IMPLEMENTED)
- **Backend**: Node.js + Express + Sequelize (IMPLEMENTED)
- **Database**: SQLite (IMPLEMENTED - Users, Groups, GroupMembers tables)
- **Realtime**: Socket.IO (NOT IMPLEMENTED)
- **Authentication**: JWT + bcrypt (IMPLEMENTED)
- **State Management**: React Context API (IMPLEMENTED)
- **HTTP Client**: Axios (IMPLEMENTED)
- **Routing**: React Router DOM v6 (IMPLEMENTED)

(End of file)