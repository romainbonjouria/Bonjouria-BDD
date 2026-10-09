import Link from "next/link";
import { findInvitation } from "@/lib/invitations";
import InviteForm from "./invite-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await findInvitation(token);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://bonjouria.fr/wp-content/uploads/2026/03/Bonjour-IA_logo_noir-et-rose.svg" alt="BONJOUR IA" className="mx-auto -mt-4 mb-2 h-32 w-auto" />
        {inv ? (
          <>
            <h1 className="mb-1 text-xl text-brand">Bienvenue !</h1>
            <p className="mb-6 font-serif text-sm text-slate-500">
              Vous êtes invité(e) à rejoindre l’annuaire pour <strong>{inv.group_name}</strong>. Choisissez votre mot de passe pour activer le compte <strong>{inv.email}</strong>.
            </p>
            <InviteForm token={token} />
          </>
        ) : (
          <>
            <h1 className="mb-1 text-xl text-brand">Invitation expirée</h1>
            <p className="mb-6 font-serif text-sm text-slate-500">
              Ce lien n’est plus valide (déjà utilisé ou expiré). Demandez une nouvelle invitation à la personne qui vous l’a envoyée.
            </p>
            <Link href="/login" className="btn-secondary w-full">Aller à la connexion</Link>
          </>
        )}
      </div>
    </main>
  );
}
