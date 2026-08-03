# Compass — Queer Travel Concierge

AI itinerary planner for funmaps. React + Vite frontend, Vercel serverless
functions as the backend (keeps your Anthropic API key private).

## What's in here

- `src/App.jsx` — the app (trip form, itinerary display, follow-up chat)
- `api/claude.js` — proxies requests to Anthropic; holds the API key server-side
- `api/trips.js` — optional "share trip by code" endpoint (needs Upstash Redis)
- "My Trips" (save/reload) uses the browser's own storage — no backend needed for that part

## Go live in ~15 minutes

### 1. Get an Anthropic API key
Go to https://console.anthropic.com → API Keys → Create Key. Copy it somewhere safe.

### 2. Push this project to GitHub
```
cd funmaps-guide
git init
git add .
git commit -m "Compass travel planner"
```
Create a new empty repo on GitHub, then follow its "push an existing repo" instructions.

### 3. Deploy to Vercel
1. Go to https://vercel.com → Add New → Project → import your GitHub repo.
2. Vercel auto-detects Vite — leave build settings as default.
3. Before clicking Deploy, open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` = the key from step 1
4. Click Deploy. In under a minute you'll get a live URL like `funmaps-guide.vercel.app`.

### 4. Test it
Open the URL, plan a trip, confirm the itinerary generates. If you get an error
mentioning `ANTHROPIC_API_KEY`, double check it's saved in Vercel → Settings →
Environment Variables, then redeploy (Vercel → Deployments → ⋯ → Redeploy).

### 5. (Optional) Turn on trip sharing
The "Share" button needs a tiny key-value store to hold share codes:
1. Go to https://upstash.com → sign up free → Create Database (Redis).
2. Open the database → REST API tab → copy the URL and Token.
3. In Vercel → Settings → Environment Variables, add:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Redeploy. Sharing will now work; until you do this, it fails gracefully with
   a message instead of breaking anything else.

### 6. Point a subdomain at it (recommended over an iframe)
1. In Vercel → your project → Settings → Domains → add `plan.funmaps.com`
   (or whatever subdomain you want).
2. Vercel shows you a CNAME record to add.
3. Go to your domain's DNS settings (through your registrar, or Wix/Squarespace's
   own domain panel if that's where funmaps.com is registered) and add that
   CNAME record.
4. DNS usually propagates in minutes to a couple hours. Once it does,
   `plan.funmaps.com` loads the app directly — no iframe needed.
5. Add a "Plan a trip" button/nav link on your main funmaps site pointing at
   that subdomain.

## Adding monetization later

- **Hotel booking:** each city card has a "Find stays" button. Open
  `src/App.jsx`, search for `booking.com/searchresults.html`, and swap that
  URL for your actual affiliate link format (Booking.com Partner, Expedia
  Affiliate Network, or a queer-travel-specific partner).
- **Google Analytics:** add the standard `gtag.js` snippet to the `<head>` in
  `index.html` — since this is now a real deployed page (not a sandboxed
  artifact), it'll work normally.

## Local development
```
npm install
npm run dev
```
Create a `.env` file (copy `.env.example`) with your `ANTHROPIC_API_KEY` so
the API routes work locally. `vercel dev` (via the Vercel CLI) is the most
accurate way to test the `/api` functions locally; plain `vite dev` will run
the frontend but the API routes need Vercel's dev server or a deployed
environment to execute.
