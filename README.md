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

---

## SEO Setup (IMPORTANT — do this before submitting to Google)

All SEO files currently use the placeholder domain **`https://examnest.web.app`**.
Replace it with your real live domain everywhere, in one command:

```bash
# Run from the project root. Replace the second URL with your actual domain.
grep -rl "https://examnest.web.app" . --include=*.html --include=*.xml --include=*.txt \
  | xargs sed -i 's|https://examnest.web.app|https://your-real-domain.com|g'
```

Files that contain the domain: `index.html`, `get-test.html`, `sitemap.xml`, `robots.txt`.

### What was added

| File | Purpose |
|---|---|
| `robots.txt` | Allows public pages, blocks all admin/exam/result routes, points to the sitemap |
| `sitemap.xml` | Lists indexable public URLs for Google |
| `index.html` | Title, description, keywords, canonical, Open Graph, Twitter Card, WebSite + FAQPage structured data |
| `get-test.html` | Title, description, canonical, Open Graph, Twitter Card |

### Indexing rules applied

- **Indexed:** `index.html`, `get-test.html`
- **Not indexed** (`noindex`): `login.html`, `dashboard.html`, `upload.html`,
  `question-bank.html`, `settings.html`, `exam.html`, `result.html`, `instructions.html`

Admin and live-exam pages are deliberately hidden from search so candidates can
never land on a half-loaded exam or an admin screen from a Google result.

### Firebase Hosting note

Make sure your `firebase.json` **does not** ignore the new files, or they won't
deploy. The `ignore` array should not contain `robots.txt` or `sitemap.xml`.

### Submitting to Google

1. Deploy the site (`firebase deploy`).
2. Confirm `https://your-domain.com/robots.txt` and `/sitemap.xml` load in a browser.
3. Go to [Google Search Console](https://search.google.com/search-console) → add your property.
4. Verify ownership (the HTML-tag method is easiest — paste the tag into `index.html`'s `<head>`).
5. Open **Sitemaps** in the left menu and submit `sitemap.xml`.
6. Use **URL Inspection → Request Indexing** on your homepage to speed things up.

Indexing usually takes a few days to a couple of weeks.