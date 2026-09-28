"use client";

// =============================================================================
// NCE-01 — État lu/non lu optimiste partagé (cloche bureau, cloche mobile,
// centre de notifications). Une ouverture ou un « marquer comme lu » met à
// jour le badge IMMÉDIATEMENT, avant même le retour serveur ; le
// router.refresh() qui suit réaligne sur la base. Aucune donnée persistée
// dans le navigateur : les surcharges vivent en mémoire, pour la page.
// =============================================================================

import { useMemo, useSyncExternalStore } from "react";
import { applyReadOverrides, type ReadableNotification } from "@/modules/notifications/model";

let overrides: ReadonlyMap<string, boolean> = new Map();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setLocalReadState(ids: readonly string[], isRead: boolean) {
  const next = new Map(overrides);
  for (const id of ids) next.set(id, isRead);
  overrides = next;
  emit();
}

export function clearLocalReadState(ids: readonly string[]) {
  const next = new Map(overrides);
  for (const id of ids) next.delete(id);
  overrides = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const EMPTY: ReadonlyMap<string, boolean> = new Map();

export function useNotificationsWithLocalReadState<T extends ReadableNotification>(notifications: readonly T[]): T[] {
  const current = useSyncExternalStore(subscribe, () => overrides, () => EMPTY);
  return useMemo(() => applyReadOverrides(notifications, current, new Date().toISOString()), [notifications, current]);
}
