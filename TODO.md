# TODO — notHumans

## Hecho: Supabase (guardar y versionar notHumans)
- [x] Crear el proyecto en supabase.com y conectar el conector de Supabase a Claude
- [x] Aplicar las migraciones de `supabase/migrations/`
- [x] Variables en Vercel: `SUPABASE_URL` y `SUPABASE_SECRET_KEY` (solo server, nunca al navegador)
- [x] `lib/nothuman/store.ts` pasa a llamar a la API (`/api/nothumans`) en vez de localStorage
- [x] Botón para subir los notHumans que quedaron en localStorage, e "Importar JSON"
- [x] Cada cambio de perfil/ejemplos crea una versión nueva (v1, v2…) y se puede volver atrás

## Cuentas, privacidad y comunidad
La cuenta es abierta; lo que se controla es el acceso al modelo, y eso lo define el plan.
1. [x] **Cuentas y planes**: Google (Supabase Auth) + cuentas fijas de antes; perfiles con plan (Free/Pro/Business/
   Admin, en `lib/plans.ts`), consumo en `usage` con topes por mes y tope de costo oculto, panel de admin para
   asignar planes y ver pedidos de acceso, cada cuenta ve solo lo suyo
   - [x] Configurar Google: cliente OAuth en Google Cloud + proveedor en Supabase + `AUTH_GOOGLE=1` en Vercel
   - [ ] Cuando haya dominio propio: entrar con código por mail (Resend + Supabase Auth)
   - [ ] Borrar mi cuenta (borra todo en cascada) y exportar mis datos
2. [ ] **Privacidad**: cada notHuman 🔒 privado (default) o 🌍 público. Publicar es un paso: alias, consentimiento
   de la persona imitada, revisión de datos sueltos (`findLeak`), vista previa. El puesto nunca es público; los
   ejemplos solo si el dueño quiere
3. [ ] **Comunidad**: filtro Míos · Comunidad en notHumans; los ajenos se ven en solo lectura y se prueban con
   3 respuestas por notHuman (cuenta para el que chatea; los topes ya están en el plan Free); reportar
4. [ ] **Cobros**: checkout (MercadoPago / Stripe) que solo escribe `plan`, `plan_source` y `plan_until`.
   Con cobros, el período pasa a contarse desde la fecha de pago
   ✅ Página de planes al costo + 5 % (`/pricing`, `lib/pricing.ts`). Falta calibrar los supuestos con el consumo
   real (tabla `usage`: costo promedio por respuesta / generación) y revisarlos si cambian los precios de DeepSeek
5. [ ] **Agencias**: una cuenta que maneja los notHumans, puestos y números de varios clientes (agencias,
   community managers). Cada cliente separado (sus datos no se mezclan), con su consumo aparte; ver si el cliente
   entra a ver su bandeja o solo la agencia
6. [ ] **Proveedores de IA por nivel** (`lib/llm/`): Económico (API oficial de DeepSeek), Privacidad (el mismo
   modelo de pesos abiertos en servidores de la UE o EE. UU., ej. AWS Bedrock / Azure) y Premium (Claude, GPT…).
   Cada nivel con su precio en `lib/pricing.ts` (medir costo y caché de cada uno)

