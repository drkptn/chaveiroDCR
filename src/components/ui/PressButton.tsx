"use client";

import type { ReactNode, MouseEventHandler } from "react";
import { IconKeyTurn } from "./Icons";
import styles from "./PressButton.module.css";

type Props = {
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  children: ReactNode;
  variant?: "chrome" | "steel" | "ghost";
  size?: "md" | "lg";
  icon?: ReactNode | false;
  external?: boolean;
  className?: string;
  ariaLabel?: string;
  type?: "button" | "submit";
  disabled?: boolean;
};

/**
 * Botão de pressão mecânico: capa cromada com chanfro, reflexo guiado pela lanterna
 * e uma chave que entra no buraco e gira no hover. Afunda ao clicar.
 */
export function PressButton({ href, onClick, children, variant = "chrome", size = "md", icon, external, className, ariaLabel, type = "button", disabled }: Props) {
  const cls = `${styles.btn} ${styles[variant]} ${styles[size]} ${className ?? ""}`;
  const inner = (
    <span className={styles.frame}>
      <span className={styles.cap}>
        <span className={styles.label}>{children}</span>
        {icon !== false && <span className={styles.icon}>{icon ?? <IconKeyTurn />}</span>}
      </span>
    </span>
  );
  if (href) {
    return (
      <a
        href={href}
        className={cls}
        onClick={onClick}
        aria-label={ariaLabel}
        data-cursor="key"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {inner}
      </a>
    );
  }
  return (
    <button type={type} className={cls} onClick={onClick} aria-label={ariaLabel} data-cursor="key" disabled={disabled}>
      {inner}
    </button>
  );
}
