import { auth }                                from "./firebase.js";
import { onAuthStateChanged }                  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  authErrorMessage,
  signInWithEmailPassword,
  signInWithGoogle,
  registerUser,
  signOutUser,
  createOrUpdateUserDoc
} from "./auth.js";
import {
  subscribeTasks,
  addTask,
  updateTask,
  completeTask,
  uncompleteTask,
  deleteTask,
  unsubscribeAll
} from "./tasks.js";

/* ── Constants ──────────────────────────────────────────────────────────── */
const PRI = {
  low:    { color: "#10b981", label: "Low" },
  medium: { color: "#f59e0b", label: "Medium" },
  high:   { color: "#ef4444", label: "High" }
};
const CATS = {
  work:     { label: "Work",         color: "#06b6d4" },
  personal: { label: "Personal",     color: "#a78bfa" },
  health:   { label: "Health",       color: "#10b981" },
  learning: { label: "Learning",     color: "#f59e0b" },
  side:     { label: "Side Project", color: "#ec4899" }
};

/* ── Helpers ────────────────────────────────────────────────────────────── */
const $  = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function dueIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
}

function checkIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';
}

function formatDue(ts) {
  if (!ts) return "No date";
  const d = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
  const h = d.getHours(), m = d.getMinutes();
  return `${((h % 12) || 12)}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function isSoon(ts) {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
  const diff = d - Date.now();
  return diff > 0 && diff < 7_200_000;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ── State ──────────────────────────────────────────────────────────────── */
let allTasks    = [];
let activeCat   = "all";
let editingPri  = "medium";
let editingCat  = "work";
let editingTaskId = null;
let currentUser = null;
let firstLoad   = true;

const taskElMap   = new Map(); // id -> DOM element
const pendingOpts = new Map(); // tempId -> { el, realId }

/* ── DOM refs ───────────────────────────────────────────────────────────── */
const loginScreenEl    = $("#login-screen");
const registerScreenEl = $("#register-screen");
const appEl            = $("#app");
const fabEl            = $("#fab");
const tasksEl          = $("#tasks");
const emptyEl          = $("#empty");
const backdropEl       = $("#backdrop");
const modalEl          = $("#modal");

/* ── Toast ──────────────────────────────────────────────────────────────── */
function showToast(msg, isError = false) {
  const tc = $("#toast-container");
  if (!tc) return;
  const t = document.createElement("div");
  t.className = "toast" + (isError ? " error" : "");
  t.textContent = msg;
  tc.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("show")));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 350);
  }, 3000);
}

/* ── FAB loading spinner ────────────────────────────────────────────────── */
function setFabLoading(on) {
  fabEl.classList.toggle("loading", on);
}

/* ── Skeleton ───────────────────────────────────────────────────────────── */
function hideSkeleton() {
  const sk = $("#skeleton");
  if (sk) sk.classList.add("hidden");
}

/* ── Screen visibility ──────────────────────────────────────────────────── */
function showApp() {
  loginScreenEl.classList.remove("show");
  registerScreenEl.classList.remove("show");
  appEl.style.display = "block";
  fabEl.style.display = "grid";
}

function showLogin() {
  loginScreenEl.classList.add("show");
  registerScreenEl.classList.remove("show");
  appEl.style.display = "none";
  fabEl.style.display = "none";
  $("#login-error").textContent = "";
}

function showRegister() {
  loginScreenEl.classList.remove("show");
  registerScreenEl.classList.add("show");
  appEl.style.display = "none";
  fabEl.style.display = "none";
  $("#register-error").textContent = "";
}

/* ── Auth state ─────────────────────────────────────────────────────────── */
onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    applyUserToUI(user);
    await createOrUpdateUserDoc(user).catch(console.error);
    showApp();

    // Show skeleton while first snapshot loads
    firstLoad = true;
    const sk = $("#skeleton");
    if (sk) sk.classList.remove("hidden");

    subscribeTasks(user.uid, (err, tasks) => {
      if (err) { console.error("Firestore error:", err); return; }

      if (firstLoad) {
        hideSkeleton();
        firstLoad = false;
      }

      // Resolve pending optimistic cards whose real doc has now arrived
      const newIds = new Set(tasks.map(t => t.id));
      for (const [tempId, opt] of pendingOpts) {
        if (opt.realId && newIds.has(opt.realId)) {
          opt.el.remove();
          taskElMap.delete(tempId);
          pendingOpts.delete(tempId);
        }
      }

      allTasks = tasks;
      render();
      refreshStats();
    });
  } else {
    currentUser = null;
    allTasks    = [];
    taskElMap.clear();
    pendingOpts.clear();
    unsubscribeAll();
    showLogin();
  }
});

function applyUserToUI(user) {
  const avatarEl = $("#avatar");
  avatarEl.style.backgroundImage = "";
  avatarEl.textContent = (user.displayName || user.email || "?")
    .split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

  const nameEl = $("#user-menu-name");
  if (nameEl) nameEl.textContent = user.displayName || user.email || "";

  const first = user.displayName ? user.displayName.split(" ")[0] : "there";
  const h     = new Date().getHours();
  const tod   = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  $("#greeting").innerHTML =
    `${tod}, ${esc(first)}.<br><span class="accent">Let's make today flow.</span>`;
}

