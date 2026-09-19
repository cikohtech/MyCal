# Product Requirements Document — My Cal

## Product vision

Make nutrition tracking fast enough to use every day: photograph a meal or scan a package, review the estimate, and see a clear picture of today’s intake and progress. The app is a tracking aid, not medical advice. AI results are estimates and users retain control of every logged value.

## Problem statement

Manual food logging is slow, error-prone, and difficult for mixed meals. Packaged food is easier to identify but still requires transcribing a label. Users need a quick mobile workflow that captures food, makes uncertainty explicit, and lets them correct omissions such as cooking oil, sauces, or drinks.

## Target users

- Adults who want practical calorie and macro tracking without exhaustive manual search.
- People pursuing weight loss, maintenance, or gain who want an understandable daily target and weight trend.
- Users who regularly eat home-cooked meals, restaurant meals, and packaged foods.

The MVP is intended for self-tracking by generally healthy adults; it does not provide diagnosis, treatment, eating-disorder support, or clinical nutrition plans.

## Core user journey

1. A user signs up and completes a short profile.
2. The app calculates and explains estimated BMI, BMR, TDEE, and daily targets.
3. On the dashboard, the user logs food using a photo, barcode, or an editable entry.
4. The app places the entry in the user’s local current day and updates daily totals.
5. The user reviews/corrects estimates and sees meals, remaining calories, macro progress, and available micronutrients.
6. The user records weight periodically and views a trend estimate alongside their goal.

## User onboarding

Required profile inputs are age, sex used for BMR calculation, height, weight, activity level, and goal (`lose`, `maintain`, or `gain`). The UI must explain that these inputs create estimates and can be changed later.

On completion, the app creates a versioned nutrition target containing the calculation inputs and effective date. The user’s timezone is stored so the “current day” is deterministic. Units may be displayed in metric first; conversion preferences can be added without changing stored canonical units (kg and cm).

### BMI, BMR, and TDEE concepts

- **BMI** = weight in kg / height in metres². Display it as a simple screening metric, not a health verdict.
- **BMR** is estimated with the Mifflin–St Jeor equation using age, sex, height, and weight.
  - Male: `10 × kg + 6.25 × cm − 5 × age + 5`
  - Female: `10 × kg + 6.25 × cm − 5 × age − 161`
- **TDEE** = BMR × activity multiplier. MVP multipliers: sedentary 1.2, lightly active 1.375, moderately active 1.55, very active 1.725, extra active 1.9.
- The initial calorie target is TDEE minus 500 kcal/day for loss, TDEE for maintenance, or TDEE plus 250 kcal/day for gain. It must be labeled as an estimate, not a promise of a particular rate of change.

If the selected sex does not map to the equation, the app must request a user-chosen calorie target rather than silently applying a sex-specific formula. Future versions can support additional equations and clinician-defined targets.

### Calories, macros, and micronutrients

The MVP stores calories; protein, carbohydrate, and fat grams; fibre where available; and a structured nutrient map for available vitamins/minerals. Daily totals are the sum of saved entries and additions, not a fresh AI calculation.

Initial macro targets are sensible defaults: protein is 1.6 g/kg of body weight, fat is 25% of calorie target, and carbohydrates receive the remaining calories (4 kcal/g protein and carbohydrate; 9 kcal/g fat). Show targets as adjustable estimates. Nutrient labels may use a configured reference daily value when available; absence of a micronutrient means “not available,” not zero.

## Food logging

### Food photo flow

1. The user opens Add Food, grants camera permission, and captures or chooses one meal photo.
2. The photo uploads to the user’s private storage area and the app shows an analysis-in-progress state.
3. The app receives editable AI suggestions; it does not add a finalized intake entry yet.
4. The user reviews suggestions, selects a meal category (breakfast, lunch, dinner, snack, or unassigned), and saves.
5. Saving creates an entry dated to the user’s current local date and updates the dashboard.

The user can cancel before saving. A failed analysis leaves the image available for retry or deletion and offers an editable manual entry path.

