# Contributing to Job Tracker

Thanks for helping! Here's how to contribute.

## Setup
1. Clone the repo
2. `npm run setup` (installs both apps and builds the web app)
3. `npm start`, then open http://localhost:3000

For development with live reload, run `npm run dev` (API on :3000) and `npm run dev:client` (web app on :5173) in two terminals.

Gmail scanning needs Google credentials. Click **Scan Gmail** in the app for a guided setup, or put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in a `.env` file (see `.env.example`).

## Tests
```bash
npm test
```

Tests live in `test/` and use Node's built-in test runner. They run against a temporary database and a stubbed Gmail, so they never touch your `jobs.db` or your real mailbox.

- Changing how emails are classified? Add a case to `test/classify.test.js`.
- **Use invented emails only.** Never put real email content, names or addresses in the repository.
- Fixing a bug? Add a test that fails without your fix.

## What to Work On
- Better classification for emails the app misses or gets wrong (open an issue with the sender and subject, without private content)
- Support for more mail providers
- A sample-data mode for trying the app without Gmail
- UI improvements

## Before Submitting
- Run `npm test`
- No breaking changes
- Update the README if behavior changes
- Submit a Pull Request
