import type { Ref } from 'react';
import { ShieldCheck, TriangleAlert, FileText } from 'lucide-react';
import clsx from 'clsx';
import type { CategoryId, Finding, ScanReport } from '../lib/scanner/types';
import type { CategoryInfo } from '../lib/scanner/categories';
import { type Locale, type UiStrings, getUiStrings, getCategories } from '../i18n';

type Tone = 'danger' | 'warning' | 'neutral';

function toneFor(id: CategoryId, info: CategoryInfo): Tone {
  if (id === 'prompt_injection') return 'danger';
  if (info.strongSignal) return 'warning';
  return 'neutral';
}

// Group ordering: prompt_injection first, then strong-signal categories, then
// everything else. Categories with zero findings are dropped.
function orderedGroups(
  findings: Finding[],
  categories: Record<CategoryId, CategoryInfo>,
): { id: CategoryId; items: Finding[] }[] {
  const byCat = new Map<CategoryId, Finding[]>();
  for (const f of findings) {
    const arr = byCat.get(f.category) ?? [];
    arr.push(f);
    byCat.set(f.category, arr);
  }
  const rank = (id: CategoryId): number => {
    if (id === 'prompt_injection') return 0;
    if (categories[id].strongSignal) return 1;
    return 2;
  };
  return [...byCat.entries()]
    .map(([id, items]) => ({ id, items }))
    .sort((a, b) => rank(a.id) - rank(b.id));
}

function RiskBadge({ risk, t }: { risk: CategoryInfo['falsePositiveRisk']; t: UiStrings }) {
  const dot =
    risk === 'low' ? 'bg-success' : risk === 'medium' ? 'bg-warning' : 'bg-muted-foreground';
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span className={clsx('size-1.5 rounded-full', dot)} aria-hidden />
      {t.report.riskLabel[risk]}
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-mono text-sm">{value || '—'}</dd>
    </div>
  );
}

function FindingRow({ finding, t }: { finding: Finding; t: UiStrings }) {
  return (
    <li className="border-t border-border/70 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {finding.page != null && (
          <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            p.{finding.page}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          {finding.text && (
            <blockquote className="break-words border-l-2 border-border pl-3 text-sm leading-relaxed">
              {finding.text}
            </blockquote>
          )}
          {finding.detail && (
            <p className="break-words font-mono text-xs text-muted-foreground">{finding.detail}</p>
          )}
          {!finding.text && !finding.detail && (
            <p className="text-sm text-muted-foreground">{t.report.detectedFallback}</p>
          )}
        </div>
      </div>
    </li>
  );
}

const toneAccent: Record<Tone, string> = {
  danger: 'border-l-danger',
  warning: 'border-l-warning',
  neutral: 'border-l-primary',
};

function CategoryGroup({
  id,
  items,
  categories,
  t,
}: {
  id: CategoryId;
  items: Finding[];
  categories: Record<CategoryId, CategoryInfo>;
  t: UiStrings;
}) {
  const info = categories[id];
  const tone = toneFor(id, info);
  return (
    <section
      className={clsx(
        'overflow-hidden rounded-xl border border-border border-l-4 bg-card',
        toneAccent[tone],
      )}
    >
      <header className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="text-base font-semibold">{info.title}</h3>
          {info.strongSignal && (
            <span className="rounded-full bg-danger/10 px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-danger">
              {t.report.strongSignal}
            </span>
          )}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {id}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {items.length} {t.report.finding(items.length)}
            </span>
            <RiskBadge risk={info.falsePositiveRisk} t={t} />
          </span>
        </div>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {info.explanation}
        </p>
      </header>
      <ul className="bg-background/40">
        {items.map((f, i) => (
          <FindingRow key={i} finding={f} t={t} />
        ))}
      </ul>
    </section>
  );
}

export default function ReportView({
  report,
  headingRef,
  locale = 'en',
}: {
  report: ScanReport;
  headingRef?: Ref<HTMLHeadingElement>;
  locale?: Locale;
}) {
  const t = getUiStrings(locale);
  const categories = getCategories(locale);
  const clean = report.counts.total === 0;
  const groups = orderedGroups(report.findings, categories);

  return (
    <div className="space-y-8">
      {/* Verdict banner */}
      {clean ? (
        <div className="rounded-xl border border-success/40 bg-success/10 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-6 shrink-0 text-success" aria-hidden />
            <div className="space-y-2">
              <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
                {t.report.cleanTitle}
              </h2>
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {t.report.cleanBody}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-6 shrink-0 text-danger" aria-hidden />
            <div className="space-y-1">
              <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
                {t.report.dirtyTitle(report.counts.total, groups.length)}
              </h2>
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {t.report.dirtyBody}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Findings */}
      {groups.length > 0 && (
        <div className="space-y-4">
          {groups.map((g) => (
            <CategoryGroup key={g.id} id={g.id} items={g.items} categories={categories} t={t} />
          ))}
        </div>
      )}

      {/* Document metadata */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-1 flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t.report.document.heading}
          </h3>
        </div>
        <dl className="divide-y divide-border/70">
          <MetaRow label={t.report.document.fileName} value={report.fileName} />
          <MetaRow label={t.report.document.pages} value={String(report.pages)} />
          <MetaRow label={t.report.document.producer} value={report.producer} />
          <MetaRow label={t.report.document.creator} value={report.creator} />
        </dl>
      </section>
    </div>
  );
}
