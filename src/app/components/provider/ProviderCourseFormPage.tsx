import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Save, X, Plus, Trash2, ChevronDown, ChevronUp, Image as ImageIcon,
  AlertCircle, BookOpen, Users, Calendar, Mail, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase, Category } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

interface CurriculumModule {
  title: string;
  topics: string[];
}

interface ScheduledStart {
  id?: string;
  startDate: string;
  applicationDeadline: string;
  price: number;
  maxParticipants: number;
  availableSpots: number;
  status: 'open' | 'few_spots' | 'full' | 'upcoming';
}

interface FAQ {
  question: string;
  answer: string;
}

const emptyForm = {
  title: '',
  description: '',
  courseCode: '',
  categoryId: '',
  format: 'online' as 'online' | 'onsite' | 'hybrid',
  duration: '',
  credits: 0,
  targetAudience: '',
  imageUrl: '',
  trainingType: 'both' as 'custom' | 'scheduled' | 'both',
  isPopular: false,
  featured: false,
  learningOutcomes: [''] as string[],
  curriculum: [{ title: '', topics: [''] }] as CurriculumModule[],
  instructorName: '',
  instructorTitle: '',
  instructorBio: '',
  scheduledStarts: [] as ScheduledStart[],
  contactPersonName: '',
  contactPersonTitle: '',
  contactPersonEmail: '',
  contactPersonPhone: '',
  contactPersonResponseTime: 'Svarar inom 24 timmar',
  faq: [] as FAQ[],
};

