import { NextResponse } from "next/server";
import { z } from "zod";
import { jobs } from "@/lib/db/jobs";
import { notHumans } from "@/lib/db/nothumans";
import { withUser } from "@/lib/db/route";
import { JobContentSchema, JobNameSchema } from "@/lib/job/schema";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ base: z.number().int().min(1), name: JobNameSchema, content: JobContentSchema });
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withUser(async () => {
    if (!z.uuid().safeParse(id).success) return notFound();
    const job = await jobs().get(id);
    return job ? NextResponse.json(job) : notFound();
  });
}

/** Guarda los cambios como versión nueva. Si otro guardó mientras tanto → 409 (no se pisa). */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (user) => {
    if (!z.uuid().safeParse(id).success) return notFound();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "bad_request", detail: parsed.error.message }, { status: 400 });
    const { base, name, content } = parsed.data;
    if (!(await jobs().get(id))) return notFound();
    const job = await jobs().save(id, base, name, content, user);
    return job ? NextResponse.json(job) : NextResponse.json({ error: "conflict" }, { status: 409 });
  });
}

/** Borra el puesto; los notHumans que trabajaban ahí quedan sin puesto. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withUser(async () => {
    if (!z.uuid().safeParse(id).success) return notFound();
    await jobs().remove(id);
    // En Supabase la base ya los deja sin puesto (on delete set null); en memoria lo hacemos a mano.
    for (const nh of await notHumans().list()) if (nh.jobId === id) await notHumans().setJob(nh.id, null);
    return NextResponse.json({ ok: true });
  });
}
