'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Loader2,
  Car,
  Star,
  Navigation,
  Flag,
  CheckCircle2,
  XCircle,
  MapPin,
  Crosshair,
} from 'lucide-react';
import { toast } from 'sonner';
import { RideMap } from './RideMap';
import { RideChat, type RideChatMessage } from './RideChat';
import { FareBreakdown } from './FareBreakdown';
import { PayoutBreakdown } from './PayoutBreakdown';
import { TipPrompt } from './TipPrompt';
import { StarRating } from './StarRating';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { rideClassName } from '@/lib/rideshare/classes';
import { formatDistance, formatDuration, type LatLng } from '@/lib/rideshare/geo';
import { useDriverLocationShare } from '@/lib/rideshare/useDriverLocationShare';

type RideStatus = 'REQUESTED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

interface Vehicle {
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleYear: number;
  licensePlate: string;
  seats: number;
  lastLat: number | null;
  lastLng: number | null;
  locationUpdatedAt: string | null;
  ratingCount: number;
  ratingTotal: number;
}
interface Person {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}
interface SyncRide {
  id: string;
  status: RideStatus;
  rideClass: string;
  pickupLabel: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLabel: string;
  dropoffLat: number;
  dropoffLng: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
  estimatedFareCents: number;
  tipCents: number;
  ratingByRider: number | null;
  ratingByDriver: number | null;
  rider: Person;
  driver: (Person & { rideshareDriver: Vehicle | null }) | null;
  messages: RideChatMessage[];
}

const STEPS: { key: RideStatus; label: string; icon: typeof Car }[] = [
  { key: 'REQUESTED', label: 'Requested', icon: Navigation },
  { key: 'ACCEPTED', label: 'Matched', icon: Car },
  { key: 'IN_PROGRESS', label: 'On trip', icon: MapPin },
  { key: 'COMPLETED', label: 'Done', icon: Flag },
];
const STEP_ORDER: Record<RideStatus, number> = {
  REQUESTED: 0,
  ACCEPTED: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
  CANCELLED: -1,
};

/** Location is "live" if updated within the last 2 minutes. */
function isFresh(iso: string | null): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 120_000;
}

