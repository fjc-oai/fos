# fos

`fos` is a superapp for personal assistant workflows.

It combines the systems I use most often into one app:

- `todo` for tasks, projects, and daily planning
- `3000r` for English reading sessions, vocabulary capture, review, and quiz

The goal is not to build a generic productivity product. The goal is to build a personal assistant that reduces mental load and makes repeated workflows fast on both laptop and iPhone.

## Links

- [fos production](https://fos-0vm6.onrender.com/)
- [Render](https://render.com/)
- [Neon](https://neon.com/)
- [UptimeRobot](https://dashboard.uptimerobot.com/monitors/)

## Install fos

### Laptop

Clone the repo, then run:

```bash
./dev.sh start
```

That will:

- build the frontend
- copy it into `backend/frontend/dist`
- create the Python virtualenv if needed
- install backend dependencies
- start FastAPI on `http://localhost:8000`

For background usage:

```bash
./dev.sh install-cli
fos start
fos stop
fos restart
fos status
fos logs
```

### iPhone

The iPhone version is the Safari web app.

1. Start the app on your laptop with `./dev.sh start` or `fos start`
2. Make sure your iPhone is on the same Wi-Fi
3. Open `http://<your-laptop-ip>:8000` in Safari
4. Tap **Share** -> **Add to Home Screen**

For the hosted version, open [fos production](https://fos-0vm6.onrender.com/) in Safari and add it to Home Screen the same way.

## Use fos

### Laptop

Use the top-left switcher to move between `todo` and `3000r`.

Laptop is the best mode for:

- planning today
- editing task details
- reviewing larger task/project lists
- browsing word bank entries

### iPhone

iPhone Safari is optimized for fast capture and review.

iPhone is the best mode for:

- adding tasks quickly
- checking today’s tasks
- logging a reading session
- scanning magazine vocabulary from a photo
- reviewing words
- taking quizzes

## todo

### Motivation

`todo` is built as an external brain for tasks.

The core idea is:

`Decide today, and let the system carry the rest of the mental load.`

It separates what I need to do today from everything else, while still keeping blocked work, deadlines, backlog, and projects in one place.

### Major Usage

- capture tasks into work/life
- plan tasks into `Today`
- track `main`, `blocked`, `deadline`, and `backlog` items
- set follow-up times for blocked tasks
- manage lightweight projects
- write a daily note
- review what was closed today

On iPhone, `todo` uses a mobile-specific layout with a compact header, bottom navigation, and popup task creation.

### Software Architecture

Frontend:

- [frontend/src/features/todo/TodoApp.jsx](/Users/fjc/code/fos/frontend/src/features/todo/TodoApp.jsx)
- [frontend/src/features/todo/TodoApp.css](/Users/fjc/code/fos/frontend/src/features/todo/TodoApp.css)

Backend:

- [backend/app.py](/Users/fjc/code/fos/backend/app.py)

Data model:

- `tasks`
- `projects`
- `daily_notes`

## 3000r

### Motivation

`3000r` is built for English learning through reading.

The main workflow is:

1. read magazines
2. highlight words I do not know
3. scan the page with iPhone
4. extract vocabulary with OpenAI
5. save the word, meaning, and sentence into Word Bank
6. review and quiz later

It is optimized for fast session logging and vocabulary capture, not generic flashcards.

### Major Usage

- quick add a reading session
- start a live timer
- scan a magazine photo to extract highlighted words
- save selected words into Word Bank
- play pronunciation audio
- review by word or meaning
- use hints with meaning + sentence
- quiz words

On iPhone, `3000r` is optimized around quick session logging, scan photo, and review.

### Software Architecture

Frontend:

- [frontend/src/features/learning/LearningApp.jsx](/Users/fjc/code/fos/frontend/src/features/learning/LearningApp.jsx)
- [frontend/src/features/learning/LearningApp.css](/Users/fjc/code/fos/frontend/src/features/learning/LearningApp.css)
- [frontend/src/features/learning/Review.jsx](/Users/fjc/code/fos/frontend/src/features/learning/Review.jsx)
- [frontend/src/features/learning/Quiz.jsx](/Users/fjc/code/fos/frontend/src/features/learning/Quiz.jsx)

Backend:

- [backend/modules/study.py](/Users/fjc/code/fos/backend/modules/study.py)

Data model:

- `sessions`
- `review_sessions`
- `words`
- `word_stats`
- `word_examples`

External services:

- OpenAI for photo vocabulary extraction
- DictionaryAPI.dev for pronunciation audio fallback lookup
- Neon Postgres for hosted database

## Architecture

### Frontend

- React
- Vite
- JSX
- CSS

Shared shell:

- [frontend/src/App.jsx](/Users/fjc/code/fos/frontend/src/App.jsx)
- [frontend/src/App.css](/Users/fjc/code/fos/frontend/src/App.css)

### Backend

- FastAPI
- SQLAlchemy Core
- Postgres on Neon
- static frontend serving from `backend/frontend/dist`

Entrypoints:

- [backend/app.py](/Users/fjc/code/fos/backend/app.py)
- [backend/modules/study.py](/Users/fjc/code/fos/backend/modules/study.py)

## Environment

Backend env vars:

```bash
DATABASE_URL=postgresql+psycopg://...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini
```

See [backend/.env.example](/Users/fjc/code/fos/backend/.env.example).
