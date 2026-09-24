import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/search" className="font-semibold text-indigo-700">BonjourIA</Link>
          <nav className="flex flex-wrap gap-4 text-sm text-slate-600">
            <Link href="/search" className="hover:text-slate-900">Recherche</Link>
            {isAdmin && (
              <>
                <Link href="/admin/import" className="hover:text-slate-900">Import CSV</Link>
                <Link href="/admin/people/new" className="hover:text-slate-900">Ajouter une personne</Link>
                <Link href="/admin/users" className="hover:text-slate-900">Utilisateurs</Link>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/account" className="text-slate-600 hover:text-slate-900">
              {user.username}
              {isAdmin && <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">admin</span>}
            </Link>
            <form action={logout}>
              <button className="btn-secondary btn-sm">Déconnexion</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}
