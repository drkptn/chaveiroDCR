/** Botão "voltar para a navegação" no topo do conteúdo (só aparece no celular). */
import { ArrowLeft } from 'lucide-react';
import { showNav, useMobile } from '../../lib/mobile';

export function MobileNavButton() {
  const mobile = useMobile((s) => s.mobile);
  if (!mobile) return null;
  return (
    <button onClick={showNav} aria-label="Voltar para canais e conversas" className="-ml-2 mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-fg-1 active:bg-bg-4">
      <ArrowLeft size={20} />
    </button>
  );
}
