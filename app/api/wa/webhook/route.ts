import { after } from "next/server";
import { processWebhook } from "@/lib/wa/bot";
import { mockWhatsApp, validSignature } from "@/lib/wa/cloud";

// El webhook que configuramos en Meta. GET: el saludo inicial (Meta manda un desafío y hay que devolverlo).
// POST: cada mensaje o cambio de estado. Hay que contestar 200 rápido; el trabajo sigue después (`after`).
export const maxDuration = 120;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (q.get("hub.mode") === "subscribe" && expected && q.get("hub.verify_token") === expected) {
    return new Response(q.get("hub.challenge") ?? "", { headers: { "content-type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  // Sin el secreto no hay forma de saber que el aviso es de Meta: en producción se rechaza.
  if (secret ? !validSignature(raw, req.headers.get("x-hub-signature-256"), secret) : !mockWhatsApp()) {
    return new Response("bad signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  after(() => processWebhook(body).catch((err) => console.error("WhatsApp webhook", err)));
  return new Response("ok");
}
