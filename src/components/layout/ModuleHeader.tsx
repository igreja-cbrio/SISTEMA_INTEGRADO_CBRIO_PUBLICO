import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface ModuleHeaderProps {

  icon?: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;

  actions?: React.ReactNode;

  accent?: string;
  className?: string;
}







export function ModuleHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  accent = 'var(--teal)',
  className = '',
}: ModuleHeaderProps) {
  return (
    <div className={`module-header ${className}`}>
      <div className="module-header__left">
        {Icon && (
          <div
            className="module-header__icon"
            style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)` }}
          >
            <Icon style={{ width: 22, height: 22, color: accent }} />
          </div>
        )}
        <div className="module-header__text">
          <h1 className="module-header__title">{title}</h1>
          {subtitle && <p className="module-header__subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="module-header__actions">{actions}</div>}
    </div>
  );
}

export default ModuleHeader;
