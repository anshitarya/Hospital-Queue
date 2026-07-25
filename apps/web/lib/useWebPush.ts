'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from './api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface UseWebPushReturn {
  isSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  loading: boolean;
  error: string | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

export function useWebPush(enabled = true): UseWebPushReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;

    setIsSupported(supported);

    if (!supported) {
      setPermission('unsupported');
      setLoading(false);
      return;
    }

    setPermission(Notification.permission);

    // Register service worker if supported
    navigator.serviceWorker
      .register('/sw.js')
      .then(async (registration) => {
        const existingSub = await registration.pushManager.getSubscription();
        setSubscribed(!!existingSub);
      })
      .catch((err) => {
        console.warn('Service Worker registration failed:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError('Push notifications are not supported in this browser.');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Request Notification Permission if default
      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
        setPermission(perm);
      }

      if (perm !== 'granted') {
        setError('Notification permission was denied.');
        setLoading(false);
        return false;
      }

      // 2. Fetch VAPID key from backend
      const { publicKey } = await api<{ publicKey: string }>('/notifications/push/vapid-key');
      if (!publicKey) {
        throw new Error('VAPID public key not received from server');
      }

      // 3. Register or get existing service worker
      const registration = await navigator.serviceWorker.ready;

      // 4. Subscribe with PushManager
      const applicationServerKey = urlBase64ToUint8Array(publicKey) as unknown as BufferSource;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const subJson = subscription.toJSON();

      // 5. Send subscription to API server
      await api('/notifications/push/subscribe', {
        method: 'POST',
        body: {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subJson.keys?.p256dh,
            auth: subJson.keys?.auth,
          },
          userAgent: navigator.userAgent,
        },
      });

      setSubscribed(true);
      setLoading(false);
      return true;
    } catch (err: any) {
      console.error('Failed to subscribe to Web Push:', err);
      setError(err.message || 'Failed to enable push notifications.');
      setLoading(false);
      return false;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    setLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Send unsubscribe to API
        await api('/notifications/push/unsubscribe', {
          method: 'POST',
          body: { endpoint: subscription.endpoint },
        }).catch(() => {});

        // Unsubscribe locally
        await subscription.unsubscribe();
      }

      setSubscribed(false);
      setLoading(false);
      return true;
    } catch (err: any) {
      console.error('Failed to unsubscribe from Web Push:', err);
      setError(err.message || 'Failed to disable push notifications.');
      setLoading(false);
      return false;
    }
  }, [isSupported]);

  return {
    isSupported,
    permission,
    subscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
  };
}
