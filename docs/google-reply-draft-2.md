# Draft reply to Google's third verification email

Send as a reply to Google's email. Before you send: check the three statements marked CHECK, put your video link in, and do not paste the client secret.

Subject: Re: (keep Google's subject line)

---

Hello,

Thank you for the review. This is my response to each item.

**Scope discrepancy.** The app requests exactly one scope, `https://www.googleapis.com/auth/gmail.readonly`. It is the only value in the authorization request (`SCOPES` in server/routes/gmail.js, in the public repository https://github.com/vedijapillay/job-tracker). The Data Access page in the Cloud Console lists the same single scope, and no other scope is configured. CHECK: confirm this on the Data Access page before sending.

**Scope justification.** I have updated the justification to describe the full user journey. The user clicks Scan Gmail and signs in. The app searches the inbox for job-related emails, reads each one on the user's own computer and detects its type (confirmation, interview, offer, rejection), the company and the job title. The user reviews each result and chooses Add to Tracker, Update existing job, or Not a job email. Nothing is added automatically. Disconnect Gmail deletes the saved sign-in. Narrower scopes cannot do this: gmail.metadata does not allow the search query the app uses and does not return the message body, and the outcome and job title are often only in the body; add-on scopes only work on one open message.

**Demo video.** The new video is here (Unlisted): [YOUTUBE LINK]. It shows the consent screen with the permission fully expanded and readable (at 00:31, including "View your email messages" and "Search your email messages"), the complete scan and review flow, an email whose subject says nothing about the outcome while the body contains the rejection, and the Cloud Console Data Access page with the single scope. CHECK: remove any item in this paragraph that the video does not show.

**Source account impact.** The scope is read-only, so the app makes no change to the Google account. The video shows the Gmail inbox unchanged after the scan: no labels, no moved or deleted mail, nothing sent.

**Test credentials and navigation.** The app has no login and no hosted service. It runs on the reviewer's own computer, and each user connects their own Gmail account. Step-by-step instructions for reviewers, including a demo mode that needs no Google sign-in, are here: https://jobtracker.vedijapillay.dev/reviewers.html. CHECK: confirm the guide still describes the steps accurately.

**Live apps.** There is no hosted production service, so no unverified scope is deployed to users. The publishing status is In production.

Please tell me if anything is still unclear, or if a specific scope or video detail is missing, and I will provide it right away.

Thank you,
Vedija Pillay
