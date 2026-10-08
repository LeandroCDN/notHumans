# notHumans — contexto para Claude

Plataforma para crear "personas" de IA (notHumans) que escriben como una persona real, a partir de sus chats
de WhatsApp, y que atienden a los clientes de un negocio (puesto + número de WhatsApp). Está en beta: cuentas
abiertas con planes, precios al costo y lista de espera; todavía sin clientes que paguen. El primer piloto es el
negocio de un amigo del dueño. Estrategia comercial en `VENTAS.md`; pendientes en `TODO.md`.

## Cómo trabajar acá
- Hablar con el usuario en español rioplatense (voseo). Comentarios de código en español.
- Pushear directo a `main` (pedido explícito del usuario: nada de PRs). También mantener la rama de la sesión al día.
- Antes de pushear: `npx tsc --noEmit`, `npm test` y `npm run build`. Las pruebas en el navegador las hace el
  usuario (pedido explícito): no correr Playwright; al terminar, decirle qué probar.
- La web tiene que ser linda y sorprendente (Motion para animaciones). Todo texto de UI va en
  `lib/i18n/dictionaries.ts` en inglés (default) y español.
- La red del contenedor de Claude bloquea DeepSeek, Groq, Vercel y Supabase: para probar sin key, `LLM_MOCK=1`
  (guarda en memoria). La base se maneja con el conector de Supabase.

## Decisiones tomadas
- notHumans empezó como capa de personalidad pura; ahora suma el puesto (reglas) y WhatsApp con **flujo propio**
  (Cloud API oficial, sin n8n ni plataformas de terceros en el medio; etapa A hecha), y va a sumar el stock
  (Google Sheets compartido con un robot, solo lectura). Plan en `TODO.md`.
- Para vender: directo a pymes (SaaS), armado a medida, y por plataformas de chatbots y agencias vía la API
  `/api/v1/reply` (pendiente). Proveedores de IA por nivel (Económico / Privacidad / Premium). Ver `VENTAS.md`.
- Personalidad separada de los datos: los ejemplos guardan marcadores (`{price}`, `{product}`…) en vez de
  datos concretos, para que la persona sea reutilizable. `findLeak` descarta ejemplos con datos sueltos.
- Cuentas (`lib/auth.ts`, `lib/db/profiles.ts`): se entra con Google vía Supabase Auth (PKCE a mano en
  `lib/oauth.ts`, `/auth/google` → `/auth/callback`; solo se usa para saber quién es) o con las cuentas fijas de
  `AUTH_USERS` (de antes; pueden vincular Google). La sesión es nuestra: cookie firmada con HMAC con el id del perfil.
  Google se muestra con `AUTH_GOOGLE=1`; sin Supabase (desarrollo / `LLM_MOCK=1`) "Seguir con Google" crea una
  cuenta de prueba (`/auth/google?as=mail`). Admin: `ADMINS` (mails o cuentas fijas) o la primera de `AUTH_USERS`.
- La cuenta es abierta; el **plan** controla el acceso al modelo (`lib/plans.ts`: Free sin IA, Pro, Business, Admin;
  topes en código). Todo lo que gasta IA pasa por `charge`/`metered` (`lib/account.ts`): reserva cupo con la función
  `consume_usage` (atómica) antes de llamar y anota costo/tokens en `usage` después; si falla, se devuelve. Una
  generación descuenta al empezar (`/api/generate/start` da un ticket firmado que piden extract/profile; si falla
  antes del perfil, `/api/generate/cancel` la devuelve). El link público descuenta del dueño. Sin cupo → 402
  `{error:"limit", kind}`. Planes a mano en `/app/admin` (sin cobros todavía). En el navegador: `useMe()` (`lib/me.ts`).
  Precios al costo + 5 % (`lib/pricing.ts`, página pública `/pricing` y pestaña `/app/pricing`): el precio cubre el
  tope de gasto en IA del plan (`costCapUsd` = usar todo el cupo, redondeado), la infra repartida y la comisión del cobro.
- Cada cuenta ve solo lo suyo: notHumans y puestos tienen `user_id` y todos los métodos de los repos lo piden
  (`getAny` solo para el link público). Seguimos con RLS sin políticas: el navegador nunca habla con la base.
- Proveedor de IA: DeepSeek (el usuario no pudo pagar Anthropic). Interfaz en `lib/llm/` para sumar otros.
  Modelos actuales: `deepseek-flash` y `deepseek-v4-pro`; el modo thinking viene prendido por defecto y lo apagamos
  salvo que se elija una opción "thinking".
- La generación la orquesta el navegador (un request corto por bloque) para no depender de colas.
- Notas de voz: del `.zip` "con archivos" se sacan solo los audios (`lib/whatsapp/voice.ts`); se transcriben de a
  uno con Groq Whisper (`/api/transcribe`, `GROQ_API_KEY`, `lib/stt/`) y entran como texto con prefijo 🎤.
  El prompt de extracción los usa para notas de estilo pero nunca como respuesta de ejemplo (el notHuman escribe).
  Groq cobra mínimo 10 s por audio; el plan gratis tiene topes de audio por hora/día (429 → se espera y se sigue).
