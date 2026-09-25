import { PasswordRecovery } from "@/components/app/password-recovery";
import { backendMode } from "@/lib/server/backend-config";

export const dynamic = "force-dynamic";

export default function Page() {
  return <PasswordRecovery update enabled={backendMode() === "supabase"} />;
}
