import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, ChevronRight, ChevronLeft, Sparkles, Check, HelpCircle
} from 'lucide-react';

export interface TourStep {
  target: string; // CSS selector (e.g. '#tour-search')
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  action?: () => void; // Optional action (e.g. switch tab before highlighting)
}

interface TourGuideProps {
  isOpen: boolean;
  steps: TourStep[];
  onClose: () => void;
  tourKey?: string; // Optional identifier to store "seen" state in localStorage
  onStepChange?: (stepIndex: number, step: TourStep) => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export const TourGuide: React.FC<TourGuideProps> = ({
  isOpen,
  steps,
  onClose,
  tourKey,
  onStepChange
}) => {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placement: string }>({
    top: 0,
    left: 0,
    placement: 'bottom'
  });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = steps[currentStep];

  // Reset to first step when tour opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  // Execute step action and notify step change
  useEffect(() => {
    if (!isOpen || !step) return;
    if (step.action) {
      step.action();
    }
    if (onStepChange) {
      onStepChange(currentStep, step);
    }
  }, [isOpen, currentStep, step, onStepChange]);

  const updateTargetRect = useCallback(() => {
    if (!isOpen || !step) return;

    const el = document.querySelector(step.target);
    if (el) {
      // Scroll element smoothly into view if needed
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      
      const rect = el.getBoundingClientRect();
      const padding = 6;
      setTargetRect({
        top: Math.max(0, rect.top - padding),
        left: Math.max(0, rect.left - padding),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
        bottom: rect.bottom + padding,
        right: rect.right + padding
      });
    } else {
      // Fallback if element not found in DOM
      setTargetRect({
        top: window.innerHeight / 2 - 50,
        left: window.innerWidth / 2 - 150,
        width: 300,
        height: 100,
        bottom: window.innerHeight / 2 + 50,
        right: window.innerWidth / 2 + 150
      });
    }
  }, [isOpen, step]);

  // Update rect on step change, resize, and scroll
  useEffect(() => {
    updateTargetRect();
    const timeout = setTimeout(updateTargetRect, 200);

    const handleResizeOrScroll = () => {
      updateTargetRect();
    };

    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
    };
  }, [updateTargetRect, currentStep]);

  // Calculate tooltip placement relative to target
  useEffect(() => {
    if (!targetRect || !tooltipRef.current) return;

    const tooltipEl = tooltipRef.current;
    const isMobile = window.innerWidth <= 768;
    const tooltipWidth = isMobile ? Math.min(window.innerWidth - 24, 360) : (tooltipEl.offsetWidth || 340);
    const tooltipHeight = tooltipEl.offsetHeight || 180;
    const margin = 12;

    const desiredPos = step?.position || 'auto';
    let placement = desiredPos;
    let top = 0;
    let left = 0;

    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;

    if (isMobile || desiredPos === 'auto' || (desiredPos !== 'top' && desiredPos !== 'bottom' && isMobile)) {
      // On mobile or auto, place above or below where there is more clearance
      if (spaceBelow >= tooltipHeight + margin || spaceBelow >= spaceAbove) {
        placement = 'bottom';
        top = targetRect.bottom + margin;
      } else {
        placement = 'top';
        top = targetRect.top - tooltipHeight - margin;
      }
      left = (window.innerWidth - tooltipWidth) / 2;
    } else {
      if (placement === 'bottom') {
        top = targetRect.bottom + margin;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
      } else if (placement === 'top') {
        top = targetRect.top - tooltipHeight - margin;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
      } else if (placement === 'right') {
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.right + margin;
      } else if (placement === 'left') {
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.left - tooltipWidth - margin;
      }
    }

    // Keep tooltip within viewport bounds safely
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipWidth - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - tooltipHeight - 12));

    setTooltipPos({ top, left, placement });
  }, [targetRect, step]);

  if (!isOpen || !step) return null;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      if (tourKey) {
        localStorage.setItem(`projyn_tour_${tourKey}`, 'seen');
      }
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    if (tourKey) {
      localStorage.setItem(`projyn_tour_${tourKey}`, 'seen');
    }
    onClose();
  };

  return (
    <div className="tour-guide-overlay" style={{ position: 'fixed', inset: 0, zIndex: 999999, pointerEvents: 'auto' }}>
      {/* SPOTLIGHT CUTOUT WITH DARK SHADOW */}
      {targetRect && (
        <div
          className="tour-spotlight"
          style={{
            position: 'fixed',
            top: `${targetRect.top}px`,
            left: `${targetRect.left}px`,
            width: `${targetRect.width}px`,
            height: `${targetRect.height}px`,
            borderRadius: '12px',
            boxShadow: '0 0 0 9999px rgba(4, 8, 19, 0.78), 0 0 25px var(--accent-color)',
            border: '2px solid var(--accent-color)',
            pointerEvents: 'none',
            transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
            zIndex: 1000000
          }}
        >
          {/* Animated pulse badge */}
          <div
            style={{
              position: 'absolute',
              top: '-10px',
              right: '-10px',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'var(--accent-color)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 800,
              boxShadow: '0 0 10px var(--accent-color)',
              animation: 'pulse 1.5s infinite'
            }}
          >
            {currentStep + 1}
          </div>
        </div>
      )}

      {/* FLOATING INTERACTIVE TOOLTIP CARD */}
      <div
        ref={tooltipRef}
        className="tour-tooltip-card glass"
        style={{
          position: 'fixed',
          top: `${tooltipPos.top}px`,
          left: `${tooltipPos.left}px`,
          width: '350px',
          maxWidth: 'calc(100vw - 32px)',
          zIndex: 1000001,
          padding: '20px',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-card)',
          backdropFilter: 'blur(20px)',
          transition: 'top 0.25s ease-out, left 0.25s ease-out',
          animation: 'fadeIn 0.2s ease-out'
        }}
      >
        {/* Header with step counter & close */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              padding: '2px 8px',
              borderRadius: '10px',
              background: 'var(--accent-glow)',
              color: 'var(--accent-color)'
            }}>
              Passo {currentStep + 1} de {steps.length}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSkip}
            title="Pular Tutorial"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s ease'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Step Title & Content */}
        <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} color="var(--accent-color)" />
          {step.title}
        </h3>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
          {step.content}
        </p>

        {/* Progress dots & action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
          {/* Progress dots */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {steps.map((_, idx) => (
              <div
                key={idx}
                onClick={() => setCurrentStep(idx)}
                style={{
                  width: idx === currentStep ? '16px' : '6px',
                  height: '6px',
                  borderRadius: '3px',
                  background: idx === currentStep ? 'var(--accent-color)' : 'var(--border-color)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              />
            ))}
          </div>

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {currentStep > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handlePrev}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                <ChevronLeft size={14} /> Anterior
              </button>
            )}

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleNext}
              style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {currentStep === steps.length - 1 ? (
                <>
                  <Check size={14} /> Concluir
                </>
              ) : (
                <>
                  Próximo <ChevronRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
