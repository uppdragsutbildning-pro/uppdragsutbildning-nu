import { useState, useEffect } from 'react';
import {
  Search, MessageSquare, Eye, Send, Clock, CheckCircle,
  X, Briefcase, Users, Calendar, DollarSign, FileText, Globe
} from 'lucide-react';
import { toast } from 'sonner';
import { useProviderContext } from '../../../contexts/ProviderContext';
import { supabase, CustomRequest } from '../../../lib/supabase';

export function ProviderRequestsPage() {
  const { selectedProviderId } = useProviderContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'responded' | 'negotiating' | 'accepted' | 'declined'>('all');
  const [selectedRequest, setSelectedRequest] = useState<CustomRequest | null>(null);
  const [responseText, setResponseText] = useState('');
  const [requests, setRequests] = useState<CustomRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketplaceNames, setMarketplaceNames] = useState<Record<string, string>>({});

  useEffect(() => {
    loadRequests();
  }, [selectedProviderId]);

  // "Via: X"-attribution (Paket F/G, docs/specs/partnermarknadsplatser.md avsnitt 10)
  useEffect(() => {
    const ids = [...new Set(requests.map((r) => r.marketplace_id).filter((id): id is string => !!id))];
    const missing = ids.filter((id) => !(id in marketplaceNames));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase.from('marketplaces').select('id, name').in('id', missing);
      if (!data) return;
      setMarketplaceNames((prev) => {
        const next = { ...prev };
        data.forEach((m) => (next[m.id] = m.name));
        return next;
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests]);

  async function loadRequests() {
    setLoading(true);
    try {
      let query = supabase
        .from('custom_requests')
        .select('*')
        .order('submitted_at', { ascending: false });

      // If provider is selected, filter by their categories
      if (selectedProviderId) {
        try {
          const { data: providerTrainings } = await supabase
            .from('trainings')
            .select('category_id')
            .eq('provider_id', selectedProviderId)
            .eq('is_active', true);

          if (providerTrainings && providerTrainings.length > 0) {
            const categoryIds = [...new Set(providerTrainings.map((t: { category_id: string }) => t.category_id))];

            const { data: cats } = await supabase
              .from('categories')
              .select('name')
              .in('id', categoryIds);

            if (cats && cats.length > 0) {
              const categoryNames = cats.map((c: { name: string }) => c.name);
              // Client-side filter on recommended_categories overlap
              const { data: allRequests, error } = await query;
              if (error) throw error;
              const filtered = (allRequests || []).filter(req => {
                const rc: string[] = req.recommended_categories || [];
                return rc.length === 0 || rc.some((cat: string) => categoryNames.includes(cat));
              });
              setRequests(filtered);
              return;
            }
          }
        } catch {
          // fallback to all requests
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading requests:', error);
      toast.error('Kunde inte ladda förfrågningar');
    } finally {
      setLoading(false);
    }
  }

  const filteredRequests = requests.filter(req => {
    const matchesSearch =
      req.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.course_topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.contact_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || req.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  async function handleSendResponse() {
    if (!selectedRequest || !responseText.trim()) return;

    try {
      const { error } = await supabase
        .from('custom_requests')
        .update({
          status: 'responded',
          response: responseText
        })
        .eq('id', selectedRequest.id);

      if (error) throw error;

      setRequests(prev =>
        prev.map(req =>
          req.id === selectedRequest.id
            ? { ...req, status: 'responded', response: responseText }
            : req
        )
      );
      toast.success('Svar skickat!', { description: 'Ditt svar har skickats till företaget.' });
      setResponseText('');
      setSelectedRequest(null);
    } catch (error) {
      toast.error('Kunde inte skicka svar');
    }
  }

  async function handleStatusChange(id: string, newStatus: CustomRequest['status']) {
    try {
      const { error } = await supabase
        .from('custom_requests')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      setRequests(prev =>
        prev.map(req => (req.id === id ? { ...req, status: newStatus } : req))
      );
      toast.success('Status uppdaterad');
    } catch (error) {
      toast.error('Kunde inte uppdatera status');
    }
  }

  const getStatusLabel = (status: CustomRequest['status']) => {
    const labels: Record<CustomRequest['status'], string> = {
      new: 'Ny',
      responded: 'Besvarad',
      negotiating: 'Förhandling',
      accepted: 'Accepterad',
      declined: 'Avböjd',
    };
    return labels[status];
  };

  const getStatusColor = (status: CustomRequest['status']) => {
    const colors: Record<CustomRequest['status'], string> = {
      new: 'bg-blue-50 text-blue-700 border-blue-200',
      responded: 'bg-amber-50 text-amber-700 border-amber-200',
      negotiating: 'bg-violet-50 text-violet-700 border-violet-200',
      accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      declined: 'bg-red-50 text-red-700 border-red-200',
    };
    return colors[status];
  };

  const getScoreColor = (score: string) => {
    const colors: Record<string, string> = {
      high: 'text-emerald-600 bg-emerald-50',
      medium: 'text-amber-600 bg-amber-50',
      low: 'text-slate-600 bg-slate-50',
    };
    return colors[score] || colors.low;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Förfrågningar om anpassade utbildningar</h1>
        <p className="text-slate-600">Granska och svara på förfrågningar från företag</p>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-5 gap-4">
        {[
          { label: 'Nya', value: requests.filter(r => r.status === 'new').length, color: 'blue' },
          { label: 'Besvarade', value: requests.filter(r => r.status === 'responded').length, color: 'amber' },
          { label: 'Förhandling', value: requests.filter(r => r.status === 'negotiating').length, color: 'violet' },
          { label: 'Accepterade', value: requests.filter(r => r.status === 'accepted').length, color: 'emerald' },
          { label: 'Avböjda', value: requests.filter(r => r.status === 'declined').length, color: 'red' },
        ].map((stat, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-5">
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
              placeholder="Sök företag, ämne eller kontaktperson..."
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
            <option value="all">Alla förfrågningar</option>
            <option value="new">Nya</option>
            <option value="responded">Besvarade</option>
            <option value="negotiating">Förhandling</option>
            <option value="accepted">Accepterade</option>
            <option value="declined">Avböjda</option>
          </select>
        </div>
      </div>

      {/* Requests list */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Inga förfrågningar hittades</h3>
            <p className="text-slate-600">Det finns inga förfrågningar som matchar dina filter.</p>
          </div>
        ) : (
          filteredRequests.map((req) => (
            <div
              key={req.id}
              className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-slate-900">{req.company}</h3>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(req.status)}`}>
                      {getStatusLabel(req.status)}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getScoreColor(req.ai_score)}`}>
                      AI-poäng: {req.ai_score === 'high' ? 'Hög' : req.ai_score === 'medium' ? 'Medel' : 'Låg'}
                    </span>
                    {req.marketplace_id && marketplaceNames[req.marketplace_id] && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">
                        <Globe className="w-3 h-3" />
                        Via: {marketplaceNames[req.marketplace_id]}
                      </span>
                    )}
                  </div>
                  <h4 className="text-base font-semibold text-slate-700 mb-2">{req.course_topic}</h4>
                  <p className="text-sm text-slate-600 mb-3 line-clamp-2">{req.description}</p>

                  <div className="grid sm:grid-cols-4 gap-4 text-sm">
                    {req.budget && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <DollarSign className="w-4 h-4 text-slate-400" />
                        <span>{req.budget}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-slate-600">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span>{req.timeline}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span>{req.participants_count} deltagare</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 text-xs">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(req.submitted_at).toLocaleDateString('sv-SE')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => {
                      setSelectedRequest(req);
                      setResponseText(req.response || '');
                    }}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Visa detaljer"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                  {req.status === 'new' && (
                    <button
                      onClick={() => {
                        setSelectedRequest(req);
                        setResponseText('');
                      }}
                      className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Svara"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              {req.response && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-start gap-2 text-sm">
                    <MessageSquare className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-slate-700 mb-1">Ditt svar:</div>
                      <p className="text-slate-600">{req.response}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Detail/Response modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedRequest(null)}>
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Förfrågan från {selectedRequest.company}</h2>
              <button
                onClick={() => setSelectedRequest(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status */}
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${getStatusColor(selectedRequest.status)}`}>
                  {getStatusLabel(selectedRequest.status)}
                </span>
                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${getScoreColor(selectedRequest.aiScore)}`}>
                  AI-matchning: {selectedRequest.aiScore === 'high' ? 'Hög' : selectedRequest.aiScore === 'medium' ? 'Medel' : 'Låg'}
                </span>
                <span className="text-sm text-slate-500">
                  {new Date(selectedRequest.submitted_at).toLocaleString('sv-SE')}
                </span>
                {selectedRequest.marketplace_id && marketplaceNames[selectedRequest.marketplace_id] && (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-violet-50 text-violet-700 border border-violet-100">
                    <Globe className="w-4 h-4" />
                    Via: {marketplaceNames[selectedRequest.marketplace_id]}
                  </span>
                )}
              </div>

              {/* Course topic */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  Kursämne
                </h3>
                <p className="text-slate-900 font-medium">{selectedRequest.courseTopic}</p>
              </div>

              {/* Description */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Beskrivning
                </h3>
                <p className="text-slate-700 leading-relaxed">{selectedRequest.description}</p>
              </div>

              {/* Details grid */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                    <DollarSign className="w-4 h-4" />
                    Budget
                  </div>
                  <div className="font-semibold text-slate-900">{selectedRequest.budget}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                    <Calendar className="w-4 h-4" />
                    Tidsram
                  </div>
                  <div className="font-semibold text-slate-900">{selectedRequest.timeline}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                    <Users className="w-4 h-4" />
                    Deltagare
                  </div>
                  <div className="font-semibold text-slate-900">{selectedRequest.participantsCount}</div>
                </div>
              </div>

              {/* Contact info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3">Kontaktinformation</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Namn:</span>
                    <span className="font-medium text-slate-900">{selectedRequest.contactName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">E-post:</span>
                    <a href={`mailto:${selectedRequest.contactEmail}`} className="text-blue-600 hover:text-blue-700">
                      {selectedRequest.contactEmail}
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Telefon:</span>
                    <a href={`tel:${selectedRequest.contactPhone}`} className="text-blue-600 hover:text-blue-700">
                      {selectedRequest.contactPhone}
                    </a>
                  </div>
                </div>
              </div>

              {/* Previous response */}
              {selectedRequest.response && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-900 mb-2">Tidigare svar</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">{selectedRequest.response}</p>
                </div>
              )}

              {/* Response textarea */}
              {selectedRequest.status === 'new' && (
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Ditt svar</label>
                  <textarea
                    rows={6}
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    placeholder="Skriv ditt svar till företaget..."
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                {selectedRequest.status === 'new' && (
                  <>
                    <button
                      onClick={handleSendResponse}
                      disabled={!responseText.trim()}
                      className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
                    >
                      <Send className="w-5 h-5" />
                      Skicka svar
                    </button>
                    <button
                      onClick={() => {
                        handleStatusChange(selectedRequest.id, 'declined');
                        setSelectedRequest(null);
                      }}
                      className="px-4 py-2.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors font-medium"
                    >
                      Avböj
                    </button>
                  </>
                )}
                {selectedRequest.status !== 'new' && (
                  <button
                    onClick={() => setSelectedRequest(null)}
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
