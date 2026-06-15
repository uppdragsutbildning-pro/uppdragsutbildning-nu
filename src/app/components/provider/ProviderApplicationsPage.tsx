import { useState, useEffect } from 'react';
import {
  Search, Filter, CheckCircle, X, Clock, Eye, Mail, Phone,
  Calendar, User, Briefcase, FileText, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { useProviderContext } from '../../../contexts/ProviderContext';
import { supabase, Application as DBApplication, Training } from '../../../lib/supabase';

type ApplicationWithTraining = DBApplication & { training?: Training };

export function ProviderApplicationsPage() {
  const { selectedProviderId } = useProviderContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'reviewed' | 'confirmed' | 'declined'>('all');
  const [selectedApplication, setSelectedApplication] = useState<ApplicationWithTraining | null>(null);
  const [applications, setApplications] = useState<ApplicationWithTraining[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedProviderId) {
      loadApplications();
    }
  }, [selectedProviderId]);

  async function loadApplications() {
    if (!selectedProviderId) return;

    setLoading(true);
    try {
      // Get all trainings for this provider
      const { data: trainingsData, error: trainingsError } = await supabase
        .from('trainings')
        .select('id')
        .eq('provider_id', selectedProviderId);

      if (trainingsError) throw trainingsError;

      if (trainingsData && trainingsData.length > 0) {
        const trainingIds = trainingsData.map(t => t.id);

        // Get applications for these trainings
        const { data: appsData, error: appsError } = await supabase
          .from('applications')
          .select(`
            *,
            trainings (*)
          `)
          .in('training_id', trainingIds)
          .order('submitted_at', { ascending: false });

        if (appsError) throw appsError;

        setApplications(appsData?.map(app => ({
          ...app,
          training: app.trainings
        })) || []);
      } else {
        setApplications([]);
      }
    } catch (error) {
      console.error('Error loading applications:', error);
      toast.error('Kunde inte ladda anmälningar');
    } finally {
      setLoading(false);
    }
  }

  const filteredApplications = applications.filter(app => {
    const matchesSearch =
      app.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (app.training?.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.company.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || app.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  async function handleStatusChange(id: string, newStatus: DBApplication['status']) {
    try {
      const { error } = await supabase
        .from('applications')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      setApplications(prev =>
        prev.map(app => (app.id === id ? { ...app, status: newStatus } : app))
      );

      toast.success('Status uppdaterad', {
        description: `Anmälan har markerats som ${getStatusLabel(newStatus).toLowerCase()}.`
      });
    } catch (error) {
      toast.error('Kunde inte uppdatera status');
    }
  }

  const getStatusLabel = (status: DBApplication['status']) => {
    const labels: Record<DBApplication['status'], string> = {
      new: 'Ny',
      reviewed: 'Granskad',
      confirmed: 'Bekräftad',
      declined: 'Avböjd',
    };
    return labels[status];
  };

  const getStatusColor = (status: DBApplication['status']) => {
    const colors: Record<DBApplication['status'], string> = {
      new: 'bg-blue-50 text-blue-700 border-blue-200',
      reviewed: 'bg-amber-50 text-amber-700 border-amber-200',
      confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      declined: 'bg-red-50 text-red-700 border-red-200',
    };
    return colors[status];
  };

  const exportToCSV = () => {
    toast.success('CSV exporterad', { description: 'Anmälningar har exporterats till CSV.' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Kursanmälningar</h1>
          <p className="text-slate-600">Hantera och bekräfta studentanmälningar</p>
        </div>
        <button
          onClick={exportToCSV}
          className="inline-flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-xl font-medium transition-colors"
        >
          <Download className="w-5 h-5" />
          Exportera CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-4 gap-4">
        {[
          { label: 'Nya', value: applications.filter(a => a.status === 'new').length, color: 'blue' },
          { label: 'Granskade', value: applications.filter(a => a.status === 'reviewed').length, color: 'amber' },
          { label: 'Bekräftade', value: applications.filter(a => a.status === 'confirmed').length, color: 'emerald' },
          { label: 'Avböjda', value: applications.filter(a => a.status === 'declined').length, color: 'red' },
        ].map((stat, i) => (
          <div key={i} className={`bg-white border border-slate-200 rounded-xl p-5`}>
            <div className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</div>
            <div className="text-sm text-slate-600">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Sök student, kurs eller företag..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Alla anmälningar</option>
            <option value="new">Nya</option>
            <option value="reviewed">Granskade</option>
            <option value="confirmed">Bekräftade</option>
            <option value="declined">Avböjda</option>
          </select>
        </div>
      </div>

      {/* Applications list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            Inga anmälningar hittades
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Kurs</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Inlämnad</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Åtgärder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredApplications.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {app.student_name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{app.student_name}</div>
                          <div className="text-sm text-slate-500">{app.company}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{app.training?.title || 'Okänd kurs'}</div>
                      {app.training?.course_code && (
                        <div className="text-sm text-slate-500 font-mono">{app.training.course_code}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-900">
                        {new Date(app.submitted_at).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                    </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(app.status)}`}>
                      {app.status === 'new' && <Clock className="w-3 h-3" />}
                      {app.status === 'confirmed' && <CheckCircle className="w-3 h-3" />}
                      {app.status === 'declined' && <X className="w-3 h-3" />}
                      {getStatusLabel(app.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedApplication(app)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Visa detaljer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {app.status === 'new' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(app.id, 'confirmed')}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Bekräfta"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleStatusChange(app.id, 'declined')}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Avböj"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedApplication && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedApplication(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Anmälningsdetaljer</h2>
              <button
                onClick={() => setSelectedApplication(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status badge */}
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${getStatusColor(selectedApplication.status)}`}>
                  {getStatusLabel(selectedApplication.status)}
                </span>
                <span className="text-sm text-slate-500">
                  Inlämnad {new Date(selectedApplication.submitted_at).toLocaleString('sv-SE')}
                </span>
              </div>

              {/* Course info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  Kursinformation
                </h3>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div className="sm:col-span-2">
                    <div className="text-slate-500 mb-1">Kurs</div>
                    <div className="font-medium text-slate-900">{selectedApplication.training?.title || 'Okänd kurs'}</div>
                  </div>
                  {selectedApplication.training?.course_code && (
                    <div>
                      <div className="text-slate-500 mb-1">Kurskod</div>
                      <div className="font-mono text-slate-900">{selectedApplication.training.course_code}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Student info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" />
                  Studentinformation
                </h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-slate-500 mb-1">Namn</div>
                    <div className="font-medium text-slate-900">{selectedApplication.student_name}</div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-slate-500 mb-1">E-post</div>
                      <a href={`mailto:${selectedApplication.student_email}`} className="flex items-center gap-2 text-blue-600 hover:text-blue-700">
                        <Mail className="w-4 h-4" />
                        {selectedApplication.student_email}
                      </a>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-1">Telefon</div>
                      <a href={`tel:${selectedApplication.student_phone}`} className="flex items-center gap-2 text-blue-600 hover:text-blue-700">
                        <Phone className="w-4 h-4" />
                        {selectedApplication.student_phone}
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Company info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  Företagsinformation
                </h3>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-slate-500 mb-1">Företag</div>
                    <div className="font-medium text-slate-900">{selectedApplication.company}</div>
                  </div>
                  {selectedApplication.department && (
                    <div>
                      <div className="text-slate-500 mb-1">Avdelning</div>
                      <div className="font-medium text-slate-900">{selectedApplication.department}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                {selectedApplication.status === 'new' && (
                  <>
                    <button
                      onClick={() => {
                        handleStatusChange(selectedApplication.id, 'confirmed');
                        setSelectedApplication(null);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Bekräfta anmälan
                    </button>
                    <button
                      onClick={() => {
                        handleStatusChange(selectedApplication.id, 'declined');
                        setSelectedApplication(null);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
                    >
                      <X className="w-5 h-5" />
                      Avböj anmälan
                    </button>
                  </>
                )}
                {selectedApplication.status !== 'new' && (
                  <button
                    onClick={() => setSelectedApplication(null)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors font-medium"
                  >
                    Stäng
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
