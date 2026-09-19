import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FoodEntry, IsoDate, NutritionTarget, Profile } from '@/types/domain'
import { store, type EntryPatch, type NewEntry, type NewTarget } from '@/services/db'

export const keys = {
  profile: (userId: string) => ['profile', userId] as const,
  targets: (userId: string) => ['targets', userId] as const,
  targetOn: (userId: string, date: IsoDate) => ['target', userId, date] as const,
  entries: (userId: string, date: IsoDate) => ['entries', userId, date] as const,
  entriesRange: (userId: string, from: IsoDate, to: IsoDate) => ['entries-range', userId, from, to] as const,
  weights: (userId: string) => ['weights', userId] as const,
}

export function useEntries(userId: string, date: IsoDate) {
  return useQuery({
    queryKey: keys.entries(userId, date),
    queryFn: () => store.listEntries(userId, date),
    staleTime: 15_000,
  })
}

export function useEntriesRange(userId: string, from: IsoDate, to: IsoDate, enabled = true) {
  return useQuery({
    queryKey: keys.entriesRange(userId, from, to),
    queryFn: () => store.listEntriesRange(userId, from, to),
    enabled,
    staleTime: 60_000,
  })
}

export function useTargetOn(userId: string, date: IsoDate) {
  return useQuery({
    queryKey: keys.targetOn(userId, date),
    queryFn: () => store.getTargetOn(userId, date),
    staleTime: 60_000,
  })
}

export function useTargets(userId: string) {
  return useQuery({
    queryKey: keys.targets(userId),
    queryFn: () => store.listTargets(userId),
    staleTime: 60_000,
  })
}

export function useWeights(userId: string) {
  return useQuery({
    queryKey: keys.weights(userId),
    queryFn: () => store.listWeights(userId),
    staleTime: 30_000,
  })
}

/** Anything that changes a day's food invalidates every view of that day. */
function invalidateDay(queryClient: ReturnType<typeof useQueryClient>, userId: string) {
  queryClient.invalidateQueries({ queryKey: ['entries', userId] })
  queryClient.invalidateQueries({ queryKey: ['entries-range', userId] })
}

export function useCreateEntry(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ entry, idempotencyKey }: { entry: NewEntry; idempotencyKey?: string }) =>
      store.createEntry(userId, entry, idempotencyKey),
    onSuccess: () => invalidateDay(queryClient, userId),
  })
}

export function useUpdateEntry(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EntryPatch }) => store.updateEntry(id, patch),
    onSuccess: () => invalidateDay(queryClient, userId),
  })
}

export function useDeleteEntry(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entry: FoodEntry) => store.deleteEntry(entry.id),
    onSuccess: () => invalidateDay(queryClient, userId),
  })
}

export function useSaveWeight(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ recordedOn, weightKg, note }: { recordedOn: IsoDate; weightKg: number; note: string | null }) =>
      store.saveWeight(userId, recordedOn, weightKg, note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.weights(userId) }),
  })
}

export function useDeleteWeight(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => store.deleteWeight(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.weights(userId) }),
  })
}

export function useSaveProfile(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (profile: Profile) => store.saveProfile(profile),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.profile(userId), saved)
      queryClient.invalidateQueries({ queryKey: ['target', userId] })
    },
  })
}

export function useCreateTarget(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (target: NewTarget): Promise<NutritionTarget> => store.createTarget(userId, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['target', userId] })
      queryClient.invalidateQueries({ queryKey: keys.targets(userId) })
    },
  })
}
