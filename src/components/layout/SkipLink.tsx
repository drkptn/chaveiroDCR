"use client";

import { goTo } from "./Navbar";

/** Atalho de teclado para pular o hero (leva ao fim do portal, com o conteúdo visível). */
export function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#servicos"
      onClick={(e) => {
        e.preventDefault();
        goTo("servicos");
        window.setTimeout(() => document.getElementById("servicos-title")?.focus({ preventScroll: true }), 50);
      }}
    >
      Pular para o conteúdo
    </a>
  );
}