- Los notHumans se guardan en Supabase (proyecto "NotHuman", ref `fkrfqburxpqtafytnkoy`): tablas `nothumans` +
  `nothuman_versions` y la vista `nothumans_current`. Solo accede el server con `SUPABASE_SECRET_KEY`; RLS sin
  políticas y sin permisos para `anon`/`authenticated`. Migraciones en `supabase/migrations/` (aplicarlas con el
  conector de Supabase). Sin Supabase configurado, en desarrollo (o con `LLM_MOCK=1`) se guarda en memoria.
- Link público `/c/<token>` (sin login): tabla `nothuman_shares` (token aleatorio de 24 bytes, uno activo por
  notHuman, tope de respuestas `max_replies` que suma la función `use_share` de forma atómica). La persona la arma
  el server desde la base (`lib/nothuman/persona.ts` + `replyAs` en `lib/nothuman/reply.ts`, igual que el test
  drive); al público solo le llegan los mensajes. Además: 12 mensajes por minuto por IP (en memoria), charla de
  hasta 40 turnos. Se crea/copia/desactiva desde el perfil del notHuman.
- La mecánica del chat (espera por varios mensajes, burbujas de a una, cola) está en
  `components/chat/use-conversation.ts`, compartida entre el test drive y el link público.
- Recorrido guiado para el primer notHuman (`/app/start`, `components/start/start-view.tsx`): "contratar a un
  empleado" en 5 pasos (cómo habla · tu negocio · tus productos · probalo · a atender) que crea lo mismo que la app
  (notHuman, puesto, stock, link). La generación arranca al pasar del paso 1 y corre mientras cuenta el negocio;
  retoma con el notHuman y el puesto guardados en localStorage (`nh-start`). Se entra desde el inicio (banner si no
  tiene notHumans) y desde Crear.
- Secciones de la app: **Crear** (`/app/new`) · **notHumans** (`/app/explore`) · **Puestos** (`/app/jobs`).
  notHumans fusiona Explorar + test drive + perfil: lista a la izquierda (`explore-view.tsx`), chat en el centro y
  panel con pestañas Chat/Perfil/Puesto (`workspace.tsx`, `profile-side.tsx`); estado en la URL
  (`?nh=…&tab=chat|profile|job`). `/app/chat` y `/app/n/<id>` redirigen ahí.
- Puestos (`/app/jobs`, `lib/job/`, `components/job/`): **crear un puesto solo crea el puesto**; se le asigna a un
  notHuman desde notHumans (pestaña Puesto, guarda `nothumans.job_id`, no crea versión de la personalidad).
  Tablas `jobs` + `job_versions` + vista `jobs_current` (contenido en jsonb validado por `JobContentSchema`).
  "Contame el laburo" (texto o audio → `/api/transcribe`) → `/api/jobs/structure` lo ordena con IA en negocio,
  reglas (siempre/nunca/dato), horario semanal y pasar a una persona. `jobManual()` arma el "manual del empleado":
  con puesto reemplaza al negocio de los chats en el prompt, sus reglas mandan sobre el estilo, y la hora del
  negocio va pegada al último mensaje (`nowNote`, para no romper la caché). La respuesta trae `used` ("usó: …").
  El link público arma el puesto desde la base. Mockup: https://claude.ai/artifact/V7fHFE24RBU8c8mmFAPWw2
- WhatsApp (`/app/whatsapp`, `lib/wa/`, `components/wa/`, tablas `wa_channels` / `wa_conversations` /
  `wa_messages`): un canal = un número (Phone Number ID de Meta) que atiende un notHuman (con su puesto) en un modo
  (`draft` | `offhours` | `auto` | `off`). Meta → `/api/wa/webhook` (firma con `WHATSAPP_APP_SECRET`; el GET es el
  saludo con `WHATSAPP_VERIFY_TOKEN`) → se guarda el mensaje (idempotente por `wa_id`) y con `after()` se espera
  `WA_DEBOUNCE_MS` (4 s): si llegó otro mensaje responde ese; candado por charla (`generating_until`). La respuesta es
  `replyAs` como el test drive, descuenta del plan del dueño; en borrador queda para aprobar, si no sale de a una
  burbuja con "escribiendo…" (`lib/wa/cloud.ts`). El dueño puede tomar la charla (el bot se calla), escribir,
  aprobar/corregir/descartar borradores o pedir una sugerencia. Ventana de 24 h. Números AR/MX: se manda sin el 9/1.
  Plan: requiere `connections` (Business/Admin). Sin `WHATSAPP_TOKEN` en desarrollo o `LLM_MOCK=1` se simula
  (`/api/wa/simulate`, bandeja de salida en memoria). La bandeja pregunta cada ~3 s (no hay tiempo real).
  Para que Meta mande los mensajes reales hicieron falta tres cosas además del webhook: la app **publicada** (sin
  publicar solo llegan pruebas; pide URL de privacidad → `/privacy`), el campo `messages` suscripto, y la cuenta de
  WhatsApp Business suscripta a la app (`POST /{WABA_ID}/subscribed_apps`, desde el Explorador de la API Graph).
  Diagnóstico sin logs de Vercel: tabla `wa_webhook_log` (cada aviso: `ok` / `no_channel` / `bad_signature` / …).
