import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, GraduationCap, Clock, MapPin, BookOpen, Sparkles,
  CheckCircle, ChevronDown, Share2, Users, Phone, Mail,
  Star, TrendingUp, CalendarDays, Briefcase, Flame
} from 'lucide-react';
import { getTrainingById, getProviderById, getCategoryById } from '../../data/mockData';
import { providerLogos } from '../../data/providerLogos';
import { StatusBadge } from '../training/StatusBadge';
import { CourseStartCard } from '../training/CourseStartCard';
import { AccordionItem } from '../training/AccordionItem';
import { toast } from 'sonner';

const formatLabel: Record<string, string> = { online: 'Online', onsite: 'På plats', hybrid: 'Hybrid' };

export function TrainingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const training = getTrainingById(id || '');
  const provider = training ? getProviderById(training.providerId) : null;
  const category = training ? getCategoryById(training.categoryId) : null;
  const [openCurriculum, setOpenCurriculum] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'starts'>('overview');

  if (!training || !provider || !category) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Utbildning hittades inte</h1>
        <Link to="/catalog" className="text-blue-600 hover:text-blue-700">Tillbaka till katalogen</Link>
      </div>
    );
  }

  const isCustom = training.trainingType === 'custom' || training.trainingType === 'both';
  const isScheduled = training.trainingType === 'scheduled' || training.trainingType === 'both';
  const hasStarts = isScheduled && training.scheduledStarts && training.scheduledStarts.length > 0;
  const nextStart = hasStarts
    ? training.scheduledStarts!.find(s => s.status !== 'full')
    : null;

  const handleApply = (startId: string) => {
    toast.success('Ansökan påbörjad', { description: `Du dirigeras till anmälningsformuläret.` });
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Länk kopierad', { description: 'Utbildningslänken är kopierad till urklipp.' });
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-24 lg:pb-12">

      {/* ── HERO ───────────────────────────────────────────────── */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          backgroundImage: `url(${training.imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          minHeight: 380
        }}
      >
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/88 via-blue-800/82 to-slate-900/90" />

        {/* Back link */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <Link
            to="/catalog"
            className="inline-flex items-center gap-2 text-blue-200 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Tillbaka till katalogen
          </Link>
        </div>

        {/* Hero content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pb-14">
          <div className="max-w-3xl">
            {/* Category + type tags */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="inline-block bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-sm text-white border border-white/20">
                {category.name}
              </span>
              {isCustom && (
                <span className="inline-flex items-center gap-1.5 bg-violet-500/30 backdrop-blur-sm border border-violet-300/40 px-3 py-1 rounded-full text-sm text-violet-100">
                  <Briefcase className="w-3.5 h-3.5" />
                  Skräddarsydd
                </span>
              )}
              {isScheduled && (
                <span className="inline-flex items-center gap-1.5 bg-emerald-500/30 backdrop-blur-sm border border-emerald-300/40 px-3 py-1 rounded-full text-sm text-emerald-100">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Schemalagd
                </span>
              )}
              {training.isPopular && (
                <span className="inline-flex items-center gap-1.5 bg-amber-400/30 backdrop-blur-sm border border-amber-300/40 px-3 py-1 rounded-full text-sm text-amber-100">
                  <Flame className="w-3.5 h-3.5" />
                  Populär
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight">
              {training.title}
            </h1>

            {/* Provider */}
            <div className="flex items-center gap-3 mb-5">
              {providerLogos[provider.id] ? (
                <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center p-1.5 flex-shrink-0">
                  <img src={providerLogos[provider.id]} alt={provider.name} className="w-full h-full object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
              )}
              <span className="text-blue-100 font-medium">{provider.name}</span>
            </div>

            {/* Meta chips */}
            <div className="flex flex-wrap gap-3">
              {[
                { icon: <Clock className="w-3.5 h-3.5" />, label: training.duration },
                { icon: <MapPin className="w-3.5 h-3.5" />, label: formatLabel[training.format] },
                { icon: <BookOpen className="w-3.5 h-3.5" />, label: `${training.credits} hp` },
                ...(training.courseCode ? [{ icon: <span className="font-mono text-xs">#</span>, label: training.courseCode }] : [])
              ].map((item, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-1.5 rounded-lg text-sm text-blue-50">
                  {item.icon}
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── CONTENT ────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">

        <div className="grid lg:grid-cols-3 gap-8 items-start">

          {/* ── LEFT COLUMN ──────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Mobile CTA strip */}
            <div className="lg:hidden flex gap-3">
              {isCustom && (
                <button
                  onClick={() => navigate(`/request/${training.id}`)}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl font-medium text-sm transition-colors shadow-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  Begär offert
                </button>
              )}
              {hasStarts && nextStart && (
                <button
                  onClick={() => handleApply(nextStart.id)}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl font-medium text-sm transition-colors shadow-sm"
                >
                  <CalendarDays className="w-4 h-4" />
                  Anmäl dig
                </button>
              )}
            </div>

            {/* Tabs (show if both types) */}
            {hasStarts && (
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'overview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Om utbildningen
                </button>
                <button
                  onClick={() => setActiveTab('starts')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    activeTab === 'starts' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CalendarDays className="w-4 h-4" />
                  Utbildningsstarter
                  <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                    {training.scheduledStarts!.length}
                  </span>
                </button>
              </div>
            )}

            {/* ── OVERVIEW TAB ─── */}
            {activeTab === 'overview' && (
              <>
                {/* Description */}
                <section className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
                  {/* Quick stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 pb-8 border-b border-slate-100">
                    {[
                      { val: training.views.toString(), label: 'Visningar', icon: <TrendingUp className="w-5 h-5 text-blue-500" /> },
                      { val: training.leads.toString(), label: 'Förfrågningar', icon: <Users className="w-5 h-5 text-emerald-500" /> },
                      { val: `${training.credits} hp`, label: 'Högskolepoäng', icon: <BookOpen className="w-5 h-5 text-violet-500" /> },
                      {
                        val: hasStarts ? training.scheduledStarts!.length.toString() : '—',
                        label: hasStarts ? 'Planerade starter' : 'Skräddarsydd',
                        icon: <CalendarDays className="w-5 h-5 text-amber-500" />
                      }
                    ].map((s, i) => (
                      <div key={i} className="flex flex-col items-center text-center p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                        <div className="mb-2">{s.icon}</div>
                        <div className="text-2xl font-bold text-slate-900 mb-1">{s.val}</div>
                        <div className="text-xs text-slate-500 font-medium">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <h2 className="text-xl font-bold text-slate-900 mb-3">Om utbildningen</h2>
                  <p className="text-slate-700 leading-relaxed mb-6">{training.description}</p>
                  <div className="grid md:grid-cols-2 gap-6 pt-6 border-t border-slate-100">
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-400" />
                        Målgrupp
                      </h3>
                      <p className="text-slate-600 text-sm leading-relaxed">{training.targetAudience}</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-slate-400" />
                        Format
                      </h3>
                      <p className="text-slate-600 text-sm">{formatLabel[training.format]}</p>
                    </div>
                  </div>
                </section>

                {/* Learning outcomes */}
                {training.learningOutcomes && training.learningOutcomes.length > 0 && (
                  <section className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
                    <h2 className="text-xl font-bold text-slate-900 mb-5">Vad du kommer att lära dig</h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {training.learningOutcomes.map((item, i) => (
                        <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-lg px-4 py-3">
                          <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-700 text-sm leading-relaxed">{item}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Curriculum */}
                {training.curriculum && training.curriculum.length > 0 && (
                  <section className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
                    <h2 className="text-xl font-bold text-slate-900 mb-5">Kursinnehåll</h2>
                    <div className="space-y-2">
                      {training.curriculum.map((mod, i) => (
                        <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                          <button
                            onClick={() => setOpenCurriculum(openCurriculum === i ? null : i)}
                            className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                                {i + 1}
                              </span>
                              <span className="font-medium text-slate-900">{mod.title}</span>
                            </div>
                            <ChevronDown className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform duration-200 ${openCurriculum === i ? 'rotate-180' : ''}`} />
                          </button>
                          {openCurriculum === i && (
                            <div className="px-5 pb-4 pt-1 border-t border-slate-100 bg-slate-50">
                              <ul className="space-y-2">
                                {mod.topics.map((t, j) => (
                                  <li key={j} className="flex items-center gap-2.5 text-sm text-slate-700">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                                    {t}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Scheduled starts inline (small teaser if on overview tab) */}
                {hasStarts && (
                  <section className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-xl border border-blue-100 p-6 md:p-8">
                    <div className="flex items-center justify-between mb-5">
                      <h2 className="text-xl font-bold text-slate-900">Planerade utbildningsstarter</h2>
                      <button
                        onClick={() => setActiveTab('starts')}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Visa alla →
                      </button>
                    </div>
                    <div className="space-y-3">
                      {training.scheduledStarts!.slice(0, 2).map(start => (
                        <CourseStartCard key={start.id} start={start} onApply={handleApply} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Instructor */}
                {training.instructor && (
                  <section className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
                    <h2 className="text-xl font-bold text-slate-900 mb-5">Ansvarig lärare</h2>
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0 text-white font-bold text-xl">
                        {training.instructor.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 mb-0.5">{training.instructor.name}</h3>
                        <p className="text-sm text-blue-600 mb-3">{training.instructor.title}</p>
                        <p className="text-slate-600 text-sm leading-relaxed">{training.instructor.bio}</p>
                      </div>
                    </div>
                  </section>
                )}

                {/* Provider */}
                <section className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
                  <h2 className="text-xl font-bold text-slate-900 mb-5">Om lärosätet</h2>
                  <div className="flex items-start gap-4 mb-4">
                    {providerLogos[provider.id] ? (
                      <div className="w-20 h-16 rounded-xl border border-slate-200 bg-white flex items-center justify-center p-3 flex-shrink-0">
                        <img src={providerLogos[provider.id]} alt={provider.name} className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <GraduationCap className="w-8 h-8 text-white" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-1">{provider.name}</h3>
                      <span className="inline-block px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100">
                        {provider.type === 'university' ? 'Universitet & Lärosäte' : 'Privat Leverantör'}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-600 leading-relaxed">{provider.description}</p>
                </section>

                {/* FAQ */}
                {training.faq && training.faq.length > 0 && (
                  <section className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
                    <h2 className="text-xl font-bold text-slate-900 mb-5">Vanliga frågor</h2>
                    <div className="space-y-2">
                      {training.faq.map((item, i) => (
                        <AccordionItem key={i} question={item.question} answer={item.answer} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* ── STARTS TAB ─── */}
            {activeTab === 'starts' && hasStarts && (
              <section className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Planerade utbildningsstarter</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      {training.scheduledStarts!.length} tillfälle{training.scheduledStarts!.length !== 1 ? 'n' : ''} tillgängliga
                    </p>
                  </div>
                  {training.scheduledStarts!.some(s => s.status === 'few_spots') && (
                    <span className="hidden sm:flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                      <Star className="w-4 h-4" />
                      Begränsat antal platser
                    </span>
                  )}
                </div>
                <div className="space-y-4">
                  {training.scheduledStarts!.map(start => (
                    <CourseStartCard key={start.id} start={start} onApply={handleApply} />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── RIGHT SIDEBAR ──────────────────────────────────── */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="sticky top-24 space-y-4">

              {/* ── Card 1: Custom / Offert ── */}
              {isCustom && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Briefcase className="w-4 h-4 text-violet-200" />
                      <span className="text-violet-100 text-sm font-medium">Skräddarsydd utbildning</span>
                    </div>
                    <h3 className="text-white font-bold">Anpassa för er organisation</h3>
                  </div>
                  <div className="p-5">
                    <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                      {provider.name} kan skräddarsy utbildningen utifrån er verksamhets unika behov, bransch och mål.
                    </p>
                    <button
                      onClick={() => navigate(`/request/${training.id}`)}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium text-sm transition-colors mb-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      Begär offert
                    </button>
                    <Link
                      to="/request"
                      className="block w-full text-center px-4 py-2.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors font-medium text-sm"
                    >
                      Beskriv ert behov
                    </Link>

                    {/* Contact info */}
                    {training.contactPerson && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Kontaktperson</p>
                        <p className="font-medium text-slate-900 text-sm mb-0.5">{training.contactPerson.name}</p>
                        <p className="text-xs text-slate-500 mb-3">{training.contactPerson.title}</p>
                        <div className="space-y-1.5">
                          <a href={`mailto:${training.contactPerson.email}`} className="flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 transition-colors">
                            <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                            {training.contactPerson.email}
                          </a>
                          <a href={`tel:${training.contactPerson.phone}`} className="flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 transition-colors">
                            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                            {training.contactPerson.phone}
                          </a>
                        </div>
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {training.contactPerson.responseTime}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Card 2: Scheduled / Next start ── */}
              {hasStarts && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarDays className="w-4 h-4 text-emerald-200" />
                      <span className="text-emerald-100 text-sm font-medium">Schemalagd utbildning</span>
                    </div>
                    <h3 className="text-white font-bold">Kommande utbildningsstarter</h3>
                  </div>
                  <div className="p-5">
                    {nextStart ? (
                      <>
                        <div className="mb-3">
                          <StatusBadge status={nextStart.status} size="sm" />
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Nästa start</span>
                            <span className="font-semibold text-slate-900">
                              {new Date(nextStart.startDate).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Kostnad</span>
                            <span className="font-semibold text-slate-900">{nextStart.price.toLocaleString('sv-SE')} kr</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Lediga platser</span>
                            <span className={`font-semibold ${nextStart.availableSpots <= 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {nextStart.availableSpots} st
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleApply(nextStart.id)}
                          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-lg font-medium text-sm transition-colors mb-2"
                        >
                          <CalendarDays className="w-4 h-4" />
                          Anmäl dig nu
                        </button>
                        <button
                          onClick={() => setActiveTab('starts')}
                          className="w-full text-center px-4 py-2.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors font-medium text-sm"
                        >
                          Visa alla {training.scheduledStarts!.length} starter
                        </button>

                        {/* Custom training option */}
                        <div className="mt-5 pt-5 border-t border-slate-200">
                          <div className="flex items-start gap-2 mb-3">
                            <Briefcase className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-slate-900 mb-1">Passar inte dessa datum?</p>
                              <p className="text-xs text-slate-600 leading-relaxed">Vi kan anpassa utbildningen efter era behov och schema.</p>
                            </div>
                          </div>
                          <button
                            onClick={() => navigate(`/request/${training.id}`)}
                            className="w-full flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors"
                          >
                            <Sparkles className="w-4 h-4" />
                            Diskutera anpassad lösning
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-600 text-center py-2">Inga lediga platser just nu. Bevaka för kommande starter.</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Quick Info ── */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide">Snabbinfo</h3>
                <dl className="space-y-3 text-sm">
                  {training.courseCode && (
                    <div className="flex justify-between items-center">
                      <dt className="text-slate-500">Kurskod</dt>
                      <dd className="font-mono text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded text-xs">{training.courseCode}</dd>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <dt className="text-slate-500">Längd</dt>
                    <dd className="font-medium text-slate-900">{training.duration}</dd>
                  </div>
                  <div className="flex justify-between items-center">
                    <dt className="text-slate-500">Högskolepoäng</dt>
                    <dd className="font-medium text-slate-900 flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                      {training.credits} hp
                    </dd>
                  </div>
                  <div className="flex justify-between items-center">
                    <dt className="text-slate-500">Format</dt>
                    <dd className="font-medium text-slate-900">{formatLabel[training.format]}</dd>
                  </div>
                  <div className="flex justify-between items-center">
                    <dt className="text-slate-500">Kategori</dt>
                    <dd className="font-medium text-slate-900">{category.name}</dd>
                  </div>
                  <div className="flex justify-between items-center">
                    <dt className="text-slate-500">Typ</dt>
                    <dd className="font-medium text-slate-900">
                      {training.trainingType === 'both' ? 'Skräddarsydd & Schemalagd' :
                       training.trainingType === 'custom' ? 'Skräddarsydd' : 'Schemalagd'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* ── Share ── */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-900 mb-2 text-sm">Dela utbildningen</h3>
                <p className="text-xs text-slate-500 mb-3">Hittade du något intressant? Dela med kollegor.</p>
                <button
                  onClick={handleShare}
                  className="w-full flex items-center justify-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  Kopiera länk
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE STICKY BOTTOM BAR ─────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-white border-t border-slate-200 px-4 py-3 flex gap-3 z-40 shadow-lg">
        {isCustom && (
          <button
            onClick={() => navigate(`/request/${training.id}`)}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium text-sm transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Begär offert
          </button>
        )}
        {hasStarts && nextStart && (
          <button
            onClick={() => handleApply(nextStart.id)}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-medium text-sm transition-colors"
          >
            <CalendarDays className="w-4 h-4" />
            Anmäl dig
          </button>
        )}
      </div>
    </div>
  );
}
