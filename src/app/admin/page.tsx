import { Suspense } from "react";
import { Dashboard } from "@/components/app/dashboard";
export default function Page() {
  return (
    <Suspense fallback={<p>Menyiapkan ruang admin…</p>}>
      <Dashboard admin />
    </Suspense>
  );
}
