
"use strict";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const STORAGE_KEY = "studymate_data";

function getToday() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

const data = loadData();

data.tasks ??= [];
data.subjects ??= [];
data.focusMinutes ??= 0;
data.user ??= "";
data.goal ??= "Prepare for exams";
data.dark ??= false;

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatDate(date) {
  if (!date) return "No due date";
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric"
  });
}

// Welcome page
const loginForm = $("#loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = $("#studentName").value.trim();
    if (!name) return;

    data.user = name;
    data.goal = $("#studyGoal").value;
    saveData();

    window.location.href = "dashboard.html";
  });
}

// Shared navigation and theme
function initShared() {
  const nameElement = $("#userName");
  if (nameElement) nameElement.textContent = data.user || "Student";

  const themeButton = $("#themeToggle");
  document.body.classList.toggle("dark", Boolean(data.dark));

  themeButton?.addEventListener("click", () => {
    data.dark = !data.dark;
    document.body.classList.toggle("dark", data.dark);
    saveData();
  });

  $("#logoutBtn")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });
}

initShared();

// Dashboard
function initDashboard() {
  const dateElement = $("#todayDate");
  if (dateElement) {
    dateElement.textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
  }

  const welcome = $("#welcomeText");
  if (welcome) {
    welcome.textContent = `Welcome back, ${data.user || "Student"}!`;
  }

  function renderDashboard() {
    $("#totalTasks").textContent = data.tasks.length;
    $("#completedTasks").textContent =
      data.tasks.filter(task => task.completed).length;
    $("#focusMinutes").textContent = data.focusMinutes;
    $("#subjectCount").textContent = data.subjects.length;

    const todayTasks = data.tasks
      .filter(task => !task.completed)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .slice(0, 5);

    const taskContainer = $("#dashboardTasks");
    if (!taskContainer) return;

    if (!todayTasks.length) {
      taskContainer.innerHTML =
        '<div class="empty-state">No pending tasks. Add one in your planner!</div>';
    } else {
      taskContainer.innerHTML = todayTasks.map(task => `
        <div class="task-item">
          <input class="task-check" type="checkbox"
            data-complete="${escapeHTML(task.id)}"
            aria-label="Complete ${escapeHTML(task.title)}">
          <div class="task-details">
            <div class="task-title">${escapeHTML(task.title)}</div>
            <div class="task-meta">
              ${escapeHTML(task.subject || "General")} · ${formatDate(task.date)}
            </div>
          </div>
          <span class="priority ${escapeHTML(task.priority)}">
            ${escapeHTML(task.priority)}
          </span>
        </div>
      `).join("");
    }

    taskContainer.querySelectorAll("[data-complete]").forEach(input => {
      input.addEventListener("change", () => {
        const task = data.tasks.find(t => t.id === input.dataset.complete);
        if (task) {
          task.completed = input.checked;
          saveData();
          renderDashboard();
        }
      });
    });

    renderSubjects();
  }

  function renderSubjects() {
    const container = $("#subjectList");
    if (!container) return;

    if (!data.subjects.length) {
      container.innerHTML =
        '<div class="empty-state">Add a subject to track your progress.</div>';
      return;
    }

    container.innerHTML = data.subjects.map(subject => {
      const progress = subject.progress || 0;
      return `
        <div class="subject-item">
          <div class="subject-top">
            <strong>${escapeHTML(subject.name)}</strong>
            <span>${progress}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${progress}%"></div>
          </div>
          <div class="subject-actions">
            <button data-progress="${escapeHTML(subject.id)}">+10%</button>
            <button data-remove-subject="${escapeHTML(subject.id)}"
              aria-label="Remove ${escapeHTML(subject.name)}">Remove</button>
          </div>
        </div>`;
    }).join("");

    container.querySelectorAll("[data-progress]").forEach(button => {
      button.addEventListener("click", () => {
        const subject = data.subjects.find(
          s => s.id === button.dataset.progress
        );
        if (subject) {
          subject.progress = Math.min(100, (subject.progress || 0) + 10);
          saveData();
          renderSubjects();
        }
      });
    });

    container.querySelectorAll("[data-remove-subject]").forEach(button => {
      button.addEventListener("click", () => {
        const id = button.dataset.removeSubject;
        data.subjects = data.subjects.filter(s => s.id !== id);
        saveData();
        renderDashboard();
      });
    });
  }

  $("#addSubjectBtn")?.addEventListener("click", () => {
    $("#subjectForm")?.classList.toggle("hidden");
    $("#subjectName")?.focus();
  });

  $("#subjectForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const input = $("#subjectName");
    const name = input.value.trim();

    if (!name) return;
    if (data.subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      alert("This subject already exists.");
      return;
    }

    data.subjects.push({
      id: createId(),
      name,
      progress: 0
    });

    input.value = "";
    $("#subjectForm").classList.add("hidden");
    saveData();
    renderDashboard();
  });

  // Demo assistant: rule-based, not a connected AI model.
  $("#assistantForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const input = $("#assistantInput");
    const question = input.value.trim().toLowerCase();
    if (!question) return;

    let reply = "Break your work into small tasks. Choose one task, study it, and take a short break afterward.";

    if (question.includes("revision") || question.includes("revise")) {
      reply = "Try active recall: close your notes, write what you remember, and then check your notes to identify topics to review.";
    } else if (question.includes("time") || question.includes("schedule")) {
      reply = "List your tasks, choose a realistic amount of study time, and add short breaks. Start with one manageable task.";
    } else if (question.includes("focus") || question.includes("concentrat")) {
      reply = "Put distractions aside, choose one clear goal, and try a 25-minute focus session followed by a 5-minute break.";
    } else if (question.includes("exam")) {
      reply = "List the exam topics, organize them by what you need to review, and practise answering questions. Remember to leave time for rest.";
    } else if (question.includes("motivat")) {
      reply = "Start with a small task you can finish today. A clear, achievable goal can help you build momentum.";
    }

    $("#assistantReply").textContent = reply;
    input.value = "";
  });

  renderDashboard();
}

