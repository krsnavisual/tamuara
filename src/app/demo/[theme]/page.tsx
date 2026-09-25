import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { THEMES } from "@/lib/catalog";
import { demoInvitation } from "@/lib/demo-content";
import InvitationView from "@/components/invitation/InvitationView";

export default async function DemoPage({
  params,
}: {
  params: Promise<{ theme: string }>;
}) {
  const { theme } = await params;
  const selected = THEMES.find((item) => item.id === theme);
  if (!selected) notFound();
  return (
    <div className="invitation-demo">
      <nav
        className="invitation-demo-toolbar"
        aria-label="Navigasi contoh tema"
      >
        <a href="/tema">
          <ArrowLeft size={13} /> Semua tema
        </a>
        <span>{selected.name}</span>
      </nav>
      <InvitationView data={demoInvitation(selected.id)} demo />
    </div>
  );
}
