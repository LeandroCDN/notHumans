# Estado de notHumans (leer primero; actualizar al terminar cada sesión, máx. ~30 líneas)

**Qué es:** un vendedor de IA que habla como el dueño y atiende su WhatsApp (notHuman = personalidad,
puesto = negocio + reglas + stock, canal = número). Beta, sin clientes que paguen. Web: https://not-humans-beta.vercel.app

**Funciona en producción:** crear notHumans desde chats (+ recorrido guiado `/app/start`), chat de prueba y
versiones, link público, puestos, stock desde Google Sheets (planilla "Motorbike Stock"), WhatsApp con el número de
prueba de Meta (+1 555 632 2698, lo atiende notGon en automático), cuentas con Google, planes, `/pricing`,
`/privacy`, `/terms`.

**Objetivo ahora:** piloto real con Gonzalo (negocio de motos de un amigo). Medir antes/después para el caso de éxito.

**Próximo en código:**
1. Stock: en preguntas generales ("qué marcas tenés") llega la planilla incompleta; que no salude de nuevo en
   cada mensaje.
2. Pasar a una persona + avisarle al dueño por WhatsApp (plantilla de Meta).
3. Ping diario para que Supabase (plan gratis) no se pause.

**Pendiente del usuario:** dominio + mail en el dominio, monotributo, verificar el negocio en Meta (después: revisión
de la app para coexistencia con el número de Gonzalo), preguntarle a Gonzalo si usa WhatsApp Business, pasar la
ciudad para la línea legal, decidir precio beta / armado a medida / moneda.

**Fechas y avisos:**
- Token de WhatsApp (usuario del sistema "notHumans bot", portfolio NotHumans) vence ~6/12/2026.
- Supabase gratis se pausa tras días sin uso (pasó en noviembre; se restauró el 17/11/2026).

**Última sesión (17/11/2026):** Supabase restaurado; canal de WhatsApp verificado. Idea pendiente: usar Gemini /
Antigravity desde una sesión que corra en la compu del usuario (Remote Control) para el trabajo pesado.

Detalle técnico en `CLAUDE.md`, pendientes en `TODO.md`, negocio en `VENTAS.md`.
