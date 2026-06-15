import { X, SlidersHorizontal } from 'lucide-react';
import { categories } from '../data/mockData';

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: {
    categories: string[];
    formats: string[];
    priceRange: [number, number];
    duration: string;
  };
  onFilterChange: (filters: any) => void;
}

export function FilterPanel({ isOpen, onClose, filters, onFilterChange }: FilterPanelProps) {
  if (!isOpen) return null;

  const toggleCategory = (categoryId: string) => {
    const newCategories = filters.categories.includes(categoryId)
      ? filters.categories.filter(c => c !== categoryId)
      : [...filters.categories, categoryId];
    onFilterChange({ ...filters, categories: newCategories });
  };

  const toggleFormat = (format: string) => {
    const newFormats = filters.formats.includes(format)
      ? filters.formats.filter(f => f !== format)
      : [...filters.formats, format];
    onFilterChange({ ...filters, formats: newFormats });
  };

  const clearFilters = () => {
    onFilterChange({
      categories: [],
      formats: [],
      priceRange: [0, 1000000],
      duration: 'all'
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed lg:sticky top-0 right-0 h-screen w-full sm:w-80 bg-white shadow-xl z-50 lg:z-0 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-slate-700" />
              <h2 className="text-lg font-semibold text-slate-900">Filter</h2>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Clear Filters */}
          <button
            onClick={clearFilters}
            className="w-full mb-6 text-sm text-blue-600 hover:text-blue-700 font-medium text-left"
          >
            Rensa alla filter
          </button>

          {/* Categories */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Kategorier</h3>
            <div className="space-y-2">
              {categories.map(category => (
                <label key={category.id} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.categories.includes(category.id)}
                    onChange={() => toggleCategory(category.id)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">{category.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Format */}
          <div className="mb-6 pb-6 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Format</h3>
            <div className="space-y-2">
              {['online', 'onsite', 'hybrid'].map(format => (
                <label key={format} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.formats.includes(format)}
                    onChange={() => toggleFormat(format)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700 capitalize">
                    {format === 'online' ? 'Online' : format === 'onsite' ? 'På Plats' : 'Hybrid'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div className="mb-6 pb-6 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Prisintervall</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Min</span>
                <span className="font-medium text-slate-900">
                  {filters.priceRange[0].toLocaleString('sv-SE')} SEK
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1000000"
                step="10000"
                value={filters.priceRange[0]}
                onChange={(e) => onFilterChange({ 
                  ...filters, 
                  priceRange: [parseInt(e.target.value), filters.priceRange[1]] 
                })}
                className="w-full"
              />
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Max</span>
                <span className="font-medium text-slate-900">
                  {filters.priceRange[1].toLocaleString('sv-SE')} SEK
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1000000"
                step="10000"
                value={filters.priceRange[1]}
                onChange={(e) => onFilterChange({ 
                  ...filters, 
                  priceRange: [filters.priceRange[0], parseInt(e.target.value)] 
                })}
                className="w-full"
              />
            </div>
          </div>

          {/* Duration */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Längd</h3>
            <div className="space-y-2">
              {[
                { value: 'all', label: 'Alla längder' },
                { value: 'short', label: '1-3 dagar' },
                { value: 'medium', label: '1-4 veckor' },
                { value: 'long', label: '1+ månader' }
              ].map(option => (
                <label key={option.value} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="duration"
                    checked={filters.duration === option.value}
                    onChange={() => onFilterChange({ ...filters, duration: option.value })}
                    className="w-4 h-4 border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Apply button (mobile) */}
          <button
            onClick={onClose}
            className="lg:hidden w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Visa Resultat
          </button>
        </div>
      </div>
    </>
  );
}
