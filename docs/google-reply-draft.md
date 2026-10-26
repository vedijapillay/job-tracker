# Draft reply to Google's second verification email

Send this as a reply to Google's email, after you have recorded and uploaded the new video. Replace the link, check every statement is still true, and do not paste the client secret.

Subject: Re: (keep Google's subject line)

---

Hello,

Thank you for the review. I have recorded a new demonstration video and uploaded it as Unlisted:

[NEW YOUTUBE LINK]

The video shows, for the single scope `https://www.googleapis.com/auth/gmail.readonly`:

1. The complete flow in a real Google project: the user clicks Scan Gmail, signs in, sees the consent screen with the permission fully expanded and readable (the client ID is visible in the address bar), and sees the scan results.
2. Every feature that uses the scope: finding job-related emails, classifying each one on the user's own computer, and the user choosing Add to Tracker, Update existing job, or Not a job email. Nothing is added automatically.
3. Why a narrower scope cannot work. The outcome of an application is often only in the message body (the video shows an email whose subject, "Update on your application", says nothing, while the body contains the rejection), and the job title is taken from the body as well. `gmail.metadata` does not return the message body and does not allow the search query the app uses to find job emails. The add-on scopes only work on one open message inside Gmail, so they cannot scan the inbox. `gmail.readonly` is the narrowest scope that supports searching and reading messages.
4. Source account impact: the scope is read-only. The app does not send, label, move or delete email, and the video shows the Gmail inbox unchanged after the scan.
5. Scope matching: the Cloud Console Data Access page lists only `gmail.readonly`, which is the only scope the app requests.

The app is open source and runs on the user's own computer. Email content is processed locally and is not sent to me or to any third party. Project page and privacy policy: https://jobtracker.vedijapillay.dev/ and https://jobtracker.vedijapillay.dev/privacy.html. Guide for reviewers: https://jobtracker.vedijapillay.dev/reviewers.html

Please let me know if you need anything else.

Thank you,
Vedija Pillay
