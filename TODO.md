# TODO — notHumans

## Ahora: Supabase (guardar y versionar notHumans)
- [x] Crear el proyecto en supabase.com y conectar el conector de Supabase a Claude
- [x] Aplicar las migraciones de `supabase/migrations/`
- [x] Variables en Vercel: `SUPABASE_URL` y `SUPABASE_SECRET_KEY` (solo server, nunca al navegador)
- [x] `lib/nothuman/store.ts` pasa a llamar a la API (`/api/nothumans`) en vez de localStorage
- [x] Botón para subir los notHumans que quedaron en localStorage, e "Importar JSON"
- [x] Cada cambio de perfil/ejemplos crea una versión nueva (v1, v2…) y se puede volver atrás

## Después: el puesto de trabajo
La idea: el notHuman es **cómo habla**; el puesto es **dónde trabaja y con qué reglas**. Separados, la misma
persona puede atender varios negocios y cambiar una regla no obliga a regenerar la personalidad.
Las reglas del puesto le ganan al estilo (si Martina daba descuentos pero el negocio dice que no, no da).

- [ ] **Puesto** (se configura una vez, se edita en la web):
  - qué es el negocio, qué vende, a quién (cliente objetivo)
  - reglas: cambios y devoluciones, medios de pago, horarios, zonas y formas de envío
  - límites: "nunca descuento por WhatsApp", "factura A → derivar a un humano"
  - qué puede hacer: vender, tomar pedidos, atender reclamos, cuándo pasar la charla a una persona
  - mover acá lo que hoy pide el formulario de creación (qué vende, audiencia, roles, notas)
- [ ] **Datos del momento** (stock, precios, promos, estado de un pedido): no se guardan en notHumans,
  los manda el sistema del negocio en cada consulta para que nunca queden viejos
- [ ] Test drive con panel de "datos de prueba" (precio = $48.000, envío = 3 días…) que completa los marcadores
- [ ] **API** `POST /api/v1/reply`: notHuman + puesto + conversación + datos del momento → mensajes listos,
  con key por cliente
- [ ] Averiguar de dónde sale el stock (planilla, Tiendanube, Shopify, MercadoLibre…) para ver si conviene
  integración directa o que lo mande el negocio por la API

## Notas de voz
- [x] Transcribir los audios del .zip "con archivos" (Groq Whisper) y sumarlos a las conversaciones con 🎤
- [ ] Probar con un export real con audios (iOS y Android) y ajustar
- [ ] Más adelante: que el notHuman responda con audio (text-to-speech / voz clonada, con consentimiento)

## Ideas sueltas
- [x] Entrenar desde el chat: corregir una respuesta en el test drive ("ella lo diría así") y que entre como
  ejemplo en una versión nueva
- [ ] Ponerle intención a las correcciones (hoy entran como "other")
- [ ] Limpiar NotLean (direcciones y un teléfono que se colaron antes del filtro nuevo)
- [ ] "image omitted" pegado a un texto se cuela en los ejemplos (el parser solo lo detecta en un mensaje solo)
- [ ] Traer ejemplos relevantes (no solo los canónicos) según lo que pregunta el cliente
