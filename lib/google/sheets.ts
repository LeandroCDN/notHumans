import "server-only";
import { createSign } from "node:crypto";
import { MAX_COLS, MAX_ROWS, MAX_TABS, type RawSheet } from "@/lib/stock/types";

// El robot de notHumans en Google: una cuenta de servicio (GOOGLE_SERVICE_ACCOUNT_JSON, solo en Vercel) que lee
// las planillas que los clientes le comparten como Lector. Una sola clave para toda la plataforma; cada cliente
// decide desde Google qué le comparte. Sin librerías: firmamos el JWT con node:crypto y llamamos a la API REST.

const SCOPES =
  "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.metadata.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type Credentials = { client_email: string; private_key: string };

/** Lo que puede salir mal leyendo una planilla, con un código para mostrarle al dueño qué hacer. */
export class SheetError extends Error {
  constructor(
    public code:
      | "not_configured"
      | "api_disabled"
      | "not_shared"
      | "not_found"
      | "not_a_sheet"
      | "not_owner"
      | "google_error",
  ) {
    super(code);
  }
}

export function credentials(): Credentials | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<Credentials>;
    if (!c.client_email || !c.private_key) return null;
    // Si la clave se pegó con los saltos de línea escapados de más, se arreglan.
    return { client_email: c.client_email, private_key: c.private_key.replace(/\\n/g, "\n") };
  } catch {
    console.error("GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido");
    return null;
  }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** El JWT firmado (RS256) que se cambia por un token de acceso. */
export function signedJwt(c: Credentials, now = Math.floor(Date.now() / 1000)): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: c.client_email, scope: SCOPES, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  );
  const signature = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(c.private_key);
  return `${head}.${claims}.${b64url(signature)}`;
}

let cached: { token: string; until: number } | null = null;

async function accessToken(c: Credentials): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signedJwt(c) }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) {
    console.error("Google token:", res.status, data.error);
    throw new SheetError("google_error");
  }
  cached = { token: data.access_token, until: Date.now() + ((data.expires_in ?? 3600) - 120) * 1000 };
  return data.access_token;
}

async function get<T>(c: Credentials, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${await accessToken(c)}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return (await res.json()) as T;
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  const msg = body.error?.message ?? "";
  // 403: el robot no tiene acceso (no se la compartieron). 404: no existe. 400 "not supported": es un .xlsx subido sin convertir.
  // 403 también es "la API no está activada en el proyecto de Google Cloud": eso lo arregla el admin, no el cliente.
  if (res.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
    console.error("Google API desactivada:", msg);
    throw new SheetError("api_disabled");
  }
  if (res.status === 403) throw new SheetError("not_shared");
  if (res.status === 404) throw new SheetError("not_found");
  if (res.status === 400 && /not supported/i.test(msg)) throw new SheetError("not_a_sheet");
  console.error("Google API:", res.status, msg);
  throw new SheetError("google_error");
}

const quote = (name: string) => `'${name.replace(/'/g, "''")}'`;
const lastCol = (n: number) =>
  n <= 26
    ? String.fromCharCode(64 + n)
    : String.fromCharCode(64 + Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26));

/** La planilla entera (pestañas visibles), con los valores como se ven en pantalla. */
export async function readSpreadsheet(c: Credentials, id: string): Promise<RawSheet> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;
  const meta = await get<{
    properties: { title: string };
    sheets?: { properties: { title: string; hidden?: boolean; sheetType?: string } }[];
  }>(c, `${base}?fields=properties.title,sheets.properties.title,sheets.properties.hidden,sheets.properties.sheetType`);
  // Las pestañas ocultas no se leen: si el dueño las escondió, no son para el cliente.
  const names = (meta.sheets ?? [])
    .map((s) => s.properties)
    .filter((p) => !p.hidden && (p.sheetType ?? "GRID") === "GRID")
    .map((p) => p.title)
    .slice(0, MAX_TABS);
  if (!names.length) return { title: meta.properties.title, tabs: [] };
  const params = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE", majorDimension: "ROWS" });
  for (const n of names) params.append("ranges", `${quote(n)}!A1:${lastCol(MAX_COLS)}${MAX_ROWS}`);
  const values = await get<{ valueRanges?: { values?: unknown[][] }[] }>(c, `${base}/values:batchGet?${params}`);
  return {
    title: meta.properties.title,
    tabs: names.map((name, i) => ({
      name,
      rows: (values.valueRanges?.[i]?.values ?? []).map((row) => row.map((v) => (v == null ? "" : String(v)))),
    })),
  };
}

/** Los mails de los dueños del archivo (vacío en unidades compartidas). */
export async function fileOwners(c: Credentials, id: string): Promise<string[]> {
  const data = await get<{ owners?: { emailAddress?: string }[] }>(
    c,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=owners(emailAddress)&supportsAllDrives=true`,
  );
  return (data.owners ?? []).flatMap((o) => (o.emailAddress ? [o.emailAddress.toLowerCase()] : []));
}
