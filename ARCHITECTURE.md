# Architecture — My Cal

## Architectural approach

My Cal is an MVP PWA with a React client, Supabase as the application backend, and one separate AI analysis API behind a trusted server boundary. The browser performs ordinary authenticated CRUD directly against Supabase under Row Level Security (RLS). It never receives AI-provider credentials or unrestricted image access.

```text
My Cal — mobile web/PWA (React + TypeScript + Vite + Tailwind)
       │  authenticated CRUD, realtime optional
       ▼
Supabase: Auth · PostgreSQL + RLS · Storage · Edge Functions
       │                         │
       │                         └── private food-image objects
       ▼
Separate food-image AI API ───► nutrition-reference matching
       │
       └── estimates returned for user review

Browser camera ──► barcode decoder ──► product lookup/cache ──► reviewed food entry
```

Keep this a modular monolith. Supabase Edge Functions are the integration boundary for privileged calls; no Kubernetes, event bus, or independent domain microservices are needed for the MVP.

## Frontend architecture

Use React and TypeScript with Vite, Tailwind CSS, and a small route/state layer chosen at implementation time. Organize by feature, not by technical layer alone:

```text
src/
  app/            route shell, providers, auth/session guards
  features/
    onboarding/   profile and target setup
    dashboard/    daily summary and meal groups
    food-log/     entry review, editing, additions, image states
    barcode/      camera scan and product confirmation
    weight/       entries and trend display
    profile/      inputs, targets, account/privacy controls
  components/     accessible shared controls and chart primitives
  lib/            calculations, date/timezone helpers, validation, Supabase client
  services/       camera, barcode decoder, API request adapters
  types/          database/domain types
supabase/
  migrations/     schema, indexes, functions, RLS policies
  functions/      photo-analysis and product-lookup integration code
```

Feature UI should call domain-oriented services rather than embed SQL-shaped logic. Calculation functions (BMI/BMR/TDEE, nutrient arithmetic, and trends) must be pure, tested, and share their input/output types with API responses. Store canonical kg, cm, kcal, grams, and ISO dates; convert only at presentation boundaries.

PWA work should start with a valid web manifest, icons, and a conservative service-worker policy. Do not cache authenticated API responses or private image URLs. Offline queueing is a future enhancement, not an MVP promise.

## Supabase architecture

