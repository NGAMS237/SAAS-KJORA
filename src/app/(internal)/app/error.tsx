"use client";

import { ErrorNotice } from "@/core/ui/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page-stack">
      <ErrorNotice />
      <button className="button button--primary" type="button" onClick={reset}>Réessayer</button>
    </div>
  );
}
