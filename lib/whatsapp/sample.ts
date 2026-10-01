import type { ChatFile } from "./files";

// Exports inventados (uno de Android y otro de iOS por idioma) para probar el flujo sin chats reales.
// En español la dueña es "Martina"; en inglés, "Emma". Las dos venden ropa por WhatsApp.

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

const NNBSP = "\u202f";

const ANDROID_EN = `2/3/24, 10:12${NNBSP}AM - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
2/3/24, 10:12${NNBSP}AM - Olivia: Hi! saw the black jacket on your story
2/3/24, 10:12${NNBSP}AM - Olivia: do you have it in M?
2/3/24, 10:15${NNBSP}AM - Emma: Hiii Olivia 🙌
2/3/24, 10:15${NNBSP}AM - Emma: Yes! I've got one left in M
2/3/24, 10:16${NNBSP}AM - Emma: Want me to hold it for you till tomorrow?
2/3/24, 10:18${NNBSP}AM - Olivia: yes please!! how much?
2/3/24, 10:19${NNBSP}AM - Emma: $48, and 10% off if you pay by bank transfer 😉
2/3/24, 10:21${NNBSP}AM - Olivia: perfect, I'll send it this afternoon
2/3/24, 10:22${NNBSP}AM - Emma: Amazing, any questions just text me 💛
2/5/24, 6:40${NNBSP}PM - Olivia: hiii it arrived, love it
2/5/24, 6:40${NNBSP}PM - Olivia: <Media omitted>
2/5/24, 6:52${NNBSP}PM - Emma: Omg it looks so good on you!! 😍
2/5/24, 6:52${NNBSP}PM - Emma: Thanks for the pic, you made my day haha`;

const IOS_EN = `[3/14/24, 9:05:10${NNBSP}AM] Ben: Hey, do you ship to Austin?
[3/14/24, 9:20:44${NNBSP}AM] Emma: Hey Ben! Yep, it gets there in 2 days 📦
[3/14/24, 9:21:02${NNBSP}AM] Emma: Shipping is $5, or free over $60
[3/14/24, 9:25:13${NNBSP}AM] Ben: and if it doesn't fit?
[3/14/24, 9:26:40${NNBSP}AM] Emma: No worries, you've got 30 days to swap it. No questions asked 😉
[3/14/24, 9:27:01${NNBSP}AM] Ben: great, I want the grey hoodie in L
[3/14/24, 9:28:15${NNBSP}AM] Emma: Ugh, the grey one in L is sold out 😕
[3/14/24, 9:28:30${NNBSP}AM] Emma: But I have it in olive green and it's so nice
[3/14/24, 9:28:31${NNBSP}AM] Emma: \u200eimage omitted
[3/14/24, 9:31:50${NNBSP}AM] Ben: ooh I like it, let's do that one
[3/14/24, 9:32:05${NNBSP}AM] Emma: Awesome!! Sending you the payment link 🙌`;

export const SAMPLE_CHATS_EN: ChatFile[] = [
  { name: "WhatsApp Chat with Olivia.txt", text: ANDROID_EN },
  { name: "WhatsApp Chat - Ben.zip", text: IOS_EN },
];
