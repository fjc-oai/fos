import { neon } from "@neondatabase/serverless";
import commonWords from "../features/learning/data/common-words.json";

const DATABASE_URL =
  import.meta.env.VITE_NEON_DATABASE_URL ||
  "postgresql://neondb_owner:npg_9cQhAmEBiZu3@ep-nameless-tree-afsairo6-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const sql = neon(DATABASE_URL, { disableWarningInBrowsers: true });

let schemaReady = null;

export function setupNativeApi() {
  if (
    typeof window === "undefined" ||
    !["capacitor:", "ionic:"].includes(window.location.protocol) ||
    window.__fosNativeApiReady
  ) {
    return;
  }

  window.__fosNativeApiReady = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const requestUrl = getRequestUrl(input);

    if (!requestUrl || !requestUrl.pathname.startsWith("/api/")) {
      return originalFetch(input, init);
    }

    try {
      await ensureSchema();
      return await handleApiRequest(requestUrl, init);
    } catch (error) {
      return jsonResponse(
        { detail: error?.message || "Native API request failed" },
        { status: 500 },
      );
    }
  };
}

function getRequestUrl(input) {
  try {
    if (typeof input === "string") {
      return new URL(input, window.location.origin);
    }

    if (input instanceof URL) {
      return input;
    }

    if (input?.url) {
      return new URL(input.url, window.location.origin);
    }
  } catch {
    return null;
  }

  return null;
}

