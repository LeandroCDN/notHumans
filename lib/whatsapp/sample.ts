// Sets de chats inventados para probar sin chats reales. Los archivos viven en public/samples/
// (así también se pueden descargar y subir a mano) y se cargan con fetch.
//   Martina: vende ropa, minúsculas, muchos emojis, varios mensajes seguidos.
//   El Tano: ferretería, seco, sin emojis, "maestro", "q", precios al toque.
//   Emma: la versión en inglés de Martina.

import type { ChatFile } from "./files";

export type SampleSet = {
  id: "martina" | "tano" | "emma";
  owner: string;
  lang: "es" | "en";
  files: string[];
  /** Para precargar el formulario del negocio y probar todo de una. */
  business: {
    name: string;
    whatTheySell: string;
    where: string;
    audience: "consumers" | "wholesale" | "companies" | "mixed";
    roles: ("questions" | "sells" | "orders" | "aftersales")[];
    notes: string;
  };
};

export const SAMPLE_SETS: SampleSet[] = [
  {
    id: "martina",
    owner: "Martina",
    lang: "es",
    business: {
      name: "Martina",
      whatTheySell: "Ropa de mujer: jeans, camperas, vestidos, sweaters",
      where: "Local en Palermo (CABA) y envíos a todo el país",
      audience: "consumers",
      roles: ["questions", "sells", "aftersales"],
      notes: "También vende por mayor a revendedoras",
    },
    files: [
      "Chat de WhatsApp con Sofi.txt",
      "Chat de WhatsApp con Caro.txt",
      "Chat de WhatsApp con Juli.txt",
      "Chat de WhatsApp con Meli.txt",
      "Chat de WhatsApp con +54 9 11 3456-7890.txt",
      "WhatsApp Chat - Lucas.txt",
    ],
  },
  {
    id: "tano",
    owner: "El Tano",
    lang: "es",
    business: {
      name: "El Tano",
      whatTheySell: "Ferretería: plomería, construcción, tornillería, iluminación",
      where: "Lanús, con fletes a la zona sur",
      audience: "mixed",
      roles: ["questions", "sells", "orders"],
      notes: "Atiende a plomeros y albañiles y también a vecinos",
    },
    files: [
      "Chat de WhatsApp con Rubén Plomero.txt",
      "Chat de WhatsApp con Marcela.txt",
      "Chat de WhatsApp con Diego Obra.txt",
      "Chat de WhatsApp con Nico.txt",
      "WhatsApp Chat - Pablo.txt",
      "WhatsApp Chat - Sra Elsa.txt",
    ],
  },
  {
    id: "emma",
    owner: "Emma",
    lang: "en",
    business: {
      name: "Emma",
      whatTheySell: "Women's clothing: jackets, sweaters, hoodies",
      where: "Store on 5th Street, ships nationwide",
      audience: "consumers",
      roles: ["questions", "sells", "aftersales"],
      notes: "",
    },
    files: [
      "WhatsApp Chat with Olivia.txt",
      "WhatsApp Chat with Hannah.txt",
      "WhatsApp Chat with Mia.txt",
      "WhatsApp Chat - Ben.txt",
    ],
  },
];

export const samplePath = (set: SampleSet, file: string) => `/samples/${set.id}/${encodeURIComponent(file)}`;

export async function loadSampleSet(set: SampleSet): Promise<ChatFile[]> {
  return Promise.all(
    set.files.map(async (name) => {
      const res = await fetch(samplePath(set, name));
      if (!res.ok) throw new Error(`No se pudo cargar ${name}`);
      return { name, text: await res.text() };
    }),
  );
}