/* ── Login form ─────────────────────────────────────────────────────────── */
async function handleLogin() {
  const email    = $("#login-email").value.trim();
  const password = $("#login-password").value;
  const errEl    = $("#login-error");
  const btn      = $("#login-submit");
  errEl.textContent = "";
  if (!email || !password) { errEl.textContent = "Completa todos los campos."; return; }
  btn.disabled = true;
  try {
    await signInWithEmailPassword(email, password);
  } catch (err) {
    errEl.textContent = authErrorMessage(err);
    btn.disabled = false;
  }
}

$("#login-submit").addEventListener("click", handleLogin);
["#login-email", "#login-password"].forEach(sel =>
  $(sel).addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); })
);

/* ── Google sign-in ─────────────────────────────────────────────────────── */
$("#google-signin").addEventListener("click", async () => {
  const errEl = $("#login-error");
  const btn   = $("#google-signin");
  errEl.textContent = "";
  btn.disabled = true;
  try {
    await signInWithGoogle();
    btn.disabled = false;
  } catch (err) {
    errEl.textContent = authErrorMessage(err);
    btn.disabled = false;
  }
});

/* ── Register form ──────────────────────────────────────────────────────── */
async function handleRegister() {
  const username = $("#reg-username").value.trim();
  const email    = $("#reg-email").value.trim();
  const password = $("#reg-password").value;
  const errEl    = $("#register-error");
  const btn      = $("#register-submit");
  errEl.textContent = "";
  if (!username || !email || !password) { errEl.textContent = "Completa todos los campos."; return; }
  btn.disabled = true;
  try {
    await registerUser(username, email, password);
  } catch (err) {
    errEl.textContent = authErrorMessage(err);
    btn.disabled = false;
  }
}

$("#register-submit").addEventListener("click", handleRegister);
["#reg-username", "#reg-email", "#reg-password"].forEach(sel =>
  $(sel).addEventListener("keydown", e => { if (e.key === "Enter") handleRegister(); })
);

/* ── Screen switching ───────────────────────────────────────────────────── */
$("#go-register").addEventListener("click", e => { e.preventDefault(); showRegister(); });
$("#go-login").addEventListener("click",    e => { e.preventDefault(); showLogin();    });

/* ── Avatar / user menu ─────────────────────────────────────────────────── */
$("#avatar").addEventListener("click", e => {
  e.stopPropagation();
  const menu     = $("#user-menu");
  const avatar   = $("#avatar");
  const isShown  = menu.classList.contains("show");
  menu.classList.toggle("show", !isShown);
  avatar.setAttribute("aria-expanded", String(!isShown));
});

document.addEventListener("click", () => {
  $("#user-menu")?.classList.remove("show");
  $("#avatar")?.setAttribute("aria-expanded", "false");
});

$("#signout-btn").addEventListener("click", async () => {
  $("#user-menu").classList.remove("show");
  try {
    await signOutUser();
  } catch (err) {
    console.error("Sign-out failed:", err);
  }
});

