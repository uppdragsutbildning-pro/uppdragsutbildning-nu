import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Marketplace, MarketplaceBranding } from './marketplaces';

interface MarketplaceContextValue {
  marketplace: Marketplace | null;
  branding: MarketplaceBranding | null;
  loading: boolean;
}

const MarketplaceContext = createContext<MarketplaceContextValue>({
  marketplace: null,
  branding: null,
  loading: false,
});

export function useMarketplace(): MarketplaceContextValue {
  return useContext(MarketplaceContext);
}

// Basdomäner vars subdomän INTE ska tolkas som en marknadsplats-slug
// (huvuddomänen själv, lokal dev, och Vercel-preview-URL:er).
const KNOWN_BASE_HOSTS = ['uppdragsutbildning.nu', 'localhost', 'vercel.app'];

// Slår upp vilken marknadsplats-slug (om någon) den aktuella sidladdningen tillhör.
// Se docs/specs/partnermarknadsplatser.md avsnitt 11: ?via= är den avsedda
// fallbacken för miljöer där riktig subdomän-routing inte är tillgänglig
// (t.ex. lokal dev, eller innan uppdragsutbildning.nu är kopplad i Vercel).
export function resolveMarketplaceSlug(): string | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const viaParam = params.get('via');
  if (viaParam) return viaParam.toLowerCase();

  const hostname = window.location.hostname;
  for (const base of KNOWN_BASE_HOSTS) {
    if (hostname === base) return null;
    if (hostname.endsWith(`.${base}`)) {
      const subdomain = hostname.slice(0, -(base.length + 1));
      if (!subdomain || subdomain === 'www') return null;
      return subdomain.split('.')[0].toLowerCase();
    }
  }
  return null;
}

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const [marketplace, setMarketplace] = useState<Marketplace | null>(null);
  const [branding, setBranding] = useState<MarketplaceBranding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      const slug = resolveMarketplaceSlug();
      if (!slug) {
        setLoading(false);
        return;
      }

      const { data: mp, error } = await supabase
        .from('marketplaces')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (!active) return;
      if (error || !mp) {
        // Okänd, borttagen eller (för anonym besökare) icke-aktiv marknadsplats.
        // Faller tillbaka till kanonisk rendering utan branding, inte 404
        // (docs/specs/partnermarknadsplatser.md avsnitt 11).
        setLoading(false);
        return;
      }

      setMarketplace(mp as Marketplace);

      const { data: br } = await supabase
        .from('marketplace_branding')
        .select('*')
        .eq('marketplace_id', mp.id)
        .maybeSingle();

      if (!active) return;
      setBranding((br as MarketplaceBranding) ?? null);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <MarketplaceContext.Provider value={{ marketplace, branding, loading }}>
      {children}
    </MarketplaceContext.Provider>
  );
}
