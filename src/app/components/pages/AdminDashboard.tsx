import { useState, useEffect } from 'react';
import { Check, X, Eye, TrendingUp, Users, Building, GraduationCap, Mail, Sparkles, Download, UserPlus, Shield, UserCog } from 'lucide-react';
import { trainings, leads, providers, categories, getTrainingById, getProviderById, getCategoryById } from '../../data/mockData';
import { toast } from 'sonner';
import { exportLeadsToCSV, exportTrainingsToCSV } from '../../utils/exportUtils';
import { supabase, Profile, Provider, CustomRequest } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { usePaginatedQuery, getPaginationRange } from '../../../hooks/usePaginatedQuery';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '../ui/pagination';

type Tab = 'overview' | 'trainings' | 'leads' | 'providers' | 'users' | 'kompetensindex';

interface CpiRecord {
  id: string;
  company_name: string;
  industry: string;
  company_size: string;
  respondent_role: string;
  scores: { AF: number; PF: number; OK: number; TR: number; total: number };
  si_scores: { SI1: number; SI2: number; SI3: number; SI4: number };
  freetext: { af4: string; pf5: string; tr4: string };
  li_preferences: { insatstyp: string[]; upplägg: string[]; målgrupp: string[] };
  created_at: string;
}

export function AdminDashboard() {
  const { signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<(Profile & { provider_name?: string })[]>([]);
  const [supabaseProviders, setSupabaseProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [showCreateProvider, setShowCreateProvider] = useState(false);
  const [leadsFilter, setLeadsFilter] = useState<'all' | 'unmatched'>('all');
  const [avgScores, setAvgScores] = useState<{ AF: number; PF: number; OK: number; TR: number } | null>(null);

  // Form state for creating new provider
  const [newProvider, setNewProvider] = useState({
    name: '',
    type: 'universitet' as 'universitet' | 'högskola' | 'yrkeshögskola',
    description: '',
    website_url: '',
    contact_email: '',
    contact_phone: ''
  });

  // Form state for creating new user
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'provider' as 'admin' | 'provider',
    provider_id: ''
  });

  const stats = {
    totalTrainings: trainings.length,
    totalProviders: providers.length,
    totalLeads: leads.length,
    pendingApprovals: 3
  };

  // Load users and providers from Supabase
  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
      loadProviders();
    }
    if (activeTab === 'providers') {
      loadProviders();
    }
  }, [activeTab]);

  // Lätt anrop (bara scores-kolumnen) för snittstatistik över ALLA analyser,
  // oberoende av vilken sida av cpiRecords som visas i tabellen.
  useEffect(() => {
    if (activeTab !== 'kompetensindex') return;
    (async () => {
      const { data, error } = await supabase.from('cpi_results').select('scores');
      if (error || !data || !data.length) {
        setAvgScores(null);
        return;
      }
      const totals = { AF: 0, PF: 0, OK: 0, TR: 0 };
      for (const row of data as { scores: CpiRecord['scores'] }[]) {
        totals.AF += row.scores?.AF ?? 0;
        totals.PF += row.scores?.PF ?? 0;
        totals.OK += row.scores?.OK ?? 0;
        totals.TR += row.scores?.TR ?? 0;
      }
      setAvgScores({
        AF: Math.round(totals.AF / data.length),
        PF: Math.round(totals.PF / data.length),
        OK: Math.round(totals.OK / data.length),
        TR: Math.round(totals.TR / data.length),
      });
    })();
  }, [activeTab]);

  const {
    rows: customRequests,
    page: requestsPage,
    setPage: setRequestsPage,
    totalPages: requestsTotalPages,
    loading: requestsLoading,
  } = usePaginatedQuery<CustomRequest>({
    pageSize: 20,
    deps: [activeTab, leadsFilter],
    queryFn: async ({ from, to }) => {
      if (activeTab !== 'leads') return { data: [], count: 0, error: null };
      let query = supabase
        .from('custom_requests')
        .select('*', { count: 'exact' })
        .order('has_provider_match', { ascending: true })
        .order('submitted_at', { ascending: false });
      if (leadsFilter === 'unmatched') query = query.eq('has_provider_match', false);
      return query.range(from, to);
    },
  });

  const {
    rows: cpiRecords,
    page: cpiPage,
    setPage: setCpiPage,
    totalPages: cpiTotalPages,
    loading: cpiLoading,
    count: cpiTotalRecords,
  } = usePaginatedQuery<CpiRecord>({
    pageSize: 25,
    deps: [activeTab],
    queryFn: async ({ from, to }) => {
      if (activeTab !== 'kompetensindex') return { data: [], count: 0, error: null };
      return supabase
        .from('cpi_results')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
    },
  });

  async function exportCpiToCSV() {
    const { data, error } = await supabase
      .from('cpi_results')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data || !data.length) return;
    const records = data as CpiRecord[];
    const headers = ['Datum', 'Företag', 'Bransch', 'Storlek', 'Roll', 'Total', 'AF', 'PF', 'OK', 'TR', 'SI1', 'SI2', 'SI3', 'SI4'];
    const rows = records.map((r) => [
      new Date(r.created_at).toLocaleDateString('sv-SE'),
      r.company_name,
      r.industry,
      r.company_size,
      r.respondent_role,
      r.scores?.total ?? '',
      r.scores?.AF ?? '',
      r.scores?.PF ?? '',
      r.scores?.OK ?? '',
      r.scores?.TR ?? '',
      r.si_scores?.SI1 ?? '',
      r.si_scores?.SI2 ?? '',
      r.si_scores?.SI3 ?? '',
      r.si_scores?.SI4 ?? '',
    ]);
    const csv = [headers, ...rows].map((r) => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kompetensindex-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadUsers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          providers:provider_id (name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const usersWithProviderName = data.map(user => ({
        ...user,
        provider_name: user.providers?.name
      }));

      setUsers(usersWithProviderName);
    } catch (error: any) {
      toast.error('Kunde inte ladda användare', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadProviders() {
    try {
      const { data, error } = await supabase
        .from('providers')
        .select('*')
        .order('name');

      if (error) throw error;
      setSupabaseProviders(data || []);
    } catch (error: any) {
      console.error('Error loading providers:', error);
      toast.error('Kunde inte ladda leverantörer', {
        description: error.message
      });
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreatingUser(true);
    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUser.email,
          password: newUser.password,
          full_name: newUser.full_name,
          role: newUser.role,
          provider_id: newUser.provider_id || null,
          phone: newUser.phone || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Okänt fel');
      toast.success('Användare skapad!', { description: `${newUser.email} har fått ett konto.` });
      setNewUser({ email: '', password: '', full_name: '', phone: '', role: 'provider', provider_id: '' });
      setShowCreateUser(false);
      loadUsers();
    } catch (err: unknown) {
      toast.error('Kunde inte skapa användare', { description: err instanceof Error ? err.message : 'Okänt fel' });
    } finally {
      setCreatingUser(false);
    }
  }

  async function toggleUserActive(userId: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) throw error;

      toast.success(currentStatus ? 'Användare inaktiverad' : 'Användare aktiverad');
      loadUsers();
    } catch (error: any) {
      toast.error('Kunde inte uppdatera användare', {
        description: error.message
      });
    }
  }

  async function handleLogout() {
    await signOut();
    window.location.href = '/';
  }

  async function handleCreateProvider(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('providers')
        .insert({
          name: newProvider.name,
          type: newProvider.type,
          description: newProvider.description,
          website_url: newProvider.website_url || null,
          contact_email: newProvider.contact_email || null,
          contact_phone: newProvider.contact_phone || null,
          is_active: true
        });

      if (error) throw error;

      toast.success('Leverantör skapad!', {
        description: `${newProvider.name} har lagts till`
      });

      setShowCreateProvider(false);
      setNewProvider({
        name: '',
        type: 'universitet',
        description: '',
        website_url: '',
        contact_email: '',
        contact_phone: ''
      });
      loadProviders();
    } catch (error: any) {
      toast.error('Kunde inte skapa leverantör', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  }

  async function toggleProviderActive(providerId: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from('providers')
        .update({ is_active: !currentStatus })
        .eq('id', providerId);

      if (error) throw error;

      toast.success(currentStatus ? 'Leverantör inaktiverad' : 'Leverantör aktiverad');
      loadProviders();
    } catch (error: any) {
      toast.error('Kunde inte uppdatera leverantör', {
        description: error.message
      });
    }
  }

  return (
    <div className="bg-slate-50 min-h-screen pb-16">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">
                Administratörspanel
              </h1>
              <p className="text-slate-600">
                Hantera marknadsplatsen Uppdragsutbildning.nu
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Logga ut
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 mt-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Översikt
            </button>
            <button
              onClick={() => setActiveTab('trainings')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'trainings'
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Utbildningar
            </button>
            <button
              onClick={() => setActiveTab('leads')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'leads'
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Alla Förfrågningar
            </button>
            <button
              onClick={() => setActiveTab('providers')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'providers'
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Leverantörer
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'users'
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Användare
            </button>
            <button
              onClick={() => setActiveTab('kompetensindex')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'kompetensindex'
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Kompetensindex
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            {/* Stats Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">{stats.totalTrainings}</div>
                    <div className="text-sm text-slate-600">Totala Utbildningar</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Building className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">{stats.totalProviders}</div>
                    <div className="text-sm text-slate-600">Leverantörer</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Mail className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">{stats.totalLeads}</div>
                    <div className="text-sm text-slate-600">Totala Förfrågningar</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">{stats.pendingApprovals}</div>
                    <div className="text-sm text-slate-600">Väntande Godkännanden</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Category Performance */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-6">Kategoriprestanda</h2>
              <div className="space-y-4">
                {categories.map(category => {
                  const categoryTrainings = trainings.filter(t => t.categoryId === category.id);
                  const totalViews = categoryTrainings.reduce((sum, t) => sum + t.views, 0);
                  const totalLeads = categoryTrainings.reduce((sum, t) => sum + t.leads, 0);

                  return (
                    <div key={category.id} className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-900">{category.name}</span>
                          <span className="text-xs text-slate-600">
                            {categoryTrainings.length} utbildningar • {totalViews} visningar • {totalLeads} förfrågningar
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full"
                            style={{ width: `${(totalLeads / totalViews) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-6">Senaste Aktivitet</h2>
              <div className="space-y-4">
                {leads.slice(0, 5).map(lead => {
                  const training = lead.trainingId ? getTrainingById(lead.trainingId) : null;
                  return (
                    <div key={lead.id} className="flex items-start gap-4 pb-4 border-b border-slate-100 last:border-0">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Mail className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="font-medium text-slate-900">
                            Ny förfrågan från {lead.companyName}
                          </div>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            lead.aiScore === 'high' ? 'bg-green-100 text-green-700' :
                            lead.aiScore === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {lead.aiScore === 'high' ? 'HÖG' : lead.aiScore === 'medium' ? 'MEDEL' : 'LÅG'}
                          </span>
                        </div>
                        <div className="text-sm text-slate-600">
                          {training ? `Intresserad av: ${training.title}` : 'Allmän förfrågan'}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {new Date(lead.createdAt).toLocaleDateString('sv-SE', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Trainings Tab */}
        {activeTab === 'trainings' && (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Alla Utbildningsprogram
              </h2>
              <p className="text-sm text-slate-600">
                Granska och hantera utbildningsannonser
              </p>
            </div>

            <div className="space-y-4">
              {trainings.map(training => {
                const provider = getProviderById(training.providerId);
                const category = getCategoryById(training.categoryId);

                return (
                  <div key={training.id} className="bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-slate-900">{training.title}</h3>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                            {category?.name}
                          </span>
                          {training.featured && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                              Utvald
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mb-2">
                          Leverantör: {provider?.name}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span>{training.views} visningar</span>
                          <span>•</span>
                          <span>{training.leads} förfrågningar</span>
                          <span>•</span>
                          <span className="capitalize">{training.format}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="p-2 hover:bg-green-50 text-green-600 rounded-lg transition-colors">
                          <Check className="w-5 h-5" />
                        </button>
                        <button className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors">
                          <X className="w-5 h-5" />
                        </button>
                        <button className="p-2 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors">
                          <Eye className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6">
              <button
                onClick={() => {
                  exportTrainingsToCSV(trainings);
                  toast.success('Utbildningar exporterade till CSV!');
                }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <Download className="w-5 h-5" />
                Exportera Utbildningar
              </button>
            </div>
          </div>
        )}

        {/* Leads Tab */}
        {activeTab === 'leads' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">
                  Alla Förfrågningar
                </h2>
                <p className="text-sm text-slate-600">
                  Övervaka och hantera alla utbildningsförfrågningar
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setLeadsFilter('all')}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${leadsFilter === 'all' ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  Alla
                </button>
                <button
                  onClick={() => setLeadsFilter('unmatched')}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${leadsFilter === 'unmatched' ? 'bg-red-600 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  Ej matchade
                </button>
              </div>
            </div>

            {requestsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {customRequests.map(req => (
                  <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="font-semibold text-slate-900">{req.company}</h3>
                          {req.has_provider_match === false && (
                            <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700 font-medium">
                              Ej matchad
                            </span>
                          )}
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            req.ai_score === 'high' ? 'bg-green-100 text-green-700' :
                            req.ai_score === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {req.ai_score === 'high' ? 'HÖG' : req.ai_score === 'medium' ? 'MEDEL' : 'LÅG'}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            req.status === 'new' ? 'bg-blue-100 text-blue-700' :
                            req.status === 'responded' ? 'bg-amber-100 text-amber-700' :
                            req.status === 'accepted' ? 'bg-green-100 text-green-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {req.status === 'new' ? 'Ny' :
                             req.status === 'responded' ? 'Besvarad' :
                             req.status === 'negotiating' ? 'Förhandling' :
                             req.status === 'accepted' ? 'Accepterad' : 'Avböjd'}
                          </span>
                        </div>

                        <p className="text-sm font-medium text-slate-800 mb-1">{req.course_topic}</p>
                        <p className="text-sm text-slate-600 mb-3 line-clamp-2">{req.description}</p>

                        {req.recommended_categories && req.recommended_categories.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {req.recommended_categories.map((cat, i) => (
                              <span key={i} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                          <span>Kontakt: {req.contact_name}</span>
                          <span>•</span>
                          <span>{req.contact_email}</span>
                          <span>•</span>
                          <span>Tidsplan: {req.timeline}</span>
                          {req.budget && (
                            <>
                              <span>•</span>
                              <span>Budget: {req.budget}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>{new Date(req.submitted_at).toLocaleDateString('sv-SE')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {customRequests.length === 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                    <Mail className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">Inga förfrågningar hittades</p>
                  </div>
                )}
              </div>
            )}

            {requestsTotalPages > 1 && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); if (requestsPage > 1) setRequestsPage(requestsPage - 1); }}
                      className={requestsPage === 1 ? 'pointer-events-none opacity-50' : ''}
                    />
                  </PaginationItem>
                  {getPaginationRange(requestsPage, requestsTotalPages).map((p, i) =>
                    p === 'ellipsis' ? (
                      <PaginationItem key={`ellipsis-${i}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          href="#"
                          isActive={p === requestsPage}
                          onClick={(e) => { e.preventDefault(); setRequestsPage(p); }}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); if (requestsPage < requestsTotalPages) setRequestsPage(requestsPage + 1); }}
                      className={requestsPage === requestsTotalPages ? 'pointer-events-none opacity-50' : ''}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}

        {/* Providers Tab */}
        {activeTab === 'providers' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">
                  Utbildningsleverantörer
                </h2>
                <p className="text-sm text-slate-600">
                  Hantera leverantörskonton och behörigheter
                </p>
              </div>
              <button
                onClick={() => setShowCreateProvider(!showCreateProvider)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                <Building className="w-5 h-5" />
                Skapa Leverantör
              </button>
            </div>

            {/* Create Provider Form */}
            {showCreateProvider && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                <h3 className="font-semibold text-slate-900 mb-4">Skapa Ny Leverantör</h3>
                <form onSubmit={handleCreateProvider} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Namn *
                      </label>
                      <input
                        type="text"
                        value={newProvider.name}
                        onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="KTH Kungliga Tekniska Högskolan"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Typ *
                      </label>
                      <select
                        value={newProvider.type}
                        onChange={(e) => setNewProvider({ ...newProvider, type: e.target.value as 'universitet' | 'högskola' | 'yrkeshögskola' })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="universitet">Universitet</option>
                        <option value="högskola">Högskola</option>
                        <option value="yrkeshögskola">Yrkeshögskola</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Beskrivning *
                      </label>
                      <textarea
                        value={newProvider.description}
                        onChange={(e) => setNewProvider({ ...newProvider, description: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Kort beskrivning av leverantören..."
                        rows={3}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Webbplats
                      </label>
                      <input
                        type="url"
                        value={newProvider.website_url}
                        onChange={(e) => setNewProvider({ ...newProvider, website_url: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="https://www.exempel.se"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Kontakt E-post
                      </label>
                      <input
                        type="email"
                        value={newProvider.contact_email}
                        onChange={(e) => setNewProvider({ ...newProvider, contact_email: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="info@exempel.se"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Kontakt Telefon
                      </label>
                      <input
                        type="tel"
                        value={newProvider.contact_phone}
                        onChange={(e) => setNewProvider({ ...newProvider, contact_phone: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="+46 8 790 60 00"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
                    >
                      {loading ? 'Skapar...' : 'Skapa Leverantör'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateProvider(false)}
                      className="px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Avbryt
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              {supabaseProviders.map(provider => {
                const providerTrainings = trainings.filter(t => t.providerId === provider.id);
                const providerLeads = leads.filter(l => {
                  if (!l.trainingId) return false;
                  const training = getTrainingById(l.trainingId);
                  return training?.providerId === provider.id;
                });

                return (
                  <div key={provider.id} className="bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Building className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-slate-900">{provider.name}</h3>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            provider.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {provider.is_active ? 'Aktiv' : 'Inaktiv'}
                          </span>
                        </div>
                        <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                          {provider.type === 'universitet' ? 'Universitet' :
                           provider.type === 'högskola' ? 'Högskola' :
                           'Yrkeshögskola'}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-slate-600 mb-4">{provider.description}</p>

                    {(provider.website_url || provider.contact_email || provider.contact_phone) && (
                      <div className="text-xs text-slate-600 mb-4 space-y-1">
                        {provider.website_url && (
                          <div>
                            Webbplats: <a href={provider.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              {provider.website_url}
                            </a>
                          </div>
                        )}
                        {provider.contact_email && <div>E-post: {provider.contact_email}</div>}
                        {provider.contact_phone && <div>Telefon: {provider.contact_phone}</div>}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200 mb-4">
                      <div>
                        <div className="text-lg font-bold text-blue-600">{providerTrainings.length}</div>
                        <div className="text-xs text-slate-600">Utbildningar</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-green-600">{providerLeads.length}</div>
                        <div className="text-xs text-slate-600">Förfrågningar</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-purple-600">
                          {providerTrainings.reduce((sum, t) => sum + t.views, 0)}
                        </div>
                        <div className="text-xs text-slate-600">Visningar</div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleProviderActive(provider.id, provider.is_active)}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                          provider.is_active
                            ? 'border border-red-200 text-red-700 hover:bg-red-50'
                            : 'border border-green-200 text-green-700 hover:bg-green-50'
                        }`}
                      >
                        {provider.is_active ? 'Inaktivera' : 'Aktivera'}
                      </button>
                    </div>
                  </div>
                );
              })}

              {supabaseProviders.length === 0 && !showCreateProvider && (
                <div className="col-span-2 text-center py-12 bg-white rounded-xl border border-slate-200">
                  <Building className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-600 mb-4">Inga leverantörer hittades</p>
                  <button
                    onClick={() => setShowCreateProvider(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Skapa första leverantören
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">
                  Användarhantering
                </h2>
                <p className="text-sm text-slate-600">
                  Skapa och hantera användarkonton för leverantörer och administratörer
                </p>
              </div>
              <button
                onClick={() => setShowCreateUser(!showCreateUser)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                <UserPlus className="w-5 h-5" />
                Skapa Användare
              </button>
            </div>

            {/* Create User Form */}
            {showCreateUser && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                <h3 className="font-semibold text-slate-900 mb-4">Skapa Ny Användare</h3>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Namn *</label>
                      <input
                        type="text"
                        value={newUser.full_name}
                        onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Anna Andersson"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">E-post *</label>
                      <input
                        type="email"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="anna@exempel.se"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Lösenord *</label>
                      <input
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Minst 8 tecken"
                        minLength={8}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Telefon</label>
                      <input
                        type="tel"
                        value={newUser.phone}
                        onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="+46 70 000 00 00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Roll *</label>
                      <select
                        value={newUser.role}
                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'admin' | 'provider' })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="provider">Leverantör</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    {newUser.role === 'provider' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Leverantör *</label>
                        <select
                          value={newUser.provider_id}
                          onChange={(e) => setNewUser({ ...newUser, provider_id: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          <option value="">Välj leverantör...</option>
                          {supabaseProviders.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={creatingUser}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
                    >
                      {creatingUser ? 'Skapar...' : 'Skapa Användare'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateUser(false)}
                      className="px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Avbryt
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Users List */}
            {loading && !users.length ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600">Laddar användare...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {users.map(user => (
                  <div key={user.id} className="bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          user.role === 'admin'
                            ? 'bg-purple-100'
                            : 'bg-blue-100'
                        }`}>
                          {user.role === 'admin' ? (
                            <Shield className="w-6 h-6 text-purple-600" />
                          ) : (
                            <UserCog className="w-6 h-6 text-blue-600" />
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-slate-900">{user.full_name}</h3>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              user.role === 'admin'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {user.role === 'admin' ? 'Administratör' : 'Leverantör'}
                            </span>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              user.is_active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {user.is_active ? 'Aktiv' : 'Inaktiv'}
                            </span>
                          </div>

                          <div className="text-sm text-slate-600 mb-2">
                            {user.email}
                            {user.phone && ` • ${user.phone}`}
                          </div>

                          {user.provider_name && (
                            <div className="text-sm text-slate-600">
                              Leverantör: <span className="font-medium">{user.provider_name}</span>
                            </div>
                          )}

                          <div className="text-xs text-slate-500 mt-2">
                            Skapad: {new Date(user.created_at).toLocaleDateString('sv-SE', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleUserActive(user.id, user.is_active)}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                            user.is_active
                              ? 'border border-red-200 text-red-700 hover:bg-red-50'
                              : 'border border-green-200 text-green-700 hover:bg-green-50'
                          }`}
                        >
                          {user.is_active ? 'Inaktivera' : 'Aktivera'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {users.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                    <Users className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                    <p className="text-slate-600 mb-4">Inga användare hittades</p>
                    <button
                      onClick={() => setShowCreateUser(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                      Skapa första användaren
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Kompetensindex Tab */}
        {activeTab === 'kompetensindex' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Kompetensindex — Rapporter</h2>
                <p className="text-slate-500 text-sm mt-1">{cpiTotalRecords} genomförda analyser</p>
              </div>
              <button
                onClick={exportCpiToCSV}
                disabled={!cpiTotalRecords}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
                Exportera CSV
              </button>
            </div>

            {cpiLoading ? (
              <div className="animate-pulse space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl" />)}
              </div>
            ) : cpiTotalRecords === 0 ? (
              <div className="text-center py-16 text-slate-400">Inga analyser genomförda ännu.</div>
            ) : (
              <>
                {/* Summary stats (snitt över samtliga analyser, inte bara aktuell sida) */}
                {avgScores && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {(['AF', 'PF', 'OK', 'TR'] as const).map((dim) => (
                      <div key={dim} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                        <p className="text-xs text-slate-500 mb-1">{dim} — snitt</p>
                        <p className="text-3xl font-bold text-slate-900">{avgScores[dim]}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Records table */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Datum</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Företag</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Bransch</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Storlek</th>
                        <th className="text-center px-4 py-3 font-medium text-slate-600">Total</th>
                        <th className="text-center px-4 py-3 font-medium text-slate-600">AF</th>
                        <th className="text-center px-4 py-3 font-medium text-slate-600">PF</th>
                        <th className="text-center px-4 py-3 font-medium text-slate-600">OK</th>
                        <th className="text-center px-4 py-3 font-medium text-slate-600">TR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cpiRecords.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-500">{new Date(r.created_at).toLocaleDateString('sv-SE')}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{r.company_name}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">{r.industry}</td>
                          <td className="px-4 py-3 text-slate-600">{r.company_size}</td>
                          <td className="px-4 py-3 text-center font-bold text-slate-900">{r.scores?.total ?? '—'}</td>
                          <td className="px-4 py-3 text-center text-blue-600">{r.scores?.AF ?? '—'}</td>
                          <td className="px-4 py-3 text-center text-red-500">{r.scores?.PF ?? '—'}</td>
                          <td className="px-4 py-3 text-center text-green-600">{r.scores?.OK ?? '—'}</td>
                          <td className="px-4 py-3 text-center text-amber-500">{r.scores?.TR ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {cpiTotalPages > 1 && (
                  <div className="mt-6">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => { e.preventDefault(); if (cpiPage > 1) setCpiPage(cpiPage - 1); }}
                            className={cpiPage === 1 ? 'pointer-events-none opacity-50' : ''}
                          />
                        </PaginationItem>
                        {getPaginationRange(cpiPage, cpiTotalPages).map((p, i) =>
                          p === 'ellipsis' ? (
                            <PaginationItem key={`ellipsis-${i}`}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          ) : (
                            <PaginationItem key={p}>
                              <PaginationLink
                                href="#"
                                isActive={p === cpiPage}
                                onClick={(e) => { e.preventDefault(); setCpiPage(p); }}
                              >
                                {p}
                              </PaginationLink>
                            </PaginationItem>
                          )
                        )}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => { e.preventDefault(); if (cpiPage < cpiTotalPages) setCpiPage(cpiPage + 1); }}
                            className={cpiPage === cpiTotalPages ? 'pointer-events-none opacity-50' : ''}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}