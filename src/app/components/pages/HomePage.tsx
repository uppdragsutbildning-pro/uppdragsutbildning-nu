import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowRight, BarChart3, Search } from 'lucide-react';
import { useRef, useState, type CSSProperties } from 'react';
import { universityPartners } from '../../data/providerLogos';
import { useMarketplace } from '../../../lib/marketplaceContext';
import { Button } from '../ui/button';

const NEED_CHIPS = [
  'Ledarskap i förändring',
  'AI i verksamheten',
  'Hållbarhet och CSRD',
  'Projektledning',
  'Digital kompetens',
  'Arbetsmiljö och välmående',
];

const STEPS = [
  'Beskriv vad er organisation behöver utveckla — med egna ord eller via ett av våra förslag.',
  'Få konkreta förslag och offerter från lärosäten som matchar ert behov och er storlek.',
  'Välj, signera digitalt och kom igång — vi finns med längs hela vägen.',
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[var(--fg-subtle)] mb-3">
      {children}
    </p>
  );
}

export function HomePage() {
  const [query, setQuery] = useState('');
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { marketplace, branding } = useMarketplace();

  // Partnermarknadsplats: primärfärgen kommer från marknadsplatsens branding
  // (hover-/dim-varianter härleds i redesign.css via data-brand="custom").
  const customBrand = !!marketplace && !!branding?.primary_color;
  const themeStyle = customBrand
    ? ({ '--accent': branding!.primary_color } as CSSProperties)
    : undefined;

  function search(q: string) {
    const trimmed = q.trim();
    navigate(trimmed ? `/catalog?q=${encodeURIComponent(trimmed)}` : '/catalog');
  }

  function selectChip(chip: string) {
    if (activeChip === chip) {
      setActiveChip(null);
      setQuery('');
    } else {
      setActiveChip(chip);
      setQuery(chip);
      inputRef.current?.focus();
    }
  }

  function openCompetensindex() {
    const via = new URLSearchParams(location.search).get('via');
    navigate({
      pathname: '/kompetensanalys',
      search: via ? `?via=${encodeURIComponent(via)}` : '',
    });
  }

  return (
    <div className="ub-theme" data-brand={customBrand ? 'custom' : undefined} style={themeStyle}>
      {/* Hero */}
      <section className="px-5 pt-[clamp(48px,8vw,100px)] pb-[clamp(36px,6vw,72px)]">
        <div className="max-w-[1100px] mx-auto flex items-center gap-14">
          <div className="flex-1 min-w-0 text-center min-[900px]:text-left">
            <p className="text-xs font-medium tracking-[0.12em] uppercase text-[var(--fg-subtle)] mb-6">
              AI-driven marknadsplats för utbildning
            </p>

            <h1 className="text-[clamp(2.1rem,5vw,3.2rem)] font-bold leading-[1.12] tracking-[-0.03em] text-[var(--fg)] mb-10">
              Vad behöver ni
              <br />
              <span className="text-[var(--fg-muted)] font-normal italic">
                utveckla i er organisation?
              </span>
            </h1>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                search(query);
              }}
              className="mb-5"
            >
              <div className="flex items-center bg-[var(--bg-raised)] border-[1.5px] border-[var(--border)] rounded-[14px] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-dim),0_2px_12px_rgba(0,0,0,0.06)]">
                <Search className="ml-[18px] w-[18px] h-[18px] shrink-0 text-[var(--fg-subtle)]" aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveChip(null);
                  }}
                  placeholder="T.ex. våra chefer behöver leda bättre i förändring"
                  aria-label="Beskriv ert utbildningsbehov"
                  className="flex-1 min-w-0 px-4 py-[18px] text-base text-[var(--fg)] bg-transparent outline-none placeholder:text-[var(--fg-subtle)]"
                />
                <button
                  type="submit"
                  className="m-1.5 px-3.5 sm:px-[22px] py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold rounded-[10px] flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
                >
                  <span className="hidden sm:inline">Hitta utbildning</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  <span className="sr-only sm:hidden">Hitta utbildning</span>
                </button>
              </div>
            </form>

            <div className="flex flex-wrap justify-center min-[900px]:justify-start gap-2 mb-8">
              {NEED_CHIPS.map((chip) => {
                const active = activeChip === chip;
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => selectChip(chip)}
                    aria-pressed={active}
                    className={`px-4 py-2 rounded-full text-[13px] font-normal border-[1.5px] transition-colors ${
                      active
                        ? 'bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--accent)]'
                        : 'bg-[var(--chip-bg)] text-[var(--chip-fg)] border-transparent hover:bg-[var(--chip-hover)]'
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 mt-1 mb-3.5">
              <div className="flex-1 h-px bg-[var(--border-light)]" />
              <span className="text-[11px] font-medium text-[var(--fg-subtle)] whitespace-nowrap">
                eller kartlägg behovet strategiskt
              </span>
              <div className="flex-1 h-px bg-[var(--border-light)]" />
            </div>
            <div className="flex flex-col gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={openCompetensindex}
                className="group h-auto w-full justify-start whitespace-normal rounded-xl border-[var(--accent)] bg-[var(--accent-dim)] p-4 text-left hover:border-[var(--accent)] hover:bg-[var(--accent-dim)]"
              >
                <span className="flex w-full flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent)] text-white">
                    <BarChart3 className="size-[18px]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                      För HR och ledning
                    </span>
                    <span className="mb-0.5 block text-[13px] font-semibold text-[var(--fg)]">
                      Strategisk kompetensindex®
                    </span>
                    <span className="block text-[11px] leading-[1.4] text-[var(--fg-muted)]">
                      Få en strukturerad bild av organisationens kompetenstryck i fyra dimensioner.
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[13px] font-semibold text-[var(--accent)]">
                    Starta Kompetensindex
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </span>
              </Button>
            </div>
          </div>

          <div className="hidden min-[900px]:block flex-[0_0_340px]">
            <div className="rounded-[20px] overflow-hidden border border-[var(--border-light)] shadow-[0_8px_32px_rgba(0,0,0,0.10)] bg-[var(--chip-bg)]">
              <img
                src="https://images.unsplash.com/photo-1573167507387-6b4b98cb7c13?w=680&h=520&fit=crop&auto=format"
                alt="Yrkesverksamma i kompetensutveckling"
                className="w-full block aspect-[340/260] object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Lärosäten */}
      <section className="border-y border-[var(--border-light)] px-6 py-9">
        <div className="max-w-[900px] mx-auto text-center">
          <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[var(--fg-subtle)] mb-6">
            Utbildningar från Sveriges lärosäten
          </p>
          <div className="flex flex-wrap gap-2.5 justify-center">
            {universityPartners.map((partner) => (
              <div
                key={partner.id}
                title={partner.name}
                className="flex items-center justify-center px-5 py-2.5 rounded-[10px] border border-[var(--border-light)] bg-[var(--bg-raised)] h-[60px] min-w-[100px]"
              >
                <img
                  src={partner.logo}
                  alt={partner.name}
                  className="ub-uni-logo max-h-8 max-w-[120px] object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Så fungerar det */}
      <section id="how" className="px-6 py-[clamp(64px,8vw,100px)]">
        <div className="max-w-[900px] mx-auto">
          <Eyebrow>Så fungerar det</Eyebrow>
          <h2 className="text-[clamp(1.6rem,3.5vw,2.4rem)] font-bold leading-[1.15] tracking-[-0.025em] text-[var(--fg)] max-w-[520px] mb-14">
            Tre steg från behov till utbildning
          </h2>
          <ol className="grid grid-cols-1 md:grid-cols-3">
            {STEPS.map((text, i) => (
              <li
                key={i}
                className={`py-8 border-t border-[var(--border-light)] first:border-t-0 md:border-t-0 md:py-8 ${
                  i < 2 ? 'md:pr-10 md:border-r' : ''
                } ${i > 0 ? 'md:pl-10' : ''} md:border-[var(--border-light)]`}
              >
                <div className="w-9 h-9 rounded-[10px] bg-[var(--accent-dim)] flex items-center justify-center text-[15px] font-bold text-[var(--accent)] mb-5">
                  {i + 1}
                </div>
                <p className="text-[15px] leading-[1.65] text-[var(--fg-muted)]">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-[clamp(64px,8vw,100px)] text-center">
        <div className="max-w-[560px] mx-auto">
          <h2 className="text-[clamp(1.6rem,3.5vw,2.4rem)] font-bold leading-[1.15] tracking-[-0.025em] text-[var(--fg)] mb-4">
            Redo att komma igång?
          </h2>
          <p className="text-base text-[var(--fg-muted)] leading-[1.7] mb-9">
            Beskriv ert behov så återkommer vi med konkreta förslag — utan förpliktelser.
          </p>
          <Link
            to="/request"
            className="inline-flex items-center gap-2 px-7 py-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[15px] font-semibold rounded-xl transition-colors"
          >
            Beskriv ert behov
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
          <p className="mt-5 text-[13px] text-[var(--fg-subtle)]">Kostnadsfritt att söka</p>
        </div>
      </section>
    </div>
  );
}
