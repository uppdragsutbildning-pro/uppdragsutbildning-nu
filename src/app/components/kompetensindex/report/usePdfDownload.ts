import { useState } from 'react';
import { toast } from 'sonner';
import { generateSkiPdf, pdfFileName, type PdfInput } from '../../../../lib/skiPdf';

// Skapar PDF-rapporten i webbläsaren och startar nedladdningen. jsPDF laddas först vid första klicket.
export function usePdfDownload(build: () => PdfInput | Promise<PdfInput>) {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const input = await build();
      const blob = await generateSkiPdf(input);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFileName(input.result.answers.companyName, input.createdAt);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e: any) {
      console.error('PDF-fel:', e);
      toast.error('Kunde inte skapa PDF:en', { description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  return { busy, download };
}
