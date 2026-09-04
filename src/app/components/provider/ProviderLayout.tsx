import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import {
  LayoutDashboard, BookOpen, Users, MessageSquare,
  History, LogOut, Menu, X, Globe
} from 'lucide-react';
import { useState, useEffect } from 'react';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);
  return null;
}
import { useAuth } from '../../../contexts/AuthContext';
import { supabase, Provider } from '../../../lib/supabase';
import { ProviderProvider } from '../../../contexts/ProviderContext';

const navItems = [
  { icon: LayoutDashboard, label: 'Översikt', path: '/provider/dashboard' },
  { icon: BookOpen, label: 'Mina kurser', path: '/provider/courses' },
  { icon: Globe, label: 'Var visas mina kurser', path: '/provider/marketplaces' },
  { icon: Users, label: 'Kursanmälningar', path: '/provider/applications' },
  { icon: MessageSquare, label: 'Förfrågningar', path: '/provider/requests' },
  { icon: History, label: 'Historik', path: '/provider/history' },
];

export function ProviderLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [allProviders, setAllProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (isAdmin) {
      // Load all providers for admin to choose from
      loadAllProviders();
    } else if (profile?.provider_id) {
      // Load specific provider for provider user
      setSelectedProviderId(profile.provider_id);
    }
  }, [profile, isAdmin]);

  useEffect(() => {
    if (selectedProviderId) {
      loadProvider(selectedProviderId);
    }
  }, [selectedProviderId]);

  async function loadAllProviders() {
    try {
      const { data, error } = await supabase
        .from('providers')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAllProviders(data || []);

      // Auto-select first provider if admin hasn't selected one
      if (data && data.length > 0 && !selectedProviderId) {
        setSelectedProviderId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading providers:', error);
    }
  }

  async function loadProvider(providerId: string) {
    try {
      const { data, error } = await supabase
        .from('providers')
        .select('*')
        .eq('id', providerId)
        .single();

      if (error) throw error;
      setProvider(data);
    } catch (error) {
      console.error('Error loading provider:', error);
    }
  }

  async function handleLogout() {
    await signOut();
    navigate('/');
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <ScrollToTop />
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">U</span>
                </div>
                <span className="font-bold text-slate-900">Uppdragsutbildning.nu</span>
              </Link>
              <span className="hidden sm:inline-block px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100 font-medium">
                {isAdmin ? 'Admin → Leverantörsportal' : 'Leverantörsportal'}
              </span>
            </div>

            <div className="flex items-center gap-4">
              {isAdmin ? (
                <div className="hidden md:flex items-center gap-2">
                  <select
                    value={selectedProviderId}
                    onChange={(e) => setSelectedProviderId(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {allProviders.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : provider && (
                <div className="hidden md:flex items-center gap-2 text-sm">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm">
                    {getInitials(provider.name)}
                  </div>
                  <span className="text-slate-700">{provider.name}</span>
                </div>
              )}
              {isAdmin && (
                <Link
                  to="/admin"
                  className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors border border-purple-200"
                  title="Gå till Admin"
                >
                  Admin
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                title="Logga ut"
              >
                <LogOut className="w-5 h-5" />
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-slate-600"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200">
          <nav className="px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-12 gap-8">
          {/* Sidebar navigation - desktop */}
          <aside className="hidden md:block lg:col-span-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4 sticky top-24">
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <main className="lg:col-span-9">
            <ProviderProvider selectedProviderId={selectedProviderId} isAdmin={isAdmin}>
              <Outlet />
            </ProviderProvider>
          </main>
        </div>
      </div>
    </div>
  );
}
