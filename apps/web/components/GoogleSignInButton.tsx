'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  onSuccess: (idToken: string) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          renderButton: (el: HTMLElement, opts: object) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

/**
 * Renders the official Google Sign-In button.
 * Loads the Google Identity Services (GSI) script lazily on first render.
 * On credential response, calls onSuccess with the raw ID token.
 *
 * Authorization is always handled server-side — this component only handles
 * the user's identity assertion from Google.
 */
export function GoogleSignInButton({ onSuccess, onError, disabled }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !GOOGLE_CLIENT_ID) return;
    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    // Load GSI script only once
    const existing = document.getElementById('gsi-script');
    if (existing) {
      existing.addEventListener('load', () => setScriptLoaded(true));
      return;
    }

    const script = document.createElement('script');
    script.id = 'gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !ref.current || !GOOGLE_CLIENT_ID) return;
    if (!window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: { credential?: string; error?: string }) => {
        if (response.credential) {
          onSuccess(response.credential);
        } else {
          onError?.('Google Sign-In was cancelled or failed. Please try again.');
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    window.google.accounts.id.renderButton(ref.current, {
      type: 'standard',
      shape: 'rectangular',
      theme: 'outline',
      text: 'continue_with',
      size: 'large',
      logo_alignment: 'left',
      width: ref.current.offsetWidth || 340,
    });
  }, [scriptLoaded, onSuccess, onError]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
        Google Sign-In is not configured. Set <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>.
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`w-full transition-opacity ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      aria-label="Sign in with Google"
    />
  );
}