- **Auth:** Supabase Auth provides session management and the `auth.uid()` principal. Two entry points share it: email and password, and Google OAuth over PKCE, which returns to the app's front door and is picked up by the same `onAuthStateChange` listener. Email confirmation is a project setting the client handles either way — with it off, sign-up returns a session and the person lands on setup; with it on, sign-up returns none, the UI shows an inbox step with a resend, and the mailed link lands on `/auth/confirm`, which redeems a token hash, a PKCE code or an already-detected session. Every mailed link carries an explicit `emailRedirectTo` built from `VITE_SITE_URL` or the serving origin, so a deployment never inherits a stale project-level Site URL. Both produce the same principal, so nothing downstream distinguishes them; further identity providers are independent of application data.
- **PostgreSQL:** source of truth for profiles, targets, food entries, analysis metadata, reference foods, and weight data.
- **RLS:** enabled on every user-owned table. Browser access is restricted to records where `user_id = auth.uid()`.
- **Storage:** a private `food-images` bucket. Object keys begin with the owner UUID and policies validate that prefix.
- **Edge Functions:** verify the user JWT, enforce ownership, create short-lived signed image URLs, call the external AI API, and perform trusted product-provider lookups/caching.
- **AI provider:** chosen by which key is in the function secrets, behind one adapter in `supabase/functions/_shared/ai.ts` (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`, with `AI_PROVIDER` breaking a tie). The adapter takes an image and a JSON Schema and returns the model's JSON, so the analysis function, the prompt and the stored result are the same either way; only the recorded `model` differs.

Service-role keys live only in server-side secrets. The client uses the anon key plus its authenticated session, which is safe only because RLS and Storage policies are enforced.

## Database design proposal

Use UUID primary keys, `created_at`/`updated_at` timestamps, and `user_id` on all private entities. Nutrition units are canonical: kcal for energy, grams for macros, and standardized units within a nutrient JSON object. Exact column names can evolve during migration design, but the responsibilities below should remain stable.

| Entity | Core fields | Purpose |
| --- | --- | --- |
| `profiles` | `user_id` (PK/FK auth user), age, sex_for_bmr, height_cm, activity_level, goal, timezone, unit_preference | Current calculation inputs and display preferences. |
| `nutrition_targets` | `id`, `user_id`, `effective_on`, calculation input snapshot, bmi, bmr_kcal, tdee_kcal, calorie_target_kcal, macro targets | Versioned target output; current target has the latest effective date. |
| `weight_entries` | `id`, `user_id`, `recorded_on`, weight_kg, optional note | Dated body weight, unique per user/date initially. |
| `food_images` | `id`, `user_id`, storage path, MIME type, size, status | Private image metadata; never store a permanent public URL. |
| `ai_analyses` | `id`, `user_id`, `food_image_id`, status, model/version, result JSON, failure code | Auditable, short-lived working record of AI estimates and matching outcomes. |
| `food_references` | `id`, source, external ID, name, brand, barcode nullable, serving metadata, nutrients per basis | Cached/curated nutrition references; product records are identified by barcode when available. |
| `food_entries` | `id`, `user_id`, `consumed_on`, meal_type, source, display name, quantity/basis, `nutrition_snapshot`, reference/analysis links nullable | A confirmed top-level consumed food. The snapshot is the historical source for totals. |
| `food_entry_parts` | `id`, `food_entry_id`, kind (`ingredient`/`extra`), name, quantity, `nutrition_snapshot` | User-added or editable meal components such as rice, oil, sauce, or drink calories. |

`nutrition_snapshot` contains calories, protein, carbohydrate, fat, fibre, and available micronutrients for the actual consumed amount—not only per 100 g. Selected frequently queried values may additionally be materialized as numeric columns for indexes and simple aggregations. A generated query/view sums each entry plus its parts by `user_id` and `consumed_on`; do not persist a mutable daily total as an independent source of truth.

Main relationships:

```text
auth.users 1──1 profiles
auth.users 1──* nutrition_targets
auth.users 1──* weight_entries
auth.users 1──* food_images 1──* ai_analyses
auth.users 1──* food_entries 1──* food_entry_parts
food_references 1──* food_entries (optional provenance)
ai_analyses 1──* food_entries (optional provenance)
```

Indexes should begin with `(user_id, consumed_on)` on `food_entries`, `(user_id, recorded_on)` on `weight_entries`, and a unique normalized barcode on `food_references` when non-null. Only add materialized daily summaries or specialized nutrient indexes after measured need.

## Authentication and authorization

The frontend initializes a Supabase session and routes unauthenticated users to sign-in/onboarding. Each private table has `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies tied to `auth.uid()`. Inserts must validate `user_id = auth.uid()`; updates/deletes must retain ownership with `WITH CHECK`/`USING` policies. Child rows such as `food_entry_parts` must check ownership through their parent entry, not accept a caller-supplied foreign key blindly.

Reference food/product data is read-only to signed-in users if exposed at all. Writes, ingestion, cache refreshes, and AI result persistence occur through controlled functions using a service role after the function has verified the caller and resource ownership. Test RLS with two regular test users, not just a service-role client.

## Food-image storage strategy

Use one private `food-images` bucket. Store objects under `food-images/{user_id}/{image_id}.{extension}` and record only the path/metadata in PostgreSQL. The client uploads with a session-scoped policy; it may list/read only its own prefix. Render images through a short-lived signed URL when needed.

Validate MIME type, file size, and decoded image dimensions before or at upload. Strip unnecessary metadata when image processing is introduced. Retain the original only as long as needed for user history/reanalysis; provide deletion that removes the object and metadata/links according to the account-data policy. Do not expose a public bucket, durable signed URL, or raw image bytes in logs.

## AI processing architecture

Photo analysis is asynchronous from the UI’s perspective, even though the function completes it synchronously. The client owns that asynchrony: a capture becomes a job in an app-level queue that outlives the screen which started it, the shutter returns immediately to the day view, and the job's state is rendered as a card there. The queue persists enough to `sessionStorage` (image id, idempotency key, stage, the returned draft) that a reload resumes rather than restarts — resuming replays the same idempotency key, which returns the analysis already paid for and is deliberately checked ahead of the rate limit.

1. Client uploads a private photo and creates/requests an `ai_analyses` record.
2. `analyze-food-photo` Edge Function validates the JWT, `food_image` ownership, and image state.
3. The function makes a short-lived signed download URL (or securely streams the image) to the separate AI API with service-to-service credentials.
4. The AI API returns candidate foods, estimated quantities, confidence, and non-authoritative nutrient estimates.
5. The function tries to match candidates to `food_references`, records the model/version and result, and returns a draft to the client.
6. The client presents the draft for editing. A `food_entries` row is created only after user confirmation.

Keep raw provider output bounded, versioned, and access-controlled. The AI service’s job is recognition and estimation. It should not become the permanent nutrition database: a matched reference or packaged product supplies the preferred nutrition profile, while unmatched values remain clearly labelled estimates.

Use a status state machine such as `uploaded → processing → ready | failed | cancelled`. Start with one request path and a timeout. If analysis latency/retries demand it later, add a database-backed job/worker without changing the client contract.

## Barcode architecture

The client accesses `getUserMedia` only after an explicit action and decodes common UPC/EAN formats using the browser `BarcodeDetector` where available, with a maintained client-side fallback if compatibility requires it. Decoding happens on-device; no continuous camera frames are sent to the backend.

On a stable code, the client calls a protected `lookup-barcode` function. The function first checks normalized `food_references`, then calls the selected approved product-data provider if needed, validates/maps the response into the application nutrient schema, caches it, and returns an editable draft. Barcode records must retain source and retrieval timestamp. A product lookup is not a confirmed intake entry; only explicit user save creates `food_entries`.

## API boundaries

| Boundary | Caller | Responsibility |
| --- | --- | --- |
| Supabase client CRUD | Authenticated browser | Profile, targets, weight entries, confirmed food entries/parts under RLS. |
| `analyze-food-photo` function | Authenticated browser | Ownership checks, private-image handoff, AI invocation, analysis records/drafts. |
| Separate AI API | Edge Function only | Food recognition, portion estimate, confidence, candidate nutrition estimate. |
| `lookup-barcode` function | Authenticated browser | Cache/provider lookup and normalized product draft. |
| Product data provider | Edge Function only | Supplemental packaged-food data; never a direct browser secret. |

Use typed request/response DTOs at the Edge Function boundaries. A draft response includes status, provenance, confidence, and a normalized food list; it is deliberately distinct from the persisted food-entry DTO. Use idempotency keys for image-analysis requests and food-entry creation retries to prevent duplicate logs.

## Data flow: photo analysis

```text
Capture/select image
  → private Storage upload
  → create analysis request
  → Edge Function verifies user + image ownership
  → short-lived image handoff to AI API
  → candidate foods, portions, confidence, estimates
  → optional reference-food match
  → editable draft shown to user
  → user confirms
  → food_entries + food_entry_parts snapshots saved for local current date
  → daily aggregate query refreshes dashboard
```

## Data flow: barcode scanning

```text
User opens camera → local UPC/EAN decode → lookup-barcode function
  → cache hit OR trusted product provider
  → normalized product + nutrition draft
  → user sets quantity and confirms
  → food-entry nutrition snapshot saved for local current date
  → daily aggregate query refreshes dashboard
```

## Daily calorie calculation flow

When a user confirms a food, the client determines `consumed_on` from the stored user timezone, rather than relying on the database server’s date. The entry saves the final nutrition snapshot for the chosen quantity. Its `food_entry_parts` are independently snapshotted and included in its total.

For a selected day, query the user’s entries and parts, sum energy/macros and every present nutrient, and compare to the effective target for that date. `remaining_calories = calorie_target_kcal − consumed_calories`; it may be negative. Missing micronutrients remain absent/unknown in the aggregate and UI, never coerced to zero. Daily totals should be computed server-side or through a secured SQL view/RPC to avoid transferring a large history solely to calculate one day.

## Weight prediction and trend calculation

Weight entries are stored as raw measurements. For display, calculate a short rolling average or regression from recent valid entries only when enough observations exist. Compare recent average calorie intake with the current/effective TDEE and optionally express the rough planning delta as `(average intake − TDEE) × days / 7,700` kg. Always label the result as an estimate, hide it when data is insufficient, and do not make clinical claims.

Target calculation uses the version active on the date being shown; food-entry nutrition snapshots never change because a profile, reference food, or AI model changes later.

## Security considerations

- Enforce RLS and storage ownership rules for every private record/object; test cross-user denial cases.
- Keep service-role, AI, and product-provider secrets exclusively in function/server secret storage.
- Validate input schemas, numeric ranges, file types/sizes, enum values, and all foreign-key ownership at each boundary.
- Use short-lived signed URLs and minimum scopes for image access; do not make food photos public.
- Rate-limit analysis and barcode lookup per user **and** per IP, both of which must pass: the account limit bounds one person, the address limit bounds one person holding twenty free accounts. Counters live in a shared `rate_limit_counters` table under fixed windows (minute, hour, day) rather than in an edge instance's memory, so every instance agrees on the total and a recycle does not reset the quota. Addresses are salted-hashed before storage. An unreachable counter degrades to a per-instance in-memory limiter rather than opening the gate. Cap image size and request payloads to control cost and abuse.
- Store the minimum AI response needed for review/audit, sanitize error messages, and avoid sensitive-data logging.
- Provide deletion paths for photos and account-associated data; define retention explicitly before production.
- Treat nutrition and weight records as sensitive personal data: use TLS, encrypted managed storage, least privilege, and appropriate privacy disclosures/consent.

## Scalability considerations

The expected MVP load fits a single Supabase project and one AI provider. Scale in this order only when metrics require it: appropriate database indexes and pagination; cached barcode/reference results; image compression and lifecycle policies; asynchronous analysis jobs; then dedicated workers or provider redundancy. Avoid prebuilding queues, replicas, Kubernetes, or separate services for dashboard, profile, and food logging.

## Why Supabase/PostgreSQL instead of Convex

Supabase/PostgreSQL is the better fit for this MVP because the product has clear relational ownership and reporting needs: user-scoped daily entries, target history, food components, barcode caching, date queries, and aggregates all map naturally to SQL. PostgreSQL also offers mature constraints, indexes, views/RPCs for daily aggregation, JSONB for sparse micronutrients, and transparent RLS policies close to the data.

Supabase combines those capabilities with managed authentication, private object storage, signed URLs, edge functions, and migrations in one operationally simple platform. Convex could support reactive application data well, but this project benefits more from SQL-based historical nutrition/reporting queries and the ability to use standard PostgreSQL tools without adding a separate relational/reporting system. Realtime updates are optional here, so Convex’s realtime-first model is not required to satisfy the MVP.
