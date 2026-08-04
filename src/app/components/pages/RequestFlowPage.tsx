import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Sparkles, Send, CheckCircle, ArrowRight, Loader2, User, Building, Mail, Phone, Calendar, DollarSign } from 'lucide-react';
import { getTrainingById } from '../../data/mockData';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';

type Step = 'describe' | 'ai-analysis' | 'form' | 'confirmation';

export function RequestFlowPage() {
  const { trainingId } = useParams();
  const navigate = useNavigate();
  const training = trainingId ? getTrainingById(trainingId) : null;
  
  const [step, setStep] = useState<Step>('describe');
  const [description, setDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // AI Analysis results
  const [aiSummary, setAiSummary] = useState('');
  const [recommendedCategories, setRecommendedCategories] = useState<string[]>([]);
  const [suggestedFormat, setSuggestedFormat] = useState('');
  
  // Form data
  const [formData, setFormData] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    budget: '',
    timeline: ''
  });

  const handleDescriptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsAnalyzing(true);
    setStep('ai-analysis');

    // Simulate AI analysis
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mock AI analysis results
    setAiSummary(`Baserat på din beskrivning har vi identifierat ett behov av ${training ? training.title : 'ledarskapsutveckling'}. Detta verkar vara ett strategiskt initiativ som kräver strukturerat lärande med praktisk tillämpning.`);
    setRecommendedCategories(['Ledarskap', 'Management', 'Strategiskt Tänkande']);
    setSuggestedFormat('hybrid');
    
    setIsAnalyzing(false);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Resolve category names → IDs, then check if any active training matches
    let hasMatch = false;
    try {
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name')
        .in('name', recommendedCategories);

      if (cats && cats.length > 0) {
        const categoryIds = cats.map((c: { id: string }) => c.id);
        const { data: matchedTrainings } = await supabase
          .from('trainings')
          .select('id')
          .in('category_id', categoryIds)
          .eq('is_active', true)
          .limit(1);
        hasMatch = (matchedTrainings?.length ?? 0) > 0;
      }
    } catch {
      // fallback: no match
    }

    const { error } = await supabase.from('custom_requests').insert({
      training_id: trainingId || null,
      company: formData.companyName,
      contact_name: formData.contactName,
      contact_email: formData.email,
      contact_phone: formData.phone,
      budget: formData.budget || null,
      timeline: formData.timeline,
      course_topic: training ? training.title : 'Fri förfrågan',
      description: description,
      participants_count: '',
      ai_score: 'medium',
      status: 'new',
      recommended_categories: recommendedCategories,
      has_provider_match: hasMatch,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Supabase insert error:', error);
      toast.error('Något gick fel. Försök igen.');
      return;
    }

    setStep('confirmation');
    toast.success('Förfrågan skickad!');
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="bg-slate-50 min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex items-center justify-center gap-4">
            <div className={`flex items-center gap-2 ${step === 'describe' ? 'text-blue-600' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'describe' ? 'bg-blue-600 text-white' : 
                ['ai-analysis', 'form', 'confirmation'].includes(step) ? 'bg-green-600 text-white' : 
                'bg-slate-200'
              }`}>
                {['ai-analysis', 'form', 'confirmation'].includes(step) ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  '1'
                )}
              </div>
              <span className="hidden sm:inline text-sm font-medium">Beskriv</span>
            </div>
            
            <div className="w-12 h-0.5 bg-slate-200"></div>
            
            <div className={`flex items-center gap-2 ${step === 'ai-analysis' ? 'text-blue-600' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'ai-analysis' ? 'bg-blue-600 text-white' : 
                ['form', 'confirmation'].includes(step) ? 'bg-green-600 text-white' : 
                'bg-slate-200'
              }`}>
                {['form', 'confirmation'].includes(step) ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  '2'
                )}
              </div>
              <span className="hidden sm:inline text-sm font-medium">AI-Analys</span>
            </div>
            
            <div className="w-12 h-0.5 bg-slate-200"></div>
            
            <div className={`flex items-center gap-2 ${step === 'form' ? 'text-blue-600' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'form' ? 'bg-blue-600 text-white' : 
                step === 'confirmation' ? 'bg-green-600 text-white' : 
                'bg-slate-200'
              }`}>
                {step === 'confirmation' ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  '3'
                )}
              </div>
              <span className="hidden sm:inline text-sm font-medium">Detaljer</span>
            </div>
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          {/* Step 1: Describe */}
          {step === 'describe' && (
            <div className="p-8 md:p-12">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full mb-4">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-sm font-medium">AI-Driven Matchning</span>
                </div>
                <h1 className="text-3xl font-bold text-slate-900 mb-3">
                  {training ? `Förfrågan: ${training.title}` : 'Beskriv Ditt Utbildningsbehov'}
                </h1>
                <p className="text-slate-600 max-w-2xl mx-auto">
                  Berätta om dina utbildningskrav med egna ord. Vår AI analyserar dina behov 
                  och hjälper dig hitta den perfekta matchningen.
                </p>
              </div>

              <form onSubmit={handleDescriptionSubmit}>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-900 mb-2">
                    Vilken typ av utbildning letar du efter?
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={training ? 
                      `Berätta mer om dina specifika behov för ${training.title}...` : 
                      "Exempel: Vi behöver ledarskapsutbildning för 20 chefer med fokus på strategiskt tänkande och förändringsledning. Önskar starta under Q3 2026..."
                    }
                    rows={8}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                    required
                  />
                  <p className="text-sm text-slate-500 mt-2">
                    Inkludera detaljer som: antal deltagare, önskade resultat, tidsplan, budgetram
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-lg font-medium transition-colors"
                >
                  <Sparkles className="w-5 h-5" />
                  Analysera med AI
                  <ArrowRight className="w-5 h-5" />
                </button>
              </form>
            </div>
          )}

          {/* Step 2: AI Analysis */}
          {step === 'ai-analysis' && (
            <div className="p-8 md:p-12">
              <div className="text-center">
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-6" />
                    <h2 className="text-2xl font-bold text-slate-900 mb-3">
                      Analyserar din förfrågan...
                    </h2>
                    <p className="text-slate-600">
                      Vår AI bearbetar dina krav för att hitta de bästa matchningarna
                    </p>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-6" />
                    <h2 className="text-2xl font-bold text-slate-900 mb-3">
                      Analys Klar!
                    </h2>
                    <p className="text-slate-600 mb-8">
                      Vi har identifierat dina utbildningsbehov
                    </p>

                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 mb-6 text-left">
                      <div className="flex items-start gap-3 mb-4">
                        <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                        <div>
                          <h3 className="font-semibold text-slate-900 mb-2">AI-Sammanfattning</h3>
                          <p className="text-slate-700">{aiSummary}</p>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4 mt-6">
                        <div>
                          <h4 className="text-sm font-medium text-slate-700 mb-2">Rekommenderade Kategorier</h4>
                          <div className="flex flex-wrap gap-2">
                            {recommendedCategories.map((cat, i) => (
                              <span key={i} className="px-3 py-1 bg-white rounded-full text-sm text-slate-900">
                                {cat}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-slate-700 mb-2">Föreslaget Format</h4>
                          <span className="inline-block px-3 py-1 bg-white rounded-full text-sm text-slate-900 capitalize">
                            {suggestedFormat}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setStep('form')}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                      Fortsätt till förfrågan <ArrowRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Form */}
          {step === 'form' && (
            <div className="p-8 md:p-12">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-slate-900 mb-3">
                  Slutför Din Förfrågan
                </h2>
                <p className="text-slate-600">
                  Ange dina kontaktuppgifter så att leverantörer kan skicka skräddarsydda förslag
                </p>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-900 mb-2">
                      <Building className="w-4 h-4" />
                      Företagsnamn *
                    </label>
                    <input
                      type="text"
                      value={formData.companyName}
                      onChange={(e) => updateFormData('companyName', e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-900 mb-2">
                      <User className="w-4 h-4" />
                      Ditt Namn *
                    </label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={(e) => updateFormData('contactName', e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-900 mb-2">
                      <Mail className="w-4 h-4" />
                      E-post *
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateFormData('email', e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-900 mb-2">
                      <Phone className="w-4 h-4" />
                      Telefon *
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => updateFormData('phone', e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-900 mb-2">
                      <DollarSign className="w-4 h-4" />
                      Budget (valfritt)
                    </label>
                    <input
                      type="text"
                      value={formData.budget}
                      onChange={(e) => updateFormData('budget', e.target.value)}
                      placeholder="t.ex. 500 000 - 1 000 000 SEK"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-900 mb-2">
                      <Calendar className="w-4 h-4" />
                      Tidsplan *
                    </label>
                    <input
                      type="text"
                      value={formData.timeline}
                      onChange={(e) => updateFormData('timeline', e.target.value)}
                      placeholder="t.ex. Q3 2026"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-slate-700">
                    <strong>Din sammanfattning:</strong> {description.substring(0, 200)}
                    {description.length > 200 ? '...' : ''}
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-lg font-medium transition-colors"
                >
                  Skicka Förfrågan
                  <ArrowRight className="w-5 h-5" />
                </button>
              </form>
            </div>
          )}

          {/* Step 4: Confirmation */}
          {step === 'confirmation' && (
            <div className="p-8 md:p-12 text-center">
              <CheckCircle className="w-20 h-20 text-green-600 mx-auto mb-6" />
              <h2 className="text-3xl font-bold text-slate-900 mb-3">
                Förfrågan Skickad!
              </h2>
              <p className="text-slate-600 mb-8 max-w-xl mx-auto">
                Tack, {formData.contactName}! Vi har mottagit din utbildningsförfrågan och meddelat 
                relevanta leverantörer. Du kommer att få skräddarsydda förslag inom 2-3 arbetsdagar.
              </p>

              <div className="bg-slate-50 rounded-xl p-6 mb-8 text-left max-w-md mx-auto">
                <h3 className="font-semibold text-slate-900 mb-3">Vad händer nu?</h3>
                <ul className="space-y-3 text-sm text-slate-700">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Leverantörer granskar din förfrågan och AI-analys</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Du får skräddarsydda förslag via e-post</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Jämför och välj det bästa alternativet för dina behov</span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => navigate('/')}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Tillbaka till Start
                </button>
                <button
                  onClick={() => navigate('/catalog')}
                  className="px-6 py-3 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Bläddra Fler Utbildningar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}