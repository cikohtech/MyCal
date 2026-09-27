# Hyperframes Composition Brief: MyCal

## Objective
Create a short launch-style brag video for MyCal — a mobile-first PWA that lets you photograph a meal, get an AI calorie/macro estimate you can edit, and watch your day's ring fill. Tone: polished, quiet, confident. No moralizing, no SaaS clichés.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920×1080
- Duration: 20 seconds

## Source Material
- Project root: `/Users/xavitar/Work Project/My Cal PWA`
- Primary files read: `index.html`, `src/index.css`, `README.md`, `package.json`, `src/features/dashboard/Dashboard.tsx`
- Product name: MyCal
- Tagline / strongest claim: "Photograph a meal, review the estimate, keep the day honest."
- Key UI moment to recreate: The calorie ring (segmented arc, meal steps in blue shades) with macro bars below (protein green, carbs amber, fat purple), and the draft food card (editable AI estimate)
- Copy that must appear verbatim:
  - "Photograph a meal."
  - "Going over is information, not a failure state."
  - "MyCal"

## Creative Direction
- Tone preset: `polished`
- Creative direction: "quiet premium health tool that treats you like an adult"
- Interpretation: Restraint over enthusiasm. Long holds for each line to land. Clean crossfades. The product's iOS-native design does the heavy lifting — expose it, don't decorate it.
- Angle: Most calorie apps feel like confessing to a school principal. MyCal's posture is: here's the estimate, it's yours, going over is data not a verdict. The video captures that quiet confidence.
- Hook: "Photograph a meal." — clean canvas, display type, nothing else. Three words that are the entire product proposition.
- Outro / punchline: "Going over is information, not a failure state." then "MyCal" wordmark.
- Avoid:
  - Generic SaaS language ("streamline your workflow", "supercharge", "AI-powered")
  - Abstract filler visuals, gradient meshes, particle systems
  - Redesigning the UI — use the project's actual color tokens and visual language

## Visual Identity
- Background (canvas): `#f2f2f7`
- Card / paper: `#ffffff`
- Primary text (ink): `#1c1c1e`
- Secondary text (ink-2): `#6e6e73`
- Accent (near-black CTA): `#17181c`
- Tint (interactive blue): `#0a6cf0`
- Protein: `#12a065` (green)
- Carbs: `#db8500` (amber)
- Fat: `#8a57e0` (purple)
- Meal step colors: breakfast `#9cc8ff` · lunch `#57a0f7` · dinner `#0a6cf0` · snack `#c8dfff`
- Card radius: 16px
- Display font: -apple-system / SF Pro Display / Inter / system-ui (sans-serif)
- Body font: -apple-system / SF Pro Text / Inter / system-ui (sans-serif)
- Visual references from the project:
  - Calorie ring: segmented SVG arc, one meal per segment in meal-step blue shades, total count in center
  - Macro bars: horizontal progress bars with label left, value right, color-coded per macro
  - Cards: white on canvas with very subtle `box-shadow: 0 1px 2px rgb(16 18 24 / 0.04)` and 16px radius
  - Day strip: 7 buttons in a row, selected day gets `#17181c` pill background with white text

## Storyboard

Scene summary:
1. **Hook** — 3s — "Photograph a meal." centered on canvas in display type
2. **The flow** — 8s — Phone mockup: camera → tap → analyzing card → draft food card → save
3. **The day** — 5s — Dashboard ring updating with lunch segment + macro bars filling
4. **Punchline / Outro** — 4s — "Going over is information, not a failure state." → "MyCal"

Total: 20s

### Scene 1 — Hook — 3s
Canvas `#f2f2f7`, full bleed. No card, no phone.
Text: **"Photograph a meal."** in 44px display weight, `#1c1c1e`, center-aligned, slides up from y+12px, settles and holds 2.2s.
Nothing else on screen. The product's proposition in 3 words.