/* ── Stats ──────────────────────────────────────────────────────────────── */
function refreshStats() {
  const today       = new Date().toDateString();
  const todayList   = allTasks.filter(t => {
    if (!t.dueDate) return true;
    const d = t.dueDate.toDate ? t.dueDate.toDate() : new Date(t.dueDate);
    return d.toDateString() === today;
  });
  const totalToday     = todayList.length;
  const completedToday = todayList.filter(t => t.completed).length;
  const allCompleted   = allTasks.filter(t => t.completed).length;
  const rate           = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

  countUp($("#stat-today"),     totalToday);
  countUp($("#stat-completed"), completedToday);
  $("#stat-completed-suffix").textContent = `/ ${totalToday}`;
  countUp($("#stat-streak"),    allCompleted);

  setTimeout(() => {
    $("#bar-today").style.width     = "100%";
    $("#bar-completed").style.width = `${rate}%`;
    $("#bar-streak").style.width    = `${Math.min(100, allCompleted * 5)}%`;
  }, 120);
}

function countUp(el, target) {
  if (!el) return;
  const dur = 1100, start = performance.now();
  (function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  })(performance.now());
}

/* ── Diff-based render ──────────────────────────────────────────────────── */
function render() {
  const list    = allTasks.filter(t => activeCat === "all" || t.category === activeCat);
  const pending = list.filter(t => !t.completed);
  const done    = list.filter(t =>  t.completed);
  const sorted  = [...pending, ...done];

  const hasTempCards = pendingOpts.size > 0;

  if (sorted.length === 0 && !hasTempCards) {
    emptyEl.classList.add("show");
    emptyEl.setAttribute("aria-hidden", "false");
    $("#section-sub").textContent = "0 tasks";
    // Remove all real cards
    for (const [id, el] of taskElMap) {
      if (!id.startsWith("temp_")) { el.remove(); taskElMap.delete(id); }
    }
    updateChipCounts();
    return;
  }

  emptyEl.classList.remove("show");
  emptyEl.setAttribute("aria-hidden", "true");
  $("#section-sub").textContent = `${pending.length} pending · ${done.length} done`;

  const newIds = new Set(sorted.map(t => t.id));

  // Remove cards no longer in the filtered list
  for (const [id, el] of taskElMap) {
    if (id.startsWith("temp_")) continue;
    if (!newIds.has(id)) { el.remove(); taskElMap.delete(id); }
  }

  // Build ordered element array — update existing, create new
  const realEls = sorted.map((t, i) => {
    if (taskElMap.has(t.id)) {
      syncCard(taskElMap.get(t.id), t);
      return taskElMap.get(t.id);
    }
    const el = buildTaskEl(t, i);
    taskElMap.set(t.id, el);
    return el;
  });

  // Temp optimistic cards always appear at the top
  const tempEls = [...pendingOpts.values()].map(o => o.el);

  // Re-order DOM: temp cards first, then real cards in sorted order
  const ordered = [...tempEls, ...realEls];
  for (const el of ordered) tasksEl.appendChild(el);

  updateChipCounts();
}

/* Sync an existing card element with fresh task data (no full rebuild) */
function syncCard(el, t) {
  const pri = t.priority || "medium";
  const cat = t.category || "work";
  const wasDone    = el.classList.contains("done");
  const isSaving   = el.classList.contains("saving");
  const isCompleting = el.classList.contains("completing");

  // Don't disturb cards mid-animation
  if (isCompleting) return;

  const baseCls = `task ${pri}` + (t.completed ? " done" : "") + (isSaving ? " saving" : "");
  if (el.className !== baseCls) el.className = baseCls;
  el.style.setProperty("--pcolor", PRI[pri]?.color || "#94a3b8");
  el.dataset.id = t.id;

  const titleEl = el.querySelector(".task-title");
  if (titleEl && titleEl.textContent !== t.title) titleEl.textContent = t.title;

  const dueEl = el.querySelector(".due");
  if (dueEl) {
    const soonCls = isSoon(t.dueDate) && !t.completed ? " soon" : "";
    dueEl.className = `due${soonCls}`;
    dueEl.innerHTML = `${dueIcon()} ${formatDue(t.dueDate)}`;
  }

  const tagEl = el.querySelector(".tag");
  if (tagEl) {
    const catInfo = CATS[cat] || { label: cat };
    tagEl.dataset.cat = cat;
    tagEl.innerHTML = `<span class="tdot"></span>${catInfo.label}`;
  }

  const checkEl = el.querySelector(".check");
  if (checkEl) checkEl.setAttribute("aria-checked", String(t.completed));

  if (!wasDone && t.completed) {
    el.classList.add("done");
  } else if (wasDone && !t.completed) {
    el.classList.remove("done");
  }
}

