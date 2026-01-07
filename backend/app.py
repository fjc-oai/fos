# app.py
import os
import pathlib
from datetime import date, datetime
import random
from typing import List, Literal, Optional

import sqlalchemy as sa
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.responses import FileResponse

app = FastAPI(title="3000r backend")

# --- CORS ---
# Support multiple local dev origins by default; override with FRONTEND_ORIGINS or FRONTEND_ORIGIN
DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
FRONTEND_ORIGINS = os.getenv("FRONTEND_ORIGINS")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN")
if FRONTEND_ORIGINS:
    ALLOW_ORIGINS = [o.strip() for o in FRONTEND_ORIGINS.split(",") if o.strip()]
elif FRONTEND_ORIGIN:
    ALLOW_ORIGINS = [FRONTEND_ORIGIN]
else:
    ALLOW_ORIGINS = DEFAULT_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DB engine: SQLite (default) or Postgres via DATABASE_URL ---

#
DB_MODE: Literal["local", "remote"] = "remote"
if DB_MODE == "remote":
    # Found this from https://console.neon.tech/app/projects/mute-mud-01593984?database=neondb&branchId=br-winter-king-af7p2cux
    DATABASE_URL = "postgresql+psycopg://neondb_owner:npg_9cQhAmEBiZu3@ep-nameless-tree-afsairo6-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    engine = sa.create_engine(
        DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=5
    )
    print(f"Connected to {DATABASE_URL}")
    """
    Test NeonDB locally

    export DATABASE_URL='postgresql+psycopg://USER:PASSWORD@HOST:5432/DB?sslmode=require'
    # still allow your React dev origin locally
    export FRONTEND_ORIGIN='http://localhost:5173'
    uvicorn app:app --reload --port 8000
    # test (creates table in Neon automatically)
    curl -s http://localhost:8000/healthz
    curl -sX POST http://localhost:8000/sessions -H 'content-type: application/json' -d '{"date":"2025-09-04","duration":45}'
    curl -s http://localhost:8000/sessions
    """
else:
    engine = sa.create_engine(
        "sqlite:///./app.db", connect_args={"check_same_thread": False}
    )

