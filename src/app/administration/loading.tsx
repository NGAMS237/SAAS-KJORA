export default function AdministrationLoading() {
  return <div className="admin-page" aria-busy="true" aria-live="polite">
    <header className="admin-page__header"><div className="loading-mark" aria-hidden="true"/><h1>Administration</h1></header>
    <section className="admin-section"><p>Chargement des données agrégées… / Loading aggregate data…</p></section>
  </div>;
}