function buildTaskEl(t, idx) {
  const el  = document.createElement("div");
  const pri = t.priority || "medium";
  const cat = t.category || "work";
  el.className = `task ${pri}${t.completed ? " done" : ""}`;
  el.style.setProperty("--pcolor", PRI[pri]?.color || "#94a3b8");
  el.style.setProperty("--d",      `${Math.min(idx, 8) * 60}ms`);
  el.dataset.id = t.id;

  const catInfo = CATS[cat] || { label: cat };
  el.innerHTML = `
    <div class="check" role="checkbox" aria-checked="${t.completed}" tabindex="0">
      ${checkIcon()}
    </div>
    <div class="task-body">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">
        <span class="due ${isSoon(t.dueDate) && !t.completed ? "soon" : ""}">
          ${dueIcon()} ${formatDue(t.dueDate)}
        </span>
        <span class="tag" data-cat="${cat}"><span class="tdot"></span>${catInfo.label}</span>
      </div>
    </div>
    <div class="pri" aria-label="${PRI[pri]?.label || pri} priority"></div>
  `;

  // Checkbox: toggle complete
  el.querySelector(".check").addEventListener("click", e => {
    e.stopPropagation();
    if (t.completed) {
      uncompleteTask(t.id).catch(() => showToast("Error al actualizar ✗", true));
    } else {
      el.classList.add("completing");
      burst(el, PRI[pri]?.color || "#94a3b8");
      setTimeout(() => {
        completeTask(t.id).catch(() => {
          el.classList.remove("completing");
          showToast("Error al completar ✗", true);
        });
      }, 500);
    }
  });

  // Card click: open edit modal (not while saving or completing)
  el.addEventListener("click", () => {
    if (el.classList.contains("saving") || el.classList.contains("completing")) return;
    const task = allTasks.find(tk => tk.id === el.dataset.id);
    if (task) openEditModal(task);
  });

  return el;
}

/* ── Particle burst ─────────────────────────────────────────────────────── */
function burst(el, color) {
  const b     = document.createElement("div");
  b.className = "burst";
  el.appendChild(b);

  const N       = 14;
  const palette = [color, "#f1f5f9", "#06b6d4", "#a78bfa", "#a3e635"];
  for (let i = 0; i < N; i++) {
    const p   = document.createElement("span");
    p.className = "p";
    const ang = (Math.PI * 2 * i) / N + Math.random() * 0.4;
    const dst = 50 + Math.random() * 50;
    p.style.setProperty("--tx", `${Math.cos(ang) * dst}px`);
    p.style.setProperty("--ty", `${Math.sin(ang) * dst}px`);
    p.style.setProperty("--r",  `${Math.random() * 720 - 360}deg`);
    p.style.background    = palette[i % palette.length];
    p.style.color         = palette[i % palette.length];
    p.style.animationDelay = `${Math.random() * 80}ms`;
    p.style.width = p.style.height = `${4 + Math.random() * 5}px`;
    b.appendChild(p);
  }
  setTimeout(() => b.remove(), 900);
}

/* ── Category chips (debounced) ─────────────────────────────────────────── */
function updateChipCounts() {
  const counts = { all: allTasks.length };
  Object.keys(CATS).forEach(k => (counts[k] = allTasks.filter(t => t.category === k).length));
  $$(`#chips .chip`).forEach(c => {
    const span = c.querySelector(".count");
    if (span) span.textContent = counts[c.dataset.cat] ?? 0;
  });
}

