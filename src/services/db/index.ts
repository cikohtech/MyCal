import { isSupabaseConfigured } from '@/lib/supabase'
import type { DataStore } from '@/services/db/types'
import { LocalStore } from '@/services/db/local'
import { SupabaseStore } from '@/services/db/supabase'

/** One instance for the app's lifetime; chosen by what's configured. */
export const store: DataStore = isSupabaseConfigured ? new SupabaseStore() : new LocalStore()

export type { DataStore, AppUser, NewEntry, EntryPatch, NewTarget } from '@/services/db/types'
