import os
import pathlib
from datetime import date, datetime, timedelta, timezone
from typing import List, Literal, Optional

import sqlalchemy as sa
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.responses import FileResponse, JSONResponse
from modules.study import setup_study_module

app = FastAPI(title="fos backend")

DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
FRONTEND_ORIGINS = os.getenv("FRONTEND_ORIGINS")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN")
if FRONTEND_ORIGINS:
    ALLOW_ORIGINS = [origin.strip() for origin in FRONTEND_ORIGINS.split(",") if origin.strip()]
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

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if DATABASE_URL:
    engine = sa.create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
    )
else:
    engine = sa.create_engine(
        "sqlite:///./app.db",
        connect_args={"check_same_thread": False},
    )

VALID_STATUSES = {"open", "done"}
VALID_TYPES = {"main", "backlog", "blocked", "deadline"}

metadata = sa.MetaData()
projects = sa.Table(
    "projects",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("title", sa.String(255), nullable=False),
    sa.Column("area", sa.String(20), nullable=False),
    sa.Column("status", sa.String(20), nullable=False, server_default="open"),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
)
daily_notes = sa.Table(
    "daily_notes",
    metadata,
    sa.Column("note_date", sa.Date, primary_key=True),
    sa.Column("content", sa.Text, nullable=False, server_default=""),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
)
tasks = sa.Table(
    "tasks",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("title", sa.String(255), nullable=False),
    sa.Column("details", sa.Text, nullable=False, server_default=""),
    sa.Column("area", sa.String(20), nullable=False),
    sa.Column("status", sa.String(20), nullable=False),
    sa.Column("task_type", sa.String(20), nullable=False),
    sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("follow_up_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("planned_for", sa.Date, nullable=True),
    sa.Column("today_position", sa.Integer, nullable=True),
    sa.Column(
        "project_id",
        sa.Integer,
        sa.ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    ),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
)

setup_study_module(app, engine, metadata)


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1)
    area: Literal["work", "life"]
    status: Literal["open", "done"] = "open"


class ProjectUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    area: Optional[Literal["work", "life"]] = None
    status: Optional[Literal["open", "done"]] = None


class ProjectOut(BaseModel):
    id: int
    title: str
    area: Literal["work", "life"]
    status: Literal["open", "done"]
    created_at: datetime
    updated_at: datetime


class TaskCreate(BaseModel):
    title: str = Field(min_length=1)
    details: str = ""
    area: Literal["work", "life"]
    status: Literal["open", "done"] = "open"
    task_type: Literal["main", "backlog", "blocked", "deadline"] = "backlog"
    due_at: Optional[datetime] = None
    follow_up_at: Optional[datetime] = None
    planned_for: Optional[date] = None
    today_position: Optional[int] = None
    project_id: Optional[int] = None
    completed_at: Optional[datetime] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    details: Optional[str] = None
    area: Optional[Literal["work", "life"]] = None
    status: Optional[Literal["open", "done"]] = None
    task_type: Optional[Literal["main", "backlog", "blocked", "deadline"]] = None
    due_at: Optional[datetime] = None
    follow_up_at: Optional[datetime] = None
    planned_for: Optional[date] = None
    today_position: Optional[int] = None
    project_id: Optional[int] = None
    completed_at: Optional[datetime] = None


class TaskOut(BaseModel):
    id: int
    title: str
    details: str
    area: Literal["work", "life"]
    status: Literal["open", "done"]
    task_type: Literal["main", "backlog", "blocked", "deadline"]
    due_at: Optional[datetime] = None
    follow_up_at: Optional[datetime] = None
    planned_for: Optional[date] = None
    today_position: Optional[int] = None
    project_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class DailyNoteUpdate(BaseModel):
    content: str = ""


class DailyNoteOut(BaseModel):
    note_date: date
    content: str
    updated_at: datetime


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def map_old_status(value: Optional[str]) -> str:
    if value == "done" or value == "archived":
        return "done"
    return "open"


