// Rôles de l'application (partagés client / serveur).
//  - super_admin : gère tout (groupes, admins, utilisateurs, visibilité des emails, données)
//  - admin       : responsable d'un groupe (société) : invite des utilisateurs dans son groupe et suit leur usage
//  - user        : recherche et export
import type { Role } from "./session";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  user: "Utilisateur",
};

export const isSuperAdmin = (role: Role) => role === "super_admin";
/** Peut accéder à la gestion des utilisateurs (son périmètre dépend du rôle). */
export const isManager = (role: Role) => role === "super_admin" || role === "admin";
