# My Cal

A mobile-first PWA for logging meals from photos and barcodes. It shows what you
have eaten today against a calorie and macro target derived from your own
profile, and it keeps every AI-generated estimate visible and editable.

My Cal estimates. It is a tracking aid, not medical advice, and no number it
produces is treated as more authoritative than the person using it.

## What it does

- **Onboarding** collects age, height, weight, activity and goal, then shows the
  BMI, BMR, TDEE, calorie and macro targets it calculated, with the assumptions
  stated. Targets are versioned by effective date, so changing your profile
  never rewrites a day you have already logged.
- **Photo logging** captures or picks one meal photo, uploads it privately, and
  returns an editable draft of what the model saw. The reading happens in the
  background: the shutter returns you to your day, a card there shows the photo
  working, and the estimate opens when you choose to open it. Nothing reaches
  your day until you have reviewed it and saved.
- **Barcode scanning** decodes UPC/EAN on-device and looks the product up
  through a cached, rate-limited function. Package nutrition is preferred over
  an estimate; you still set the amount and confirm.
- **Additions** cover what a photo cannot see — cooking oil, sauce, the drink
  beside it — as one-tap presets or named lines with their own calories.
- **The day** is one segmented meter: each meal is a proportional segment and
  your target is a tick you can cross. Going over is information, not a failure
  state.
- **Weight** records dated weigh-ins, draws a centred rolling average through
  them, and reports a least-squares trend only once there is enough data to
  support one.
- **Micronutrients** appear only where a source actually reported them. A
  missing nutrient is shown as missing, never as zero.

## Running it

```bash
npm install
npm run dev
```

With no environment variables set, My Cal runs entirely on-device: every screen
works, records live in `localStorage`, photos live in IndexedDB, and barcode
lookup goes straight to Open Food Facts. There is no account and nothing leaves
the browser. This is the fastest way to see the whole product.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5173 |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Run the calculation, date and nutrient tests |
| `node scripts/build-icons.mjs` | Regenerate PWA icons from `scripts/icon.svg` |

## Connecting a backend

```bash
cp .env.example .env.local     # fill in your project URL and anon key
supabase db push               # applies everything in supabase/migrations/
supabase functions deploy analyze-food-photo lookup-barcode
supabase secrets set OPENAI_API_KEY=sk-...        # or ANTHROPIC_API_KEY=sk-ant-...
```

Photo analysis works against either provider. The key you set is the one it
uses: `OPENAI_API_KEY` runs it on OpenAI, `ANTHROPIC_API_KEY` on Claude, and
with both present `AI_PROVIDER=openai|anthropic` settles it (Anthropic
otherwise). `OPENAI_MODEL` and `ANTHROPIC_MODEL` override the defaults of
`gpt-5.5` and `claude-opus-5`; both must be able to read an image and return
structured JSON. With no key set, the photo screen reports that analysis is
unavailable and the rest of the app carries on.

### Deploying the client

`vercel.json` carries one rewrite that the app does not work without. My Cal is a
single-page app: the router owns `/today`, `/weight`, `/auth/confirm` and the
rest, and none of them exist as files. Without the fallback to `index.html`,
the host answers every one of them with a 404 — refreshing the page anywhere
but the front door breaks, and so does a confirmation link mailed to somebody's
inbox. Vercel checks the filesystem before applying a rewrite, so `/icons`,
`/assets` and `/sw.js` are still served as themselves. Any other host needs the
same rule under its own name (`try_files`, `historyApiFallback`, a `_redirects`
line).

The headers beside it matter for the same reason: `/assets/*` is content-hashed
so it is cached forever, and `sw.js` is never cached at all, because a stale
service worker pins people to an old build indefinitely.

### The front door, once it is deployed

Three things in the Supabase dashboard, under **Authentication**:

1. **URL Configuration.** Set **Site URL** to your deployed origin —
   `https://your-app.vercel.app` — and add both that origin and
   `https://your-app.vercel.app/auth/confirm` to **Redirect URLs**. A Site URL
   left on `http://localhost:5173` is exactly how a live app mails its users a
   confirmation link to a laptop they do not own. The client also sends
   `emailRedirectTo` explicitly, so the link survives a wrong Site URL as long
   as the origin is in the redirect list.