def map_old_type(row) -> str:
    current = row.get("task_type")
    if current in VALID_TYPES:
        return current
    if current == "focus":
        return "main"

    old_engagement = row.get("engagement")
    if old_engagement == "waiting":
        return "blocked"
    if old_engagement == "parked":
        return "backlog"
    if row.get("due_at") is not None:
        return "deadline"
    if row.get("status") == "inbox":
        return "backlog"
    return "main"


def row_to_project(row) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "area": row.area,
        "status": row.status,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def row_to_task(row) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "details": row.details or "",
        "area": row.area,
        "status": row.status,
        "task_type": "main" if row.task_type == "focus" else row.task_type,
        "due_at": row.due_at,
        "follow_up_at": row.follow_up_at,
        "planned_for": row.planned_for,
        "today_position": row.today_position,
        "project_id": row.project_id,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "completed_at": row.completed_at,
    }


def row_to_daily_note(row) -> dict:
    return {
        "note_date": row.note_date,
        "content": row.content or "",
        "updated_at": row.updated_at,
    }


def normalize_area_task_type(area: str, task_type: str) -> str:
    if area == "life" and task_type == "main":
        return "backlog"
    return task_type


def get_next_today_position(conn, area: str, task_type: str, exclude_task_id: Optional[int] = None) -> int:
    query = sa.select(sa.func.max(tasks.c.today_position)).where(
        tasks.c.area == area,
        tasks.c.task_type == task_type,
        tasks.c.status == "open",
    )

    if exclude_task_id is not None:
        query = query.where(tasks.c.id != exclude_task_id)

    current_max = conn.execute(query).scalar_one()
    return (current_max or 0) + 1


