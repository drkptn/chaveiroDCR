import Link from "next/link";
import { Symbol } from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", textAlign: "center", padding: "40px 20px" }} className="blueprint">
      <div style={{ display: "grid", gap: 18, justifyItems: "center" }}>
        <Symbol size={72} />
        <p className="mono" style={{ color: "var(--ice)" }}>Erro 404 · chave não encontrada</p>
        <h1 className="display chrome" style={{ fontSize: "clamp(2.4rem, 8vw, 6rem)" }}>
          Esta porta não abre.
        </h1>
        <p style={{ color: "var(--text-2)", maxWidth: "40ch" }}>A página que você procurou não existe. Volte para o início e encontre o serviço certo.</p>
        <Link href="/" className="mono" style={{ padding: "14px 22px", border: "1px solid var(--line-2)", marginTop: 8 }}>
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
