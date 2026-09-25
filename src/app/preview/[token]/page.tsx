import type { Metadata } from "next";
import InvitationLoader from "@/components/invitation/InvitationLoader";

export const metadata: Metadata = {
  title: "Pratinjau Undangan | Tamuara",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InvitationLoader key={token} previewToken={token} />;
}
