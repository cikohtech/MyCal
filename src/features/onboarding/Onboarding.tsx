import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { ActivityLevel, Goal, Profile, SexForBmr, UnitPreference } from '@/types/domain'
import { useSession } from '@/app/session'
import { useCreateTarget, useSaveProfile, useSaveWeight } from '@/app/queries'
import { Button } from '@/components/Button'
import { ChoiceField, HeroNumberField, SelectField, TextField } from '@/components/Field'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ListGroup, ListRow } from '@/components/List'
import { Callout } from '@/components/Callout'
import { MacroAllocation } from '@/components/MacroAllocation'
import { useToast } from '@/components/Toast'
import {
  CameraIcon, ChevronLeftIcon, FlameIcon, ScaleIcon, ShieldIcon,
} from '@/components/Icons'
import { ACTIVITY_LABELS, GOAL_LABELS, bmiBand, buildTarget, inToCm, lbToKg } from '@/lib/calc'
import { detectTimezone, supportedTimezones } from '@/lib/dates'
import { kcal } from '@/lib/format'

/**
 * One question per screen. Setup is the first thing anybody does here, and a
 * single form asking for nine things at once is the surest way to lose them —
 * so each screen asks for one, validates it there, and moves on.
 */
const STEPS = [
  'welcome', 'name', 'units', 'age', 'height', 'weight',
  'formula', 'activity', 'goal', 'plan',
] as const

type Step = (typeof STEPS)[number]

/** The welcome and the result bookend the questions; only these count. */
const ASKED: Step[] = ['name', 'units', 'age', 'height', 'weight', 'formula', 'activity', 'goal']

interface Draft {
  display_name: string
  age: string
  sex_for_bmr: SexForBmr
  height_cm: string
  height_ft: string
  height_in: string
  weight: string
  activity_level: ActivityLevel
  goal: Goal
  unit_preference: UnitPreference
  timezone: string
  custom_calorie_target: string
}

