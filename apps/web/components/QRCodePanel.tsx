'use client';

import { useEffect, useRef, useState } from 'react';

interface QRCodePanelProps {
  doctorId: string;
  doctorName: string;
  clinicName?: string;
}

export function QRCodePanel({ doctorId, doctorName, clinicName }: QRCodePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'https://turnos.fly.dev');
  const bookingUrl = `${baseUrl}/join?d=${doctorId}`;

  useEffect(() => {
    if (!canvasRef.current) return;
    import('qrcode').then((QRCode) => {
      QRCode.toCanvas(canvasRef.current!, bookingUrl, {
        width: 200,
        margin: 2,
        color: { dark: '#1e293b', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }).catch(() => setError('QR generation failed'));
    }).catch(() => setError('QR library unavailable'));
  }, [bookingUrl]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `booking-qr-${doctorName.toLowerCase().replace(/\s+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        Self-Booking QR Code
      </div>
      <div className="flex flex-col sm:flex-row items-start gap-6">
        <div className="shrink-0">
          <div className="p-3 bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 inline-block">
            {error ? (
              <div className="h-[200px] w-[200px] flex items-center justify-center text-xs text-slate-400 text-center px-4">
                {error}
              </div>
            ) : (
              <canvas ref={canvasRef} className="rounded-lg block" />
            )}
          </div>
        </div>
        <div className="flex-1 space-y-4 min-w-0">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{doctorName}</p>
            {clinicName && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{clinicName}</p>}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Booking Link</p>
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2 ring-1 ring-slate-200 dark:ring-slate-700">
              <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1 font-mono">{bookingUrl}</span>
              <button type="button" onClick={handleCopy} className="shrink-0 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 transition-colors">
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleDownload} className="btn-secondary !py-1.5 !px-3 !text-xs">⬇ Download PNG</button>
            <button type="button" onClick={handleCopy} className="btn-secondary !py-1.5 !px-3 !text-xs">{copied ? '✓ Copied' : '🔗 Copy Link'}</button>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Patients can scan this QR code to join the queue directly from their phone — no app required.
          </p>
        </div>
      </div>
    </div>
  );
}
