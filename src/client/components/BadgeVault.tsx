import { COLLECTIBLE_BADGES } from '../../shared/index.js';

interface BadgeVaultProps {
  currentStreak: number;
  bestStreak: number;
  compact?: boolean;
}

export function BadgeVault({ currentStreak, bestStreak, compact = false }: BadgeVaultProps) {
  const effectiveBest = Math.max(currentStreak, bestStreak);

  return (
    <div
      className={compact ? 'kf-badge-vault kf-badge-vault--compact' : 'kf-badge-vault'}
      data-testid="pixel-badge-vault"
    >
      {COLLECTIBLE_BADGES.map((badge) => {
        const unlocked = effectiveBest >= badge.minDays;
        return (
          <div
            key={badge.id}
            data-testid={`pixel-badge-${badge.id}`}
            data-unlocked={unlocked ? 'true' : 'false'}
            className={
              unlocked ? 'kf-badge-tile kf-badge-tile--unlocked' : 'kf-badge-tile kf-badge-tile--locked'
            }
          >
            <img
              src={badge.artPath}
              alt={`${badge.title} retro pixel achievement badge`}
              className="kf-badge-img"
              width={compact ? 48 : 64}
              height={compact ? 48 : 64}
              loading="eager"
              decoding="sync"
            />
            <div className="kf-badge-copy">
              <span className="kf-badge-name">{badge.title}</span>
              <span className="kf-badge-tier tabular">
                {unlocked ? 'Unlocked' : `Day ${badge.minDays}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
