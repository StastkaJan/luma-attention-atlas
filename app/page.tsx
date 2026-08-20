"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Tone = "coral" | "blue" | "moss";
type Energy = "Deep" | "Steady" | "Light";
type Task = {
  id: string;
  date: string;
  time: string;
  label: string;
  note: string;
  duration: number;
  tone: Tone;
  done: boolean;
  position: number;
};
type Draft = Pick<Task, "time" | "label" | "note" | "duration" | "tone">;

const emptyDraft: Draft = { time: "09:00", label: "", note: "", duration: 45, tone: "coral" };
const energies: Energy[] = ["Deep", "Steady", "Light"];
const localMode = process.env.NEXT_PUBLIC_STORAGE_MODE === "local";

function readLocalTasks(date: string): Task[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`luma:${date}`) ?? "[]");
    return Array.isArray(value) ? value as Task[] : [];
  } catch {
    return [];
  }
}

function writeLocalTasks(date: string, tasks: Task[]) {
  localStorage.setItem(`luma:${date}`, JSON.stringify(tasks));
}

function pragueDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Prague",
  }).format(date);
}

function shiftDate(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function readableDate(date: string) {
  if (!date) return "TODAY";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "2-digit", month: "short", timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`)).toUpperCase();
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [activeTask, setActiveTask] = useState("");
  const [energy, setEnergy] = useState<Energy>("Steady");
  const [focusMode, setFocusMode] = useState(false);
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [time, setTime] = useState("--:--");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const appRef = useRef<HTMLElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const selectedDateRef = useRef(selectedDate);

  const selected = useMemo(
    () => tasks.find((task) => task.id === activeTask) ?? tasks[0],
    [activeTask, tasks],
  );
  const doneCount = tasks.filter((task) => task.done).length;
  const totalMinutes = tasks.reduce((sum, task) => sum + task.duration, 0);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    const updateTime = () => setTime(new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Prague",
    }).format(new Date()));
    updateTime();
    appRef.current?.setAttribute("data-ready", "true");
    const clock = window.setInterval(updateTime, 30_000);
    const initializeDate = window.setTimeout(() => setSelectedDate(pragueDate()), 0);
    return () => { window.clearInterval(clock); window.clearTimeout(initializeDate); };
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    if (localMode) {
      let current = true;
      queueMicrotask(() => {
        if (!current) return;
        const next = readLocalTasks(selectedDate);
        const nextSelected = next[0];
        setTasks(next);
        setActiveTask(nextSelected?.id ?? "");
        setSecondsLeft((nextSelected?.duration ?? 0) * 60);
        setRunning(false);
        setLoading(false);
      });
      return () => { current = false; };
    }
    const controller = new AbortController();
    let current = true;
    fetch(`/api/tasks?date=${selectedDate}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load this day.");
        return response.json() as Promise<{ tasks: Task[] }>;
      })
      .then(({ tasks: next }) => {
        if (!current) return;
        const nextSelected = next[0];
        setTasks(next);
        setActiveTask(nextSelected?.id ?? "");
        setSecondsLeft((nextSelected?.duration ?? 0) * 60);
        setRunning(false);
      })
      .catch((reason: unknown) => {
        if (current && !(reason instanceof DOMException && reason.name === "AbortError")) setError("Could not load this day. Try again.");
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [selectedDate]);

  useEffect(() => {
    if (!focusMode || !running || secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((current) => {
      if (current <= 1) {
        setRunning(false);
        return 0;
      }
      return current - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [focusMode, running, secondsLeft]);

  useEffect(() => {
    if (!composerOpen) return;
    const background = [...document.querySelectorAll<HTMLElement>("main > :not(.modal-backdrop)")];
    background.forEach((element) => { element.inert = true; });
    labelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setComposerOpen(false);
        return;
      }
      if (event.key !== "Tab" || !composerRef.current) return;
      const focusable = [...composerRef.current.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      background.forEach((element) => { element.inert = false; });
      openerRef.current?.focus();
    };
  }, [composerOpen, editingId]);

  async function request(url: string, init: RequestInit) {
    setError("");
    const response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
    const body = response.status === 204 ? {} : await response.json() as { task?: Task; error?: string };
    if (!response.ok) throw new Error(body.error || "Something went wrong.");
    return body;
  }

  function chooseDate(date: string) {
    setLoading(true);
    setError("");
    setTasks([]);
    setActiveTask("");
    setSecondsLeft(0);
    setRunning(false);
    setFocusMode(false);
    setSelectedDate(date);
  }

  function selectTask(task: Task) {
    setActiveTask(task.id);
    setSecondsLeft(task.duration * 60);
    setRunning(false);
  }

  function openComposer(task?: Task) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingId(task?.id ?? "");
    setDraft(task ? {
      time: task.time, label: task.label, note: task.note, duration: task.duration, tone: task.tone,
    } : { ...emptyDraft, time: tasks.at(-1)?.time ?? emptyDraft.time });
    setComposerOpen(true);
    setDeletingId("");
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const operationDate = selectedDate;
    if (localMode) {
      const previous = tasks.find((task) => task.id === editingId);
      const task: Task = {
        id: editingId || crypto.randomUUID(), date: selectedDate, ...draft,
        done: previous?.done ?? false, position: 0,
      };
      const next = (editingId
        ? tasks.map((item) => item.id === editingId ? task : item)
        : [...tasks, task]).sort((a, b) => a.time.localeCompare(b.time));
      writeLocalTasks(selectedDate, next);
      setTasks(next);
      selectTask(task);
      setComposerOpen(false);
      return;
    }
    try {
      const payload = editingId ? { id: editingId, ...draft } : { date: selectedDate, position: 0, ...draft };
      const { task } = await request("/api/tasks", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      if (!task || selectedDateRef.current !== operationDate) return;
      setTasks((current) => editingId
        ? current.map((item) => item.id === task.id ? task : item)
        : [...current, task].sort((a, b) => a.time.localeCompare(b.time)));
      selectTask(task);
      setComposerOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the block.");
    }
  }

  async function toggleTask(task: Task) {
    const operationDate = selectedDate;
    if (localMode) {
      const next = tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item);
      writeLocalTasks(selectedDate, next);
      setTasks(next);
      return;
    }
    try {
      const { task: updated } = await request("/api/tasks", {
        method: "PATCH", body: JSON.stringify({ id: task.id, done: !task.done }),
      });
      if (updated && selectedDateRef.current === operationDate) setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the block.");
    }
  }

  async function deleteTask(id: string) {
    const operationDate = selectedDate;
    if (localMode) {
      const remaining = tasks.filter((task) => task.id !== id);
      writeLocalTasks(selectedDate, remaining);
      finishDelete(id, remaining);
      return;
    }
    try {
      await request(`/api/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE", body: "{}" });
      if (selectedDateRef.current !== operationDate) return;
      const remaining = tasks.filter((task) => task.id !== id);
      finishDelete(id, remaining);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete the block.");
    }
  }

  function finishDelete(id: string, remaining: Task[]) {
    setTasks(remaining);
    if (activeTask === id) {
      setActiveTask(remaining[0]?.id ?? "");
      setSecondsLeft((remaining[0]?.duration ?? 0) * 60);
      setRunning(false);
    }
    setDeletingId("");
    setFocusMode(false);
  }

  const timerText = `${Math.floor(secondsLeft / 60).toString().padStart(2, "0")}:${(secondsLeft % 60).toString().padStart(2, "0")}`;

  return (
    <main ref={appRef} className="app" data-ready="false">
      <header className="topbar">
        <a className="brand" href="#today" aria-label="Luma home"><span className="brand-mark" aria-hidden="true">L</span><span>LUMA</span></a>
        <nav aria-label="Primary navigation"><a className="nav-active" href="#today">Today</a><a href="#atlas">Atlas</a><a href="#ledger">Ledger</a></nav>
        <div className="top-meta" aria-label={`Prague time ${time}`}><span>PRG</span><strong>{time}</strong></div>
      </header>

      <section className="datebar" aria-label="Choose day">
        <button type="button" aria-label="Previous day" onClick={() => chooseDate(shiftDate(selectedDate, -1))}>←</button>
        <label><span>PLANNING DATE</span><input type="date" value={selectedDate} onChange={(event) => chooseDate(event.target.value)} /></label>
        <strong>{readableDate(selectedDate)}</strong>
        <button type="button" onClick={() => chooseDate(pragueDate())}>Today</button>
        <button type="button" aria-label="Next day" onClick={() => chooseDate(shiftDate(selectedDate, 1))}>→</button>
      </section>

      <section className="hero" id="today" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow"><span>{readableDate(selectedDate).slice(0, 3)}</span>{readableDate(selectedDate).slice(3)}</p>
          <h1 id="page-title">Your day,<br />with clear<br /><em>edges.</em></h1>
          <p className="intro">Plan fewer things, protect the time they need, and finish with a clean record of what moved.</p>
          <button type="button" className="add-button" onClick={() => openComposer()}><span aria-hidden="true">+</span>Add focus block</button>
          <div className="energy-control">
            <span id="energy-label">ENERGY /</span>
            <div className="segmented" role="group" aria-labelledby="energy-label">
              {energies.map((item) => <button key={item} type="button" aria-pressed={energy === item} onClick={() => setEnergy(item)}>{item}</button>)}
            </div>
          </div>
        </div>

        <div className="atlas-panel" id="atlas">
          <div className="panel-heading"><span>ATTENTION ATLAS</span><span>{tasks.length.toString().padStart(2, "0")} BLOCKS / {Math.floor(totalMinutes / 60).toString().padStart(2, "0")}H {(totalMinutes % 60).toString().padStart(2, "0")}M</span></div>
          <div className="dial-wrap">
            <div className="dial" aria-label={selected ? `Current focus: ${selected.label}` : "No focus block selected"}>
              {Array.from({ length: 24 }, (_, index) => <i className={index % 6 === 0 ? "tick tick-major" : "tick"} style={{ "--tick": index } as React.CSSProperties} key={index} aria-hidden="true" />)}
              {tasks.slice(0, 3).map((task, index) => <span className={`focus-arc ${["arc-one", "arc-two", "arc-three"][index]} ${task.tone}`} key={task.id} aria-hidden="true" />)}
              <div className="dial-core">
                <span>{selected ? `${selected.time} / ${selected.duration}M` : "OPEN DAY"}</span>
                <strong>{selected?.label ?? "Add a block"}</strong>
                <small>{energy.toUpperCase()} ENERGY</small>
              </div>
            </div>
            <span className="dial-time dial-time-top">06</span><span className="dial-time dial-time-right">12</span><span className="dial-time dial-time-bottom">18</span><span className="dial-time dial-time-left">00</span>
          </div>
          <button type="button" className="focus-button" disabled={!selected} aria-pressed={focusMode} onClick={() => { setFocusMode((value) => !value); setRunning(false); }}>
            <span aria-hidden="true">{focusMode ? "×" : "↗"}</span>{focusMode ? "Leave focus" : "Enter focus"}
          </button>
        </div>
      </section>

      <section className="ledger" id="ledger" aria-labelledby="ledger-title">
        <div className="ledger-title-row">
          <div><p className="eyebrow">DAY LEDGER / {doneCount.toString().padStart(2, "0")} OF {tasks.length.toString().padStart(2, "0")}</p><h2 id="ledger-title">What gets<br />your attention?</h2></div>
          <p className="ledger-note">A good day has edges.<br />Protect them.</p>
        </div>

        {error && <div className="notice error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
        {loading ? <p className="empty-state" role="status">Reading the day…</p> : tasks.length === 0 ? (
          <div className="empty-state"><strong>Nothing is competing for your attention.</strong><p>Add one meaningful block to shape the day.</p><button type="button" onClick={() => openComposer()}>Add the first block</button></div>
        ) : (
          <ol className="task-list">
            {tasks.map((task, index) => (
              <li key={task.id} className={`${task.done ? "task done" : "task"} ${selected?.id === task.id ? "active" : ""}`}>
                <button type="button" className="task-check" aria-label={`${task.done ? "Mark incomplete" : "Mark complete"}: ${task.label}`} aria-pressed={task.done} onClick={() => toggleTask(task)}>{task.done ? "✓" : String(index + 1).padStart(2, "0")}</button>
                <button type="button" className="task-body" onClick={() => selectTask(task)} aria-pressed={selected?.id === task.id}>
                  <span className={`task-time ${task.tone}`}>{task.time}</span><strong>{task.label}</strong><small>{task.note || `${task.duration} focused minutes`}</small>
                </button>
                <div className="task-actions">
                  <button type="button" onClick={() => openComposer(task)} aria-label={`Edit ${task.label}`}>Edit</button>
                  {deletingId === task.id ? <><button type="button" className="danger" onClick={() => deleteTask(task.id)}>Confirm</button><button type="button" onClick={() => setDeletingId("")}>Cancel</button></> : <button type="button" onClick={() => setDeletingId(task.id)} aria-label={`Delete ${task.label}`}>Delete</button>}
                </div>
                <span className={`task-swatch ${task.tone}`} aria-hidden="true" />
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer><span>LUMA / ATTENTION ATLAS</span><span>{tasks.length ? `${doneCount}/${tasks.length} COMPLETE` : "OPEN DAY"}</span><a href="#today">BACK TO TOP ↑</a></footer>

      {composerOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposerOpen(false); }}>
          <section ref={composerRef} className="composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
            <div className="composer-head"><div><span>FOCUS BLOCK</span><h2 id="composer-title">{editingId ? "Refine the block." : "Make it count."}</h2></div><button type="button" onClick={() => setComposerOpen(false)} aria-label="Close editor">×</button></div>
            <form onSubmit={saveTask}>
              <label className="field field-wide"><span>What needs attention?</span><input ref={labelRef} required maxLength={80} value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Name the outcome" /></label>
              <label className="field"><span>Start</span><input type="time" required value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></label>
              <label className="field"><span>Minutes</span><input type="number" min="15" max="240" step="5" required value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: Number(event.target.value) })} /></label>
              <label className="field field-wide"><span>A useful constraint</span><input maxLength={160} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="What does done look like?" /></label>
              <fieldset className="tone-field"><legend>Signal color</legend>{(["coral", "blue", "moss"] as Tone[]).map((tone) => <label key={tone} className={tone}><input type="radio" name="tone" value={tone} checked={draft.tone === tone} onChange={() => setDraft({ ...draft, tone })} /><span>{tone}</span></label>)}</fieldset>
              <div className="form-actions"><button type="button" onClick={() => setComposerOpen(false)}>Cancel</button><button type="submit" className="primary">{editingId ? "Save changes" : "Add to atlas"}</button></div>
            </form>
          </section>
        </div>
      )}

      {focusMode && selected && (
        <aside className="focus-stage">
          <span className="sr-only" role="status">{secondsLeft === 0 ? "Focus session complete" : running ? "Focus timer running" : "Focus timer paused"}</span>
          <div><span className="focus-label">FOCUS / {selected.time}</span><strong>{selected.label}</strong><p>{selected.note || "Stay with the block until the edge."}</p></div>
          <div className="timer"><time>{timerText}</time><button type="button" onClick={() => setRunning((value) => !value)}>{running ? "Pause" : secondsLeft ? "Start" : "Done"}</button><button type="button" onClick={() => { setSecondsLeft(selected.duration * 60); setRunning(false); }}>Reset</button></div>
        </aside>
      )}
    </main>
  );
}
