# ExamNest

A production-ready mock test platform. Candidates take tests with no account;
a single admin logs in to manage tests, questions and results.

Stack: vanilla HTML/CSS/JS + Firebase (Auth + Firestore + Hosting). No build
step — everything runs directly as static files.

## 1. Create a Firebase project

1. Go to the [Firebase Console](https://console.firebase.google.com) and create a project.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create exactly one admin user under **Authentication → Users** (this app is single-admin — do not create more).
4. Enable **Firestore Database** (start in production mode).
5. Deploy the rules in `firestore.rules` (Firestore → Rules tab, paste and Publish).

## 2. Add your config

Open `js/firebase.js` and replace the placeholder `firebaseConfig` object with
the values from **Project Settings → General → Your apps → SDK setup and
configuration**. Every page imports from this one file, so this is the only
place you need to edit.

## 3. Seed a test (optional)

You can create your first test entirely from the UI:
1. Log in at `login.html` with the admin account you created.
2. Dashboard → Mock Tests → **Create Test**, fill in title/duration/negative marking, save (it starts as a draft).
3. Upload Questions → choose the test → upload a `.csv` or `.xlsx` with columns:
   `Question, Option A, Option B, Option C, Option D, Answer`
4. Back in Mock Tests, click **Publish** on the test so it appears on Get Test.

## 4. Deploy

Firebase Hosting (recommended, since it's already in your stack):

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # point the public directory at this folder
firebase deploy
```

Any static host works too (Netlify, Vercel, GitHub Pages) — there is no
server-side code to deploy, only static files.

## Folder structure

```
index.html            Landing page
get-test.html          Public test list
login.html             Admin login
dashboard.html         Admin: overview, mock tests, question bank
upload.html            Admin: CSV/XLSX question upload
settings.html          Admin: password, defaults, backup export
results-admin.html     Admin: all candidate attempts
exam.html              Candidate: CBT exam interface
result.html            Candidate: score + analysis

css/                   style.css, dashboard.css, exam.css, result.css
js/                    firebase.js, auth.js, dashboard.js, upload.js,
                       exam.js, result.js, storage.js, utils.js
firestore.rules        Security rules for the data model above
```

## Notes

- Candidate attempt history lives in `localStorage` on each browser — there is
  no candidate account, by design.
- Uploaded CSV/XLSX files are parsed in-browser and never uploaded anywhere;
  only the validated question rows are written to Firestore.
- Admin pages (`dashboard.html`, `upload.html`, `settings.html`,
  `results-admin.html`) all call `guardAdminPage()` before rendering anything,
  and use `Cache-Control: no-store` plus a `pageshow`/bfcache re-check so the
  browser Back button can never reopen them after logout.
