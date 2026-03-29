import json
import os
import pathlib
import random
from datetime import date
from typing import List, Literal, Optional

import sqlalchemy as sa
from pydantic import BaseModel, Field


def setup_study_module(app, engine, metadata):
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
        sa.Column(
            "word_id",
            sa.Integer,
            sa.ForeignKey("words.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("yes_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("no_count", sa.Integer, nullable=False, server_default="1"),
    )
    word_examples = sa.Table(
        "word_examples",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "word_id",
            sa.Integer,
            sa.ForeignKey("words.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("example", sa.Text, nullable=False),
    )
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

    class Session(BaseModel):
        date: date
        duration: int = Field(gt=0, le=1440)

    class ReviewSession(BaseModel):
        date: date
        duration: int = Field(gt=0, le=1440)

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

    class WordReviewUpdate(BaseModel):
        outcome: Literal["yes", "no"]

    class WordStats(BaseModel):
        word_id: int
        yes_count: int
        no_count: int

    class TopicCreate(BaseModel):
        name: str = Field(min_length=1)

    class Topic(BaseModel):
        id: int
        name: str

    class BackScheduleCreate(BaseModel):
        name: str = Field(min_length=1)
        schedule: dict

    class BackSchedule(BaseModel):
        id: int
        name: str
        schedule: dict

    class BackScheduleUpdate(BaseModel):
        name: Optional[str] = None
        schedule: Optional[dict] = None

    def sanitize_word_list(items: List[str]) -> List[str]:
        cleaned = []
        for item in items or []:
            if not isinstance(item, str):
                continue
            value = item.strip().lower()
            if value and all(ch.isalpha() or ch in {"'", "-"} for ch in value):
                cleaned.append(value)

        seen = set()
        result = []
        for item in cleaned:
            if item not in seen:
                seen.add(item)
                result.append(item)
        return result

    def load_common_words() -> List[str]:
        default_path = (
            pathlib.Path(__file__).resolve().parents[2]
            / "frontend"
            / "src"
            / "features"
            / "learning"
            / "data"
            / "common-words.json"
        )
        source_path = pathlib.Path(os.getenv("COMMON_WORDS_FILE", str(default_path)))
        if not source_path.exists():
            return []

        try:
            text = source_path.read_text(encoding="utf-8")
            raw = json.loads(text)
        except Exception:
            return []

        if not isinstance(raw, list):
            return []

        return sanitize_word_list([str(item) for item in raw])

    common_words_list = load_common_words()

    @app.post("/api/sessions", response_model=Session)
    def add_session(session: Session):
        with engine.begin() as conn:
            conn.execute(sa.insert(sessions).values(date=session.date, duration=session.duration))
        return session

    @app.get("/api/sessions", response_model=List[Session])
    def list_sessions():
        with engine.begin() as conn:
            rows = conn.execute(
                sa.select(sessions.c.date, sessions.c.duration).order_by(sessions.c.date.desc())
            ).all()
        return [{"date": row.date, "duration": row.duration} for row in rows]

    @app.post("/api/review_sessions", response_model=ReviewSession)
    def add_review_session(session: ReviewSession):
        with engine.begin() as conn:
            conn.execute(
                sa.insert(review_sessions).values(date=session.date, duration=session.duration)
            )
        return session

    @app.get("/api/review_sessions", response_model=List[ReviewSession])
    def list_review_sessions():
        with engine.begin() as conn:
            rows = conn.execute(
                sa.select(review_sessions.c.date, review_sessions.c.duration).order_by(
                    review_sessions.c.date.desc()
                )
            ).all()
        return [{"date": row.date, "duration": row.duration} for row in rows]

    @app.post("/api/words", response_model=Word)
    def add_word(word_input: WordCreate):
        valid_examples = [item.strip() for item in word_input.examples if item and item.strip()]
        chosen_date = word_input.date or date.today()
        with engine.begin() as conn:
            result = conn.execute(
                sa.insert(words).values(word=word_input.word.strip(), date=chosen_date)
            )
            word_id = result.inserted_primary_key[0]
            if valid_examples:
                conn.execute(
                    sa.insert(word_examples),
                    [{"word_id": word_id, "example": example} for example in valid_examples],
                )
            conn.execute(
                sa.insert(word_stats).values(word_id=word_id, yes_count=0, no_count=1)
            )
        return {
            "id": word_id,
            "word": word_input.word.strip(),
            "date": chosen_date,
            "examples": valid_examples,
            "yes_count": 0,
            "no_count": 1,
        }

    @app.get("/api/words", response_model=List[Word])
    def list_words(start: Optional[date] = None, end: Optional[date] = None):
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
                sa.select(
                    word_stats.c.word_id,
                    word_stats.c.yes_count,
                    word_stats.c.no_count,
                )
            ).all()

        examples_by_word_id = {}
        for word_id, example in example_rows:
            examples_by_word_id.setdefault(word_id, []).append(example)
        stats_by_word_id = {word_id: (yes, no) for word_id, yes, no in stats_rows}

        return [
          {
            "id": row.id,
            "word": row.word,
            "date": row.date,
            "examples": examples_by_word_id.get(row.id, []),
            "yes_count": stats_by_word_id.get(row.id, (0, 1))[0],
            "no_count": stats_by_word_id.get(row.id, (0, 1))[1],
          }
          for row in word_rows
        ]

    @app.post("/api/word_stats/{word_id}", response_model=WordStats)
    def update_word_stats(word_id: int, update: WordReviewUpdate):
        with engine.begin() as conn:
            exists = conn.execute(
                sa.select(word_stats.c.word_id).where(word_stats.c.word_id == word_id)
            ).first()
            if exists is None:
                conn.execute(
                    sa.insert(word_stats).values(word_id=word_id, yes_count=0, no_count=1)
                )
            if update.outcome == "yes":
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

    @app.post("/api/topics", response_model=Topic)
    def add_topic(topic: TopicCreate):
        with engine.begin() as conn:
            result = conn.execute(sa.insert(topics).values(name=topic.name.strip()))
            topic_id = result.inserted_primary_key[0]
        return {"id": topic_id, "name": topic.name.strip()}

    @app.get("/api/topics", response_model=List[Topic])
    def list_topics():
        with engine.begin() as conn:
            rows = conn.execute(
                sa.select(topics.c.id, topics.c.name).order_by(topics.c.id.desc())
            ).all()
        return [{"id": row.id, "name": row.name} for row in rows]

    @app.post("/api/back_schedules", response_model=BackSchedule)
    def add_back_schedule(schedule: BackScheduleCreate):
        with engine.begin() as conn:
            result = conn.execute(
                sa.insert(back_schedules).values(name=schedule.name, payload=schedule.schedule)
            )
            schedule_id = result.inserted_primary_key[0]
        return {"id": schedule_id, "name": schedule.name, "schedule": schedule.schedule}

    @app.get("/api/back_schedules", response_model=List[BackSchedule])
    def list_back_schedules():
        with engine.begin() as conn:
            rows = conn.execute(
                sa.select(
                    back_schedules.c.id,
                    back_schedules.c.name,
                    back_schedules.c.payload,
                ).order_by(back_schedules.c.id.desc())
            ).all()
        return [{"id": row.id, "name": row.name, "schedule": row.payload} for row in rows]

    @app.put("/api/back_schedules/{schedule_id}", response_model=BackSchedule)
    def update_back_schedule(schedule_id: int, update: BackScheduleUpdate):
        with engine.begin() as conn:
            values = {}
            if update.name is not None:
                values["name"] = update.name
            if update.schedule is not None:
                values["payload"] = update.schedule
            if values:
                conn.execute(
                    sa.update(back_schedules)
                    .where(back_schedules.c.id == schedule_id)
                    .values(**values)
                )
            row = conn.execute(
                sa.select(
                    back_schedules.c.id,
                    back_schedules.c.name,
                    back_schedules.c.payload,
                ).where(back_schedules.c.id == schedule_id)
            ).first()

            if row is None:
                if update.name is not None and update.schedule is not None:
                    result = conn.execute(
                        sa.insert(back_schedules).values(
                            name=update.name,
                            payload=update.schedule,
                        )
                    )
                    schedule_id = result.inserted_primary_key[0]
                    return {
                        "id": schedule_id,
                        "name": update.name,
                        "schedule": update.schedule,
                    }
                raise ValueError("Schedule not found and insufficient data to create")

        return {"id": row.id, "name": row.name, "schedule": row.payload}

    @app.get("/api/common_words", response_model=List[str])
    def get_common_words(count: int = 10):
        if not common_words_list:
            return []

        requested = max(1, min(int(count or 10), 100))
        if requested >= len(common_words_list):
            words_copy = common_words_list[:]
            random.shuffle(words_copy)
            return words_copy
        return random.sample(common_words_list, requested)
