'use client';

import { useEffect, useRef, useState } from 'react';
import { TurnosIcon } from '@/components/Icons';

interface LoadingStep {
  icon: (props: { className?: string }) => JSX.Element;
  label: string;
  subtext: string;
}

const LOADING_STEPS: LoadingStep[] = [
  {
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    label: 'Authenticating credentials…',
    subtext: 'Verifying user identity & security token',
  },
  {
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    label: 'Loading location & clinic…',
    subtext: 'Fetching branch configurations & settings',
  },
  {
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    label: 'Syncing schedule & live queue…',
    subtext: 'Connecting to real-time socket updates',
  },
  {
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
    label: 'Opening your dashboard…',
    subtext: 'Preparing workspace interface',
  },
];

interface WarpSpeedLoaderProps {
  message?: string;
  subtext?: string;
}

export function WarpSpeedLoader({ message, subtext }: WarpSpeedLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  // Cycle through texts every 750ms for smooth comfortable feedback
  useEffect(() => {
    const interval = setInterval(() => {
      setStepIdx((prev) => (prev + 1) % LOADING_STEPS.length);
    }, 750);
    return () => clearInterval(interval);
  }, []);

  // Canvas Warp Speed Animation Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const NUM_LINES = 50;
    const COLORS = [
      '#22c55e', // brand emerald 500
      '#16a34a', // brand emerald 600
      '#4ade84', // brand emerald 400
      '#14b8a6', // teal 500
      '#10b981', // mint green
    ];

    interface StreakLine {
      angle: number;
      r: number;
      speed: number;
      len: number;
      width: number;
      color: string;
    }

    const lines: StreakLine[] = Array.from({ length: NUM_LINES }, () => ({
      angle: Math.random() * Math.PI * 2,
      r: 60 + Math.random() * (Math.max(width, height) * 0.4),
      speed: 3 + Math.random() * 5,
      len: 15 + Math.random() * 35,
      width: 1.2 + Math.random() * 1.8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height * 0.38;
      const maxR = Math.hypot(width, height) * 0.55;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        line.r += line.speed;
        line.speed *= 1.02;
        line.len *= 1.015;

        if (line.r > maxR) {
          line.r = 55 + Math.random() * 30;
          line.speed = 2.5 + Math.random() * 4;
          line.len = 12 + Math.random() * 30;
          line.angle = Math.random() * Math.PI * 2;
        }

        const x1 = cx + Math.cos(line.angle) * line.r;
        const y1 = cy + Math.sin(line.angle) * line.r;
        const x2 = cx + Math.cos(line.angle) * (line.r + line.len);
        const y2 = cy + Math.sin(line.angle) * (line.r + line.len);

        const alpha = Math.min(1, (line.r - 40) / 120);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = line.color;
        ctx.globalAlpha = Math.max(0, alpha * 0.5);
        ctx.lineWidth = line.width;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const currentStep = LOADING_STEPS[stepIdx];
  const StepIcon = currentStep.icon;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-slate-50 dark:bg-[#0a0a0b] text-slate-900 dark:text-slate-100 select-none overflow-hidden animate-fade-in">
      {/* Warp Speed Canvas Background */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0 opacity-85 dark:opacity-65" />

      {/* Upper Spacing */}
      <div className="pt-12 z-10" />

      {/* Central Clean Badge & Rotating Messages */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 my-auto">
        {/* Soft Center Brand Badge */}
        <div className="relative mb-6 flex items-center justify-center">
          <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-emerald-100/90 dark:bg-emerald-950/80 shadow-md flex items-center justify-center border-2 border-emerald-300 dark:border-emerald-700/60 ring-4 ring-emerald-500/10">
            {/* Center Icon */}
            <div key={stepIdx} className="flex flex-col items-center justify-center animate-scale-up">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-emerald-500 text-white flex items-center justify-center shadow-md p-2.5">
                <StepIcon className="h-7 w-7 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Changing Text */}
        <div className="h-20 flex flex-col items-center justify-center max-w-sm">
          <h2 key={`label-${stepIdx}`} className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white animate-fade-in-up">
            {message || currentStep.label}
          </h2>
          <p key={`sub-${stepIdx}`} className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium animate-fade-in-up">
            {subtext || currentStep.subtext}
          </p>
        </div>

        {/* Micro-Progress Bar */}
        <div className="w-40 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-4 shadow-xs">
          <div className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 animate-shimmer-progress rounded-full" />
        </div>
      </div>

      {/* Bottom Footer Warning Text (Matching "Do not close the screen") */}
      <div className="pb-10 z-10 text-center">
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium tracking-wide flex items-center justify-center gap-1.5 animate-pulse">
          <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </p>
      </div>
    </div>
  );
}
