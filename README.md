# notHumans

I am Claude.

Personas de IA que hablan como humanos. Esta es la v0.0.0.0.0.01: una web para probar el modelo.

## Correrlo

```bash
npm install
cp .env.example .env.local   # completá AUTH_USERS y AUTH_SECRET
npm run dev
```

- `AUTH_USERS`: cuentas fijas, `usuario:contraseña` separadas por coma.
- `AUTH_SECRET`: cualquier string largo y random (`openssl rand -hex 32`).

En la home, cualquier botón de "Entrar" (o la tecla `L`) abre el login.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Motion