export function ActiveRidePanel({
  rideId,
  currentUserId,
  onChange,
  onClose,
}: {
  rideId: string;
  currentUserId: string;
  onChange?: () => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation("c-rideshare");
  const confirm = useConfirm();
  const [ride, setRide] = useState<SyncRide | null>(null);
  const [role, setRole] = useState<'rider' | 'driver'>('rider');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lastStatus = useRef<RideStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sync = useCallback(async () => {
    try {
      const res = await fetch(`/api/rideshare/rides/${rideId}/sync`);
      if (res.ok) {
        const data = await res.json();
        setRide(data.ride);
        setRole(data.role);
        if (lastStatus.current && lastStatus.current !== data.ride.status) {
          onChange?.();
        }
        lastStatus.current = data.ride.status;
        // Stop polling once the trip is over — nothing else will change.
        if ((data.ride.status === 'COMPLETED' || data.ride.status === 'CANCELLED') && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } finally {
      setLoading(false);
    }
  }, [rideId, onChange]);

  useEffect(() => {
    sync();
    intervalRef.current = setInterval(sync, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sync]);

  const isDriver = role === 'driver';
  const status = ride?.status;
  const sharingActive = isDriver && (status === 'ACCEPTED' || status === 'IN_PROGRESS');
  const locationState = useDriverLocationShare(sharingActive);

  async function act(action: 'start' | 'complete' | 'cancel') {
    if (action === 'cancel' && !(await confirm({ title: t("cancel-this-ride", { defaultValue: "Cancel this ride?" }), danger: true }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rideshare/rides/${rideId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t("action-failed", { defaultValue: "Action failed." }));
        return;
      }
      await sync();
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(content: string) {
    const res = await fetch(`/api/rideshare/rides/${rideId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || t("could-not-send-message", { defaultValue: "Could not send message." }));
      return;
    }
    sync();
  }

  async function rate(value: number) {
    const res = await fetch(`/api/rideshare/rides/${rideId}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || t("could-not-submit-rating", { defaultValue: "Could not submit rating." }));
      return;
    }
    toast.success(t("thanks-for-rating", { defaultValue: "Thanks for your rating!" }));
    sync();
  }

  async function tip(cents: number) {
    const res = await fetch(`/api/rideshare/rides/${rideId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'tip', tipCents: cents }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || t("could-not-add-tip", { defaultValue: "Could not add your tip." }));
      return;
    }
    toast.success(t("tip-sent", { defaultValue: "Tip sent — thank you!" }));
    await sync();
  }

  if (loading) {
    return (
      <div className="flex justify-center rounded-site border border-site-border bg-site-surface/80 py-12">
        <Loader2 className="h-6 w-6 animate-spin text-site-text-muted" />
      </div>
    );
  }
  if (!ride) return null;

  const driverVehicle = ride.driver?.rideshareDriver ?? null;
  const driverLoc: LatLng | null =
    !isDriver && driverVehicle?.lastLat != null && driverVehicle?.lastLng != null && isFresh(driverVehicle.locationUpdatedAt)
      ? { lat: driverVehicle.lastLat, lng: driverVehicle.lastLng }
      : null;
  const driverRatingAvg =
    driverVehicle && driverVehicle.ratingCount > 0
      ? (driverVehicle.ratingTotal / driverVehicle.ratingCount).toFixed(1)
      : null;

  const other = isDriver ? ride.rider : ride.driver;
  const myRatingGiven = isDriver ? ride.ratingByDriver : ride.ratingByRider;
  const chatDisabled = status !== 'ACCEPTED' && status !== 'IN_PROGRESS';

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Status timeline */}
      <div className="rounded-site border border-site-border bg-site-surface/80 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-site-text">{rideClassName(ride.rideClass)}</h2>
          {status === 'CANCELLED' ? (
            <span className="flex items-center gap-1 rounded-full bg-site-surface-hover px-2.5 py-1 text-xs font-medium text-site-text-muted">
              <XCircle className="h-3.5 w-3.5" /> {t("cancelled", { defaultValue: "Cancelled" })}
            </span>
          ) : (
            <span className="text-xs text-site-text-muted">
              {formatDistance(ride.distanceMeters)} · {formatDuration(ride.durationSeconds)}
            </span>
          )}
        </div>

        {status !== 'CANCELLED' && (
          <div className="flex items-center">
            {STEPS.map((step, i) => {
              const reached = STEP_ORDER[status!] >= STEP_ORDER[step.key];
              return (
                <div key={step.key} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                        reached ? 'bg-site-accent text-(--site-accent-fg)' : 'bg-site-surface-hover text-site-text-dim'
                      }`}
                    >
                      <step.icon className="h-4 w-4" />
                    </div>
                    <span className={`text-[11px] ${reached ? 'text-site-text' : 'text-site-text-dim'}`}>
                      {step.key === 'REQUESTED' ? t("step-requested", { defaultValue: "Requested" })
                        : step.key === 'ACCEPTED' ? t("step-matched", { defaultValue: "Matched" })
                        : step.key === 'IN_PROGRESS' ? t("step-on-trip", { defaultValue: "On trip" })
                        : t("step-done", { defaultValue: "Done" })}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`mx-1 h-0.5 flex-1 rounded ${
                        STEP_ORDER[status!] > STEP_ORDER[step.key] ? 'bg-site-accent' : 'bg-site-surface-hover'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Other party */}
      {other && (
        <div className="flex items-center gap-3 rounded-site border border-site-border bg-site-surface/80 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-site-accent/15 text-site-accent">
            <Car className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-site-text">{other.name ?? (isDriver ? t("your-rider", { defaultValue: "Your rider" }) : t("your-driver", { defaultValue: "Your driver" }))}</span>
              {!isDriver && driverRatingAvg && (
                <span className="flex items-center gap-0.5 text-xs text-amber-400">
                  <Star className="h-3 w-3 fill-amber-400" /> {driverRatingAvg}
                </span>
              )}
            </div>
            {!isDriver && driverVehicle && (
              <p className="truncate text-xs text-site-text-muted">
                {driverVehicle.vehicleColor} {driverVehicle.vehicleMake} {driverVehicle.vehicleModel} ·{' '}
                <span className="font-medium text-site-text">{driverVehicle.licensePlate}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Driver location-sharing hint */}
      {sharingActive && (
        <div className="flex items-center gap-2 rounded-site border border-site-border bg-site-surface/80 px-4 py-2.5 text-xs">
          <Crosshair className={`h-4 w-4 ${locationState === 'sharing' ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span className="text-site-text-muted">
            {locationState === 'sharing'
              ? t("location-sharing", { defaultValue: "Sharing your live location with the rider." })
              : locationState === 'denied'
                ? t("location-denied", { defaultValue: "Enable location access so your rider can track your approach." })
                : locationState === 'unavailable'
                  ? t("location-unavailable", { defaultValue: "Live location isn't available on this device." })
                  : t("location-starting", { defaultValue: "Starting location sharing…" })}
          </span>
        </div>
      )}

      {/* Map */}
      <RideMap
        pickup={{ label: ride.pickupLabel, lat: ride.pickupLat, lng: ride.pickupLng }}
        dropoff={{ label: ride.dropoffLabel, lat: ride.dropoffLat, lng: ride.dropoffLng }}
        driverLocation={driverLoc}
        className="h-64"
      />

      {/* Fare (rider) / pay (driver) */}
      {isDriver ? (
        <PayoutBreakdown
          fareCents={ride.estimatedFareCents}
          tipCents={ride.tipCents}
          estimate={status !== 'COMPLETED'}
        />
      ) : (
        <FareBreakdown distanceMeters={ride.distanceMeters} durationSeconds={ride.durationSeconds} classId={ride.rideClass} />
      )}

      {/* Chat */}
      <RideChat
        messages={ride.messages}
        currentUserId={currentUserId}
        onSend={sendMessage}
        disabled={chatDisabled}
        otherName={other?.name ?? undefined}
      />

      {/* Completed → rate */}
      {status === 'COMPLETED' && (
        <div className="rounded-site border border-site-border bg-site-surface/80 p-5 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
          <h3 className="mt-2 font-semibold text-site-text">
            {myRatingGiven ? t("thanks-for-riding", { defaultValue: "Thanks for riding with RMH!" }) : (isDriver ? t("rate-your-rider", { defaultValue: "Rate your rider" }) : t("rate-your-driver", { defaultValue: "Rate your driver" }))}
          </h3>
          {myRatingGiven ? (
            <div className="mt-2 flex justify-center">
              <StarRating value={myRatingGiven} readOnly size={22} />
            </div>
          ) : (
            <div className="mt-3 flex justify-center">
              <StarRating value={0} onChange={rate} size={30} />
            </div>
          )}
        </div>
      )}

      {/* Completed → rider can tip the driver */}
      {status === 'COMPLETED' && !isDriver && ride.driver && (
        <TipPrompt fareCents={ride.estimatedFareCents} tipCents={ride.tipCents} onTip={tip} />
      )}

      {/* Dismiss a finished trip */}
      {(status === 'COMPLETED' || status === 'CANCELLED') && onClose && (
        <button
          onClick={onClose}
          className="w-full rounded-site border border-site-border bg-site-surface px-5 py-2.5 text-sm font-semibold text-site-text transition-colors hover:bg-site-surface-hover"
        >
          {t("done", { defaultValue: "Done" })}
        </button>
      )}

      {/* Actions */}
      {status !== 'COMPLETED' && status !== 'CANCELLED' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {isDriver && status === 'ACCEPTED' && (
            <button
              onClick={() => act('start')}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-site bg-site-accent px-5 py-3 text-sm font-semibold text-(--site-accent-fg) transition-colors hover:bg-(--site-accent-hover) disabled:opacity-50 sm:flex-1 sm:py-2.5"
            >
              <Navigation className="h-4 w-4" /> {t("start-trip", { defaultValue: "Start trip" })}
            </button>
          )}
          {isDriver && status === 'IN_PROGRESS' && (
            <button
              onClick={() => act('complete')}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-site bg-site-success px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-site-success/90 disabled:opacity-50 sm:flex-1 sm:py-2.5"
            >
              <Flag className="h-4 w-4" /> {t("complete-trip", { defaultValue: "Complete trip" })}
            </button>
          )}
          <button
            onClick={() => act('cancel')}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-site border border-site-border px-5 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50 sm:py-2.5"
          >
            <XCircle className="h-4 w-4" /> {t("cancel", { defaultValue: "Cancel" })}
          </button>
        </div>
      )}
    </motion.div>
  );
}
