# Zenvio — Task Manager

Pure static web app (no build step). Firebase is loaded entirely via CDN.

## Stack

- **HTML/CSS/JS** — no framework, no bundler
- **Firebase** v10 compat SDK via CDN (auth + Firestore)
- **Fonts** — Syne (headings) + DM Sans (body) via Google Fonts
- **Deploy** — Netlify (drag & drop or git-connected)

## File structure

```
index.html          entry point
config.js           Firebase project config (public client keys)
css/styles.css      all styles — design tokens, components, responsive
js/
  firebase.js       initializes firebase app, auth, db instances
  auth.js           auth helpers: email/password, Google sign-in/redirect
  tasks.js          Firestore CRUD + realtime subscription
  app.js            UI logic: renders tasks, modal, stats, auth state
firebase/
  rules.txt         Firestore security rules (paste into Firebase Console)
  indexes.txt       composite indexes needed (create in Firebase Console)
```

## Firebase project

- **Project ID:** `apw-tareas`
- **Auth domain:** `apw-tareas.firebaseapp.com`
- **Enabled sign-in methods:** Email/Password, Google

## Key decisions

- Firebase compat SDK (not modular) — lets all JS files share globals `auth` and `db` without a bundler.
- Google sign-in uses `signInWithRedirect` on mobile/tablet and `signInWithPopup` on desktop — popup gets blocked by mobile browsers.
- `getRedirectResult()` is called on every page load in `app.js` to capture the user returning from the Google OAuth redirect.

## Deploying to Netlify

### Drag & drop
1. Open [app.netlify.com](https://app.netlify.com) → Sites → drag this folder.
2. Done. The `netlify.toml` sets `publish = "."` and adds a catch-all redirect for SPA routing.

### Git-connected
1. Push to GitHub/GitLab.
2. New site → import from git → no build command, publish dir `.`
3. Add the Netlify domain to **Firebase Console → Authentication → Authorized domains**.

## After deploying

- Add the live Netlify URL to **Firebase Console → Authentication → Authorized domains** — Google sign-in will fail without this.
- Paste `firebase/rules.txt` into **Firestore → Rules**.
- Create the composite indexes from `firebase/indexes.txt` in **Firestore → Indexes**.

## Running locally

No server needed — open `index.html` directly in a browser, or use any static server:

```bash
npx serve .
# or
python3 -m http.server 8080
```
