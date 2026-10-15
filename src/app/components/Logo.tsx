import { Link } from 'react-router';

interface LogoProps {
  variant?: 'default' | 'light';
  className?: string;
}

// Märket ritas med fast varumärkesblått, inte --accent/--marketplace-primary:
// Logo visas bara på plattformens egen (icke-vitmärkta) vy, och --accent
// betyder något annat utanför .ub-theme (shadcn-token).
export function Logo({ variant = 'default', className = '' }: LogoProps) {
  const isLight = variant === 'light';
  const brand = isLight ? '#4A7FD4' : '#2655C4';

  return (
    <Link to="/" className={`flex items-center gap-2.5 shrink-0 whitespace-nowrap ${className}`} aria-label="Uppdragsutbildning.nu">
      <svg width="26" height="31" viewBox="0 0 108 116" fill="none" aria-hidden="true" className="shrink-0 block">
        <path
          d="M9 0H99C101.387 0 103.676 0.905288 105.364 2.51671C107.052 4.12814 108 6.3137 108 8.59259V49.4074C108 79.4815 85.5 100.963 54 116C22.5 100.963 0 79.4815 0 49.4074V8.59259C0 6.3137 0.948211 4.12814 2.63604 2.51671C4.32387 0.905288 6.61305 0 9 0Z"
          fill={brand}
        />
        <g transform="translate(24.865, 16)">
          <path
            d="M18.7197 39.2637C18.7197 42.9117 19.5518 45.7279 21.2158 47.7119C22.9438 49.6958 25.5354 50.6884 28.9912 50.6885C32.4472 50.6885 35.0396 49.6959 36.7676 47.7119C38.5595 45.6639 39.4551 42.8476 39.4551 39.2637V0H58.2715V39.2637C58.2715 45.4716 56.9599 50.7842 54.3359 55.2002C51.712 59.5521 48.1278 62.8479 43.584 65.0879C39.104 67.2639 34.1114 68.3525 28.6074 68.3525C23.1035 68.3525 18.1752 67.2639 13.8232 65.0879C9.5354 62.8479 6.1434 59.5521 3.64746 55.2002C1.21546 50.8482 0 45.5357 0 39.2637V0H18.7197V39.2637Z"
            fill="white"
          />
        </g>
      </svg>
      <span
        className="text-lg tracking-[0.01em]"
        style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, color: brand }}
      >
        {isLight ? 'Uppdragsutbildning.nu' : 'Uppdragsutbildning'}
      </span>
    </Link>
  );
}
