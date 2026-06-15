import { Link } from 'react-router';
import { Home, Search } from 'lucide-react';

export function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-bold text-blue-600 mb-4">404</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">
          Sidan Hittades Inte
        </h1>
        <p className="text-slate-600 mb-8">
          Tyvärr kunde vi inte hitta sidan du letar efter. 
          Den kan ha flyttats eller finns inte längre.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            <Home className="w-5 h-5" />
            Till Startsidan
          </Link>
          <Link
            to="/catalog"
            className="inline-flex items-center justify-center gap-2 border border-slate-200 text-slate-700 px-6 py-3 rounded-lg font-medium hover:bg-slate-100 transition-colors"
          >
            <Search className="w-5 h-5" />
            Bläddra Utbildningar
          </Link>
        </div>
      </div>
    </div>
  );
}