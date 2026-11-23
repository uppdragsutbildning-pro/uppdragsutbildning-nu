import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabaseClient';

// Adminens anmälningsöversikt för en kurs, grupperad per kursstart. Statusändringar går mot
// samma tabell som leverantörens vy. Observera att databasen skickar mejl till deltagaren vid
// statusbyte (trigger), så bekräfta/avböj ska göras medvetet.

type Status = 'new' | 'reviewed' | 'confirmed' | 'declined';
interface App {
  id: string;
  scheduled_start_id: string;
  student_name: string;
  student_email: string;
  student_phone: string;
  company: string;
  department: string | null;
  notes: string | null;
  status: Status;
  submitted_at: string;
}
interface Start {
  id: string;
  start_date: string;
  status: string;
  available_spots: number;
  max_participants: number;
}

const LABEL: Record<Status, string> = { new: 'Ny', reviewed: 'Granskad', confirmed: 'Bekräftad', declined: 'Avböjd' };
const COLOR: Record<Status, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  reviewed: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  declined: 'bg-red-50 text-red-700 border-red-200',
};
const fmtDate = (d: string) => new Date(d).toLocaleDateString('sv-SE');

export function TrainingApplicationsPanel({ trainingId }: { trainingId: string }) {
  const [apps, setApps] = useState<App[]>([]);
  const [starts, setStarts] = useState<Start[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [a, s] = await Promise.all([
        supabase.from('applications').select('id, scheduled_start_id, student_name, student_email, student_phone, company, department, notes, status, submitted_at').eq('training_id', trainingId).order('submitted_at', { ascending: false }),
        supabase.from('scheduled_starts').select('id, start_date, status, available_spots, max_participants').eq('training_id', trainingId).order('start_date'),
      ]);
      if (!active) return;
      if (a.error) toast.error('Kunde inte ladda anmälningar');
      setApps((a.data ?? []) as App[]);
      setStarts((s.data ?? []) as Start[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [trainingId]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { new: 0, reviewed: 0, confirmed: 0, declined: 0 };
    apps.forEach(a => { c[a.status] = (c[a.status] ?? 0) + 1; });
    return c;
  }, [apps]);

  const visible = apps.filter(a => filter === 'all' || a.status === filter);
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function setStatus(ids: string[], status: Status) {
    if (ids.length === 0) return;
    const notify = status === 'confirmed' || status === 'declined';
    const msg = `Markera ${ids.length} anmälan${ids.length > 1 ? 'ar' : ''} som ${LABEL[status].toLowerCase()}?` + (notify ? '\n\nDeltagaren kan få ett automatiskt mejl om statusändringen.' : '');
    if (!window.confirm(msg)) return;
    setBusy(true);
    const { error } = await supabase.from('applications').update({ status }).in('id', ids);
    setBusy(false);
    if (error) { toast.error('Kunde inte uppdatera status', { description: error.message }); return; }
    setApps(prev => prev.map(a => (ids.includes(a.id) ? { ...a, status } : a)));
    setSelected(new Set());
    toast.success('Status uppdaterad');
  }

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const startDate = (id: string) => starts.find(s => s.id === id)?.start_date ?? '';
    const head = ['Namn', 'E-post', 'Telefon', 'Organisation', 'Avdelning', 'Kursstart', 'Status', 'Anmäld', 'Anteckning'];
    const lines = visible.map(a => [a.student_name, a.student_email, a.student_phone, a.company, a.department, startDate(a.scheduled_start_id), LABEL[a.status], fmtDate(a.submitted_at), a.notes].map(esc).join(','));
    const blob = new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const el = document.createElement('a');
    el.href = URL.createObjectURL(blob);
    el.download = `anmalningar-${trainingId.slice(0, 8)}.csv`;
    el.click();
    URL.revokeObjectURL(el.href);
  };

  const groups = [...starts, ...(apps.some(a => !starts.find(s => s.id === a.scheduled_start_id)) ? [{ id: '__none', start_date: '', status: '', available_spots: 0, max_participants: 0 }] : [])];

  return (
    <section className="mt-10 bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Anmälningar</h2>
          <p className="text-sm text-slate-600">
            {apps.length} totalt: {counts.new} nya, {counts.reviewed} granskade, {counts.confirmed} bekräftade, {counts.declined} avböjda
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" aria-label="Status">
            <option value="all">Alla statusar</option>
            {(Object.keys(LABEL) as Status[]).map(s => <option key={s} value={s}>{LABEL[s]}</option>)}
          </select>
          <button onClick={exportCsv} disabled={visible.length === 0} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
          <span className="text-slate-700">{selected.size} valda:</span>
          {(['reviewed', 'confirmed', 'declined'] as Status[]).map(s => (
            <button key={s} disabled={busy} onClick={() => setStatus([...selected], s)} className="px-3 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-50">
              Markera {LABEL[s].toLowerCase()}
            </button>
          ))}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-slate-500 hover:text-slate-900">Avmarkera</button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Laddar anmälningar…</p>
      ) : apps.length === 0 ? (
        <p className="text-sm text-slate-500">Inga anmälningar ännu.</p>
      ) : (
        <div className="space-y-6">
          {groups.map(g => {
            const rows = visible.filter(a => (g.id === '__none' ? !starts.find(s => s.id === a.scheduled_start_id) : a.scheduled_start_id === g.id));
            if (rows.length === 0) return null;
            return (
              <div key={g.id}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-slate-900">
                    {g.id === '__none' ? 'Borttagen kursstart' : `Kursstart ${fmtDate(g.start_date)}`}
                  </h3>
                  {g.id !== '__none' && <span className="text-xs text-slate-500">{g.max_participants - g.available_spots}/{g.max_participants} platser upptagna</span>}
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-600">
                      <tr>
                        <th className="px-3 py-2 w-8">
                          <input type="checkbox" aria-label="Markera alla" checked={rows.every(r => selected.has(r.id))} onChange={e => setSelected(prev => { const n = new Set(prev); rows.forEach(r => (e.target.checked ? n.add(r.id) : n.delete(r.id))); return n; })} />
                        </th>
                        <th className="px-3 py-2 font-medium">Deltagare</th>
                        <th className="px-3 py-2 font-medium">Organisation</th>
                        <th className="px-3 py-2 font-medium">Anmäld</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(a => (
                        <tr key={a.id}>
                          <td className="px-3 py-2"><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Markera ${a.student_name}`} /></td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900">{a.student_name}</div>
                            <div className="text-xs text-slate-500"><a href={`mailto:${a.student_email}`} className="hover:text-blue-600">{a.student_email}</a>{a.student_phone ? ` · ${a.student_phone}` : ''}</div>
                            {a.notes && <div className="text-xs text-slate-500 mt-1">{a.notes}</div>}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{a.company}{a.department ? <span className="text-slate-500">, {a.department}</span> : null}</td>
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtDate(a.submitted_at)}</td>
                          <td className="px-3 py-2">
                            <select
                              value={a.status}
                              disabled={busy}
                              onChange={e => setStatus([a.id], e.target.value as Status)}
                              className={`px-2 py-1 rounded-full text-xs border ${COLOR[a.status]}`}
                              aria-label={`Status för ${a.student_name}`}
                            >
                              {(Object.keys(LABEL) as Status[]).map(s => <option key={s} value={s}>{LABEL[s]}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
