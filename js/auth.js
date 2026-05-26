import { auth, db }                           from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const AUTH_ERRORS = {
  "auth/user-not-found":          "No existe una cuenta con ese email",
  "auth/wrong-password":          "Contraseña incorrecta",
  "auth/invalid-credential":      "Email o contraseña incorrectos",
  "auth/email-already-in-use":    "Ese email ya está registrado",
  "auth/weak-password":           "La contraseña debe tener al menos 6 caracteres",
  "auth/invalid-email":           "El formato del email no es válido",
  "auth/popup-blocked":           "Pop-up bloqueado — permite pop-ups para este sitio e inténtalo de nuevo.",
  "auth/popup-closed-by-user":    "Inicio de sesión cancelado",
  "auth/cancelled-popup-request": "",
  "auth/unauthorized-domain":     "Este dominio no está autorizado en Firebase. Revisa la configuración.",
  "auth/operation-not-allowed":   "Google Sign-In no está habilitado en Firebase Console."
};

export function authErrorMessage(err) {
  return AUTH_ERRORS[err.code] || "Ocurrió un error. Inténtalo de nuevo.";
}

export function signInWithEmailPassword(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider).then(async result => {
    if (result && result.user) {
      await setDoc(doc(db, "users", result.user.uid), {
        username:  result.user.displayName || "",
        email:     result.user.email || "",
        createdAt: serverTimestamp()
      }, { merge: true }).catch(console.error);
    }
  });
}

export async function registerUser(username, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: username });
  await setDoc(doc(db, "users", cred.user.uid), {
    username,
    email,
    categories: ["Work", "Personal", "Health", "Finance", "Other"],
    createdAt:  serverTimestamp()
  });
  return cred;
}

export function signOutUser() {
  return signOut(auth);
}

export async function createOrUpdateUserDoc(user) {
  const ref  = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return setDoc(ref, {
      username:   user.displayName || "",
      email:      user.email || "",
      categories: ["Work", "Personal", "Health", "Finance", "Other"],
      createdAt:  serverTimestamp()
    });
  }
}
