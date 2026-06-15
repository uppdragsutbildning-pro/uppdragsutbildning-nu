import {
  BookOpen, Users, MessageSquare, TrendingUp,
  Eye, Clock, CheckCircle, AlertCircle
} from 'lucide-react';
import { Link } from 'react-router';
import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useProviderContext } from '../../../contexts/ProviderContext';
import { supabase, Training, Application, CustomRequest } from '../../../lib/supabase';

export function ProviderDashboard() {
  const { profile } = useAuth();
  const { selectedProviderId, isAdmin } = useProviderContext();
  const [loading, setLoading] = useState(true);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [applications, setApplications] = useState<(Application & { training?: Training })[]>([]);
  const [requests, setRequests] = useState<CustomRequest[]>([]);

  useEffect(() => {
    if (selectedProviderId) {
      loadDashboardData();
    }
  }, [selectedProviderId]);

  async function loadDashboardData() {
    if (!selectedProviderId) return;

    setLoading(true);
    try {
      // Load trainings
      const { data: trainingsData, error: trainingsError } = await supabase
        .from('trainings')
        .select('*')
        .eq('provider_id', selectedProviderId)
        .eq('is_active', true);

      if (trainingsError) throw trainingsError;
      setTrainings(trainingsData || []);

      // Load recent applications
      if (trainingsData && trainingsData.length > 0) {
        const trainingIds = trainingsData.map(t => t.id);
        const { data: applicationsData, error: applicationsError } = await supabase
          .from('applications')
          .select('*, trainings(*)')
          .in('training_id', trainingIds)
          .order('submitted_at', { ascending: false })
          .limit(5);

        if (applicationsError) throw applicationsError;
        setApplications(applicationsData?.map(app => ({
          ...app,
          training: app.trainings
        })) || []);
      }

      // Load custom requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('custom_requests')
        .select('*')
        .order('submitted_at', { ascending: false })
        .limit(5);

      if (requestsError) throw requestsError;
      setRequests(requestsData || []);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  const stats = [
    {
      label: 'Aktiva kurser',
      value: trainings.length.toString(),
      icon: BookOpen,
      color: 'blue',
      change: `${trainings.length} publicerade`
    },
    {
      label: 'Totala visningar',
      value: trainings.reduce((sum, t) => sum + t.views, 0).toLocaleString('sv-SE'),
      icon: Eye,
      color: 'emerald',
      change: 'Alla kurser'
    },
    {
      label: 'Anmälningar',
      value: applications.length.toString(),
      icon: Users,
      color: 'violet',
      change: `${applications.filter(a => a.status === 'new').length} nya`
    },
    {
      label: 'Förfrågningar',
      value: requests.filter(r => r.status === 'new').length.toString(),
      icon: MessageSquare,
      color: 'amber',
      change: `${requests.length} totalt`
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Översikt</h1>
        <p className="text-slate-600">Välkommen tillbaka! Här är en sammanfattning av dina kurser och aktiviteter.</p>
      </div>

      {/* Stats grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl bg-${stat.color}-50 flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 text-${stat.color}-600`} />
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</div>
              <div className="text-sm text-slate-600 mb-2">{stat.label}</div>
              <div className="text-xs text-slate-500">{stat.change}</div>
            </div>
          );
        })}
      </div>

      {/* Recent activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent applications */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-slate-900">Senaste anmälningar</h2>
            <Link to="/provider/applications" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Visa alla →
            </Link>
          </div>
          <div className="space-y-3">
            {applications.length > 0 ? (
              applications.slice(0, 3).map((app) => (
                <div key={app.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {app.student_name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 text-sm truncate">{app.student_name}</div>
                    <div className="text-xs text-slate-500 truncate">{app.company}</div>
                    <div className="text-xs text-slate-600 mt-1 truncate">{app.training?.title || 'Kurs borttagen'}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {new Date(app.submitted_at).toLocaleDateString('sv-SE')}
                    </div>
                  </div>
                  <div>
                    {app.status === 'new' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-full border border-amber-200">
                        <Clock className="w-3 h-3" />
                        Ny
                      </span>
                    ) : app.status === 'confirmed' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-200">
                        <CheckCircle className="w-3 h-3" />
                        Bekräftad
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                        {app.status === 'reviewed' ? 'Granskad' : 'Nekad'}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500 text-sm">
                Inga anmälningar ännu
              </div>
            )}
          </div>
        </div>

        {/* Recent requests */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-slate-900">Senaste förfrågningar</h2>
            <Link to="/provider/requests" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Visa alla →
            </Link>
          </div>
          <div className="space-y-3">
            {requests.length > 0 ? (
              requests.slice(0, 3).map((req) => (
                <div key={req.id} className="p-4 rounded-lg border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-medium text-slate-900">{req.company}</div>
                    {req.status === 'new' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200 font-medium">
                        <AlertCircle className="w-3 h-3" />
                        Ny
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                        {req.status === 'responded' ? 'Besvarad' :
                         req.status === 'negotiating' ? 'Förhandling' :
                         req.status === 'accepted' ? 'Accepterad' : 'Nekad'}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-600 mb-2">{req.course_topic}</div>
                  <div className="flex items-center justify-between text-xs">
                    {req.budget && <span className="text-slate-500">Budget: {req.budget}</span>}
                    <span className="text-slate-400">
                      {new Date(req.submitted_at).toLocaleDateString('sv-SE')}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500 text-sm">
                Inga förfrågningar ännu
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-xl border border-blue-100 p-8">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Snabbåtgärder</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Link
            to="/provider/courses/new"
            className="flex items-center gap-3 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 p-4 rounded-xl transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
              <BookOpen className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="font-medium text-slate-900">Skapa ny kurs</div>
              <div className="text-xs text-slate-500">Publicera en kurs</div>
            </div>
          </Link>
          <Link
            to="/provider/applications"
            className="flex items-center gap-3 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 p-4 rounded-xl transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center transition-colors">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="font-medium text-slate-900">Hantera anmälningar</div>
              <div className="text-xs text-slate-500">
                {applications.filter(a => a.status === 'new').length > 0
                  ? `${applications.filter(a => a.status === 'new').length} väntar på dig`
                  : 'Inga nya'}
              </div>
            </div>
          </Link>
          <Link
            to="/provider/requests"
            className="flex items-center gap-3 bg-white hover:bg-violet-50 border border-slate-200 hover:border-violet-200 p-4 rounded-xl transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-violet-100 group-hover:bg-violet-200 flex items-center justify-center transition-colors">
              <MessageSquare className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <div className="font-medium text-slate-900">Se förfrågningar</div>
              <div className="text-xs text-slate-500">
                {requests.filter(r => r.status === 'new').length > 0
                  ? `${requests.filter(r => r.status === 'new').length} nya`
                  : 'Inga nya'}
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
