import { db }                                  from "./firebase.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let _unsubscribeTasks = null;

export function subscribeTasks(userId, callback) {
  if (_unsubscribeTasks) _unsubscribeTasks();

  const q = query(
    collection(db, "tasks"),
    where("userId", "==", userId)
  );

  _unsubscribeTasks = onSnapshot(q,
    snapshot => {
      const tasks = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          // Sort by createdAt descending (newest first)
          const ta = a.createdAt?.seconds ?? 0;
          const tb = b.createdAt?.seconds ?? 0;
          return tb - ta;
        });
      callback(null, tasks);
    },
    err => callback(err, null)
  );

  return _unsubscribeTasks;
}

export function addTask(userId, data) {
  const now = serverTimestamp();
  const dueDate = data.dueDate instanceof Date
    ? Timestamp.fromDate(data.dueDate)
    : (data.dueDate || Timestamp.fromDate(new Date()));
  return addDoc(collection(db, "tasks"), {
    userId,
    title:       data.title,
    description: data.description || "",
    dueDate,
    priority:    data.priority  || "medium",
    category:    data.category  || "work",
    completed:   false,
    completedAt: null,
    createdAt:   now,
    updatedAt:   now
  });
}

export function updateTask(taskId, updatedData) {
  const data = { ...updatedData, updatedAt: serverTimestamp() };
  if (data.dueDate instanceof Date) {
    data.dueDate = Timestamp.fromDate(data.dueDate);
  }
  return updateDoc(doc(db, "tasks", taskId), data);
}

export function completeTask(taskId) {
  return updateDoc(doc(db, "tasks", taskId), {
    completed:   true,
    completedAt: serverTimestamp(),
    updatedAt:   serverTimestamp()
  });
}

export function uncompleteTask(taskId) {
  return updateDoc(doc(db, "tasks", taskId), {
    completed:   false,
    completedAt: null,
    updatedAt:   serverTimestamp()
  });
}

export function deleteTask(taskId) {
  return deleteDoc(doc(db, "tasks", taskId));
}

export function unsubscribeAll() {
  if (_unsubscribeTasks) {
    _unsubscribeTasks();
    _unsubscribeTasks = null;
  }
}
