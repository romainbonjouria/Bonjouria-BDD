import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/search");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">BonjourIA — Annuaire</h1>
        <p className="mb-6 text-sm text-slate-500">Connectez-vous avec vos identifiants.</p>
        <LoginForm />
      </div>
    </main>
  );
}
