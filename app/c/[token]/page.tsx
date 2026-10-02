import type { Metadata } from "next";
import { Backdrop } from "@/components/backdrop";
import { PublicChat, PublicMissing } from "@/components/chat/public-chat";
import { notHumans } from "@/lib/db/nothumans";
import { shares } from "@/lib/db/shares";

// Link público para chatear con un notHuman: no pide login. Solo se muestra el nombre y sus emojis;
// el resto de la persona se queda en el server.

type Props = { params: Promise<{ token: string }> };

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

async function load(token: string) {
  if (!TOKEN.test(token)) return null;
  try {
    const share = await shares().find(token);
    return share ? await notHumans().get(share.nothumanId) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const nh = await load((await params).token);
  // Que no aparezca en buscadores: es un link para compartir a mano.
  return { title: nh ? `${nh.name} · notHumans` : "notHumans", robots: { index: false, follow: false } };
}

export default async function PublicChatPage({ params }: Props) {
  const { token } = await params;
  const nh = await load(token);
  return (
    <>
      <Backdrop />
      {nh ? <PublicChat token={token} name={nh.name} emojis={nh.profile.emojis.favorites.slice(0, 3)} /> : <PublicMissing />}
    </>
  );
}