# --- Schema ---
metadata = sa.MetaData()
sessions = sa.Table(
    "sessions",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("date", sa.Date, nullable=False),
    sa.Column("duration", sa.Integer, nullable=False),
)
review_sessions = sa.Table(
    "review_sessions",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("date", sa.Date, nullable=False),
    sa.Column("duration", sa.Integer, nullable=False),
)
words = sa.Table(
    "words",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("word", sa.String(255), nullable=False),
    sa.Column("date", sa.Date, nullable=False),
)
word_stats = sa.Table(
    "word_stats",
    metadata,
    sa.Column("word_id", sa.Integer, sa.ForeignKey("words.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("yes_count", sa.Integer, nullable=False, server_default="0"),
    sa.Column("no_count", sa.Integer, nullable=False, server_default="1"),
)
word_examples = sa.Table(
    "word_examples",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("word_id", sa.Integer, sa.ForeignKey("words.id", ondelete="CASCADE"), nullable=False),
    sa.Column("example", sa.Text, nullable=False),
)
# Topics
topics = sa.Table(
    "topics",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("name", sa.String(255), nullable=False),
)
back_schedules = sa.Table(
    "back_schedules",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("name", sa.String(255), nullable=False),
    sa.Column("payload", sa.JSON, nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
)
metadata.create_all(engine)  # CREATE TABLE IF NOT EXISTS


class Session(BaseModel):
    date: date
    duration: int = Field(gt=0, le=1440)


@app.post("/api/sessions", response_model=Session)
def add_session(s: Session):
    print(f"Adding session: {s}")
    with engine.begin() as conn:
        conn.execute(sa.insert(sessions).values(date=s.date, duration=s.duration))
    return s


@app.get("/api/sessions", response_model=List[Session])
def list_sessions():
    with engine.begin() as conn:
        rows = conn.execute(
            sa.select(sessions.c.date, sessions.c.duration).order_by(
                sessions.c.date.desc()
            )
        ).all()
    return [{"date": r.date, "duration": r.duration} for r in rows]


class ReviewSession(BaseModel):
    date: date
    duration: int = Field(gt=0, le=1440)


@app.post("/api/review_sessions", response_model=ReviewSession)
def add_review_session(s: ReviewSession):
    print(f"Adding review session: {s}")
    with engine.begin() as conn:
        conn.execute(sa.insert(review_sessions).values(date=s.date, duration=s.duration))
    return s


@app.get("/api/review_sessions", response_model=List[ReviewSession])
def list_review_sessions():
    with engine.begin() as conn:
        rows = conn.execute(
            sa.select(review_sessions.c.date, review_sessions.c.duration).order_by(
                review_sessions.c.date.desc()
            )
        ).all()
    return [{"date": r.date, "duration": r.duration} for r in rows]


class WordCreate(BaseModel):
    word: str = Field(min_length=1)
    examples: List[str] = Field(min_items=1)
    date: Optional[date] = None


class Word(BaseModel):
    id: int
    word: str
    date: date
    examples: List[str]
    yes_count: int = 0
    no_count: int = 1


@app.post("/api/words", response_model=Word)
def add_word(w: WordCreate):
    valid_examples = [e.strip() for e in w.examples if e and e.strip()]
    chosen_date = w.date or date.today()
    with engine.begin() as conn:
        result = conn.execute(sa.insert(words).values(word=w.word, date=chosen_date))
        inserted_pk = result.inserted_primary_key
        if inserted_pk and len(inserted_pk) > 0:
            new_id = inserted_pk[0]
        else:
            new_id = conn.execute(sa.select(sa.func.max(words.c.id))).scalar_one()
        if valid_examples:
            conn.execute(
                sa.insert(word_examples),
                [{"word_id": new_id, "example": ex} for ex in valid_examples],
            )
        # initialize stats: yes=0, no=1 for new words
        conn.execute(
            sa.insert(word_stats).values(word_id=new_id, yes_count=0, no_count=1)
        )
    return {"id": new_id, "word": w.word, "date": chosen_date, "examples": valid_examples, "yes_count": 0, "no_count": 1}


@app.get("/api/words", response_model=List[Word])
def list_words(start: Optional[date] = None, end: Optional[date] = None):
    # Build base query with optional date range filtering
    stmt = sa.select(words.c.id, words.c.word, words.c.date)
    if start is not None:
        stmt = stmt.where(words.c.date >= start)
    if end is not None:
        stmt = stmt.where(words.c.date <= end)
    stmt = stmt.order_by(words.c.date.desc(), words.c.id.desc())

    with engine.begin() as conn:
        word_rows = conn.execute(stmt).all()
        example_rows = conn.execute(
            sa.select(word_examples.c.word_id, word_examples.c.example)
        ).all()
        stats_rows = conn.execute(
            sa.select(word_stats.c.word_id, word_stats.c.yes_count, word_stats.c.no_count)
        ).all()
    examples_by_word_id = {}
    for word_id, example in example_rows:
        examples_by_word_id.setdefault(word_id, []).append(example)
    stats_by_word_id = {wid: (yes, no) for (wid, yes, no) in stats_rows}
    return [
        {
            "id": r.id,
            "word": r.word,
            "date": r.date,
            "examples": examples_by_word_id.get(r.id, []),
            "yes_count": (stats_by_word_id.get(r.id, (0, 1))[0]),
            "no_count": (stats_by_word_id.get(r.id, (0, 1))[1]),
        }
        for r in word_rows
    ]


class WordReviewUpdate(BaseModel):
    outcome: Literal["yes", "no"]


class WordStats(BaseModel):
    word_id: int
    yes_count: int
    no_count: int


@app.post("/api/word_stats/{word_id}", response_model=WordStats)
def update_word_stats(word_id: int, upd: WordReviewUpdate):
    with engine.begin() as conn:
        # ensure row exists
        exists = conn.execute(
            sa.select(word_stats.c.word_id).where(word_stats.c.word_id == word_id)
        ).first()
        if exists is None:
            conn.execute(sa.insert(word_stats).values(word_id=word_id, yes_count=0, no_count=1))
        if upd.outcome == "yes":
            conn.execute(
                sa.update(word_stats)
                .where(word_stats.c.word_id == word_id)
                .values(yes_count=word_stats.c.yes_count + 1)
            )
        else:
            conn.execute(
                sa.update(word_stats)
                .where(word_stats.c.word_id == word_id)
                .values(no_count=word_stats.c.no_count + 1)
            )
        row = conn.execute(
            sa.select(word_stats.c.yes_count, word_stats.c.no_count).where(
                word_stats.c.word_id == word_id
            )
        ).one()
    return {"word_id": word_id, "yes_count": row.yes_count, "no_count": row.no_count}


class TopicCreate(BaseModel):
    name: str = Field(min_length=1)


class Topic(BaseModel):
    id: int
    name: str


@app.post("/api/topics", response_model=Topic)
def add_topic(t: TopicCreate):
    with engine.begin() as conn:
        result = conn.execute(sa.insert(topics).values(name=t.name))
        inserted_pk = result.inserted_primary_key
        if inserted_pk and len(inserted_pk) > 0:
            new_id = inserted_pk[0]
        else:
            new_id = conn.execute(sa.select(sa.func.max(topics.c.id))).scalar_one()
    return {"id": new_id, "name": t.name}


@app.get("/api/topics", response_model=List[Topic])
def list_topics():
    with engine.begin() as conn:
        rows = conn.execute(
            sa.select(topics.c.id, topics.c.name).order_by(topics.c.id.desc())
        ).all()
    return [{"id": r.id, "name": r.name} for r in rows]


class BackScheduleCreate(BaseModel):
    name: str = Field(min_length=1)
    schedule: dict


class BackSchedule(BaseModel):
    id: int
    name: str
    schedule: dict


@app.post("/api/back_schedules", response_model=BackSchedule)
def add_back_schedule(s: BackScheduleCreate):
    with engine.begin() as conn:
        result = conn.execute(sa.insert(back_schedules).values(name=s.name, payload=s.schedule))
        inserted_pk = result.inserted_primary_key
        if inserted_pk and len(inserted_pk) > 0:
            new_id = inserted_pk[0]
        else:
            new_id = conn.execute(sa.select(sa.func.max(back_schedules.c.id))).scalar_one()
    return {"id": new_id, "name": s.name, "schedule": s.schedule}


@app.get("/api/back_schedules", response_model=List[BackSchedule])
def list_back_schedules():
    with engine.begin() as conn:
        rows = conn.execute(
            sa.select(back_schedules.c.id, back_schedules.c.name, back_schedules.c.payload)
            .order_by(back_schedules.c.id.desc())
        ).all()
    return [{"id": r.id, "name": r.name, "schedule": r.payload} for r in rows]


class BackScheduleUpdate(BaseModel):
    name: Optional[str] = None
    schedule: Optional[dict] = None


@app.put("/api/back_schedules/{sid}", response_model=BackSchedule)
def update_back_schedule(sid: int, upd: BackScheduleUpdate):
    with engine.begin() as conn:
        values = {}
        if upd.name is not None:
            values["name"] = upd.name
        if upd.schedule is not None:
            values["payload"] = upd.schedule
        if values:
            conn.execute(
                sa.update(back_schedules).where(back_schedules.c.id == sid).values(**values)
            )
        row = conn.execute(
            sa.select(back_schedules.c.id, back_schedules.c.name, back_schedules.c.payload).where(back_schedules.c.id == sid)
        ).first()
        if row is None:
            # create if missing and full payload provided
            if upd.name is not None and upd.schedule is not None:
                result = conn.execute(sa.insert(back_schedules).values(name=upd.name, payload=upd.schedule))
                inserted_pk = result.inserted_primary_key
                new_id = inserted_pk[0] if inserted_pk and len(inserted_pk) > 0 else conn.execute(sa.select(sa.func.max(back_schedules.c.id))).scalar_one()
                return {"id": new_id, "name": upd.name, "schedule": upd.schedule}
            else:
                raise ValueError("Schedule not found and insufficient data to create")
    return {"id": row.id, "name": row.name, "schedule": row.payload}


@app.get("/api/healthz")
def healthz():
    return {"ok": True, "time": datetime.utcnow().isoformat()}


# --- Common words service ---
def _sanitize_word_list(words: List[str]) -> List[str]:
    cleaned = []
    for w in words or []:
        if not isinstance(w, str):
            continue
        s = w.strip().lower()
        if s and all(ch.isalpha() or ch in ("'", "-") for ch in s):
            cleaned.append(s)
    # de-duplicate while preserving order
    seen = set()
    result = []
    for w in cleaned:
        if w not in seen:
            seen.add(w)
            result.append(w)
    return result


def _load_common_words_from_file(path: pathlib.Path) -> List[str]:
    try:
        if not path.exists():
            return []
        text = path.read_text(encoding="utf-8", errors="ignore")
        # accept JSON array or newline-delimited
        stripped = text.strip()
        words: List[str]
        if stripped.startswith("["):
            import json
            arr = json.loads(stripped)
            words = [str(x) for x in arr if isinstance(x, (str, int, float))]
        else:
            words = [ln for ln in stripped.splitlines()]
        return _sanitize_word_list(words)
    except Exception:
        return []


COMMON_WORDS_FILE = os.getenv("COMMON_WORDS_FILE") or str((pathlib.Path(__file__).parent / "data" / "common_words.txt"))
_COMMON_WORDS_LIST = _load_common_words_from_file(pathlib.Path(COMMON_WORDS_FILE))


@app.get("/api/common_words", response_model=List[str])
def get_common_words(count: int = 10):
    """
    Return `count` random common English words (no replacement) from the local dataset.
    """
    global _COMMON_WORDS_LIST
    data = _COMMON_WORDS_LIST or []
    if not data:
        return []
    c = max(1, min(int(count or 10), 100))
    if c >= len(data):
        # return a shuffled copy of all if requested more than available
        arr = data[:]
        random.shuffle(arr)
        return arr
    # sample without replacement
    return random.sample(data, c)


dist_dir = pathlib.Path(__file__).parent / "frontend" / "dist"
app.mount("/", StaticFiles(directory=dist_dir, html=True), name="frontend")


# (Optional) explicit SPA fallback for unknown routes:
@app.exception_handler(404)
async def spa_fallback(request, exc):
    # If it's an API path, keep 404; else serve index.html
    if request.url.path.startswith("/api/"):
        return (
            FileResponse(dist_dir / "404.html")
            if (dist_dir / "404.html").exists()
            else FileResponse(dist_dir / "index.html", status_code=404)
        )
    return FileResponse(dist_dir / "index.html")
