# Publishing the site on GitHub Pages

The site files are in `site/`: `index.html` (home page), `privacy.html` (privacy policy), `style.css`, `404.html` and `.nojekyll`.

They are published as a **project site** from this repository, at:

- Homepage: `https://vedijapillay.github.io/job-tracker/`
- Privacy policy: `https://vedijapillay.github.io/job-tracker/privacy.html`

`vedijapillay.github.io` itself is a separate personal site (its own repository, `vedijapillay/vedijapillay.github.io`). Publishing Job Tracker does not touch it.

## How it deploys

`.github/workflows/pages.yml` publishes the `site/` folder whenever a change to `site/` is pushed to `main`. You can also run it by hand from the **Actions** tab (**Deploy site → Run workflow**).

One-time setup: in this repository, **Settings → Pages → Build and deployment → Source: GitHub Actions**.

All links inside the site are relative (`./`, `privacy.html`), so it works under `/job-tracker/`. Keep new links relative.

## Verify you own the site (Google Search Console)

Google checks that the homepage is on a domain you control. Because the address is on `vedijapillay.github.io`, the strongest option is to verify the **whole** `vedijapillay.github.io` site, using the file method:

1. Open [Google Search Console](https://search.google.com/search-console) and add a property of type **URL prefix**: `https://vedijapillay.github.io/`. (A "Domain" property is not possible for a `github.io` address.)
2. Choose the **HTML file** method and download the `googleXXXXXXXX.html` file Google gives you.
3. Add that one file to the **root of the `vedijapillay/vedijapillay.github.io` repository** (the personal site), commit and push to `master`. This only adds a file. Wait a minute for it to publish, then check that `https://vedijapillay.github.io/googleXXXXXXXX.html` opens.
4. Click **Verify** in Search Console.

A fallback is a second property for `https://vedijapillay.github.io/job-tracker/` verified with the **HTML tag** method: replace the commented-out `google-site-verification` line in the `<head>` of `site/index.html` with the tag Google gives you, push, and click **Verify**.

## Update the Google consent screen

In your Google Cloud project's OAuth consent screen / branding settings:

- **Application home page:** `https://vedijapillay.github.io/job-tracker/`
- **Application privacy policy link:** `https://vedijapillay.github.io/job-tracker/privacy.html`
- **Authorized domains:** `vedijapillay.github.io`
- Keep the **app name** the same as the name shown on the site and in your demo video: "Job Tracker".

Then resubmit for verification, following the instructions in Google's rejection email.

## Things to confirm yourself

- **Whether Google accepts a `github.io` address for restricted-scope verification.** I could not confirm this. Shared hosting domains are handled specially. If Google rejects it again, the fix is the same pages on a domain you own: add the domain under Settings → Pages (custom domain) and change the addresses above.
- **The privacy policy against the app.** It describes what Job Tracker does today. If you add analytics, cloud features or anything that sends email text elsewhere, update the policy first. It is not legal advice.
- **Contact method.** The policy points to GitHub Issues so your personal email isn't published. If Google or a reviewer wants an email address, add one to the Contact section.
