import {
  type ColumnRole,
  MAX_COLS,
  type RawSheet,
  type RawTab,
  type SnapshotTab,
  type StockColumn,
  type StockMap,
  type StockSnapshot,
  type StockTab,
  type TabUse,
} from "./types";

// Funciones puras del stock: leer el link, proponer un mapa sin IA (respaldo y mock), ajustar el mapa a la
// planilla real, armar la copia visible y el texto que lee el notHuman. Sin nada server-only: el editor del
// puesto usa las mismas para mostrar "así lo ve tu notHuman" mientras el dueño revisa.

/** El id de la planilla, desde el link que pega el dueño (o el id solo). */
export function sheetIdFromUrl(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}

/** Para comparar textos: sin mayúsculas, acentos ni signos. */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const filled = (row: string[] | undefined) => (row ?? []).filter((c) => c.trim() !== "").length;

// Ante la duda, privado: estas palabras en un título o en el nombre de la pestaña lo esconden.
const PRIVATE =
  /\b(costo|costos|cost|proveedor|proveedores|supplier|margen|margin|ganancia|profit|pagamos|compramos|interno|interna|internal|privado|privada|private|sueldo|sueldos|salary|comision|dni|cuit|cuil)\b/;
const ROLE_RULES: [ColumnRole, RegExp][] = [
  ["id", /^(sku|cod|codigo|code|id|ref|referencia)\b/],
  ["price", /\b(precio|precios|price|valor|importe|cuota|cuotas|contado|ars|usd|lista)\b/],
  ["stock", /\b(stock|unidades|cantidad|disponible|disponibilidad|hay|quedan|qty|quantity|existencia|available)\b/],
  ["name", /\b(modelo|moto|producto|nombre|articulo|descripcion|item|product|name|model|servicio)\b/],
];

/** Qué es una columna según su título (sin IA). */
export function guessRole(header: string): ColumnRole {
  const h = norm(header);
  if (PRIVATE.test(h)) return "private";
  for (const [role, re] of ROLE_RULES) if (re.test(h)) return role;
  return "detail";
}

/** La fila de los títulos: la primera (de las 15 de arriba) con 2+ celdas llenas seguida de otra con datos. */
function guessHeaderRow(tab: RawTab): number | null {
  for (let i = 0; i < Math.min(15, tab.rows.length); i++) {
    if (filled(tab.rows[i]) >= 2 && filled(tab.rows[i + 1]) >= 1) return i + 1;
  }
  return null;
}

function guessUse(tab: RawTab, columns: StockColumn[]): TabUse {
  if (PRIVATE.test(norm(tab.name))) return "ignore";
  if (columns.some((c) => c.role === "price" || c.role === "stock")) return "catalog";
  return columns.length ? "info" : "ignore";
}

/** Las columnas de una pestaña según la fila de títulos, tomando el rol de `prev` si ya lo tenía (por título). */
export function columnsAt(
  tab: RawTab,
  headerRow: number,
  prev: StockColumn[] = [],
  fallback: (h: string) => ColumnRole = () => "private",
): StockColumn[] {
  const header = tab.rows[headerRow - 1] ?? [];
  const cols: StockColumn[] = [];
  header.slice(0, MAX_COLS).forEach((cell, index) => {
    const h = cell.trim();
    if (!h) return;
    const known =
      prev.find((c) => c.index === index && norm(c.header) === norm(h)) ?? prev.find((c) => norm(c.header) === norm(h));
    const byIndex = prev.find((c) => c.index === index && !c.header);
    cols.push({ index, header: h, role: known?.role ?? byIndex?.role ?? fallback(h) });
  });
  return cols;
}

/** Un mapa sin IA, por los títulos. Lo usa el mock y es el respaldo si el modelo falla. */
export function heuristicMap(raw: RawSheet): StockMap {
  return {
    tabs: raw.tabs.map((tab) => {
      const headerRow = guessHeaderRow(tab);
      if (!headerRow) return { name: tab.name, use: "ignore" as const, headerRow: 1, columns: [] };
      const columns = columnsAt(tab, headerRow, [], guessRole);
      return { name: tab.name, use: guessUse(tab, columns), headerRow, columns };
    }),
  };
}

