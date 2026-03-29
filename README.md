# fos

`fos` is a personal superapp.

The guiding idea comes from the task system that started this repo:

`Decide today, and let the system carry the rest of the mental load.`

The app combines multiple personal workflows under one shell, one backend entrypoint, and one hosted database.

Current sections:

- `todo`
  - the external-brain task system
- `3000r`
  - learning sessions, word review, quiz, topics, and back-mechanic timers

The goal is not a generic productivity suite. The goal is a small set of personal systems that share one home instead of living in separate apps.

## Principle

`fos` is built around a few practical rules:

- reduce cognitive load instead of adding bookkeeping
- make `Today` explicit
- keep one shell, but let each feature keep its own data model
- use one backend entrypoint with feature-specific modules

## Routes

The main routes are:

- `/`
  - `todo` by default
- `/brain`
  - alias for `todo`
- `/learning`
  - `3000r`

## Usage

### todo

Use `todo` for:

- work tasks you want to actively move
- blocked items that need a later check-back
- deadline tasks that are actually date-driven
- backlog capture
- lightweight projects
- daily notes and a `Closed today` summary

Task model:

- `area`: `work` or `life`
- `status`: `open` or `done`
- `task_type`
  - work: `main`, `blocked`, `deadline`, `backlog`
  - life: `blocked`, `deadline`, `backlog`
- optional `project`
- optional `due_at`
- optional `follow_up_at`
- optional `planned_for`

Typical flow:

1. Open `All Tasks`.
2. Pull what matters into `Today`.
3. Work from `Today`.
4. Reorder Today items inside a category by drag and drop.
5. Close tasks as you finish them.
6. Use `Closed today` and `Today notes` as the lightweight daily summary.

### 3000r

Use `3000r` for:

- logging learning sessions
- tracking words and examples
- reviewing words
- taking quizzes
- managing topics
- running back-mechanic timer presets

The shell now matches `todo` more closely, but the learning workflows still keep the original 3000r functionality.

## Commands

The main script is [dev.sh](/Users/fjc/code/todo/dev.sh).

Common commands:

```bash
./dev.sh build
./dev.sh serve
./dev.sh start
```

What they do:

- `build`
  - builds the frontend
  - copies the build output into `backend/frontend/dist`
- `serve`
  - ensures the Python virtualenv exists
  - installs backend dependencies if needed
  - runs the backend in the foreground
- `start`
  - builds the frontend
  - runs the backend in the foreground

### Background commands

Install the wrappers once:

```bash
./dev.sh install-cli
```

That installs both:

- `todo`
- `fos`

under `~/.local/bin`.

If needed, add:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Then you can use:

```bash
fos start
fos stop
fos restart
fos status
fos logs
```

or:

```bash
todo start
todo stop
todo restart
todo status
todo logs
```

Runtime files:

- pid file: [/.runtime/todo.pid](/Users/fjc/code/todo/.runtime/todo.pid)
- log file: [/.runtime/todo.log](/Users/fjc/code/todo/.runtime/todo.log)

## Architecture

### Frontend

Frontend stack:

- React
- Vite
- JSX
- CSS

Frontend structure:

- [frontend/src/App.jsx](/Users/fjc/code/todo/frontend/src/App.jsx)
  - shared `fos` shell and app switcher
- [frontend/src/features/todo/TodoApp.jsx](/Users/fjc/code/todo/frontend/src/features/todo/TodoApp.jsx)
  - `todo`
- [frontend/src/features/learning/LearningApp.jsx](/Users/fjc/code/todo/frontend/src/features/learning/LearningApp.jsx)
  - `3000r`
- [frontend/src/features/learning/Review.jsx](/Users/fjc/code/todo/frontend/src/features/learning/Review.jsx)
- [frontend/src/features/learning/Quiz.jsx](/Users/fjc/code/todo/frontend/src/features/learning/Quiz.jsx)
- [frontend/src/features/learning/backmech](/Users/fjc/code/todo/frontend/src/features/learning/backmech)

### Backend

Backend stack:

- FastAPI
- SQLAlchemy Core
- Postgres on Neon by default
- optional `DATABASE_URL` override

Backend structure:

- [backend/app.py](/Users/fjc/code/todo/backend/app.py)
  - shared entrypoint
  - task/project/daily-note APIs
  - static frontend serving
- [backend/modules/study.py](/Users/fjc/code/todo/backend/modules/study.py)
  - sessions
  - review sessions
  - words
  - topics
  - back schedules
  - common words

## Database

The default backend database is the same Neon/Postgres database that `3000r` used.

Separate tables are used for the different domains:

- task tables
  - `tasks`
  - `projects`
  - `daily_notes`
- learning tables
  - `sessions`
  - `review_sessions`
  - `words`
  - `word_stats`
  - `word_examples`
  - `topics`
  - `back_schedules`
