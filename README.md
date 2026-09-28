# Backend setup — Google Apps Script + Google Sheets

Invoice Link's frontend is static (HTML/CSS/JS only). All reads and writes go
through a Google Apps Script Web App, which is the only place that ever
touches your Google credentials.

## 1. Create the Sheet

1. Create a new Google Sheet (any name — e.g. "Invoice Link Data").
2. Open **Extensions > Apps Script**.
3. Delete the default `Code.gs` content and paste in this project's
   `apps-script/Code.gs`.
4. Save the project (e.g. name it "Invoice Link Backend").

The script creates an **"Invoices"** tab automatically (with header row) the
first time it runs, so you don't need to set up columns by hand.

## 2. Deploy as a Web App

1. In the Apps Script editor: **Deploy > New deployment**.
2. Select type: **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone** (required so the public payment page can load
   invoices and submit payments — no Google login is required from clients).
5. Click **Deploy**, authorize the requested permissions, and copy the
   `.../exec` URL it gives you.

## 3. Connect the frontend

1. Open the dashboard (`index.html`) in a browser.
2. Go to **Settings**.
3. Paste the `.../exec` URL into **Google Apps Script Web App URL** and save.

From then on, the dashboard and payment page will read and write through
this endpoint instead of the local demo data.

## 4. Restrict dashboard access to your Google account

The public payment page still needs an Anyone-accessible Apps Script endpoint.
Dashboard data and write actions are protected separately with Google sign-in:

1. In Google Cloud Console, create a **Web application** OAuth client ID and
  configure the OAuth consent screen. Add the site's origin under authorized
  JavaScript origins (for GitHub Pages, this is `https://YOUR-USER.github.io`).
2. In the Apps Script project, open **Project Settings > Script Properties**
  and add `ADMIN_EMAIL` with your Google account email and
  `GOOGLE_OAUTH_CLIENT_ID` with the OAuth client ID.
3. In `script.js`, replace `YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com`
  with that same OAuth client ID. The client ID is public; do not put a client
  secret in the frontend.
4. Save the Apps Script project and deploy a new version of the existing Web
  App deployment. Google may ask you to authorize the new external-request
  permission used to verify Google sign-in tokens.
5. Publish the updated frontend files.

Only the configured Google account can access invoice lists, payment lists,
invoice creation, payment verification, and rejection. The public
`getInvoice` and `submitPayment` actions remain available to clients and expose
only the fields needed to view and submit payment details. The dashboard asks
you to sign in again after a page reload or when the Google token expires.

## What this does — and doesn't — protect

- The Web App URL is **public but not secret** — it's the same as any other
  public API endpoint. It contains no password, key, or credential.
- Nobody can read your Sheet directly through it; they can only call the
  specific actions defined in `Code.gs` (`listInvoices`, `getInvoice`,
  `submitPayment`, etc.).
- The payment **amount is always looked up server-side** from the Sheet by
  invoice ID — the client payment page never trusts an amount passed in the
  URL.
- Duplicate UTR submissions, missing required fields, and unknown invoice
  IDs are all rejected inside `Code.gs`, not just in the browser — frontend
  validation is a convenience, not a security boundary.
- Keep the configured admin email and OAuth client ID aligned. If either is
  missing or does not match, dashboard access is denied by default.
