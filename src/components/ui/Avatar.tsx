/**
 * Foto de uma pessoa, com as iniciais como reserva.
 *
 * A maioria das contas não tem foto cadastrada, e um ícone genérico repetido
 * numa fileira não distingue ninguém — as iniciais, sim.
 */
export default function Avatar({
  nome,
  email,
  url,
  tamanho = 36,
  className = "",
}: {
  nome?: string | null;
  email?: string | null;
  url?: string | null;
  tamanho?: number;
  className?: string;
}) {
  const rotulo = nome?.trim() || email?.trim() || "?";
  const iniciais = rotulo
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      style={{ width: tamanho, height: tamanho, fontSize: Math.max(10, tamanho * 0.34) }}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary-soft)] font-bold text-[var(--primary-strong)] ${className}`}
    >
      {url ? (
        // next/image exigiria liberar o domínio do Storage em next.config; a
        // foto já é gravada em baixa resolução no upload.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        iniciais
      )}
    </span>
  );
}
