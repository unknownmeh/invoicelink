# Invoice Link — for Freelancer

**Create. Share. Get Paid.**

A static, vanilla HTML/CSS/JavaScript web app that lets a freelancer create
UPI payment requests and share a link with a client. The client sees the
invoice, pays via UPI, and submits a transaction ID (UTR) for the freelancer
to verify — all backed by Google Sheets through a single Google Apps Script
endpoint.

## File structure

```
index.html          Freelancer dashboard (shell + all views)
style.css            Dashboard styles
script.js            Dashboard logic (nav, invoice creation, verification)
payment.html          Client-facing payment page
payment.css           Payment page styles
payment.js            Payment page logic (load invoice, submit UTR)
assets/
  qr-placeholder.png  Fallback image if the live QR image can't load
apps-script/
  Code.gs             Google Apps Script backend (deploy as a Web App)
  README.md           Step-by-step backend setup
```

## Running it

This is a static site — no build step, no server required.

- **Try it instantly:** open `index.html` directly in a browser. Without a
  backend configured, the dashboard runs on local demo data (stored only in
  that browser) so you can explore every screen immediately.
- **Host it for real:** upload all files (keeping the folder structure) to
  any static host — GitHub Pages, Netlify, Vercel, or your own web server —
  then follow `apps-script/README.md` to connect a real Google Sheets
  backend from the dashboard's **Settings** page.

## Notes on the MVP

- Frontend code holds only a public Apps Script Web App URL — never a
  credential. See `apps-script/README.md` for what that URL can and can't
  do, and for a production hardening suggestion.
- The client payment page never trusts an amount from the URL; it always
  looks the invoice up by ID through the backend.
- "Payment Submitted" and "Payment Verified" are always shown as distinct
  states — nothing here auto-confirms a payment. Verification is a manual
  step the freelancer takes in the **Payments** view.
