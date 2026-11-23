import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CalendarCheck, Check, FileText, GraduationCap } from 'lucide-react';
import { ADVISORY_BOOKING_URL, ADVISORY_LABEL } from '../../../../lib/advisory';
import type { MatchedCourse } from '../../../../lib/reportCourseMatching';
import { Card, Section } from './ReportSections';

// Köparens valda yrkesroller och deras kompetenser (SSYK 2012), med markering av vilka som täcks av de utbildningar
// som föreslås i rekommendationerna. Kursernas kompetenstaggar (SSYK och ESCO) visas så att kopplingen syns.

interface Occupation { id: string; label: string; ssykGroupLabel: string | null; skills: { id: string; title: string }[] }

interface Props {
  occupations: Occupation[];
  ssykSkills: { id: string; title: string }[];
  courseMap: Map<number, MatchedCourse[]>;
  coursesLoading: boolean;
  via: string | null;
  showAdvisory: boolean;
  eyebrow: string;
}

const SHOW_FIRST = 16;

const badge = (source: 'ssyk' | 'esco') =>
  source === 'esco' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700';

export function SkillCoverage({ occupations, ssykSkills, courseMap, coursesLoading, via, showAdvisory, eyebrow }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const suffix = via ? `?via=${encodeURIComponent(via)}` : '';

  // Unika föreslagna kurser, och vilka kurser som täcker vilken kompetens.
  const { courses, coveredBy } = useMemo(() => {
    const byId = new Map<string, MatchedCourse>();
    for (const list of courseMap.values()) for (const c of list) if (!byId.has(c.id)) byId.set(c.id, c);
    const cov = new Map<string, string[]>();
    for (const c of byId.values()) for (const sk of c.coveredSkills) cov.set(sk.id, [...(cov.get(sk.id) ?? []), c.title]);
    return { courses: [...byId.values()], coveredBy: cov };
  }, [courseMap]);

  const groups: Occupation[] = occupations.length
    ? occupations
    : [{ id: 'valda', label: 'Valda kompetenser', ssykGroupLabel: null, skills: ssykSkills }];

  const allSkillIds = new Set(ssykSkills.map((s) => s.id));
  const coveredCount = [...allSkillIds].filter((id) => coveredBy.has(id)).length;
  const pct = allSkillIds.size ? Math.round((coveredCount / allSkillIds.size) * 100) : 0;

  return (
    <Section eyebrow={eyebrow} title="Yrkesroller och kompetenser"
      intro="De yrkesroller ni valde och deras kompetenser enligt Arbetsförmedlingens yrkestaxonomi (SSYK 2012). Kompetenser med bock täcks av en utbildning som föreslås nedan.">
      {allSkillIds.size > 0 && (
        <Card className="!py-4">
          <div className="flex items-center justify-between gap-4 mb-2">
            <p className="text-sm font-semibold text-[var(--fg)]">
              {coursesLoading ? 'Kontrollerar utbildningar…' : `${coveredCount} av ${allSkillIds.size} kompetenser täcks av föreslagna utbildningar`}
            </p>
            {!coursesLoading && <span className="text-sm font-bold text-[var(--accent)]">{pct}%</span>}
          </div>
          <div className="h-2 rounded-full bg-[var(--chip-bg)] overflow-hidden">
            <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${coursesLoading ? 0 : pct}%` }} />
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {groups.map((g) => {
          const open = expanded[g.id];
          const shown = open ? g.skills : g.skills.slice(0, SHOW_FIRST);
          return (
            <Card key={g.id} className="!p-5">
              <p className="font-semibold text-[var(--fg)] leading-tight">{g.label}</p>
              {g.ssykGroupLabel && <p className="text-xs text-[var(--fg-muted)] mt-0.5 mb-3">{g.ssykGroupLabel}</p>}
              {!g.ssykGroupLabel && <div className="mb-3" />}
              {g.skills.length === 0 ? (
                <p className="text-sm text-[var(--fg-muted)]">Inga kompetenser hittades för yrket.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {shown.map((sk) => {
                    const by = coveredBy.get(sk.id);
                    return by ? (
                      <span key={sk.id} title={`Täcks av: ${by.join(', ')}`}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white">
                        <Check className="w-3 h-3" aria-hidden="true" />{sk.title}
                      </span>
                    ) : (
                      <span key={sk.id} className="rounded-full bg-[var(--chip-bg)] px-2.5 py-1 text-xs font-medium text-[var(--chip-fg)]">{sk.title}</span>
                    );
                  })}
                </div>
              )}
              {g.skills.length > SHOW_FIRST && (
                <button type="button" onClick={() => setExpanded((e) => ({ ...e, [g.id]: !open }))}
                  className="mt-3 text-xs font-medium text-[var(--accent)] hover:underline">
                  {open ? 'Visa färre' : `Visa alla ${g.skills.length} kompetenser`}
                </button>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="!p-5">
        <h3 className="font-semibold text-[var(--fg)] mb-1">Utbildningar som täcker era kompetenser</h3>
        <p className="text-xs text-[var(--fg-muted)] mb-4">Kursernas kompetenstaggar visas med källa: <span className="font-semibold text-blue-700">SSYK</span> (yrkestaxonomin) eller <span className="font-semibold text-violet-700">ESCO</span> (EU:s kompetenstaxonomi).</p>
        {coursesLoading ? (
          <div className="h-16 rounded-[10px] bg-[var(--chip-bg)] animate-pulse" />
        ) : courses.length > 0 ? (
          <ul className="space-y-3">
            {courses.map((c) => (
              <li key={c.id}>
                <Link to={c.slug ? `/kurs/${c.slug}${suffix}` : `/training/${c.id}${suffix}`}
                  className="group block rounded-[12px] border border-[var(--border)] px-4 py-3 hover:border-[var(--accent)] transition-colors">
                  <span className="flex items-start gap-3">
                    <GraduationCap className="w-4 h-4 mt-0.5 text-[var(--accent)] shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[var(--fg)] group-hover:text-[var(--accent)]">{c.title}</span>
                      {c.providerName && <span className="block text-xs text-[var(--fg-muted)]">{c.providerName}</span>}
                      {c.coveredSkills.length > 0 ? (
                        <span className="mt-1.5 block text-xs text-[var(--fg-muted)]">
                          Täcker {c.coveredSkills.length} av era kompetenser: <span className="text-[var(--fg)]">{c.coveredSkills.slice(0, 4).map((s) => s.title).join(', ')}{c.coveredSkills.length > 4 ? ` och ${c.coveredSkills.length - 4} till` : ''}</span>
                        </span>
                      ) : (
                        <span className="mt-1.5 block text-xs text-[var(--fg-subtle)]">Matchar rekommendationerna, men täcker ingen av yrkeskompetenserna direkt.</span>
                      )}
                      {c.matchedTags.length > 0 && (
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {c.matchedTags.map((t) => (
                            <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--chip-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--chip-fg)]">
                              {t.title}<span className={`rounded-full px-1.5 text-[9px] font-semibold uppercase ${badge(t.source)}`}>{t.source}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <ArrowRight className="w-4 h-4 mt-1 text-[var(--fg-subtle)] group-hover:text-[var(--accent)] shrink-0" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div>
            <p className="text-sm text-[var(--fg-muted)] mb-3">
              Ingen färdig utbildning täcker era kompetenser ännu. Begär en offert så tar vi fram förslag från lärosäten som utgår från era yrkesroller.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to={`/efterfraga${via ? `?via=${encodeURIComponent(via)}` : ''}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-semibold rounded-[10px]">
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />Begär offert
              </Link>
              {showAdvisory && (
                <a href={ADVISORY_BOOKING_URL} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[var(--border)] bg-[var(--bg-raised)] hover:bg-[var(--chip-bg)] text-[var(--fg)] text-[13px] font-semibold rounded-[10px]">
                  <CalendarCheck className="w-3.5 h-3.5" aria-hidden="true" />{ADVISORY_LABEL}
                </a>
              )}
            </div>
          </div>
        )}
      </Card>
    </Section>
  );
}