- Stock (`lib/stock/`, `lib/google/sheets.ts`, `components/job/stock-panel.tsx`, tabla `stock_sources`, una por
  puesto): un solo robot (cuenta de servicio, `GOOGLE_SERVICE_ACCOUNT_JSON` en Vercel; JWT RS256 firmado a mano, sin
  librerías) que lee lo que cada cliente le comparte como Lector. La planilla tiene que ser de la cuenta de Google con
  la que entra (Drive `owners`; los admins pueden cualquiera). **Sin plantilla**: `/inspect` lee la planilla y la IA
  (tarea `stock_map`, cuenta como `structure`; si falla, `heuristicMap` por los títulos) propone el mapa: pestañas
  catálogo/info/no usar, fila de títulos y rol de cada columna (producto, código, precio, stock, dato, privado; ante
  la duda, privado). El dueño lo revisa (en un puesto nuevo se lee y revisa igual con `/api/stock/inspect` y queda "lista"; se conecta al guardar el puesto) y `PUT` guarda el mapa + la copia (`applyMap`: solo columnas visibles; lo
  privado no se guarda). Si cambian las columnas → `needs_review` y las nuevas no se usan. `stockForReply` relee si
  pasaron 5 min (espera hasta 4 s). En el prompt: si entra (≤14k caracteres) va entero en la parte fija (caché); si
  no, la info fija y las filas que coinciden con los últimos mensajes del cliente pegadas al último. Requiere plan
  con `connections`. Robot: `nothumans-stock@nothuman-510723.iam.gserviceaccount.com`. Planilla de prueba del usuario:
  "Motorbike Stock". Sin la clave (dev / `LLM_MOCK=1`) hay planillas de mentira (`lib/stock/fixtures.ts`).
- Política de privacidad pública en `/privacy` (EN/ES, textos en `legal` del diccionario; `#borrar` = cómo borrar
  datos; mail de `CONTACT_EMAIL`). Meta la pide para publicar la app: sin publicar, el webhook solo recibe pruebas.
- Lista de espera de la home: tabla `waitlist` (`/api/waitlist`, público, con trampa para bots y límite por IP).
- localStorage queda solo como respaldo: si falla el guardado, el notHuman queda ahí y Explorar ofrece subirlo.

## Estado y próximos pasos
1. ✅ Home, login, panel, i18n EN/ES
2. ✅ Parser de exports de WhatsApp (iOS/Android, es/en) + vista previa
3. ✅ Generación con DeepSeek: ejemplos con marcadores + perfil; Explorar y detalle
4. ✅ Test drive `/app/chat`: chat como cliente, selector de notHuman y de modelo, tokens/caché/costo por respuesta
   (modelos y precios en `lib/llm/models.ts`; el notHuman espera ~1,3 s por si el cliente manda varios mensajes)
5. ✅ Supabase: guardar notHumans (v1), subir los que había en localStorage, importar JSON
6. ✅ Corregir desde el chat: "✎ corregir" en el test drive → "Guardar como vN" crea una versión con esas
   respuestas como ejemplos fijos (`corrected: true`, van en su propia sección del prompt y pesan más).
   Historial de versiones en el perfil; "volver a esta" copia una vieja como versión nueva (nada se pisa).
   Guardado optimista: si la versión vigente cambió mientras tanto → 409 y se pide recargar.
7. ✅ Notas de voz: transcripción de audios del .zip con Groq Whisper
8. ✅ Link público para chatear con un notHuman sin cuenta
9. ✅ Sección notHumans: Explorar + test drive + perfil en una sola vista
10. ✅ Puestos, entrega 1: crear/editar (contame el laburo + audio, IA que ordena), asignar, chat y link con puesto
11. ✅ Cuentas con Google + planes (Free/Pro/Business/Admin) + consumo por mes + panel de admin
12. ✅ WhatsApp etapa A: webhook + canales + bandeja con borradores (probado con el número de prueba de Meta)
13. ✅ Stock desde Google Sheets (puestos, entrega 2): robot + mapa con IA que revisa el dueño + copia visible
14. ⏭️ WhatsApp etapa B (pasar a una persona automático); privacidad y Comunidad.
    Ver `TODO.md`
