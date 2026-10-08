import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/search");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://bonjouria.fr/wp-content/uploads/2026/03/Bonjour-IA_logo-baseline_noir-et-rose.svg" alt="BONJOUR IA" className="mx-auto mb-8 h-14 w-auto" />
        <h1 className="mb-1 text-xl text-brand">Annuaire</h1>
        <p className="mb-6 font-serif text-sm text-slate-500">Connectez-vous avec vos identifiants.</p>
        <LoginForm />
      </div>
    </main>
  );
}