### Scene 2 — The flow — 8s
A portrait phone mockup (white card, 16px radius, mild shadow, ~380×720 in-frame) centered on the canvas.
- 0.0–1.5s: Inside the mockup, a camera viewfinder scene: a meal image fills the viewfinder (recreate a warm-toned plate — reds/oranges/greens to suggest food). A shutter button is visible at the bottom.
- 1.5s: A cursor dot or tap gesture appears over the shutter button. Click SFX fires.
- 1.8–3.5s: The mockup transitions to the dashboard/day view. A blue sweep card (the `job-sweep` shimmer effect) appears: "Analyzing · Chicken tikka masala" — the shimmer sweeps left to right in blue (#57a0f7 tint), width ~100% of card.
- 3.5–6.5s: A bottom sheet slides up from below the mockup: the draft food card. Readable fields:
  - Title: **Chicken tikka masala** (bold, 17px)
  - Calories: **480 kcal** (prominent)
  - Protein: 32g · Carbs: 52g · Fat: 12g (row of chips/tags)
  - One value (e.g. "32g" protein) has a cursor blink, showing it's editable
- 6.5–8.0s: A "Save" button (`#17181c` background, white text, 16px radius) gets a tap gesture → button briefly scales to 0.97 → draft card dismisses upward.
Sequential/interaction: yes — camera tap, analyzing sweep, draft card open, save tap — each beat is a distinct moment
Audio-coupled idea: shutter tap at ~t=1.5s (click SFX); card pop at ~t=3.5s (soft drop SFX optional)

### Scene 3 — The day — 5s
Full-frame dashboard (no phone wrapper now — the UI fills the landscape frame, phone-width content centered on `#f2f2f7`).
The calorie ring is the hero:
- 0.0–1.0s: Existing breakfast segment (`#9cc8ff`) is already on the ring. The lunch segment (`#57a0f7`) draws in, rotating along the arc from the breakfast end. Total text in center animates from "860 kcal" to **"1,340 kcal"**. Target text: "of 2,000". Ring progress: ~67%.
  - BEAT LOCK: ring segment completion lands at ~17.02s strong cue (adjust start so this moment is at video t≈14s → music track t≈17.02s)
  - `impact/impactBell_heavy_000` fires when the segment arc completes
- 1.0–3.0s: Below the ring, three macro progress bars appear staggered 0.3s apart:
  - Protein — filled portion `#12a065` green — label "Protein" left, "64g / 150g" right
  - Carbs — filled portion `#db8500` amber — "Carbs" / "104g / 200g"
  - Fat — filled portion `#8a57e0` purple — "Fat" / "26g / 65g"
  - Each bar animates from 0% to its filled width over 0.5s with `cubic-bezier(0.22, 1, 0.36, 1)`
  - Snap each bar's start to consecutive beats (~0.5s apart): Protein at beat t≈14.5s, Carbs t≈15.0s, Fat t≈15.5s (beat-grid alignment)
- 3.0–5.0s: Full dashboard holds. The ring glow very subtly breathes with music RMS. Breathes naturally.
Sequential/interaction: yes — ring segment draws in, then 3 macro bars stagger in order
Audio-reactive treatment: subtle; apply music RMS/bass to a very soft outer glow on the ring. No waveform or equalizer graphics. Restraint.

### Scene 4 — Punchline / Outro — 4s
Fade back to bare canvas `#f2f2f7`.
- 0.0–0.5s: Crossfade from dashboard to empty canvas.
- 0.5–2.0s: Text fades up: **"Going over is information, not a failure state."** — 18px, `#6e6e73` (ink-2), max-width ~520px, centered, italic or regular weight. Holds.
  - Optional: `interface/drop_001` very softly as it appears.
  - BEAT LOCK: text appears near 20.02s strong cue (video t≈19s → music t≈20.02s)
- 2.0–2.5s: Punchline text fades out.
- 2.5–4.0s: **MyCal** wordmark in 32px display weight, `#1c1c1e`, centered, fades in and holds. Clean.
- Music fades to 0 by t=20s, so the wordmark lands in near-silence.
Sequential/interaction: none

## Audio
- Audio role: warm clean corporate bed; polished, restrained SFX at 2 key moments
- Audio arc: Enters softly under the hook → builds through the flow → peaks with bell at ring reveal → fades gracefully to near-silence under the wordmark
- Music: `assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3`
- Music treatment: volume 0.30, start t=0, continuous through video, fade to 0 between t=18-20s; let the impactBell SFX ring over the final fade
- Music cue guidance: bundled preset at `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`; BPM ≈ 120; beat period ~0.5s; strong cues in planning window: 16.02s, 17.02s, 17.52s, 18.52s, 20.02s; use 2 strong-cue locks: (1) ring reveal at video t≈14s → target music t≈17.02s, (2) punchline text at video t≈19s → target music t≈20.02s
- Audio-reactive treatment: subtle; use music RMS/bass to modulate a very soft outer glow on the calorie ring in Scene 3. No equalizer bars, no waveform, no pulsing text.
- Audio-coupled moments:
  - Scene 2, t≈1.5s — camera shutter tap → `interface/click_001` or `ui/mouseclick1` at volume 0.70
  - Scene 3, ring arc completes (~t≈14.8s) → `impact/impactBell_heavy_000` at volume 0.75 (the emotional payoff)
  - Scene 4, punchline text appears (~t≈19s) → `interface/drop_001` at volume 0.50 (optional, skip if too busy)
- SFX selection guidance: polished tone — prefer subtle, professional sounds; 2-3 cues maximum; `impactBell_heavy_000` is the hero SFX; click_001 for the tap; nothing aggressive or comedic
- SFX analysis guidance: follow sfx-analysis.md in the brag skill assets; prefer low/medium high-frequency-risk files for polished context
- Exact SFX choice: Hyperframes chooses final filenames, timestamps, density, and volume based on implemented animation
- Audio files: copy chosen music and SFX into `brag-output/composition/assets/`

## Hyperframes Instructions
Load `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli`. This is a `/brag` workflow — do not enter the `hyperframes` entry-point intent interview.

Requirements:
- Show at least one real UI element from the project: the calorie ring (segmented arc in meal-step blues) and the macro bars (protein/carbs/fat color-coded) are mandatory
- Keep all text readable in the final render; no text flashes off before it can be read
- The hook line "Photograph a meal." must hold at least 2s settled
- The punchline "Going over is information, not a failure state." must hold at least 1.5s settled
- Total duration: exactly 20s
- Include music and the 2 planned SFX cues
- Treat music cue metadata as optional timing hints — readability and story first
- Beat-lock the ring reveal to music strong cue near 17.02s; beat-lock the punchline to 20.02s cue
- Snap macro bar reveals to consecutive beat-grid points ~0.5s apart
- Apply subtle RMS/bass audio-reactive glow to the ring in Scene 3 only
- Run `hyperframes check` before render; fix all errors including WCAG contrast failures
- Render to `../brag.mp4` (one level up from composition/)
