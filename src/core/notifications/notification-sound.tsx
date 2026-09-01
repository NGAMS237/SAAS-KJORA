"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, Volume2, VolumeX } from "lucide-react";

const PREFERENCE_KEY = "kjora.notification-sound.enabled.v1";
const IMPORTANT_TYPES = new Set(["payment_overdue", "due_notice_ready", "payment_receipt_ready", "rent_receipt_ready"]);

export function isImportantNotification(type: string) {
  return IMPORTANT_TYPES.has(type);
}

function readEnabled() {
  return typeof window !== "undefined" && window.localStorage.getItem(PREFERENCE_KEY) === "true";
}

function playQuietTone() {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.17);
  oscillator.addEventListener("ended", () => void context.close());
}

export function NotificationSoundEffect({ scope, notifications }: { scope: string; notifications: Array<{ id: string; type: string; readAt: string | null }> }) {
  const initialized = useRef(false);
  const previous = useRef(new Set<string>());
  useEffect(() => {
    const current = new Set(notifications.map((item) => item.id));
    if (initialized.current && readEnabled() && notifications.some((item) => !item.readAt && isImportantNotification(item.type) && !previous.current.has(item.id))) {
      playQuietTone();
    }
    initialized.current = true;
    previous.current = current;
  }, [notifications, scope]);
  return null;
}

export function NotificationSoundToggle({ language = "fr" }: { language?: "fr" | "en" }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEnabled(readEnabled()));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const label = language === "en" ? "In-app notification sound" : "Son des notifications dans Kjora";
  return <div className="notification-sound-setting">
    <span aria-hidden="true">{enabled ? <Volume2 size={19} /> : <VolumeX size={19} />}</span>
    <div><strong>{label}</strong><small>{language === "en" ? "Off by default. No push notifications are enabled." : "Désactivé par défaut. Aucune notification push n’est activée."}</small></div>
    <button
      aria-pressed={enabled}
      className="button button--secondary button--small"
      onClick={() => {
        const next = !enabled;
        window.localStorage.setItem(PREFERENCE_KEY, String(next));
        setEnabled(next);
        if (next) playQuietTone();
      }}
      type="button"
    ><BellRing size={16} />{enabled ? (language === "en" ? "On" : "Activé") : (language === "en" ? "Off" : "Désactivé")}</button>
  </div>;
}
