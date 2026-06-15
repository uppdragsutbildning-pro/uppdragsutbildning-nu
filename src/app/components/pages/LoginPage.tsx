import { useState, FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { Mail, Lock, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { toast } from 'sonner';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  const from = (location.state as any)?.from?.pathname || '/provider/dashboard';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!email || !password) {
      toast.error('Fyll i både e-post och lösenord');
      return;
    }

    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast.error('Inloggning misslyckades', {
        description: error.message === 'Invalid login credentials'
          ? 'Felaktig e-post eller lösenord'
          : error.message
      });
      setLoading(false);
    } else {
      toast.success('Inloggad!');
      navigate(from, { replace: true });
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();

    if (!email) {
      toast.error('Ange din e-postadress');
      return;
    }

    setLoading(true);

    const { error } = await resetPassword(email);

    setLoading(false);

    if (error) {
      toast.error('Kunde inte skicka återställningslänk', {
        description: error.message
      });
    } else {
      toast.success('Återställningslänk skickad!', {
        description: 'Kolla din e-post för instruktioner'
      });
      setShowResetPassword(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back to home */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-blue-200 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Tillbaka till startsidan
        </Link>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              {showResetPassword ? 'Återställ lösenord' : 'Logga in'}
            </h1>
            <p className="text-slate-600 text-sm">
              {showResetPassword
                ? 'Ange din e-postadress så skickar vi en återställningslänk'
                : 'Leverantörs- och administratörsportal'
              }
            </p>
          </div>

          {showResetPassword ? (
            // Reset password form
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  E-postadress
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="din@email.com"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-medium transition-colors"
              >
                {loading ? 'Skickar...' : 'Skicka återställningslänk'}
              </button>

              <button
                type="button"
                onClick={() => setShowResetPassword(false)}
                className="w-full text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                Tillbaka till inloggning
              </button>
            </form>
          ) : (
            // Login form
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  E-postadress
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="din@email.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Lösenord
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-slate-600">Kom ihåg mig</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowResetPassword(true)}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Glömt lösenord?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-medium transition-colors"
              >
                {loading ? 'Loggar in...' : 'Logga in'}
              </button>
            </form>
          )}

          {/* Info box */}
          <div className="mt-6 bg-blue-50 border border-blue-100 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">För leverantörer</p>
                <p className="text-blue-700">
                  Kontakta administratören för att få ditt inloggningskonto.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-blue-200 text-sm mt-6">
          © 2026 Uppdragsutbildning.nu. Alla rättigheter förbehållna.
        </p>
      </div>
    </div>
  );
}
