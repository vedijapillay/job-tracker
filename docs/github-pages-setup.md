# Publishing the site

The site files are in `site/`: `index.html` (home page), `privacy.html` (privacy policy), `style.css`, `404.html` and `.nojekyll`. A GitHub Actions workflow (`.github/workflows/pages.yml`) publishes that folder with GitHub Pages whenever `site/` changes on `main`, or when you run it by hand from the **Actions** tab.

It is served from its own subdomain of a domain you own:

- Homepage: `https://jobtracker.vedijapillay.dev/`
- Privacy policy: `https://jobtracker.vedijapillay.dev/privacy.html`

(Google would not accept a `github.io` address as a domain you own, which is why this uses `vedijapillay.dev`.)

## One-time setup

### 1. DNS (at the registrar: Namecheap, **Advanced DNS** tab)

Add one record:

| Type | Host | Value | TTL |
|---|---|---|---|
| CNAME | `jobtracker` | `vedijapillay.github.io.` | Automatic |

### 2. Tell GitHub the domain

Repository **Settings → Pages → Custom domain**: `jobtracker.vedijapillay.dev`. Once the certificate is issued (can take up to an hour), tick **Enforce HTTPS**. `.dev` domains only work over HTTPS, so the site is unreachable until then.

The old address `vedijapillay.github.io/job-tracker/` redirects to the new one.

### 3. Verify the domain in Google Search Console

1. Open [Google Search Console](https://search.google.com/search-console) and add a property of type **Domain**: `vedijapillay.dev`.
2. Google shows a `TXT` record. Add it at the registrar: **Type** TXT, **Host** `@`, **Value** the text Google gives you.
3. Click **Verify**. This one verification covers every subdomain, so future projects reuse it.

Use the same Google account that owns the Cloud project.

### 4. Update the Google consent screen

- **Application home page:** `https://jobtracker.vedijapillay.dev/`
- **Application privacy policy link:** `https://jobtracker.vedijapillay.dev/privacy.html`
- **Authorized domains:** `vedijapillay.dev`
- Keep the **app name** the same as in the site and the demo video: "Job Tracker".

Then run the branding verification again.

## Optional: stop others claiming your subdomains

In your GitHub account settings, **Pages → Add a domain**, add `vedijapillay.dev` and create the `TXT` record GitHub shows. This stops anyone else pointing a subdomain of your domain at their own GitHub Pages site if a DNS record is ever left dangling.

## Adding another project later

1. In its repository, publish a site with GitHub Pages.
2. Add a CNAME record: **Host** `<project>`, **Value** `vedijapillay.github.io.`
3. Set `<project>.vedijapillay.dev` as the custom domain in that repository's Pages settings.

The domain verification in Search Console already covers it.

## Things to keep in mind

- **Renew the domain.** Turn on auto-renew. If it lapses, the site, the privacy policy link and your Google verification all break.
- **The privacy policy must match the app.** If you add analytics, cloud features or anything that sends email text elsewhere, update it first. It is not legal advice.
- **Contact method.** The policy points to GitHub Issues so a personal email isn't published. Add an email if Google or a reviewer asks for one.
