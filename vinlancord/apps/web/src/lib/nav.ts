/** Navegação fora de componentes React (preenchida pelo NavigationBridge). */
let navigateFn: ((to: string) => void) | null = null;

export function setNavigate(fn: (to: string) => void) {
  navigateFn = fn;
}

export function nav(to: string) {
  if (navigateFn) navigateFn(to);
  else location.hash = '#' + to;
}