async function handleApiRequest(url, init = {}) {
  const method = (init.method || "GET").toUpperCase();
  const path = url.pathname;

  if (path === "/api/healthz" && method === "GET") {
    return jsonResponse({ ok: true, time: new Date().toISOString() });
  }

  if (path === "/api/projects" && method === "GET") {
    const rows = await sql`
      SELECT id, title, area, status, created_at, updated_at
      FROM projects
      ORDER BY area ASC, updated_at DESC
    `;
    return jsonResponse(rows);
  }

  if (path === "/api/projects" && method === "POST") {
    const body = await parseBody(init);
    const title = String(body.title || "").trim();
    if (!title) {
      return jsonResponse({ detail: "Project title cannot be empty" }, { status: 400 });
    }

    const [row] = await sql`
      INSERT INTO projects (title, area, status, created_at, updated_at)
      VALUES (
        ${title},
        ${body.area},
        ${VALID_STATUSES.has(body.status) ? body.status : "open"},
        NOW(),
        NOW()
      )
      RETURNING id, title, area, status, created_at, updated_at
    `;
    return jsonResponse(row, { status: 201 });
  }

  const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && method === "PATCH") {
    return jsonResponse(await updateProject(Number(projectMatch[1]), await parseBody(init)));
  }

  if (path === "/api/tasks" && method === "GET") {
    const rows = await sql`
      SELECT
        id,
        title,
        COALESCE(details, '') AS details,
        area,
        status,
        task_type,
        due_at,
        follow_up_at,
        planned_for,
        today_position,
        project_id,
        created_at,
        updated_at,
        completed_at
      FROM tasks
      ORDER BY updated_at DESC
    `;
    return jsonResponse(rows.map(normalizeTaskRow));
  }

  if (path === "/api/tasks" && method === "POST") {
    return jsonResponse(await createTask(await parseBody(init)), { status: 201 });
  }

  const taskMatch = path.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && method === "PATCH") {
    return jsonResponse(await updateTask(Number(taskMatch[1]), await parseBody(init)));
  }

  if (taskMatch && method === "DELETE") {
    await sql`DELETE FROM tasks WHERE id = ${Number(taskMatch[1])}`;
    return new Response(null, { status: 204 });
  }

  const dailyNoteMatch = path.match(/^\/api\/daily-notes\/(\d{4}-\d{2}-\d{2})$/);
  if (dailyNoteMatch && method === "GET") {
    const [row] = await sql`
      SELECT note_date, COALESCE(content, '') AS content, updated_at
      FROM daily_notes
      WHERE note_date = ${dailyNoteMatch[1]}
    `;
    return jsonResponse(
      row || {
        note_date: dailyNoteMatch[1],
        content: "",
        updated_at: new Date().toISOString(),
      },
    );
  }

  if (dailyNoteMatch && method === "PUT") {
    const body = await parseBody(init);
    const [row] = await sql`
      INSERT INTO daily_notes (note_date, content, updated_at)
      VALUES (${dailyNoteMatch[1]}, ${body.content || ""}, NOW())
      ON CONFLICT (note_date)
      DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at
      RETURNING note_date, COALESCE(content, '') AS content, updated_at
    `;
    return jsonResponse(row);
  }

  if (path === "/api/sessions" && method === "GET") {
    const rows = await sql`
      SELECT date, duration
      FROM sessions
      ORDER BY date DESC
    `;
    return jsonResponse(rows);
  }

  if (path === "/api/sessions" && method === "POST") {
    const body = await parseBody(init);
    await sql`INSERT INTO sessions (date, duration) VALUES (${body.date}, ${body.duration})`;
    return jsonResponse({ date: body.date, duration: body.duration }, { status: 201 });
  }

  if (path === "/api/review_sessions" && method === "GET") {
    const rows = await sql`
      SELECT date, duration
      FROM review_sessions
      ORDER BY date DESC
    `;
    return jsonResponse(rows);
  }

  if (path === "/api/review_sessions" && method === "POST") {
    const body = await parseBody(init);
    await sql`INSERT INTO review_sessions (date, duration) VALUES (${body.date}, ${body.duration})`;
    return jsonResponse({ date: body.date, duration: body.duration }, { status: 201 });
  }

  if (path === "/api/words" && method === "GET") {
    return jsonResponse(await listWords(url));
  }

  if (path === "/api/words" && method === "POST") {
    return jsonResponse(await createWord(await parseBody(init)), { status: 201 });
  }

  const wordStatsMatch = path.match(/^\/api\/word_stats\/(\d+)$/);
  if (wordStatsMatch && method === "POST") {
    return jsonResponse(
      await updateWordStats(Number(wordStatsMatch[1]), await parseBody(init)),
    );
  }

  if (path === "/api/topics" && method === "GET") {
    const rows = await sql`
      SELECT id, name
      FROM topics
      ORDER BY id DESC
    `;
    return jsonResponse(rows);
  }

  if (path === "/api/topics" && method === "POST") {
    const body = await parseBody(init);
    const [row] = await sql`
      INSERT INTO topics (name)
      VALUES (${String(body.name || "").trim()})
      RETURNING id, name
    `;
    return jsonResponse(row, { status: 201 });
  }

  if (path === "/api/back_schedules" && method === "GET") {
    const rows = await sql`
      SELECT id, name, payload AS schedule
      FROM back_schedules
      ORDER BY id DESC
    `;
    return jsonResponse(rows);
  }

  if (path === "/api/back_schedules" && method === "POST") {
    const body = await parseBody(init);
    const [row] = await sql`
      INSERT INTO back_schedules (name, payload)
      VALUES (${body.name}, ${JSON.stringify(body.schedule)}::jsonb)
      RETURNING id, name, payload AS schedule
    `;
    return jsonResponse(row, { status: 201 });
  }

  const backScheduleMatch = path.match(/^\/api\/back_schedules\/(\d+)$/);
  if (backScheduleMatch && method === "PUT") {
    return jsonResponse(
      await updateBackSchedule(Number(backScheduleMatch[1]), await parseBody(init)),
    );
  }

  if (path === "/api/common_words" && method === "GET") {
    const count = Math.max(1, Math.min(Number(url.searchParams.get("count")) || 10, 100));
    return jsonResponse(sampleWords(commonWords, count));
  }

  return jsonResponse({ detail: "Not Found" }, { status: 404 });
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = sql.transaction([
      sql`
        CREATE TABLE IF NOT EXISTS projects (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          area VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'open',
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS daily_notes (
          note_date DATE PRIMARY KEY,
          content TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS tasks (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          details TEXT NOT NULL DEFAULT '',
          area VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL,
          task_type VARCHAR(20) NOT NULL,
          due_at TIMESTAMPTZ,
          follow_up_at TIMESTAMPTZ,
          planned_for DATE,
          today_position INTEGER,
          project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          completed_at TIMESTAMPTZ
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS sessions (
          id SERIAL PRIMARY KEY,
          date DATE NOT NULL,
          duration INTEGER NOT NULL
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS review_sessions (
          id SERIAL PRIMARY KEY,
          date DATE NOT NULL,
          duration INTEGER NOT NULL
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS words (
          id SERIAL PRIMARY KEY,
          word VARCHAR(255) NOT NULL,
          date DATE NOT NULL
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS word_stats (
          word_id INTEGER PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
          yes_count INTEGER NOT NULL DEFAULT 0,
          no_count INTEGER NOT NULL DEFAULT 1
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS word_examples (
          id SERIAL PRIMARY KEY,
          word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
          example TEXT NOT NULL
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS topics (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS back_schedules (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `,
    ]);
  }

  return schemaReady;
}

