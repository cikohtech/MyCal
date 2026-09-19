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
  returns an editable draft of what the model saw. Nothing reaches your day
  until you have reviewed it and saved.
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
supabase db push               # applies supabase/migrations/0001_init.sql
supabase functions deploy analyze-food-photo lookup-barcode
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Once `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present the app
switches to the Supabase store automatically — same interface, same screens.
The anon key is meant to ship in the bundle; row level security in the migration
is what actually protects the data, so treat that file as the security boundary
and test it with two real users rather than a service-role client.

The AI key never appears in the client. Photo analysis runs in
`analyze-food-photo`, which verifies the caller's JWT, verifies they own the
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
  migrations/     schema, indexes, RLS, storage policies, daily-totals view
  functions/      analyze-food-photo, lookup-barcode
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