2. **Emails → Templates.** Paste in the five files from `supabase/templates/`
   and set the subjects listed beside them in `supabase/config.toml`. The
   hosted project does not read that file, so this is a copy-and-paste step.
   The default templates are a sentence and a blue link; these are the app's
   own type and voice, and they render in dark mode.
3. **Providers.** **Confirm email** can be on or off — the app handles both.
   On, sign-up shows a "check your inbox" screen with a resend, and the link
   lands on `/auth/confirm`. Off, sign-up returns a session and the person goes
   straight to setup. Fill in **Google** with the client ID and secret from a
   Google Cloud OAuth client whose authorized redirect URI is
   `https://<project>.supabase.co/auth/v1/callback`.

Set `VITE_SITE_URL` in the Vercel project if preview deployments should send
people back to the production origin rather than to themselves. Locally,
`supabase/config.toml` already carries all of this, and Google reads
`SUPABASE_AUTH_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_GOOGLE_SECRET` from your
shell.

### Keeping the AI key from being spent for you

`analyze-food-photo` and `lookup-barcode` both spend a request against two
counters at once: one for the account, one for the calling address, hashed.
Both have to pass. The account limit is what stops one person hammering the
model; the address limit is what a script cannot get around by signing up for
twenty more free accounts. The counters live in `rate_limit_counters` — a
shared table, so every edge-function instance agrees on the total, which the
old in-memory map could not.

Defaults are 8 analyses a minute, 40 an hour and 120 a day per account, and
15 / 80 / 300 per address. Every one is a function secret if your traffic looks
different:

```bash
supabase secrets set ANALYZE_USER_PER_DAY=60 ANALYZE_IP_PER_HOUR=40
```

`ANALYZE_*` and `BARCODE_*`, each in `USER|IP` × `PER_MINUTE|PER_HOUR|PER_DAY`.
Set `RATE_LIMIT_SALT` too — addresses are hashed before they are written down,
and that is the salt. A rate-limited caller gets a real number back and the app
says how long to wait.

Once `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present the app
switches to the Supabase store automatically — same interface, same screens.
The anon key is meant to ship in the bundle; row level security in the migration
is what actually protects the data, so treat that file as the security boundary
and test it with two real users rather than a service-role client.

The AI key never appears in the client, whichever provider it belongs to.
Photo analysis runs in `analyze-food-photo`, which verifies the caller's JWT, verifies they own the
image, downloads the bytes itself rather than handing a storage URL to a third
party, and writes an auditable `ai_analyses` row. It never creates a food entry.

## How it is put together

```text
src/
  app/            router, session, query hooks, shell
  components/     buttons, fields, sheets, meters, the weight chart
  features/
    auth/         front door
    onboarding/   profile and first target
    dashboard/    the day: meter, macros, ledger, micronutrients, trend
    food-log/     capture, review, edit, additions
    barcode/      scanning and product confirmation
    weight/       weigh-ins and trend
    profile/      inputs, target history, appearance, data controls
  lib/            calculations, timezone dates, nutrients, formatting
  services/       data store (Supabase | on-device), camera, barcode
  types/          domain types
supabase/
  migrations/     schema, indexes, RLS, storage policies, daily-totals view,
                  the shared rate-limit counter
  functions/      analyze-food-photo, lookup-barcode
  templates/      the emails Supabase sends: confirm, magic link, recovery,
                  email change, invite
```

Two rules hold the shape together. Every feature talks to one `DataStore`
interface rather than to SQL or a storage SDK, which is what lets the same UI
run against Supabase or against the device. And every number the app asserts
about your body or your day comes from the pure functions in `src/lib/calc.ts`,
which have no I/O and are tested directly.

Dates are timezone-explicit throughout: "today" is the timezone stored on your
profile, not the browser's and not the database server's, so a meal logged at
11pm and a flight across a timezone do not quietly move a day's food.

See [PRD.md](PRD.md) for product decisions and [ARCHITECTURE.md](ARCHITECTURE.md)
for the technical design these follow.
