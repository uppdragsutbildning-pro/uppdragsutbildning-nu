import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, FileSignature, Upload } from 'lucide-react';
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

// Avtal för en bokning. Flödet: ta fram utkast (version 1), parterna laddar växelvis upp
// justerade versioner (Word eller PDF), den som laddar upp godkänner sin egen version och
// motparten måste godkänna den senaste. När båda godkänt kan det signerade avtalet (PDF)
// laddas upp, och avtalet är då registrerat i plattformen. Ändringar efteråt görs som tillägg.
// Behörighet och ordning avgörs i databasen (RLS och RPC). Panelen visar bara vad som är möjligt.

export type ContractRole = 'buyer' | 'provider' | 'admin';

type ContractStatus = 'generated' | 'negotiating' | 'agreed' | 'signed';

interface ContractRow {
  id: string;
  variant: ContractVariant;
  buyer_reference: string | null;
  snapshot: ContractContext;
  status: ContractStatus;
  awaiting_party: 'buyer' | 'provider' | 'both' | null;
  awaiting_since: string | null;
  generated_at: string;
  agreed_version_id: string | null;
  signed_file_path: string | null;
  signed_file_name: string | null;
  signed_registered_at: string | null;
  signed_registered_role: ContractRole | null;
}

interface VersionRow {
  id: string;
  version_no: number;
  kind: 'generated' | 'edited';
  file_path: string | null;
  file_name: string | null;
  comment: string | null;
  uploaded_role: ContractRole;
  created_at: string;
}

interface ApprovalRow {
  version_id: string;
  party: 'buyer' | 'provider';
}

interface AmendmentRow {
  id: string;
  seq: number;
  description: string;
  signed_file_path: string;
  registered_role: ContractRole;
  created_at: string;
}

interface EventRow {
  id: string;
  actor_role: ContractRole | 'system';
  event_type: string;
  created_at: string;
}

const PARTY_LABEL = { buyer: 'köparen', provider: 'lärosätet', admin: 'plattformen', system: 'systemet' } as const;
const PARTY_LABEL_CAP = { buyer: 'Köpare', provider: 'Lärosäte' } as const;

const EVENT_LABEL: Record<string, string> = {
  generated: 'Utkast skapat',
  regenerated: 'Utkast skapat på nytt',
  version_uploaded: 'Ny version uppladdad',
  version_approved: 'Version godkänd',
  agreed: 'Avtalet godkänt av båda parter',
  signed_registered: 'Signerat avtal uppladdat',
  signed_replaced: 'Signerad fil ersatt',
  amendment_registered: 'Tillägg registrerat',
  reminder_sent: 'Påminnelse skickad',
};

const MAX_BYTES = 15 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const fmt = (d: string) => new Date(d).toLocaleDateString('sv-SE');
const daysSince = (d: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0);
const errMessage = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message);

async function openStoredFile(path: string) {
  const { data, error } = await supabase.storage.from('contracts').createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    toast.error('Kunde inte öppna filen', { description: error?.message });
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener');
}

function extOf(file: File): string {
  return (file.name.split('.').pop() ?? '').toLowerCase();
}

function validateFile(file: File, allowed: string[]): string | null {
  if (!allowed.includes(extOf(file))) return `Filen ska vara ${allowed.map(e => `.${e}`).join(', ')}.`;
  if (file.size > MAX_BYTES) return 'Filen är för stor. Max 15 MB.';
  return null;
}

