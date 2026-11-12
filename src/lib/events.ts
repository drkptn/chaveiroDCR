/** Pré-seleciona um serviço no painel de contato (vindo de outras seções). */
export const SELECT_EVENT = "dcr:select-service";
export type ContactOptionId = "copia" | "fechadura" | "abertura" | "automotiva" | "instalacao" | "outra";
export function preselect(id: ContactOptionId) {
  window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: id }));
}
