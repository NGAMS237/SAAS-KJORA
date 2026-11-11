import { redirect } from "next/navigation";

// Adresse courte et partageable des offres : renvoie vers la section « Offres » de l'accueil.
export default function TarifsPage() {
  redirect("/#offres");
}