async function updateProject(projectId, body) {
  const [current] = await sql`SELECT id, area FROM projects WHERE id = ${projectId}`;
  if (!current) {
    throw new Error("Project not found");
  }

  const values = { ...body, updated_at: new Date().toISOString() };
  if (typeof values.title === "string") {
    values.title = values.title.trim();
    if (!values.title) {
      throw new Error("Project title cannot be empty");
    }
  }
  if ("status" in values && !VALID_STATUSES.has(values.status)) {
    values.status = "open";
  }

  if (values.area && values.area !== current.area) {
    const projectTasks = await sql`
      SELECT id, task_type
      FROM tasks
      WHERE project_id = ${projectId}
    `;

    await Promise.all(
      projectTasks.map((task) => {
        const taskType = normalizeAreaTaskType(values.area, task.task_type);
        return sql.query(
          `
            UPDATE tasks
            SET
              area = $1,
              task_type = $2,
              due_at = CASE WHEN $2 = 'deadline' THEN due_at ELSE NULL END,
              follow_up_at = CASE WHEN $2 = 'blocked' THEN follow_up_at ELSE NULL END
            WHERE id = $3
          `,
          [values.area, taskType, task.id],
        );
      }),
    );
  }

  const [row] = await runUpdate("projects", "id", projectId, values, [
    "title",
    "area",
    "status",
    "updated_at",
  ]);
  return row;
}

async function createTask(body) {
  const values = { ...body };
  values.title = String(values.title || "").trim();
  if (!values.title) {
    throw new Error("Title cannot be empty");
  }

  if (values.project_id != null) {
    const [project] = await sql`SELECT id, area FROM projects WHERE id = ${values.project_id}`;
    if (!project) {
      throw new Error("Project not found");
    }
    values.area = project.area;
  }

  values.task_type = normalizeAreaTaskType(values.area, values.task_type);
  if (values.task_type !== "deadline") {
    values.due_at = null;
  }
  if (values.task_type !== "blocked") {
    values.follow_up_at = null;
  }
  if (values.planned_for == null && values.today_position == null) {
    values.today_position = null;
  } else if (values.today_position == null) {
    values.today_position = await getNextTodayPosition(values.area, values.task_type);
  }
  if (values.status === "done" && values.completed_at == null) {
    values.completed_at = new Date().toISOString();
  }

  const [row] = await sql`
    INSERT INTO tasks (
      title,
      details,
      area,
      status,
      task_type,
      due_at,
      follow_up_at,
      planned_for,
      today_position,
      project_id,
      created_at,
      updated_at,
      completed_at
    )
    VALUES (
      ${values.title},
      ${values.details || ""},
      ${values.area},
      ${VALID_STATUSES.has(values.status) ? values.status : "open"},
      ${values.task_type},
      ${values.due_at || null},
      ${values.follow_up_at || null},
      ${values.planned_for || null},
      ${values.today_position || null},
      ${values.project_id || null},
      NOW(),
      NOW(),
      ${values.completed_at || null}
    )
    RETURNING *
  `;
  return normalizeTaskRow(row);
}

