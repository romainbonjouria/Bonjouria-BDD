import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { isManager, isSuperAdmin, ROLE_LABEL } from "@/lib/roles";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const superAdmin = isSuperAdmin(user.role);
  const manager = isManager(user.role);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-soft/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <Link href="/search" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://bonjouria.fr/wp-content/uploads/2026/03/Bonjour-IA_logo_noir-et-rose.svg" alt="BONJOUR IA" className="h-10 w-auto" />
          </Link>
          <nav className="flex flex-wrap gap-5 text-sm font-medium text-slate-600">
            <Link href="/search" className="hover:text-brand">Recherche</Link>
            {superAdmin && (
              <>
                <Link href="/admin/import" className="hover:text-brand">Import CSV</Link>
                <Link href="/admin/people/new" className="hover:text-brand">Ajouter une personne</Link>
              </>
            )}
            {manager && <Link href="/admin/users" className="hover:text-brand">Utilisateurs</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/account" className="text-slate-600 hover:text-brand">
              {user.username}
              {manager && <span className="ml-1.5 rounded-full bg-soft px-2 py-0.5 text-xs font-semibold text-brand-dark">{ROLE_LABEL[user.role]}</span>}
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
