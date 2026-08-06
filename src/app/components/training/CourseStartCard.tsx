import { useState } from 'react';
import { Calendar, Clock, MapPin, Users, BookOpen, ChevronDown, ExternalLink, Globe } from 'lucide-react';
import { toast } from 'sonner';
import type { AdaptedCourseStart as CourseStart } from '../../../lib/marketplaceAdapters';
import { StatusBadge } from './StatusBadge';
import { SeatIndicator } from './SeatIndicator';
import { DeadlineAlert } from './DeadlineAlert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '../ui/dialog';

interface CourseStartCardProps {
  start: CourseStart;
  onApply?: (startId: string) => void;
}

const formatLabel: Record<string, string> = {
  online: 'Online',
  onsite: 'På plats',
  hybrid: 'Hybrid'
};

export function CourseStartCard({ start, onApply }: CourseStartCardProps) {
  const [expanded, setExpanded] = useState(false);

  const startDate = new Date(start.startDate).toLocaleDateString('sv-SE', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  const deadlineDate = new Date(start.applicationDeadline).toLocaleDateString('sv-SE', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  const handleWatch = () => {
    toast.success('Vi hör av oss!', {
      description: 'Vi meddelar dig om fler platser blir tillgängliga på denna kursstart.',
    });
  };

  const canApply = start.status !== 'full' && start.status !== 'upcoming';

  return (
    <div className={`border rounded-xl overflow-hidden transition-shadow ${
      start.status === 'few_spots' ? 'border-amber-200 shadow-sm' :
      start.status === 'full' ? 'border-slate-200 opacity-75' :
      'border-slate-200 shadow-sm'
    }`}>
      {/* Card header */}
      <div className="bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-slate-900">{startDate}</span>
            </div>
          </div>
          <StatusBadge status={start.status} />
        </div>

        {/* Key info row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-slate-50 rounded-lg px-3 py-2">
            <div className="text-xs text-slate-500 mb-0.5">Kostnad</div>
            <div className="font-semibold text-slate-900 text-sm">
              {start.price.toLocaleString('sv-SE')} kr
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg px-3 py-2">
            <div className="text-xs text-slate-500 mb-0.5">Längd</div>
            <div className="font-semibold text-slate-900 text-sm">{start.duration}</div>
          </div>
          <div className="bg-slate-50 rounded-lg px-3 py-2">
            <div className="text-xs text-slate-500 mb-0.5">Format</div>
            <div className="font-semibold text-slate-900 text-sm">{formatLabel[start.format]}</div>
          </div>
          <div className="bg-slate-50 rounded-lg px-3 py-2">
            <div className="text-xs text-slate-500 mb-0.5">Hp</div>
            <div className="font-semibold text-slate-900 text-sm flex items-center gap-1">
              <BookOpen className="w-3 h-3 text-blue-600" />
              {start.credits} hp
            </div>
          </div>
        </div>

        {/* Seat indicator */}
        <div className="mb-4">
          <SeatIndicator available={start.availableSpots} total={start.maxParticipants} />
        </div>

        {/* Deadline alert */}
        <div className="mb-4">
          <DeadlineAlert deadline={start.applicationDeadline} />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {canApply && (
            <button
              onClick={() => onApply?.(start.id)}
              className="flex-1 min-w-0 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              Anmäl dig
            </button>
          )}
          {start.status === 'full' && (
            <button className="flex-1 min-w-0 flex items-center justify-center gap-2 bg-slate-100 text-slate-500 px-4 py-2.5 rounded-lg font-medium text-sm cursor-not-allowed">
              Fullbokad
            </button>
          )}
          {start.status === 'upcoming' && (
            <button
              onClick={handleWatch}
              className="flex-1 min-w-0 flex items-center justify-center gap-2 border border-blue-300 text-blue-600 hover:bg-blue-50 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              Bevaka start
            </button>
          )}
          <Dialog>
            <DialogTrigger asChild>
              <button className="flex items-center gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors">
                <ExternalLink className="w-3.5 h-3.5" />
                Villkor
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Bokningsvillkor</DialogTitle>
                <DialogDescription>Gäller för kursstarten {startDate}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm text-slate-700">
                <p>Anmälan är bindande när den har bekräftats av utbildningsleverantören.</p>
                <p>Avbokning ska ske skriftligt till leverantören senast <strong>{deadlineDate}</strong> (sista ansökningsdag). Vid avbokning efter detta datum kan avgift utgå enligt leverantörens villkor.</p>
                <p>Ombokning till en annan kursstart kan erbjudas i mån av tillgänglig plats.</p>
                <p>Om kursen ställs in på grund av för få deltagare sker full återbetalning.</p>
              </div>
            </DialogContent>
          </Dialog>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-2.5 rounded-lg text-sm transition-colors"
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            Detaljer
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500 mb-0.5">Antagningskrav</dt>
              <dd className="text-slate-900 font-medium">{start.admissionRequirements}</dd>
            </div>
            <div>
              <dt className="text-slate-500 mb-0.5">Språk</dt>
              <dd className="text-slate-900 font-medium flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                {start.language}
              </dd>
            </div>
            {start.location && (
              <div>
                <dt className="text-slate-500 mb-0.5">Ort/Campus</dt>
                <dd className="text-slate-900 font-medium flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {start.location}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-slate-500 mb-0.5">Max antal deltagare</dt>
              <dd className="text-slate-900 font-medium flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                {start.maxParticipants} deltagare
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 mb-0.5">Utbildningslängd</dt>
              <dd className="text-slate-900 font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {start.duration}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
