'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Snapshot } from './api';

const URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

/**
 * Shape of the payload emitted on `patient:queue:updated`. The patient page
 * doesn't need the full snapshot — it just refetches its history slice.
 */
export interface PatientStreamEvent {
  eventType: string;          // "joined" | "entry_completed" | "entry_skipped" | …
  entryId: string;
  doctorId: string;
  from?: string;
  to?: string;
}

type RoomListener = (state: { snapshot: Snapshot | null; connected: boolean }) => void;

interface SharedDoctorRoom {
  refCount: number;
  snapshot: Snapshot | null;
  connected: boolean;
  socket: Socket;
  listeners: Set<RoomListener>;
}

/** One Socket.IO connection per doctorId — shared across all hook instances. */
const sharedDoctorRooms = new Map<string, SharedDoctorRoom>();

function notifyRoom(room: SharedDoctorRoom) {
  const state = { snapshot: room.snapshot, connected: room.connected };
  room.listeners.forEach((fn) => fn(state));
}

function acquireDoctorRoom(doctorId: string): SharedDoctorRoom {
  const existing = sharedDoctorRooms.get(doctorId);
  if (existing) {
    existing.refCount += 1;
    return existing;
  }

  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem('hq_token') : null;
  const socket = io(URL, {
    transports: ['websocket'],
    withCredentials: true,
    auth: token ? { token } : undefined,
  });

  const room: SharedDoctorRoom = {
    refCount: 1,
    snapshot: null,
    connected: false,
    socket,
    listeners: new Set(),
  };

  socket.on('connect', () => {
    room.connected = true;
    notifyRoom(room);
    socket.emit(
      'subscribe:doctor',
      { doctorId },
      (ack: { ok: boolean; snapshot?: Snapshot }) => {
        if (ack?.snapshot) {
          room.snapshot = ack.snapshot;
          notifyRoom(room);
        }
      },
    );
  });
  socket.on('disconnect', () => {
    room.connected = false;
    notifyRoom(room);
  });
  socket.on('queue:updated', (msg: { snapshot: Snapshot }) => {
    if (msg?.snapshot) {
      room.snapshot = msg.snapshot;
      notifyRoom(room);
    }
  });

  sharedDoctorRooms.set(doctorId, room);
  return room;
}

function releaseDoctorRoom(doctorId: string, room: SharedDoctorRoom) {
  room.refCount -= 1;
  if (room.refCount > 0) return;
  room.socket.emit('unsubscribe:doctor', { doctorId });
  room.socket.disconnect();
  sharedDoctorRooms.delete(doctorId);
}

/**
 * Subscribes to a doctor's queue room and keeps a local snapshot in sync.
 * - Initial snapshot arrives in the ack of `subscribe:doctor`.
 * - Subsequent updates arrive as `queue:updated` events.
 * - Multiple components watching the same doctor share one WebSocket.
 *
 * Returns `{ snapshot, connected }`. Components render off `snapshot`.
 */
export function useDoctorQueue(doctorId: string | null) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!doctorId) return;

    const room = acquireDoctorRoom(doctorId);
    const listener: RoomListener = (state) => {
      setSnapshot(state.snapshot);
      setConnected(state.connected);
    };
    room.listeners.add(listener);
    listener({ snapshot: room.snapshot, connected: room.connected });

    return () => {
      room.listeners.delete(listener);
      releaseDoctorRoom(doctorId, room);
    };
  }, [doctorId]);

  return { snapshot, connected };
}

/**
 * Subscribes the current patient to their own private socket room and invokes
 * `onEvent` whenever the backend reports a change involving this patient
 * (joined a queue, called next, completed, etc).
 *
 * Use this on the patient page so it updates the moment reception checks them
 * in — without having to know which doctor's room to join up-front.
 *
 * Returns `{ connected, lastEvent }`. Consumers typically just use `lastEvent`
 * as a `useEffect` dependency to trigger their own refetch logic.
 */
export function usePatientStream(
  enabled: boolean,
  onEvent?: (event: PatientStreamEvent) => void,
) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<PatientStreamEvent | null>(null);
  // Stash the latest callback in a ref so we don't tear down the socket every
  // render when a parent passes a new inline function.
  const onEventRef = useRef(onEvent);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;

    const token =
      typeof window !== 'undefined' ? window.localStorage.getItem('hq_token') : null;
    const socket = io(URL, {
      transports: ['websocket'],
      withCredentials: true,
      auth: token ? { token } : undefined,
    });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('subscribe:patient', {});
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('patient:queue:updated', (msg: PatientStreamEvent) => {
      setLastEvent(msg);
      onEventRef.current?.(msg);
    });

    return () => {
      socket.emit('unsubscribe:patient', {});
      socket.disconnect();
    };
  }, [enabled]);

  return { connected, lastEvent };
}
