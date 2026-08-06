import { Link } from 'react-router';
import {
  Plus, Search, Filter, Eye, Users, Edit, Trash2,
  MoreVertical, Copy, TrendingUp, Calendar, BookOpen,
  FileSpreadsheet, FileText
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { useProviderContext } from '../../../contexts/ProviderContext';
import { supabase, Training } from '../../../lib/supabase';
import { usePaginatedQuery, getPaginationRange } from '../../../hooks/usePaginatedQuery';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '../ui/pagination';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const PAGE_SIZE = 12;

export function ProviderCoursesPage() {
  const { profile } = useAuth();
  const { selectedProviderId, isAdmin } = useProviderContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const { rows: courses, page, setPage, totalPages, loading } = usePaginatedQuery<Training>({
    pageSize: PAGE_SIZE,
    deps: [selectedProviderId, refreshKey],
    queryFn: async ({ from, to }) => {
      if (!selectedProviderId) return { data: [], count: 0, error: null };
      return supabase
        .from('trainings')
        .select('*', { count: 'exact' })
        .eq('provider_id', selectedProviderId)
        .order('created_at', { ascending: false })
        .range(from, to);
    },
  });

  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'published' && course.is_active) ||
      (filterStatus === 'draft' && !course.is_active);
    return matchesSearch && matchesStatus;
  });

  async function handleDuplicate(course: Training) {
    const { id, created_at, updated_at, views, leads, ...rest } = course as any;
    const { error } = await supabase.from('trainings').insert({
      ...rest,
      title: `${course.title} (kopia)`,
      is_active: false,
      featured: false,
      views: 0,
      leads: 0,
    });
    if (error) {
      toast.error('Kunde inte duplicera kursen', { description: error.message });
      return;
    }
    toast.success('Kurs duplicerad', { description: 'Kopian sparades som utkast.' });
    setRefreshKey((k) => k + 1);
  }

  async function handleDelete(course: Training) {
    if (!window.confirm(`Ta bort "${course.title}"? Detta går inte att ångra.`)) return;
    const { error } = await supabase.from('trainings').delete().eq('id', course.id);
    if (error) {
      toast.error('Kunde inte ta bort kursen', { description: error.message });
      return;
    }
    toast.success('Kurs borttagen');
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Mina kurser</h1>
          <p className="text-slate-600">Hantera och publicera dina uppdragsutbildningar</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/provider/courses/import-excel"
            className="inline-flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-3 rounded-xl font-medium transition-colors"
          >
            <FileSpreadsheet className="w-5 h-5" />
            Importera från Excel
          </Link>
          <Link
            to="/provider/courses/import-pdf"
            className="inline-flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-3 rounded-xl font-medium transition-colors"
          >
            <FileText className="w-5 h-5" />
            Importera från PDF
          </Link>
          <Link
            to="/provider/courses/new"
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-medium transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Skapa ny kurs
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Sök kurser..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Alla kurser</option>
              <option value="published">Publicerade</option>
              <option value="draft">Utkast</option>
            </select>
          </div>
        </div>
      </div>

      {/* Courses list */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {searchTerm ? 'Inga kurser hittades' : 'Inga kurser ännu'}
            </h3>
            <p className="text-slate-600 mb-6">
              {searchTerm ? 'Prova att söka efter något annat.' : 'Skapa din första kurs för att komma igång.'}
            </p>
            {!searchTerm && (
              <Link
                to="/provider/courses/new"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
              >
                <Plus className="w-5 h-5" />
                Skapa kurs
              </Link>
            )}
          </div>
        ) : (
          filteredCourses.map((course) => (
            <div
              key={course.id}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="grid md:grid-cols-12 gap-6 p-6">
                {/* Course image */}
                <div className="md:col-span-3">
                  <div
                    className="w-full aspect-video rounded-lg bg-slate-100 bg-cover bg-center"
                    style={{ backgroundImage: `url(${course.image_url})` }}
                  />
                </div>

                {/* Course info */}
                <div className="md:col-span-6 space-y-3">
                  <div>
                    <div className="flex items-start gap-2 mb-2">
                      <h3 className="text-lg font-bold text-slate-900">{course.title}</h3>
                      {course.is_popular && (
                        <span className="px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-full border border-amber-200 font-medium">
                          Populär
                        </span>
                      )}
                      {!course.is_active && (
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                          Utkast
                        </span>
                      )}
                    </div>
                    {course.course_code && (
                      <div className="text-xs text-slate-500 font-mono mb-2">{course.course_code}</div>
                    )}
                    <p className="text-sm text-slate-600 line-clamp-2">{course.description}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-full">
                      {course.duration}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-full">
                      {course.credits} hp
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-full">
                      {course.format === 'online' ? 'Online' : course.format === 'onsite' ? 'På plats' : 'Hybrid'}
                    </span>
                    {course.training_type === 'both' ? (
                      <>
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-50 text-violet-700 rounded-full">
                          Skräddarsydd
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full">
                          Schemalagd
                        </span>
                      </>
                    ) : course.training_type === 'custom' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-50 text-violet-700 rounded-full">
                        Skräddarsydd
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full">
                        Schemalagd
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Eye className="w-4 h-4" />
                      <span>{course.views} visningar</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Users className="w-4 h-4" />
                      <span>{course.leads} förfrågningar</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="md:col-span-3 flex md:flex-col gap-2">
                  <Link
                    to={`/provider/courses/${course.id}/edit`}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Redigera
                  </Link>
                  <Link
                    to={`/training/${course.id}`}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Förhandsgranska
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="md:hidden p-2 text-slate-400 hover:text-slate-600 transition-colors">
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleDuplicate(course)}>
                        <Copy className="w-4 h-4" />
                        Duplicera
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(course)} className="text-red-600">
                        <Trash2 className="w-4 h-4" />
                        Ta bort
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1); }}
                className={page === 1 ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
            {getPaginationRange(page, totalPages).map((p, i) =>
              p === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink
                    href="#"
                    isActive={p === page}
                    onClick={(e) => { e.preventDefault(); setPage(p); }}
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1); }}
                className={page === totalPages ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
