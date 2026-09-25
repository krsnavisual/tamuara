import type { Metadata } from "next";
import InvitationLoader from "@/components/invitation/InvitationLoader";

export const metadata: Metadata = {
  title: "Undangan Pernikahan | Tamuara",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function PublicInvitationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <InvitationLoader key={slug} slug={slug} />;
}