// Planner
function initPlanner() {
  const dateInput = $("#taskDate");
  if (dateInput) dateInput.value = getToday();

  function updateSubjectOptions() {
    const select = $("#taskSubject");
    if (!select) return;

    select.innerHTML = '<option value="">General study</option>' +
      data.subjects.map(subject =>
        `<option value="${escapeHTML(subject.name)}">${escapeHTML(subject.name)}</option>`
      ).join("");
  }

  function renderTasks() {
    const container = $("#plannerTasks");
    if (!container) return;

    const filter = $("#taskFilter")?.value || "all";
    let tasks = [...data.tasks];

    if (filter === "pending") tasks = tasks.filter(t => !t.completed);
    if (filter === "completed") tasks = tasks.filter(t => t.completed);

    tasks.sort((a, b) => {
      if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
      return (a.date || "").localeCompare(b.date || "");
    });

    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state">No tasks found. Add a new study task above.</div>';
      return;
    }

    container.innerHTML = tasks.map(task => `
      <div class="task-item ${task.completed ? "is-complete" : ""}">
        <input class="task-check" type="checkbox"
          data-complete="${escapeHTML(task.id)}"
          ${task.completed ? "checked" : ""}
          aria-label="Mark ${escapeHTML(task.title)} completed">
        <div class="task-details">
          <div class="task-title">${escapeHTML(task.title)}</div>
          <div class="task-meta">
            ${escapeHTML(task.subject || "General study")} · ${formatDate(task.date)}
          </div>
        </div>
        <span class="priority ${escapeHTML(task.priority)}">
          ${escapeHTML(task.priority)}
        </span>
        <button class="delete-btn" data-delete="${escapeHTML(task.id)}"
          aria-label="Delete ${escapeHTML(task.title)}">×</button>
      </div>
    `).join("");

    container.querySelectorAll("[data-complete]").forEach(input => {
      input.addEventListener("change", () => {
        const task = data.tasks.find(t => t.id === input.dataset.complete);
        if (task) {
          task.completed = input.checked;
          saveData();
          renderTasks();
        }
      });
    });

    container.querySelectorAll("[data-delete]").forEach(button => {
      button.addEventListener("click", () => {
        data.tasks = data.tasks.filter(t => t.id !== button.dataset.delete);
        saveData();
        renderTasks();
      });
    });
  }

  $("#taskForm")?.addEventListener("submit", event => {
    event.preventDefault();

    const title = $("#taskTitle").value.trim();
    const subject = $("#taskSubject").value;
    const date = $("#taskDate").value;
    const priority = $("#taskPriority").value;

    if (!title || !date) return;

    data.tasks.push({
      id: createId(),
      title,
      subject,
      date,
      priority,
      completed: false
    });

    saveData();
    $("#taskForm").reset();
    dateInput.value = getToday();
    renderTasks();
  });

  $("#taskFilter")?.addEventListener("change", renderTasks);

  updateSubjectOptions();
  renderTasks();
}

// Focus timer
function initTimer() {
  const display = $("#timerDisplay");
  if (!display) return;

  let duration = 25 * 60;
  let remaining = duration;
  let interval = null;
  let running = false;
  let mode = "Focus session";

  function showTime() {
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    display.textContent =
      `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    $("#timerLabel").textContent = mode;
    $("#timerStart").textContent = running ? "Pause" : "Start";
  }

  function stopTimer() {
    if (interval !== null) clearInterval(interval);
    interval = null;
    running = false;
    showTime();
  }

  $("#timerStart").addEventListener("click", () => {
    if (running) {
      stopTimer();
      return;
    }

    running = true;
    showTime();

    interval = setInterval(() => {
      remaining--;

      if (remaining <= 0) {
        if (mode === "Focus session") {
          data.focusMinutes += Math.round(duration / 60);
          saveData();
          const focusDisplay = $("#focusMinutes");
          if (focusDisplay) focusDisplay.textContent = data.focusMinutes;
        }

        stopTimer();
        remaining = 0;
        showTime();
        alert(`${mode} finished!`);
        return;
      }

      showTime();
    }, 1000);
  });

  $("#timerReset").addEventListener("click", () => {
    stopTimer();
    remaining = duration;
    showTime();
  });

  $$(".timer-mode").forEach(button => {
    button.addEventListener("click", () => {
      stopTimer();
      duration = Number(button.dataset.minutes) * 60;
      remaining = duration;
      mode = duration === 300 ? "Short break" : "Focus session";
      showTime();
    });
  });

  showTime();
}

// Initialize the page-specific features.
const page = document.body.dataset.page;

if (page === "dashboard") {
  initDashboard();
  initTimer();
}

if (page === "planner") {
  initPlanner();
}