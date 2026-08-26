"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { createPinVerifierRecord, isUnlockFresh, PIN_INACTIVITY_MS, sanitizeInternalAppPath } from "@/core/security/pin-lock";
import {
  clearLocalPinSecurity,
  clearPinUnlockState,
  isPinReauthenticationRequired,
  markPinUnlocked,
  readPinRecord,
  readPinUnlockState,
  writePinRecord,
} from "@/core/security/pin-storage";

type PinLockContextValue = {
  checking: boolean;
  hasPin: boolean;
  configurePin: (pin: string) => Promise<void>;
  removePin: () => Promise<void>;
  lockNow: () => void;
};

const PinLockContext = createContext<PinLockContextValue | null>(null);

function lockUrl(pathname: string) {
  const next = sanitizeInternalAppPath(pathname);
  return `/verrouillage?next=${encodeURIComponent(next)}`;
}

export function PinLockProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const lastActivityAt = useRef(0);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lockNow = useCallback(() => {
    clearPinUnlockState();
    setUnlocked(false);
    router.replace(lockUrl(pathname));
  }, [pathname, router]);

  const scheduleLock = useCallback((activityAt: number) => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    const delay = Math.max(0, PIN_INACTIVITY_MS - (Date.now() - activityAt));
    inactivityTimer.current = setTimeout(lockNow, delay);
  }, [lockNow]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        if (isPinReauthenticationRequired(userId)) {
          setHasPin(true);
          setChecking(false);
          router.replace(lockUrl(pathname));
          return;
        }
        const record = await readPinRecord(userId);
        if (!active) return;
        setHasPin(Boolean(record));
        if (!record) {
          clearPinUnlockState();
          setUnlocked(true);
          setChecking(false);
          return;
        }
        const unlockState = readPinUnlockState(userId);
        if (!unlockState || !isUnlockFresh(unlockState.lastActivityAt)) {
          clearPinUnlockState();
          setChecking(false);
          router.replace(lockUrl(pathname));
          return;
        }
        lastActivityAt.current = unlockState.lastActivityAt;
        setUnlocked(true);
        setChecking(false);
        scheduleLock(unlockState.lastActivityAt);
      } catch {
        clearPinUnlockState();
        if (active) {
          setHasPin(false);
          setUnlocked(true);
          setChecking(false);
        }
      }
    }
    void initialize();
    return () => {
      active = false;
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [pathname, router, scheduleLock, userId]);

  useEffect(() => {
    if (!hasPin || !unlocked || checking) return;

    function registerActivity() {
      const now = Date.now();
      if (now - lastActivityAt.current < 1000) return;
      lastActivityAt.current = now;
      markPinUnlocked(userId, now);
      scheduleLock(now);
    }

    function checkVisibility() {
      if (document.visibilityState !== "visible") return;
      if (!isUnlockFresh(lastActivityAt.current)) lockNow();
      else registerActivity();
    }

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, registerActivity, { passive: true }));
    document.addEventListener("visibilitychange", checkVisibility);
    window.addEventListener("focus", checkVisibility);
    scheduleLock(lastActivityAt.current);
    return () => {
      events.forEach((event) => window.removeEventListener(event, registerActivity));
      document.removeEventListener("visibilitychange", checkVisibility);
      window.removeEventListener("focus", checkVisibility);
    };
  }, [checking, hasPin, lockNow, scheduleLock, unlocked, userId]);

  const configurePin = useCallback(async (pin: string) => {
    const record = await createPinVerifierRecord(pin);
    await writePinRecord(userId, record);
    const now = Date.now();
    lastActivityAt.current = now;
    markPinUnlocked(userId, now);
    setHasPin(true);
    setUnlocked(true);
    scheduleLock(now);
  }, [scheduleLock, userId]);

  const removePin = useCallback(async () => {
    await clearLocalPinSecurity(userId);
    setHasPin(false);
    setUnlocked(true);
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
  }, [userId]);

  const value = useMemo<PinLockContextValue>(() => ({
    checking,
    configurePin,
    hasPin,
    lockNow,
    removePin,
  }), [checking, configurePin, hasPin, lockNow, removePin]);

  if (checking || (hasPin && !unlocked)) {
    return (
      <main className="pin-gate" aria-busy="true" aria-live="polite">
        <span className="wordmark wordmark--auth">Kjora<span>.</span></span>
        <p>Vérification du verrou local…</p>
      </main>
    );
  }

  return <PinLockContext.Provider value={value}>{children}</PinLockContext.Provider>;
}

export function usePinLock() {
  const context = useContext(PinLockContext);
  if (!context) throw new Error("PIN_LOCK_CONTEXT_MISSING");
  return context;
}