export function Onboarding() {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user, today, profile } = useSession()
  const userId = user!.id

  const saveProfile = useSaveProfile(userId)
  const createTarget = useCreateTarget(userId)
  const saveWeight = useSaveWeight(userId)

  const [index, setIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)

  const step = STEPS[index]

  // React Query notifies observers on a later tick, so the session's profile
  // arrives after the mutation resolves. Leaving before it lands would bounce
  // off the dashboard guard and drop the user back at step one.
  useEffect(() => {
    if (finished && profile) {
      toast.done('You are set up. Log your first meal whenever you like.')
      navigate('/today', { replace: true })
    }
  }, [finished, profile, navigate, toast])

  const [draft, setDraft] = useState<Draft>({
    display_name: profile?.display_name ?? '',
    age: profile ? String(profile.age) : '',
    sex_for_bmr: profile?.sex_for_bmr ?? 'female',
    height_cm: profile ? String(profile.height_cm) : '',
    height_ft: '',
    height_in: '',
    weight: '',
    activity_level: profile?.activity_level ?? 'light',
    goal: profile?.goal ?? 'maintain',
    unit_preference: profile?.unit_preference ?? 'metric',
    timezone: profile?.timezone ?? detectTimezone(),
    custom_calorie_target: '',
  })

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const metric = draft.unit_preference === 'metric'

  const heightCm = useMemo(() => {
    if (metric) return Number(draft.height_cm)
    const feet = Number(draft.height_ft) || 0
    const inches = Number(draft.height_in) || 0
    return inToCm(feet * 12 + inches)
  }, [metric, draft.height_cm, draft.height_ft, draft.height_in])

  const weightKg = useMemo(() => {
    const raw = Number(draft.weight)
    if (!Number.isFinite(raw) || raw <= 0) return 0
    return metric ? raw : lbToKg(raw)
  }, [metric, draft.weight])

  const age = Number(draft.age)
  const needsCustom = draft.sex_for_bmr === 'unspecified'

  const result = useMemo(() => buildTarget({
    age, sex_for_bmr: draft.sex_for_bmr, height_cm: heightCm, weight_kg: weightKg,
    activity_level: draft.activity_level, goal: draft.goal,
    custom_calorie_target: needsCustom ? Number(draft.custom_calorie_target) || null : null,
  }), [age, draft.sex_for_bmr, heightCm, weightKg, draft.activity_level, draft.goal,
    needsCustom, draft.custom_calorie_target])

  /** Each screen answers for itself; nothing is validated twice. */
  function validate(current: Step): string | null {
    if (current === 'age') {
      if (!Number.isFinite(age) || age < 13 || age > 110) {
        return 'Enter an age between 13 and 110. My Cal is built for adults tracking their own intake.'
      }
    }
    if (current === 'height') {
      if (!Number.isFinite(heightCm) || heightCm < 90 || heightCm > 250) {
        return metric ? 'Enter a height between 90 and 250 cm.' : 'Enter a height between 3′ and 8′.'
      }
    }
    if (current === 'weight') {
      if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 400) {
        return metric ? 'Enter a weight between 25 and 400 kg.' : 'Enter a weight between 55 and 880 lb.'
      }
    }
    if (current === 'formula' && needsCustom) {
      const custom = Number(draft.custom_calorie_target)
      if (!Number.isFinite(custom) || custom < 1000 || custom > 6000) {
        return 'Enter a daily calorie target between 1,000 and 6,000 kcal.'
      }
    }
    return null
  }

  function next() {
    const problem = validate(step)
    if (problem) return setError(problem)
    setError(null)
    setIndex((i) => Math.min(STEPS.length - 1, i + 1))
  }

  function back() {
    setError(null)
    setIndex((i) => Math.max(0, i - 1))
  }

  async function finish() {
    setError(null)
    try {
      const profileRecord: Profile = {
        user_id: userId,
        display_name: draft.display_name.trim() || null,
        age,
        sex_for_bmr: draft.sex_for_bmr,
        height_cm: Math.round(heightCm),
        activity_level: draft.activity_level,
        goal: draft.goal,
        timezone: draft.timezone,
        unit_preference: draft.unit_preference,
        custom_calorie_target: needsCustom ? Number(draft.custom_calorie_target) : null,
      }
      await saveProfile.mutateAsync(profileRecord)
      await saveWeight.mutateAsync({ recordedOn: today, weightKg, note: null })
      await createTarget.mutateAsync({
        effective_on: today,
        input_age: age,
        input_sex_for_bmr: draft.sex_for_bmr,
        input_height_cm: Math.round(heightCm),
        input_weight_kg: weightKg,
        input_activity_level: draft.activity_level,
        input_goal: draft.goal,
        bmi: result.bmi,
        bmr_kcal: result.bmr_kcal ?? 0,
        tdee_kcal: result.tdee_kcal ?? 0,
        calorie_target_kcal: result.calorie_target_kcal,
        protein_target_g: result.macros.protein_g,
        carbs_target_g: result.macros.carbs_g,
        fat_target_g: result.macros.fat_g,
        fibre_target_g: result.macros.fibre_g,
      })
      await queryClient.invalidateQueries()
      setFinished(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your profile.')
    }
  }

  const busy = finished || saveProfile.isPending || createTarget.isPending || saveWeight.isPending
  const askedIndex = ASKED.indexOf(step)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (step === 'plan') void finish()
    else next()
  }

  /* ------------------------------- welcome ------------------------------- */

  if (step === 'welcome') {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[460px] flex-col px-5 pt-safe">
        <div className="flex flex-1 flex-col justify-center py-10">
          <div className="pop-in">
            <span className="grid h-[62px] w-[62px] place-items-center rounded-[18px] bg-[var(--color-accent)] text-[var(--color-accent-ink)] shadow-[var(--shadow-lift)]">
              <FlameIcon size={30} strokeWidth={1.7} />
            </span>
            <h1 className="mt-6 text-[2.4rem] leading-[1.05]">
              Let’s set up<br />your day.
            </h1>
            <p className="mt-3 max-w-[32ch] text-[1.02rem] leading-relaxed text-[var(--color-ink-2)]">
              Eight quick questions. They give you a calorie and macro target you can
              change at any time.
            </p>
          </div>

          <div className="rise mt-9 flex flex-col gap-5" style={{ animationDelay: '120ms' }}>
            {[
              { icon: <CameraIcon size={19} />, title: 'Photograph a meal', body: 'An estimate comes back that you review before anything is logged.' },
              { icon: <ScaleIcon size={19} />, title: 'Watch the real trend', body: 'Weigh-ins get a fitted line, so noise does not read as progress.' },
              { icon: <ShieldIcon size={19} />, title: 'Yours to correct', body: 'Every number is editable, and nothing is shared anywhere.' },
            ].map((item) => (
              <div key={item.title} className="flex gap-3.5">
                <span className="mt-0.5 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[var(--color-fill)] text-[var(--color-ink)]">
                  {item.icon}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold leading-tight">{item.title}</p>
                  <p className="mt-1 text-[0.88rem] leading-snug text-[var(--color-ink-2)]">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pb-safe pt-2">
          <Button variant="primary" size="lg" full onClick={() => setIndex(1)}>
            Get started
          </Button>
          <p className="mt-3 px-2 text-center text-[0.76rem] leading-relaxed text-[var(--color-ink-3)]">
            My Cal produces estimates to help you track intake. It is not medical advice.
          </p>
        </div>
      </div>
    )
  }

  /* -------------------------------- steps -------------------------------- */

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[460px] flex-col">
      {/* Progress and the way back, pinned so they never scroll away. */}
      <header className="glass-canvas sticky top-0 z-30 px-4 pt-safe-0">
        <div className="flex h-[46px] items-center gap-3">
          <button
            type="button" onClick={back} aria-label="Back"
            className="press -ml-2 grid h-9 w-9 place-items-center rounded-full text-[var(--color-tint)]"
          >
            <ChevronLeftIcon size={22} strokeWidth={2.4} />
          </button>
          <div className="flex flex-1 gap-1" aria-hidden="true">
            {ASKED.map((key, position) => (
              <span
                key={key}
                className="h-[3px] flex-1 rounded-full transition-colors duration-300"
                style={{
                  background: step === 'plan' || position <= askedIndex
                    ? 'var(--color-accent)'
                    : 'var(--color-line-strong)',
                }}
              />
            ))}
          </div>
          <span className="tnum w-[42px] shrink-0 text-right text-[0.78rem] font-medium text-[var(--color-ink-3)]">
            {step === 'plan' ? 'Done' : `${askedIndex + 1}/${ASKED.length}`}
          </span>
        </div>
      </header>

      <form onSubmit={onSubmit} className="flex flex-1 flex-col px-5">
        <div key={step} className="push-in flex flex-1 flex-col pb-6 pt-6">
          {step === 'name' && (
            <StepBody
              title="What should I call you?"
              body="Only used to greet you on the day screen. Skip it if you would rather not."
            >
              <TextField
                label="Name" value={draft.display_name} autoFocus
                onChange={(e) => set('display_name', e.target.value)}
                placeholder="Optional" autoComplete="given-name" enterKeyHint="next"
              />
            </StepBody>
          )}

          {step === 'units' && (
            <StepBody
              title="Which units do you think in?"
              body="Display only — everything is stored in kilograms and centimetres, so you can switch later without touching your history."
            >
              <SegmentedControl<UnitPreference>
                label="Units"
                value={draft.unit_preference}
                onChange={(value) => set('unit_preference', value)}
                options={[
                  { value: 'metric', label: 'kg · cm' },
                  { value: 'imperial', label: 'lb · ft' },
                ]}
              />
              <div className="mt-6 grid grid-cols-2 gap-3 text-center">
                {[
                  { label: 'Weight', value: metric ? '72.4 kg' : '159.6 lb' },
                  { label: 'Height', value: metric ? '174 cm' : '5′ 9″' },
                ].map((sample) => (
                  <div key={sample.label} className="card px-4 py-3.5">
                    <p className="text-[0.76rem] text-[var(--color-ink-3)]">{sample.label}</p>
                    <p className="tnum mt-0.5 text-[1.15rem] font-semibold">{sample.value}</p>
                  </div>
                ))}
              </div>
            </StepBody>
          )}

          {step === 'age' && (
            <StepBody title="How old are you?" body="The equation weights age directly." center>
              <HeroNumberField
                label="Age" value={draft.age} onChange={(value) => set('age', value)}
                unit="years" placeholder="30" inputMode="numeric" autoFocus
              />
            </StepBody>
          )}

          {step === 'height' && (
            <StepBody title="How tall are you?" body="Used for your estimated burn and your BMI." center>
              {metric ? (
                <HeroNumberField
                  label="Height in centimetres" value={draft.height_cm}
                  onChange={(value) => set('height_cm', value)} unit="cm" placeholder="174" autoFocus
                />
              ) : (
                <div className="flex items-baseline justify-center gap-5">
                  <HeroNumberField
                    label="Height in feet" value={draft.height_ft}
                    onChange={(value) => set('height_ft', value)} unit="ft" placeholder="5"
                    inputMode="numeric" autoFocus
                  />
                  <HeroNumberField
                    label="Height in inches" value={draft.height_in}
                    onChange={(value) => set('height_in', value)} unit="in" placeholder="9"
                    inputMode="numeric"
                  />
                </div>
              )}
            </StepBody>
          )}

          {step === 'weight' && (
            <StepBody
              title="What do you weigh today?"
              body="Saved as your first weigh-in, so your trend line starts from here."
              center
            >
              <HeroNumberField
                label="Weight" value={draft.weight} onChange={(value) => set('weight', value)}
                unit={metric ? 'kg' : 'lb'} placeholder={metric ? '72' : '160'} autoFocus
              />
            </StepBody>
          )}

          {step === 'formula' && (
            <StepBody
              title="Which formula should I use?"
              body="Mifflin–St Jeor has two constants and no third option. If neither fits, set the number yourself."
            >
              <ChoiceField<SexForBmr>
                value={draft.sex_for_bmr}
                onChange={(value) => set('sex_for_bmr', value)}
                options={[
                  { value: 'female', title: 'Female', detail: 'Mifflin–St Jeor, female constant' },
                  { value: 'male', title: 'Male', detail: 'Mifflin–St Jeor, male constant' },
                  { value: 'unspecified', title: 'I’ll set my own target', detail: 'You give the calorie number instead of the equation' },
                ]}
              />
              {needsCustom && (
                <div className="mt-4">
                  <TextField
                    label="Your daily calorie target" inputMode="numeric" suffix="kcal" autoFocus
                    value={draft.custom_calorie_target}
                    onChange={(e) => set('custom_calorie_target', e.target.value)}
                    hint="Use a number you or a clinician have chosen."
                  />
                </div>
              )}
            </StepBody>
          )}

          {step === 'activity' && (
            <StepBody
              title="How does an ordinary week go?"
              body="Pick the description that matches a normal week, not your best one."
            >
              <ChoiceField<ActivityLevel>
                value={draft.activity_level}
                onChange={(value) => set('activity_level', value)}
                options={(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((key) => ({
                  value: key, ...ACTIVITY_LABELS[key],
                }))}
              />
            </StepBody>
          )}

          {step === 'goal' && (
            <StepBody
              title="What are you aiming for?"
              body="A starting point, not a promise about how fast anything changes."
            >
              <ChoiceField<Goal>
                value={draft.goal}
                onChange={(value) => set('goal', value)}
                options={(Object.keys(GOAL_LABELS) as Goal[]).map((key) => ({
                  value: key, ...GOAL_LABELS[key],
                }))}
              />
            </StepBody>
          )}

          {step === 'plan' && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[0.84rem] font-medium text-[var(--color-tint)]">Your plan</p>
                <h1 className="mt-1 text-[2rem] leading-[1.1]">
                  {draft.display_name.trim() ? `Here it is, ${draft.display_name.trim()}.` : 'Here is your target.'}
                </h1>
              </div>

              <div className="card px-5 py-5 text-center">
                <p className="text-[0.78rem] font-medium uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
                  Daily calories
                </p>
                <p className="tnum mt-1 text-[3.4rem] font-bold leading-none tracking-[-0.035em]">
                  {kcal(result.calorie_target_kcal)}
                </p>
                <p className="mt-1.5 text-[0.88rem] text-[var(--color-ink-2)]">
                  {GOAL_LABELS[draft.goal].detail}
                </p>
              </div>

              <div className="card px-5 py-5">
                <h2 className="mb-3.5 text-[1.05rem]">Where they come from</h2>
                <MacroAllocation macros={result.macros} calories={result.calorie_target_kcal} />
              </div>

              <ListGroup
                label="The workings"
                note="Protein at 1.6 g per kg of body weight, fat at a quarter of your calories, carbohydrate takes the rest, fibre at 14 g per 1,000 kcal."
              >
                <ListRow title="BMI" value={`${result.bmi.toFixed(1)} · ${bmiBand(result.bmi)}`} />
                <ListRow title="At rest (BMR)" value={result.bmr_kcal ? `${kcal(result.bmr_kcal)} kcal` : '—'} />
                <ListRow title="With activity (TDEE)" value={result.tdee_kcal ? `${kcal(result.tdee_kcal)} kcal` : '—'} />
              </ListGroup>

              <div className="card p-4">
                <SelectField
                  label="Timezone" value={draft.timezone}
                  onChange={(e) => set('timezone', e.target.value)}
                  hint="Decides which day a meal belongs to when you log late at night."
                >
                  {supportedTimezones().map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                </SelectField>
              </div>

              <Callout tone="estimate" title="These are estimates">
                {result.bmr_kcal
                  ? 'The equation and activity multipliers describe populations, not you. Watch your own weight trend over a few weeks and adjust.'
                  : 'You set this target yourself, so no sex-specific equation is applied.'}
              </Callout>
            </div>
          )}

        </div>

        {error && <Callout tone="problem" className="mb-3">{error}</Callout>}

        {/* The commit stays under the thumb on every screen. */}
        <div className="glass-canvas sticky bottom-0 -mx-5 px-5 pb-safe pt-3">
          {step === 'plan' ? (
            <Button type="submit" variant="primary" size="lg" full loading={busy}>
              Start tracking
            </Button>
          ) : (
            <>
              <Button type="submit" variant="primary" size="lg" full>Continue</Button>
              {step === 'name' && (
                <button
                  type="button" onClick={next}
                  className="press mx-auto mt-2 block rounded-lg px-3 py-1.5 text-[0.9rem] font-medium text-[var(--color-ink-2)]"
                >
                  Skip
                </button>
              )}
            </>
          )}
        </div>
      </form>
    </div>
  )
}

function StepBody({
  title, body, center, children,
}: { title: string; body?: string; center?: boolean; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <h1 className="text-[1.95rem] leading-[1.12]">{title}</h1>
      {body && (
        <p className="mt-2.5 max-w-[38ch] text-[0.95rem] leading-relaxed text-[var(--color-ink-2)]">
          {body}
        </p>
      )}
      <div className={center ? 'flex flex-1 items-center justify-center pb-10' : 'mt-8'}>
        {children}
      </div>
    </div>
  )
}