## Orden acordado
1. [x] Fusionar Explorar + test drive + perfil en la sección notHumans
2. [x] Puestos, entrega 1: crear (contame el laburo + audio → la IA ordena; reglas, horario, pasar a una persona),
   asignar desde notHumans, chat y link público con el puesto ("usó: …")
   [x] Puestos, entrega 2: stock/catálogo (hecho: robot, mapa con IA + revisión, copia visible, prompt; falta
   probarlo con el robot real y la planilla desordenada, el CSV de respaldo y avisarle al dueño por mail/WhatsApp
   cuando la planilla cambie de forma). Camino principal: el dueño comparte su Google Sheet con el robot
   (cuenta de servicio, solo lectura), elige columnas visibles/privadas, sincronizamos cada pocos minutos a una
   copia y el notHuman busca ahí (solo las filas que importan, pegadas al último mensaje). CSV como respaldo
   **Sin plantilla obligatoria**: cada cliente usa su planilla como la tenga. Al conectar, la IA arma un "mapa"
   (dónde está el encabezado de cada tabla, qué pestañas son catálogo / info / ignorar, qué columna identifica al
   producto, precio, stock, y qué es privado; ante la duda, privado) y el dueño lo revisa y corrige con un toque.
   Se guarda con los encabezados: si cambian, se rehace y se avisa, y las columnas nuevas no se usan hasta revisarlas.
   Lo privado se filtra en el server, nunca llega al modelo. Planillas chicas van enteras (con caché); grandes, se
   buscan las filas que importan. Lo que no leemos (colores como dato, comentarios) se avisa en la revisión.
   Planilla de prueba prolija: "Motorbike Stock" (Google Sheets del usuario); falta una desordenada a propósito
3. [ ] Conexiones: Google Calendar con cuenta de servicio (solo lectura) + mail propio del puesto
   - [ ] **Cobrar en el chat** (Mercado Pago): el notHuman manda un link de pago generado para ese pedido y el
     pago se valida por el webhook de Mercado Pago (no por lo que diga el cliente ni por un comprobante); con el
     pago aprobado avisa en la charla y al dueño. WhatsApp no tiene un "Pagar" con Google/Apple Pay en Argentina
