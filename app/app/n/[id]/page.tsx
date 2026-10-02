import { redirect } from "next/navigation";

// El perfil ahora es una pestaña de la sección notHumans.
export default async function NotHumanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/explore?nh=${encodeURIComponent(id)}&tab=profile`);
}
