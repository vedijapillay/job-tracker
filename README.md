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
- Node.js 16+ installed
- npm or yarn package manager

### Quick Start

1. **Clone the repository:**
```bash
   git clone https://github.com/vedijapillay/job-tracker.git
   cd job-tracker
```

2. **Install dependencies:**
```bash
   npm install
   cd client && npm install && cd ..
```

3. **Set up environment variables:**
```bash
   cp .env.example .env
```
   
   Then edit `.env` and add your Google OAuth credentials (optional - only needed for Gmail scanning):

GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/auth/callback
FRONTEND_URL=http://localhost:5173


4. **Start the application:**
   
   **Terminal 1 - Backend:**
```bash
   npm start
```
   Backend runs on `http://localhost:3000`

   **Terminal 2 - Frontend:**
```bash
   cd client && npm run dev
```
   Frontend runs on `http://localhost:5173`

5. **Open in browser:**

http://localhost:5173


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

- [ ] Refresh token handling (no re-consent needed)
- [ ] Batch email fetching for faster scans
- [ ] Better email classification logic
- [ ] UI improvements and customization
- [ ] Dark mode
- [ ] Mobile app (React Native)

---

**Built with ❤️ for job seekers everywhere**
