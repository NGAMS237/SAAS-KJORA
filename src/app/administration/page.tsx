import {
  getInterventionCounters,
  getMonitoringIndicators,
  getPlatformCounters,
} from "@/modules/platform-admin/server";
import { OverviewView } from "@/modules/platform-admin/views";

export const dynamic = "force-dynamic";

/**
 * Vue d'ensemble de la console.
 *
 * Les RPC vérifient elles-mêmes l'autorisation plateforme : si la garde de
 * layout était contournée, ces lectures échoueraient avec un refus explicite.
 */
export default async function AdministrationOverviewPage() {
  const [counters, indicators, interventionCounters] = await Promise.all([
    getPlatformCounters(),
    getMonitoringIndicators(),
    getInterventionCounters(),
  ]);

  return (
    <OverviewView
      counters={counters.ok ? counters.data : null}
      indicators={indicators}
      error={counters.ok ? null : counters.reason}
      interventionCounters={interventionCounters.ok ? interventionCounters.data : null}
    />
  );
}
