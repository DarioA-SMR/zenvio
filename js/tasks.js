// Zenvio — Firestore CRUD and realtime listener for the tasks collection.
// Depends on: db (from firebase.js)

let _unsubscribeTasks = null;

// Subscribes to all tasks for a user, ordered by dueDate ascending.
// callback(error | null, tasks | null)
function subscribeTasks(userId, callback) {
  if (_unsubscribeTasks) _unsubscribeTasks();

  // orderBy removed — composite index not required; sort client-side instead.
  _unsubscribeTasks = db.collection("tasks")
    .where("userId", "==", userId)
    .onSnapshot(
      snapshot => {
        const tasks = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => {
            const da = a.dueDate ? (a.dueDate.toDate ? a.dueDate.toDate() : new Date(a.dueDate)) : new Date(0);
            const db_ = b.dueDate ? (b.dueDate.toDate ? b.dueDate.toDate() : new Date(b.dueDate)) : new Date(0);
            return da - db_;
          });
        callback(null, tasks);
      },
      err => callback(err, null)
    );

  return _unsubscribeTasks;
}

function addTask(userId, data) {
  const now = firebase.firestore.FieldValue.serverTimestamp();
  return db.collection("tasks").add({
    userId,
    title:       data.title,
    description: data.description || "",
    dueDate:     data.dueDate     || firebase.firestore.Timestamp.fromDate(new Date()),
    priority:    data.priority    || "medium",
    category:    data.category    || "work",
    completed:   false,
    completedAt: null,
    createdAt:   now,
    updatedAt:   now
  });
}

function completeTask(taskId) {
  return db.collection("tasks").doc(taskId).update({
    completed:   true,
    completedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
  });
}

function uncompleteTask(taskId) {
  return db.collection("tasks").doc(taskId).update({
    completed:   false,
    completedAt: null,
    updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
  });
}

function deleteTask(taskId) {
  return db.collection("tasks").doc(taskId).delete();
}

// Stops the active Firestore listener (called on sign-out).
function unsubscribeAll() {
  if (_unsubscribeTasks) {
    _unsubscribeTasks();
    _unsubscribeTasks = null;
  }
}