async function updateTask(taskId, body) {
  const [current] = await sql`SELECT * FROM tasks WHERE id = ${taskId}`;
  if (!current) {
    throw new Error("Task not found");
  }

  const values = { ...body, updated_at: new Date().toISOString() };
  if (typeof values.title === "string") {
    values.title = values.title.trim();
    if (!values.title) {
      throw new Error("Title cannot be empty");
    }
  }

  if ("status" in values) {
    if (values.status === "done" && !("completed_at" in values)) {
      values.completed_at = new Date().toISOString();
      values.planned_for = null;
      values.today_position = null;
    } else if (values.status === "open" && !("completed_at" in values)) {
      values.completed_at = null;
    }
  }

  if ("project_id" in values) {
    if (values.project_id != null) {
      const [project] = await sql`SELECT id, area FROM projects WHERE id = ${values.project_id}`;
      if (!project) {
        throw new Error("Project not found");
      }
      values.area = project.area;
    }
  } else if ("area" in values && current.project_id != null) {
    const [project] = await sql`SELECT id, area FROM projects WHERE id = ${current.project_id}`;
    if (project && values.area !== project.area) {
      values.project_id = null;
    }
  }

  const effectiveArea = values.area || current.area;
  const effectiveTaskType = values.task_type || current.task_type;
  values.task_type = normalizeAreaTaskType(effectiveArea, effectiveTaskType);
  const categoryChanged = effectiveArea !== current.area || values.task_type !== current.task_type;

  if ("task_type" in values && values.task_type !== "deadline") {
    values.due_at = null;
  }
  if ("task_type" in values && values.task_type !== "blocked") {
    values.follow_up_at = null;
  }
  const nextPlannedFor = "planned_for" in values ? values.planned_for : current.planned_for;
  if (nextPlannedFor == null) {
    values.today_position = null;
  } else if (!("today_position" in values) && (current.today_position == null || categoryChanged)) {
    values.today_position = await getNextTodayPosition(effectiveArea, values.task_type, taskId);
  }

  const [row] = await runUpdate("tasks", "id", taskId, values, [
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
    "updated_at",
    "completed_at",
  ]);
  return normalizeTaskRow(row);
}

async function listWords(url) {
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const conditions = [];
  const params = [];

  if (start) {
    params.push(start);
    conditions.push(`w.date >= $${params.length}`);
  }
  if (end) {
    params.push(end);
    conditions.push(`w.date <= $${params.length}`);
  }

  const rows = await sql.query(
    `
      SELECT
        w.id,
        w.word,
        w.date,
        COALESCE(
          json_agg(we.example ORDER BY we.id) FILTER (WHERE we.id IS NOT NULL),
          '[]'
        ) AS examples,
        COALESCE(ws.yes_count, 0) AS yes_count,
        COALESCE(ws.no_count, 1) AS no_count
      FROM words w
      LEFT JOIN word_examples we ON we.word_id = w.id
      LEFT JOIN word_stats ws ON ws.word_id = w.id
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      GROUP BY w.id, ws.yes_count, ws.no_count
      ORDER BY w.date DESC, w.id DESC
    `,
    params,
  );

  return rows;
}

async function createWord(body) {
  const word = String(body.word || "").trim();
  const examples = Array.isArray(body.examples)
    ? body.examples.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  const [createdWord] = await sql`
    INSERT INTO words (word, date)
    VALUES (${word}, ${body.date || toLocalDateKey(new Date())})
    RETURNING id, word, date
  `;

  await sql.transaction([
    ...(examples.length
      ? [
          sql.query(
            `
              INSERT INTO word_examples (word_id, example)
              VALUES ${examples.map((_, index) => `($1, $${index + 2})`).join(", ")}
            `,
            [createdWord.id, ...examples],
          ),
        ]
      : []),
    sql`
      INSERT INTO word_stats (word_id, yes_count, no_count)
      VALUES (${createdWord.id}, 0, 1)
      ON CONFLICT (word_id) DO NOTHING
    `,
  ]);

  return {
    ...createdWord,
    examples,
    yes_count: 0,
    no_count: 1,
  };
}

