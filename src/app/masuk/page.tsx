import { AuthForm } from "@/components/app/auth-form";
import { backendMode } from "@/lib/server/backend-config";
export const dynamic = "force-dynamic";
export default function Page() {
  return <AuthForm mode={backendMode()} />;
}
