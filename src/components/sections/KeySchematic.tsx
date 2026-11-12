import type { KeyModel } from "@/config/keys";
import styles from "./KeyUniverse.module.css";

/**
 * Esquema técnico (vista lateral / seção) de cada tipo de chave, com cotas.
 * Desenho vetorial simples, em traço de prancheta.
 */
export function KeySchematic({ id }: { id: KeyModel }) {
  return (
    <svg className={styles.schematic} viewBox="0 0 340 150" role="img" aria-label="Esquema técnico simplificado">
      <defs>
        <marker id="arw" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 1 7 4 0 7Z" fill="currentColor" />
        </marker>
      </defs>
      <g className={styles.draw}>{drawing(id)}</g>
    </svg>
  );
}

const dim = (x1: number, y1: number, x2: number, y2: number, label: string, lx: number, ly: number) => (
  <g className={styles.dim}>
    <line x1={x1} y1={y1} x2={x2} y2={y2} markerStart="url(#arw)" markerEnd="url(#arw)" />
    <text x={lx} y={ly}>{label}</text>
  </g>
);

function bitting(x0: number, x1: number, y: number, cuts: number[], depth = 9) {
  const step = (x1 - x0) / (cuts.length + 1);
  let d = `M${x0} ${y}`;
  cuts.forEach((c, i) => {
    const cx = x0 + step * (i + 1);
    d += ` L${cx - 7} ${y} L${cx - 2} ${y + c * depth} L${cx + 2} ${y + c * depth} L${cx + 7} ${y}`;
  });
  return `${d} L${x1} ${y}`;
}

function flat(kind: "cuts" | "dimples" | "track" | "head" | "double", head: "round" | "square" | "plastic" = "round") {
  const bladeTop = 58;
  const bladeBot = 92;
  return (
    <>
      {head === "round" && <circle cx="62" cy="75" r="38" />}
      {head === "square" && <rect x="24" y="40" width="74" height="70" rx="14" />}
      {head === "plastic" && <rect x="16" y="42" width="86" height="66" rx="26" className={styles.fill} />}
      {head !== "plastic" && <circle cx="48" cy="75" r="10" />}
      <path d={`M100 ${bladeTop - 6} V${bladeTop}`} />
      {kind === "cuts" || kind === "double" ? <path d={bitting(108, 282, bladeTop, [0.6, 0.2, 1, 0.4, 0.8])} /> : <path d={`M108 ${bladeTop} H282`} />}
      {kind === "double" ? <path d={bitting(108, 282, bladeBot, [-0.5, -0.9, -0.3, -0.7, -0.2])} /> : <path d={`M108 ${bladeBot} H290`} />}
      <path d={`M100 ${bladeBot + 6} V${bladeBot} H108 M100 ${bladeTop} H108`} />
      <path d={`M282 ${bladeTop} L304 ${(bladeTop + bladeBot) / 2} L290 ${bladeBot}`} />
      {kind === "cuts" && <path d={`M116 ${bladeTop + 16} H272`} className={styles.thin} />}
      {kind === "dimples" &&
        [130, 158, 186, 214, 242, 268].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 70 : 80} r={i % 3 === 0 ? 6 : 4.5} />)}
      {(kind === "track" || kind === "head") && <path d="M116 75 C140 58 160 92 186 75 S232 58 258 75 S284 88 292 78" className={styles.thin} />}
      {dim(24, 128, 304, 128, "L", 160, 142)}
      {dim(318, bladeTop, 318, bladeBot, "H", 324, 79)}
    </>
  );
}

function drawing(id: KeyModel) {
  switch (id) {
    case "yale":
      return flat("cuts");
    case "padlock":
      return flat("cuts", "round");
    case "transponder":
      return (
        <>
          {flat("cuts", "plastic")}
          <rect x="44" y="68" width="30" height="14" rx="7" className={styles.accent} />
        </>
      );
    case "dimple":
      return flat("dimples", "square");
    case "track":
      return flat("track", "square");
    case "auto":
      return flat("head", "plastic");
    case "highsec":
      return (
        <>
          {flat("double", "square")}
          <rect x="196" y="70" width="34" height="10" className={styles.accent} />
        </>
      );
    case "tetra":
      return (
        <>
          <g transform="translate(76 75)">
            <path d="M-6 -46 H6 V-6 H46 V6 H6 V46 H-6 V6 H-46 V-6 H-6Z" />
            <path d="M-6 -46 v8 M6 -46 v6 M46 -6 h-6 M46 6 h-9 M6 46 v-7 M-6 46 v-5 M-46 6 h7 M-46 -6 h5" className={styles.thin} />
          </g>
          {dim(30, 132, 122, 132, "Ø", 72, 146)}
          <path d={bitting(160, 300, 60, [0.5, 0.2, 0.8, 0.3, 0.6], 8)} />
          <path d="M160 90 H300 L316 75 L300 60" />
          <path d="M160 75 H300" className={styles.thin} />
          <text x="160" y="40" className={styles.note}>
            4 lâminas · seção em cruz
          </text>
        </>
      );
    case "gorje":
    case "safe":
      return (
        <>
          <circle cx="50" cy="70" r="30" />
          <circle cx="50" cy="70" r="20" />
          {id === "safe" && <path d="M30 70 H70" />}
          <path d="M80 64 H272 M80 76 H272" />
          <path d="M240 76 V110 H252 V100 H260 V112 H272 V76" />
          {id === "safe" && <path d="M240 64 V30 H250 V42 H260 V34 H272 V64" />}
          <path d="M272 60 H280 V80 H272" />
          {dim(20, 132, 280, 132, "L", 146, 146)}
          {dim(296, 76, 296, 112, "paleta", 302, 98)}
        </>
      );
    case "tubular":
      return (
        <>
          <g transform="translate(78 75)">
            <circle r="44" />
            <circle r="30" />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
              const a = (i / 7) * Math.PI * 2;
              const d = [8, 3, 12, 6, 10, 4, 9][i];
              return <rect key={i} x={-4} y={-44} width="8" height={d} transform={`rotate(${(a * 180) / Math.PI})`} className={styles.accent} />;
            })}
            <circle r="2" />
          </g>
          {dim(34, 134, 122, 134, "Ø", 74, 148)}
          <path d="M170 50 H290 V100 H170 Z" />
          <path d="M170 60 H290 M170 90 H290" className={styles.thin} />
          <path d="M290 50 v-6 h-12 v6 M290 100 v8 h-14 v-8" />
          <text x="170" y="36" className={styles.note}>
            pinos em círculo
          </text>
        </>
      );
    case "flip":
      return (
        <>
          <rect x="20" y="44" width="120" height="62" rx="28" className={styles.fill} />
          <circle cx="54" cy="75" r="8" />
          <circle cx="80" cy="75" r="8" />
          <circle cx="106" cy="75" r="8" />
          <circle cx="140" cy="75" r="12" />
          <path d="M150 68 H300 L316 75 L300 82 H150" />
          <path d="M160 75 C190 66 210 84 240 75 S280 68 300 75" className={styles.thin} />
          <path d="M140 75 m0 -64 a64 64 0 0 1 64 64" className={styles.dash} />
          <text x="196" y="30" className={styles.note}>
            giro da lâmina 180°
          </text>
          {dim(20, 128, 316, 128, "L", 160, 142)}
        </>
      );
  }
}
