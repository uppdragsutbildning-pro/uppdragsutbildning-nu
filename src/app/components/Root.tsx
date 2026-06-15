import { Outlet, Link, useLocation } from 'react-router';
import { LayoutDashboard, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Logo } from './Logo';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export function Root() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const isProviderRoute = location.pathname.startsWith('/provider');
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isDashboard = isProviderRoute || isAdminRoute;

  return (
    <div className="min-h-screen bg-slate-50">
      <ScrollToTop />
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Logo />

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              {!isDashboard && (
                <>
                  <Link 
                    to="/catalog" 
                    className={`text-sm transition-colors ${
                      location.pathname === '/catalog' 
                        ? 'text-blue-600 font-medium' 
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bläddra Utbildningar
                  </Link>
                  <Link 
                    to="/request" 
                    className={`text-sm transition-colors ${
                      location.pathname === '/request' 
                        ? 'text-blue-600 font-medium' 
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Efterfråga Utbildning
                  </Link>
                </>
              )}
              <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
                <Link
                  to="/provider/dashboard"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    isProviderRoute
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Provider
                </Link>
                <Link 
                  to="/admin" 
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    isAdminRoute
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Admin
                </Link>
              </div>
            </nav>

            {/* Mobile menu button */}
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-slate-200">
              <nav className="flex flex-col gap-2">
                {!isDashboard && (
                  <>
                    <Link 
                      to="/catalog" 
                      onClick={() => setMobileMenuOpen(false)}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                        location.pathname === '/catalog' 
                          ? 'bg-blue-50 text-blue-600 font-medium' 
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Bläddra Utbildningar
                    </Link>
                    <Link 
                      to="/request" 
                      onClick={() => setMobileMenuOpen(false)}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                        location.pathname === '/request' 
                          ? 'bg-blue-50 text-blue-600 font-medium' 
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Efterfråga Utbildning
                    </Link>
                  </>
                )}
                <div className="border-t border-slate-200 my-2"></div>
                <Link 
                  to="/provider" 
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isProviderRoute
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Provider Dashboard
                </Link>
                <Link 
                  to="/admin" 
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isAdminRoute
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Admin Dashboard
                </Link>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main>
        <Outlet />
      </main>

      {/* Footer */}
      {!isDashboard && (
        <footer className="bg-slate-900 text-slate-300 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="md:col-span-2">
                <div className="mb-4">
                  <Logo variant="light" />
                </div>
                <p className="text-sm text-slate-400 max-w-md mt-4">
                  Ledande marknadsplats som kopplar samman företag med universitet och utbildningsleverantörer
                  för uppdragsutbildning.
                </p>
              </div>
              
              <div>
                <h3 className="font-medium text-white mb-3">Plattform</h3>
                <ul className="space-y-2 text-sm">
                  <li><Link to="/catalog" className="hover:text-white transition-colors">Bläddra Utbildningar</Link></li>
                  <li><Link to="/request" className="hover:text-white transition-colors">Efterfråga Utbildning</Link></li>
                  <li><Link to="/provider" className="hover:text-white transition-colors">För Leverantörer</Link></li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-medium text-white mb-3">Support</h3>
                <ul className="space-y-2 text-sm">
                  <li><a href="#" className="hover:text-white transition-colors">Hjälpcenter</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Kontakta Oss</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Användarvillkor</a></li>
                </ul>
              </div>
            </div>
            
            <div className="border-t border-slate-800 mt-8 pt-8 text-sm text-slate-500 text-center">
              © 2026 Uppdragsutbildning.nu. Alla rättigheter förbehållna.
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}