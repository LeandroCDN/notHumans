import { robotEmail } from "@/lib/stock/service";
import { withStockUser } from "@/lib/stock/route";

/** El mail del robot (para un puesto nuevo, que todavía no tiene planilla). */
export async function GET() {
  return withStockUser(async () => ({ robot: robotEmail() }));
}
