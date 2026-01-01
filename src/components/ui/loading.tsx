'use client';

import { useEffect, useState } from 'react';

// =============================================================================
// Loading Spinner
// =============================================================================

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className={`${sizeClasses[size]} ${className}`}>
      <svg
        className="animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
}

// =============================================================================
// FROST Logo Animation
// =============================================================================

function FrostLogo({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Snowflake/FROST pattern */}
      <g className="animate-pulse">
        {/* Center hexagon */}
        <path
          d="M50 20L68.66 30V50L50 60L31.34 50V30L50 20Z"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          className="text-amber-400"
        />
        {/* Outer spokes */}
        <line x1="50" y1="10" x2="50" y2="20" stroke="currentColor" strokeWidth="2" className="text-amber-400" />
        <line x1="50" y1="60" x2="50" y2="70" stroke="currentColor" strokeWidth="2" className="text-amber-400" />
        <line x1="25" y1="25" x2="31.34" y2="30" stroke="currentColor" strokeWidth="2" className="text-amber-400" />
        <line x1="68.66" y1="30" x2="75" y2="25" stroke="currentColor" strokeWidth="2" className="text-amber-400" />
        <line x1="25" y1="55" x2="31.34" y2="50" stroke="currentColor" strokeWidth="2" className="text-amber-400" />
        <line x1="68.66" y1="50" x2="75" y2="55" stroke="currentColor" strokeWidth="2" className="text-amber-400" />
        {/* Inner pattern */}
        <circle cx="50" cy="40" r="5" fill="currentColor" className="text-amber-500" />
      </g>
      {/* Rotating ring */}
      <circle
        cx="50"
        cy="40"
        r="35"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="10 5"
        fill="none"
        className="text-amber-400/30 origin-center animate-spin"
        style={{ animationDuration: '8s' }}
      />
    </svg>
  );
}

// =============================================================================
// Loading Overlay
// =============================================================================

interface LoadingOverlayProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingOverlay({ message = 'Loading...', fullScreen = true }: LoadingOverlayProps) {
  const containerClass = fullScreen
    ? 'fixed inset-0 z-50'
    : 'absolute inset-0';

  return (
    <div className={`${containerClass} flex items-center justify-center bg-gray-950/80 backdrop-blur-sm`}>
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" className="text-amber-400" />
        <p className="text-gray-300 text-sm">{message}</p>
      </div>
    </div>
  );
}

// =============================================================================
// Splash Screen
// =============================================================================

interface SplashScreenProps {
  onComplete?: () => void;
  minDuration?: number;
}

export function SplashScreen({ onComplete, minDuration = 1500 }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFading(true);
      setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, 300);
    }, minDuration);

    return () => clearTimeout(timer);
  }, [minDuration, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 transition-opacity duration-300 ${
        isFading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <FrostLogo className="w-24 h-24 text-amber-400 mb-6" />
      <h1 className="text-2xl font-bold text-white mb-2">FROST</h1>
      <p className="text-gray-400 text-sm mb-8">Multi-Signature Wallet</p>
      <Spinner size="md" className="text-amber-400" />
    </div>
  );
}

// =============================================================================
// Page Loading State
// =============================================================================

interface PageLoadingProps {
  title?: string;
  description?: string;
}

export function PageLoading({ title = 'Loading', description }: PageLoadingProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-16">
      <Spinner size="lg" className="text-amber-400 mb-4" />
      <h2 className="text-lg font-medium text-white mb-1">{title}</h2>
      {description && <p className="text-gray-400 text-sm">{description}</p>}
    </div>
  );
}

// =============================================================================
// Button Loading State
// =============================================================================

interface ButtonSpinnerProps {
  className?: string;
}

export function ButtonSpinner({ className = '' }: ButtonSpinnerProps) {
  return (
    <svg
      className={`animate-spin h-4 w-4 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// =============================================================================
// Skeleton Loaders
// =============================================================================

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-800 rounded ${className}`}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <Skeleton className="h-6 w-1/3 mb-4" />
      <SkeletonText lines={2} />
      <Skeleton className="h-10 w-full mt-4" />
    </div>
  );
}