const debouncedRender = debounce(render, 150);

$$(`#chips .chip`).forEach(chip => {
  chip.addEventListener("click", () => {
    $$(`#chips .chip`).forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeCat = chip.dataset.cat;
    $("#section-title").textContent =
      activeCat === "all" ? "Today's flow" : (CATS[activeCat]?.label || activeCat);
    debouncedRender();
  });
});

/* ── Modal ──────────────────────────────────────────────────────────────── */
function openModal() {
  editingTaskId = null;
  $("#m-title").value = "";
  $("#m-desc").value  = "";
  $("#m-date").value  = new Date().toISOString().slice(0, 10);
  $("#m-time").value  = "09:00";
  editingPri = "medium";
  editingCat = "work";
  $$(`#orbs .orb`).forEach(o => o.classList.toggle("active", o.dataset.p === editingPri));
  $$(`#catpick .chip`).forEach(c => c.classList.toggle("active", c.dataset.cat === editingCat));
  $("#modal-title").textContent  = "New task";
  $("#save").textContent         = "Create task";
  $("#delete-row").style.display = "none";
  resetDeleteConfirm();
  backdropEl.classList.add("show");
  modalEl.classList.add("show");
  setTimeout(() => $("#m-title").focus(), 250);
}

function openEditModal(task) {
  editingTaskId = task.id;
  $("#m-title").value = task.title || "";
  $("#m-desc").value  = task.description || "";

  const d = task.dueDate
    ? (task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate))
    : new Date();
  $("#m-date").value = d.toISOString().slice(0, 10);
  $("#m-time").value = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  editingPri = task.priority || "medium";
  editingCat = task.category || "work";
  $$(`#orbs .orb`).forEach(o => o.classList.toggle("active", o.dataset.p === editingPri));
  $$(`#catpick .chip`).forEach(c => c.classList.toggle("active", c.dataset.cat === editingCat));
  $("#modal-title").textContent  = "Editar tarea";
  $("#save").textContent         = "Guardar cambios";
  $("#delete-row").style.display = "";
  resetDeleteConfirm();
  backdropEl.classList.add("show");
  modalEl.classList.add("show");
  setTimeout(() => $("#m-title").focus(), 250);
}

function closeModal() {
  backdropEl.classList.remove("show");
  modalEl.classList.remove("show");
  editingTaskId = null;
}

function resetDeleteConfirm() {
  const cd = $("#confirm-delete");
  const dt = $("#delete-task");
  if (cd) cd.classList.add("hidden");
  if (dt) dt.style.display = "";
}

/* ── FAB & modal triggers ───────────────────────────────────────────────── */
fabEl.addEventListener("click", () => {
  fabEl.classList.remove("spin");
  void fabEl.offsetWidth;
  fabEl.classList.add("spin");
  openModal();
});
$("#empty-add").addEventListener("click", openModal);
$("#cancel").addEventListener("click", closeModal);
backdropEl.addEventListener("click", closeModal);

/* ── Priority orbs ──────────────────────────────────────────────────────── */
$$(`#orbs .orb`).forEach(o => o.addEventListener("click", () => {
  $$(`#orbs .orb`).forEach(x => x.classList.remove("active"));
  o.classList.add("active");
  editingPri = o.dataset.p;
}));

/* ── Category picker ────────────────────────────────────────────────────── */
$$(`#catpick .chip`).forEach(c => c.addEventListener("click", () => {
  $$(`#catpick .chip`).forEach(x => x.classList.remove("active"));
  c.classList.add("active");
  editingCat = c.dataset.cat;
}));

