# Brag Plan: MyCal

## What is this app?
MyCal is a mobile-first PWA that lets you photograph any meal, get an AI-estimated calorie and macro breakdown you can edit, and watch your day's ring fill — without moralizing, gamifying, or pretending the model is smarter than you.

## The angle
Most calorie apps feel like you're confessing to a school principal. MyCal's posture is: *here's the estimate, it's yours to edit, going over is information not a verdict.* The video captures that quiet confidence — a tool that respects the person using it. No streaks. No shame. Just the food, the numbers, and your call.

## Hook (first 2-3 seconds)
"Photograph a meal." — clean white canvas, iOS display type, nothing else. The product's entire proposition in three words. Holds long enough to land, then the phone appears.

## Key moments (the middle)
- The shutter click → the job sweep card in the day view showing "Analyzing…" — the product doing its thing in the background so you can keep your day
- The editable draft card opening: "Chicken tikka masala · 480 kcal · Protein 32g · Carbs 52g · Fat 12g" — you can change any number before it hits your log
- The dashboard ring updating: a lunch segment slides into the arc, the macro bars (protein green, carbs amber, fat purple) fill left to right, total settles at "1,340 of 2,000 kcal"

## Outro / punchline
The screen clears to the canvas. One line, from the app itself: "Going over is information, not a failure state." A beat. Then the MyCal wordmark. No CTA. The line is the pitch.

## User flow worth showing
- **Entry:** Camera screen — a tap — the shutter fires
- **Key action:** Analyzing job card sweeps in the background; draft food card opens with editable fields
- **Result:** Dashboard ring updates with the new meal segment; macros fill in proportion

## Tone
- Preset: `polished`
- Creative direction: "quiet premium health tool that treats you like an adult"
- Interpretation: Restraint over enthusiasm. Long enough holds for every line to land. Clean transitions, no flash. The product's visual design already does the heavy lifting — let it breathe.

## Format: landscape — 1920×1080
## Duration: 20s target

## Visual identity (from the project)
- Background: `#f2f2f7` (canvas, iOS grouped background)
- Paper / card surface: `#ffffff`
- Accent / near-black CTA: `#17181c`
- Tint / interactive blue: `#0a6cf0`
- Protein: `#12a065` (green)
- Carbs: `#db8500` (amber)
- Fat: `#8a57e0` (purple)
- Meal segments: breakfast `#9cc8ff` → lunch `#57a0f7` → dinner `#0a6cf0`
- Display font: SF Pro Display / -apple-system / Inter (system stack)
- Body font: SF Pro Text / -apple-system / Inter (system stack)
- Strongest visual element: Calorie ring with meal-step color segments; macro progress bars in three categorical hues

## Share copy (draft)
Point your phone at food. Review the estimate. Keep the day honest. MyCal — the calorie tracker that doesn't pretend to know more than you do.

## Audio direction
- Role: warm clean bed; polished, restrained SFX at the tap and the ring reveal
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` — most energetic bundled track; strong beats emerge in the 16-23s window which aligns with the outro punchline
- Music treatment: start at 0s, volume 0.30, fade to silence by 20s; let the final SFX ring over the fade
- Music cue guidance: bundled preset at `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`; BPM ≈ 120; target 17.02s strong cue for the dashboard ring reveal (Scene 3 entry); target 20.02s strong cue for the punchline text appearance (Scene 4); use ≤ 2 strong-cue locks total
- Audio-reactive treatment: subtle; use music RMS/bass to make the calorie ring's border glow breathe very slightly; no waveform/equalizer graphics
- SFX posture: sparse; 2-3 cues only; keep it professional
- Audio-coupled moments:
  - Scene 2 camera tap → `interface/click_001` or `ui/mouseclick1` (the shutter)
  - Scene 3 ring reveal → `impact/impactBell_heavy_000` at the moment the segment slides in (the payoff)
  - Scene 4 punchline text → `interface/drop_001` soft accent as copy appears (optional)
- Restraint rule: music should not overpower; no stacked SFX; no SFX on text that doesn't need emphasis

## Storyboard

### Scene 1 — Hook — 3s
Canvas: `#f2f2f7`. Nothing but the display headline.
Text: **"Photograph a meal."** — 36–40pt, SF Pro Display, `#1c1c1e`, center-aligned, slides up from slightly below.
Holds for 2.2s after landing. Clean and spare.
Sequential/interaction: none
Audio intent: quiet intro under the clean open; music barely audible
Audio-coupled idea: none — let the silence before the shutter carry weight
Music: warm bed fading in gently
Transition mood: soft crossfade → Scene 2

