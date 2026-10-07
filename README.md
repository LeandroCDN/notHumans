# notHumans

Personas de IA que hablan como humanos. Esta es la v0.0.0.0.0.01: una web para probar el modelo.

## Correrlo

```bash
npm install
cp .env.example .env.local   # completá AUTH_SECRET, AUTH_USERS y DEEPSEEK_API_KEY
npm run dev
```

| Variable | Para qué |
|---|---|
| `AUTH_SECRET` | String largo y random (`openssl rand -hex 32`) |
| `AUTH_USERS` | Cuentas fijas (de antes de Google), `usuario:contraseña` separadas por coma. Arrancan en Pro |
| `ADMINS` | Mails de Google o cuentas fijas que son admin. Sin esto, la primera de `AUTH_USERS` |
| `AUTH_GOOGLE=1` | Muestra "Seguir con Google" (Supabase Auth). Prenderlo con el proveedor ya configurado |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key de Supabase, para el login con Google |
| `DEEPSEEK_API_KEY` | Key de DeepSeek para generar notHumans |
| `DEEPSEEK_MODEL` | Opcional: modelo de la generación (default `deepseek-flash`) |
| `SUPABASE_URL` | URL del proyecto de Supabase |
| `SUPABASE_SECRET_KEY` | Secret key de Supabase (solo server). Sin Supabase, en desarrollo se guarda en memoria |
| `GROQ_API_KEY` | Key de Groq para transcribir notas de voz (Whisper) |
| `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | WhatsApp (Cloud API de Meta). Sin token, en desarrollo se simula |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | El robot que lee las planillas de stock (cuenta de servicio de Google). Sin esto, en desarrollo hay planillas de mentira |
| `LLM_MOCK=1` | Opcional: respuestas simuladas para desarrollar sin key |

## Cómo funciona

1. **Crear:** subís exports de WhatsApp (o probás con los sets de `public/samples/`). El parser arma conversaciones y turnos en el navegador. Si el `.zip` se exportó con archivos, las notas de voz se transcriben con Groq Whisper (`/api/transcribe`) y entran a las conversaciones marcadas con 🎤.
2. **Generar:** las conversaciones van a DeepSeek por bloques (`/api/generate/extract`): salen ejemplos con marcadores (`{price}`, `{product}`…) y notas de estilo. Después `/api/generate/profile` arma el perfil.
3. **Explorar:** los notHumans se guardan en Supabase (`/api/nothumans`, migraciones en `supabase/migrations/`) con versiones; se pueden descargar e importar como JSON.
4. **notHumans** (`/app/explore`): la lista, el chat de prueba (test drive) y el perfil en una sola vista, con pestañas Chat / Perfil / Puesto. **Test drive**: chateás como cliente con un notHuman. Elegís notHuman y modelo (Flash / V4 Pro, con o sin thinking) y ves tokens, caché y costo de cada respuesta. El prompt es fijo por notHuman (perfil + ejemplos canónicos) para que DeepSeek lo sirva desde caché; los modelos y precios están en `lib/llm/models.ts`.
5. **Corregir y versionar:** en el test drive, "✎ corregir" una respuesta y "Guardar como vN" crea una versión nueva con esas correcciones como ejemplos fijos. El perfil muestra el historial y permite volver a una versión anterior.

6. **Link público:** desde el perfil, "Crear link público" da un `/c/<token>` para que cualquiera chatee con el notHuman sin cuenta (con tope de respuestas por link y de mensajes por minuto). Se puede desactivar.

7. **Puestos** (`/app/jobs`): dónde trabaja un notHuman. "Contame el laburo" (texto o audio) y la IA lo ordena en negocio, reglas, horario y cuándo pasar a una persona; el "manual del empleado" muestra lo que va a leer. Se asigna desde notHumans (pestaña Puesto) y el chat y el link público contestan con esas reglas.

8. **Cuentas y planes:** cualquiera entra con Google (Supabase Auth, `/auth/google` → `/auth/callback`) y arranca
   en **Free**: ve la app pero no usa IA. El plan (`lib/plans.ts`: Free, Pro, Business, Admin) define topes por mes
   (generaciones, respuestas, minutos de audio) y cantidades (notHumans, puestos). Cada llamada a la IA reserva cupo
   antes (`charge` en `lib/account.ts`, función `consume_usage` en la base) y anota lo que costó en `usage`; si
   falla, se devuelve. El admin asigna planes a mano en `/app/admin` (todavía no hay cobros). Cada cuenta ve solo
   lo suyo.

9. **WhatsApp** (`/app/whatsapp`): conectás un número (Phone Number ID de Meta) y elegís qué notHuman atiende y en
   qué modo: borrador (sugiere y aprobás), fuera de horario, automático o apagado. Meta avisa a `/api/wa/webhook`
   (firma verificada); se espera unos segundos por si el cliente manda más y se responde con la misma persona +
   puesto del test drive, de a una burbuja. Bandeja con las charlas: aprobar/corregir/descartar borradores, tomar
   la charla y escribir vos, pedir una sugerencia. Las notas de voz se transcriben. Sin Meta hay un simulador.

10. **Stock** (pestaña Stock del puesto): el dueño le comparte su planilla de Google al robot (Lector) y pega el link.
    No hay plantilla: la IA propone cómo entenderla (qué pestañas usar, fila de títulos, qué es cada columna y qué es
    privado) y el dueño lo revisa. Se guarda una copia solo con lo visible (`stock_sources`), se relee cada 5 minutos
    cuando hace falta y el notHuman responde con esos datos (test drive, link público y WhatsApp).

11. **Planes** (`/pricing`, público, y pestaña Planes en la app): Free, Pro y Business al costo + 5 %. El cálculo
    está en `lib/pricing.ts` (costo de usar todo el cupo con los precios de `lib/llm/models.ts`, infra repartida y
    comisión del cobro); el tope de gasto en IA de cada plan es lo que cubre el precio.

## Ventas

Cómo pensamos venderlo (piloto, pymes, partners, precios, proveedores, privacidad): [`VENTAS.md`](VENTAS.md).

## Tests

```bash
npm test
```

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Motion · zod · DeepSeek
