// « Exemple – prochaine période » : quand l'avis sera préparé, la période et la date à payer (logique PURE).
function iso(date: Date) { return date.toISOString().slice(0, 10); }

export function nextPeriodPreview(input: { nextPeriodStart: string; dueDay: number; generateDueDaysBefore: number; totalXaf: number }) {
  const [y, m] = input.nextPeriodStart.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const due = new Date(Date.UTC(y, m - 1, Math.min(Math.max(input.dueDay, 1), end.getUTCDate())));
  const notice = new Date(due.getTime() - input.generateDueDaysBefore * 86_400_000);
  return { periodStart: iso(start), periodEnd: iso(end), dueDate: iso(due), noticeDate: iso(notice), totalXaf: input.totalXaf };
}

export function isoDaysFromNow(days: number, now: Date = new Date()) {
  return iso(new Date(now.getTime() + days * 86_400_000));
}
