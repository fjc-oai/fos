import { useCallback, useEffect, useState } from "react";
import "./TodoApp.css";

const API = import.meta.env.VITE_API_URL || "/api";

const PRIMARY_TABS = [
  { id: "today", label: "Today" },
  { id: "all", label: "All Tasks" },
];

const AREA_TABS = [
  { id: "work", label: "Work" },
  { id: "life", label: "Life" },
];

const TYPE_TABS = [
  { id: "main", label: "Main" },
  { id: "blocked", label: "Blocked" },
  { id: "deadline", label: "Deadline" },
  { id: "backlog", label: "Backlog" },
];

const CHECKBACK_OPTIONS = [
  { label: "1h", hours: 1 },
  { label: "2h", hours: 2 },
  { label: "6h", hours: 6 },
  { label: "1d", days: 1 },
  { label: "2d", days: 2 },
];

function TodoApp({ isMobile = false }) {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [primaryTab, setPrimaryTab] = useState("today");
  const [areaTab, setAreaTab] = useState("work");
  const [typeTab, setTypeTab] = useState("main");
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [captureTitle, setCaptureTitle] = useState("");
  const [captureArea, setCaptureArea] = useState("work");
  const [captureTaskType, setCaptureTaskType] = useState(getDefaultCaptureTaskType("work"));
  const [captureProjectId, setCaptureProjectId] = useState("");
  const [todayNoteDraft, setTodayNoteDraft] = useState("");
  const [todayNoteSavedAt, setTodayNoteSavedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isNativeCaptureOpen, setIsNativeCaptureOpen] = useState(false);
  const [showBacklogInAllTasks, setShowBacklogInAllTasks] = useState(false);
  const todayKey = getLocalDateKey(new Date());

  useEffect(() => {
    function handleKeyDown(event) {
      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key.toLowerCase() === "n" && !isTyping) {
        event.preventDefault();
        document.getElementById("quick-capture")?.focus();
      }

      if (event.key === "Escape") {
        setSelectedTaskId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    const maxAttempts = 20;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const [taskResponse, projectResponse, noteResponse] = await Promise.all([
          fetch(`${API}/tasks`),
          fetch(`${API}/projects`),
          fetch(`${API}/daily-notes/${todayKey}`),
        ]);

        if (!taskResponse.ok) {
          throw new Error("Failed to load tasks.");
        }
        if (!projectResponse.ok) {
          throw new Error("Failed to load projects.");
        }

        const [taskData, projectData] = await Promise.all([
          taskResponse.json(),
          projectResponse.json(),
        ]);
        let noteData = { content: "", updated_at: null };
        if (noteResponse.ok) {
          noteData = await noteResponse.json();
        }

        setTasks(taskData.map(fromApiTask));
        setProjects(projectData.map(fromApiProject));
        setTodayNoteDraft(noteData.content || "");
        setTodayNoteSavedAt(noteData.updated_at || null);
        setLoading(false);
        return;
      } catch (fetchError) {
        lastError = fetchError;
        if (attempt < maxAttempts) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, 1000);
          });
        }
      }
    }

    setError(lastError?.message || "Failed to load app data.");
    setLoading(false);
  }, [todayKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function createTask(input) {
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`${API}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiTaskPayload(input)),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response, "Failed to create task."));
      }

      const createdTask = fromApiTask(await response.json());
      setTasks((currentTasks) => [createdTask, ...currentTasks]);
      return createdTask;
    } catch (fetchError) {
      setError(fetchError.message || "Failed to create task.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function patchTask(taskId, patch) {
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`${API}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiTaskPayload(patch)),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response, "Failed to update task."));
      }

      const updatedTask = fromApiTask(await response.json());
      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
      );
      return updatedTask;
    } catch (fetchError) {
      setError(fetchError.message || "Failed to update task.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTask(taskId) {
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`${API}/tasks/${taskId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await getApiError(response, "Failed to delete task."));
      }

      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
      setSelectedTaskId((currentTaskId) => (currentTaskId === taskId ? null : currentTaskId));
      return true;
    } catch (fetchError) {
      setError(fetchError.message || "Failed to delete task.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function createProject(input) {
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`${API}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response, "Failed to create project."));
      }

      const createdProject = fromApiProject(await response.json());
      setProjects((currentProjects) => [createdProject, ...currentProjects]);
      return createdProject;
    } catch (fetchError) {
      setError(fetchError.message || "Failed to create project.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function patchProject(projectId, patch) {
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`${API}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response, "Failed to update project."));
      }

      const updatedProject = fromApiProject(await response.json());
      setProjects((currentProjects) =>
        currentProjects.map((project) => (project.id === updatedProject.id ? updatedProject : project)),
      );
      return updatedProject;
    } catch (fetchError) {
      setError(fetchError.message || "Failed to update project.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function saveTodayNote() {
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`${API}/daily-notes/${todayKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: todayNoteDraft }),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response, "Failed to save today's note."));
      }

      const note = await response.json();
      setTodayNoteDraft(note.content || "");
      setTodayNoteSavedAt(note.updated_at || null);
    } catch (fetchError) {
      setError(fetchError.message || "Failed to save today's note.");
    } finally {
      setIsSaving(false);
    }
  }

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const projectById = projects.reduce((map, project) => {
    map.set(project.id, project);
    return map;
  }, new Map());

  const openTasks = sortTasks(tasks.filter((task) => task.status === "open"), projectById);
  const doneTasks = sortCompletedTasks(tasks.filter((task) => task.status === "done"), projectById);
  const mainTasks = sortTasks(openTasks.filter((task) => task.taskType === "main"), projectById);
  const blockedTasks = sortTasks(openTasks.filter((task) => task.taskType === "blocked"), projectById);
  const deadlineTasks = sortTasks(openTasks.filter((task) => task.taskType === "deadline"), projectById);
  const backlogTasks = sortTasks(openTasks.filter((task) => task.taskType === "backlog"), projectById);
  const workTasks = sortTasks(openTasks.filter((task) => task.area === "work"), projectById);
  const lifeTasks = sortTasks(openTasks.filter((task) => task.area === "life"), projectById);
  const openProjects = sortProjects(projects.filter((project) => project.status === "open"));
  const doneProjects = sortProjects(projects.filter((project) => project.status === "done"));
  const captureProjects = openProjects.filter((project) => project.area === captureArea);

  const todayWorkTasks = sortTasks(
    openTasks.filter(
      (task) =>
        task.plannedFor === todayKey &&
        task.area === "work" &&
        task.taskType !== "blocked" &&
        task.taskType !== "deadline",
    ),
    projectById,
  );
  const todayLifeTasks = sortTodayTasks(
    openTasks.filter(
      (task) =>
        task.plannedFor === todayKey &&
        task.area === "life" &&
        task.taskType !== "blocked" &&
        task.taskType !== "deadline",
    ),
    projectById,
  );
  const blockedTodayTasks = sortTodayTasks(
    blockedTasks.filter(
      (task) => !task.followUpAt || isOnOrBefore(task.followUpAt, getEndOfLocalDay(new Date())),
    ),
    projectById,
  );
  const deadlineTodayTasks = sortTodayTasks(
    deadlineTasks.filter((task) => task.dueAt && isOnOrBefore(task.dueAt, getEndOfLocalDay(new Date()))),
    projectById,
  );
  const todayWorkPlannedTasks = sortTodayTasks(
    openTasks.filter(
      (task) =>
        task.plannedFor === todayKey &&
        task.area === "work" &&
        task.taskType !== "blocked" &&
        task.taskType !== "deadline",
    ),
    projectById,
  );

  const todayWorkSections = [
    { id: "main", title: "Main", tasks: todayWorkPlannedTasks.filter((task) => task.taskType === "main") },
    { id: "blocked", title: "Blocked", tasks: blockedTodayTasks.filter((task) => task.area === "work") },
    { id: "deadline", title: "Deadline", tasks: deadlineTodayTasks.filter((task) => task.area === "work") },
    { id: "backlog", title: "Backlog", tasks: todayWorkPlannedTasks.filter((task) => task.taskType === "backlog") },
  ];
  const todayLifeSections = [
    { id: "blocked", title: "Blocked", tasks: blockedTodayTasks.filter((task) => task.area === "life") },
    { id: "deadline", title: "Deadline", tasks: deadlineTodayTasks.filter((task) => task.area === "life") },
    { id: "backlog", title: "Backlog", tasks: todayLifeTasks.filter((task) => task.taskType === "backlog") },
  ];
  const workSections = [
    { id: "main", title: "Main", tasks: workTasks.filter((task) => task.taskType === "main") },
    { id: "blocked", title: "Blocked", tasks: workTasks.filter((task) => task.taskType === "blocked") },
    { id: "deadline", title: "Deadline", tasks: workTasks.filter((task) => task.taskType === "deadline") },
    { id: "backlog", title: "Backlog", tasks: workTasks.filter((task) => task.taskType === "backlog") },
  ];
  const lifeSections = [
    { id: "blocked", title: "Blocked", tasks: lifeTasks.filter((task) => task.taskType === "blocked") },
    { id: "deadline", title: "Deadline", tasks: lifeTasks.filter((task) => task.taskType === "deadline") },
    { id: "backlog", title: "Backlog", tasks: lifeTasks.filter((task) => task.taskType === "backlog") },
  ];
  const allBacklogTaskCount = backlogTasks.length;
  const allWorkSections = getAllTaskSections(workSections, showBacklogInAllTasks);
  const allLifeSections = getAllTaskSections(lifeSections, showBacklogInAllTasks);
  const todayCount =
    todayWorkTasks.length +
    todayLifeTasks.length +
    blockedTodayTasks.length +
    deadlineTodayTasks.length;
  const closedTodayTasks = doneTasks.filter(
    (task) => task.completedAt && getLocalDateKey(new Date(task.completedAt)) === todayKey,
  );

  async function handleCreateTask(event) {
    event.preventDefault();

    const title = captureTitle.trim();
    if (!title) {
      return;
    }

    const task = await createTask({
      title,
      area: captureArea,
      status: "open",
      taskType: captureTaskType,
      details: "",
      plannedFor: primaryTab === "today" ? todayKey : null,
      projectId: captureProjectId ? Number(captureProjectId) : null,
    });

    if (task) {
      setCaptureTitle("");
      setCaptureTaskType(getDefaultCaptureTaskType(captureArea));
      setCaptureProjectId("");
      setSelectedTaskId(task.id);
      setIsNativeCaptureOpen(false);
    }
  }

  async function handleSetTaskStatus(taskId, status) {
    const patch = { status };
    if (status === "done") {
      patch.plannedFor = null;
    }
    await patchTask(taskId, patch);
  }

  async function handleSetTaskType(taskId, taskType) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    if (task.area === "life" && taskType === "main") {
      return;
    }

    const patch = { taskType };
    if (taskType !== "deadline") {
      patch.dueAt = null;
    }
    if (taskType !== "blocked") {
      patch.followUpAt = null;
    }
    await patchTask(taskId, patch);
  }

  async function handleToggleToday(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    await patchTask(taskId, {
      plannedFor: task.plannedFor === todayKey ? null : todayKey,
      status: task.status === "done" ? "open" : task.status,
    });
  }

  async function handleReorderTodaySection(sectionTasks, draggedTaskId, targetTaskId) {
    if (draggedTaskId === targetTaskId) {
      return;
    }

    const draggedIndex = sectionTasks.findIndex((task) => task.id === draggedTaskId);
    const targetIndex = sectionTasks.findIndex((task) => task.id === targetTaskId);

    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }

    const reorderedTasks = [...sectionTasks];
    const [draggedTask] = reorderedTasks.splice(draggedIndex, 1);
    reorderedTasks.splice(targetIndex, 0, draggedTask);

    const nextPositions = new Map(
      reorderedTasks.map((task, index) => [task.id, index + 1]),
    );

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        nextPositions.has(task.id)
          ? { ...task, todayPosition: nextPositions.get(task.id) }
          : task,
      ),
    );

    setIsSaving(true);
    setError("");

    try {
      const responses = await Promise.all(
        reorderedTasks.map((task, index) =>
          fetch(`${API}/tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ today_position: index + 1 }),
          }),
        ),
      );

      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) {
        throw new Error(await getApiError(failedResponse, "Failed to reorder tasks."));
      }

      const updatedTasks = (await Promise.all(responses.map((response) => response.json()))).map(fromApiTask);
      const updatedTaskMap = new Map(updatedTasks.map((task) => [task.id, task]));
      setTasks((currentTasks) =>
        currentTasks.map((task) => updatedTaskMap.get(task.id) ?? task),
      );
    } catch (fetchError) {
      setError(fetchError.message || "Failed to reorder tasks.");
      await loadData();
    } finally {
      setIsSaving(false);
    }
  }

  const metrics = [
    {
      label: "Selected",
      value: todayWorkTasks.length + todayLifeTasks.length,
      tone: "accent",
    },
    {
      label: "Blocked Today",
      value: blockedTodayTasks.length,
      tone: "neutral",
    },
    {
      label: "Due Today",
      value: deadlineTodayTasks.length,
      tone: deadlineTodayTasks.length > 0 ? "warning" : "neutral",
    },
  ];

  if (isMobile) {
    return (
      <div className="todo-native-shell">
        <header className="todo-native-hero panel-glass">
          <div className="todo-native-hero__copy">
            <p className="eyebrow">External Brain</p>
            <div className="todo-native-hero__row">
              <h1>Today</h1>
              <div className="todo-native-hero__stats" aria-label="Summary">
                <span>{todayCount} today</span>
                <span>{blockedTodayTasks.length} blocked</span>
                <span>{deadlineTodayTasks.length} due</span>
              </div>
            </div>
          </div>
        </header>

        {error ? <div className="status-banner">{error}</div> : null}
        {loading ? <div className="status-banner">Loading tasks...</div> : null}

        <div className="todo-native-stack">
          {primaryTab === "today" ? (
            <>
              <AreaSectionPanel
                emptyState="No work tasks need attention today."
                onReorderSection={handleReorderTodaySection}
                onSelect={setSelectedTaskId}
                onSetStatus={handleSetTaskStatus}
                onToggleToday={handleToggleToday}
                projectById={projectById}
                sections={todayWorkSections}
                selectedTaskId={selectedTaskId}
                title="Work"
                todayKey={todayKey}
              />

              <AreaSectionPanel
                emptyState="No life tasks need attention today."
                onReorderSection={handleReorderTodaySection}
                onSelect={setSelectedTaskId}
                onSetStatus={handleSetTaskStatus}
                onToggleToday={handleToggleToday}
                projectById={projectById}
                sections={todayLifeSections}
                selectedTaskId={selectedTaskId}
                title="Life"
                todayKey={todayKey}
              />
              <DailyNotePanel
                draft={todayNoteDraft}
                isSaving={isSaving}
                onChange={setTodayNoteDraft}
                onSave={saveTodayNote}
                savedAt={todayNoteSavedAt}
              />
            </>
          ) : primaryTab === "all" ? (
            <>
              <BacklogVisibilityToggle
                backlogCount={allBacklogTaskCount}
                onToggle={() => setShowBacklogInAllTasks((current) => !current)}
                showBacklog={showBacklogInAllTasks}
              />
              <AreaSectionPanel
                emptyState="No open work tasks."
                onSelect={setSelectedTaskId}
                onSetStatus={handleSetTaskStatus}
                onToggleToday={handleToggleToday}
                projectById={projectById}
                sections={allWorkSections}
                selectedTaskId={selectedTaskId}
                title="Work"
                todayKey={todayKey}
              />

              <AreaSectionPanel
                emptyState="No open life tasks."
                onSelect={setSelectedTaskId}
                onSetStatus={handleSetTaskStatus}
                onToggleToday={handleToggleToday}
                projectById={projectById}
                sections={allLifeSections}
                selectedTaskId={selectedTaskId}
                title="Life"
                todayKey={todayKey}
              />
            </>
          ) : primaryTab === "done" ? (
            <TaskCollection
              emptyState="No finished tasks yet."
              onDelete={deleteTask}
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onToggleToday={handleToggleToday}
              projectById={projectById}
              selectedTaskId={selectedTaskId}
              tasks={doneTasks}
              title="Done"
              todayKey={todayKey}
            />
          ) : primaryTab === "projects" ? (
            <ProjectsBoard
              doneProjects={doneProjects}
              isSaving={isSaving}
              onCreateProject={createProject}
              onUpdateProject={patchProject}
              openProjects={openProjects}
              taskCountByProjectId={buildTaskCountByProjectId(tasks)}
            />
          ) : primaryTab === "areas" ? (
            <TaskCollection
              emptyState={getAreaEmptyState(areaTab)}
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onToggleToday={handleToggleToday}
              projectById={projectById}
              selectedTaskId={selectedTaskId}
              tasks={areaTab === "work" ? workTasks : lifeTasks}
              title={areaTab === "work" ? "Work" : "Life"}
              todayKey={todayKey}
            />
          ) : (
            <TaskCollection
              emptyState={getTypeEmptyState(typeTab)}
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onToggleToday={handleToggleToday}
              projectById={projectById}
              selectedTaskId={selectedTaskId}
              tasks={getTypeTasks(typeTab, mainTasks, blockedTasks, deadlineTasks, backlogTasks)}
              title={formatTaskType(typeTab)}
              todayKey={todayKey}
            />
          )}
        </div>

        <button
          className="todo-native-compose-button"
          onClick={() => setIsNativeCaptureOpen(true)}
          type="button"
        >
          +
        </button>

        <div className="todo-native-bottom-dock">
          <nav className="todo-native-tabs panel-glass" aria-label="Todo views">
            <button
              className={`todo-native-tab ${primaryTab === "today" ? "todo-native-tab--active" : ""}`}
              onClick={() => setPrimaryTab("today")}
              type="button"
            >
              Today
              <span>{todayCount}</span>
            </button>
            <button
              className={`todo-native-tab ${primaryTab === "all" ? "todo-native-tab--active" : ""}`}
              onClick={() => setPrimaryTab("all")}
              type="button"
            >
              All
              <span>{openTasks.length}</span>
            </button>
            <button
              className={`todo-native-tab ${primaryTab === "done" ? "todo-native-tab--active" : ""}`}
              onClick={() => setPrimaryTab("done")}
              type="button"
            >
              Done
              <span>{doneTasks.length}</span>
            </button>
            <button
              className={`todo-native-tab ${primaryTab === "projects" ? "todo-native-tab--active" : ""}`}
              onClick={() => setPrimaryTab("projects")}
              type="button"
            >
              Projects
              <span>{openProjects.length}</span>
            </button>
          </nav>

          <div className="todo-native-filter-row panel-glass">
            {AREA_TABS.map((subtab) => (
              <button
                key={subtab.id}
                className={`mini-button ${primaryTab === "areas" && areaTab === subtab.id ? "mini-button--active" : ""}`}
                onClick={() => {
                  setPrimaryTab("areas");
                  setAreaTab(subtab.id);
                }}
                type="button"
              >
                {subtab.label}
              </button>
            ))}
            {TYPE_TABS.map((subtab) => (
              <button
                key={subtab.id}
                className={`mini-button ${primaryTab === "types" && typeTab === subtab.id ? "mini-button--active" : ""}`}
                onClick={() => {
                  setPrimaryTab("types");
                  setTypeTab(subtab.id);
                }}
                type="button"
              >
                {formatTaskType(subtab.id)}
              </button>
            ))}
          </div>
        </div>

        {isNativeCaptureOpen ? (
          <div className="todo-native-sheet-backdrop" onClick={() => setIsNativeCaptureOpen(false)}>
            <div className="todo-native-compose-sheet panel-glass" onClick={(event) => event.stopPropagation()}>
              <div className="inspector__header">
                <div>
                  <p className="eyebrow">New task</p>
                  <h3>Quick capture</h3>
                </div>
                <button className="ghost-button" onClick={() => setIsNativeCaptureOpen(false)} type="button">
                  Close
                </button>
              </div>

              <form className="todo-native-capture__form" onSubmit={handleCreateTask}>
                <input
                  id="quick-capture"
                  autoComplete="off"
                  autoFocus
                  className="capture-input"
                  onChange={(event) => setCaptureTitle(event.target.value)}
                  placeholder="Add a task"
                  value={captureTitle}
                />

                <div className="todo-native-capture__row">
                  <select
                    value={captureArea}
                    onChange={(event) => {
                      const nextArea = event.target.value;
                      setCaptureArea(nextArea);
                      setCaptureTaskType(getDefaultCaptureTaskType(nextArea));
                      setCaptureProjectId((current) => {
                        if (!current) {
                          return "";
                        }
                        return openProjects.some(
                          (project) => String(project.id) === current && project.area === nextArea,
                        )
                          ? current
                          : "";
                      });
                    }}
                  >
                    <option value="work">Work</option>
                    <option value="life">Life</option>
                  </select>

                  <select value={captureTaskType} onChange={(event) => setCaptureTaskType(event.target.value)}>
                    {getAvailableTaskTypes(captureArea).map((taskType) => (
                      <option key={taskType} value={taskType}>
                        {formatTaskType(taskType)}
                      </option>
                    ))}
                  </select>
                </div>

                <select value={captureProjectId} onChange={(event) => setCaptureProjectId(event.target.value)}>
                  <option value="">No project</option>
                  {captureProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>

                <button className="primary-button" disabled={isSaving} type="submit">
                  Create task
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {selectedTask ? (
          <div className="todo-native-sheet-backdrop" onClick={() => setSelectedTaskId(null)}>
            <div className="todo-native-sheet" onClick={(event) => event.stopPropagation()}>
              <TaskInspector
                key={`${selectedTask.id}:${selectedTask.updatedAt}`}
                onClose={() => setSelectedTaskId(null)}
                onSetStatus={handleSetTaskStatus}
                onSetTaskType={handleSetTaskType}
                onToggleToday={handleToggleToday}
                onUpdateTask={patchTask}
                projects={projects}
                task={selectedTask}
                todayKey={todayKey}
              />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <h1>External Brain</h1>
          <p className="sidebar-copy">
            Decide today, and let the system carry the rest of the mental load.
          </p>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {PRIMARY_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`nav-item ${primaryTab === tab.id ? "nav-item--active" : ""}`}
              onClick={() => setPrimaryTab(tab.id)}
              type="button"
            >
              <span className="nav-item__copy">
                <span className="nav-item__label">{tab.label}</span>
              </span>
              <span className="nav-item__count">
                {getPrimaryTabCount(tab.id, todayCount, openTasks.length, doneTasks.length)}
              </span>
            </button>
          ))}

          <div className="nav-group">
            <div className="nav-section-row" aria-hidden="true">
              <span className="nav-item__label">Areas</span>
            </div>
            <div className="nav-subtabs" aria-label="Area views">
              {AREA_TABS.map((subtab) => (
                <button
                  key={subtab.id}
                  className={`nav-subitem ${primaryTab === "areas" && areaTab === subtab.id ? "nav-subitem--active" : ""}`}
                  onClick={() => {
                    setPrimaryTab("areas");
                    setAreaTab(subtab.id);
                  }}
                  type="button"
                >
                  <span className="nav-item__copy">
                    <span className="nav-item__label">{subtab.label}</span>
                  </span>
                  <span className="nav-item__count">{subtab.id === "work" ? workTasks.length : lifeTasks.length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="nav-group">
            <div className="nav-section-row" aria-hidden="true">
              <span className="nav-item__label">Types</span>
            </div>
            <div className="nav-subtabs" aria-label="Type views">
              {TYPE_TABS.map((subtab) => (
                <button
                  key={subtab.id}
                  className={`nav-subitem ${primaryTab === "types" && typeTab === subtab.id ? "nav-subitem--active" : ""}`}
                  onClick={() => {
                    setPrimaryTab("types");
                    setTypeTab(subtab.id);
                  }}
                  type="button"
                >
                  <span className="nav-item__copy">
                    <span className="nav-item__label">{subtab.label}</span>
                  </span>
                  <span className="nav-item__count">
                    {getTypeCount(subtab.id, mainTasks, blockedTasks, deadlineTasks, backlogTasks)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            className={`nav-item ${primaryTab === "done" ? "nav-item--active" : ""}`}
            onClick={() => setPrimaryTab("done")}
            type="button"
          >
            <span className="nav-item__copy">
              <span className="nav-item__label">Done</span>
            </span>
            <span className="nav-item__count">{doneTasks.length}</span>
          </button>

          <button
            className={`nav-item ${primaryTab === "projects" ? "nav-item--active" : ""}`}
            onClick={() => setPrimaryTab("projects")}
            type="button"
          >
            <span className="nav-item__copy">
              <span className="nav-item__label">Projects</span>
            </span>
            <span className="nav-item__count">{openProjects.length}</span>
          </button>
        </nav>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <h3 className="workspace-header__title">Overview</h3>
          <div className="metric-strip" aria-label="Summary">
            {metrics.map((metric) => (
              <div key={metric.label} className={`metric-chip metric-chip--${metric.tone}`}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </header>

        {error ? <div className="status-banner">{error}</div> : null}
        {loading ? <div className="status-banner">Loading tasks...</div> : null}

        <section className="capture-panel">
          <form className="capture-form capture-form--compact" onSubmit={handleCreateTask}>
            <input
              id="quick-capture"
              autoComplete="off"
              className="capture-input"
              onChange={(event) => setCaptureTitle(event.target.value)}
              placeholder="Add a task you do not want to hold in your head"
              value={captureTitle}
            />

            <select
              value={captureArea}
              onChange={(event) => {
                const nextArea = event.target.value;
                setCaptureArea(nextArea);
                setCaptureTaskType(getDefaultCaptureTaskType(nextArea));
                setCaptureProjectId((current) => {
                  if (!current) {
                    return "";
                  }
                  return openProjects.some(
                    (project) => String(project.id) === current && project.area === nextArea,
                  )
                    ? current
                    : "";
                });
              }}
            >
              <option value="work">Work</option>
              <option value="life">Life</option>
            </select>

            <select value={captureTaskType} onChange={(event) => setCaptureTaskType(event.target.value)}>
              {getAvailableTaskTypes(captureArea).map((taskType) => (
                <option key={taskType} value={taskType}>
                  {formatTaskType(taskType)}
                </option>
              ))}
            </select>

            <select value={captureProjectId} onChange={(event) => setCaptureProjectId(event.target.value)}>
              <option value="">No project</option>
              {captureProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>

            <button className="primary-button" disabled={isSaving} type="submit">
              Create
            </button>
          </form>
        </section>

        {primaryTab === "today" ? (
          <div className="today-stack">
            <AreaSectionPanel
              emptyState="No work tasks need attention today."
              onReorderSection={handleReorderTodaySection}
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onToggleToday={handleToggleToday}
              projectById={projectById}
              sections={todayWorkSections}
              selectedTaskId={selectedTaskId}
              title="Work"
              todayKey={todayKey}
            />

            <AreaSectionPanel
              emptyState="No life tasks need attention today."
              onReorderSection={handleReorderTodaySection}
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onToggleToday={handleToggleToday}
              projectById={projectById}
              sections={todayLifeSections}
              selectedTaskId={selectedTaskId}
              title="Life"
              todayKey={todayKey}
            />
            <DailyNotePanel
              draft={todayNoteDraft}
              isSaving={isSaving}
              onChange={setTodayNoteDraft}
              onSave={saveTodayNote}
              savedAt={todayNoteSavedAt}
            />

            <TaskCollection
              emptyState="Nothing closed today yet."
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onToggleToday={handleToggleToday}
              projectById={projectById}
              selectedTaskId={selectedTaskId}
              tasks={closedTodayTasks}
              title="Closed today"
              todayKey={todayKey}
            />
          </div>
        ) : primaryTab === "all" ? (
          <div className="today-stack">
            <BacklogVisibilityToggle
              backlogCount={allBacklogTaskCount}
              onToggle={() => setShowBacklogInAllTasks((current) => !current)}
              showBacklog={showBacklogInAllTasks}
            />
            <AreaSectionPanel
              emptyState="No open work tasks."
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onToggleToday={handleToggleToday}
              projectById={projectById}
              sections={allWorkSections}
              selectedTaskId={selectedTaskId}
              title="Work"
              todayKey={todayKey}
            />

            <AreaSectionPanel
              emptyState="No open life tasks."
              onSelect={setSelectedTaskId}
              onSetStatus={handleSetTaskStatus}
              onToggleToday={handleToggleToday}
              projectById={projectById}
              sections={allLifeSections}
              selectedTaskId={selectedTaskId}
              title="Life"
              todayKey={todayKey}
            />
          </div>
        ) : primaryTab === "done" ? (
          <TaskCollection
            emptyState="No finished tasks yet."
            onDelete={deleteTask}
            onSelect={setSelectedTaskId}
            onSetStatus={handleSetTaskStatus}
            onToggleToday={handleToggleToday}
            projectById={projectById}
            selectedTaskId={selectedTaskId}
            tasks={doneTasks}
            title="Done"
            todayKey={todayKey}
          />
        ) : primaryTab === "projects" ? (
          <ProjectsBoard
            doneProjects={doneProjects}
            isSaving={isSaving}
            onCreateProject={createProject}
            onUpdateProject={patchProject}
            openProjects={openProjects}
            taskCountByProjectId={buildTaskCountByProjectId(tasks)}
          />
        ) : primaryTab === "areas" ? (
          <TaskCollection
            emptyState={getAreaEmptyState(areaTab)}
            onSelect={setSelectedTaskId}
            onSetStatus={handleSetTaskStatus}
            onToggleToday={handleToggleToday}
            projectById={projectById}
            selectedTaskId={selectedTaskId}
            tasks={areaTab === "work" ? workTasks : lifeTasks}
            title={areaTab === "work" ? "Work" : "Life"}
            todayKey={todayKey}
          />
        ) : (
          <TaskCollection
            emptyState={getTypeEmptyState(typeTab)}
            onSelect={setSelectedTaskId}
            onSetStatus={handleSetTaskStatus}
            onToggleToday={handleToggleToday}
            projectById={projectById}
            selectedTaskId={selectedTaskId}
            tasks={getTypeTasks(typeTab, mainTasks, blockedTasks, deadlineTasks, backlogTasks)}
            title={formatTaskType(typeTab)}
            todayKey={todayKey}
          />
        )}
      </main>

      <aside className="inspector-shell">
        {selectedTask ? (
          <TaskInspector
            key={`${selectedTask.id}:${selectedTask.updatedAt}`}
            onClose={() => setSelectedTaskId(null)}
            onSetStatus={handleSetTaskStatus}
            onSetTaskType={handleSetTaskType}
            onToggleToday={handleToggleToday}
            onUpdateTask={patchTask}
            projects={projects}
            task={selectedTask}
            todayKey={todayKey}
          />
        ) : (
          <div className="empty-inspector">
            <p className="eyebrow">Detail</p>
            <h3>Select a task</h3>
            <p>Use the center panels to edit details, dates, type, status, and project.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function TaskCollection({
  title,
  emptyState,
  tasks,
  projectById,
  todayKey,
  selectedTaskId,
  onSelect,
  onToggleToday,
  onSetStatus,
  onDelete,
}) {
  return (
    <section className="panel">
      <header className="panel__header">
        <h3>{title}</h3>
        <span className="panel__count">{tasks.length}</span>
      </header>

      {tasks.length > 0 ? (
        <div className="panel__body">
          {tasks.map((task) => (
            <TaskCard
              isSelected={selectedTaskId === task.id}
              key={task.id}
              onDelete={onDelete ? () => onDelete(task.id) : null}
              onSelect={() => onSelect(task.id)}
              onSetStatus={(status) => onSetStatus(task.id, status)}
              onToggleToday={() => onToggleToday(task.id)}
              project={task.projectId ? projectById.get(task.projectId) ?? null : null}
              task={task}
              todayKey={todayKey}
            />
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <p>{emptyState}</p>
        </div>
      )}
    </section>
  );
}

function AreaSectionPanel({
  title,
  sections,
  emptyState,
  projectById,
  todayKey,
  selectedTaskId,
  onSelect,
  onToggleToday,
  onSetStatus,
  onReorderSection,
}) {
  const visibleSections = sections.filter((section) => section.tasks.length > 0);
  const taskCount = sections.reduce((count, section) => count + section.tasks.length, 0);

  return (
    <section className="panel">
      <header className="panel__header">
        <h3>{title}</h3>
        <span className="panel__count">{taskCount}</span>
      </header>

      {visibleSections.length > 0 ? (
        <div className="today-area-panel__sections">
          {visibleSections.map((section) => (
            <section className="today-area-panel__section" key={section.id}>
              <div className="today-area-panel__section-header">
                <h4>{section.title}</h4>
                <span className="today-area-panel__section-count">{section.tasks.length}</span>
              </div>
              <div className="panel__body">
                {section.tasks.map((task) => (
                  <TaskCard
                    isSelected={selectedTaskId === task.id}
                    key={task.id}
                    onDelete={null}
                    onReorderDrop={
                      onReorderSection && section.tasks.length > 1
                        ? (draggedTaskId, targetTaskId) =>
                            onReorderSection(section.tasks, draggedTaskId, targetTaskId)
                        : null
                    }
                    onSelect={() => onSelect(task.id)}
                    onSetStatus={(status) => onSetStatus(task.id, status)}
                    onToggleToday={() => onToggleToday(task.id)}
                    project={task.projectId ? projectById.get(task.projectId) ?? null : null}
                    task={task}
                    todayKey={todayKey}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <p>{emptyState}</p>
        </div>
      )}
    </section>
  );
}

function BacklogVisibilityToggle({ backlogCount, showBacklog, onToggle }) {
  if (backlogCount < 1) {
    return null;
  }

  return (
    <div className="list-toolbar">
      <button className={`mini-button ${showBacklog ? "mini-button--active" : ""}`} onClick={onToggle} type="button">
        {showBacklog ? "Hide backlog" : "Show backlog"}
      </button>
      <span className="panel__meta">
        {backlogCount} backlog {backlogCount === 1 ? "task" : "tasks"} {showBacklog ? "shown" : "hidden"}
      </span>
    </div>
  );
}

function TaskCard({
  task,
  project,
  isSelected,
  todayKey,
  onSelect,
  onToggleToday,
  onSetStatus,
  onReorderDrop,
  onDelete,
}) {
  const statusTone = getTimingTone(task);
  const isPlannedToday = task.plannedFor === todayKey;
  const isReorderable = Boolean(onReorderDrop);
  const [isDropTarget, setIsDropTarget] = useState(false);

  return (
    <article
      className={`task-card ${isSelected ? "task-card--selected" : ""} ${
        isReorderable ? "task-card--reorderable" : ""
      } ${isDropTarget ? "task-card--drop-target" : ""}`}
      draggable={isReorderable}
      onClick={onSelect}
      onDragEnd={() => setIsDropTarget(false)}
      onDragLeave={() => setIsDropTarget(false)}
      onDragOver={(event) => {
        if (!isReorderable) {
          return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsDropTarget(true);
      }}
      onDragStart={(event) => {
        if (!isReorderable) {
          return;
        }

        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(task.id));
      }}
      onDrop={(event) => {
        if (!isReorderable) {
          return;
        }

        event.preventDefault();
        setIsDropTarget(false);
        const draggedTaskId = Number(event.dataTransfer.getData("text/plain"));
        if (Number.isNaN(draggedTaskId)) {
          return;
        }
        onReorderDrop(draggedTaskId, task.id);
      }}
    >
      <div className="task-card__topline">
        <h4>{formatTaskTitle(task, project)}</h4>
        <div className="task-card__topline-actions">
          <button
            className="ghost-button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleToday();
            }}
            type="button"
          >
            {isPlannedToday ? "Defer" : "Today"}
          </button>
          <button
            className="ghost-button"
            onClick={(event) => {
              event.stopPropagation();
              onSetStatus(task.status === "done" ? "open" : "done");
            }}
            type="button"
          >
            {task.status === "done" ? "Reopen" : "Close"}
          </button>
          {onDelete ? (
            <button
              className="ghost-button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              type="button"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>

      <div className="task-card__meta">
        {task.dueAt ? (
          <span className={`task-card__meta-pill task-card__meta-pill--${statusTone}`}>
            Due {formatDueDate(task.dueAt)}
          </span>
        ) : null}
        {task.followUpAt ? (
          <span className="task-card__meta-pill">Check {formatRelativeMoment(task.followUpAt)}</span>
        ) : null}
      </div>
    </article>
  );
}

function TaskInspector({
  task,
  projects,
  todayKey,
  onClose,
  onUpdateTask,
  onToggleToday,
  onSetStatus,
  onSetTaskType,
}) {
  const [draft, setDraft] = useState(createDraft(task));

  async function saveField(fieldName, value) {
    await onUpdateTask(task.id, { [fieldName]: value });
  }

  async function saveDraft() {
    await onUpdateTask(task.id, {
      title: draft.title.trim() || task.title,
      details: draft.details,
      dueAt: task.taskType === "deadline" ? localDateToIso(draft.dueDate) : task.dueAt,
    });
  }

  async function handleClose() {
    await saveDraft();
    onClose?.();
  }

  const availableTaskTypes = getAvailableTaskTypes(task.area);
  const areaProjects = sortProjects(
    projects.filter(
      (project) =>
        project.area === task.area &&
        (project.status === "open" || project.id === task.projectId),
    ),
  );

  return (
    <div className="inspector">
      <div className="inspector__header">
        <div>
          <p className="eyebrow">Task detail</p>
          <h3>{task.title}</h3>
        </div>
        <button className="ghost-button" onClick={handleClose} type="button">
          Close
        </button>
      </div>

      <div className="field-group">
        <label className="field">
          <span>Title</span>
          <input
            onBlur={() => saveField("title", draft.title.trim() || task.title)}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            value={draft.title}
          />
        </label>
      </div>

      <div className="field-grid">
        <div className="field-group">
          <span className="field-group__label">Area</span>
          <div className="segmented-control">
            {["work", "life"].map((area) => (
              <button
                key={area}
                className={`segmented-control__button ${task.area === area ? "segmented-control__button--active" : ""}`}
                onClick={() => saveField("area", area)}
                type="button"
              >
                {area}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <span className="field-group__label">Status</span>
          <div className="segmented-control">
            {["open", "done"].map((status) => (
              <button
                key={status}
                className={`segmented-control__button ${task.status === status ? "segmented-control__button--active" : ""}`}
                onClick={() => onSetStatus(task.id, status)}
                type="button"
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="field-group">
        <span className="field-group__label">Type</span>
        <div
          className={`segmented-control ${
            availableTaskTypes.length === 4 ? "segmented-control--four-up" : "segmented-control--three-up"
          }`}
        >
          {availableTaskTypes.map((taskType) => (
            <button
              key={taskType}
              className={`segmented-control__button ${task.taskType === taskType ? "segmented-control__button--active" : ""}`}
              onClick={() => onSetTaskType(task.id, taskType)}
              type="button"
            >
              {formatTaskType(taskType)}
            </button>
          ))}
        </div>
      </div>

      <div className="field-group">
        <label className="field">
          <span>Project</span>
          <select
            onChange={(event) => {
              const value = event.target.value;
              saveField("projectId", value ? Number(value) : null);
            }}
            value={task.projectId ?? ""}
          >
            <option value="">No project</option>
            {areaProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.status === "done" ? `${project.title} (closed)` : project.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {task.taskType === "deadline" ? (
        <div className="field-group">
          <label className="field">
            <span>Due date</span>
            <input
              onBlur={() => saveField("dueAt", localDateToIso(draft.dueDate))}
              onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
              type="date"
              value={draft.dueDate}
            />
          </label>
        </div>
      ) : null}

      {task.taskType === "blocked" ? (
        <div className="field-group">
          <span className="field-group__label">Check back</span>
          <div className="segmented-control segmented-control--five-up">
            {CHECKBACK_OPTIONS.map((option) => (
              <button
                key={option.label}
                className="segmented-control__button"
                onClick={() => saveField("followUpAt", createFollowUpIso(option))}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {task.followUpAt ? (
            <p className="field-help">
              Current check back: {formatRelativeMoment(task.followUpAt)}
            </p>
          ) : null}
          {task.followUpAt ? (
            <button
              className="ghost-button ghost-button--inline"
              onClick={() => saveField("followUpAt", null)}
              type="button"
            >
              Clear check back
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="field-group">
        <button
          className={`secondary-button ${task.plannedFor === todayKey ? "secondary-button--active" : ""}`}
          onClick={() => onToggleToday(task.id)}
          type="button"
        >
          {task.plannedFor === todayKey ? "Remove from Today" : "Pull into Today"}
        </button>
      </div>

      <div className="field-group">
        <label className="field">
          <span>Details</span>
          <textarea
            onBlur={() => saveField("details", draft.details)}
            onChange={(event) => setDraft((current) => ({ ...current, details: event.target.value }))}
            placeholder="Keep all context here."
            rows={7}
            value={draft.details}
          />
        </label>
      </div>
    </div>
  );
}

function DailyNotePanel({ draft, onChange, onSave, isSaving, savedAt }) {
  return (
    <section className="panel">
      <header className="panel__header">
        <h3>Today notes</h3>
        {savedAt ? <span className="panel__meta">Saved {formatSavedTime(savedAt)}</span> : null}
      </header>

      <div className="daily-note-panel">
        <textarea
          onChange={(event) => onChange(event.target.value)}
          placeholder="Write down notes, outcomes, or anything you want to remember from today."
          rows={6}
          value={draft}
        />
        <div className="daily-note-panel__actions">
          <button
            className="primary-button"
            disabled={isSaving}
            onClick={onSave}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
    </section>
  );
}

function ProjectsBoard({ openProjects, doneProjects, taskCountByProjectId, onCreateProject, onUpdateProject, isSaving }) {
  const [projectTitle, setProjectTitle] = useState("");
  const [projectArea, setProjectArea] = useState("work");

  async function handleCreateProject(event) {
    event.preventDefault();
    const title = projectTitle.trim();
    if (!title) {
      return;
    }

    const created = await onCreateProject({
      title,
      area: projectArea,
      status: "open",
    });

    if (created) {
      setProjectTitle("");
    }
  }

  return (
    <div className="today-stack">
      <section className="capture-panel">
        <form className="capture-form capture-form--compact project-form" onSubmit={handleCreateProject}>
          <input
            autoComplete="off"
            className="capture-input"
            onChange={(event) => setProjectTitle(event.target.value)}
            placeholder="Create a project"
            value={projectTitle}
          />
          <select value={projectArea} onChange={(event) => setProjectArea(event.target.value)}>
            <option value="work">Work</option>
            <option value="life">Life</option>
          </select>
          <button className="primary-button" disabled={isSaving || !projectTitle.trim()} type="submit">
            Create
          </button>
        </form>
      </section>

      <ProjectCollection
        emptyState="No open projects."
        onUpdateProject={onUpdateProject}
        projects={openProjects}
        taskCountByProjectId={taskCountByProjectId}
        title="Open projects"
      />

      <ProjectCollection
        emptyState="No closed projects."
        onUpdateProject={onUpdateProject}
        projects={doneProjects}
        taskCountByProjectId={taskCountByProjectId}
        title="Closed projects"
      />
    </div>
  );
}

function ProjectCollection({ title, projects, emptyState, taskCountByProjectId, onUpdateProject }) {
  return (
    <section className="panel">
      <header className="panel__header">
        <h3>{title}</h3>
        <span className="panel__count">{projects.length}</span>
      </header>

      {projects.length > 0 ? (
        <div className="panel__body">
          {projects.map((project) => (
            <article className="project-card" key={project.id}>
              <div className="task-card__topline">
                <h4>{project.title}</h4>
                <div className="task-card__topline-actions">
                  <button
                    className="ghost-button"
                    onClick={() => onUpdateProject(project.id, { status: project.status === "done" ? "open" : "done" })}
                    type="button"
                  >
                    {project.status === "done" ? "Reopen" : "Close"}
                  </button>
                </div>
              </div>
              <div className="task-card__meta">
                <span className="task-card__meta-pill">{project.area}</span>
                <span className="task-card__meta-pill">
                  {taskCountByProjectId.get(project.id) ?? 0} tasks
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <p>{emptyState}</p>
        </div>
      )}
    </section>
  );
}

function createDraft(task) {
  return {
    title: task.title,
    details: task.details,
    dueDate: isoToDateInput(task.dueAt),
  };
}

function fromApiProject(project) {
  return {
    id: project.id,
    title: project.title,
    area: project.area,
    status: project.status,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

function fromApiTask(task) {
  return {
    id: task.id,
    title: task.title,
    details: task.details || "",
    area: task.area,
    status: task.status,
    taskType: task.task_type,
    dueAt: task.due_at,
    followUpAt: task.follow_up_at,
    plannedFor: task.planned_for,
    todayPosition: task.today_position,
    projectId: task.project_id,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
  };
}

function toApiTaskPayload(task) {
  const payload = {};
  if ("title" in task) payload.title = task.title;
  if ("details" in task) payload.details = task.details;
  if ("area" in task) payload.area = task.area;
  if ("status" in task) payload.status = task.status;
  if ("taskType" in task) payload.task_type = task.taskType;
  if ("dueAt" in task) payload.due_at = task.dueAt;
  if ("followUpAt" in task) payload.follow_up_at = task.followUpAt;
  if ("plannedFor" in task) payload.planned_for = task.plannedFor;
  if ("todayPosition" in task) payload.today_position = task.todayPosition;
  if ("projectId" in task) payload.project_id = task.projectId;
  if ("completedAt" in task) payload.completed_at = task.completedAt;
  return payload;
}

function getTypeCount(typeTab, mainTasks, blockedTasks, deadlineTasks, backlogTasks) {
  switch (typeTab) {
    case "main":
      return mainTasks.length;
    case "blocked":
      return blockedTasks.length;
    case "deadline":
      return deadlineTasks.length;
    case "backlog":
      return backlogTasks.length;
    default:
      return 0;
  }
}

function getAvailableTaskTypes(area) {
  if (area === "life") {
    return ["blocked", "deadline", "backlog"];
  }
  return ["main", "blocked", "deadline", "backlog"];
}

function getDefaultCaptureTaskType(area) {
  return area === "life" ? "backlog" : "main";
}

function getPrimaryTabCount(tabId, todayCount, openCount, doneCount) {
  switch (tabId) {
    case "today":
      return todayCount;
    case "all":
      return openCount;
    case "done":
      return doneCount;
    default:
      return 0;
  }
}

function getAreaEmptyState(areaTab) {
  switch (areaTab) {
    case "work":
      return "No open work tasks.";
    case "life":
      return "No open life tasks.";
    default:
      return "Nothing here.";
  }
}

function getTypeEmptyState(typeTab) {
  switch (typeTab) {
    case "main":
      return "No main tasks.";
    case "blocked":
      return "No blocked tasks.";
    case "deadline":
      return "No deadlines on the board.";
    case "backlog":
      return "No backlog tasks.";
    default:
      return "Nothing here.";
  }
}

function getTypeTasks(typeTab, mainTasks, blockedTasks, deadlineTasks, backlogTasks) {
  switch (typeTab) {
    case "main":
      return mainTasks;
    case "blocked":
      return blockedTasks;
    case "deadline":
      return deadlineTasks;
    case "backlog":
      return backlogTasks;
    default:
      return mainTasks;
  }
}

function getAllTaskSections(sections, showBacklog) {
  if (showBacklog) {
    return sections;
  }

  return sections.filter((section) => section.id !== "backlog");
}

function formatTaskType(taskType) {
  switch (taskType) {
    case "main":
      return "Main";
    case "blocked":
      return "Blocked";
    case "deadline":
      return "Deadline";
    case "backlog":
      return "Backlog";
    default:
      return taskType;
  }
}

function formatTaskTitle(task, project) {
  if (!project) {
    return task.title;
  }
  return `[${project.title}] ${task.title}`;
}

function formatDueDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function isoToDateInput(value) {
  if (!value) {
    return "";
  }
  return getLocalDateKey(new Date(value));
}

function localDateToIso(value) {
  if (!value) {
    return null;
  }
  return new Date(`${value}T00:00:00`).toISOString();
}

function createFollowUpIso(option) {
  const totalHours = option.days ? option.days * 24 : option.hours;
  return new Date(Date.now() + totalHours * 60 * 60 * 1000).toISOString();
}

function getEndOfLocalDay(date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isOnOrBefore(value, deadline) {
  if (!value) {
    return false;
  }
  return new Date(value).getTime() <= deadline.getTime();
}

function sortTasks(list, projectById = new Map()) {
  return [...list].sort((left, right) => compareTasksByProject(left, right, projectById, "updatedAt"));
}

function sortCompletedTasks(list) {
  return [...list].sort((left, right) => {
    const leftTime = left.completedAt ? new Date(left.completedAt).getTime() : 0;
    const rightTime = right.completedAt ? new Date(right.completedAt).getTime() : 0;

    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function sortTodayTasks(list, projectById = new Map()) {
  return [...list].sort((left, right) => {
    const leftPosition = left.todayPosition ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = right.todayPosition ?? Number.MAX_SAFE_INTEGER;

    if (leftPosition !== rightPosition) {
      return leftPosition - rightPosition;
    }

    return compareTasksByProject(left, right, projectById, "updatedAt");
  });
}

function sortProjects(list) {
  return [...list].sort((left, right) => {
    const leftTime = new Date(left.updatedAt).getTime();
    const rightTime = new Date(right.updatedAt).getTime();
    return rightTime - leftTime;
  });
}

function buildTaskCountByProjectId(tasks) {
  return tasks.reduce((counts, task) => {
    if (task.projectId === null) {
      return counts;
    }

    counts.set(task.projectId, (counts.get(task.projectId) ?? 0) + 1);
    return counts;
  }, new Map());
}

function compareTasksByProject(left, right, projectById, timeField) {
  const leftProject = left.projectId ? projectById.get(left.projectId) ?? null : null;
  const rightProject = right.projectId ? projectById.get(right.projectId) ?? null : null;

  if (leftProject && !rightProject) {
    return -1;
  }
  if (!leftProject && rightProject) {
    return 1;
  }

  if (leftProject && rightProject && leftProject.id !== rightProject.id) {
    const titleCompare = leftProject.title.localeCompare(rightProject.title, undefined, {
      sensitivity: "base",
    });
    if (titleCompare !== 0) {
      return titleCompare;
    }
    return leftProject.id - rightProject.id;
  }

  const leftTime = left[timeField] ? new Date(left[timeField]).getTime() : 0;
  const rightTime = right[timeField] ? new Date(right[timeField]).getTime() : 0;
  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function getTimingTone(task) {
  if (!task.dueAt) {
    return "soft";
  }

  const dueDate = getLocalDateKey(new Date(task.dueAt));
  const today = getLocalDateKey(new Date());
  return dueDate === today ? "warning" : "soft";
}

function formatRelativeMoment(value) {
  const deltaMs = new Date(value).getTime() - Date.now();
  const deltaHours = Math.round(deltaMs / (1000 * 60 * 60));
  const absoluteHours = Math.abs(deltaHours);

  if (absoluteHours >= 24) {
    const days = Math.round(absoluteHours / 24);
    return deltaHours >= 0 ? `in ${days}d` : `${days}d ago`;
  }

  if (absoluteHours === 0) {
    return "now";
  }

  return deltaHours >= 0 ? `in ${absoluteHours}h` : `${absoluteHours}h ago`;
}

function formatSavedTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function getApiError(response, fallback) {
  try {
    const data = await response.json();
    if (data && typeof data.detail === "string") {
      return data.detail;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export default TodoApp;
