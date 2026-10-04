import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

/**
 * Durable record of every signed transaction, written (and awaited) before it is sent.
 * After a timeout or a restart the app checks the saved signature first and never
 * builds a new transfer while an earlier one is unresolved.
 */

export type OpKind = "create" | "deposit" | "withdraw";

/**
 * signed     — saved, maybe not sent yet
 * submitted  — the RPC accepted it
 * processed / confirmed — seen on chain, not final yet
 * finalized  — done
 * failed     — rejected before broadcast, or finalized with an error
 * unknown    — blockhash expired and no record found: may or may not have landed
 */
export type EntryStatus = "signed" | "submitted" | "processed" | "confirmed" | "finalized" | "failed" | "unknown";

export type JournalEntry = {
  id: string;
  op: OpKind;
  /** USDC sent to the API ("1.5" or "all") */
  amount: string;
  /** Amount shown in the app */
  amountUsd: number;
  owner: string;
  cluster: "devnet";
  planId: string;
  signature: string;
  /** base64 wire bytes, re-sent unchanged until the blockhash expires */
  signedTx: string;
  blockhash: string;
  lastValidBlockHeight: number;
  createdAt: number;
  updatedAt: number;
  status: EntryStatus;
  error?: string;
  /** The user checked an unknown result themselves and unblocked new transactions. */
  acknowledged?: boolean;
};

const KEY = "yai-devnet-journal-v1";
const KEEP = 50;

type State = { entries: JournalEntry[]; loaded: boolean };

export const useJournal = create<State>(() => ({ entries: [], loaded: false }));

let loading: Promise<void> | null = null;

export function loadJournal(): Promise<void> {
  if (useJournal.getState().loaded) return Promise.resolve();
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      const saved: JournalEntry[] = raw ? JSON.parse(raw) : [];
      // Keep anything written while loading.
      const current = useJournal.getState().entries;
      const merged = [...saved.filter((e) => !current.some((c) => c.id === e.id)), ...current];
      useJournal.setState({ entries: merged, loaded: true });
    })
    .catch(() => {
      useJournal.setState({ loaded: true });
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Writes through to storage; throws if storage fails, so the caller never sends an unsaved transaction. */
export async function putEntry(entry: JournalEntry): Promise<void> {
  const others = useJournal.getState().entries.filter((e) => e.id !== entry.id);
  const entries = [...others, entry].sort((a, b) => a.createdAt - b.createdAt).slice(-KEEP);
  useJournal.setState({ entries });
  await AsyncStorage.setItem(KEY, JSON.stringify(entries));
}

export function updateEntry(id: string, patch: Partial<JournalEntry>): Promise<JournalEntry | null> {
  const e = useJournal.getState().entries.find((x) => x.id === id);
  if (!e) return Promise.resolve(null);
  const next = { ...e, ...patch, updatedAt: Date.now() };
  return putEntry(next).then(() => next);
}

export function isResolved(e: JournalEntry) {
  return e.status === "finalized" || e.status === "failed" || !!e.acknowledged;
}

/** The newest transaction of this wallet that still needs checking, if any. */
export function openEntry(owner: string, entries = useJournal.getState().entries): JournalEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.owner === owner && !isResolved(e)) return e;
  }
  return null;
}

export function useOpenEntry(owner: string | undefined) {
  return useJournal((s) => (owner ? openEntry(owner, s.entries) : null));
}