/* ── Save / create / update task ────────────────────────────────────────── */
$("#save").addEventListener("click", async () => {
  if (!currentUser) return;
  const title = $("#m-title").value.trim();
  if (!title) { $("#m-title").focus(); return; }

  const dateStr  = $("#m-date").value;
  const [hh, mm] = ($("#m-time").value || "09:00").split(":").map(Number);
  const d        = dateStr ? new Date(dateStr) : new Date();
  d.setHours(hh, mm, 0, 0);

  const taskData = {
    title,
    description: $("#m-desc").value.trim(),
    dueDate:     d,
    priority:    editingPri,
    category:    editingCat
  };

  if (editingTaskId) {
    /* ── Edit mode ── */
    const taskIdx = allTasks.findIndex(t => t.id === editingTaskId);
    const oldTask = taskIdx >= 0 ? { ...allTasks[taskIdx] } : null;

    // Optimistic: update allTasks and DOM immediately
    if (taskIdx >= 0) {
      allTasks[taskIdx] = { ...allTasks[taskIdx], ...taskData };
      syncCard(taskElMap.get(editingTaskId), allTasks[taskIdx]);
    }
    closeModal();

    try {
      await updateTask(editingTaskId, taskData);
      showToast("Tarea actualizada ✓");
    } catch (err) {
      // Revert
      if (taskIdx >= 0 && oldTask) {
        allTasks[taskIdx] = oldTask;
        const el = taskElMap.get(oldTask.id);
        if (el) syncCard(el, oldTask);
      }
      showToast("Error al guardar ✗", true);
    }
  } else {
    /* ── Create mode — optimistic UI ── */
    const tempId   = `temp_${Date.now()}`;
    const tempTask = { id: tempId, ...taskData, completed: false, createdAt: { seconds: Date.now() / 1000 } };
    const el       = buildTaskEl(tempTask, 0);
    el.classList.add("saving");
    el.dataset.id = tempId;
    taskElMap.set(tempId, el);

    // Prepend at top of task list
    tasksEl.insertBefore(el, tasksEl.firstChild);
    emptyEl.classList.remove("show");
    emptyEl.setAttribute("aria-hidden", "true");

    closeModal();
    setFabLoading(true);

    try {
      const docRef = await addTask(currentUser.uid, taskData);
      pendingOpts.set(tempId, { el, realId: docRef.id });
      showToast("Tarea creada ✓");
    } catch (err) {
      el.remove();
      taskElMap.delete(tempId);
      showToast("Error al guardar ✗", true);
    } finally {
      setFabLoading(false);
    }
  }
});

/* ── Delete from edit modal ─────────────────────────────────────────────── */
$("#delete-task").addEventListener("click", () => {
  $("#confirm-delete").classList.remove("hidden");
  $("#delete-task").style.display = "none";
});

$("#confirm-no").addEventListener("click", resetDeleteConfirm);

$("#confirm-yes").addEventListener("click", async () => {
  if (!editingTaskId) return;
  const taskId = editingTaskId;
  const taskEl = taskElMap.get(taskId);

  closeModal();

  // Animate card out then remove
  if (taskEl) {
    taskEl.classList.add("completing");
    taskEl.style.pointerEvents = "none";
    setTimeout(() => {
      taskEl.remove();
      taskElMap.delete(taskId);
      allTasks = allTasks.filter(t => t.id !== taskId);
      refreshStats();
      if (allTasks.filter(t => activeCat === "all" || t.category === activeCat).length === 0) {
        emptyEl.classList.add("show");
        emptyEl.setAttribute("aria-hidden", "false");
        $("#section-sub").textContent = "0 tasks";
      }
    }, 1200);
  }

  try {
    await deleteTask(taskId);
    showToast("Tarea eliminada ✓");
  } catch (err) {
    showToast("Error al eliminar ✗", true);
  }
});

/* ── Keyboard shortcuts ─────────────────────────────────────────────────── */
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
  if (
    e.key === "n" &&
    !modalEl.classList.contains("show") &&
    !loginScreenEl.classList.contains("show") &&
    !registerScreenEl.classList.contains("show") &&
    document.activeElement.tagName !== "INPUT" &&
    document.activeElement.tagName !== "TEXTAREA"
  ) openModal();
});

/* ── Date string in header ──────────────────────────────────────────────── */
(function setHeaderDate() {
  const d      = new Date();
  const days   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  $("#date").textContent = `${days[d.getDay()]} · ${months[d.getMonth()]} ${d.getDate()}`;
})();
