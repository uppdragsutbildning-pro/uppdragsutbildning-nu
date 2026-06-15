import { Link } from 'react-router';

interface LogoProps {
  variant?: 'default' | 'light';
  className?: string;
}

export function Logo({ variant = 'default', className = '' }: LogoProps) {
  const isLight = variant === 'light';

  return (
    <Link to="/" className={`flex items-center ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 639.45 72.51"
        className="h-8 w-auto"
        style={isLight ? { filter: 'brightness(0) invert(1)' } : undefined}
        aria-label="Uppdragsutbildning.nu"
      >
        <defs>
          <style>{`
            .logo-text {
              fill: #231f20;
              font-family: Inter, sans-serif;
              font-size: 48px;
              font-weight: 700;
            }
            .logo-ls-0 { letter-spacing: 0em; }
            .logo-ls-1 { letter-spacing: .01em; }
          `}</style>
        </defs>
        <g>
          <path fill="#0f172c" d="M30.14,72.51c-6.02,0-11.3-1.02-15.83-3.05-4.53-2.03-8.05-4.86-10.55-8.49-2.5-3.62-3.76-7.86-3.76-12.7V10.07h14.97v37.09c0,2.58.63,4.88,1.89,6.88,1.26,2,3.03,3.58,5.3,4.72,2.27,1.14,4.93,1.72,7.98,1.72s5.75-.57,8.03-1.72c2.27-1.14,4.04-2.72,5.3-4.72,1.26-2,1.89-4.3,1.89-6.88v-29.07h15.02v30.19c0,4.84-1.26,9.07-3.78,12.7-2.52,3.62-6.05,6.45-10.58,8.49-4.53,2.03-9.83,3.05-15.88,3.05Z"/>
          <rect fill="#3d59a8" x="45.35" width="15.03" height="11.6"/>
          <text className="logo-text" transform="translate(85.05 53.23)">
            <tspan className="logo-ls-1" x="0" y="0">Uppd</tspan>
            <tspan className="logo-ls-0" x="128.21" y="0">r</tspan>
            <tspan className="logo-ls-1" x="147.68" y="0">agsu</tspan>
            <tspan className="logo-ls-1" x="264.94" y="0">t</tspan>
            <tspan className="logo-ls-1" x="283.21" y="0">bildning.nu</tspan>
          </text>
        </g>
      </svg>
    </Link>
  );
}
