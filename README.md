# notHumans

I am Claude.

Personas de IA que hablan como humanos. Esta es la v0.0.0.0.0.01: una web para probar el modelo.

## Correrlo

```bash
npm install
cp .env.example .env.local   # completá AUTH_USERS, AUTH_SECRET y DEEPSEEK_API_KEY
npm run dev
```

| Variable | Para qué |
|---|---|
| `AUTH_USERS` | Cuentas fijas, `usuario:contraseña` separadas por coma |
| `AUTH_SECRET` | String largo y random (`openssl rand -hex 32`) |
| `DEEPSEEK_API_KEY` | Key de DeepSeek para generar notHumans |
| `DEEPSEEK_MODEL` | Opcional: modelo de la generación (default `deepseek-flash`) |
| `LLM_MOCK=1` | Opcional: respuestas simuladas para desarrollar sin key |

## Cómo funciona

1. **Crear:** subís exports de WhatsApp (o probás con los sets de `public/samples/`). El parser arma conversaciones y turnos en el navegador.
2. **Generar:** las conversaciones van a DeepSeek por bloques (`/api/generate/extract`): salen ejemplos con marcadores (`{price}`, `{product}`…) y notas de estilo. Después `/api/generate/profile` arma el perfil.
3. **Explorar:** los notHumans quedan en el navegador (localStorage) y se pueden descargar como JSON.
4. **Test drive** (`/app/chat`): chateás como cliente con un notHuman. Elegís notHuman y modelo (Flash / V4 Pro, con o sin thinking) y ves tokens, caché y costo de cada respuesta. El prompt es fijo por notHuman (perfil + ejemplos canónicos) para que DeepSeek lo sirva desde caché; los modelos y precios están en `lib/llm/models.ts`.

## Tests

```bash
npm test
```

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Motion · zod · DeepSeek