export function ProviderCourseFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isEdit = !!id;

  const [formData, setFormData] = useState(emptyForm);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    content: true,
    instructor: false,
    starts: false,
    contact: false,
    faq: false,
  });

  // Load categories from Supabase
  useEffect(() => {
    supabase.from('categories').select('*').order('name').then(({ data }) => {
      if (data) setCategories(data);
    });
  }, []);

  // Load existing training when editing
  useEffect(() => {
    if (!isEdit) return;

    async function loadTraining() {
      setLoading(true);
      try {
        const [trainingRes, modulesRes, faqRes, startsRes] = await Promise.all([
          supabase.from('trainings').select('*').eq('id', id).single(),
          supabase.from('curriculum_modules').select('*').eq('training_id', id).order('order_index'),
          supabase.from('training_faq').select('*').eq('training_id', id).order('order_index'),
          supabase.from('scheduled_starts').select('*').eq('training_id', id).order('start_date'),
        ]);

        if (trainingRes.error) throw trainingRes.error;
        const t = trainingRes.data;

        setFormData({
          title: t.title || '',
          description: t.description || '',
          courseCode: t.course_code || '',
          categoryId: t.category_id || '',
          format: t.format || 'online',
          duration: t.duration || '',
          credits: t.credits || 0,
          targetAudience: t.target_audience || '',
          imageUrl: t.image_url || '',
          trainingType: t.training_type || 'both',
          isPopular: t.is_popular || false,
          featured: t.featured || false,
          learningOutcomes: t.learning_outcomes?.length ? t.learning_outcomes : [''],
          curriculum: modulesRes.data?.length
            ? modulesRes.data.map(m => ({ title: m.title, topics: m.topics || [''] }))
            : [{ title: '', topics: [''] }],
          instructorName: t.instructor_name || '',
          instructorTitle: t.instructor_title || '',
          instructorBio: t.instructor_bio || '',
          scheduledStarts: startsRes.data?.map(s => ({
            id: s.id,
            startDate: s.start_date,
            applicationDeadline: s.application_deadline,
            price: s.price,
            maxParticipants: s.max_participants,
            availableSpots: s.available_spots,
            status: s.status,
          })) || [],
          contactPersonName: t.contact_person_name || '',
          contactPersonTitle: t.contact_person_title || '',
          contactPersonEmail: t.contact_person_email || '',
          contactPersonPhone: t.contact_person_phone || '',
          contactPersonResponseTime: t.contact_person_response_time || 'Svarar inom 24 timmar',
          faq: faqRes.data?.map(f => ({ question: f.question, answer: f.answer })) || [],
        });
      } catch (err) {
        toast.error('Kunde inte ladda kursdata');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadTraining();
  }, [id, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.provider_id) {
      toast.error('Inget provider-konto kopplat till din profil');
      return;
    }

    setSaving(true);
    try {
      const trainingPayload = {
        title: formData.title,
        description: formData.description,
        course_code: formData.courseCode || null,
        provider_id: profile.provider_id,
        category_id: formData.categoryId,
        format: formData.format,
        duration: formData.duration,
        credits: formData.credits,
        target_audience: formData.targetAudience,
        image_url: formData.imageUrl,
        training_type: formData.trainingType,
        is_popular: formData.isPopular,
        featured: formData.featured,
        learning_outcomes: formData.learningOutcomes.filter(o => o.trim()),
        instructor_name: formData.instructorName || null,
        instructor_title: formData.instructorTitle || null,
        instructor_bio: formData.instructorBio || null,
        contact_person_name: formData.contactPersonName || null,
        contact_person_title: formData.contactPersonTitle || null,
        contact_person_email: formData.contactPersonEmail || null,
        contact_person_phone: formData.contactPersonPhone || null,
        contact_person_response_time: formData.contactPersonResponseTime,
        is_active: true,
      };

      let trainingId = id;

      if (isEdit) {
        const { error } = await supabase.from('trainings').update(trainingPayload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('trainings').insert(trainingPayload).select('id').single();
        if (error) throw error;
        trainingId = data.id;
      }

      // Replace curriculum modules
      await supabase.from('curriculum_modules').delete().eq('training_id', trainingId);
      const modules = formData.curriculum.filter(m => m.title.trim());
      if (modules.length > 0) {
        await supabase.from('curriculum_modules').insert(
          modules.map((m, i) => ({
            training_id: trainingId,
            title: m.title,
            topics: m.topics.filter(t => t.trim()),
            order_index: i + 1,
          }))
        );
      }

      // Replace FAQ
      await supabase.from('training_faq').delete().eq('training_id', trainingId);
      const faqs = formData.faq.filter(f => f.question.trim());
      if (faqs.length > 0) {
        await supabase.from('training_faq').insert(
          faqs.map((f, i) => ({
            training_id: trainingId,
            question: f.question,
            answer: f.answer,
            order_index: i + 1,
          }))
        );
      }

      // Replace scheduled starts
      await supabase.from('scheduled_starts').delete().eq('training_id', trainingId);
      const starts = formData.scheduledStarts.filter(s => s.startDate);
      if (starts.length > 0) {
        await supabase.from('scheduled_starts').insert(
          starts.map(s => ({
            training_id: trainingId,
            start_date: s.startDate,
            application_deadline: s.applicationDeadline,
            price: s.price,
            max_participants: s.maxParticipants,
            available_spots: s.availableSpots,
            status: s.status,
            language: 'Svenska',
          }))
        );
      }

      toast.success(isEdit ? 'Kurs uppdaterad!' : 'Kurs publicerad!', {
        description: 'Din kurs har sparats på plattformen.'
      });
      navigate('/provider/courses');
    } catch (err: any) {
      console.error(err);
      toast.error('Något gick fel', { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const addLearningOutcome = () => setFormData(prev => ({ ...prev, learningOutcomes: [...prev.learningOutcomes, ''] }));
  const removeLearningOutcome = (i: number) => setFormData(prev => ({ ...prev, learningOutcomes: prev.learningOutcomes.filter((_, j) => j !== i) }));
  const updateLearningOutcome = (i: number, v: string) => setFormData(prev => ({ ...prev, learningOutcomes: prev.learningOutcomes.map((x, j) => j === i ? v : x) }));

  const addCurriculumModule = () => setFormData(prev => ({ ...prev, curriculum: [...prev.curriculum, { title: '', topics: [''] }] }));
  const removeCurriculumModule = (i: number) => setFormData(prev => ({ ...prev, curriculum: prev.curriculum.filter((_, j) => j !== i) }));
  const updateCurriculumModule = (i: number, v: string) => setFormData(prev => ({ ...prev, curriculum: prev.curriculum.map((m, j) => j === i ? { ...m, title: v } : m) }));
  const addModuleTopic = (mi: number) => setFormData(prev => ({ ...prev, curriculum: prev.curriculum.map((m, i) => i === mi ? { ...m, topics: [...m.topics, ''] } : m) }));
  const removeModuleTopic = (mi: number, ti: number) => setFormData(prev => ({ ...prev, curriculum: prev.curriculum.map((m, i) => i === mi ? { ...m, topics: m.topics.filter((_, j) => j !== ti) } : m) }));
  const updateModuleTopic = (mi: number, ti: number, v: string) => setFormData(prev => ({ ...prev, curriculum: prev.curriculum.map((m, i) => i === mi ? { ...m, topics: m.topics.map((t, j) => j === ti ? v : t) } : m) }));

  const addScheduledStart = () => setFormData(prev => ({ ...prev, scheduledStarts: [...prev.scheduledStarts, { startDate: '', applicationDeadline: '', price: 0, maxParticipants: 30, availableSpots: 30, status: 'open' }] }));
  const removeScheduledStart = (i: number) => setFormData(prev => ({ ...prev, scheduledStarts: prev.scheduledStarts.filter((_, j) => j !== i) }));
  const updateScheduledStart = (i: number, field: keyof ScheduledStart, value: any) => setFormData(prev => ({ ...prev, scheduledStarts: prev.scheduledStarts.map((s, j) => j === i ? { ...s, [field]: value } : s) }));

  const addFAQ = () => setFormData(prev => ({ ...prev, faq: [...prev.faq, { question: '', answer: '' }] }));
  const removeFAQ = (i: number) => setFormData(prev => ({ ...prev, faq: prev.faq.filter((_, j) => j !== i) }));
  const updateFAQ = (i: number, field: 'question' | 'answer', v: string) => setFormData(prev => ({ ...prev, faq: prev.faq.map((f, j) => j === i ? { ...f, [field]: v } : f) }));

  const SectionHeader = ({ title, section, icon: Icon }: { title: string; section: keyof typeof expandedSections; icon: any }) => (
    <button type="button" onClick={() => toggleSection(section)} className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors">
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-blue-600" />
        <h3 className="font-bold text-slate-900">{title}</h3>
      </div>
      {expandedSections[section] ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">{isEdit ? 'Redigera kurs' : 'Skapa ny kurs'}</h1>
          <p className="text-slate-600">Fyll i informationen om din uppdragsutbildning</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/provider/courses')} className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors font-medium">
            <X className="w-5 h-5" />Avbryt
          </button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg font-medium transition-colors">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {isEdit ? 'Spara ändringar' : 'Publicera kurs'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Basic Information */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <SectionHeader title="Grundläggande information" section="basic" icon={BookOpen} />
          {expandedSections.basic && (
            <div className="p-6 space-y-5">
              <div className="grid md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-900 mb-2">Kurstitel *</label>
                  <input type="text" required value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="t.ex. Miljöpsykologi och beteendedesign" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Kurskod</label>
                  <input type="text" value={formData.courseCode} onChange={e => setFormData(p => ({ ...p, courseCode: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" placeholder="t.ex. FL10002" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Kategori *</label>
                  <select required value={formData.categoryId} onChange={e => setFormData(p => ({ ...p, categoryId: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Välj kategori</option>
                    {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Format *</label>
                  <select required value={formData.format} onChange={e => setFormData(p => ({ ...p, format: e.target.value as any }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="online">Online</option>
                    <option value="onsite">På plats</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Utbildningstyp *</label>
                  <select required value={formData.trainingType} onChange={e => setFormData(p => ({ ...p, trainingType: e.target.value as any }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="both">Både skräddarsydd & schemalagd</option>
                    <option value="custom">Endast skräddarsydd</option>
                    <option value="scheduled">Endast schemalagd</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Längd *</label>
                  <input type="text" required value={formData.duration} onChange={e => setFormData(p => ({ ...p, duration: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="t.ex. 4 veckor" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Högskolepoäng *</label>
                  <input type="number" required min="0" step="0.5" value={formData.credits} onChange={e => setFormData(p => ({ ...p, credits: parseFloat(e.target.value) }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="t.ex. 7.5" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-900 mb-2">Kursbeskrivning *</label>
                  <textarea required rows={4} value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Beskriv kursen..." />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-900 mb-2">Målgrupp *</label>
                  <textarea required rows={2} value={formData.targetAudience} onChange={e => setFormData(p => ({ ...p, targetAudience: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Vem är kursen riktad till?" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-900 mb-2">Bild-URL *</label>
                  <div className="flex gap-3">
                    <input type="url" required value={formData.imageUrl} onChange={e => setFormData(p => ({ ...p, imageUrl: e.target.value }))} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://..." />
                    <button type="button" className="px-4 py-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      <ImageIcon className="w-5 h-5 text-slate-600" />
                    </button>
                  </div>
                  {formData.imageUrl && <div className="mt-3 w-full h-40 rounded-lg bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url(${formData.imageUrl})` }} />}
                </div>
                <div className="md:col-span-2 flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.isPopular} onChange={e => setFormData(p => ({ ...p, isPopular: e.target.checked }))} className="w-4 h-4 text-blue-600 border-slate-300 rounded" />
                    <span className="text-sm text-slate-700">Markera som populär</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.featured} onChange={e => setFormData(p => ({ ...p, featured: e.target.checked }))} className="w-4 h-4 text-blue-600 border-slate-300 rounded" />
                    <span className="text-sm text-slate-700">Utvald kurs</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Learning Outcomes & Curriculum */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <SectionHeader title="Kursinnehåll & lärandemål" section="content" icon={BookOpen} />
          {expandedSections.content && (
            <div className="p-6 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-900">Lärandemål</label>
                  <button type="button" onClick={addLearningOutcome} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"><Plus className="w-4 h-4" />Lägg till</button>
                </div>
                <div className="space-y-2">
                  {formData.learningOutcomes.map((outcome, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="text" value={outcome} onChange={e => updateLearningOutcome(i, e.target.value)} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={`Lärandemål ${i + 1}`} />
                      {formData.learningOutcomes.length > 1 && (
                        <button type="button" onClick={() => removeLearningOutcome(i)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-5 h-5" /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-900">Kursmoduler</label>
                  <button type="button" onClick={addCurriculumModule} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"><Plus className="w-4 h-4" />Lägg till modul</button>
                </div>
                <div className="space-y-4">
                  {formData.curriculum.map((module, mi) => (
                    <div key={mi} className="border border-slate-200 rounded-lg p-4 space-y-3">
                      <div className="flex gap-2">
                        <input type="text" value={module.title} onChange={e => updateCurriculumModule(mi, e.target.value)} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium" placeholder={`Modul ${mi + 1} - Titel`} />
                        {formData.curriculum.length > 1 && <button type="button" onClick={() => removeCurriculumModule(mi)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-5 h-5" /></button>}
                      </div>
                      <div className="space-y-2 pl-4">
                        {module.topics.map((topic, ti) => (
                          <div key={ti} className="flex gap-2">
                            <input type="text" value={topic} onChange={e => updateModuleTopic(mi, ti, e.target.value)} className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder={`Ämne ${ti + 1}`} />
                            {module.topics.length > 1 && <button type="button" onClick={() => removeModuleTopic(mi, ti)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><X className="w-4 h-4" /></button>}
                          </div>
                        ))}
                        <button type="button" onClick={() => addModuleTopic(mi)} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"><Plus className="w-3 h-3" />Lägg till ämne</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Instructor */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <SectionHeader title="Ansvarig lärare" section="instructor" icon={Users} />
          {expandedSections.instructor && (
            <div className="p-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Namn</label>
                  <input type="text" value={formData.instructorName} onChange={e => setFormData(p => ({ ...p, instructorName: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="t.ex. Dr. Emma Bergström" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Titel</label>
                  <input type="text" value={formData.instructorTitle} onChange={e => setFormData(p => ({ ...p, instructorTitle: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="t.ex. Lektor i Miljöpsykologi" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-900 mb-2">Bio</label>
                  <textarea rows={3} value={formData.instructorBio} onChange={e => setFormData(p => ({ ...p, instructorBio: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Kort beskrivning av lärarens bakgrund och expertis" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scheduled Starts */}
        {(formData.trainingType === 'scheduled' || formData.trainingType === 'both') && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <SectionHeader title="Planerade utbildningsstarter" section="starts" icon={Calendar} />
            {expandedSections.starts && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600">Lägg till schemalagda kurstillfällen</p>
                  <button type="button" onClick={addScheduledStart} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"><Plus className="w-4 h-4" />Lägg till start</button>
                </div>
                <div className="space-y-4">
                  {formData.scheduledStarts.map((start, i) => (
                    <div key={i} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-slate-900">Start {i + 1}</h4>
                        <button type="button" onClick={() => removeScheduledStart(i)} className="text-red-600 hover:bg-red-50 p-1 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <div className="grid md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Startdatum</label>
                          <input type="date" value={start.startDate} onChange={e => updateScheduledStart(i, 'startDate', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Sista ansökningsdag</label>
                          <input type="date" value={start.applicationDeadline} onChange={e => updateScheduledStart(i, 'applicationDeadline', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Pris (kr)</label>
                          <input type="number" value={start.price} onChange={e => updateScheduledStart(i, 'price', parseFloat(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Max deltagare</label>
                          <input type="number" value={start.maxParticipants} onChange={e => updateScheduledStart(i, 'maxParticipants', parseInt(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Lediga platser</label>
                          <input type="number" value={start.availableSpots} onChange={e => updateScheduledStart(i, 'availableSpots', parseInt(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                          <select value={start.status} onChange={e => updateScheduledStart(i, 'status', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                            <option value="open">Öppen</option>
                            <option value="few_spots">Få platser</option>
                            <option value="full">Fullbokad</option>
                            <option value="upcoming">Kommande</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                  {formData.scheduledStarts.length === 0 && <div className="text-center py-6 text-sm text-slate-500">Inga starter tillagda ännu</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contact Person */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <SectionHeader title="Kontaktperson" section="contact" icon={Mail} />
          {expandedSections.contact && (
            <div className="p-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Namn</label>
                  <input type="text" value={formData.contactPersonName} onChange={e => setFormData(p => ({ ...p, contactPersonName: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="t.ex. Maria Andersson" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Titel</label>
                  <input type="text" value={formData.contactPersonTitle} onChange={e => setFormData(p => ({ ...p, contactPersonTitle: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="t.ex. Programansvarig" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">E-post</label>
                  <input type="email" value={formData.contactPersonEmail} onChange={e => setFormData(p => ({ ...p, contactPersonEmail: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="kontakt@university.se" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">Telefon</label>
                  <input type="tel" value={formData.contactPersonPhone} onChange={e => setFormData(p => ({ ...p, contactPersonPhone: e.target.value }))} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="+46 8 123 456 78" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FAQ */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <SectionHeader title="Vanliga frågor (FAQ)" section="faq" icon={AlertCircle} />
          {expandedSections.faq && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">Lägg till vanliga frågor och svar</p>
                <button type="button" onClick={addFAQ} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"><Plus className="w-4 h-4" />Lägg till fråga</button>
              </div>
              <div className="space-y-3">
                {formData.faq.map((item, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-slate-900 text-sm">Fråga {i + 1}</h4>
                      <button type="button" onClick={() => removeFAQ(i)} className="text-red-600 hover:bg-red-50 p-1 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <input type="text" value={item.question} onChange={e => updateFAQ(i, 'question', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder="Fråga" />
                    <textarea rows={2} value={item.answer} onChange={e => updateFAQ(i, 'answer', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none" placeholder="Svar" />
                  </div>
                ))}
                {formData.faq.length === 0 && <div className="text-center py-6 text-sm text-slate-500">Inga frågor tillagda ännu</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="flex justify-end gap-3 pt-6 border-t border-slate-200">
        <button type="button" onClick={() => navigate('/provider/courses')} className="px-6 py-2.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors font-medium">Avbryt</button>
        <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-medium transition-colors">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {isEdit ? 'Spara ändringar' : 'Publicera kurs'}
        </button>
      </div>
    </form>
  );
}
