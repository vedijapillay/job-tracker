# Security policy

Job Tracker runs on your own computer and can hold a Google sign-in token for your Gmail. Security reports are welcome and taken seriously.

## How to report a vulnerability

**Please report it privately, not in a public issue.**

1. Open the [private vulnerability report form](https://github.com/vedijapillay/job-tracker/security/advisories/new). Only the maintainer can see it.
2. Describe what you found, how to reproduce it, and what an attacker could do with it.
3. Please do **not** include real email content, real tokens, passwords or anyone else's personal data. A description or an invented example is enough.

This is a volunteer-run, open-source project. I'll read every report and reply as soon as I can, usually within a week, but I can't promise a timetable. If a report is confirmed I'll work on a fix, tell you when it's released, and credit you if you'd like.

## What counts as a vulnerability

For example:

- Another website, or another device on the network, being able to read or change someone's jobs, use their Gmail connection, or reach the server at all (the server is meant to listen only on the user's own computer)
- Email content, a Google sign-in token or Google credentials being exposed, sent anywhere, or written where they shouldn't be
- A flaw in the sign-in flow that lets someone connect the wrong account
- A weakness in a dependency that ships and runs in the app (not in build or developer tools)

## Known design decisions (not vulnerabilities)

These are deliberate and are described in the [README](README.md) and the [privacy policy](https://jobtracker.vedijapillay.dev/privacy.html):

- The Google sign-in token, and the Google client ID and secret if you enter them in the app, are stored as plain text in the local `jobs.db` file. Anyone who can read your files can read them, so protect the file like your other personal files (for example with a device password and disk encryption). **Disconnect Gmail** deletes the token.
- Someone with access to your user account on your computer can read `jobs.db`. The app can't protect against that.
- Google shows a "not verified" warning when you sign in with your own Google project. That is Google's standard screen for personal projects.
- Warnings from build and development tools (such as Vite and Tailwind CSS) in the web app's dependencies. They don't ship in the app.

## Supported versions

Only the latest version on the `main` branch is supported. There are no separate release lines yet.

## Staying safe as a user

- Keep `jobs.db` private, and don't share it or commit it anywhere.
- Don't change the `HOST` setting to expose the app to your network unless you know why you need to.
- Remove the app's access any time at [Google Account permissions](https://myaccount.google.com/permissions).
