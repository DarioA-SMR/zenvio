// Zenvio — initializes the Firebase app, auth, and Firestore instances.
// window.firebaseConfig must be populated in config.js before this file loads.

const firebaseApp = firebase.initializeApp(window.firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// Persist session across browser restarts.
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(console.error);
