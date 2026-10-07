# Publishing the site on GitHub Pages

The site files are in `site/`: `index.html` (home page), `privacy.html` (privacy policy), `style.css`, `404.html`, `robots.txt` and `.nojekyll`.

The goal is these two public addresses, on a site you control:

- Homepage: `https://vedijapillay.github.io/`
- Privacy policy: `https://vedijapillay.github.io/privacy.html`

A GitHub Pages **user site** must live in its own repository named exactly `vedijapillay.github.io`. It cannot be a folder of the `job-tracker` repository.

## 1. Create the repository

On GitHub: **New repository**, name it `vedijapillay.github.io`, set it to **Public**, and leave "Add a README" **unchecked**.

## 2. Push the site

Copy the files into a new folder and push them. Run this from any terminal:

```bash
mkdir ~/vedijapillay.github.io
cp -R ~/job-tracker/site/. ~/vedijapillay.github.io/
cd ~/vedijapillay.github.io
git init -b main
git add .
git commit -m "Add Job Tracker landing page and privacy policy"
git remote add origin https://github.com/vedijapillay/vedijapillay.github.io.git
git push -u origin main
```

If git asks you to sign in, use the GitHub CLI (`gh auth login`) or your credential manager. **Do not put an access token in the remote URL.**

## 3. Turn on Pages

In the new repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, then choose **main** and **/ (root)**, and save. After a minute or two, open `https://vedijapillay.github.io/` and click through to the privacy policy.

## 4. Verify you own the site (Google Search Console)

Google checks that the homepage is on a domain you control.

1. Open [Google Search Console](https://search.google.com/search-console) and add a property of type **URL prefix**: `https://vedijapillay.github.io/`. (A "Domain" property is not possible for a `github.io` address.)
2. Choose the **HTML tag** method. Google gives you a tag like `<meta name="google-site-verification" content="...">`.
3. In `index.html`, find the commented-out `google-site-verification` line in the `<head>`, replace it with your real tag (without the comment markers), then commit and push.
4. Wait for GitHub Pages to redeploy, then click **Verify** in Search Console.

You can use the **HTML file** method instead: download the `googleXXXXXXXX.html` file Google gives you, put it in the repository root and push it.

## 5. Update the Google consent screen

In your Google Cloud project's OAuth consent screen / branding settings:

- **Application home page:** `https://vedijapillay.github.io/`
- **Application privacy policy link:** `https://vedijapillay.github.io/privacy.html`
- **Authorized domains:** `vedijapillay.github.io`
- Keep the **app name** the same as the name shown on the site and in your demo video: "Job Tracker".

Then resubmit for verification, following the instructions in Google's rejection email.

## Things to confirm yourself

- **Whether Google accepts a `github.io` address for restricted-scope verification.** I could not confirm this. Shared hosting domains are handled specially. If Google rejects it again, the fix is the same pages on a domain you own (a custom domain on GitHub Pages works: add it under Settings → Pages and add a `CNAME` file).
- **The privacy policy against the app.** It describes what Job Tracker does today. If you add analytics, cloud features or anything that sends email text elsewhere, update the policy first. It is not legal advice.
- **Contact method.** The policy points to GitHub Issues so your personal email isn't published. If Google or a reviewer wants an email address, add one to the Contact section.

## Keeping one copy

After pushing, the live site is the copy in the `vedijapillay.github.io` repository. To avoid two versions drifting apart, either delete `site/` from this repository, or keep it only as a template and always edit the Pages repository.