/**
 * Ajusta un mapa (el que propuso la IA, o uno guardado) a la planilla real: una entrada por pestaña, fila de
 * títulos dentro de rango y columnas con su título verdadero. Lo que el mapa no menciona queda privado / sin usar.
 */
export function normalizeMap(raw: RawSheet, proposal: StockMap): StockMap {
  return {
    tabs: raw.tabs.map((tab): StockTab => {
      const p =
        proposal.tabs.find((t) => t.name === tab.name) ?? proposal.tabs.find((t) => norm(t.name) === norm(tab.name));
      if (!p) return { name: tab.name, use: "ignore", headerRow: guessHeaderRow(tab) ?? 1, columns: [] };
      const headerRow = Math.min(Math.max(1, p.headerRow), Math.max(1, tab.rows.length));
      const columns = columnsAt(tab, headerRow, p.columns);
      return { name: tab.name, use: columns.length ? p.use : "ignore", headerRow, columns };
    }),
  };
}

/**
 * Aplica el mapa a la planilla: la copia que se guarda (solo pestañas usadas y columnas visibles).
 * Si la planilla cambió (pestaña que no está, columna que desapareció o una nueva), `needsReview`: las columnas
 * nuevas no se usan hasta que el dueño las revise.
 */
export function applyMap(raw: RawSheet, map: StockMap): { snapshot: StockSnapshot; needsReview: boolean } {
  let needsReview = false;
  const tabs: SnapshotTab[] = [];
  for (const t of map.tabs) {
    if (t.use === "ignore") continue;
    const tab = raw.tabs.find((x) => x.name === t.name);
    if (!tab) {
      needsReview = true;
      continue;
    }
    const header = tab.rows[t.headerRow - 1] ?? [];
    // Cada columna del mapa, donde esté hoy (se busca por título: si la movieron, se la encuentra igual).
    const located = t.columns.map((c) => {
      if (norm(header[c.index] ?? "") === norm(c.header)) return { ...c, at: c.index };
      const at = header.findIndex((h) => norm(h) === norm(c.header));
      if (at < 0) needsReview = true;
      return { ...c, at };
    });
    const known = new Set(located.map((c) => c.at));
    if (header.some((h, i) => h.trim() && i < MAX_COLS && !known.has(i))) needsReview = true;
    const visible = located.filter((c) => c.at >= 0 && c.role !== "private");
    if (!visible.length) continue;
    const rows: string[][] = [];
    for (const row of tab.rows.slice(t.headerRow)) {
      const cells = visible.map((c) => (row[c.at] ?? "").trim());
      if (cells.every((c) => !c)) continue;
      // Una fila que repite los títulos (tablas pegadas una abajo de otra) no es un producto.
      if (cells.every((c, i) => norm(c) === norm(visible[i].header))) continue;
      rows.push(cells);
    }
    tabs.push({
      name: t.name,
      use: t.use,
      headers: visible.map((c) => c.header),
      roles: visible.map((c) => c.role),
      rows,
    });
  }
  return { snapshot: { tabs }, needsReview };
}

/** Cuántos productos tiene la copia (filas de catálogo). */
export function catalogCount(s: StockSnapshot): number {
  return s.tabs.filter((t) => t.use === "catalog").reduce((n, t) => n + t.rows.length, 0);
}

/** "Marca: Honda · Modelo: Wave 110 S · Precio: $ 2.650.000" (sin las celdas vacías). */
export function rowLine(tab: Pick<SnapshotTab, "headers">, row: string[]): string {
  return tab.headers
    .map((h, i) => (row[i] ? `${h}: ${row[i]}` : ""))
    .filter(Boolean)
    .join(" · ");
}

