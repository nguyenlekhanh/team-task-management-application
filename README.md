# Team Task Management Application

A collaboration platform combining task management, group communication, and team workflow tracking.

## Project Structure

```
project-root/
├── backend/          # Node.js + Express API server
├── frontend/         # React + Vite application
├── database/         # SQLite migrations
├── PROJECT_PLAN.md   # Project architecture and roadmap
├── PROJECT_PROGRESS.md # Phase tracking document
└── README.md         # This document
```

## Getting Started

### Prerequisites

- Node.js >= v20.19.0
- npm or yarn

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Initialize database
npm run migrate:init  # Creates data directory

# Start server
npm run dev  # Development mode with nodemon
# or
npm start  # Production mode
```

Backend will run on `http://localhost:3000`

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend will run on `http://localhost:5173`

### Available Scripts

**Backend:**
- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm test` - Run tests

**Frontend:**
- `npm run dev` - Start Vite development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### API Health Check

```bash
GET http://localhost:3000/api/health

Response:
{
  "status": "ok",
  "timestamp": "2024-...",
  "message": "Server is running"
}
```

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

See `PROJECT_PLAN.md` for the complete 9-phase development roadmap.

## Technology Stack

- **Frontend**: React + Vite + TailwindCSS
- **Backend**: Node.js + Express + Sequelize
- **Database**: SQLite
- **Realtime**: Socket.IO
- **Authentication**: JWT + bcrypt