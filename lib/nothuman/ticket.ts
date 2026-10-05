import "server-only";
import { sign, verifySigned } from "@/lib/auth";
import { usage } from "@/lib/db/usage";

// Una generación son muchos requests (uno por bloque + el perfil). Al empezar se descuenta una generación
// del plan y el navegador recibe un ticket firmado; cada paso tiene que mostrarlo. Dura 30 minutos y muere
// si la generación se devolvió (falló antes del perfil).

const TTL = 30 * 60 * 1000;

export function makeTicket(userId: string, usageId: number, now = Date.now()): string {
  const exp = now + TTL;
  return `${usageId}.${exp}.${sign(`gen:${userId}:${usageId}:${exp}`)}`;
}

/** El id de la generación si el ticket es de esta cuenta, no venció y la generación sigue en pie. */
export async function readTicket(ticket: string, userId: string, now = Date.now()): Promise<number | null> {
  const [id, exp, sig] = ticket.split(".");
  if (!id || !exp || !sig || !/^\d+$/.test(id) || !/^\d+$/.test(exp)) return null;
  if (Number(exp) < now || !verifySigned(`gen:${userId}:${id}:${exp}`, sig)) return null;
  return (await usage().exists(Number(id), userId, "generation")) ? Number(id) : null;
}
