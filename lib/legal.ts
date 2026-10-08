import "server-only";

// Quién opera notHumans, para las páginas legales y el footer. El nombre es fijo; la ciudad y el mail salen de
// LEGAL_LOCATION y CONTACT_EMAIL (el mail cambia cuando haya dominio propio).

export const LEGAL_NAME = "Leandro Ariel Labiano Ramo";

export type Operator = { name: string; location: string | null; email: string | null };

export function operator(): Operator {
  const v = (key: string) => process.env[key]?.trim() || null;
  return { name: LEGAL_NAME, location: v("LEGAL_LOCATION"), email: v("CONTACT_EMAIL") };
}
