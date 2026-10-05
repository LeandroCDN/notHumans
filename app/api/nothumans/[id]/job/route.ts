import { NextResponse } from "next/server";
import { z } from "zod";
import { jobs } from "@/lib/db/jobs";
import { notHumans } from "@/lib/db/nothumans";
import { withUser } from "@/lib/db/route";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ jobId: z.uuid().nullable() });

/** Asigna un puesto al notHuman (o lo deja sin puesto). No crea una versión nueva de la personalidad. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (user) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !parsed.success) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const { jobId } = parsed.data;
    if (jobId && !(await jobs().get(jobId, user.id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!(await notHumans().setJob(id, user.id, jobId))) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ jobId });
  });
}