### Scene 2 — The flow — 8s
Phone mockup (portrait, `#ffffff` card on the canvas) slides in from right.
- 0.0–1.5s: Camera viewfinder shows a meal photo (recreate: a plate with color, simulated)
- 1.5s: Simulated tap/cursor click on the shutter button — SFX fires
- 1.8–3.5s: View shifts to the dashboard / day view; a blue sweep card appears: **"Analyzing · Chicken tikka masala"** with the `job-sweep` shimmer animation
- 3.5–6.5s: Draft food card opens from bottom: **"Chicken tikka masala"** | `480 kcal` | Protein `32g` · Carbs `52g` · Fat `12g` — fields are editable, one field has a cursor blink showing it can be changed
- 6.5–8.0s: "Save" button tap → card confirms → closes
Sequential/interaction: yes — camera → sweep card → draft card → confirm; each step beats out. Simulate the tap with a cursor dot and click SFX
Audio intent: energy building; SFX matches the interaction
Audio-coupled idea: shutter tap at 1.5s (click SFX), draft card pop-in at 3.5s (soft drop SFX optional)
Music: building, slightly more present
Transition mood: clean cut → Scene 3

### Scene 3 — The day — 5s
Dashboard card fills the frame (no phone mockup — full-bleed).
- 0.0–1.0s: Calorie ring animates in; a new lunch segment (#57a0f7) slides along the arc from the existing breakfast segment (#9cc8ff); total text updates: **"1,340 / 2,000 kcal"**
- 1.0–3.0s: Below the ring, three macro bars fill left to right staggered 0.3s apart: Protein (green) · Carbs (amber) · Fat (purple)
- 3.0–5.0s: Full dashboard holds — ring, macros, meal list below. Breathes.
Beat-lock the ring reveal to 17.02s strong cue (≈ video timeline 14s; adjust scene start to align).
Sequential/interaction: yes — ring segment arrives, then 3 macro bars stagger in
Audio intent: the biggest emotional payoff; the impactBell rings here
Audio-coupled idea: `impact/impactBell_heavy_000` when the ring segment completes (~0.8s into scene); macro bars can each get a very soft drop if not too dense
Music: at full presence for this scene; beat-locked reveal
Transition mood: soft crossfade → Scene 4

### Scene 4 — Punchline / Outro — 4s
Back to the bare canvas `#f2f2f7`.
- 0.0–1.0s: Fade in. Clean.
- 1.0–2.5s: Sentence fades up: **"Going over is information, not a failure state."** — smaller type, `#6e6e73` (ink-2), centered. Holds.
- 2.5–4.0s: Sentence fades out. **MyCal** wordmark appears in `#1c1c1e` display font, simple, centered.
Sequential/interaction: none
Audio intent: quiet, resolved; music fades as wordmark lands
Audio-coupled idea: `interface/drop_001` very softly as punchline text appears (optional); music fades to 0 by 4s
Music: fading gracefully to silence under the wordmark
Transition mood: end

**Music mood for this video:** clean, warm, upbeat-restrained
**Audio summary:** Music enters softly under the hook, builds through the flow and ring reveal, peaks at the impactBell payoff, then fades gracefully as the punchline lands and MyCal closes the frame.

## Music cue guidance
- Track: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (~120 BPM)
- Preset JSON: `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`
- Beat grid start: ~3.02s into track, every ~0.5s thereafter
- Strong cues in 15-25s window: 16.02s, 17.02s, 17.52s, 18.02s, 18.52s, 20.02s
- Lock 1: ring reveal (Scene 3 entry, approximately video t=14s) → target strong cue near 17.02s by adjusting scene start
- Lock 2: punchline text (Scene 4, approximately video t=19s) → target strong cue near 20.02s
- Beat grid for macro bars (3 sequential, Scene 3 t≈1.0s into scene): snap to 3 consecutive beats ~0.5s apart
- Restraint: do not force readability to suffer for beat alignment; product story is primary
