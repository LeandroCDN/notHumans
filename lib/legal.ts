import "server-only";

// Quién opera notHumans, para las páginas legales y el footer. Sale de variables de entorno (LEGAL_NAME,
// LEGAL_LOCATION, CONTACT_EMAIL) para cambiarlo sin tocar código (por ejemplo, cuando haya dominio y mail propio).

export type Operator = { name: string | null; location: string | null; email: string | null };

export function operator(): Operator {
  const v = (key: string) => process.env[key]?.trim() || null;
  return { name: v("LEGAL_NAME"), location: v("LEGAL_LOCATION"), email: v("CONTACT_EMAIL") };
}
