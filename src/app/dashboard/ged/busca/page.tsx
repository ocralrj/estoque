import { redirect } from "next/navigation";

/**
 * A busca foi absorvida por /dashboard/ged/documentos, onde convive com os
 * filtros de cliente, setor, tipo e período. Esta rota permanece apenas para
 * não quebrar links salvos, repassando o termo digitado.
 */
export default function GedBuscaPage({
  searchParams,
}: {
  searchParams: { q?: string; setor?: string };
}) {
  const params = new URLSearchParams();
  if (searchParams.q) params.set("q", searchParams.q);
  if (searchParams.setor) params.set("setor", searchParams.setor);

  const query = params.toString();
  redirect(`/dashboard/ged/documentos${query ? `?${query}` : ""}`);
}
