import { Link } from 'react-router';
import { Search, Sparkles, TrendingUp, Users, Building, GraduationCap, ArrowRight, BookOpen } from 'lucide-react';
import { useState } from 'react';
import { categories, getFeaturedTrainings, getProviderById, getCategoryById } from '../../data/mockData';
import { universityPartners } from '../../data/providerLogos';

export function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const featuredTrainings = getFeaturedTrainings();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    window.location.href = `/catalog?q=${encodeURIComponent(searchQuery)}`;
  };

  return (
    <div className="pb-16">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 text-white overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'url(https://images.unsplash.com/photo-1653566031486-dc4ead13a35d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920)'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/75 via-blue-700/80 to-blue-800/85" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-blue-500/30 backdrop-blur-sm px-4 py-2 rounded-full mb-6">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm">AI-driven marknadsplats för utbildning</span>
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Hitta rätt utbildning för din organisation
            </h1>
            
            <p className="text-lg md:text-xl text-blue-100 mb-8">
              Koppla samman med ledande universitet och utbildningsleverantörer. Få personliga 
              rekommendationer med hjälp av AI.
            </p>

            {/* AI Search Bar */}
            <form onSubmit={handleSearch} className="relative">
              <div className="flex items-center bg-white rounded-xl shadow-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 md:px-6 py-4 flex-1">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <input
                    type="text"
                    placeholder="Beskriv ert utbildningsbehov... (t.ex. 'ledarskapsutbildning för 20 chefer')"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 outline-none text-slate-900 placeholder:text-slate-400"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 md:px-8 py-4 font-medium transition-colors flex items-center gap-2"
                >
                  <Search className="w-5 h-5" />
                  <span className="hidden sm:inline">Sök</span>
                </button>
              </div>
              <p className="text-blue-100 text-sm mt-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                AI hjälper dig att hitta den perfekta matchningen
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-1">200+</div>
              <div className="text-sm text-slate-600">Utbildningsprogram</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-1">50+</div>
              <div className="text-sm text-slate-600">Betrodda Leverantörer</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-1">1 000+</div>
              <div className="text-sm text-slate-600">Nöjda Företag</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-1">95%</div>
              <div className="text-sm text-slate-600">Nöjdhetsgrad</div>
            </div>
          </div>
        </div>
      </section>

      {/* University Partners Strip */}
      <section className="bg-slate-50 border-b border-slate-200 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400 mb-8">
            Samarbetsuniversitet &amp; Lärosäten
          </p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-6 items-center">
            {universityPartners.map((partner) => (
              <div
                key={partner.id}
                className="flex items-center justify-center p-3 rounded-xl bg-white border border-slate-200 hover:border-blue-200 hover:shadow-md transition-all group"
                title={partner.name}
              >
                <img
                  src={partner.logo}
                  alt={partner.name}
                  className="h-10 w-full object-contain grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">
              Bläddra per Kategori
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Utforska utbildningsprogram inom olika områden och branscher
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {categories.map((category) => (
              <Link
                key={category.id}
                to={`/catalog?category=${category.id}`}
                className="group bg-white border border-slate-200 rounded-xl p-6 hover:border-blue-300 hover:shadow-lg transition-all"
              >
                <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {category.name}
                </h3>
                <p className="text-sm text-slate-600 mb-3">{category.description}</p>
                <div className="flex items-center text-sm text-blue-600 font-medium">
                  Utforska <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Trainings */}
      <section className="bg-slate-100 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-3">
                Utvalda Utbildningar
              </h2>
              <p className="text-slate-600">
                Populära och högt rankade program från toppeleverantörer
              </p>
            </div>
            <Link 
              to="/catalog" 
              className="hidden md:flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
            >
              Visa alla
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredTrainings.slice(0, 6).map((training, index) => {
              const provider = getProviderById(training.providerId);
              const category = getCategoryById(training.categoryId);

              return (
                <Link
                  key={training.id}
                  to={`/training/${training.id}`}
                  className="group bg-white rounded-xl overflow-hidden border border-slate-200 hover:border-blue-300 hover:shadow-xl transition-all"
                >
                  <div
                    className="aspect-video relative overflow-hidden bg-cover bg-center"
                    style={{ backgroundImage: `url(${training.imageUrl})` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600/40 to-blue-800/40 group-hover:from-blue-600/20 group-hover:to-blue-800/20 transition-all"></div>
                    <div className="absolute top-4 left-4">
                      <span className="inline-block bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-slate-900">
                        {category?.name}
                      </span>
                    </div>
                  </div>
                  
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {training.title}
                      </h3>
                      <TrendingUp className="w-4 h-4 text-blue-600 flex-shrink-0 mt-1" />
                    </div>
                    
                    <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                      {training.description}
                    </p>
                    
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                      <span className="flex items-center gap-1">
                        <GraduationCap className="w-3.5 h-3.5" />
                        {provider?.name}
                      </span>
                      <span>{training.duration}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        training.format === 'online' ? 'bg-green-100 text-green-700' :
                        training.format === 'onsite' ? 'bg-blue-100 text-blue-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {training.format === 'online' ? 'Online' : training.format === 'onsite' ? 'På plats' : 'Hybrid'}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <BookOpen className="w-3 h-3" />
                        {training.credits} hp
                      </span>
                      {training.courseCode && (
                        <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                          {training.courseCode}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="text-center mt-8 md:hidden">
            <Link 
              to="/catalog" 
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
            >
              Visa alla utbildningar
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">
              Så Fungerar Det
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Kom igång i tre enkla steg
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">1. Beskriv Ert Behov</h3>
              <p className="text-sm text-slate-600">
                Använd vår AI-drivna sök för att beskriva vilket utbildningsbehov ni har. Vi förstår och rekommenderar de bästa alternativen.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">2. Jämför Leverantörer</h3>
              <p className="text-sm text-slate-600">
                Bläddra bland program från universitet och utbildningsleverantörer. Jämför innehåll, format och recensioner.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Building className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">3. Efterfråga Offert</h3>
              <p className="text-sm text-slate-600">
                Skicka en förfrågan och få skräddarsydda förslag från kvalificerade leverantörer. Välj det som passar bäst.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Redo att hitta din perfekta utbildning?
          </h2>
          <p className="text-lg text-blue-100 mb-8">
            Låt vår AI hjälpa dig att upptäcka de bästa utbildningslösningarna för er organisation
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/request"
              className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 px-8 py-3 rounded-lg font-medium hover:bg-blue-50 transition-colors"
            >
              <Sparkles className="w-5 h-5" />
              Starta med AI-assistent
            </Link>
            <Link
              to="/catalog"
              className="inline-flex items-center justify-center gap-2 bg-blue-500 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-400 transition-colors"
            >
              Bläddra Katalog
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}