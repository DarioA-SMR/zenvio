// Zenvio — email/password + Google auth helpers.
// Depends on: auth, db (from firebase.js)

const AUTH_ERRORS = {
  'auth/user-not-found':           'No existe una cuenta con ese email',
  'auth/wrong-password':           'Contraseña incorrecta',
  'auth/invalid-credential':       'Email o contraseña incorrectos',
  'auth/email-already-in-use':     'Ese email ya está registrado',
  'auth/weak-password':            'La contraseña debe tener al menos 6 caracteres',
  'auth/invalid-email':            'El formato del email no es válido',
  'auth/popup-blocked':            'Pop-up bloqueado — permite pop-ups para este sitio e inténtalo de nuevo.',
  'auth/popup-closed-by-user':     '',
  'auth/cancelled-popup-request':  '',
  'auth/unauthorized-domain':      'Este dominio no está autorizado en Firebase. Revisa la configuración.',
  'auth/operation-not-allowed':    'Google Sign-In no está habilitado en Firebase Console.'
};

function authErrorMessage(err) {
  return AUTH_ERRORS[err.code] || 'Ocurrió un error. Inténtalo de nuevo.';
}

function signInWithEmailPassword(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

function isMobileOrTablet() {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform));
}

function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  if (isMobileOrTablet()) {
    return auth.signInWithRedirect(provider);
  }
  return auth.signInWithPopup(provider);
}

async function handleGoogleRedirectResult() {
  try {
    const result = await auth.getRedirectResult();
    if (result && result.user) {
      await createOrUpdateUserDoc(result.user);
    }
    return result;
  } catch (err) {
    return { error: err };
  }
}

async function registerUser(username, email, password) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  await cred.user.updateProfile({ displayName: username });
  await db.collection("users").doc(cred.user.uid).set({
    username,
    email,
    categories: ["Work", "Personal", "Health", "Finance", "Other"],
    createdAt:  firebase.firestore.FieldValue.serverTimestamp()
  });
  return cred;
}

function signOutUser() {
  return auth.signOut();
}

// Ensures the user doc exists (covers edge cases on re-login).
async function createOrUpdateUserDoc(user) {
  const ref  = db.collection("users").doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return ref.set({
      username:   user.displayName || "",
      email:      user.email       || "",
      categories: ["Work", "Personal", "Health", "Finance", "Other"],
      createdAt:  firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}
