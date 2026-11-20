/** Selos especiais ao lado do nome (ex.: "Lord of Freedom", o criador do Vinlancord). */
import { Crown } from 'lucide-react';
import { BADGES, type BadgeId } from '@vinlancord/shared';
import { useStore } from '../store';
import { Tooltip, cx } from './ui';

export function UserBadges({ userId, size = 'sm', className }: { userId: string; size?: 'sm' | 'md'; className?: string }) {
  const badges = useStore((s) => s.users[userId]?.badges);
  if (!badges?.length) return null;
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1', className)}>
      {badges
        .filter((b): b is BadgeId => b in BADGES)
        .map((b) => (
          <Tooltip key={b} label={BADGES[b].description}>
            <span className={cx('vl-badge-creator inline-flex items-center gap-1 rounded-full font-heading leading-none', size === 'sm' ? 'px-1.5 py-[3px] text-[11px]' : 'px-2.5 py-1 text-[13px]')}>
              <Crown size={size === 'sm' ? 11 : 14} className="shrink-0" aria-hidden />
              {BADGES[b].label}
            </span>
          </Tooltip>
        ))}
    </span>
  );
}
