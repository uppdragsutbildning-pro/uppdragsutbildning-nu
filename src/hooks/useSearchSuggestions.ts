import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useMarketplace } from '../lib/marketplaceContext';
import { getMarketplaceTrainingIds } from '../lib/marketplaces';
import { NEED_CHIPS, composeSuggestions } from '../lib/searchSuggestions';

interface TrainingRow {
  title: string;
  views: number | null;
  categories: { name: string } | { name: string }[] | null;
}

// Förslagen under sökfältet: mest sökta sökningar, populära områden (kategorier) och populära
// kurser. Medan data hämtas, eller om hämtningen misslyckas, visas reservförslagen.
export function useSearchSuggestions(limit = 6): string[] {
  const { marketplace, loading: marketplaceLoading } = useMarketplace();
  const marketplaceId = marketplace?.id ?? null;
  const [popular, setPopular] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [courses, setCourses] = useState<string[]>([]);

  useEffect(() => {
    if (marketplaceLoading) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase.rpc('popular_searches', {
        p_limit: 4,
        p_marketplace_id: marketplaceId,
      });
      if (active && !error && Array.isArray(data)) {
        setPopular((data as { query: string }[]).map(r => r.query));
      }
    })();
    return () => {
      active = false;
    };
  }, [marketplaceId, marketplaceLoading]);

  useEffect(() => {
    if (marketplaceLoading) return;
    let active = true;
    (async () => {
      // På en partnermarknadsplats räknas bara det kuraterade urvalet.
      const scopedIds = marketplace ? await getMarketplaceTrainingIds(marketplace) : null;
      if (scopedIds && scopedIds.length === 0) {
        if (active) {
          setAreas([]);
          setCourses([]);
        }
        return;
      }
      let query = supabase
        .from('trainings')
        .select('title, views, categories(name)')
        .eq('is_active', true)
        .order('views', { ascending: false })
        .limit(40);
      if (scopedIds) query = query.in('id', scopedIds);
      const { data, error } = await query;
      if (!active || error || !data) return;

      const rows = data as unknown as TrainingRow[];
      const viewsByArea = new Map<string, number>();
      for (const row of rows) {
        const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
        if (category?.name) viewsByArea.set(category.name, (viewsByArea.get(category.name) ?? 0) + (row.views ?? 0));
      }
      setAreas([...viewsByArea.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name));
      setCourses(rows.map(r => r.title));
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketplaceId, marketplaceLoading]);

  const suggestions = composeSuggestions({ popular, areas, courses, limit });
  return suggestions.length > 0 ? suggestions : NEED_CHIPS.slice(0, limit);
}
