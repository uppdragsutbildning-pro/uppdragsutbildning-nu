import { useCallback, useEffect, useState } from 'react';
import { Download, FileSignature, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import {
  CONTRACT_TEMPLATE_VERSION,
  CONTRACT_VARIANTS,
  buildContract,
  downloadContractWord,
  type ContractContext,
  type ContractVariant,
} from '../../../lib/contractTemplate';

// Avtal för en bokning (Steg 0): ta fram utkast, redigera och signera utanför plattformen,
// ladda upp den signerade PDF-filen. Avtalet räknas som registrerat först vid uppladdning.
// Behörighet avgörs i databasen (RLS och RPC); canEdit styr bara om knapparna visas.

interface ContractRow {
  id: string;
  variant: ContractVariant;
  buyer_reference: string | null;
  template_version: string;
  snapshot: ContractContext;
  status: 'generated' | 'signed';
  generated_at: string;
  signed_file_path: string | null;
  signed_file_name: string | null;
  signed_registered_at: string | null;
  signed_registered_role: 'buyer' | 'provider' | 'admin' | null;
}

interface AmendmentRow {
  id: string;
  seq: number;
  description: string;
  signed_file_path: string;
  signed_file_name: string;
  registered_role: 'buyer' | 'provider' | 'admin';
  created_at: string;
}

interface EventRow {
  id: string;
  actor_role: 'buyer' | 'provider' | 'admin';
  event_type: string;
  created_at: string;
}

const ROLE_LABEL = { buyer: 'köparen', provider: 'lärosätet', admin: 'plattformen' } as const;

const EVENT_LABEL: Record<string, string> = {
  generated: 'Utkast skapat',
  regenerated: 'Utkast skapat på nytt',
  signed_registered: 'Signerat avtal uppladdat',
  signed_replaced: 'Signerad fil ersatt',
  amendment_registered: 'Tillägg registrerat',
};

const MAX_BYTES = 15 * 1024 * 1024;
const fmt = (d: string) => new Date(d).toLocaleDateString('sv-SE');

async function openStoredFile(path: string) {
  const { data, error } = await supabase.storage.from('contracts').createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    toast.error('Kunde inte öppna filen', { description: error?.message });
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener');
}

function validatePdf(file: File): string | null {
  if (file.type !== 'application/pdf') return 'Endast PDF-filer stöds.';
  if (file.size > MAX_BYTES) return 'Filen är för stor. Max 15 MB.';
  return null;
}

export function ContractPanel({ bookingId, canEdit }: { bookingId: string; canEdit: boolean }) {
  const [contract, setContract] = useState<ContractRow | null | undefined>(undefined);
  const [amendments, setAmendments] = useState<AmendmentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState<ContractVariant>('general');
  const [reference, setReference] = useState('');
  const [editingDraft, setEditingDraft] = useState(false);
  const [amendDescription, setAmendDescription] = useState('');
  const [showAmend, setShowAmend] = useState(false);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('contracts')
      .select(
        'id, variant, buyer_reference, template_version, snapshot, status, generated_at, signed_file_path, signed_file_name, signed_registered_at, signed_registered_role'
      )
      .eq('booking_id', bookingId)
      .maybeSingle();
    if (loadError) {
      setError(loadError.message);
      return;
    }
    setError(null);
    const row = (data as ContractRow | null) ?? null;
    setContract(row);
    if (row) {
      setVariant(row.variant);
      setReference(row.buyer_reference ?? '');
      const [{ data: am }, { data: ev }] = await Promise.all([
        supabase
          .from('contract_amendments')
          .select('id, seq, description, signed_file_path, signed_file_name, registered_role, created_at')
          .eq('contract_id', row.id)
          .order('seq'),
        supabase
          .from('contract_events')
          .select('id, actor_role, event_type, created_at')
          .eq('contract_id', row.id)
          .order('created_at', { ascending: false }),
      ]);
      setAmendments((am ?? []) as AmendmentRow[]);
      setEvents((ev ?? []) as EventRow[]);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  // Hämtar underlaget, bygger utkastet, sparar det och laddar ner Word-filen.
  async function createDraft() {
    setBusy(true);
    try {
      const { data: ctx, error: ctxError } = await supabase.rpc('get_contract_context', { p_booking_id: bookingId });
      if (ctxError) throw ctxError;
      const context = ctx as ContractContext;
      const buyerReference = reference.trim() || context.booking.reference || null;
      const { error: saveError } = await supabase.rpc('save_contract_draft', {
        p_booking_id: bookingId,
        p_variant: variant,
        p_buyer_reference: buyerReference,
        p_template_version: CONTRACT_TEMPLATE_VERSION,
        p_snapshot: context,
      });
      if (saveError) throw saveError;
      downloadContractWord(buildContract(context, { variant, buyerReference }));
      toast.success('Avtalsutkast skapat', { description: 'Redigera filen, signera utanför plattformen och ladda upp den signerade PDF-filen här.' });
      setEditingDraft(false);
      await load();
    } catch (e) {
      toast.error('Kunde inte skapa utkastet', { description: e instanceof Error ? e.message : (e as { message?: string })?.message });
    } finally {
      setBusy(false);
    }
  }

  function downloadExistingDraft() {
    if (!contract) return;
    downloadContractWord(
      buildContract(contract.snapshot, {
        variant: contract.variant,
        buyerReference: contract.buyer_reference,
        generatedAt: new Date(contract.generated_at),
      })
    );
  }

  async function uploadFile(file: File): Promise<string> {
    if (!contract) throw new Error('Avtal saknas');
    const path = `${bookingId}/${contract.id}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage.from('contracts').upload(path, file, { contentType: 'application/pdf' });
    if (uploadError) throw uploadError;
    return path;
  }

  async function handleSigned(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !contract) return;
    const problem = validatePdf(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const path = await uploadFile(file);
      const { error: regError } = await supabase.rpc('register_signed_contract', {
        p_contract_id: contract.id,
        p_file_path: path,
        p_file_name: file.name,
      });
      if (regError) throw regError;
      toast.success('Signerat avtal registrerat');
      await load();
    } catch (err) {
      toast.error('Kunde inte registrera avtalet', { description: err instanceof Error ? err.message : (err as { message?: string })?.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleAmendment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !contract) return;
    if (amendDescription.trim().length === 0) {
      toast.error('Beskriv först vad tillägget ändrar');
      return;
    }
    const problem = validatePdf(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const path = await uploadFile(file);
      const { error: regError } = await supabase.rpc('register_contract_amendment', {
        p_contract_id: contract.id,
        p_description: amendDescription.trim(),
        p_file_path: path,
        p_file_name: file.name,
      });
      if (regError) throw regError;
      toast.success('Tillägg registrerat');
      setAmendDescription('');
      setShowAmend(false);
      await load();
    } catch (err) {
      toast.error('Kunde inte registrera tillägget', { description: err instanceof Error ? err.message : (err as { message?: string })?.message });
    } finally {
      setBusy(false);
    }
  }

  const fileInputClass =
    'block text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:font-medium file:cursor-pointer hover:file:bg-blue-700';

  const variantPicker = (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-slate-500 mb-1">Typ av avtalspart</legend>
      {CONTRACT_VARIANTS.map(v => (
        <label key={v.value} className="flex items-start gap-2 text-sm text-slate-800 cursor-pointer">
          <input type="radio" name={`variant-${bookingId}`} checked={variant === v.value} onChange={() => setVariant(v.value)} className="mt-1" />
          <span>
            {v.label}
            <span className="block text-xs text-slate-500">{v.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );

  const referenceInput = (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">Referens eller diarienummer (valfritt)</span>
      <input
        type="text"
        value={reference}
        onChange={e => setReference(e.target.value)}
        maxLength={200}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-500"
      />
    </label>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FileSignature className="w-4 h-4 text-blue-600" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-900">Avtal</p>
        {contract?.status === 'signed' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Signerat avtal registrerat</span>
        )}
        {contract?.status === 'generated' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Utkast, väntar på signerat avtal</span>
        )}
        {contract === null && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Inget avtal ännu</span>
        )}
      </div>

      {error && <p className="text-sm text-red-700">Kunde inte hämta avtalet: {error}</p>}
      {contract === undefined && !error && <p className="text-sm text-slate-500">Laddar…</p>}

      {contract === null && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Plattformen tar fram ett avtalsutkast med uppgifterna från bokningen. Ni redigerar utkastet, signerar utanför plattformen och
            laddar sedan upp den signerade PDF-filen här. Avtalet är registrerat i plattformen först när den signerade filen är uppladdad.
          </p>
          {canEdit ? (
            <>
              {variantPicker}
              {referenceInput}
              <button
                type="button"
                onClick={createDraft}
                disabled={busy}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {busy ? 'Skapar…' : 'Skapa avtalsutkast (Word)'}
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-500">Du har läsrättighet och kan inte skapa avtal.</p>
          )}
        </div>
      )}

      {contract?.status === 'generated' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Utkast skapat {fmt(contract.generated_at)} ({CONTRACT_VARIANTS.find(v => v.value === contract.variant)?.label}
            {contract.buyer_reference ? `, referens ${contract.buyer_reference}` : ''}). Text i [hakparenteser] ska fyllas i eller strykas.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadExistingDraft}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Ladda ner utkast (Word)
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditingDraft(v => !v)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50"
              >
                Skapa om utkast
              </button>
            )}
          </div>
          {canEdit && editingDraft && (
            <div className="space-y-4 rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-600">Ett nytt utkast ersätter det gamla, och eventuella manuella ändringar i den nedladdade filen följer inte med.</p>
              {variantPicker}
              {referenceInput}
              <button
                type="button"
                onClick={createDraft}
                disabled={busy}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? 'Skapar…' : 'Skapa nytt utkast'}
              </button>
            </div>
          )}
          {canEdit && (
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4" aria-hidden="true" />
                Ladda upp signerat avtal
              </p>
              <p className="text-xs text-slate-500">PDF, max 15 MB. Avtalet registreras som signerat när filen är uppladdad.</p>
              {busy ? <p className="text-sm text-slate-600">Laddar upp…</p> : <input type="file" accept="application/pdf" onChange={handleSigned} className={fileInputClass} />}
            </div>
          )}
        </div>
      )}

      {contract?.status === 'signed' && contract.signed_file_path && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Registrerat {contract.signed_registered_at ? fmt(contract.signed_registered_at) : ''}
            {contract.signed_registered_role ? ` av ${ROLE_LABEL[contract.signed_registered_role]}` : ''}: {contract.signed_file_name}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openStoredFile(contract.signed_file_path!)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Öppna signerat avtal
            </button>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-sm font-medium text-slate-900">Ändringar och tillägg</p>
            {amendments.length === 0 && <p className="text-sm text-slate-500">Inga tillägg registrerade.</p>}
            <ul className="space-y-2">
              {amendments.map(a => (
                <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-slate-800">
                    Tillägg {a.seq}: {a.description}
                    <span className="block text-xs text-slate-500">
                      {fmt(a.created_at)}, registrerat av {ROLE_LABEL[a.registered_role]}
                    </span>
                  </span>
                  <button type="button" onClick={() => openStoredFile(a.signed_file_path)} className="shrink-0 text-blue-600 hover:underline">
                    Öppna
                  </button>
                </li>
              ))}
            </ul>
            {canEdit && !showAmend && (
              <button
                type="button"
                onClick={() => setShowAmend(true)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50"
              >
                Registrera tillägg
              </button>
            )}
            {canEdit && showAmend && (
              <div className="space-y-3 rounded-lg bg-slate-50 p-4">
                <label className="block">
                  <span className="text-xs font-medium text-slate-500">Vad ändrar tillägget?</span>
                  <textarea
                    rows={3}
                    value={amendDescription}
                    onChange={e => setAmendDescription(e.target.value)}
                    maxLength={2000}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-500 resize-none"
                  />
                </label>
                <p className="text-xs text-slate-500">Ladda upp det signerade tillägget som PDF, max 15 MB.</p>
                {busy ? <p className="text-sm text-slate-600">Laddar upp…</p> : <input type="file" accept="application/pdf" onChange={handleAmendment} className={fileInputClass} />}
                <button type="button" onClick={() => setShowAmend(false)} className="text-sm text-slate-600 hover:underline">
                  Avbryt
                </button>
              </div>
            )}
          </div>

          {canEdit && (
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <p className="text-xs text-slate-500">Laddade ni upp fel fil? Ladda upp rätt fil, så ersätter den den registrerade. Bytet loggas.</p>
              {busy ? <p className="text-sm text-slate-600">Laddar upp…</p> : <input type="file" accept="application/pdf" onChange={handleSigned} className={fileInputClass} />}
            </div>
          )}
        </div>
      )}

      {events.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">Historik</summary>
          <ul className="mt-2 space-y-1">
            {events.map(ev => (
              <li key={ev.id} className="text-xs text-slate-600">
                {new Date(ev.created_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}: {EVENT_LABEL[ev.event_type] ?? ev.event_type} ({ROLE_LABEL[ev.actor_role]})
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
