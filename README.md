# ExamNest

ExamNest is a lightweight CBT-style mock test platform built with plain HTML, CSS, JavaScript, and Firebase. Candidates can browse published tests, read instructions, take timed exams, resume unfinished attempts, retest after submission, and view results. Admins can manage tests, upload questions, inspect the question bank, and view submissions.

## Features

- Public test listing with Start Test, Resume, and Retest states
- Timed exam interface with auto-save and auto-submit on time up
- Final submit confirmation before locking answers
- Result screen with score, accuracy, time used, and answer review
- Admin dashboard for test management
- Question upload and question bank editing
- Bulk question selection and delete
- Firestore-backed test, question, and attempt records
- Responsive layouts for desktop and mobile

## Project Structure

```text
.
├── index.html              # Public landing page
├── get-test.html           # Published test listing
├── instructions.html       # Test instructions before exam
├── exam.html               # Candidate exam screen
├── result.html             # Candidate result and review
├── login.html              # Admin login
├── dashboard.html          # Admin overview and mock tests
├── upload.html             # Question upload
├── question-bank.html      # Question management
├── results-admin.html      # Admin submissions view
├── settings.html           # Admin settings and backup
├── firestore.rules         # Firebase security rules
├── css/
└── js/
```

## Run Locally

This project has no build step. Serve the folder with any static server:

```bash
python -m http.server 4173
```

Open:

```text
http://localhost:4173
```

## Firebase Setup

Firebase is initialized in:

```text
js/firebase.js
```

Update `firebaseConfig` with your Firebase project details if you move to a new Firebase project.

Firestore collections used:

- `tests/{testId}`
- `tests/{testId}/questions/{questionId}`
- `attempts/{attemptId}`
- `settings/{docId}`

Deploy Firestore rules after changing `firestore.rules`.

## Admin Notes

- Admin access uses Firebase Auth.
- Candidates do not need accounts.
- Candidate in-progress exam state and attempt summary are also stored locally in the browser for Resume/Retest UI.
- Deleting a test removes its questions and related attempt records.

## Deployment

Upload or deploy the static files to your hosting provider. If using Firebase Hosting, also deploy Firestore rules so dashboard deletion permissions work correctly.

```bash
firebase deploy
```

If only rules changed:

```bash
firebase deploy --only firestore:rules
```
