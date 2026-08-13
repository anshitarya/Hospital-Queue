'use client';

import React, { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';

interface AudioRecorderProps {
  visitId: string;
  onPrescriptionReady: (prescription: any) => void;
}

export function AudioRecorder({ visitId, onPrescriptionReady }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<'idle' | 'recording' | 'uploading' | 'processing' | 'ready' | 'error'>('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check if there is an existing prescription draft on mount
    const checkExisting = async () => {
      try {
        const pres = await api<any>(`/prescriptions/visit/${visitId}`);
        if (pres) {
          if (
            pres.status === 'READY_FOR_REVIEW' || 
            pres.status === 'COMPLETED' || 
            pres.status === 'GENERATING_PDF' ||
            (pres.status === 'PENDING' && !pres.audioUrl)
          ) {
            onPrescriptionReady(pres);
            setStatus('ready');
          } else if (pres.status === 'TRANSCRIBING' || (pres.status === 'PENDING' && pres.audioUrl)) {
            startPolling();
          }
        }
      } catch {
        // No prescription yet, safe to ignore
      }
    };
    checkExisting();

    return () => {
      stopPolling();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visitId]);

  useEffect(() => {
    if (isRecording) {
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startPolling = () => {
    setStatus('processing');
    setProgressMsg('Transcribing audio & generating prescription drafts...');
    stopPolling();

    pollIntervalRef.current = setInterval(async () => {
      try {
        const pres = await api<any>(`/prescriptions/visit/${visitId}`);
        if (pres.status === 'READY_FOR_REVIEW') {
          stopPolling();
          onPrescriptionReady(pres);
          setStatus('ready');
        } else if (pres.status === 'FAILED') {
          stopPolling();
          setStatus('error');
          setProgressMsg('Transcription failed. Please try again.');
        } else if (pres.status === 'TRANSCRIBING') {
          setProgressMsg('Converting speech to text via Whisper...');
        }
      } catch (err) {
        // ignore errors during poll
      }
    }, 3000);
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startRecording = async () => {
    chunksRef.current = [];
    setRecordedBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(audioBlob);
        await uploadAudio(audioBlob);
        // Stop all audio tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(1000); // chunk every 1s
      setIsRecording(true);
      setStatus('recording');
    } catch (err) {
      console.error('Failed to access microphone', err);
      setStatus('error');
      setProgressMsg('Microphone access denied or unavailable.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadAudio = async (blob: Blob) => {
    setStatus('uploading');
    setProgressMsg('Uploading audio file...');
    try {
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      formData.append('visitId', visitId);

      // We use raw fetch because the helper api() might not support multipart body easily
      const token = localStorage.getItem('hq_token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/prescriptions/upload`, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      
      startPolling();
    } catch (err) {
      console.error(err);
      setStatus('error');
      setProgressMsg('Failed to upload audio recording.');
    }
  };

  const handleOpenTemplate = async () => {
    setStatus('processing');
    setProgressMsg('Opening prescription template...');
    try {
      // First try to check if there is an existing prescription
      try {
        const existing = await api<any>(`/prescriptions/visit/${visitId}`);
        if (existing) {
          onPrescriptionReady(existing);
          setStatus('ready');
          return;
        }
      } catch {
        // Safe to ignore if not found
      }

      // If not found, create one via the vitals endpoint
      const initialized = await api<any>('/prescriptions/vitals', {
        method: 'POST',
        body: { visitId },
      });
      
      // Ensure medicines array is initialized
      if (!initialized.medicines) {
        initialized.medicines = [];
      }
      
      onPrescriptionReady(initialized);
      setStatus('ready');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setProgressMsg(err.message || 'Failed to open prescription template.');
    }
  };

  return (
    <div className="p-4 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Prescription Assistant</h3>
          <p className="text-xs text-slate-400">Record your patient consultation to generate a prescription draft automatically.</p>
        </div>
        
        {status === 'recording' && (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/20 text-rose-500 font-semibold text-xs animate-pulse">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span>{formatDuration(recordingDuration)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center justify-center py-4">
        {status === 'idle' && (
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={startRecording}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition duration-200 shadow-sm"
            >
              <span>🎙️</span> Start Recording
            </button>
            <button
              type="button"
              onClick={handleOpenTemplate}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium transition duration-200 shadow-sm border border-slate-200/50 dark:border-slate-700/50"
            >
              <span>📝</span> Write Prescription Manually
            </button>
          </div>
        )}

        {status === 'recording' && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center justify-center gap-1.5 h-10 w-40">
              <span className="h-4 w-1 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <span className="h-6 w-1 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              <span className="h-8 w-1 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
              <span className="h-5 w-1 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              <span className="h-7 w-1 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0.5s' }} />
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className="px-5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400 font-medium transition duration-200 shadow-sm border border-rose-200/50 dark:border-rose-900/30"
            >
              🛑 Stop Recording
            </button>
          </div>
        )}

        {(status === 'uploading' || status === 'processing') && (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            <p className="text-sm text-slate-500 font-medium">{progressMsg}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center space-y-4">
            <p className="text-sm text-rose-500 font-medium">{progressMsg}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {recordedBlob && (
                <button
                  type="button"
                  onClick={() => uploadAudio(recordedBlob)}
                  className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 shadow-sm transition"
                >
                  🔄 Retry Upload
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setRecordedBlob(null);
                  setStatus('idle');
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 transition"
              >
                Record Again
              </button>
              <button
                type="button"
                onClick={handleOpenTemplate}
                className="px-4 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400 text-sm font-medium hover:bg-teal-100 dark:hover:bg-teal-950/40 border border-teal-200/50 dark:border-teal-950/50 transition"
              >
                📝 Write Prescription Manually
              </button>
            </div>
          </div>
        )}

        {status === 'ready' && (
          <div className="flex items-center gap-2 text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2 rounded-xl text-sm font-medium">
            <span>✅</span> Prescription Draft Loaded
          </div>
        )}
      </div>
    </div>
  );
}
