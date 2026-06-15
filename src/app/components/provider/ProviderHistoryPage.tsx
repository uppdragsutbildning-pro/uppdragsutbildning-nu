import { Calendar, TrendingUp, Users, BookOpen, Filter } from 'lucide-react';
import { useState } from 'react';

export function ProviderHistoryPage() {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month');

  const stats = [
    { label: 'Totala visningar', value: '12,487', change: '+24%', icon: TrendingUp },
    { label: 'Totala förfrågningar', value: '342', change: '+18%', icon: Users },
    { label: 'Publicerade kurser', value: '12', change: '+2', icon: BookOpen },
    { label: 'Bekräftade anmälningar', value: '87', change: '+12%', icon: Users },
  ];

  const activityLog = [
    { date: '2026-05-15', type: 'application', description: 'Ny kursanmälan: Anna Svensson - Miljöpsykologi och beteendedesign' },
    { date: '2026-05-15', type: 'request', description: 'Ny förfrågan: Scania AB - Ledarskap i hållbar omställning' },
    { date: '2026-05-14', type: 'response', description: 'Svar skickat till SEB angående AI & Maskininlärning' },
    { date: '2026-05-14', type: 'application', description: 'Anmälan bekräftad: Erik Andersson - AI i Hälso- och sjukvård' },
    { date: '2026-05-13', type: 'course', description: 'Kurs uppdaterad: Säkerhetsanalys och riskhantering' },
    { date: '2026-05-13', type: 'request', description: 'Ny förfrågan: Uppsala Kommun - Digital tillgänglighet' },
    { date: '2026-05-12', type: 'application', description: 'Ny kursanmälan: Maria Larsson - Säkerhetsanalys och riskhantering' },
    { date: '2026-05-11', type: 'course', description: 'Ny kurs publicerad: Cybersäkerhet för ledningsgrupper' },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'application':
        return '👤';
      case 'request':
        return '💼';
      case 'response':
        return '✉️';
      case 'course':
        return '📚';
      default:
        return '📋';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Historik</h1>
        <p className="text-slate-600">Översikt över din aktivitet och statistik</p>
      </div>

      {/* Time range selector */}
      <div className="flex gap-2">
        {[
          { value: 'week', label: 'Senaste veckan' },
          { value: 'month', label: 'Senaste månaden' },
          { value: 'year', label: 'Senaste året' },
        ].map((range) => (
          <button
            key={range.value}
            onClick={() => setTimeRange(range.value as any)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              timeRange === range.value
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm text-emerald-600 font-medium">{stat.change}</span>
              </div>
              <div className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</div>
              <div className="text-sm text-slate-600">{stat.label}</div>
            </div>
          );
        })}
      </div>

      {/* Activity log */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">Aktivitetslogg</h2>
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors text-sm font-medium">
            <Filter className="w-4 h-4" />
            Filtrera
          </button>
        </div>

        <div className="space-y-4">
          {activityLog.map((activity, i) => (
            <div key={i} className="flex items-start gap-4 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-xl">
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 font-medium mb-1">{activity.description}</p>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {new Date(activity.date).toLocaleDateString('sv-SE', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
