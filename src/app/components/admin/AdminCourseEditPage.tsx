import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { TrainingApplicationsPanel } from './TrainingApplicationsPanel';
import { ProviderCourseFormPage } from '../provider/ProviderCourseFormPage';

// Adminens redigering av en kurs. Återanvänder leverantörens kursformulär (som känner av
// /admin-sökvägen), så att kursinformation, kursstarter och publicering hanteras på ett ställe.
export function AdminCourseEditPage() {
  const { id } = useParams();
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link to="/admin?tab=trainings" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Tillbaka till Utbildningar
        </Link>
        <ProviderCourseFormPage />
        {id && <TrainingApplicationsPanel trainingId={id} />}
      </div>
    </div>
  );
}