### AI food recognition flow

The AI service receives a private, short-lived image reference through a trusted server boundary. It returns one or more detected foods with a name, estimated portion/weight, confidence, and nutrition estimate. It must not be treated as authoritative nutrition data.

The system normalizes a recognized food against a nutrition reference where possible. If no good reference match exists, it marks the values as estimated and asks for user confirmation. Low confidence, multiple plausible foods, mixed dishes, missing scale cues, or unusable images must lead to a clear review state—not an invisible automatic log.

### Editing and correction flow

Before and after saving, users can:

- Rename a food, change portion/weight or serving count, and replace nutrition values.
- Add, edit, or remove ingredients for a mixed meal.
- Add named extras with known calories and optional macros/nutrients (for example oil, sauce, sugar, a drink, or restaurant hidden calories).
- Change the meal category or remove the entry.

All totals must recalculate immediately from the edited saved values. Preserve the source (`photo_ai`, `barcode`, or `manual`) and enough provenance to show that a value was corrected; do not overwrite the historical nutrition snapshot when a reference food later changes.

### Barcode scanning flow

1. The user opens Scan Barcode and grants camera permission.
2. The browser scans a UPC/EAN-style code using the device camera.
3. The app looks up a cached or approved product-nutrition record by barcode.
4. The user reviews product, serving quantity, and nutrition and saves it to the current local day.

For packaged products, the retrieved package/label nutrition is preferred over AI estimates. If a code is not found, unreadable, or camera access is denied, the app explains the issue and offers retry or a manual editable entry. A barcode scan never creates a final intake entry without review.

## Daily nutrition tracking and summary

The dashboard defaults to today in the user’s timezone and provides a way to view another date. It shows:

- Calories consumed, calorie target, and remaining calories (target − consumed).
- Protein, carbohydrate, fat, and fibre totals against targets where present.
- Available micronutrient totals and reference-value progress, clearly marked when data is incomplete.
- Meal groups and their logged foods/additions.
- A concise goal and weight-trend status.

Entries are associated with `consumed_on` in the user’s timezone at save time. Changing timezone must not silently move historical entries; a user can explicitly edit an entry’s date in a future enhancement if needed. The MVP supports logging into the current day and viewing historical days.

## Weight and goal tracking

Users can record a dated body-weight entry. The app charts weight history and shows a smoothed recent trend when enough data exists. It also estimates expected direction from average calorie intake relative to current TDEE using approximately 7,700 kcal per kg as a coarse planning heuristic. It must say this is an estimate: water, adherence, activity changes, and metabolic variation make real weight change non-linear.

Changing weight, activity, or goal prompts a recalculation of a new effective nutrition target while retaining past target versions for historical context.

## User profile

Users can view and update their demographic/calculation inputs, timezone, preferred units, activity level, goal, and current target. Updating inputs does not rewrite prior entries or daily totals. Account deletion and food-image deletion must be supported as part of privacy controls, even if the UI is delivered after the core logging screens.

## Important edge cases

- Photo has multiple foods, a mixed dish, unclear portions, no food, or poor lighting.
- AI detects food but cannot confidently map it to nutrition data.
- A user changes AI quantities, nutrition facts, ingredients, or adds calorie-only extras.
- Barcode is unsupported, duplicated, not found, maps to an outdated product, or scans incorrectly.
- Camera is unavailable or permission is denied; file upload/manual entry remains usable.
- Nutrient information is incomplete; unknown data is never displayed as zero.
- The user logs around midnight, travels, is offline, or changes timezone.
- A food photo upload/analysis fails or is still processing.
- Invalid profile inputs (non-positive height/weight, implausible age) and missing BMR-calculation sex selection.
- Target is exceeded; remaining calories can be negative and must not imply failure.

## MVP scope

In scope:

