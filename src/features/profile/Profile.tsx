import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { ActivityLevel, Goal, SexForBmr, UnitPreference } from '@/types/domain'
import { useSession } from '@/app/session'
import {
  useCreateTarget, useSaveProfile, useTargetOn, useTargets, useWeights,
} from '@/app/queries'
import { store } from '@/services/db'
import { Button } from '@/components/Button'
import { ChoiceField, SelectField, TextField } from '@/components/Field'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ListGroup, ListRow } from '@/components/List'
import { Sheet } from '@/components/Sheet'
import { Callout } from '@/components/Callout'
import { useToast } from '@/components/Toast'
import { LogOutIcon, PencilIcon, ShieldIcon, TrashIcon } from '@/components/Icons'
import { ACTIVITY_LABELS, GOAL_LABELS, bmiBand, buildTarget } from '@/lib/calc'
import { friendlyDate, supportedTimezones } from '@/lib/dates'
import { height as formatHeight, kcal, weight as formatWeight } from '@/lib/format'

type Theme = 'system' | 'light' | 'dark'

export function Profile() {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user, profile, today, signOut } = useSession()
  const userId = user!.id

  const saveProfile = useSaveProfile(userId)
  const createTarget = useCreateTarget(userId)
  const targetQuery = useTargetOn(userId, today)
  const targetsQuery = useTargets(userId)
  const weightsQuery = useWeights(userId)

  const [editing, setEditing] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('mycal.theme') as Theme) ?? 'system',
  )

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    localStorage.setItem('mycal.theme', theme)
  }, [theme])

  const latestWeight = weightsQuery.data?.at(-1)?.weight_kg ?? 0
  const unit = profile?.unit_preference ?? 'metric'
  const target = targetQuery.data
  const name = profile?.display_name?.trim() || ''

  const [form, setForm] = useState({
    display_name: '', age: '', sex_for_bmr: 'female' as SexForBmr, height_cm: '',
    activity_level: 'light' as ActivityLevel, goal: 'maintain' as Goal,
    timezone: 'UTC', unit_preference: 'metric' as UnitPreference,
    custom_calorie_target: '', override_target: '',
  })

  useEffect(() => {
    if (!profile) return
    setForm({
      display_name: profile.display_name ?? '',
      age: String(profile.age),
      sex_for_bmr: profile.sex_for_bmr,
      height_cm: String(profile.height_cm),
      activity_level: profile.activity_level,
      goal: profile.goal,
      timezone: profile.timezone,
      unit_preference: profile.unit_preference,
      custom_calorie_target: profile.custom_calorie_target ? String(profile.custom_calorie_target) : '',
      override_target: '',
    })
  }, [profile, editing])

  const preview = useMemo(() => buildTarget({
    age: Number(form.age),
    sex_for_bmr: form.sex_for_bmr,
    height_cm: Number(form.height_cm),
    weight_kg: latestWeight,
    activity_level: form.activity_level,
    goal: form.goal,
    custom_calorie_target: form.override_target
      ? Number(form.override_target)
      : form.sex_for_bmr === 'unspecified' ? Number(form.custom_calorie_target) || null : null,
  }), [form, latestWeight])

  async function save() {
    setError(null)
    const age = Number(form.age)
    const heightCm = Number(form.height_cm)
    if (!Number.isFinite(age) || age < 13 || age > 110) return setError('Enter an age between 13 and 110.')
    if (!Number.isFinite(heightCm) || heightCm < 90 || heightCm > 250) return setError('Enter a height between 90 and 250 cm.')
    if (form.sex_for_bmr === 'unspecified' && !form.override_target) {
      const custom = Number(form.custom_calorie_target)
      if (!Number.isFinite(custom) || custom < 1000 || custom > 6000) {
        return setError('Set a daily calorie target between 1,000 and 6,000 kcal.')
      }
    }

    try {
      await saveProfile.mutateAsync({
        user_id: userId,
        display_name: form.display_name.trim() || null,
        age,
        sex_for_bmr: form.sex_for_bmr,
        height_cm: Math.round(heightCm),
        activity_level: form.activity_level,
        goal: form.goal,
        timezone: form.timezone,
        unit_preference: form.unit_preference,
        custom_calorie_target: form.override_target
          ? Number(form.override_target)
          : form.sex_for_bmr === 'unspecified' ? Number(form.custom_calorie_target) : null,
      })

      // A new version takes effect from today; every earlier day keeps the
      // target that was in force when it happened.
      await createTarget.mutateAsync({
        effective_on: today,
        input_age: age,
        input_sex_for_bmr: form.sex_for_bmr,
        input_height_cm: Math.round(heightCm),
        input_weight_kg: latestWeight,
        input_activity_level: form.activity_level,
        input_goal: form.goal,
        bmi: preview.bmi,
        bmr_kcal: preview.bmr_kcal ?? 0,
        tdee_kcal: preview.tdee_kcal ?? 0,
        calorie_target_kcal: preview.calorie_target_kcal,
        protein_target_g: preview.macros.protein_g,
        carbs_target_g: preview.macros.carbs_g,
        fat_target_g: preview.macros.fat_g,
        fibre_target_g: preview.macros.fibre_g,
      })

      toast.done('Saved. Today onwards uses the new target.')
      setEditing(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your profile.')
    }
  }

  async function wipe() {
    await store.deleteAllData(userId)
    queryClient.resetQueries()
    setConfirmWipe(false)
    toast.done('Everything removed')
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <>
      {/* An identity block, the way a phone opens a settings screen. */}
      <header className="flex items-center gap-3.5 pb-5 pt-4">
        <span
          className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[1.5rem] font-semibold text-[var(--color-accent-ink)]"
          aria-hidden="true"
        >
          {(name || user?.email || 'M').slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.5rem] leading-tight">{name || 'Your profile'}</h1>
          <p className="truncate text-[0.88rem] text-[var(--color-ink-3)]">
            {user?.email ?? 'Stored on this device'}
          </p>
        </div>
        <Button size="sm" icon={<PencilIcon size={15} />} onClick={() => setEditing(true)}>
          Edit
        </Button>
      </header>

      {target && (
        <section className="card px-5 py-5">
          <p className="text-[0.78rem] font-medium uppercase tracking-[0.05em] text-[var(--color-ink-3)]">
            Daily target
          </p>
          <p className="tnum mt-1 text-[3rem] font-bold leading-none tracking-[-0.035em]">
            {kcal(target.calorie_target_kcal)}
            <span className="ml-2 text-[1rem] font-medium text-[var(--color-ink-3)]">kcal</span>
          </p>
          <p className="mt-1.5 text-[0.85rem] text-[var(--color-ink-2)]">
            In force since {friendlyDate(target.effective_on, today).toLowerCase()}
          </p>

          <dl className="hairline-t mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5 pt-4 text-[0.92rem]">
            {[
              ['Protein', `${Math.round(target.protein_target_g)} g`],
              ['Carbs', `${Math.round(target.carbs_target_g)} g`],
              ['Fat', `${Math.round(target.fat_target_g)} g`],
              ['Fibre', `${Math.round(target.fibre_target_g)} g`],
              ['At rest (BMR)', target.bmr_kcal ? `${kcal(target.bmr_kcal)} kcal` : 'You set it'],
              ['With activity', target.tdee_kcal ? `${kcal(target.tdee_kcal)} kcal` : '—'],
              ['BMI at the time', `${target.bmi.toFixed(1)} · ${bmiBand(target.bmi)}`, 'col-span-2'],
            ].map(([label, value, span]) => (
              <div key={label} className={span}>
                <dt className="text-[0.76rem] text-[var(--color-ink-3)]">{label}</dt>
                <dd className="tnum font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {profile && (
        <div className="mt-6">
          <ListGroup label="What it is calculated from">
            <ListRow title="Age" value={String(profile.age)} />
            <ListRow title="Height" value={formatHeight(profile.height_cm, unit)} />
            <ListRow title="Latest weight" value={latestWeight ? formatWeight(latestWeight, unit) : 'none yet'} />
            <ListRow
              title="Formula"
              value={profile.sex_for_bmr === 'unspecified' ? 'Your own target' : `Mifflin–St Jeor, ${profile.sex_for_bmr}`}
            />
            <ListRow title="Activity" value={ACTIVITY_LABELS[profile.activity_level].title} />
            <ListRow title="Goal" value={GOAL_LABELS[profile.goal].title} />
            <ListRow title="Timezone" value={profile.timezone} />
          </ListGroup>
        </div>
      )}

      {(targetsQuery.data?.length ?? 0) > 1 && (
        <div className="mt-6">
          <ListGroup
            label="Earlier targets"
            note="Each past day is measured against the target that applied then."
          >
            {targetsQuery.data!.slice(1).map((entry) => (
              <ListRow
                key={entry.id}
                title={`From ${friendlyDate(entry.effective_on, today)}`}
                value={`${kcal(entry.calorie_target_kcal)} kcal`}
              />
            ))}
          </ListGroup>
        </div>
      )}

      <section className="mt-6">
        <p className="group-label">Appearance</p>
        <div className="card p-3">
          <SegmentedControl<Theme>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
      </section>

      <div className="mt-6">
        <ListGroup
          label="Your data"
          note={
            store.kind === 'supabase'
              ? 'Photos sit in private storage only your account can read, and every record is restricted to your user id at the database level.'
              : 'Everything is stored in this browser only. Clearing site data removes it permanently.'
          }
        >
          <ListRow
            icon={<ShieldIcon size={17} />}
            iconTone="var(--color-tint)"
            title={store.kind === 'supabase' ? 'Synced to your account' : 'On this device only'}
            detail={store.kind === 'supabase' ? 'Private storage, row-level security' : 'No account connected'}
          />
          <ListRow
            icon={<LogOutIcon size={17} />}
            iconTone="var(--color-ink-3)"
            title="Sign out"
            onClick={async () => { await signOut(); navigate('/', { replace: true }) }}
          />
          <ListRow
            icon={<TrashIcon size={17} />}
            iconTone="var(--color-critical)"
            title="Delete everything"
            destructive
            onClick={() => setConfirmWipe(true)}
          />
        </ListGroup>
      </div>

      <p className="px-2 py-8 text-[0.75rem] leading-relaxed text-[var(--color-ink-3)]">
        My Cal produces estimates to help you track intake. It is not medical advice and does
        not diagnose or treat anything. If food, weight or exercise is causing you distress,
        talk to a clinician.
      </p>

      {/* ------------------------------ edit ------------------------------ */}

      <Sheet
        open={editing}
        onClose={() => { setEditing(false); setError(null) }}
        title="Edit your profile"
        description="Changing these creates a new target from today. Earlier days keep the one they had."
        footer={
          <Button variant="primary" size="lg" full loading={saveProfile.isPending || createTarget.isPending} onClick={save}>
            Save and recalculate
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="card flex flex-col gap-3.5 p-4">
            <TextField
              label="Name" value={form.display_name} data-autofocus
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <TextField
                label="Age" inputMode="numeric" suffix="years" value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
              />
              <TextField
                label="Height" inputMode="decimal" suffix="cm" value={form.height_cm}
                onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
              />
            </div>
          </div>

          <ChoiceField<SexForBmr>
            label="Formula"
            value={form.sex_for_bmr}
            onChange={(value) => setForm({ ...form, sex_for_bmr: value })}
            options={[
              { value: 'female', title: 'Female constant' },
              { value: 'male', title: 'Male constant' },
              { value: 'unspecified', title: 'I set my own target' },
            ]}
          />

          {form.sex_for_bmr === 'unspecified' && (
            <div className="card p-4">
              <TextField
                label="Your daily calorie target" inputMode="numeric" suffix="kcal"
                value={form.custom_calorie_target}
                onChange={(e) => setForm({ ...form, custom_calorie_target: e.target.value })}
              />
            </div>
          )}

          <ChoiceField<ActivityLevel>
            label="Activity"
            value={form.activity_level}
            onChange={(value) => setForm({ ...form, activity_level: value })}
            options={(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((key) => ({
              value: key, ...ACTIVITY_LABELS[key],
            }))}
          />

          <ChoiceField<Goal>
            label="Goal"
            value={form.goal}
            onChange={(value) => setForm({ ...form, goal: value })}
            options={(Object.keys(GOAL_LABELS) as Goal[]).map((key) => ({
              value: key, ...GOAL_LABELS[key],
            }))}
          />

          <div className="card flex flex-col gap-3.5 p-4">
            <SelectField
              label="Units" value={form.unit_preference}
              onChange={(e) => setForm({ ...form, unit_preference: e.target.value as UnitPreference })}
              hint="Display only — everything is stored in kilograms and centimetres."
            >
              <option value="metric">Kilograms and centimetres</option>
              <option value="imperial">Pounds and feet</option>
            </SelectField>

            <SelectField
              label="Timezone" value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              hint="Changing this does not move food you have already logged."
            >
              {supportedTimezones().map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </SelectField>

            <TextField
              label="Override the calorie target" inputMode="numeric" suffix="kcal"
              value={form.override_target}
              onChange={(e) => setForm({ ...form, override_target: e.target.value })}
              placeholder={String(preview.calorie_target_kcal || '')}
              hint="Leave blank to use the calculated figure."
            />
          </div>

          <div className="card px-4 py-4">
            <p className="text-[0.78rem] font-medium uppercase tracking-[0.05em] text-[var(--color-ink-3)]">
              New target would be
            </p>
            <p className="tnum mt-1 text-[1.9rem] font-bold leading-none tracking-[-0.03em]">
              {kcal(preview.calorie_target_kcal)}
              <span className="ml-1.5 text-[0.9rem] font-medium text-[var(--color-ink-3)]">kcal</span>
            </p>
            <p className="tnum mt-1.5 text-[0.85rem] text-[var(--color-ink-2)]">
              {Math.round(preview.macros.protein_g)} g protein ·{' '}
              {Math.round(preview.macros.carbs_g)} g carbs ·{' '}
              {Math.round(preview.macros.fat_g)} g fat
            </p>
          </div>

          {error && <Callout tone="problem">{error}</Callout>}
        </div>
      </Sheet>

      {/* ----------------------------- delete ----------------------------- */}

      <Sheet
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="Delete everything?"
        description="Your profile, targets, food entries, photos and weight history."
        footer={
          <div className="flex gap-2.5">
            <Button full size="lg" onClick={() => setConfirmWipe(false)} data-autofocus>Keep my data</Button>
            <Button full size="lg" variant="danger" onClick={wipe}>Delete it all</Button>
          </div>
        }
      >
        <p className="text-[0.9rem] leading-relaxed text-[var(--color-ink-2)]">
          This removes every food photo from storage and every record tied to your account.
          It cannot be undone, and you will be signed out afterwards.
        </p>
      </Sheet>
    </>
  )
}
