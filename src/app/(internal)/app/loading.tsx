import { Card, SkeletonBlock } from "@/core/ui/ui";

export default function Loading() {
  return (
    <div className="page-stack" aria-label="Chargement de la page">
      <SkeletonBlock />
      <div className="kpi-grid">
        <Card><SkeletonBlock /></Card>
        <Card><SkeletonBlock /></Card>
        <Card><SkeletonBlock /></Card>
      </div>
    </div>
  );
}
