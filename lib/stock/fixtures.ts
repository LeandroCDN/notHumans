import type { RawSheet } from "./types";

// Planillas de mentira para desarrollar sin Google (y para los tests): una prolija, como "Motorbike Stock",
// y otra desordenada a propósito, como las de los negocios de verdad.

export const DEMO_TIDY_ID = "demo-motorbike-stock-0001";
export const DEMO_MESSY_ID = "demo-messy-stock-00000001";

export const TIDY: RawSheet = {
  title: "Motorbike Stock (demo)",
  tabs: [
    {
      name: "Cómo usar",
      rows: [["Planilla de prueba. Todos los datos son inventados."], [], ["Qué puede leer el notHuman"]],
    },
    {
      name: "Stock",
      rows: [
        [
          "SKU",
          "Marca",
          "Modelo",
          "Año",
          "Condición",
          "Km",
          "Precio contado (ARS)",
          "Unidades",
          "Disponible",
          "Entrega",
          "Notas para el cliente",
        ],
        ["M-001", "Honda", "Wave 110 S", "2026", "0km", "0", "$ 2.650.000", "6", "Sí", "Inmediata", "La más vendida."],
        [
          "M-003",
          "Honda",
          "XR 150L",
          "2026",
          "0km",
          "0",
          "$ 4.790.000",
          "2",
          "Sí",
          "Inmediata",
          "Ideal ciudad y ripio.",
        ],
        [
          "M-004",
          "Honda",
          "XR 190L",
          "2026",
          "0km",
          "0",
          "$ 5.950.000",
          "0",
          "No",
          "15 días",
          "Se puede reservar con seña.",
        ],
        [
          "M-005",
          "Honda",
          "CB 190R",
          "2026",
          "0km",
          "0",
          "$ 5.790.000",
          "1",
          "Sí",
          "Inmediata",
          "Última unidad en gris.",
        ],
        ["M-008", "Yamaha", "FZ-S 150 FI", "2026", "0km", "0", "$ 4.990.000", "4", "Sí", "Inmediata", ""],
        [
          "M-012",
          "Yamaha",
          "MT-03",
          "2026",
          "0km",
          "0",
          "$ 12.900.000",
          "0",
          "No",
          "30 días",
          "Por pedido. Seña del 10 %.",
        ],
        [
          "M-016",
          "Bajaj",
          "Dominar 400",
          "2026",
          "0km",
          "0",
          "$ 9.790.000",
          "1",
          "Sí",
          "Inmediata",
          "ABS doble canal.",
        ],
        [
          "M-021",
          "Corven",
          "Energy 110 RT",
          "2026",
          "0km",
          "0",
          "$ 1.590.000",
          "0",
          "No",
          "Sin fecha",
          "Sin stock de fábrica.",
        ],
        [
          "U-101",
          "Honda",
          "Wave 110 S",
          "2022",
          "Usada",
          "14.200",
          "$ 1.750.000",
          "1",
          "Sí",
          "Inmediata",
          "Único dueño.",
        ],
        [
          "U-104",
          "Bajaj",
          "Rouser NS 200",
          "2021",
          "Usada",
          "18.900",
          "$ 3.550.000",
          "0",
          "No",
          "Señada",
          "Puede volver a quedar libre.",
        ],
      ],
    },
    {
      name: "Promos y pagos",
      rows: [
        ["Tema", "Detalle", "Vigente hasta"],
        ["Tarjeta de crédito", "3 cuotas sin interés en todas las motos.", "31/10/2026"],
        ["Usada en parte de pago", "Tomamos motos 2015 en adelante.", "Sin vencimiento"],
        ["Horario", "Lunes a viernes de 9 a 19 h, sábados de 9 a 13 h.", ""],
      ],
    },
    {
      name: "Interno (privado)",
      rows: [
        ["SKU", "Moto", "Costo (ARS)", "Proveedor", "Margen %", "Notas internas"],
        [
          "M-005",
          "Honda CB 190R",
          "$ 4.748.000",
          "Honda Motor de Argentina",
          "18%",
          "Última gris: no bajar de precio.",
        ],
      ],
    },
  ],
};

export const MESSY: RawSheet = {
  title: "LISTA PRECIOS OCTUBRE (demo)",
  tabs: [
    {
      name: "Hoja 1",
      rows: [
        ["MOTOS DON PEPE - LISTA OCTUBRE"],
        [],
        ["", "moto", "$$ contado", "cuantas quedan", "obs", "lo que pagamos"],
        ["", "wave 110", "2650000", "quedan 2", "", "2100000"],
        ["", "titan 150", "3890000", "no hay", "llega la semana que viene", "3100000"],
        [],
        ["", "moto", "$$ contado", "cuantas quedan", "obs", "lo que pagamos"],
        ["", "smash 110", "1790000", "varias", "", "1400000"],
      ],
    },
    {
      name: "Sueldos",
      rows: [
        ["Nombre", "Sueldo"],
        ["Pepe", "900000"],
      ],
    },
  ],
};

export function fixture(id: string): RawSheet {
  return /messy|desorden/i.test(id) ? MESSY : TIDY;
}
