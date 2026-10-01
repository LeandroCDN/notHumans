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
- La red del contenedor de Claude bloquea DeepSeek y Vercel: para probar sin key, `LLM_MOCK=1`.

## Decisiones tomadas
- notHumans es solo la capa de personalidad: no hay integración con WhatsApp ni base de conocimiento
  (los datos del negocio vienen de una fuente externa del cliente).
- Personalidad separada de los datos: los ejemplos guardan marcadores (`{price}`, `{product}`…) en vez de
  datos concretos, para que la persona sea reutilizable. `findLeak` descarta ejemplos con datos sueltos.
- Login con cuentas fijas desde `AUTH_USERS` (cookie firmada con HMAC). Sin sistema de usuarios.
- Proveedor de IA: DeepSeek (el usuario no pudo pagar Anthropic). Interfaz en `lib/llm/` para sumar otros.
- La generación la orquesta el navegador (un request corto por bloque) para no depender de colas.
- Por ahora los notHumans se guardan en localStorage (`lib/nothuman/store.ts`). Supabase viene después.

## Estado y próximos pasos
1. ✅ Home, login, panel, i18n EN/ES
2. ✅ Parser de exports de WhatsApp (iOS/Android, es/en) + vista previa
3. ✅ Generación con DeepSeek: ejemplos con marcadores + perfil; Explorar y detalle
4. ⏭️ Chat de prueba con un notHuman (selector de notHuman y de modelo, tokens/caché/costo por mensaje)
5. ⏭️ Supabase para guardar y versionar notHumans
