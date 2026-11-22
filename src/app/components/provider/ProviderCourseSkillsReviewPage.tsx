import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useProviderContext } from '../../../contexts/ProviderContext';
import { supabase } from '../../../lib/supabaseClient';
import { fetchUntaggedCourses, type CourseSkillTag, type UntaggedCourse } from '../../../lib/courseSkills';
import { CourseSkillsField } from './CourseSkillsField';

// Genomgång av kurser som saknar kompetenstaggar. AI-förslag hämtas när en kurs öppnas, men inget sparas
// förrän leverantören själv har valt taggar och tryckt Spara.

function ReviewRow({ course, onSaved }: { course: UntaggedCourse; onSaved: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<CourseSkillTag[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (skills.length === 0) return;
    setSaving(true);
    const { error } = await supabase.from('trainings').update({ ssyk_skills: skills }).eq('id', course.id);
    setSaving(false);
    if (error) {
      toast.error('Kunde inte spara', { description: error.message });
      return;
    }
    toast.success(`Kompetenser sparade för "${course.title}"`);
    onSaved(course.id);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-slate-50 transition-colors">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{course.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{course.is_active ? 'Publicerad' : 'Utkast'}</p>
        </div>
        <span className="flex items-center gap-2 text-sm text-blue-600 font-medium shrink-0">
          {open ? 'Stäng' : 'Granska'}
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-5 space-y-5">
          <CourseSkillsField
            value={skills}
            onChange={setSkills}
            autoSuggest
            getCourseText={() => ({
              title: course.title,
              description: course.description,
              targetAudience: course.target_audience ?? '',
              learningOutcomes: course.learning_outcomes,
            })}
          />
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <Link to={`/provider/courses/${course.id}/edit`} className="text-sm text-slate-500 hover:text-slate-700">Öppna hela kursen</Link>
            <button type="button" onClick={save} disabled={saving || skills.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Spara kompetenser
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProviderCourseSkillsReviewPage() {
  const { selectedProviderId } = useProviderContext();
  const [courses, setCourses] = useState<UntaggedCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProviderId) return;
    let active = true;
    setCourses(null);
    fetchUntaggedCourses(selectedProviderId)
      .then((c) => active && setCourses(c))
      .catch((e) => active && setError(e?.message ?? 'Kunde inte hämta kurser'));
    return () => { active = false; };
  }, [selectedProviderId]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link to="/provider/courses" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft className="w-4 h-4" />Mina kurser
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Lägg till kompetenser</h1>
        <p className="text-slate-600">
          Kurser med kompetenser kan matchas mot köparnas behov och visas som rekommenderad utbildning i Strategiskt kompetensindex.
          Öppna en kurs för att få förslag, välj de som stämmer och spara.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && courses === null && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />Hämtar kurser…</div>}
      {courses && courses.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-3" />
          <p className="font-semibold text-slate-900">Alla dina kurser har kompetenser</p>
        </div>
      )}
      {courses && courses.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{courses.length} {courses.length === 1 ? 'kurs saknar' : 'kurser saknar'} kompetenser</p>
          {courses.map((c) => (
            <ReviewRow key={c.id} course={c} onSaved={(id) => setCourses((prev) => (prev ?? []).filter((x) => x.id !== id))} />
          ))}
        </div>
      )}
    </div>
  );
}
