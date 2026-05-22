// Zenvio — wires Firebase Auth and Firestore to the UI.
// Depends on: auth.js, tasks.js (which depend on firebase.js and config.js)

/* ── Constants ─────────────────────────────────────────────────────────── */
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

/* ── Helpers ───────────────────────────────────────────────────────────── */
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

function formatDue(timestamp) {
  if (!timestamp) return "No date";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const h = d.getHours(), m = d.getMinutes();
  return `${((h % 12) || 12)}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function isSoon(timestamp) {
  if (!timestamp) return false;
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diff = d - Date.now();
  return diff > 0 && diff < 7_200_000;
}

/* ── State ─────────────────────────────────────────────────────────────── */
let allTasks    = [];
let activeCat   = "all";
let editingPri  = "medium";
let editingCat  = "work";
let currentUser = null;

/* ── DOM refs ──────────────────────────────────────────────────────────── */
const loginScreenEl    = $("#login-screen");
const registerScreenEl = $("#register-screen");
const appEl            = $("#app");
const fabEl            = $("#fab");
const tasksEl          = $("#tasks");
const emptyEl          = $("#empty");
const backdropEl       = $("#backdrop");
const modalEl          = $("#modal");

/* ── Screen visibility ─────────────────────────────────────────────────── */
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
auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    applyUserToUI(user);
    await createOrUpdateUserDoc(user);
    showApp();
    subscribeTasks(user.uid, (err, tasks) => {
      if (err) { console.error("Firestore error:", err); return; }
      allTasks = tasks || [];
      render();
      refreshStats();
    });
  } else {
    currentUser = null;
    allTasks    = [];
    unsubscribeAll();
    showLogin();
  }
});

function applyUserToUI(user) {
  const avatarEl = $("#avatar");
  avatarEl.style.backgroundImage = "";
  avatarEl.textContent = (user.displayName || user.email || "?")
    .split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

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

["#login-email", "#login-password"].forEach(sel => {
  $(sel).addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); });
});

/* ── Google redirect result (mobile) ───────────────────────────────────── */
handleGoogleRedirectResult().then(result => {
  if (result && result.error) {
    const errEl = $("#login-error");
    if (errEl) errEl.textContent = authErrorMessage(result.error);
  }
});

/* ── Google sign-in ─────────────────────────────────────────────────────── */
$("#google-signin").addEventListener("click", async () => {
  const errEl = $("#login-error");
  errEl.textContent = "";
  const btn = $("#google-signin");
  btn.disabled = true;
  try {
    await signInWithGoogle();
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

["#reg-username", "#reg-email", "#reg-password"].forEach(sel => {
  $(sel).addEventListener("keydown", e => { if (e.key === "Enter") handleRegister(); });
});

/* ── Screen switching links ─────────────────────────────────────────────── */
$("#go-register").addEventListener("click", e => { e.preventDefault(); showRegister(); });
$("#go-login").addEventListener("click",    e => { e.preventDefault(); showLogin();    });

/* ── Sign-out ───────────────────────────────────────────────────────────── */
$("#avatar").addEventListener("click", () => {
  if (currentUser && confirm("Sign out of Zenvio?")) signOutUser();
});

/* ── Stats ──────────────────────────────────────────────────────────────── */
function refreshStats() {
  const today     = new Date().toDateString();
  const todayList = allTasks.filter(t => {
    if (!t.dueDate) return true;
    return (t.dueDate.toDate ? t.dueDate.toDate() : new Date(t.dueDate)).toDateString() === today;
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

/* ── Render ─────────────────────────────────────────────────────────────── */
function render() {
  const list = allTasks.filter(t => activeCat === "all" || t.category === activeCat);
  tasksEl.innerHTML = "";

  if (list.length === 0) {
    emptyEl.classList.add("show");
    emptyEl.setAttribute("aria-hidden", "false");
    $("#section-sub").textContent = "0 tasks";
    return;
  }
  emptyEl.classList.remove("show");
  emptyEl.setAttribute("aria-hidden", "true");

  const pending = list.filter(t => !t.completed);
  const done    = list.filter(t =>  t.completed);
  $("#section-sub").textContent = `${pending.length} pending · ${done.length} done`;

  [...pending, ...done].forEach((t, i) => tasksEl.appendChild(buildTaskEl(t, i)));
  updateChipCounts();
}

function buildTaskEl(t, idx) {
  const el  = document.createElement("div");
  const pri = t.priority || "medium";
  const cat = t.category || "work";
  el.className = `task ${pri}${t.completed ? " done" : ""}`;
  el.style.setProperty("--pcolor", PRI[pri]?.color || "#94a3b8");
  el.style.setProperty("--d",      `${idx * 60}ms`);
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

  el.querySelector(".check").addEventListener("click", e => {
    e.stopPropagation();
    if (t.completed) {
      uncompleteTask(t.id);
    } else {
      el.classList.add("completing");
      burst(el, PRI[pri]?.color || "#94a3b8");
      setTimeout(() => completeTask(t.id), 500);
    }
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

/* ── Category chips ─────────────────────────────────────────────────────── */
function updateChipCounts() {
  const counts = { all: allTasks.length };
  Object.keys(CATS).forEach(k => (counts[k] = allTasks.filter(t => t.category === k).length));
  $$("#chips .chip").forEach(c => {
    const span = c.querySelector(".count");
    if (span) span.textContent = counts[c.dataset.cat] ?? 0;
  });
}

$$("#chips .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    $$("#chips .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeCat = chip.dataset.cat;
    $("#section-title").textContent =
      activeCat === "all" ? "Today's flow" : (CATS[activeCat]?.label || activeCat);
    render();
  });
});

/* ── Modal ──────────────────────────────────────────────────────────────── */
function openModal() {
  $("#m-title").value = "";
  $("#m-desc").value  = "";
  $("#m-date").value  = new Date().toISOString().slice(0, 10);
  $("#m-time").value  = "09:00";
  editingPri = "medium";
  editingCat = "work";
  $$("#orbs .orb").forEach(o => o.classList.toggle("active", o.dataset.p === editingPri));
  $$("#catpick .chip").forEach(c => c.classList.toggle("active", c.dataset.cat === editingCat));
  backdropEl.classList.add("show");
  modalEl.classList.add("show");
  setTimeout(() => $("#m-title").focus(), 250);
}

function closeModal() {
  backdropEl.classList.remove("show");
  modalEl.classList.remove("show");
}

fabEl.addEventListener("click", () => {
  fabEl.classList.remove("spin");
  void fabEl.offsetWidth;
  fabEl.classList.add("spin");
  openModal();
});
$("#empty-add").addEventListener("click", openModal);
$("#cancel").addEventListener("click", closeModal);
backdropEl.addEventListener("click", closeModal);

$$("#orbs .orb").forEach(o => o.addEventListener("click", () => {
  $$("#orbs .orb").forEach(x => x.classList.remove("active"));
  o.classList.add("active");
  editingPri = o.dataset.p;
}));

$$("#catpick .chip").forEach(c => c.addEventListener("click", () => {
  $$("#catpick .chip").forEach(x => x.classList.remove("active"));
  c.classList.add("active");
  editingCat = c.dataset.cat;
}));

$("#save").addEventListener("click", async () => {
  if (!currentUser) return;
  const title = $("#m-title").value.trim();
  if (!title) { $("#m-title").focus(); return; }

  const dateStr  = $("#m-date").value;
  const [hh, mm] = ($("#m-time").value || "09:00").split(":").map(Number);
  const d        = dateStr ? new Date(dateStr) : new Date();
  d.setHours(hh, mm, 0, 0);

  await addTask(currentUser.uid, {
    title,
    description: $("#m-desc").value.trim(),
    dueDate:     firebase.firestore.Timestamp.fromDate(d),
    priority:    editingPri,
    category:    editingCat
  });

  closeModal();
});

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
