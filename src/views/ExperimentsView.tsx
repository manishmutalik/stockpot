import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Beaker, Calendar, Coins, FlaskConical, Plus, Search, Trash2, Wheat, CalendarDays } from 'lucide-react';
import { AppViewProps } from '../types';
import { MetricCard } from '../components/MetricCard';
import { convertAmount } from '../utils/conversions';
import { experimentCost, summarizeExperiments } from '../utils/rndStats';

const selectCls =
  'h-9 rounded-lg bg-stone-50 border border-transparent px-3 text-xs font-semibold text-ink focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none cursor-pointer';

export const ExperimentsView: React.FC<AppViewProps> = (props) => {
  const {
    materials, experiments, currency, settings, addExperiment, updateExperiment, deleteExperiment,
    addMaterialToExperiment, updateExperimentMaterial, removeMaterialFromExperiment
  } = props;

  const [search, setSearch] = useState('');

  const money = (n: number) =>
    `${currency.symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const today = new Date().toISOString().split('T')[0];
  const summary = useMemo(() => summarizeExperiments(experiments, materials, today), [experiments, materials, today]);

  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () => [...experiments]
      .filter(e => !q || (e.name || '').toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [experiments, q]
  );

  return (
    <motion.div
      key="experiments"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6 pb-20"
    >
      {/* Heading */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
            <span className="truncate">{settings.name || 'My Bakery'}</span>
            <span className="text-stone-300">/</span>
            <span className="text-primary font-semibold whitespace-nowrap">Culinary Test Station</span>
          </div>
          <h2 className="text-2xl md:text-[32px] md:leading-tight font-bold tracking-tight text-ink">R&amp;D &amp; Test Kitchen</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Log daily culinary experiments and track the raw materials and cost of every trial.
          </p>
        </div>
        <button
          onClick={addExperiment}
          className="h-10 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-5 rounded-lg text-sm font-semibold shadow-sm transition-colors"
        >
          <Plus size={18} />
          New R&amp;D Session
        </button>
      </div>

      {/* Headline figures */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="R&D Sessions"
          value={String(summary.sessions)}
          icon={FlaskConical}
          tone="teal"
          footLeft="All time"
          footRight={summary.monthSessions > 0 ? `${summary.monthSessions} this month` : null}
        />
        <MetricCard
          label="Trial Material Cost"
          value={money(summary.totalCost)}
          icon={Coins}
          tone="slate"
          footLeft="Avg per session"
          footRight={summary.sessions > 0 ? money(summary.avgCost) : null}
        />
        <MetricCard
          label="This Month's Burn"
          value={money(summary.monthCost)}
          icon={CalendarDays}
          tone="slate"
          footLeft={`${summary.monthSessions} session${summary.monthSessions === 1 ? '' : 's'} this month`}
        />
        <MetricCard
          label="Materials Tested"
          value={String(summary.distinctMaterials)}
          icon={Wheat}
          tone="slate"
          footLeft="Distinct raw materials"
        />
      </div>

      {experiments.length === 0 ? (
        <div className="surface-card text-center py-16 px-8">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-5">
            <FlaskConical size={30} />
          </div>
          <h3 className="text-xl font-bold text-ink mb-2">No R&amp;D sessions logged</h3>
          <p className="text-muted text-sm mb-6 max-w-md mx-auto">
            Track your R&amp;D and recipe testing costs, ingredient variances and conversion ratios.
          </p>
          <button
            onClick={addExperiment}
            className="inline-flex items-center gap-2 h-10 bg-primary hover:bg-primary-dark text-white px-6 rounded-lg text-sm font-semibold shadow-sm transition-colors"
          >
            <Plus size={18} />
            Log First R&amp;D Session
          </button>
        </div>
      ) : (
        <>
          <div className="surface-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 min-w-0 sm:max-w-sm">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sessions by name or notes"
                aria-label="Search sessions"
                className="w-full h-10 pl-10 pr-3 rounded-lg bg-stone-50 border border-transparent text-sm text-ink placeholder:text-muted focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </div>
            <span className="font-mono text-[11px] text-muted sm:ml-auto">
              {visible.length} of {experiments.length} session{experiments.length === 1 ? '' : 's'}
            </span>
          </div>

          {visible.length === 0 && (
            <div className="surface-card text-center py-14 text-muted">No sessions match this search.</div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {visible.map((exp) => {
              const cost = experimentCost(exp, materials);
              return (
                <div key={exp.id} className="surface-card overflow-hidden">
                  <div className="p-4 sm:p-6 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Beaker size={20} />
                      </div>
                      <div className="min-w-0 flex-1 max-w-xl">
                        <input
                          type="text"
                          aria-label="Session name"
                          value={exp.name}
                          onChange={(e) => updateExperiment(exp.id, 'name', e.target.value)}
                          className="w-full bg-transparent border border-transparent hover:border-stone-200 focus:border-primary focus:bg-white rounded-md px-2 py-0.5 -mx-2 text-xl font-bold text-ink outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="Experiment Name"
                        />
                        <div className="flex flex-wrap items-center gap-2 mt-1 font-mono text-[11px] text-muted">
                          <span className="inline-flex items-center gap-1"><Calendar size={12} className="text-primary" />{exp.date}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                            {money(cost)} material cost
                          </span>
                        </div>
                        <textarea
                          aria-label="Session notes"
                          value={exp.notes || ''}
                          onChange={(e) => updateExperiment(exp.id, 'notes', e.target.value)}
                          className="w-full bg-stone-50 border border-transparent hover:border-stone-200 focus:border-primary focus:bg-white rounded-lg px-3 py-2 mt-3 text-sm text-ink placeholder:text-muted/70 resize-none h-16 outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="Add notes about this experiment..."
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => deleteExperiment(exp.id)}
                      className="text-stone-300 hover:text-coral transition-colors p-2 hover:bg-coral/10 rounded-lg shrink-0"
                      title="Delete session"
                      aria-label="Delete session"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>

                  <div className="px-4 sm:px-6 pb-5 space-y-3">
                    <div className="flex items-center justify-between gap-3 border-t border-stone-100 pt-4">
                      <h4 className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">
                        Materials Used <span className="text-stone-300">· {exp.materials.length}</span>
                      </h4>
                      <select
                        aria-label="Add material"
                        onChange={(e) => {
                          if (e.target.value) {
                            addMaterialToExperiment(exp.id, e.target.value);
                            e.target.value = '';
                          }
                        }}
                        className={selectCls}
                      >
                        <option value="">+ Add Material</option>
                        {materials.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    {exp.materials.length === 0 ? (
                      <div className="text-center py-6 rounded-xl bg-stone-50 text-muted text-xs">No materials added yet.</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {exp.materials.map((req) => {
                          const mat = materials.find(m => m.id === req.materialId);
                          const lineCost = mat ? convertAmount(req.amount, req.unit || 'g', mat.unit) * (mat.costPerUnit || 0) : 0;
                          return (
                            <div key={req.materialId} className="flex items-center gap-3 bg-stone-50 p-3 rounded-xl">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-ink truncate">{mat?.name || 'Unknown'}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <input
                                    type="number"
                                    aria-label={`Amount of ${mat?.name || 'material'}`}
                                    value={req.amount}
                                    onChange={(e) => updateExperimentMaterial(exp.id, req.materialId, parseFloat(e.target.value) || 0)}
                                    className="w-20 bg-white border border-transparent hover:border-stone-200 rounded-lg px-2 py-1 text-sm font-mono font-semibold text-ink text-right outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                  />
                                  <span className="font-mono text-[10px] font-semibold text-muted uppercase">{req.unit}</span>
                                  <span className="font-mono text-[11px] text-muted ml-auto">{money(lineCost)}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => removeMaterialFromExperiment(exp.id, req.materialId)}
                                className="text-stone-300 hover:text-coral transition-colors p-2 hover:bg-coral/10 rounded-lg"
                                title="Remove material"
                                aria-label={`Remove ${mat?.name || 'material'}`}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </motion.div>
  );
};
