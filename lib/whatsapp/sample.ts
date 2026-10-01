import type { ChatFile } from "./files";

// Dos exports inventados (uno de Android y otro de iOS) para probar el flujo sin chats reales.
// La dueña es "Martina", que vende ropa por WhatsApp.

const ANDROID = `03/02/24 10:12 - Los mensajes y las llamadas están cifrados de extremo a extremo. Nadie fuera de este chat, ni siquiera WhatsApp, puede leerlos ni escucharlos.
03/02/24 10:12 - Sofi: Hola! vi la campera negra en el estado
03/02/24 10:12 - Sofi: la tenés en M?
03/02/24 10:15 - Martina: Holaaa Sofi 🙌
03/02/24 10:15 - Martina: Sí! me queda una sola en M
03/02/24 10:16 - Martina: ¿Te la separo hasta mañana?
03/02/24 10:18 - Sofi: dale!! cuánto sale?
03/02/24 10:19 - Martina: $48.000, y si pagás por transferencia te hago 10% off 😉
03/02/24 10:21 - Sofi: genial, te transfiero a la tarde
03/02/24 10:21 - Martina: Buenísimo, te paso el alias: martina.ropa
03/02/24 10:22 - Martina: Cualquier cosa me escribís 💛
05/02/24 18:40 - Sofi: holaa, me llegó todo perfecto
05/02/24 18:40 - Sofi: <Multimedia omitido>
05/02/24 18:52 - Martina: Ayyy te queda divina!! 😍
05/02/24 18:52 - Martina: Gracias por la foto, me alegra el día jajaja
20/02/24 21:03 - Sofi: Martu, entró algo nuevo?
20/02/24 21:30 - Martina: Siii! mañana subo todo a las historias 🔥
20/02/24 21:30 - Martina: Te aviso primero a vos si querés
20/02/24 21:31 - Sofi: obvio jaja
20/02/24 21:31 - Martina: Jajaja dale 🙌`;

const IOS = `[14/03/24, 9:05:10] Lucas: Buenas, hacen envíos a Rosario?
[14/03/24, 9:20:44] Martina: Buenas Lucas! Sí, llega en 48hs por Andreani 📦
[14/03/24, 9:21:02] Martina: El envío sale $4.500, o gratis si superás los $60.000
[14/03/24, 9:25:13] Lucas: y si no me queda bien?
[14/03/24, 9:26:40] Martina: Tranqui, tenés 30 días para cambiarlo. Sin vueltas 😉
[14/03/24, 9:27:01] Lucas: buenísimo, quiero el buzo gris en L
[14/03/24, 9:28:15] Martina: Uh, el gris en L se me agotó 😕
[14/03/24, 9:28:30] Martina: Pero me queda en verde oliva, que está re lindo
[14/03/24, 9:28:31] Martina: ‎imagen omitida
[14/03/24, 9:31:50] Lucas: uhh me gusta, dale ese
[14/03/24, 9:32:05] Martina: Genial!! Te paso el link de pago 🙌
[02/04/24, 16:10:22] Lucas: hola! el buzo me quedó un poco grande
[02/04/24, 16:10:40] Lucas: se puede cambiar por M?
[02/04/24, 16:45:03] Martina: Holaa! Sí, obvio 🙌
[02/04/24, 16:45:20] Martina: Mandámelo por Andreani con el mismo código y te despacho el M apenas llegue
[02/04/24, 16:46:00] Lucas: perfecto, gracias!!
[02/04/24, 16:46:30] Martina: A vos! Cualquier cosa me escribís 💛`;

export const SAMPLE_CHATS: ChatFile[] = [
  { name: "Chat de WhatsApp con Sofi.txt", text: ANDROID },
  { name: "WhatsApp Chat - Lucas.zip", text: IOS },
];
