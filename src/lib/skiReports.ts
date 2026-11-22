// Sparade rapporter från Strategiskt kompetensindex (tabellen ski_reports).
// En rapport sparas som en fullständig, oföränderlig ögonblicksbild kopplad till den inloggade användaren.
// Skrivning sker via RPC:n save_my_report (kräver inloggning); läsning och radering styrs av RLS (bara ägaren).

import { supabase } from './supabase';
import type { CPIResult } from '../app/components/pages/KompetensindexPage';
import type { Analysis } from './kompetensindexReport';

// Version av samtyckestexten som visas vid sparande. Byt när texten ändras.
export const REPORT_CONSENT_VERSION = 'ski-report-v1';
export const REPORT_FORMAT_VERSION = 1;

export const REPORT_CONSENT_TEXT =
  'Jag samtycker till att rapporten, inklusive mina svar, sparas på mitt konto så att jag kan återvända till den. ' +
  'Jag kan när som helst radera rapporten under Mitt konto.';

export interface SkiReportSnapshot {
  version: number;
  result: CPIResult;
  analysis: Analysis;
}

export interface SavedReportRow {
  id: string;
  company_name: string;
  total_score: number;
  created_at: string;
}

// Kontaktuppgifterna ligger redan på kontot och behövs inte i rapporten.
export function buildSnapshot(result: CPIResult, analysis: Analysis): SkiReportSnapshot {
  const { contactName: _n, email: _e, ...answers } = result.answers as any;
  return {
    version: REPORT_FORMAT_VERSION,
    result: { ...result, answers: { ...answers, contactName: '', email: '' } as CPIResult['answers'] },
    analysis,
  };
}

export async function saveReport(clientReportId: string, snapshot: SkiReportSnapshot): Promise<string> {
  const { data, error } = await supabase.rpc('save_my_report', {
    p_client_report_id: clientReportId,
    p_company_name: snapshot.result.answers.companyName || 'Okänt bolag',
    p_total_score: snapshot.result.scores.total,
    p_report: snapshot as unknown as Record<string, unknown>,
    p_consent_version: REPORT_CONSENT_VERSION,
  });
  if (error) throw error;
  return data as string;
}

export async function listMyReports(): Promise<SavedReportRow[]> {
  const { data, error } = await supabase
    .from('ski_reports')
    .select('id, company_name, total_score, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedReportRow[];
}

export async function getMyReport(id: string): Promise<{ row: SavedReportRow; snapshot: SkiReportSnapshot } | null> {
  const { data, error } = await supabase
    .from('ski_reports')
    .select('id, company_name, total_score, created_at, report')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { report, ...row } = data as any;
  return { row: row as SavedReportRow, snapshot: report as SkiReportSnapshot };
}

export async function deleteMyReport(id: string): Promise<void> {
  const { error } = await supabase.from('ski_reports').delete().eq('id', id);
  if (error) throw error;
}

// ── Väntande rapport (om användaren lämnar sidan för att logga in via e-postlänken) ──

const PENDING_KEY = 'ub.pendingSkiReport.v1';
export interface PendingReport { clientReportId: string; snapshot: SkiReportSnapshot }

export function storePendingReport(p: PendingReport): void {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch { /* privat läge: ingen återställning */ }
}
export function loadPendingReport(): PendingReport | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingReport;
    return p && typeof p.clientReportId === 'string' && p.snapshot?.result ? p : null;
  } catch { return null; }
}
export function clearPendingReport(): void {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignoreras */ }
}