def get_task_or_404(conn, task_id: int):
    row = conn.execute(sa.select(tasks).where(tasks.c.id == task_id)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return row


def get_project_or_404(conn, project_id: int):
    row = conn.execute(sa.select(projects).where(projects.c.id == project_id)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return row


def ensure_schema():
    inspector = sa.inspect(engine)
    table_names = inspector.get_table_names()

    if "tasks" not in table_names and "projects" not in table_names:
        metadata.create_all(engine)
        return

    task_columns = (
        {column["name"] for column in inspector.get_columns("tasks")}
        if "tasks" in table_names
        else set()
    )
    project_columns = (
        {column["name"] for column in inspector.get_columns("projects")}
        if "projects" in table_names
        else set()
    )
    expected_task_columns = {
        "id",
        "title",
        "details",
        "area",
        "status",
        "task_type",
        "due_at",
        "follow_up_at",
        "planned_for",
        "today_position",
        "project_id",
        "created_at",
        "updated_at",
        "completed_at",
    }
    expected_project_columns = {
        "id",
        "title",
        "area",
        "status",
        "created_at",
        "updated_at",
    }

    needs_task_rebuild = not expected_task_columns.issubset(task_columns)
    needs_project_rebuild = "projects" not in table_names or not expected_project_columns.issubset(project_columns)

    if not needs_task_rebuild and not needs_project_rebuild:
        return

    old_task_rows = []
    old_project_rows = []
    if "tasks" in table_names:
        with engine.begin() as conn:
            old_task_rows = conn.execute(sa.text("SELECT * FROM tasks ORDER BY id")).mappings().all()
    if "projects" in table_names:
        with engine.begin() as conn:
            old_project_rows = conn.execute(sa.text("SELECT * FROM projects ORDER BY id")).mappings().all()

    create_projects_sql = """
    CREATE TABLE projects_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title VARCHAR(255) NOT NULL,
      area VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
    """
    create_tasks_sql = """
    CREATE TABLE tasks_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title VARCHAR(255) NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      area VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL,
      task_type VARCHAR(20) NOT NULL,
      due_at DATETIME,
      follow_up_at DATETIME,
      planned_for DATE,
      today_position INTEGER,
      project_id INTEGER REFERENCES projects_v2(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      completed_at DATETIME
    )
    """
    insert_project_sql = sa.text(
        """
        INSERT INTO projects_v2 (id, title, area, status, created_at, updated_at)
        VALUES (:id, :title, :area, :status, :created_at, :updated_at)
        """
    )
    insert_task_sql = sa.text(
        """
        INSERT INTO tasks_v2 (
          id, title, details, area, status, task_type, due_at, follow_up_at,
          planned_for, today_position, project_id, created_at, updated_at, completed_at
        ) VALUES (
          :id, :title, :details, :area, :status, :task_type, :due_at, :follow_up_at,
          :planned_for, :today_position, :project_id, :created_at, :updated_at, :completed_at
        )
        """
    )

    rows_by_id = {row["id"]: row for row in old_task_rows}

    with engine.begin() as conn:
        conn.execute(sa.text("DROP TABLE IF EXISTS tasks_v2"))
        conn.execute(sa.text("DROP TABLE IF EXISTS projects_v2"))
        conn.execute(sa.text(create_projects_sql))
        conn.execute(sa.text(create_tasks_sql))

        max_project_id = 0
        parent_project_map = {}

        for row in old_project_rows:
            mapped = {
                "id": row["id"],
                "title": row["title"],
                "area": row.get("area") or "work",
                "status": row.get("status") if row.get("status") in VALID_STATUSES else "open",
                "created_at": row.get("created_at") or utcnow(),
                "updated_at": row.get("updated_at") or row.get("created_at") or utcnow(),
            }
            max_project_id = max(max_project_id, mapped["id"])
            conn.execute(insert_project_sql, mapped)

        for row in old_task_rows:
            project_id = row.get("project_id")
            parent_id = row.get("parent_id")

            if parent_id is not None:
                if parent_id not in parent_project_map:
                    parent_row = rows_by_id.get(parent_id)
                    created_at = (
                        (parent_row or {}).get("created_at")
                        or row.get("created_at")
                        or utcnow()
                    )
                    updated_at = (
                        (parent_row or {}).get("updated_at")
                        or created_at
                    )
                    max_project_id += 1
                    conn.execute(
                        insert_project_sql,
                        {
                            "id": max_project_id,
                            "title": (parent_row or {}).get("title") or f"Imported project {parent_id}",
                            "area": (parent_row or {}).get("area") or row.get("area") or "work",
                            "status": "open",
                            "created_at": created_at,
                            "updated_at": updated_at,
                        },
                    )
                    parent_project_map[parent_id] = max_project_id

                project_id = parent_project_map[parent_id]

            area = row.get("area") or "work"
            status = row["status"] if row.get("status") in VALID_STATUSES else map_old_status(row.get("status"))
            task_type = normalize_area_task_type(area, map_old_type(row))
            mapped_task = {
                "id": row["id"],
                "title": row["title"],
                "details": row.get("details") or row.get("notes") or "",
                "area": area,
                "status": status,
                "task_type": task_type,
                "due_at": row.get("due_at") if task_type == "deadline" else None,
                "follow_up_at": row.get("follow_up_at") if task_type == "blocked" else None,
                "planned_for": row.get("planned_for"),
                "today_position": row.get("today_position"),
                "project_id": project_id,
                "created_at": row.get("created_at") or utcnow(),
                "updated_at": row.get("updated_at") or row.get("created_at") or utcnow(),
                "completed_at": row.get("completed_at"),
            }
            conn.execute(insert_task_sql, mapped_task)

        if "tasks" in table_names:
            conn.execute(sa.text("DROP TABLE tasks"))
        if "projects" in table_names:
            conn.execute(sa.text("DROP TABLE projects"))

        conn.execute(sa.text("ALTER TABLE projects_v2 RENAME TO projects"))
        conn.execute(sa.text("ALTER TABLE tasks_v2 RENAME TO tasks"))


def normalize_rows():
    with engine.begin() as conn:
        project_rows = conn.execute(sa.select(projects)).all()
        for row in project_rows:
            title = row.title.strip()
            if not title:
                title = f"Project {row.id}"
            normalized_status = row.status if row.status in VALID_STATUSES else "open"
            if title != row.title or normalized_status != row.status:
                conn.execute(
                    sa.update(projects)
                    .where(projects.c.id == row.id)
                    .values(title=title, status=normalized_status, updated_at=utcnow())
                )

        task_rows = conn.execute(sa.select(tasks)).all()
        for row in task_rows:
            updates = {}
            normalized_status = row.status if row.status in VALID_STATUSES else map_old_status(row.status)
            normalized_type = normalize_area_task_type(row.area, row.task_type if row.task_type in VALID_TYPES else map_old_type(row))

            if normalized_status != row.status:
                updates["status"] = normalized_status
            if normalized_type != row.task_type:
                updates["task_type"] = normalized_type
            if normalized_type != "deadline" and row.due_at is not None:
                updates["due_at"] = None
            if normalized_type != "blocked" and row.follow_up_at is not None:
                updates["follow_up_at"] = None
            if row.status == "done" and row.today_position is not None:
                updates["today_position"] = None

            if row.project_id is not None:
                project = conn.execute(
                    sa.select(projects).where(projects.c.id == row.project_id)
                ).first()
                if project is None:
                    updates["project_id"] = None
                elif project.area != row.area:
                    updates["area"] = project.area
                    updates["task_type"] = normalize_area_task_type(project.area, normalized_type)

            if updates:
                conn.execute(sa.update(tasks).where(tasks.c.id == row.id).values(**updates))


def seed_initial_data():
    with engine.begin() as conn:
        existing_tasks = conn.execute(
            sa.select(sa.func.count()).select_from(tasks)
        ).scalar_one()
        if existing_tasks > 0:
            return

        now = utcnow()
        today = now.date()
        roadmap_result = conn.execute(
            sa.insert(projects).values(
                title="Q2 roadmap",
                area="work",
                status="open",
                created_at=now,
                updated_at=now,
            )
        )
        roadmap_project_id = roadmap_result.inserted_primary_key[0]

        seed_rows = [
            {
                "title": "Prepare Q2 roadmap draft",
                "details": "Turn a loose set of work ideas into a one-page roadmap before the team sync tomorrow.",
                "area": "work",
                "status": "open",
                "task_type": "main",
                "planned_for": today,
                "today_position": 1,
                "project_id": roadmap_project_id,
            },
            {
                "title": "Collect team themes",
                "details": "Pull the recurring asks from the past two weeks of notes.",
                "area": "work",
                "status": "open",
                "task_type": "main",
                "project_id": roadmap_project_id,
            },
            {
                "title": "Draft the one-pager",
                "details": "Limit it to goals, bets, and risks.",
                "area": "work",
                "status": "open",
                "task_type": "main",
                "project_id": roadmap_project_id,
            },
            {
                "title": "Read scheduler code paths",
                "details": "Start with wakeup and run-queue selection. Keep this in Today until the shape is clear.",
                "area": "work",
                "status": "open",
                "task_type": "main",
                "planned_for": today,
                "today_position": 2,
            },
            {
                "title": "Check CI on PR #184",
                "details": "The patch is done, but CI is red. Re-check after infra stabilizes before pushing another guess.",
                "area": "work",
                "status": "open",
                "task_type": "blocked",
                "follow_up_at": now + timedelta(hours=2),
            },
            {
                "title": "File tax extension",
                "details": "Collect last year documents first, then submit before the deadline turns into a problem.",
                "area": "life",
                "status": "open",
                "task_type": "deadline",
                "due_at": now + timedelta(days=4),
            },
            {
                "title": "Interesting blog on Linux memory reclaim",
                "details": "Worth reading, but it should not compete with current work. Keep it accessible and quiet.",
                "area": "work",
                "status": "open",
                "task_type": "backlog",
            },
            {
                "title": "Book dentist appointment",
                "details": "Captured quickly so it does not disappear. Classify it later if needed.",
                "area": "life",
                "status": "open",
                "task_type": "backlog",
            },
        ]

        for row in seed_rows:
            task_values = {
                "due_at": None,
                "follow_up_at": None,
                "planned_for": None,
                "today_position": None,
                "project_id": None,
                "created_at": now,
                "updated_at": now,
                "completed_at": None,
            }
            task_values.update(row)
            conn.execute(
                sa.insert(tasks).values(**task_values)
            )


def apply_project_to_task_values(conn, current_task, values):
    if "project_id" in values:
        if values["project_id"] is None:
            return

        project = get_project_or_404(conn, values["project_id"])
        values["area"] = project.area
        return

    if "area" in values and current_task.project_id is not None:
        current_project = get_project_or_404(conn, current_task.project_id)
        if values["area"] != current_project.area:
            values["project_id"] = None


ensure_schema()
metadata.create_all(engine)
normalize_rows()
seed_initial_data()


@app.get("/api/projects", response_model=List[ProjectOut])
def list_projects():
    with engine.begin() as conn:
        rows = conn.execute(
            sa.select(projects).order_by(projects.c.area, projects.c.updated_at.desc())
        ).all()
    return [row_to_project(row) for row in rows]


@app.post("/api/projects", response_model=ProjectOut)
def create_project(project: ProjectCreate):
    now = utcnow()
    values = project.model_dump()
    values["title"] = values["title"].strip()
    if not values["title"]:
        raise HTTPException(status_code=400, detail="Project title cannot be empty")
    values["status"] = values["status"] if values["status"] in VALID_STATUSES else "open"

    values["created_at"] = now
    values["updated_at"] = now

    with engine.begin() as conn:
        result = conn.execute(sa.insert(projects).values(**values))
        project_id = result.inserted_primary_key[0]
        created = get_project_or_404(conn, project_id)
    return row_to_project(created)


@app.patch("/api/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, update: ProjectUpdate):
    values = update.model_dump(exclude_unset=True)

    if "title" in values:
        values["title"] = values["title"].strip()
        if not values["title"]:
            raise HTTPException(status_code=400, detail="Project title cannot be empty")

    if "status" in values and values["status"] not in VALID_STATUSES:
        values["status"] = "open"

    values["updated_at"] = utcnow()

    with engine.begin() as conn:
        current = get_project_or_404(conn, project_id)

        if "area" in values and values["area"] != current.area:
            project_tasks = conn.execute(
                sa.select(tasks.c.id, tasks.c.task_type).where(tasks.c.project_id == project_id)
            ).all()

            for project_task in project_tasks:
                normalized_task_type = normalize_area_task_type(values["area"], project_task.task_type)
                task_updates = {
                    "area": values["area"],
                    "task_type": normalized_task_type,
                }
                if normalized_task_type != "deadline":
                    task_updates["due_at"] = None
                if normalized_task_type != "blocked":
                    task_updates["follow_up_at"] = None

                conn.execute(
                    sa.update(tasks).where(tasks.c.id == project_task.id).values(**task_updates)
                )

        conn.execute(sa.update(projects).where(projects.c.id == project_id).values(**values))
        updated = get_project_or_404(conn, project_id)

    return row_to_project(updated)


@app.get("/api/tasks", response_model=List[TaskOut])
def list_tasks():
    with engine.begin() as conn:
        rows = conn.execute(
            sa.select(tasks).order_by(tasks.c.updated_at.desc())
        ).all()
    return [row_to_task(row) for row in rows]


@app.get("/api/daily-notes/{note_date}", response_model=DailyNoteOut)
def get_daily_note(note_date: date):
    with engine.begin() as conn:
        row = conn.execute(
            sa.select(daily_notes).where(daily_notes.c.note_date == note_date)
        ).first()

        if row is None:
            now = utcnow()
            return {
                "note_date": note_date,
                "content": "",
                "updated_at": now,
            }

    return row_to_daily_note(row)


@app.put("/api/daily-notes/{note_date}", response_model=DailyNoteOut)
def upsert_daily_note(note_date: date, update: DailyNoteUpdate):
    now = utcnow()
    content = update.content or ""

    with engine.begin() as conn:
        existing = conn.execute(
            sa.select(daily_notes).where(daily_notes.c.note_date == note_date)
        ).first()

        if existing is None:
            conn.execute(
                sa.insert(daily_notes).values(
                    note_date=note_date,
                    content=content,
                    updated_at=now,
                )
            )
        else:
            conn.execute(
                sa.update(daily_notes)
                .where(daily_notes.c.note_date == note_date)
                .values(content=content, updated_at=now)
            )

        saved = conn.execute(
            sa.select(daily_notes).where(daily_notes.c.note_date == note_date)
        ).first()

    return row_to_daily_note(saved)


@app.post("/api/tasks", response_model=TaskOut)
def create_task(task: TaskCreate):
    now = utcnow()
    values = task.model_dump()
    values["title"] = values["title"].strip()
    if not values["title"]:
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    if values["task_type"] != "deadline":
        values["due_at"] = None
    if values["task_type"] != "blocked":
        values["follow_up_at"] = None

    with engine.begin() as conn:
        if values["project_id"] is not None:
            project = get_project_or_404(conn, values["project_id"])
            values["area"] = project.area

        values["task_type"] = normalize_area_task_type(values["area"], values["task_type"])
        if values.get("planned_for") is None and values.get("today_position") is None:
            values["today_position"] = None
        elif values.get("today_position") is None:
            values["today_position"] = get_next_today_position(conn, values["area"], values["task_type"])
        values["created_at"] = now
        values["updated_at"] = now

        if values["status"] == "done" and values["completed_at"] is None:
            values["completed_at"] = now

        result = conn.execute(sa.insert(tasks).values(**values))
        task_id = result.inserted_primary_key[0]
        created = get_task_or_404(conn, task_id)
    return row_to_task(created)


@app.patch("/api/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, update: TaskUpdate):
    values = update.model_dump(exclude_unset=True)

    if "title" in values:
        values["title"] = values["title"].strip()
        if not values["title"]:
            raise HTTPException(status_code=400, detail="Title cannot be empty")

    if "status" in values:
        if values["status"] == "done" and "completed_at" not in values:
            values["completed_at"] = utcnow()
            values["planned_for"] = None
            values["today_position"] = None
        elif values["status"] == "open" and "completed_at" not in values:
            values["completed_at"] = None

    values["updated_at"] = utcnow()

    with engine.begin() as conn:
        current = get_task_or_404(conn, task_id)
        apply_project_to_task_values(conn, current, values)

        effective_area = values.get("area", current.area)
        effective_task_type = values.get("task_type", current.task_type)
        values["task_type"] = normalize_area_task_type(effective_area, effective_task_type)
        category_changed = effective_area != current.area or values["task_type"] != current.task_type

        if "task_type" in values and values["task_type"] != "deadline":
            values.setdefault("due_at", None)
        if "task_type" in values and values["task_type"] != "blocked":
            values.setdefault("follow_up_at", None)
        if values.get("planned_for", current.planned_for) is None:
            values.setdefault("today_position", None)
        elif "today_position" not in values and (
            current.today_position is None or category_changed
        ):
            values["today_position"] = get_next_today_position(
                conn,
                effective_area,
                values["task_type"],
                exclude_task_id=task_id,
            )

        conn.execute(sa.update(tasks).where(tasks.c.id == task_id).values(**values))
        updated = get_task_or_404(conn, task_id)

    return row_to_task(updated)


@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int):
    with engine.begin() as conn:
        current = get_task_or_404(conn, task_id)
        conn.execute(sa.delete(tasks).where(tasks.c.id == task_id))

    return Response(status_code=204)


@app.get("/api/healthz")
def healthz():
    return {"ok": True, "time": utcnow().isoformat()}


dist_dir = pathlib.Path(__file__).parent / "frontend" / "dist"

if dist_dir.exists():
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="frontend")

    @app.exception_handler(404)
    async def spa_fallback(request, exc):
        if request.url.path.startswith("/api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        return FileResponse(dist_dir / "index.html")
