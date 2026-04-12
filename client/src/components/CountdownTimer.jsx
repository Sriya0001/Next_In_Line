import { useEffect, useState } from 'react';

/**
 * Live countdown timer.
 * Shows time remaining until the deadline in HH:MM:SS format.
 * Changes color class at < 6h (warning) and < 1h (critical).
 */
export default function CountdownTimer({ deadlineISO }) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!deadlineISO) return;

    const calc = () => {
      const diff = new Date(deadlineISO).getTime() - Date.now();
      setRemaining(diff);
    };

    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [deadlineISO]);

  if (remaining === null || !deadlineISO) return null;

  if (remaining <= 0) {
    return <span className="countdown expired">Expired</span>;
  }

  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  const fmt = (n) => String(n).padStart(2, '0');
  const display = `${fmt(hours)}:${fmt(minutes)}:${fmt(seconds)}`;

  const cls =
    remaining < 3600000 ? 'critical' :   // < 1h
    remaining < 21600000 ? 'warning' :    // < 6h
    '';

  return (
    <span className={`countdown ${cls}`} title="Time to acknowledge">
      ⏱ {display}
    </span>
  );
}
