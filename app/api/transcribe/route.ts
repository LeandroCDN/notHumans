import { NextResponse } from "next/server";
import { LimitError, charge, limitResponse } from "@/lib/account";
import { getSessionUser } from "@/lib/auth";
import { sttCostUsd } from "@/lib/llm/models";
import { MissingSttKeyError, transcribe } from "@/lib/stt";

export const maxDuration = 60;

// Vercel corta los requests de más de ~4,5 MB; una nota de voz de WhatsApp pesa mucho menos.
const MAX_BYTES = 4 * 1024 * 1024;

/** Una nota de voz → texto. El navegador manda los audios de a uno (con algunos en paralelo). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "bad_request", detail: "falta el audio" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_big" }, { status: 413 });
  const name = String(form?.get("name") ?? "audio.ogg").slice(0, 200);
  const lang = form?.get("language");
  const language = lang === "es" || lang === "en" ? lang : undefined;

  // No sabemos cuánto dura hasta transcribirlo: se reserva un segundo (alcanza con que quede algo de cupo)
  // y después se anota la duración real.
  let reserved: Awaited<ReturnType<typeof charge>>;
  try {
    reserved = await charge(user, "audio");
  } catch (err) {
    if (err instanceof LimitError) return limitResponse(err);
    throw err;
  }
  try {
    const result = await transcribe(file, name, language);
    await reserved.done({ units: Math.max(1, result.seconds), costUsd: sttCostUsd(result.seconds) });
    return NextResponse.json(result);
  } catch (err) {
    await reserved.refund();
    if (err instanceof MissingSttKeyError) return NextResponse.json({ error: "missing_stt_key" }, { status: 500 });
    const status = (err as Error & { status?: number }).status;
    if (status === 429) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    console.error(err);
    return NextResponse.json({ error: "stt_error", detail: String((err as Error).message) }, { status: 502 });
  }
}