4. [ ] WhatsApp con **flujo propio** (decidido: nada de n8n ni bandejas de terceros en el medio). API oficial
   (Cloud API): webhook firmado → guardar mensaje (idempotente por id) → esperar unos segundos por si manda más
   (cola) → responder con personalidad + puesto + catálogo → burbujas de a una. Tablas `channels`,
   `wa_conversations`, `wa_messages`. Modos por número: borrador (sugiere, el dueño aprueba) / fuera de horario /
   siempre. Pasar a una persona: la charla queda en modo humano; con coexistencia el dueño responde desde su app
   y el bot se calla. Etapas: A) número de prueba de Meta + modo borrador; B) automático + bandeja;
   C) "Conectar mi WhatsApp" (alta embebida, verificación del negocio). Verificar: coexistencia en Argentina,
   ventana de 24 h, política de Meta sobre bots de IA (cambió a principios de 2026)
   - [x] Etapa A en código: webhook + canales + bandeja (borrador / fuera de horario / automático / apagado),
     tomar la charla, sugerir, audios transcriptos, simulador sin Meta
   - [x] Probado con el número de prueba real: llega el mensaje, se arma el borrador y al aprobarlo llega al celu
   - [x] Token de usuario del sistema (portfolio NotHumans, "notHumans bot"): **vence a los 60 días, ~6/12/2026**.
     Antes de esa fecha: generar otro (Configuración → Usuarios del sistema → Generar token), pegarlo en
     `WHATSAPP_TOKEN` en Vercel y redeployar. Si se vence, los envíos fallan con "Authentication Error"
   - [ ] Probar el modo automático con el stock conectado
   - [ ] Filtro de datos personales: que también cambie nombres propios por un marcador (`{owner_name}`)
   - [ ] Pasar a una persona automático (el modelo marca `handoff` y la charla queda en modo humano) + aviso al dueño
   - [ ] **Consultar al dueño** ("subir el nivel de atención"): cuando el notHuman no puede validar o hacer algo
     (un descuento, una seña, un dato que no tiene), le escribe al dueño a su número con el problema (plantilla de
     WhatsApp con botones: sí / no / respondo yo), al cliente le manda un mensaje de espera ("dejame que lo
     consulto"), y con la respuesta del dueño sigue la charla. Si el dueño no contesta en X minutos, pasa a una
     persona. Falta definir: número del operador por puesto, qué cosas siempre se consultan (reglas del puesto)
   - [ ] **No volver a saludar / ficha del cliente**: que no arranque cada respuesta como si fuera el primer mensaje
     (regla en el prompt: si ya hubo charla, seguirla). Y una ficha por cliente (nombre, qué preguntó, qué compró,
     notas del dueño) que se suma al prompt cuando vuelve otro día, aunque la ventana de 24 h haya vencido
   - [ ] Guardar las correcciones de la bandeja como ejemplos del notHuman (como "✎ corregir" del test drive)
   - [ ] Token por canal (cifrado) para la etapa C; hoy hay uno solo en `WHATSAPP_TOKEN`
   - [ ] API pública `/api/v1/reply` con API keys: es la puerta para vender por plataformas de chatbots y agencias
     (ver `VENTAS.md`), además de n8n/Make/Zapier. Prioridad después del stock

## Después: el puesto de trabajo
La idea: el notHuman es **cómo habla**; el puesto es **dónde trabaja y con qué reglas**. Separados, la misma
persona puede atender varios negocios y cambiar una regla no obliga a regenerar la personalidad.
Las reglas del puesto le ganan al estilo (si Martina daba descuentos pero el negocio dice que no, no da).

- [x] **Puesto** (se configura una vez, se edita en la web) → hecho en Puestos, entrega 1:
  - qué es el negocio, qué vende, a quién (cliente objetivo)
  - reglas: cambios y devoluciones, medios de pago, horarios, zonas y formas de envío
  - límites: "nunca descuento por WhatsApp", "factura A → derivar a un humano"
  - qué puede hacer: vender, tomar pedidos, atender reclamos, cuándo pasar la charla a una persona
- [ ] Mover al puesto lo que hoy pide el formulario de creación (qué vende, audiencia, roles, notas): sigue en
  `components/create/business-form.tsx`
- [ ] **Datos del momento** (stock, precios, promos, estado de un pedido): no se guardan en notHumans,
  los manda el sistema del negocio en cada consulta para que nunca queden viejos
- [ ] Test drive con panel de "datos de prueba" (precio = $48.000, envío = 3 días…) que completa los marcadores
- [ ] **API** `POST /api/v1/reply`: notHuman + puesto + conversación + datos del momento → mensajes listos,
  con key por cliente
- [x] Averiguar de dónde sale el stock (planilla, Tiendanube, Shopify, MercadoLibre…) para ver si conviene
  integración directa o que lo mande el negocio por la API → decidido: Google Sheet compartido con el robot
  (ver Orden acordado, Puestos entrega 2)

## Notas de voz
- [x] Transcribir los audios del .zip "con archivos" (Groq Whisper) y sumarlos a las conversaciones con 🎤
- [ ] Probar con un export real con audios (iOS y Android) y ajustar
- [ ] Más adelante: que el notHuman responda con audio (text-to-speech / voz clonada, con consentimiento)

## Link público
- [x] `/c/<token>` para chatear sin cuenta, con tope de respuestas por link y de mensajes por minuto
- [ ] Elegir el tope de respuestas al crear el link (hoy 300) y ver las charlas que tuvo la gente
- [ ] Con el "puesto de trabajo" y los datos de prueba, que el link muestre datos en vez de {price}
  (con puesto ya usa los datos que tenga el puesto; falta el stock y los datos de prueba)

## Nota: legal y datos personales (antes de conectar el primer negocio real)
> No es asesoramiento legal: hacer una consulta con un abogado de datos personales antes de tener clientes.

- **Guardar charlas de WhatsApp (API oficial) es normal**, con condiciones (Ley 25.326 y términos de Meta):
  política de privacidad que diga que se guardan y se procesan con IA (y con qué proveedores), usarlas solo para
  atender a ese cliente de ese negocio (nunca para entrenar otros notHumans), acceso restringido, borrado
  automático (ej.: 90 días sin actividad) y poder mostrar/borrar los datos de un cliente si lo pide. El negocio es
  el *responsable* de los datos y notHumans el *encargado* que los procesa por cuenta de él.
- **Ficha del cliente**: es guardar más que la charla (nombre, qué compró, notas del dueño). Misma regla: solo
  para ese negocio, con plazo de borrado, visible y borrable por el dueño; sumarla a `/privacy`.
- **Inscribir la base ante la AAIP**: hay que hacerlo. Es gratis, por TAD con clave fiscal (nivel 2), sin
  renovación anual (solo se actualiza si cambia algo). El nombre y la finalidad de la base no se pueden cambiar
  después: poner una finalidad amplia ("asistentes conversacionales para empresas"), no "venta de autos".
- **Transferencia internacional**: la ley pide "protección adecuada" en el país de destino. La UE, Reino Unido,
  Suiza, Uruguay, Canadá (privados) y otros están en la lista; **EE. UU. y China no** (necesitan consentimiento o
  contrato con cláusulas modelo). En China además pesa la imagen ("¿mis chats van a China?") y que la API oficial
  de DeepSeek no firma acuerdos de datos. Decidido: **ofrecer varios proveedores** (ver `VENTAS.md`); con
  servidores en la UE no hace falta nada extra, en EE. UU. usar uno grande que firme el DPA.
- **Chats subidos para crear un notHuman**: tienen mensajes de terceros (los clientes del dueño). Hoy no guardamos
  los chats crudos (solo estilo + ejemplos con marcadores y `findLeak`), pero pasan por DeepSeek al generar:
  anonimizar en el navegador antes de mandar (teléfonos, mails, DNI, nombres) y que el dueño lo tenga cubierto en
  los términos (casilla sin marcar, guardar quién aceptó, cuándo y qué versión; volver a pedir si cambian).
- **Datos sensibles** (salud, religión, política, vida sexual): pedir explícitamente que no se suban chats así
  (psicólogos, nutricionistas…) y avisar si el chat parece tenerlos antes de generar.
- **Derechos del titular**: borrar y descargar sus datos de verdad. La ley da plazos cortos (si no me equivoco,
  10 días corridos para el acceso y 5 hábiles para corregir/borrar); `/privacy` hoy promete borrar la cuenta en
  "30 días como máximo": revisarlo con el abogado. Los clientes finales también tienen estos derechos.
- **Avisar que es una IA**: en Argentina no hay ley específica, pero la ley del consumidor pide información veraz
  y en la UE ya es obligatorio. El link público ya lo aclara; en WhatsApp también.
- **Sin API oficial** (WhatsApp Web con QR): no es delito, pero viola los términos de Meta (riesgo de ban).
- **Clonar voz**: solo con consentimiento explícito y por escrito.
- Antes del primer negocio real: términos + política de privacidad (con plazo de borrado de charlas y fichas),
  borrado automático de charlas, inscripción en la AAIP y el proveedor "Privacidad" disponible.

## Ideas sueltas
- [x] Entrenar desde el chat: corregir una respuesta en el test drive ("ella lo diría así") y que entre como
  ejemplo en una versión nueva
- [ ] Ponerle intención a las correcciones (hoy entran como "other")
- [ ] Limpiar NotLean (direcciones y un teléfono que se colaron antes del filtro nuevo)
- [ ] "image omitted" pegado a un texto se cuela en los ejemplos (el parser solo lo detecta en un mensaje solo)
- [ ] Traer ejemplos relevantes (no solo los canónicos) según lo que pregunta el cliente
- [ ] Gestor / convertidor de planillas: ofrecerle al cliente ordenar su planilla (o generarle una copia prolija
  a partir de la suya) para que el notHuman la entienda mejor. Opcional: nunca obligatorio

## Experimental features
> Solo para pensar e iterar según lo que necesite cada cliente potencial. **Nada de esta sección se implementa**
> hasta que lo decidamos.

### Recorrido para el primer notHuman (autoservicio)
Un cliente nuevo no sabe qué es un notHuman ni un puesto. Para su **primer** notHuman, un recorrido guiado de
3–4 pasos que crea los mismos objetos por detrás; después entra a la UI normal.
- Metáfora: **contratar a un empleado**. Sin la palabra "notHuman" ni "puesto": "cómo habla" · "tu negocio" ·
  "dónde atiende"
- Pasos:
  1. **Cómo habla**: sube chats de WhatsApp y la generación arranca en segundo plano (mini guía para exportar en
     iPhone/Android; check de "tengo permiso para usar estas charlas"). Salida para "no tengo chats":
     personalidades prearmadas o cuestionario de tono (sería nuevo)
  2. **Tu negocio**: "contame el laburo" (texto o audio) mientras se genera el paso 1, así no se nota la espera
  3. **Probalo**: test drive haciendo de cliente. Es el momento en que se engancha: antes de pedir plata o número
  4. **Ponelo a atender**: conectar WhatsApp (ver abajo). Mientras no se pueda, termina en el link público
- A resolver: el plan Free no tiene IA (¿cupo de prueba? muro de pago después de probar y antes de conectar);
  la generación necesita la pestaña abierta (retomar donde quedó); medir el tiempo hasta la primera respuesta
  del test drive (objetivo < 5 min)
- Forma posible: una ruta tipo `/app/start` con progreso guardado; asigna `job_id` y crea el link o el canal

### Conectar WhatsApp: coexistencia (opción elegida)
- El comercio **mantiene su número**: Embedded Signup (ventana de Meta) → escanea un QR con la app WhatsApp
  Business → la app sigue andando en su celular y nosotros recibimos y respondemos por la API. Lo que escribe el
  dueño nos llega (`smb_message_echoes`) y el bot se calla en esa charla. Al conectar, arrancar en borrador o
  "solo fuera de horario"
- Descartado por ahora: darle nosotros un número (sus clientes no lo conocen, el número quedaría nuestro, costo y
  trámite por número). Quizás más adelante como línea aparte para anuncios. Secundario: "prefiero un número
  aparte" con un chip/eSIM que trae él (misma ventana, sin QR)
- Lo que nos frena a nosotros (lo más lento, no depende de código):
  - **Verificar el negocio en Meta**: figura legal (monotributo para arrancar; sociedad más adelante), documentos
    con ese nombre, **dominio propio**, web mínima con HTTPS que muestre nombre legal y dirección, y mail en ese
    dominio. De días a semanas; rechazan si los nombres no coinciden
  - **App Review** de los permisos de WhatsApp: videos del flujo, privacidad, **términos** (no los tenemos) y
    borrado de datos. Presentarlo como atención al cliente de negocios, no como asistente de IA general
  - Hasta la aprobación solo se conectan cuentas de prueba (la que usamos hoy, creada desde la app de
    desarrollador, no sirve para Embedded Signup)
- Lo que puede frenar a cada comercio:
  - Tiene que usar **WhatsApp Business** (no el común) y el número llevar unos **7+ días de uso** en esa app
  - Si el número ya estuvo en la API con otro proveedor, hay una espera antes de poder usar coexistencia
  - Cuenta de Facebook para la ventana de Meta; revisión del nombre visible; posible tarjeta en Meta
  - 24 h para sincronizar el historial (si no, repetir); según proveedores, abrir la app cada 14 días o se corta
  - Grupos no se sincronizan; listas de difusión quedan de solo lectura
- Lo técnico nuestro: Embedded Signup **v4** (la v2 deja de funcionar el 15/10/2026), token por canal cifrado,
  webhooks `history` / `smb_app_state_sync` / `smb_message_echoes`. Probar qué pasa si el dueño responde desde
  WhatsApp Web (los dispositivos vinculados "no soportados" no mandan webhook → el bot podría pisarlo)
- Plan B si Meta tarda: un proveedor que ya es socio de Meta (360dialog o similar) hace la Embedded Signup por
  nosotros. Va contra el "flujo propio sin terceros": decidirlo llegado el caso
- Pendiente de confirmar con un número argentino real: que la coexistencia esté habilitada en Argentina