async function updateWordStats(wordId, body) {
  await sql`
    INSERT INTO word_stats (word_id, yes_count, no_count)
    VALUES (${wordId}, 0, 1)
    ON CONFLICT (word_id) DO NOTHING
  `;

  if (body.outcome === "yes") {
    await sql`
      UPDATE word_stats
      SET yes_count = yes_count + 1
      WHERE word_id = ${wordId}
    `;
  } else {
    await sql`
      UPDATE word_stats
      SET no_count = no_count + 1
      WHERE word_id = ${wordId}
    `;
  }

  const [row] = await sql`
    SELECT word_id, yes_count, no_count
    FROM word_stats
    WHERE word_id = ${wordId}
  `;
  return row;
}

async function updateBackSchedule(scheduleId, body) {
  const values = {};
  if ("name" in body) {
    values.name = body.name;
  }
  if ("schedule" in body) {
    values.payload = JSON.stringify(body.schedule);
  }

  if (Object.keys(values).length) {
    await runUpdate("back_schedules", "id", scheduleId, values, ["name", "payload"]);
  }

  const [row] = await sql`
    SELECT id, name, payload AS schedule
    FROM back_schedules
    WHERE id = ${scheduleId}
  `;

  if (row) {
    return row;
  }

  if (body.name != null && body.schedule != null) {
    const [created] = await sql`
      INSERT INTO back_schedules (name, payload)
      VALUES (${body.name}, ${JSON.stringify(body.schedule)}::jsonb)
      RETURNING id, name, payload AS schedule
    `;
    return created;
  }

  throw new Error("Schedule not found and insufficient data to create");
}

async function getNextTodayPosition(area, taskType, excludeTaskId = null) {
  const rows = await sql.query(
    `
      SELECT MAX(today_position) AS current_max
      FROM tasks
      WHERE area = $1 AND task_type = $2 AND status = 'open'
      ${excludeTaskId == null ? "" : "AND id != $3"}
    `,
    excludeTaskId == null ? [area, taskType] : [area, taskType, excludeTaskId],
  );

  return Number(rows[0]?.current_max || 0) + 1;
}

async function runUpdate(table, idColumn, id, values, allowedColumns) {
  const entries = Object.entries(values).filter(([key]) => allowedColumns.includes(key));
  if (!entries.length) {
    return sql.query(`SELECT * FROM ${table} WHERE ${idColumn} = $1`, [id]);
  }

  const assignments = entries
    .map(([key], index) => `${key} = $${index + 1}`)
    .join(", ");
  const params = [...entries.map(([, value]) => value), id];

  return sql.query(
    `
      UPDATE ${table}
      SET ${assignments}
      WHERE ${idColumn} = $${params.length}
      RETURNING *
    `,
    params,
  );
}

function normalizeAreaTaskType(area, taskType) {
  if (area === "life" && taskType === "main") {
    return "backlog";
  }
  return taskType;
}

function normalizeTaskRow(row) {
  return {
    ...row,
    details: row.details || "",
    task_type: row.task_type === "focus" ? "main" : row.task_type,
  };
}

async function parseBody(init) {
  if (!init.body) {
    return {};
  }

  if (typeof init.body === "string") {
    return JSON.parse(init.body);
  }

  return {};
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
}

function sampleWords(words, count) {
  const source = Array.isArray(words) ? [...words] : [];
  for (let index = source.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [source[index], source[swapIndex]] = [source[swapIndex], source[index]];
  }
  return source.slice(0, Math.min(count, source.length));
}

function toLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const VALID_STATUSES = new Set(["open", "done"]);
