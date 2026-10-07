import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MESSY, TIDY } from "./fixtures";
import {
  FULL_STOCK_CHARS,
  applyMap,
  catalogCount,
  heuristicMap,
  normalizeMap,
  previewText,
  sheetIdFromUrl,
  stockPrompt,
} from "./map";
import type { RawSheet, StockSnapshot } from "./types";

vi.mock("server-only", () => ({}));

const tab = (map: ReturnType<typeof heuristicMap>, name: string) => map.tabs.find((t) => t.name === name)!;
const roles = (map: ReturnType<typeof heuristicMap>, name: string) =>
  Object.fromEntries(tab(map, name).columns.map((c) => [c.header, c.role]));

describe("el link de la planilla", () => {
  it("saca el id del link o acepta el id solo", () => {
    const id = "1nX_6rVq1efwfYesmac6MnBUjbG3uBVNxHp2in7TYTgc";
    expect(sheetIdFromUrl(`https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing`)).toBe(id);
    expect(sheetIdFromUrl(` ${id} `)).toBe(id);
    expect(sheetIdFromUrl("https://example.com/hola")).toBeNull();
  });
});

describe("el mapa sin IA (por los títulos)", () => {
  it("planilla prolija: catálogo, info, y lo interno afuera", () => {
    const map = heuristicMap(TIDY);
    expect(tab(map, "Stock")).toMatchObject({ use: "catalog", headerRow: 1 });
    expect(roles(map, "Stock")).toMatchObject({
      SKU: "id",
      Modelo: "name",
      "Precio contado (ARS)": "price",
      Unidades: "stock",
      Marca: "detail",
    });
    expect(tab(map, "Promos y pagos").use).toBe("info");
    expect(tab(map, "Interno (privado)").use).toBe("ignore");
    expect(tab(map, "Cómo usar").use).toBe("ignore");
  });

  it("planilla desordenada: títulos en la fila 3, lo que se pagó es privado y los sueldos no se usan", () => {
    const map = heuristicMap(MESSY);
    expect(tab(map, "Hoja 1")).toMatchObject({ use: "catalog", headerRow: 3 });
    expect(roles(map, "Hoja 1")).toMatchObject({
      moto: "name",
      "$$ contado": "price",
      "cuantas quedan": "stock",
      "lo que pagamos": "private",
    });
    expect(tab(map, "Sueldos").use).toBe("ignore");
  });
});

describe("la copia que lee el notHuman", () => {
  it("las columnas privadas y las pestañas sin usar no se guardan nunca", () => {
    const { snapshot, needsReview } = applyMap(MESSY, heuristicMap(MESSY));
    expect(needsReview).toBe(false);
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain("2100000");
    expect(json).not.toContain("lo que pagamos");
    expect(json).not.toContain("Sueldo");
    // Saltea filas vacías y la fila que repite los títulos.
    expect(snapshot.tabs[0].rows.map((r) => r[0])).toEqual(["wave 110", "titan 150", "smash 110"]);
    const tidy = applyMap(TIDY, heuristicMap(TIDY)).snapshot;
    expect(catalogCount(tidy)).toBe(10);
    expect(JSON.stringify(tidy)).not.toContain("Honda Motor de Argentina");
  });

  it("si cambian las columnas, pide revisar y no usa las nuevas", () => {
    const map = heuristicMap(TIDY);
    const changed: RawSheet = structuredClone(TIDY);
    const stockTab = changed.tabs.find((t) => t.name === "Stock")!;
    stockTab.rows = stockTab.rows.map((r, i) => [...r, i === 0 ? "Costo de reposición" : "999"]);
    const { snapshot, needsReview } = applyMap(changed, map);
    expect(needsReview).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("999");
  });

  it("si mueven una columna la encuentra por el título, sin pedir revisión", () => {
    const map = heuristicMap(TIDY);
    const moved: RawSheet = structuredClone(TIDY);
    const stockTab = moved.tabs.find((t) => t.name === "Stock")!;
    stockTab.rows = stockTab.rows.map(([a, b, ...rest]) => [b, a, ...rest]);
    const { snapshot, needsReview } = applyMap(moved, map);
    expect(needsReview).toBe(false);
    const s = snapshot.tabs.find((t) => t.name === "Stock")!;
    expect(s.rows[0][s.headers.indexOf("SKU")]).toBe("M-001");
  });

  it("el mapa de la IA se ajusta a la planilla: lo que no menciona queda privado o sin usar", () => {
    const map = normalizeMap(TIDY, {
      tabs: [
        {
          name: "stock",
          use: "catalog",
          headerRow: 1,
          columns: [
            { index: 2, header: "", role: "name" },
            { index: 6, header: "", role: "price" },
          ],
        },
      ],
    });
    const stock = tab(map, "Stock");
    expect(stock.use).toBe("catalog");
    expect(stock.columns.find((c) => c.header === "Modelo")?.role).toBe("name");
    expect(stock.columns.find((c) => c.header === "Marca")?.role).toBe("private");
    expect(tab(map, "Promos y pagos").use).toBe("ignore");
    expect(previewText(TIDY)).toContain('Row 1: {"0":"SKU"');
  });
});

describe("el stock en el prompt", () => {
  it("si es chico va entero en la parte fija", () => {
    const { snapshot } = applyMap(TIDY, heuristicMap(TIDY));
    const p = stockPrompt(snapshot, "cuánto sale la wave?", "es");
    expect(p.fixed).toContain("## Stock");
    expect(p.fixed).toContain("Modelo: Wave 110 S");
    expect(p.fixed).toContain("Tarjeta de crédito");
    expect(p.note).toBe("");
  });

  it("si es grande van las filas que coinciden con lo que pregunta el cliente", () => {
    const rows = Array.from({ length: 400 }, (_, i) => [`Moto genérica ${i}`, `$ ${1000 + i}`, "3"]);
    rows.push(["Honda Wave 110 S", "$ 2.650.000", "6"]);
    const big: StockSnapshot = {
      tabs: [
        {
          name: "Stock",
          use: "catalog",
          headers: ["Modelo", "Precio", "Unidades"],
          roles: ["name", "price", "stock"],
          rows,
        },
      ],
    };
    const p = stockPrompt(big, "hola! tenés la wave?", "es");
    expect(p.fixed.length).toBeLessThan(FULL_STOCK_CHARS);
    expect(p.note).toContain("Modelo: Honda Wave 110 S");
    expect(p.note).not.toContain("Moto genérica 5");
    // Sin coincidencias, la lista de nombres para que ofrezca algo sin inventar.
    expect(stockPrompt(big, "qué tenés?", "es").note).toContain("Moto genérica 0");
  });
});

describe("el robot de Google", () => {
  it("firma el JWT con la clave de la cuenta de servicio (RS256)", async () => {
    const { signedJwt } = await import("@/lib/google/sheets");
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = signedJwt({ client_email: "robot@x.iam.gserviceaccount.com", private_key: pem }, 1_000);
    const [head, claims, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toMatchObject({
      iss: "robot@x.iam.gserviceaccount.com",
      iat: 1000,
      exp: 4600,
    });
    expect(
      createVerify("RSA-SHA256").update(`${head}.${claims}`).verify(publicKey, Buffer.from(sig, "base64url")),
    ).toBe(true);
  });
});
