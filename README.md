# Get Together

Plan a get-together: add families with approximate head-counts, set arrival/leaving times, see a day-by-day schedule, and share a screenshot + link on WhatsApp. Static site (GitHub Pages friendly) with a Google Sheet as the backend.

## Setup (one time, ~3 minutes)
1. Open the Google Sheet, then **Extensions > Apps Script**.
2. Replace the editor contents with `Code.gs` from this folder and save.
3. **Deploy > New deployment > Web app**. Execute as: *Me*. Who has access: *Anyone*. Authorize when asked.
4. Copy the web app URL (ends in `/exec`).
5. Either paste it into `DEFAULT_URL` at the top of `script.js`, or open the site and paste it on the setup screen (saved in that browser only).
6. Host the folder (GitHub Pages) or run locally: `python -m http.server 8000`.

Tabs `Events` and `Families` are created automatically. If you change `Code.gs` later, use **Deploy > Manage deployments > Edit > New version**.

## Using it
- **New get-together**: name, dates, place, and optionally a list of families (`Sharma 4`, one per line).
- **Families tab**: tap +/- to adjust counts, tap a family to edit times, status or remove it.
- **Schedule tab**: per-day timeline of who arrives and leaves, plus the busiest time.
- **Share**: one tap makes a picture of the schedule and opens the share sheet (WhatsApp on phones). On desktop the picture is copied/saved and WhatsApp opens with the link.
- Anyone with the link (`#/e/<id>`) can view and edit, so share it only with your group.
