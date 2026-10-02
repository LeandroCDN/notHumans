# TODO — notHumans

## Ahora: Supabase (guardar y versionar notHumans)
- [x] Crear el proyecto en supabase.com y conectar el conector de Supabase a Claude
- [x] Aplicar las migraciones de `supabase/migrations/`
- [x] Variables en Vercel: `SUPABASE_URL` y `SUPABASE_SECRET_KEY` (solo server, nunca al navegador)
- [x] `lib/nothuman/store.ts` pasa a llamar a la API (`/api/nothumans`) en vez de localStorage
- [x] Botón para subir los notHumans que quedaron en localStorage, e "Importar JSON"
- [x] Cada cambio de perfil/ejemplos crea una versión nueva (v1, v2…) y se puede volver atrás

## Orden acordado
1. [x] Fusionar Explorar + test drive + perfil en la sección notHumans
2. [x] Puestos, entrega 1: crear (contame el laburo + audio → la IA ordena; reglas, horario, pasar a una persona),
   asignar desde notHumans, chat y link público con el puesto ("usó: …")
   [ ] Puestos, entrega 2: catálogo desde Excel/CSV con columnas visibles/privadas, el notHuman busca en vez de leer todo
3. [ ] Conexiones: Google Sheets y Calendar con cuenta de servicio (solo lectura) + mail propio del puesto
4. [ ] WhatsApp: API oficial (Cloud API), conversaciones guardadas por número de cliente, pasar a una persona

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

## Link público
- [x] `/c/<token>` para chatear sin cuenta, con tope de respuestas por link y de mensajes por minuto
- [ ] Elegir el tope de respuestas al crear el link (hoy 300) y ver las charlas que tuvo la gente
- [ ] Con el "puesto de trabajo" y los datos de prueba, que el link muestre datos en vez de {price}

## Nota: legal y datos personales (antes de conectar el primer negocio real)
> No es asesoramiento legal: hacer una consulta con un abogado de datos personales antes de tener clientes.

- **Guardar charlas de WhatsApp (API oficial) es normal**, con condiciones (Ley 25.326 y términos de Meta):
  política de privacidad que diga que se guardan y se procesan con IA (y con qué proveedores), usarlas solo para
  atender, acceso restringido, borrado automático, poder mostrar/borrar los datos de un cliente si lo pide, y
  ver si hay que inscribir la base ante la AAIP.
- **Transferencia internacional**: DeepSeek procesa en China; la ley restringe mandar datos personales a países
  sin "protección adecuada" (salvo consentimiento o contratos). Puede pedir otro proveedor de IA en producción.
- **Chats subidos para crear un notHuman**: tienen mensajes de terceros (los clientes del dueño). Hoy no guardamos
  los chats crudos (solo estilo + ejemplos con marcadores y `findLeak`), pero pasan por DeepSeek al generar:
  que el dueño lo tenga cubierto en sus términos.
- **Avisar que es una IA**: en Argentina no hay ley específica, pero la ley del consumidor pide información veraz
  y en la UE ya es obligatorio. El link público ya lo aclara; en WhatsApp también.
- **Sin API oficial** (WhatsApp Web con QR): no es delito, pero viola los términos de Meta (riesgo de ban).
- **Clonar voz**: solo con consentimiento explícito y por escrito.
- Antes del primer negocio real: términos + política de privacidad, borrado automático de charlas, y decidir
  qué proveedor de IA usar con datos de clientes.

## Ideas sueltas
- [x] Entrenar desde el chat: corregir una respuesta en el test drive ("ella lo diría así") y que entre como
  ejemplo en una versión nueva
- [ ] Ponerle intención a las correcciones (hoy entran como "other")
- [ ] Limpiar NotLean (direcciones y un teléfono que se colaron antes del filtro nuevo)
- [ ] "image omitted" pegado a un texto se cuela en los ejemplos (el parser solo lo detecta en un mensaje solo)
- [ ] Traer ejemplos relevantes (no solo los canónicos) según lo que pregunta el cliente
