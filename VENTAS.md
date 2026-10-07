# Ventas — cómo pensamos vender notHumans

> Lo charlado en la sesión "Ventas" (octubre de 2026). Es un documento vivo: corregirlo cuando cambie algo.
> Lo técnico y lo pendiente está en `TODO.md`; las decisiones de código, en `CLAUDE.md`.

## El producto, en una línea
**Un vendedor (o un soporte) que habla como vos, atendiendo tu WhatsApp.** Tres piezas que se combinan:

| Pieza | Qué es | Ejemplo |
|---|---|---|
| **notHuman** | La personalidad, sacada de los chats | "Juan, vendedor canchero que cierra rápido" |
| **Puesto** | Dónde trabaja, con qué reglas y qué datos | "Venta de autos" + link al stock |
| **Canal** | El número de WhatsApp | +54 9 11… |

Que estén separadas abre ventas que otros no tienen:
- **Una persona, varios puestos**: el mismo "Juan" vende autos en una concesionaria y departamentos en otra.
- **Un puesto, varias personas**: probar qué voz vende más con el mismo stock ("probá dos vendedores y quedate
  con el que más cierra").
- **Catálogo de personalidades** (más adelante, con Comunidad): un vendedor top presta su voz y cobra por uso.

## Mercado
- **Primero Argentina, después LATAM.** Las pymes venden por WhatsApp y el trato personal pesa.
- **El diferencial es la voz.** Los bots hablan en un español neutro que se nota artificial; un notHuman habla
  con el voseo, las muletillas y la forma de cerrar del dueño. Cada país de LATAM tiene su forma de hablar.
- **Rubros prometedores**: concesionarias e inmobiliarias (muchas consultas repetidas, stock con links,
  vendedores con personalidad), tiendas online chicas y emprendedores de Instagram, profesionales independientes
  (coaches, entrenadores, asesores; **no** salud mental ni nutrición al principio, por los datos sensibles),
  creadores de contenido.

## Competencia (relevado en octubre de 2026)
- **Plataformas de chatbots/CRM de WhatsApp** que ya tienen IA: Botmaker (empresas grandes), Cliengo
  (argentina, fuerte en captar leads), Leadsales (CRM con Kanban), Treble (API + integraciones), Wati, respond.io.
  Cobran entre ~US$ 39 y 149 por mes (precios de comparativas; verificar en sus sitios).
- **Meta Business AI**: desde febrero de 2026 Meta ofrece gratis a las pymes de Argentina y otros 16 países de
  LATAM un agente que responde con el catálogo. Un bot "que responde" pasa a ser gratis: lo que se vende es
  **cómo** responde.
- **Startups argentinas de agentes de IA por WhatsApp**: Galo AI, Coati (Techsed), KiwIA, Aoki. Competencia o
  partners, según el caso.

## Cómo vender
1. **Armado a medida** (ahora): lo hacemos nosotros de punta a punta (subir chats, ajustar la persona, armar el
   puesto, conectar el número). Sirve para aprender qué cuesta y dónde se traba el cliente. Se cobra un pago
   inicial (creación + integración) más un abono mensual (mantenimiento y ajustes).
2. **SaaS directo a la pyme**: el plan Business (WhatsApp incluido). Al dueño se le habla así: "contratás un
   vendedor que habla como vos por un abono mensual". Se compara con el sueldo de un empleado, no con un chatbot.
3. **Partners** (para crecer): plataformas de chatbots y agencias que ya tienen el canal y los datos y suman la
   voz. Ellos lo venden como extra premium ("lo que el bot gratis de Meta no tiene") y nosotros cobramos por
   notHuman o por mensaje, o repartimos ingresos. Hace falta la API `/api/v1/reply` y las cuentas de agencia
   (`TODO.md`).
   - Primero **agencias** que implementan estas plataformas: es más fácil conseguir la reunión y buscan cómo
     diferenciarse.
   - Después **plataformas medianas o con API abierta** donde la IA no es su fuerte (Cliengo, Treble). Botmaker
     ya tiene IA propia y apunta a empresas grandes: más adelante.

## El piloto con el amigo
- Es nuestro primer cliente: le armamos todo a medida y medimos **antes y después** desde el día uno: tiempo de
  respuesta, consultas que se pierden, horas por semana en WhatsApp, ventas cerradas.
- Con esos números se arma el **caso de éxito**, que es la mejor herramienta de venta.
- Antes de generalizar, validar con **5 a 10 negocios del mismo rubro**: si les duele lo mismo, hay nicho.
- El SaaS sale de lo que se repita en cada armado a medida.

## Precios
- Hoy los planes están **al costo + 5 %** (`lib/pricing.ts`): Pro **US$ 3,50** por mes y Business
  **US$ 29,60** por mes, con los supuestos actuales. Está bien para la beta, pero:
  - Presentarlo como **precio beta** (con fecha o "para los primeros X clientes"): si no, el cliente se queda con
    ese precio como referencia y después cuesta subirlo. La competencia cobra bastante más.
  - **Falta lo que cobra Meta por conversación**: definir si lo paga el negocio directo (con su propia cuenta de
    WhatsApp Business, etapa C) o lo pagamos nosotros y lo sumamos al precio.
  - **El armado a medida no tiene precio** todavía.
  - Definir si se cobra en **dólares o en pesos** (en Argentina cambia mucho).
- Con varios proveedores de IA, cada nivel tiene su precio (abajo).

## Proveedores de IA por nivel
| Nivel | Proveedor | Para quién |
|---|---|---|
| **Económico** | API oficial de DeepSeek | Pymes chicas donde manda el precio |
| **Privacidad** | El mismo modelo (pesos abiertos) en servidores de la UE o EE. UU. | "¿A dónde van mis datos?" |
| **Premium** | Modelos de primera línea (Claude, GPT…) | Donde la calidad de la charla vale más |

- Responde la objeción de privacidad sin pelearla ("elegí dónde se procesan tus datos"), cada nivel paga lo
  suyo y no dependemos de un solo proveedor.
- DeepSeek en servidores de terceros suele salir más caro y la caché cambia: medirlo antes de ponerle precio.
- Por qué la UE y no "cualquiera menos China": ver la nota legal de `TODO.md`.

## Privacidad como argumento de venta
> "Tus chats no se guardan: nos quedamos con tu forma de escribir, nunca con los datos de tus clientes."

- Para una concesionaria o una inmobiliaria con datos de cientos de clientes, eso tranquiliza más que cualquier
  función. Solo vale si es cierto: anonimizar antes de mandar a la IA, no guardar los chats subidos, borrar las
  charlas viejas y dejar borrar todo (detalle en `TODO.md`).
- **Avisar que es una IA**: venderlo como "la voz del dueño" o "tu mejor vendedor", con la opción de aclarar que
  es un asistente. Si el cliente final se entera solo, el que queda mal es el negocio.
- **Política de Meta**: no permite asistentes de IA de uso general en la API de WhatsApp Business, sí bots
  atados a un negocio (ventas, soporte). Con el puesto, notHumans es lo segundo: presentarlo siempre así.

## Próximos pasos
- [ ] Contar el rubro del amigo, para qué lo usaría y cómo maneja hoy WhatsApp → define el primer rubro.
- [ ] Medir el "antes" del piloto antes de prenderlo.
- [ ] Demo **antes/después**: la misma consulta respondida por un bot genérico y por el notHuman.
- [ ] Lista de 3 a 5 agencias o plataformas para contactar cuando esté el caso del amigo.
- [ ] Decidir precio beta, quién paga a Meta, precio del armado a medida y moneda.

## Fuentes (octubre de 2026)
- [La Nación: el agente de IA de WhatsApp Business](https://www.lanacion.com.ar/tecnologia/whatsapp-business-como-funciona-el-agente-de-ia-que-ahora-te-respondera-siempre-y-que-promete-nid24022026/)
- [Theos: Best AI Tools to Sell on WhatsApp 2026](https://www.theos.ai/en-us/blog/best-whatsapp-ai-sales-tools)
- [Runia: Alternativas a Treble 2026](https://runia.ar/alternativas-a-treble-2026)
- [Botias: Mejores chatbots de WhatsApp para pymes argentinas 2026](https://botias.io/blog/mejores-chatbots-whatsapp-pymes-argentinas-2026)
- [iProUP: Argentinos crean IA que potencia las ventas por WhatsApp](https://www.iproup.com/startups/68568-argentinos-crean-ia-que-potencia-las-ventas-por-whatsapp-ya-la-usan-en-5-paises)
- [Marval: Transferencia internacional de datos personales](https://www.marval.com/Publicacion/transferencia-internacional-de-datos-personales-13335)
- [Marval: Registro de bases de datos personales](https://www.marval.com/Publicacion/nueva-resolucion-sobre-registro-de-bases-de-datos-personales-13255)

Casi todas las comparativas las publican las propias plataformas: precios y cifras, a confirmar.
