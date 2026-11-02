// Première date possible : le lendemain de la fin de la dernière échéance déjà émise
// (la base refuse un changement qui toucherait une période déjà générée), et jamais avant demain.
export function earliestRentChangeDate(dues: Array<{ periodEnd: string; status: string; kind?: string }>, today = new Date()): string {
  const tomorrow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
  let earliest = tomorrow.getTime();
  for (const due of dues) {
    if (due.kind === "deposit" || due.kind === "adjustment") continue;
    const [y, m, d] = due.periodEnd.split("-").map(Number);
    const next = Date.UTC(y, m - 1, d + 1);
    if (next > earliest) earliest = next;
  }
  return new Date(earliest).toISOString().slice(0, 10);
}
