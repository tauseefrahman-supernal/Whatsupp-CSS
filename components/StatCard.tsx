"use client";

/** Deck-style stat card — mono eyebrow, Poppins value, optional sub line. */
export function StatCard({
  label,
  value,
  suffix,
  sub,
  lime,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  sub?: string;
  lime?: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="k">{label}</div>
      <div className={["v", lime ? "lime" : ""].join(" ")}>
        {value}
        {suffix && <small> {suffix}</small>}
      </div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}