export function ContractPanel({ bookingId, role, canEdit }: { bookingId: string; role: ContractRole; canEdit: boolean }) {
  const [contract, setContract] = useState<ContractRow | null | undefined>(undefined);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [amendments, setAmendments] = useState<AmendmentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState<ContractVariant>('general');
  const [reference, setReference] = useState('');
  const [editingDraft, setEditingDraft] = useState(false);
  const [versionComment, setVersionComment] = useState('');
  const [amendDescription, setAmendDescription] = useState('');
  const [showAmend, setShowAmend] = useState(false);

  // Köpare och lärosäte förhandlar och godkänner. Admin ser allt och kan bara registrera signerad fil.
  const isParty = role !== 'admin' && canEdit;
  const myParty: 'buyer' | 'provider' | null = role === 'admin' ? null : role;

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('contracts')
      .select(
        'id, variant, buyer_reference, snapshot, status, awaiting_party, awaiting_since, generated_at, agreed_version_id, signed_file_path, signed_file_name, signed_registered_at, signed_registered_role'
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
    if (!row) return;
    setVariant(row.variant);
    setReference(row.buyer_reference ?? '');
    const [{ data: vs }, { data: am }, { data: ev }] = await Promise.all([
      supabase
        .from('contract_versions')
        .select('id, version_no, kind, file_path, file_name, comment, uploaded_role, created_at')
        .eq('contract_id', row.id)
        .order('version_no', { ascending: false }),
      supabase
        .from('contract_amendments')
        .select('id, seq, description, signed_file_path, registered_role, created_at')
        .eq('contract_id', row.id)
        .order('seq'),
      supabase
        .from('contract_events')
        .select('id, actor_role, event_type, created_at')
        .eq('contract_id', row.id)
        .order('created_at', { ascending: false }),
    ]);
    const versionRows = (vs ?? []) as VersionRow[];
    setVersions(versionRows);
    setAmendments((am ?? []) as AmendmentRow[]);
    setEvents((ev ?? []) as EventRow[]);
    if (versionRows.length > 0) {
      const { data: ap } = await supabase
        .from('contract_version_approvals')
        .select('version_id, party')
        .in('version_id', versionRows.map(v => v.id));
      setApprovals((ap ?? []) as ApprovalRow[]);
    } else {
      setApprovals([]);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const latestEdited = versions.find(v => v.kind === 'edited') ?? null;
  const approvedBy = (versionId: string, party: 'buyer' | 'provider') => approvals.some(a => a.version_id === versionId && a.party === party);
  const myTurn = contract && myParty && (contract.awaiting_party === myParty || contract.awaiting_party === 'both');

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
      toast.success('Avtalsutkast skapat', { description: 'Redigera filen och ladda upp den som ny version här.' });
      setEditingDraft(false);
      await load();
    } catch (e) {
      toast.error('Kunde inte skapa utkastet', { description: errMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  function downloadGenerated(v: VersionRow) {
    if (!contract) return;
    downloadContractWord(
      buildContract(contract.snapshot, {
        variant: contract.variant,
        buyerReference: contract.buyer_reference,
        generatedAt: new Date(v.created_at),
      })
    );
  }

  async function uploadFile(file: File): Promise<string> {
    if (!contract) throw new Error('Avtal saknas');
    const ext = extOf(file);
    const path = `${bookingId}/${contract.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('contracts').upload(path, file, { contentType: MIME_BY_EXT[ext] });
    if (uploadError) throw uploadError;
    return path;
  }

  async function handleNewVersion(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !contract) return;
    const problem = validateFile(file, ['docx', 'doc', 'pdf']);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const path = await uploadFile(file);
      const { data: no, error: rpcError } = await supabase.rpc('upload_contract_version', {
        p_contract_id: contract.id,
        p_file_path: path,
        p_file_name: file.name,
        p_comment: versionComment.trim() || null,
      });
      if (rpcError) throw rpcError;
      toast.success(`Version ${no} uppladdad`, { description: 'Motparten får ett mejl och kan godkänna eller ladda upp en ny version.' });
      setVersionComment('');
      await load();
    } catch (err) {
      toast.error('Kunde inte ladda upp versionen', { description: errMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function approve(v: VersionRow) {
    if (!window.confirm(`Godkänna version ${v.version_no}? Ni godkänner innehållet och att avtalet signeras i den versionen.`)) return;
    setBusy(true);
    try {
      const { data: newStatus, error: rpcError } = await supabase.rpc('approve_contract_version', { p_version_id: v.id });
      if (rpcError) throw rpcError;
      toast.success(newStatus === 'agreed' ? 'Avtalet är godkänt av båda parter' : 'Versionen är godkänd', {
        description: newStatus === 'agreed' ? 'Nästa steg är att signera och ladda upp den signerade PDF-filen.' : undefined,
      });
      await load();
    } catch (err) {
      toast.error('Kunde inte godkänna', { description: errMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleSigned(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !contract) return;
    const problem = validateFile(file, ['pdf']);
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
      toast.error('Kunde inte registrera avtalet', { description: errMessage(err) });
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
    const problem = validateFile(file, ['pdf']);
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
      toast.error('Kunde inte registrera tillägget', { description: errMessage(err) });
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

  let statusBadge: { text: string; className: string } | null = null;
  if (contract === null) statusBadge = { text: 'Inget avtal ännu', className: 'bg-slate-100 text-slate-600' };
  else if (contract?.status === 'generated') statusBadge = { text: 'Utkast skapat', className: 'bg-slate-100 text-slate-700' };
  else if (contract?.status === 'negotiating')
    statusBadge = {
      text: `Förhandling, väntar på ${PARTY_LABEL[contract.awaiting_party === 'both' ? 'buyer' : (contract.awaiting_party ?? 'buyer')]}`,
      className: 'bg-amber-100 text-amber-800',
    };
  else if (contract?.status === 'agreed') statusBadge = { text: 'Godkänt av båda, väntar på signering', className: 'bg-blue-100 text-blue-800' };
  else if (contract?.status === 'signed') statusBadge = { text: 'Signerat avtal registrerat', className: 'bg-green-100 text-green-700' };

  const canUploadVersion = isParty && contract && contract.status !== 'signed';
  const canApprove =
    isParty && contract?.status === 'negotiating' && latestEdited && myParty && !approvedBy(latestEdited.id, myParty);
  const canRegisterSigned =
    canEdit && contract && contract.status !== 'signed' && (contract.status === 'agreed' || role === 'admin');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FileSignature className="w-4 h-4 text-blue-600" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-900">Avtal</p>
        {statusBadge && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.className}`}>{statusBadge.text}</span>}
        {myTurn && contract?.status !== 'signed' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-600 text-white">Er tur</span>
        )}
      </div>

      {contract && contract.status !== 'signed' && contract.awaiting_party && (
        <p className="text-xs text-slate-500">
          {contract.awaiting_party === 'both' ? 'Väntar på signering sedan' : `Väntar på ${PARTY_LABEL[contract.awaiting_party]} sedan`}{' '}
          {contract.awaiting_since ? fmt(contract.awaiting_since) : ''} ({daysSince(contract.awaiting_since)} dagar).
        </p>
      )}

      {error && <p className="text-sm text-red-700">Kunde inte hämta avtalet: {error}</p>}
      {contract === undefined && !error && <p className="text-sm text-slate-500">Laddar…</p>}

      {contract === null && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Plattformen tar fram ett avtalsutkast med uppgifterna från bokningen. Ni redigerar det i Word och laddar upp varje justerad version här. Båda
            parter godkänner den senaste versionen, därefter signerar ni utanför plattformen och laddar upp den signerade PDF-filen.
          </p>
          {isParty ? (
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
            <p className="text-sm text-slate-500">{role === 'admin' ? 'Parterna skapar utkastet.' : 'Du har läsrättighet och kan inte skapa avtal.'}</p>
          )}
        </div>
      )}

      {contract && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-900">Versioner</p>
          <ul className="space-y-2">
            {versions.map(v => {
              const isLatest = v.id === (latestEdited?.id ?? versions[0]?.id);
              return (
                <li key={v.id} className={`rounded-lg border p-3 text-sm ${isLatest ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-slate-900 font-medium">
                        Version {v.version_no}
                        <span className="font-normal text-slate-500">
                          {' '}
                          · {v.kind === 'generated' ? 'Genererat utkast' : 'Justerad version'} · {PARTY_LABEL[v.uploaded_role]} · {fmt(v.created_at)}
                        </span>
                        {isLatest && contract.status !== 'signed' && <span className="ml-2 text-xs text-blue-700">Senaste</span>}
                        {contract.agreed_version_id === v.id && <span className="ml-2 text-xs text-green-700">Godkänd av båda</span>}
                      </p>
                      {v.comment && <p className="text-slate-600 mt-0.5">{v.comment}</p>}
                      {v.kind === 'edited' && (
                        <p className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4">
                          {(['buyer', 'provider'] as const).map(p => (
                            <span key={p} className={`inline-flex items-center gap-1 ${approvedBy(v.id, p) ? 'text-green-700' : 'text-slate-400'}`}>
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              {PARTY_LABEL_CAP[p]} {approvedBy(v.id, p) ? 'har godkänt' : 'har inte godkänt'}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => (v.kind === 'generated' ? downloadGenerated(v) : v.file_path && openStoredFile(v.file_path))}
                      className="shrink-0 inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                      Ladda ner
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {canApprove && latestEdited && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 space-y-2">
          <p className="text-sm text-slate-800">
            Version {latestEdited.version_no} väntar på ert godkännande. Ladda ner och granska den, och godkänn den eller ladda upp en justerad version.
          </p>
          <button
            type="button"
            onClick={() => approve(latestEdited)}
            disabled={busy}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60"
          >
            Godkänn version {latestEdited.version_no}
          </button>
        </div>
      )}

      {contract?.status === 'generated' && isParty && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setEditingDraft(v => !v)}
            className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50"
          >
            Skapa om utkast
          </button>
          {editingDraft && (
            <div className="space-y-4 rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-600">Ett nytt utkast blir en ny version. Det gamla finns kvar i listan.</p>
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
        </div>
      )}

      {canUploadVersion && (
        <div className="border-t border-slate-100 pt-4 space-y-2">
          <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
            <Upload className="w-4 h-4" aria-hidden="true" />
            Ladda upp ny version
          </p>
          <p className="text-xs text-slate-500">
            Word eller PDF, max 15 MB. Använd gärna Words Spåra ändringar så att motparten ser vad som ändrats. Er egen version godkänns automatiskt,
            och motparten får ett mejl. {contract?.status === 'agreed' ? 'Obs: en ny version upphäver det nuvarande godkännandet.' : ''}
          </p>
          <textarea
            rows={2}
            value={versionComment}
            onChange={e => setVersionComment(e.target.value)}
            maxLength={1000}
            placeholder="Kort kommentar om vad som ändrats (valfritt)"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-500 resize-none"
          />
          {busy ? <p className="text-sm text-slate-600">Laddar upp…</p> : <input type="file" accept=".doc,.docx,.pdf" onChange={handleNewVersion} className={fileInputClass} />}
        </div>
      )}

      {canRegisterSigned && (
        <div className="border-t border-slate-100 pt-4 space-y-2">
          <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
            <Upload className="w-4 h-4" aria-hidden="true" />
            Ladda upp signerat avtal
          </p>
          <p className="text-xs text-slate-500">
            PDF, max 15 MB. Avtalet registreras som signerat när filen är uppladdad.
            {contract.status !== 'agreed' ? ' Parterna har inte godkänt en version i plattformen, så detta är ett undantag som bara plattformen kan göra.' : ''}
          </p>
          {busy ? <p className="text-sm text-slate-600">Laddar upp…</p> : <input type="file" accept="application/pdf,.pdf" onChange={handleSigned} className={fileInputClass} />}
        </div>
      )}

      {contract?.status === 'signed' && contract.signed_file_path && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600">
            Registrerat {contract.signed_registered_at ? fmt(contract.signed_registered_at) : ''}
            {contract.signed_registered_role ? ` av ${PARTY_LABEL[contract.signed_registered_role]}` : ''}: {contract.signed_file_name}
          </p>
          <button
            type="button"
            onClick={() => openStoredFile(contract.signed_file_path!)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Öppna signerat avtal
          </button>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-sm font-medium text-slate-900">Ändringar och tillägg</p>
            {amendments.length === 0 && <p className="text-sm text-slate-500">Inga tillägg registrerade.</p>}
            <ul className="space-y-2">
              {amendments.map(a => (
                <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-slate-800">
                    Tillägg {a.seq}: {a.description}
                    <span className="block text-xs text-slate-500">
                      {fmt(a.created_at)}, registrerat av {PARTY_LABEL[a.registered_role]}
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
                {busy ? <p className="text-sm text-slate-600">Laddar upp…</p> : <input type="file" accept="application/pdf,.pdf" onChange={handleAmendment} className={fileInputClass} />}
                <button type="button" onClick={() => setShowAmend(false)} className="text-sm text-slate-600 hover:underline">
                  Avbryt
                </button>
              </div>
            )}
          </div>

          {canEdit && (
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <p className="text-xs text-slate-500">Laddade ni upp fel fil? Ladda upp rätt PDF, så ersätter den den registrerade. Bytet loggas.</p>
              {busy ? <p className="text-sm text-slate-600">Laddar upp…</p> : <input type="file" accept="application/pdf,.pdf" onChange={handleSigned} className={fileInputClass} />}
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
                {new Date(ev.created_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}: {EVENT_LABEL[ev.event_type] ?? ev.event_type} ({PARTY_LABEL[ev.actor_role]})
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
