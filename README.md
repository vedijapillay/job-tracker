# Job Tracker

A full-stack application to consolidate job applications from multiple platforms (LinkedIn, Builtin, ZipRecruiter, Jobright, Greenhouse) into one centralized dashboard.

## Features

- 📊 **Centralized Dashboard** - Track all job applications in one place
- 📝 **Manual Entry** - Add jobs with company, title, status, and notes
- 🔍 **Gmail Scanner** - Auto-detect job rejections and interview invitations from emails
- 🎯 **Smart Filters** - Filter by status, source, and date range
- 📥 **CSV Export** - Export your job tracker data anytime
- 🔐 **Privacy First** - All data stays on your machine (no cloud storage)
- 💾 **SQLite Database** - Zero setup, user-owned data

## Tech Stack

- **Backend:** Node.js + Express + SQLite
- **Frontend:** React + Vite + Tailwind CSS
- **Email Integration:** Google Gmail API (optional)

## Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org) **20.17 or newer**

### Quick Start

```bash
git clone https://github.com/vedijapillay/job-tracker.git
cd job-tracker
npm run setup    # installs dependencies and builds the web app
npm start        # runs everything on one port
```

Then open **http://localhost:3000**. That's it: the tracker works fully without any Google setup.

Gmail scanning is optional and needs your own Google credentials; see [Gmail scanning setup](#gmail-scanning-setup-optional) below.

### Gmail scanning setup (optional)

Click **Scan Gmail** (or **Gmail setup**) and the app walks you through connecting your inbox. It uses **your own free Google Cloud project**, so nothing is shared with anyone and your emails never leave your computer. You create the project once (about 10 minutes), paste the Client ID and secret into the app, and click **Save and test**.

The credentials are stored only in your local database. Developers can instead put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in a `.env` file (see `.env.example`); credentials saved in the app take precedence.

### Security

The server only listens on `127.0.0.1`, rejects requests with an unexpected `Host` header, and refuses cross-site requests, so other devices on your network and other websites can't read your jobs or use your Gmail connection.

### For developers

```bash
npm run dev          # API with auto-reload on :3000
npm run dev:client   # web app with hot reload on :5173 (proxies /api to :3000)
npm test             # run the test suite (temporary database, stubbed Gmail)
```

## How to Use

### Add Jobs Manually
1. Click **+ Add Job**
2. Fill in company name, job title, and other details
3. Click **Add Job**

### Scan Gmail (Optional)
1. Click **🔍 Scan Gmail**
2. Authorize access to your Gmail account
3. The app will scan recent emails and auto-detect:
   - **Rejections** (no-reply emails with "regret", "not selected", etc.)
   - **Interview Invitations** (from recruiters mentioning "interview", "next round", etc.)
4. Review detected jobs and add them to your tracker

### Manage Jobs
- **Update Status:** Click dropdown to change job status
- **Filter:** Use filters by status and source
- **Delete:** Click the red Delete button
- **Export:** Click **📥 Export CSV** to download all jobs

## Job Statuses

- **Applied** - Initial application sent
- **Recruiter Screen** - Phone/video screening scheduled
- **Technical Round** - Coding interview or technical assessment
- **HM Round** - Hiring manager interview
- **Interview Scheduled** - Auto-detected from Gmail
- **Offer** - Offer received
- **Rejected** - Auto-detected from Gmail or marked manually
- **Declined by You** - You declined the opportunity
- **Ghosted** - No response from company

## Database

Job data is stored in `jobs.db` (SQLite) in the project root. This file:
- Is created automatically on first run
- Stays on your computer (never uploaded anywhere)
- Can be backed up or shared with others

## Contributing

Want to improve Job Tracker? Check out [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is open source under the MIT License. See [LICENSE](LICENSE) file for details.

## Support

Issues or questions? [Open an issue on GitHub](https://github.com/vedijapillay/job-tracker/issues)

## Roadmap

- [ ] Better email classification logic
- [ ] UI improvements and customization
- [ ] Dark mode
- [ ] Mobile app (React Native)
## Privacy

All job data is stored locally on your machine in `jobs.db`. 
No data is sent to our servers. Gmail emails are scanned on-demand only.
Your Gmail credentials are never stored.

## Terms of Service

This project is open source under MIT License. Use at your own risk.
---

**Built with ❤️ for job seekers everywhere**
