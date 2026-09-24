"use client";

import { useEffect, useState } from "react";
import { Seat } from "@/types/event";
import { announceCartUpdate, injectAriaLabels } from "@/lib/a11y";
import { getAccessToken } from "@/lib/auth/auth";

interface SeatMapProps {
  seats: Seat[];
  sectionName: string;
  onSelectSeat: (seat: Seat) => void;
  selectedSeatId?: string;
  refreshIntervalMs?: number;
  eventId?: string;
}

const SEAT_SIZE = 36;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function SeatMap(props: SeatMapProps) {
  const [liveSeats, setLiveSeats] = useState(props.seats);

  useEffect(() => setLiveSeats(props.seats), [props.seats]);

  // When an eventId is supplied, keep this section's seats fresh by polling
  // the backend, so a seat someone else holds/books shows up here shortly
  // after without a manual refresh.
  useEffect(() => {
    const sectionId = props.seats[0]?.sectionId;
    if (!sectionId || !props.eventId) return;
    const refresh = async () => {
      const token = getAccessToken();
      const response = await fetch(
        `${API_URL}/events/${props.eventId}/venues/sections/${sectionId}/seats`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        },
      );
      if (response.ok) setLiveSeats(await response.json());
    };
    const timer = window.setInterval(refresh, props.refreshIntervalMs ?? 5000);
    return () => window.clearInterval(timer);
  }, [props.eventId, props.refreshIntervalMs, props.seats]);

  return render_seat_map({ ...props, seats: liveSeats });
}

function render_seat_map({ seats, sectionName, onSelectSeat, selectedSeatId }: SeatMapProps) {
  const rows = [...new Set(seats.map((s) => s.row))].sort((a, b) => a - b);

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
      <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        {sectionName}
      </h4>
      <div className="flex flex-col items-center gap-1">
        {/* Stage */}
        <div className="w-3/4 h-3 rounded-full bg-gradient-to-r from-purple-500/40 via-purple-400/30 to-purple-500/40 mb-6" />
        <div className="text-[10px] text-gray-600 mb-4 -mt-2">STAGE</div>

        {/* Seats */}
        <div
          className="flex flex-col gap-1.5"
          role="group"
          aria-label={`Seat map for ${sectionName}`}
        >
          {rows.map((rowNum) => {
            const rowSeats = seats.filter((s) => s.row === rowNum).sort((a, b) => a.number - b.number);
            return (
              <div
                key={rowNum}
                className="flex items-center gap-1.5"
                role="group"
                aria-label={`Row ${String.fromCharCode(64 + rowNum)}`}
              >
                <span className="w-5 text-[10px] text-gray-600 text-right" aria-hidden="true">
                  {String.fromCharCode(64 + rowNum)}
                </span>
                <div className="flex gap-1.5">
                  {rowSeats.map((seat) => {
                    const isSelected = seat.id === selectedSeatId;
                    const isAvailable = seat.status === "available";
                    const isHeld = seat.status === "held";
                    const isBooked = seat.status === "booked";

                    return (
                      <button
                        key={seat.id}
                        disabled={!isAvailable}
                        onClick={() => {
                          if (!isAvailable) return;
                          onSelectSeat(seat);
                          announceCartUpdate(injectAriaLabels.seat(seat, true));
                        }}
                        aria-label={injectAriaLabels.seat(seat, isSelected)}
                        aria-pressed={isSelected}
                        aria-disabled={!isAvailable}
                        style={{ width: SEAT_SIZE, height: SEAT_SIZE }}
                        className={`
                          rounded-t-lg text-[9px] font-bold
                          transition-all duration-200 flex items-center justify-center
                          ${isSelected
                            ? "bg-blue-500 text-white scale-110 shadow-lg shadow-blue-500/30"
                            : isBooked
                              ? "bg-red-500/30 text-red-300 cursor-not-allowed"
                              : isHeld
                                ? "bg-yellow-500/30 text-yellow-300 cursor-not-allowed"
                                : "bg-white/[0.08] text-gray-400 hover:bg-blue-500/40 hover:text-blue-300 hover:scale-105 cursor-pointer"
                          }
                        `}
                        title={`${seat.seatIdentifier} - ${seat.status}`}
                      >
                        {seat.number}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
