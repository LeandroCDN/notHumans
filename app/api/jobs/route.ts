import { NextResponse } from "next/server";
import { z } from "zod";
import { jobs } from "@/lib/db/jobs";
import { withUser } from "@/lib/db/route";
import { JobContentSchema, JobNameSchema } from "@/lib/job/schema";

const Body = z.object({ name: JobNameSchema, content: JobContentSchema });

/** Todos los puestos. */
export async function GET() {
  return withUser(async () => NextResponse.json({ items: await jobs().list() }));
}

/** Crea un puesto (versión 1). */
export async function POST(req: Request) {
  return withUser(async (user) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "bad_request", detail: parsed.error.message }, { status: 400 });
    const job = await jobs().create(parsed.data.name, parsed.data.content, user);
    return NextResponse.json(job, { status: 201 });
  });
}
