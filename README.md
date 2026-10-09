# Job Tracker

**Track every job application in one place, privately, on your own computer.**

[![CI](https://github.com/vedijapillay/job-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/vedijapillay/job-tracker/actions/workflows/ci.yml)

A free, open-source job application tracker. Add jobs by hand, or let an optional, read-only Gmail scan find your application confirmations, interview invitations, offers and rejections and update the tracker for you. There is no account to create and no cloud service: your data stays in one file on your machine.

<!--
Screenshots: run `npm run demo`, take two screenshots in a full-size browser window, save them as
docs/images/dashboard.png and docs/images/scan-results.png, then replace this comment with:

![The job dashboard](docs/images/dashboard.png)
![Scan results](docs/images/scan-results.png)
-->

**Project page:** <https://jobtracker.vedijapillay.dev/> · **Privacy policy:** <https://jobtracker.vedijapillay.dev/privacy.html>

## Try it in 30 seconds

You need [Node.js](https://nodejs.org) **20.17 or newer**.

```bash
git clone https://github.com/vedijapillay/job-tracker.git
cd job-tracker
npm run setup
npm run demo
```

Then open **http://localhost:3000**. The demo has sample jobs and a **simulated** Gmail scan, so you can try everything, including adding a job from an email, without connecting Google. It runs on its own temporary database, never touches your real data, and resets every time you start it. Press Ctrl+C to stop it.

## What it does

- **One dashboard** for every application: company, title, status, source and date.
- **Statuses that match a real job search:** Applied, Recruiter Screen, Technical Round, HM Round, Interview Scheduled, Offer, Rejected, Declined by You, Ghosted.
- **Filter** by status or source, **delete** one job or many at once, and **export to CSV** whenever you like.
- **Optional Gmail scan** that finds job emails and suggests changes. You review every suggestion. Nothing is added automatically.
- **No duplicates:** if an email is about a job you already track, the app offers to move that job forward (for example Applied to Rejected) instead of adding a second row.
- **Private by design:** no accounts, no analytics, no server run by anyone but you.

## Use it for real

```bash
npm run setup    # once: installs dependencies and builds the web app
npm start        # runs everything on one port
```

Open **http://localhost:3000**. The tracker works fully without any Google setup. Your jobs are saved in `jobs.db` in the project folder.

## Gmail scanning (optional)

Click **Scan Gmail** (or **Gmail setup**) and the app walks you through connecting your inbox.

**Why you create your own Google project.** Reading email is a sensitive permission, so instead of sharing one project between everyone, you create your own free Google Cloud project once (about 10 minutes), paste its Client ID and secret into the app, and click **Save and test**. Nothing is shared with anyone, and your emails never leave your computer.

**One tip that saves you a weekly chore:** after creating your credentials, open the consent screen's **Audience** page in Google Cloud and click **Publish app**. It's your own personal project, so Google doesn't review it. Without this, Google asks you to sign in again every 7 days. You'll see a "not verified" warning when you sign in; choose **Advanced**, then continue.

Developers can put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in a `.env` file instead (see [`.env.example`](.env.example)). Credentials saved in the app take precedence.

### What the scan does

- Reads recent **inbox** emails (up to the last 180 days) that mention job-related words. It skips Gmail's Promotions and Social tabs, except for mail from known job sites and application systems.
- Decides on your computer whether each email is an **application confirmation, interview or screening, assessment, offer, rejection or withdrawal**, and picks out the company and job title when it can.
- Shows you the results. For each one you can **add it**, **update an existing job**, **edit it first**, or click **Not a job email** so it never shows up again.
- **Never** sends, changes or deletes email. The permission it asks for is read-only.

### Limits you should know about

- The classifier is **rule-based, not AI**. It works on English-language emails and will sometimes miss one or get one wrong, which is why you review every result.
- A recruiter writing from a personal address (Gmail, Outlook and so on) may show up with the company "Unknown". Fill it in before adding.
- It reads the inbox only, and only Gmail is supported today.
- Automated tests run on Linux and Windows for every change. The real Gmail sign-in has so far been tried by hand mostly on macOS, so tell us if something breaks elsewhere.

## Privacy

Job Tracker runs on your computer. There is no Job Tracker server, account or cloud service, and the app contains no analytics or tracking.

- Your jobs are stored in `jobs.db` in the app folder, on your machine.
- Gmail scanning is optional and read-only. Email content is processed on your computer, and **email text is not saved**.
- To scan without asking you to sign in every time, the app **saves a Google sign-in token** in `jobs.db` (and your Google client ID and secret, if you enter them in the app). Protect that file like your other personal files. **Disconnect Gmail** deletes the token, and you can revoke access any time in your [Google Account permissions](https://myaccount.google.com/permissions).
- The only outside service the app talks to is Google, to sign you in and read your Gmail.
- The server only listens on `127.0.0.1`, rejects requests with an unexpected `Host` header, and refuses cross-site requests, so other devices on your network and other websites can't read your jobs or use your Gmail connection.

Read the full [Privacy Policy](https://jobtracker.vedijapillay.dev/privacy.html).

## Your data

Everything is in one SQLite file, `jobs.db`, created on first run.

- **Back it up:** copy the file. **Move it:** set `JOBS_DB_PATH` (see [`.env.example`](.env.example)).
- **Delete everything:** stop the app and delete `jobs.db`.
- **Export:** the **Export CSV** button downloads your jobs as a spreadsheet.

## Troubleshooting

| Problem | What to do |
|---|---|
| **"Port 3000 is already in use"** | Stop the other program, or use another port by adding `PORT=3001` to a `.env` file (see [`.env.example`](.env.example)) and running `npm start` again. If you use Gmail scanning, add the new redirect address (`http://localhost:3001/api/gmail/auth/callback`) in Google Cloud. |
| **`npm run setup` fails on `sqlite3`** | Check `node -v` shows 20.17 or newer. The database engine downloads a prebuilt file for most computers; on unusual ones it needs a C++ build toolchain. |
| **Google says the app isn't verified** | Expected for your own project. Choose **Advanced**, then continue. |
| **Google keeps asking me to sign in again** | Your Google project is probably still in "Testing". Publish it (see the Gmail tip above). Google may also ask again if you change your Google password. |
| **The scan finds nothing** | It looks at the inbox for the last 180 days, in English, and skips emails you've already added or dismissed. Try `npm run demo` to see what a result looks like, and [open an issue](https://github.com/vedijapillay/job-tracker/issues) with the sender and subject (no private content) if a real email was missed. |

## Development

```bash
npm run dev          # API with auto-reload on :3000
npm run dev:client   # web app with hot reload on :5173 (proxies /api to :3000)
npm run demo         # sample data and a simulated Gmail scan, in a separate database
npm test             # the test suite (temporary database, stubbed Gmail, no network)
```

When you run the web app separately for development, set `FRONTEND_URL=http://localhost:5173` so Google's sign-in returns to the right place. Built with Node.js, Express and SQLite on the server, and React, Vite and Tailwind CSS in the browser. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to help.

Installing reports some warnings from build tools (Vite and Tailwind) in the web app's dependencies. They affect only the development server, not the app you run, and the server's own dependencies audited clean when this was written.

## Roadmap

- One-click Google sign-in without creating your own Google project (needs Google's approval, which is in progress)
- More mail providers, such as Outlook or any IMAP inbox
- Better classification, based on the emails people report as missed or wrong
- Optional AI-assisted classification, only if people ask for it

## License and disclaimer

Open source under the [MIT License](LICENSE). Provided "as is", without warranty of any kind; use it at your own risk. Job Tracker is an independent project and is not affiliated with or endorsed by Google or LinkedIn.

Questions or problems? [Open an issue](https://github.com/vedijapillay/job-tracker/issues).