- Supabase email-based authentication and per-user private data.
- Onboarding/profile, target calculation, weight entries, and daily dashboard.
- One-photo analysis with review-before-save and complete editing of resulting foods/additions.
- Browser-camera barcode scan with product lookup, review, and editable saved entry.
- Current-day logging, historical daily-summary viewing, and basic weight/trend display.

Out of scope for the MVP:

- Clinical advice, allergy safety, disease-specific plans, or guaranteed weight outcomes.
- Social features, coaching, payments, wearables, supplements, or meal delivery.
- Recipe import, community food database contributions, household sharing, and advanced offline conflict resolution.
- Fully automatic background logging or treating AI as authoritative without user review.

## Future features

- Saved foods, repeat meals, recipes, meal templates, and manual food search.
- Better regional food databases, label photo OCR, and data-quality reporting.
- Install/offline support with a clear queued-upload and conflict experience.
- More detailed trends, custom targets, export, integrations, and clinician/coaching workflows.
- Accessibility refinements, localization, and multiple unit systems.

## Functional requirements

1. The system shall authenticate users and isolate every profile, image, analysis, entry, and weight record to its owner.
2. The system shall collect required profile inputs and calculate/display BMI, BMR, TDEE, calorie target, and macro targets with assumptions stated.
3. The system shall allow users to capture/select a meal photo and receive reviewable AI food/portion/nutrition suggestions.
4. The system shall allow users to fully edit suggested foods, quantities, nutrition, ingredients, and additions before or after logging.
5. The system shall support browser-camera barcode scanning, product nutrition lookup, quantity adjustment, and review before logging.
6. The system shall persist a nutrition snapshot for each saved consumed item and calculate daily totals from those snapshots.
7. The system shall automatically date a newly saved entry to the user’s local current day and group it by meal category.
8. The dashboard shall show daily calorie, macro, available micronutrient, meal, remaining-calorie, goal, and weight-trend information.
9. The system shall let users add and view dated weight entries and recalculate future targets when relevant profile inputs change.
10. The system shall provide actionable states for unsupported camera, failed upload/analysis, missing barcode product, and incomplete nutrient data.

## Non-functional requirements

- **Mobile-first:** primary flows work on recent mobile browsers with responsive layouts and touch-friendly controls.
- **Privacy:** food images and user health-related data are private by default, protected by RLS and scoped storage access.
- **Transparency:** clearly distinguish AI estimates, product/reference data, user overrides, and unavailable data.
- **Performance:** show local capture feedback promptly; avoid blocking the dashboard while analysis runs; target an ordinary successful photo analysis experience within about 15 seconds, excluding unusually slow network conditions.
- **Reliability:** make save operations idempotent enough to avoid duplicate food entries on retries; preserve drafts/errors for recovery where feasible.
- **Accessibility:** keyboard support where applicable, labelled controls, adequate contrast, readable charts, and non-colour-only status cues.
- **Observability:** record non-sensitive errors and timing for uploads, AI calls, and barcode lookup; never log private image URLs or raw user nutrition data unnecessarily.

## Acceptance criteria

1. A new user can complete onboarding and see their profile-based BMI, BMR, TDEE, calorie target, and macro targets with estimate disclaimers.
2. Saving a reviewed photo analysis creates only the foods/ingredients/additions the user confirms, assigns them to today in the user’s timezone, and updates daily totals.
3. Editing an existing entry’s quantity, nutrition, or addition changes daily calories/macros/nutrients immediately and remains correct after reload.
4. A successful barcode scan retrieves product nutrition when available; the user can alter serving quantity and must confirm before it affects totals.
5. Missing camera permission, unreadable/unknown barcode, failed photo analysis, and incomplete nutrient data each present a recoverable user-facing path.
6. Daily view shows calorie consumed, remaining calories, macros, available micronutrients, meals, and goal/weight status without mixing data between users or dates.
7. A user can add weights over time and see a clearly labelled estimated trend; profile/goal changes create a new target without changing historical food-entry snapshots.
8. Users cannot read, modify, or obtain direct storage access to another user’s profile, entries, weights, analyses, or food images.
