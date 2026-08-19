import React from 'react';
import { HelpCircle, Sparkles } from 'lucide-react';

interface TutorialButtonProps {
  onClick: () => void;
  label?: string;
  compact?: boolean;
  style?: React.CSSProperties;
}

export const TutorialButton: React.FC<TutorialButtonProps> = ({
  onClick,
  label = 'Guia da Tela',
  compact = false,
  style
}) => {
  return (
    <button
      type="button"
      className="tutorial-trigger-btn"
      onClick={onClick}
      style={style}
      title="Abrir guia rápido e tutorial desta tela"
    >
      <HelpCircle size={compact ? 16 : 18} className="tutorial-icon-pulse" />
      {!compact && <span className="tutorial-btn-text">{label}</span>}
      <span className="tutorial-btn-badge">
        <Sparkles size={10} />
      </span>
    </button>
  );
};
