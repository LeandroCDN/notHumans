# notHumans — contexto para Claude

Plataforma para crear "personas" de IA (notHumans) que escriben como una persona real, a partir de sus chats
de WhatsApp. Por ahora es una web para que el dueño del proyecto pruebe el modelo; no hay clientes.

## Cómo trabajar acá
- Hablar con el usuario en español rioplatense (voseo). Comentarios de código en español.
- Pushear directo a `main` (pedido explícito del usuario: nada de PRs). También mantener la rama de la sesión al día.
- Antes de pushear: `npx tsc --noEmit`, `npm test`, `npm run build`, y probar en el navegador con Playwright
  (Chromium en `/opt/pw-browsers/chromium`) cuando cambia la UI.
- La web tiene que ser linda y sorprendente (Motion para animaciones). Todo texto de UI va en
  `lib/i18n/dictionaries.ts` en inglés (default) y español.
- La red del contenedor de Claude bloquea DeepSeek, Groq, Vercel y Supabase: para probar sin key, `LLM_MOCK=1`
  (guarda en memoria). La base se maneja con el conector de Supabase.

## Decisiones tomadas
- notHumans es solo la capa de personalidad: no hay integración con WhatsApp ni base de conocimiento
  (los datos del negocio vienen de una fuente externa del cliente).
- Personalidad separada de los datos: los ejemplos guardan marcadores (`{price}`, `{product}`…) en vez de
  datos concretos, para que la persona sea reutilizable. `findLeak` descarta ejemplos con datos sueltos.
- Login con cuentas fijas desde `AUTH_USERS` (cookie firmada con HMAC). Sin sistema de usuarios.
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
9. ⏭️ El "puesto de trabajo" y lo demás de `TODO.md`
