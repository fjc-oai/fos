import { useEffect, useMemo, useState } from "react";
import "./App.css";
import TodoApp from "./features/todo/TodoApp.jsx";
import LearningApp from "./features/learning/LearningApp.jsx";

const SECTIONS = [
  {
    id: "brain",
    path: "/",
    aliases: ["/brain"],
    label: "todo",
  },
  {
    id: "learning",
    path: "/learning",
    label: "3000r",
  },
];

function getSectionFromLocation() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const matched = SECTIONS.find(
    (section) => section.path === pathname || section.aliases?.includes(pathname),
  );
  return matched?.id || "home";
}

function navigateTo(path) {
  if (window.location.pathname === path) {
    return;
  }
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function App() {
  const [section, setSection] = useState(getSectionFromLocation());

  useEffect(() => {
    function handlePopState() {
      setSection(getSectionFromLocation());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const currentSection = useMemo(
    () => SECTIONS.find((item) => item.id === section) ?? SECTIONS[0],
    [section],
  );

  useEffect(() => {
    document.title = `${currentSection.label} · fos`;
  }, [currentSection]);

  return (
    <div className="fos-frame">
      <FeatureNav section={section} />
      <main className="fos-content">
        {section === "learning" ? <LearningApp /> : <TodoApp />}
      </main>
    </div>
  );
}

function FeatureNav({ section }) {
  return (
    <header className="fos-topbar panel-glass">
      <div className="fos-topbar__left">
        <div className="fos-brand">
          <span className="fos-brand__name">fos</span>
        </div>
        <nav className="fos-switcher" aria-label="fos apps">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`fos-switcher__item ${
                item.id === section ? "fos-switcher__item--active" : ""
              }`}
              onClick={() => navigateTo(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

export default App;
