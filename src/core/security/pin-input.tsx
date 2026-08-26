"use client";

import { useRef } from "react";
import { normalizePin, PIN_LENGTH } from "@/core/security/pin-lock";

export function PinInput({
  autoFocus = false,
  disabled = false,
  id,
  label,
  onChange,
  value,
}: {
  autoFocus?: boolean;
  disabled?: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="pin-field">
      <label htmlFor={id}>{label}</label>
      <div className="pin-input" onClick={() => inputRef.current?.focus()}>
        <input
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          id={id}
          inputMode="numeric"
          maxLength={PIN_LENGTH}
          onChange={(event) => onChange(normalizePin(event.target.value))}
          pattern="[0-9]{6}"
          ref={inputRef}
          required
          type="password"
          value={value}
        />
        <div aria-hidden="true" className="pin-slots">
          {Array.from({ length: PIN_LENGTH }, (_, index) => (
            <span className={value.length === index ? "pin-slot pin-slot--current" : "pin-slot"} key={index}>
              {value[index] ? "•" : ""}
            </span>
          ))}
        </div>
      </div>
      <small className="pin-field__hint" id={`${id}-hint`}>6 chiffres</small>
    </div>
  );
}