/** Para la IA que arma el mapa: las primeras filas de cada pestaña, celda por celda con su número de columna. */
export function previewText(raw: RawSheet, rows = 15): string {
  return raw.tabs
    .map((tab) => {
      const lines = tab.rows.slice(0, rows).map((row, i) => {
        const cells: Record<string, string> = {};
        row.slice(0, MAX_COLS).forEach((c, j) => {
          if (c.trim()) cells[j] = c.trim().slice(0, 40);
        });
        return `Row ${i + 1}: ${JSON.stringify(cells)}`;
      });
      return `=== Tab ${JSON.stringify(tab.name)} (${tab.rows.length} rows) ===\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

// --- Lo que lee el notHuman -----------------------------------------------------------------------------

/** Hasta este tamaño la copia va entera en el prompt fijo (se sirve de caché); más grande, se buscan filas. */
export const FULL_STOCK_CHARS = 14_000;
const INFO_CHARS = 4000;
const MATCHED_ROWS = 25;
const NAMES_ROWS = 60;

const STOP = new Set(
  "hola buenas buen dia tardes noches que cuanto cuanta sale salen cuesta tenes tienen tiene hay precio precios stock la el los las lo de del una uno un en y o con para por me mi te tu es son esta estan algo quiero queria busco seria como cual cuales donde the a an is are do you have how much price any want for of".split(
    " ",
  ),
);

/** Las palabras que importan de lo que pregunta el cliente (sin saludos ni relleno). */
export function queryTokens(text: string): string[] {
  return [
    ...new Set(
      norm(text)
        .split(" ")
        .filter((w) => (w.length >= 2 || /\d/.test(w)) && !STOP.has(w)),
    ),
  ];
}

function score(tokens: string[], line: string): number {
  const words = norm(line).split(" ");
  return tokens.filter((q) =>
    words.some((w) => w === q || (q.length >= 3 && (w.startsWith(q) || (w.length >= 3 && q.startsWith(w))))),
  ).length;
}

function renderTab(tab: SnapshotTab, rows: string[][]): string {
  return [`### ${tab.name}`, ...rows.map((r) => `- ${rowLine(tab, r)}`)].join("\n");
}

const T = {
  es: {
    title: "## Stock (la planilla del negocio, al día)",
    matched: "[Filas del stock que coinciden con lo que pregunta el cliente:",
    names: "[No hay filas que coincidan exacto. Estos son los productos de la lista:",
    end: "]",
    large: "El catálogo es largo: con cada mensaje del cliente te llegan las filas que coinciden, entre corchetes.",
  },
  en: {
    title: "## Stock (the business's spreadsheet, up to date)",
    matched: "[Stock rows that match what the customer asks:",
    names: "[No row matches exactly. These are the products on the list:",
    end: "]",
    large: "The catalog is long: with each customer message you get the matching rows, in brackets.",
  },
};

/**
 * El stock para el prompt. Si entra, va entero en la parte fija (`fixed`, cacheable). Si es grande, la parte fija
 * lleva solo la info y las filas que coinciden con lo que pregunta el cliente van pegadas a su mensaje (`note`).
 */
export function stockPrompt(s: StockSnapshot, query: string, lang: "es" | "en"): { fixed: string; note: string } {
  const t = T[lang];
  const tabs = s.tabs.filter((x) => x.rows.length);
  if (!tabs.length) return { fixed: "", note: "" };
  const full = tabs.map((x) => renderTab(x, x.rows)).join("\n\n");
  if (full.length <= FULL_STOCK_CHARS) return { fixed: `${t.title}\n${full}`, note: "" };

  const info = tabs
    .filter((x) => x.use === "info")
    .map((x) => renderTab(x, x.rows))
    .join("\n\n")
    .slice(0, INFO_CHARS);
  const catalog = tabs.filter((x) => x.use === "catalog");
  const tokens = queryTokens(query);
  const scored = catalog
    .flatMap((tab) => tab.rows.map((row) => ({ tab, row, score: score(tokens, rowLine(tab, row)) })))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MATCHED_ROWS);
  let note: string;
  if (scored.length) {
    note = [t.matched, ...scored.map((x) => `- ${x.tab.name}: ${rowLine(x.tab, x.row)}`), t.end].join("\n");
  } else {
    // Sin coincidencias ("¿qué tenés?"): la lista de nombres, para que pueda ofrecer algo sin inventar.
    const names = catalog.flatMap((tab) => {
      const keep = tab.roles.map((r, i) => (r === "name" || r === "id" ? i : -1)).filter((i) => i >= 0);
      return tab.rows.map((row) =>
        keep.length
          ? keep
              .map((i) => row[i])
              .filter(Boolean)
              .join(" ")
          : row.slice(0, 2).join(" "),
      );
    });
    note = [t.names, names.slice(0, NAMES_ROWS).join(" · "), t.end].join("\n");
  }
  return { fixed: [t.title, t.large, info].filter(Boolean).join("\n"), note };
}
