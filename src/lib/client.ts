import type { Mutation, Workspace } from "./types";
export async function loadWorkspace(): Promise<Workspace> {
  const res = await fetch("/api/workspace", { cache: "no-store" });
  const data = await res.json();
  if (!res.ok)
    throw Object.assign(new Error(data.error || "Tidak dapat memuat data."), {
      status: res.status,
    });
  return data;
}
export async function mutateWorkspace(mutation: Mutation): Promise<Workspace> {
  const res = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mutation),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Perubahan belum tersimpan.");
  return data;
}
export function exportCSV(filename: string, rows: (string | number)[][]) {
  const csv =
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((v) => {
            let s = String(v);
            if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
