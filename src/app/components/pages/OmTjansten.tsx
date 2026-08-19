import { Link } from 'react-router';
import { Building, Settings, GraduationCap, UserCheck, BadgeCheck, ArrowRight } from 'lucide-react';

export function OmTjansten() {
  const cards = [
    {
      icon: <Building className="w-6 h-6 text-blue-600" />,
      title: 'Arbetsgivaren betalar',
      text: 'Din organisation (juridisk person) står för hela kostnaden. Privatpersoner kan inte köpa eller gå utbildningen på eget initiativ.',
    },
    {
      icon: <Settings className="w-6 h-6 text-blue-600" />,
      title: 'Flexibelt upplägg',
      text: 'Utbildningen kan anpassas helt efter er verksamhets schema, mål och specifika utmaningar.',
    },
    {
      icon: <GraduationCap className="w-6 h-6 text-blue-600" />,
      title: 'Akademisk kvalitet',
      text: 'Undervisningen håller högsta kvalitet och kan vid behov ge formella högskole- eller yrkeshögskolepoäng till de anställda.',
    },
    {
      icon: <UserCheck className="w-6 h-6 text-blue-600" />,
      title: 'Inga förkunskapskrav',
      text: 'Eftersom du som arbetsgivare utser deltagarna gäller inte de vanliga akademiska behörighetskraven.',
    },
  ];

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Hero */}
      <section className="bg-white border-b border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full mb-4 tracking-wide uppercase">
            Om tjänsten
          </span>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Vad är en uppdragsutbildning?
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
            En uppdragsutbildning är en skräddarsydd eller färdig kompetensutveckling som du som arbetsgivare köper direkt från ett universitet, en högskola eller en yrkeshögskola för dina medarbetare. Det är ett effektivt verktyg för att höja organisationens kompetens, stärka er konkurrenskraft och behålla värdefull personal.
          </p>
        </div>
      </section>

      {/* Hur fungerar det */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-12">
            Hur fungerar det för dig som beställare?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((item, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-blue-200 hover:shadow-sm transition-all">
                <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                  {item.icon}
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Varför välja */}
      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">
            <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <BadgeCheck className="w-9 h-9 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-3">Varför välja uppdragsutbildning?</h2>
              <p className="text-blue-100 leading-relaxed text-lg">
                Ni får forskningsbaserad kunskap direkt applicerad på er affärsverksamhet – när, var och hur det passar er bäst.
              </p>
            </div>
            <Link
              to="/request"
              className="shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-700 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
            >
              Kom igång
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}