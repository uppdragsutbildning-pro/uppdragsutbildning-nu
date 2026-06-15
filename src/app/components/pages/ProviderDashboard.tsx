import { useState } from 'react';
import { Link } from 'react-router';
import { Plus, Edit, Eye, TrendingUp, Users, Mail, Phone, Calendar, Sparkles, Star, Download } from 'lucide-react';
import { trainings, leads, getTrainingById, getCategoryById } from '../../data/mockData';
import { toast } from 'sonner';
import { exportLeadsToCSV, exportTrainingsToCSV, exportAnalyticsToCSV } from '../../utils/exportUtils';

type Tab = 'trainings' | 'leads' | 'analytics';

export function ProviderDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('trainings');
  const [isCreating, setIsCreating] = useState(false);

  // Filter to show only trainings from this provider (assuming provider ID 1)
  const myTrainings = trainings.filter(t => t.providerId === '1');
  const myLeads = leads.filter(l => {
    if (!l.trainingId) return false;
    const training = getTrainingById(l.trainingId);
    return training?.providerId === '1';
  });

  return (
    <div className="bg-slate-50 min-h-screen pb-16">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">
                Leverantörspanel
              </h1>
              <p className="text-slate-600">
                Stockholm School of Economics
              </p>
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Ny Utbildning</span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 mt-6">
            <button
              onClick={() => setActiveTab('trainings')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'trainings'
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Mina Utbildningar
            </button>
            <button
              onClick={() => setActiveTab('leads')}
              className={`pb-3 border-b-2 transition-colors relative ${
                activeTab === 'leads'
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Förfrågningar
              {myLeads.length > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {myLeads.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'analytics'
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Analys
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Trainings Tab */}
        {activeTab === 'trainings' && (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Dina Utbildningsprogram
              </h2>
              <p className="text-sm text-slate-600">
                Hantera dina utbildningsannonser och spåra prestanda
              </p>
            </div>

            <div className="grid gap-4">
              {myTrainings.map(training => {
                const category = getCategoryById(training.categoryId);
                return (
                  <div key={training.id} className="bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-slate-900">
                            {training.title}
                          </h3>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                            {category?.name}
                          </span>
                          {training.featured && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full flex items-center gap-1">
                              <Star className="w-3 h-3" />
                              Utvald
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mb-3">
                          {training.description.substring(0, 150)}...
                        </p>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span className="capitalize">{training.format}</span>
                          <span>•</span>
                          <span>{training.duration}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                          <Edit className="w-4 h-4 text-slate-600" />
                        </button>
                        <Link
                          to={`/training/${training.id}`}
                          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4 text-slate-600" />
                        </Link>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200">
                      <div>
                        <div className="text-xl font-bold text-blue-600 mb-1">{training.views}</div>
                        <div className="text-xs text-slate-600">Totala Visningar</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-green-600 mb-1">{training.leads}</div>
                        <div className="text-xs text-slate-600">Förfrågningar</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-purple-600 mb-1">
                          {Math.round((training.leads / training.views) * 100)}%
                        </div>
                        <div className="text-xs text-slate-600">Konvertering</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {isCreating && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">Skapa Ny Utbildning</h2>
                  <form className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-900 mb-2">
                        Utbildningstitel *
                      </label>
                      <input
                        type="text"
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="t.ex. Strategiskt Ledarskap för Chefer"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-900 mb-2">
                        Beskrivning *
                      </label>
                      <textarea
                        rows={4}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                        placeholder="Beskriv utbildningsprogrammet..."
                      />
                      <button
                        type="button"
                        className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                      >
                        <Sparkles className="w-4 h-4" />
                        Förbättra med AI
                      </button>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-900 mb-2">
                          Kategori *
                        </label>
                        <select className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                          <option>Ledarskap</option>
                          <option>AI & Teknik</option>
                          <option>HR & Personal</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-900 mb-2">
                          Format *
                        </label>
                        <select className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                          <option>Online</option>
                          <option>På Plats</option>
                          <option>Hybrid</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-3 pt-4">
                      <button
                        type="submit"
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                      >
                        Skapa Utbildning
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreating(false)}
                        className="px-6 py-3 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                      >
                        Avbryt
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Leads Tab */}
        {activeTab === 'leads' && (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Inkommande Förfrågningar
              </h2>
              <p className="text-sm text-slate-600">
                Granska och svara på utbildningsförfrågningar
              </p>
            </div>

            <div className="grid gap-4">
              {myLeads.map(lead => {
                const training = getTrainingById(lead.trainingId!);
                return (
                  <div key={lead.id} className="bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-slate-900">
                            {lead.companyName}
                          </h3>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            lead.aiScore === 'high' ? 'bg-green-100 text-green-700' :
                            lead.aiScore === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {lead.aiScore === 'high' ? 'HÖG' : lead.aiScore === 'medium' ? 'MEDEL' : 'LÅG'}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            lead.status === 'new' ? 'bg-blue-100 text-blue-700' :
                            lead.status === 'contacted' ? 'bg-purple-100 text-purple-700' :
                            lead.status === 'qualified' ? 'bg-green-100 text-green-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {lead.status === 'new' ? 'Ny' : 
                             lead.status === 'contacted' ? 'Kontaktad' : 
                             lead.status === 'qualified' ? 'Kvalificerad' : 
                             'Förlorad'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">
                          Intresserad av: <span className="font-medium">{training?.title}</span>
                        </p>
                        <p className="text-sm text-slate-700 mb-3">
                          {lead.description}
                        </p>
                        
                        <div className="bg-blue-50 rounded-lg p-3 mb-3">
                          <div className="flex items-start gap-2 text-sm">
                            <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <div className="font-medium text-blue-900 mb-1">AI-Analys</div>
                              <p className="text-blue-800">{lead.aiSummary}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Users className="w-3.5 h-3.5" />
                            {lead.contactName}
                          </div>
                          <div className="flex items-center gap-2 text-slate-600">
                            <Mail className="w-3.5 h-3.5" />
                            {lead.email}
                          </div>
                          <div className="flex items-center gap-2 text-slate-600">
                            <Phone className="w-3.5 h-3.5" />
                            {lead.phone}
                          </div>
                          <div className="flex items-center gap-2 text-slate-600">
                            <Calendar className="w-3.5 h-3.5" />
                            {lead.timeline}
                          </div>
                        </div>

                        {lead.budget && (
                          <div className="mt-2 text-sm text-slate-600">
                            Budget: <span className="font-medium">{lead.budget}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-slate-200">
                      <button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
                        Skicka Förslag
                      </button>
                      <button className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm">
                        Kontakta
                      </button>
                    </div>
                  </div>
                );
              })}

              {myLeads.length === 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                  <Mail className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="font-semibold text-slate-900 mb-2">Inga förfrågningar ännu</h3>
                  <p className="text-sm text-slate-600">
                    Nya utbildningsförfrågningar kommer att visas här
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6">
              <button
                onClick={() => {
                  exportLeadsToCSV(myLeads);
                  toast.success('Förfrågningar exporterade till CSV!');
                }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <Download className="w-5 h-5" />
                <span className="hidden sm:inline">Exportera Förfrågningar</span>
              </button>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Prestandaanalys
              </h2>
              <p className="text-sm text-slate-600">
                Spåra din utbildningsprestanda och engagemang
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Eye className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">
                      {myTrainings.reduce((sum, t) => sum + t.views, 0)}
                    </div>
                    <div className="text-sm text-slate-600">Totala Visningar</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">
                      {myTrainings.reduce((sum, t) => sum + t.leads, 0)}
                    </div>
                    <div className="text-sm text-slate-600">Totala Förfrågningar</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">
                      {Math.round(
                        (myTrainings.reduce((sum, t) => sum + t.leads, 0) /
                          myTrainings.reduce((sum, t) => sum + t.views, 0)) *
                          100
                      )}%
                    </div>
                    <div className="text-sm text-slate-600">Genomsnittlig Konvertering</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Utbildningsprestanda</h3>
              <div className="space-y-4">
                {myTrainings.map(training => (
                  <div key={training.id} className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900 mb-1">
                        {training.title}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-600">
                        <span>{training.views} visningar</span>
                        <span>{training.leads} förfrågningar</span>
                        <span>{Math.round((training.leads / training.views) * 100)}% konvertering</span>
                      </div>
                    </div>
                    <div className="w-24">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{ width: `${(training.leads / training.views) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => {
                  exportAnalyticsToCSV(myTrainings);
                  toast.success('Analys exporterad till CSV!');
                }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <Download className="w-5 h-5" />
                <span className="hidden sm:inline">Exportera Analys</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}