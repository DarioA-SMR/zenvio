import { initializeApp }                      from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, setPersistence,
         browserLocalPersistence }             from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore }                        from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig }                      from "../firebase-config.js";

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(console.error);
