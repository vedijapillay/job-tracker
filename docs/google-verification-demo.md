# Demo video for Google OAuth verification

A recording script and checklist for the demo video Google asks for when you apply to verify an app that uses a restricted Gmail scope. It shows the Job Tracker Gmail scan from start to finish.

> **Check Google's current rules before you record.** Verification requirements change. Read the official "OAuth Application Verification" and "Restricted scope verification" pages in the Google Cloud console help first, and compare them with the checklist below. The points here are the ones reviewers most often ask for, not a guarantee.

Target length: **2.5 to 3 minutes.** Narrate in English.

---

## 1. What Google needs to see

- The **OAuth consent screen**, in English, with the **browser address bar visible and the `client_id=` part of the URL readable**.
- The **app name on the consent screen matching** the name in your Google Cloud consent screen settings.
- The **permissions being requested** (Gmail read-only), and a clear account of **how the app uses each one**.
- The **whole flow**: the user clicks something in the app, goes through Google's sign-in and consent, comes back, and the app uses the data.
- A way for the user to **disconnect and remove access**.

Your script below covers all five. It also adds two things your original outline didn't have (the consent-screen close-up and the disconnect step), because reviewers commonly ask for them.

> **Your outline said "OAuth popup". The app now uses a full-page redirect:** the browser leaves the app, signs in at Google, and returns. Record what actually happens, and don't call it a popup in the narration.

---

## 2. Before you record

### Use a dedicated test account, not your own inbox
- Create or pick a **separate Gmail account** just for the demo.
- Add it as a **Test user** on your OAuth consent screen (needed while the app is in Testing mode).
- Send it the **five sample emails** in section 5, so the scan has something realistic to find.
- Do not record real personal email on screen. If any appears in the video you will have to re-record.

### Start the app with an empty demo database
Your real jobs must not appear in the video. Free port 3000 (stop any other copy of the app), then run:

```bash
npm run setup                                  # first time only
JOBS_DB_PATH=$HOME/demo-jobs.db npm start
```

Then open **http://localhost:3000**. The tracker starts empty.

- The demo database has no saved Google sign-in, so the full consent screen will appear (the app also asks Google for consent every time).
- Google credentials come from your `.env` file. If you normally save them in the app's settings instead, enter them in the demo database **before** recording, off-camera.
- **Never open the "Gmail setup" screen while recording.** Keep the client secret and any tokens out of the video.

### Set up your screen
- Use a normal browser window (not incognito), with the **address bar visible** and **no other tabs or bookmarks** that show personal information.
- Make sure the test Google account's language is **English**, so the consent screen is in English.
- Resolution **1920×1080** (or 1280×720). Zoom the browser to about **110–125%** so text is readable on small screens.
- Turn on **Do Not Disturb** and close chat, email and notification apps.
- Close developer tools.
- Do a short test recording and listen to it before the real take.

### Rehearse once
Run the whole flow once without recording. Delete the demo job it adds (or delete `~/demo-jobs.db` and restart) so the real take starts clean.

---

## 3. Recording on Mac and Windows

### Mac
1. Press **Shift + Command + 5**.
2. Choose **Record Entire Screen** (or **Record Selected Portion** around the browser).
3. Click **Options** and set **Microphone** to your microphone. Turn on **Show Mouse Clicks**. Pick a save location.
4. Click **Record**. To stop, click the stop icon in the menu bar (or press the same shortcut again).
5. Open the file in QuickTime Player and use **Edit → Trim** to cut the start and end.

