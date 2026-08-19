"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Task = {
  id: number;
  time: string;
  label: string;
  note: string;
  tone: "coral" | "blue" | "moss";
  done: boolean;
};

const initialTasks: Task[] = [
  { id: 1, time: "09:00", label: "Design critique", note: "North star review · 45 min", tone: "coral", done: false },
  { id: 2, time: "10:30", label: "Quiet build block", note: "Prototype the handoff · 90 min", tone: "blue", done: false },
  { id: 3, time: "13:30", label: "Walk + field notes", note: "No headphones · 30 min", tone: "moss", done: false },
  { id: 4, time: "15:00", label: "Studio closeout", note: "Decisions, not summaries · 45 min", tone: "coral", done: false },
];

const energies = ["Deep", "Steady", "Light"] as const;

export default function Home() {
  const [tasks, setTasks] = useState(initialTasks);
  const [activeTask, setActiveTask] = useState(2);
  const [energy, setEnergy] = useState<(typeof energies)[number]>("Steady");
  const [focusMode, setFocusMode] = useState(false);
  const [time, setTime] = useState("09:42");
  const [dateLabel, setDateLabel] = useState("WED 19 AUG / DAY 231");
  const appRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Prague",
      }).format(now));
      const parts = new Intl.DateTimeFormat("en-GB", {
        weekday: "short", day: "2-digit", month: "short", timeZone: "Europe/Prague",
      }).formatToParts(now);
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
      const pragueDate = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Prague" }));
      const dayOfYear = Math.floor((pragueDate.getTime() - new Date(pragueDate.getFullYear(), 0, 0).getTime()) / 86_400_000);
      setDateLabel(`${part("weekday").toUpperCase()} ${part("day")} ${part("month").toUpperCase()} / DAY ${dayOfYear}`);
    };
    update();
    appRef.current?.setAttribute("data-ready", "true");
    const interval = window.setInterval(update, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const doneCount = tasks.filter((task) => task.done).length;
  const selected = useMemo(
    () => tasks.find((task) => task.id === activeTask) ?? tasks[0],
    [activeTask, tasks],
  );

  function toggleTask(id: number) {
    setTasks((current) => current.map((task) =>
      task.id === id ? { ...task, done: !task.done } : task,
    ));
  }

  return (
    <main ref={appRef} className={focusMode ? "app is-focusing" : "app"} data-ready="false">
      <header className="topbar">
        <a className="brand" href="#today" aria-label="Luma home">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>LUMA</span>
        </a>
        <nav aria-label="Primary navigation">
          <a className="nav-active" href="#today">Today</a>
          <a href="#atlas">Atlas</a>
          <a href="#notes">Notes</a>
        </nav>
        <div className="top-meta" aria-label={`Local time ${time}`}>
          <span>PRG</span><strong>{time}</strong>
        </div>
      </header>

      <section className="hero" id="today" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow"><span>{dateLabel.slice(0, 3)}</span>{dateLabel.slice(3)}</p>
          <h1 id="page-title">Make room<br />for what<br /><em>matters.</em></h1>
          <p className="intro">
            Luma turns a crowded day into an attention atlas—so the work that
            needs your whole mind gets it.
          </p>
          <div className="energy-control">
            <span id="energy-label">ENERGY /</span>
            <div className="segmented" role="group" aria-labelledby="energy-label">
              {energies.map((item) => (
                <button key={item} type="button" aria-pressed={energy === item} onClick={() => setEnergy(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="atlas-panel" id="atlas">
          <div className="panel-heading"><span>ATTENTION ATLAS</span><span>04 BLOCKS / 04H 30M</span></div>
          <div className="dial-wrap">
            <div className="dial" aria-label={`Current focus: ${selected.label}`}>
              {Array.from({ length: 24 }, (_, index) => (
                <i
                  className={index % 6 === 0 ? "tick tick-major" : "tick"}
                  style={{ "--tick": index } as React.CSSProperties}
                  key={index}
                  aria-hidden="true"
                />
              ))}
              <span className="focus-arc arc-one" aria-hidden="true" />
              <span className="focus-arc arc-two" aria-hidden="true" />
              <span className="focus-arc arc-three" aria-hidden="true" />
              <div className="dial-core">
                <span>NOW / {selected.time}</span>
                <strong>{selected.label}</strong>
                <small>{energy.toUpperCase()} ENERGY</small>
              </div>
            </div>
            <span className="dial-time dial-time-top">06</span>
            <span className="dial-time dial-time-right">12</span>
            <span className="dial-time dial-time-bottom">18</span>
            <span className="dial-time dial-time-left">00</span>
          </div>
          <button type="button" className="focus-button" aria-pressed={focusMode} onClick={() => setFocusMode((value) => !value)}>
            <span aria-hidden="true">{focusMode ? "×" : "↗"}</span>
            {focusMode ? "Leave focus" : "Enter focus"}
          </button>
        </div>
      </section>

      <section className="ledger" id="notes" aria-labelledby="ledger-title">
        <div className="ledger-title-row">
          <div>
            <p className="eyebrow">DAY LEDGER / {doneCount.toString().padStart(2, "0")} OF 04</p>
            <h2 id="ledger-title">Four things.<br />That&apos;s enough.</h2>
          </div>
          <p className="ledger-note">A good day has edges.<br />Protect them.</p>
        </div>
        <ol className="task-list">
          {tasks.map((task, index) => (
            <li key={task.id} className={`${task.done ? "task done" : "task"} ${activeTask === task.id ? "active" : ""}`}>
              <button
                type="button"
                className="task-check"
                aria-label={`${task.done ? "Mark incomplete" : "Mark complete"}: ${task.label}`}
                aria-pressed={task.done}
                onClick={() => toggleTask(task.id)}
              >
                {task.done ? "✓" : String(index + 1).padStart(2, "0")}
              </button>
              <button type="button" className="task-body" onClick={() => setActiveTask(task.id)} aria-pressed={activeTask === task.id}>
                <span className={`task-time ${task.tone}`}>{task.time}</span>
                <strong>{task.label}</strong>
                <small>{task.note}</small>
              </button>
              <span className={`task-swatch ${task.tone}`} aria-hidden="true" />
            </li>
          ))}
        </ol>
      </section>

      <footer><span>LUMA / ATTENTION ATLAS</span><span>LESS, BUT BETTER.</span><a href="#today">BACK TO TOP ↑</a></footer>

      {focusMode && (
        <aside className="focus-stage" aria-live="polite">
          <span className="focus-label">FOCUS / {selected.time}</span>
          <p>{selected.note}</p>
        </aside>
      )}
    </main>
  );
}
