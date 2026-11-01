import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import type { CustomRequest } from '../../../lib/supabase';

type LegacyRequest = Pick<
  CustomRequest,
  | 'id' | 'training_id' | 'company' | 'contact_name' | 'contact_email' | 'contact_phone'
  | 'course_topic' | 'description' | 'budget' | 'timeline' | 'status' | 'submitted_at'
>;

const STATUS_LABEL: Record<LegacyRequest['status'], string> = {
  new: 'Ny',
  responded: 'Besvarad',
  negotiating: 'Förhandling',
  accepted: 'Accepterad',
  declined: 'Avböjd',
  not_selected: 'Ej vald',
};

// Offertförfrågningar som skickades med det tidigare formuläret (/request) och som inte hör till en
// efterfrågan med tilldelningar. Det formuläret är ersatt av efterfrågeflödet, men redan inskickade
// förfrågningar ska fortfarande kunna läsas av admin. Visas bara när det finns några.
export function LegacyRequestsSection() {
  const [requests, setRequests] = useState<LegacyRequest[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from('custom_requests')
      .select('id, training_id, company, contact_name, contact_email, contact_phone, course_topic, description, budget, timeline, status, submitted_at')
      .is('training_request_assignment_id', null)
      .order('submitted_at', { ascending: false })
      .then(({ data }) => {
        if (active && data) setRequests(data as LegacyRequest[]);
      });
    return () => {
      active = false;
    };
  }, []);

  if (requests.length === 0) return null;
  const newCount = requests.filter(r => r.status === 'new').length;

  return (
    <section className="mt-10 border-t border-slate-200 pt-6" aria-label="Äldre offertförfrågningar">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block font-semibold text-slate-900">
            Äldre offertförfrågningar ({requests.length}
            {newCount > 0 && <>, {newCount} nya</>})
          </span>
          <span className="block text-sm text-slate-600">
            Skickade med det tidigare formuläret. Förfrågningar på en kurs besvaras av kursens lärosäte i
            leverantörsportalen; allmänna förfrågningar saknar mottagare.
          </span>
        </span>
        <ChevronDown className={`w-5 h-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <ul className="space-y-3 mt-4">
          {requests.map(req => (
            <li key={req.id} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h3 className="font-semibold text-slate-900">{req.company}</h3>
                {!req.training_id && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 font-medium">Allmän förfrågan</span>
                )}
                <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">{STATUS_LABEL[req.status]}</span>
              </div>
              <p className="text-sm font-medium text-slate-800 mb-1">{req.course_topic}</p>
              <p className="text-sm text-slate-600 mb-3 whitespace-pre-line">{req.description}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span>Kontakt: {req.contact_name}</span>
                <span>{req.contact_email}</span>
                {req.contact_phone && <span>{req.contact_phone}</span>}
                <span>Tidsplan: {req.timeline}</span>
                {req.budget && <span>Budget: {req.budget}</span>}
                <span>{new Date(req.submitted_at).toLocaleDateString('sv-SE')}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