### Windows
- **Easiest:** Xbox Game Bar. Press **Win + G**, then use the Capture widget (or **Win + Alt + R** to start and stop). It records **one app window**, so keep everything in a single browser window. Turn on the microphone in the widget. Files save to `Videos\Captures` as MP4.
- **More control:** [OBS Studio](https://obsproject.com) (free, also works on Mac). Add a **Display Capture** (or **Window Capture**) source and your microphone, set output to **MP4, 1080p, 30 fps**, then **Start Recording**.

Either way: record audio **while** you capture the screen. A video with narration is clearer to reviewers than one with captions only.

---

## 4. Script

Aim for a calm pace. The times are targets, not limits. Say the lines in your own words, but cover every point in **bold**.

| Time | On screen | Say |
|---|---|---|
| **0:00–0:15** | The empty Job Tracker app at `localhost:3000`. | "This is Job Tracker, an open-source app that runs on your own computer to track job applications. It has an **optional Gmail scan that finds application emails and fills in the tracker**. I'll show that end to end, including the Google sign-in." |
| **0:15–0:35** | Point to the empty table and the **Scan Gmail** button. | "The tracker is empty. The user clicks **Scan Gmail**." |
| **0:35–0:50** | Click **Scan Gmail**. The browser leaves the app and shows Google's account chooser. | "The app sends the user to **Google's sign-in page**. The user chooses their account." Select the test account. |
| **0:50–1:30** | Google **consent screen**. Pause. Click into the address bar so **`client_id=` is visible**, hold 3 seconds. Then scroll the consent screen so the **app name and permission** are readable. | "This is Google's consent screen. The **app name is Job Tracker**, and you can see the **client ID in the address bar**. The app asks for **one permission: read-only access to Gmail**." Then say: "**Read-only is the minimum the app needs.** It reads the sender, subject and body of each email to decide whether it's about a job application. It **cannot send, delete or change email**. The email content is **processed on this computer only**. It goes from Google to this computer and is not sent anywhere else." Click **Allow** (or **Continue**). If you see an "unverified app" warning before verification, show it and say: "Because the app isn't verified yet, Google shows this warning. The user chooses **Advanced** and continues." |
| **1:30–1:45** | Back in the app. The button shows **Working…** while the scan runs. | "Google sends the user back to the app, and the scan starts. The app searches recent job-related emails in the inbox and classifies them locally." (Speed this part up in editing if it takes more than a few seconds.) |
| **1:45–2:15** | The **Detected Job Applications** window. Slowly scroll through the cards. | "Here are the results. The app found an **application confirmation**, an **interview invitation**, an **offer**, and a **rejection**. Each card shows the company, the job title, the status the app detected, and the email it came from. A non-job email, like a message from a friend, is **ignored**. The user can also click **Not a job email** to dismiss one and never see it again." |
| **2:15–2:35** | Edit a field if you like (for example change the status). Click **Add to Tracker** on the interview card. | "The user reviews each result and can edit it. They choose **Add to Tracker** for the ones they want. **Nothing is added automatically.**" |
| **2:35–2:50** | Close the window with **Close**. The tracker table now shows the job. | "Back on the dashboard, the job is now in the tracker, with its status, source and date." |
| **2:50–3:05** | Point to **Disconnect Gmail** and click it. | "The user stays in control. **Disconnect Gmail** removes the saved sign-in from this computer. They can also remove the app's access at any time from their Google Account permissions page. **All job data and the Google sign-in stay on this computer.**" |

### What to avoid saying or showing
- Real names, real email addresses or real company emails other than the test ones.
- The Client secret, refresh token, `.env` file or the Gmail setup screen.
- Any claim you can't back up. Don't say data is "encrypted" (the sign-in is stored in the local database as plain text), and don't say it can never leave the computer if you plan to add cloud features later.

---

## 5. Sample emails for the test account

Send these five to the test Gmail account from a **different** Gmail account (any display names are fine, since the app reads company and title from the subject and body). Send them a few minutes before recording so they are in the **Primary** tab.

I checked each one against the app's classifier:

| # | Subject | Body | Detected as |
|---|---|---|---|
| 1 | Thanks for applying: your application to Acme Robotics | Hi Sam, Thank you for applying. We received your application for the Senior Product Manager position. Our team will review it and be in touch. | **Applied**, Acme Robotics, Senior Product Manager |
| 2 | Interview invitation: your application to Contoso Health | Hi Sam, Thank you for your application for the Product Manager role at Contoso Health. We would like to invite you to a video interview. Please select a time that works for you. | **Interview Scheduled**, Contoso Health, Product Manager |
| 3 | Offer of employment: your application to Northwind Labs | Hi Sam, Congratulations! Thank you for your application for the Director of Product position. We are pleased to offer you the role. Your offer letter is attached. | **Offer**, Northwind Labs, Director of Product |
| 4 | Update on your application to Fabrikam Systems | Hi Sam, Thank you for your interest in the Group Product Manager position. After careful consideration, we have decided to move forward with other candidates at this time. We wish you the best in your job search. | **Rejected**, Fabrikam Systems, Group Product Manager |
| 5 | Lunch on Friday? | Hey Sam, are you free for lunch on Friday? Let me know! | **Ignored** (not job related) |

Notes:
- Keep the subject lines exactly as written. The app finds the company name from "your application to <Company>" at the end of the subject.
- The company comes from "your application to <Company>" in the subject first. If the subject doesn't name one, the app falls back to the sender, and a personal address (Gmail, Outlook and so on) shows "Unknown" unless the sender name looks like an employer team, such as "Acme Careers". The subjects above name the company, so the demo is unaffected.
- If a sample lands in Promotions or Social, drag it to **Primary**. The scan skips those tabs for unknown senders.

---

## 6. Upload to YouTube as Unlisted

1. Sign in at [studio.youtube.com](https://studio.youtube.com), then click **Create → Upload videos**.
2. Select your MP4 file.
3. **Title:** for example "Job Tracker: Gmail OAuth scope demo". **Description:** one line on what the app does, the app name, the scope requested, and a link to your homepage and privacy policy.
4. Under audience, choose **No, it's not made for kids**.
5. Add **English captions** (YouTube's automatic captions are fine) so reviewers can read the narration.
6. On the **Visibility** step choose **Unlisted**. **Do not choose Private.** Reviewers can't open private videos.
7. Click **Save** and copy the link.
8. Open the link in a **private/incognito window while signed out** to confirm it plays. This is what the reviewer will see.

---

## 7. Draft text for the scope justification

Paste into the verification form and adapt it. This is a draft, not legal text.

> **Scope:** `https://www.googleapis.com/auth/gmail.readonly`
>
> **Why this scope is needed:** Job Tracker is a desktop-style app that runs on the user's own computer. It reads the sender, subject and body of recent inbox messages to detect job-application emails (confirmations, interview invitations, offers and rejections) and suggests tracker entries that the user reviews and approves.
>
> **Why a narrower scope is not enough:** Detecting the status of an application requires the message body, which the metadata-only scope does not provide. The app never sends, modifies or deletes mail.
>
> **Data handling:** Email content is processed on the user's computer only and is not transmitted to any server operated by the developer or third parties. Only the job details the user chooses to add (company, title, status, dates) are saved to a local database on the same computer. The app's use of Google user data complies with the Google API Services User Data Policy, including the Limited Use requirements.
>
> **User control:** The user can disconnect Gmail in the app at any time, which deletes the saved sign-in, and can revoke access from their Google Account permissions page.

Make sure every statement is true of the version you submit. In particular, if you ever add analytics, cloud sync or an LLM that sends email text elsewhere, this text must change **before** that ships.

---

## 8. Common reasons a demo video is sent back

- The consent screen was not shown, or the **client ID was not visible** in the address bar.
- The **app name on screen differs** from the one in the consent screen settings.
- The video doesn't show **how the data is used** after sign-in.
- The video is **Private**, not Unlisted, or the link doesn't open signed out.
- Narration or captions are **not in English**.
- The **homepage or privacy policy** link doesn't work, or isn't on a domain you've verified in Google Search Console. Check whether a free GitHub Pages address is accepted. I'm not sure it is.
- Real personal data is visible on screen.

---

## 9. Final checklist before you submit

- [ ] Recorded with the test account and the empty demo database
- [ ] Consent screen with readable `client_id=` and app name
- [ ] Every scene in section 4 covered, including Disconnect
- [ ] No secrets, tokens or personal email on screen
- [ ] Uploaded as Unlisted, with English captions, and the link opens signed out
- [ ] Scope justification matches what the app actually does
- [ ] Privacy policy and homepage URLs work
