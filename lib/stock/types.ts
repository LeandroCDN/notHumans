import { z } from "zod";

// El stock de un puesto: una planilla de Google del cliente, con la forma que tenga. No hay plantilla: la IA
// propone un "mapa" (qué pestañas usar, en qué fila están los títulos y qué es cada columna), el dueño lo revisa
// y con ese mapa armamos una copia solo con lo visible. Compartido entre el server y el navegador.

/** catalog = productos (uno por fila) · info = datos útiles (pagos, promos, horarios) · ignore = no se usa. */
export const TAB_USES = ["catalog", "info", "ignore"] as const;
export type TabUse = (typeof TAB_USES)[number];

/** private = nunca sale del server (costo, proveedor, notas internas…). */
export const COLUMN_ROLES = ["name", "id", "price", "stock", "detail", "private"] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];

export type StockColumn = { index: number; header: string; role: ColumnRole };
/** `headerRow` es el número de fila (desde 1) donde están los títulos de las columnas. */
export type StockTab = { name: string; use: TabUse; headerRow: number; columns: StockColumn[] };
export type StockMap = { tabs: StockTab[] };

/** La planilla tal cual la devuelve Google (valores como se ven en pantalla). */
export type RawTab = { name: string; rows: string[][] };
export type RawSheet = { title: string; tabs: RawTab[] };

/** Lo que guardamos y lee el notHuman: solo pestañas usadas y columnas visibles. */
export type SnapshotTab = {
  name: string;
  use: "catalog" | "info";
  headers: string[];
  roles: ColumnRole[];
  rows: string[][];
};
export type StockSnapshot = { tabs: SnapshotTab[] };

export type StockStatus = "ok" | "needs_review" | "error";

export type StockSource = {
  jobId: string;
  spreadsheetId: string;
  title: string;
  map: StockMap;
  snapshot: StockSnapshot;
  status: StockStatus;
  /** Código del último error al sincronizar (not_shared, not_found…), si lo hubo. */
  error: string | null;
  syncedAt: number | null;
};

/** Lo que devuelve "inspeccionar": la planilla (recortada) y el mapa propuesto, para revisarlo antes de guardar. */
export type StockInspection = { spreadsheetId: string; title: string; tabs: RawTab[]; map: StockMap };

export const MAX_TABS = 15;
export const MAX_ROWS = 1000;
export const MAX_COLS = 52;

// Lo que llega del navegador (o del modelo) pasa por acá: lo raro cae a un valor conservador.
export const StockColumnSchema = z.object({
  index: z
    .number()
    .int()
    .min(0)
    .max(MAX_COLS - 1),
  header: z.string().max(200).catch("").default(""),
  role: z.enum(COLUMN_ROLES).catch("private"),
});
export const StockTabSchema = z.object({
  name: z.string().max(200),
  use: z.enum(TAB_USES).catch("ignore"),
  headerRow: z.number().int().min(1).max(MAX_ROWS).catch(1),
  columns: z.array(StockColumnSchema).max(MAX_COLS).catch([]),
});
export const StockMapSchema = z.object({ tabs: z.array(StockTabSchema).max(MAX_TABS).catch([]) });
