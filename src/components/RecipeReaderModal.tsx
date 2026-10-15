import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Camera, CheckCircle2, ImagePlus, Loader2, Type, X } from 'lucide-react';
import { ModalShell, MODAL_LABEL, modalField } from './ModalShell';
import type { MenuItem, RawMaterial } from '../types';
import type { RecipeReader } from '../hooks/useRecipeReader';
import { perItem } from '../utils/kitchenMeasures';
import { squash } from '../utils/orderParse';
import { formatItemQuantity, fromEntry, perUnit, toEntry } from '../utils/itemUnits';
import { RECIPE_MAX_PHOTOS } from '../utils/recipeParse';
import {
  BUY_UNIT, batchShare, batchWeight, buildDraft, chooseLineMaterial, chooseUse, draftIssues, draftToImport, keptPartsOf, lineCostPerItem, lineMaterial,
  questionPrompt, recipeUnit, resolveDraftLine, setKeptUnit, usedNewMaterials,
  type DraftImport, type DraftLine, type DraftRecipe, type RecipeDraft,
} from '../utils/recipeDraft';

/**
 * Read a recipe: the owner adds photos (or types or pastes), the recipe reader reads them (hooks/useRecipeReader),
 * and this check screen shows every recipe found, one card each, with every ingredient matched to a material and
 * worked out for one item. Lines that need an answer are highlighted; nothing is saved until every question is
 * settled and the owner presses Save (utils/recipeDraft, plans/planRecipes). Photos stay beside the cards to compare.
 */
export interface RecipeReaderModalProps {
  reader: RecipeReader;
  materials: RawMaterial[];
  menu: MenuItem[];
  currency: string;
  /** Opened from a menu item: a single recipe read fills that item. */
  forMenuItemId?: string;
  onClose: () => void;
  onSave: (data: DraftImport) => Promise<{ ok: true; count: number } | { ok: false; message: string }>;
}

type Step = 'input' | 'reading' | 'check' | 'saved';
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const num = (v: string): number | null => { const n = Number(v); return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null; };
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const RecipeReaderModal: React.FC<RecipeReaderModalProps> = ({ reader, materials, menu, currency, forMenuItemId, onClose, onSave }) => {
  const [step, setStep] = useState<Step>('input');
  const [mode, setMode] = useState<'photo' | 'text'>('photo');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews]);

  const update = (fn: (d: RecipeDraft) => void) => setDraft(d => { if (!d) return d; const c = clone(d); fn(c); return c; });
  const issues = useMemo(() => (draft ? draftIssues(draft, materials, menu) : []), [draft, materials, menu]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setError(null);
    setFiles(prev => [...prev, ...Array.from(list)].slice(0, RECIPE_MAX_PHOTOS));
  };

  const read = async () => {
    setError(null);
    setStep('reading');
    const outcome = await reader.read(mode === 'text' ? { text } : { photos: files }, materials);
    if (outcome.ok === false) { setError(outcome.message); setStep('input'); return; }
    setDraft(buildDraft(outcome.parsed, { materials, menu, fromPhotos: mode === 'photo', forMenuItemId }));
    setStep('check');
  };

  const save = async () => {
    if (!draft) return;
    const data = draftToImport(draft, materials, menu);
    if (!data) return;
    setSaving(true);
    setError(null);
    const result = await onSave(data);
    setSaving(false);
    if (result.ok === false) { setError(result.message); return; }
    setSavedCount(result.count);
    setStep('saved');
  };

  const canRead = mode === 'text' ? text.trim() !== '' : files.length > 0;
  const included = draft?.recipes.filter(r => r.include).length ?? 0;

  const footer = step === 'input' ? (
    <div className="flex gap-3">
      <button type="button" onClick={onClose} className="flex-1 sm:flex-none sm:w-36 h-12 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors">Cancel</button>
      <button type="button" onClick={read} disabled={!canRead || reader.remaining === 0}
        className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        Read {mode === 'photo' && files.length > 1 ? `${files.length} photos` : 'recipe'}
      </button>
    </div>
  ) : step === 'reading' ? (
    <p className="text-center text-sm text-muted">This can take up to a minute for a full page.</p>
  ) : step === 'check' ? (
    <div className="space-y-3">
      {issues.length > 0 && (
        <p className="text-xs text-amber-700 flex items-start gap-2" role="status">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{issues.length === 1 ? issues[0].message : `${issues.length} things to settle before saving. ${issues[0].message}`}</span>
        </p>
      )}
      {error && <p className="text-xs text-coral" role="alert">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={() => { setStep('input'); setDraft(null); }} className="flex-1 sm:flex-none sm:w-36 h-12 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors">Start again</button>
        <button type="button" onClick={save} disabled={issues.length > 0 || saving}
          className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? 'Saving…' : `Save ${included} recipe${included === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  ) : (
    <button type="button" onClick={onClose} className="w-full h-12 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-semibold transition-colors">Done</button>
  );

  return (
    <ModalShell title="Read a recipe" subtitle={step === 'check' ? 'Check what was read' : 'From a photo or text'} icon={BookOpen} onClose={onClose} footer={footer} widthClass="sm:max-w-4xl">
      {step === 'input' && (
        <div className="space-y-4">
          <div className="inline-flex rounded-xl bg-stone-100 p-1" role="tablist">
            {([['photo', 'Photo', Camera], ['text', 'Type or paste', Type]] as const).map(([m, label, Icon]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); }}
                className={`flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-semibold transition-colors ${mode === m ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          {mode === 'photo' ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">A notebook page, a printed recipe or a screenshot. A page with several recipes is fine. If a recipe runs onto the next page, add that page too (up to {RECIPE_MAX_PHOTOS}).</p>
              <div className="flex flex-wrap gap-3">
                {previews.map((src, i) => (
                  <div key={src} className="relative w-28 h-28 rounded-xl overflow-hidden bg-stone-100">
                    <img src={src} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                    <button type="button" aria-label={`Remove page ${i + 1}`} onClick={() => setFiles(f => f.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 p-1 rounded-full bg-white/90 text-ink"><X size={14} /></button>
                  </div>
                ))}
                {files.length < RECIPE_MAX_PHOTOS && (
                  <label className="w-28 h-28 rounded-xl border-2 border-dashed border-stone-300 hover:border-primary text-muted hover:text-primary flex flex-col items-center justify-center gap-1 cursor-pointer text-xs font-semibold transition-colors">
                    <ImagePlus size={22} />
                    {files.length === 0 ? 'Add photo' : 'Add next page'}
                    <input type="file" accept="image/*" multiple className="sr-only" aria-label="Add recipe photos" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                  </label>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="recipe-text" className={MODAL_LABEL}>Recipe</label>
              <textarea id="recipe-text" rows={10} value={text} onChange={e => setText(e.target.value)} className={modalField()}
                placeholder={'Chocolate cupcakes (makes 12)\n2 cups maida\n1 cup sugar\n100 g butter\n2 eggs'} />
            </div>
          )}
          {reader.remaining !== null && (
            <p className={`text-xs ${reader.remaining === 0 ? 'text-coral' : 'text-muted'}`}>
              {reader.remaining === 0 ? 'You have read all the recipes you can for now. You can read more tomorrow.' : `${reader.remaining} recipe${reader.remaining === 1 ? '' : 's'} left to read today.`}
            </p>
          )}
          {error && <p className="text-sm text-coral" role="alert">{error}</p>}
        </div>
      )}

      {step === 'reading' && (
        <div className="py-16 flex flex-col items-center gap-3 text-muted">
          <Loader2 size={28} className="animate-spin text-primary" />
          <p className="text-sm font-semibold text-ink">Reading {mode === 'photo' ? (files.length > 1 ? 'your pages' : 'your photo') : 'your recipe'}…</p>
        </div>
      )}

      {step === 'check' && draft && (
        <div className="space-y-5">
          {draft.fromPhotos && (
            <div className="flex flex-wrap items-center gap-3">
              {previews.map((src, i) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-lg overflow-hidden bg-stone-100 shrink-0" title={`Open page ${i + 1}`}>
                  <img src={src} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
              <p className="text-xs text-muted flex-1 min-w-[12rem]">Read from your photo. Check each line against it: tap a page to see it full size.</p>
            </div>
          )}
          {draft.moreNotRead && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">This page has more recipes than are read at once. Save these, then take another photo for the rest.</p>
          )}
          {draft.recipes.map(r => (
            <RecipeCard key={r.key} draft={draft} recipe={r} materials={materials} menu={menu} currency={currency} update={update}
              issueLines={new Set(issues.filter(i => i.recipeKey === r.key && i.lineKey).map(i => i.lineKey!))} />
          ))}
          <NewMaterials draft={draft} currency={currency} update={update} />
        </div>
      )}

      {step === 'saved' && (
        <div className="py-12 flex flex-col items-center gap-3 text-center">
          <CheckCircle2 size={36} className="text-margin" />
          <p className="text-lg font-bold text-ink">{savedCount === 1 ? 'Recipe saved' : `${savedCount} recipes saved`}</p>
          <p className="text-sm text-muted max-w-sm">They are on your menu now. Add prices for any new materials when you buy them, so the costs are complete.</p>
        </div>
      )}
    </ModalShell>
  );
};

// ── One recipe ───────────────────────────────────────────────────────────────

const RecipeCard: React.FC<{
  draft: RecipeDraft; recipe: DraftRecipe; materials: RawMaterial[]; menu: MenuItem[]; currency: string;
  update: (fn: (d: RecipeDraft) => void) => void; issueLines: Set<string>;
}> = ({ draft, recipe, materials, menu, currency, update, issueLines }) => {
  const set = (fn: (r: DraftRecipe) => void) => update(d => { const r = d.recipes.find(x => x.key === recipe.key); if (r) fn(r); });
  const sameName = recipe.name.trim() ? menu.find(m => squash(m.name) === squash(recipe.name)) : undefined;
  const existingId = recipe.target.kind === 'existing' ? recipe.target.menuItemId : sameName?.id;
  const existing = existingId ? menu.find(m => m.id === existingId) : undefined;
  const targetValue = recipe.target.kind === 'existing' ? recipe.target.mode : 'new';
  const share = batchShare(recipe);
  const costs = recipe.lines.map(l => lineCostPerItem(draft, recipe, l, materials));
  // A line worked out but with no price (a new material without one) leaves the cost incomplete.
  const incomplete = recipe.lines.some((l, i) => {
    const r = resolveDraftLine(draft, recipe, l, materials);
    return costs[i] === null && r?.status === 'ok' && !r.skipped;
  });
  // Bases made ahead and kept that go into this item, each at what one piece costs.
  const keptParts = recipe.use.kind === 'sell' ? keptPartsOf(draft, recipe, materials) : [];
  const total = costs.reduce((a: number, c) => a + (c ?? 0), 0) + keptParts.reduce((a, k) => a + (k.cost ?? 0) * k.perItem, 0);
  const keptIncomplete = keptParts.some(k => k.cost === null);
  const partOptions = [
    ...draft.recipes.filter(x => x.key !== recipe.key && x.include && x.use.kind === 'sell').map(x => ({ value: `recipe:${x.key}`, label: x.name || 'Unnamed recipe' })),
    ...menu.map(m => ({ value: `menu:${m.id}`, label: m.name })),
  ];
  const label = recipe.name.trim() || 'Recipe';
  // What a recipe made ahead and kept is counted in: an existing item's own unit, else the owner's choice.
  const unit = recipeUnit(recipe, menu);
  const weight = recipe.use.kind === 'kept' && unit !== 'pcs' ? batchWeight(draft, recipe, materials) : null;

  return (
    <section aria-label={label} className={`rounded-2xl border ${recipe.include ? 'border-stone-200' : 'border-dashed border-stone-200 opacity-60'} p-4 sm:p-5 space-y-4`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={recipe.include} onChange={e => set(r => { r.include = e.target.checked; })} aria-label={`Save ${label}`} className="mt-3 w-5 h-5 accent-[var(--color-primary)]" />
        <div className="flex-1 min-w-0 space-y-2">
          <input value={recipe.name} onChange={e => set(r => { r.name = e.target.value; })} aria-label="Recipe name" placeholder="Recipe name" className={`${modalField(recipe.include && !recipe.name.trim() && recipe.target.kind === 'new')} font-semibold`} />
          {recipe.looksCutOff && <p className="text-xs text-amber-700">This recipe looks cut off. If it continues on the next page, start again and add both pages.</p>}
          {recipe.notes && <p className="text-xs text-muted">Note: {recipe.notes}</p>}
        </div>
      </div>
      {recipe.include && (
        <>
          {(recipe.looksLikeComponent || recipe.use.kind !== 'sell') && (
            <fieldset className={`rounded-xl p-3 space-y-2 ${recipe.use.kind === 'undecided' ? 'bg-amber-50' : 'bg-stone-50'}`}>
              <legend className="sr-only">What it is for</legend>
              <p className="text-sm font-semibold text-ink">What is {label}?</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="radio" checked={recipe.use.kind === 'sell'} onChange={() => set(r => chooseUse(r, 'sell', menu))} /> I sell it</label>
                <label className="flex items-center gap-2"><input type="radio" checked={recipe.use.kind === 'part'} onChange={() => set(r => chooseUse(r, 'part', menu))} /> Mixed into another item each time</label>
                <label className="flex items-center gap-2"><input type="radio" checked={recipe.use.kind === 'kept'} onChange={() => set(r => chooseUse(r, 'kept', menu))} /> Made ahead and kept</label>
              </div>
              <p className="text-xs text-muted">
                {recipe.use.kind === 'kept'
                  ? 'Saved as its own item, not sold on the menu (a sponge base, a ganache). The items it goes into take it from its stock.'
                  : recipe.use.kind === 'part'
                    ? 'Its ingredients are added to the other item\'s recipe (frosting, whipped cream made fresh).'
                    : 'A base or filling you keep: choose "Made ahead and kept". One you make fresh each time: "Mixed into".'}
              </p>
              {recipe.use.kind === 'part' && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={MODAL_LABEL} htmlFor={`${recipe.key}-of`}>Part of</label>
                    <select id={`${recipe.key}-of`} value={recipe.use.of ?? ''} onChange={e => set(r => { if (r.use.kind === 'part') r.use.of = e.target.value || null; })} className={modalField(!recipe.use.of)}>
                      <option value="">Choose an item…</option>
                      {partOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={MODAL_LABEL} htmlFor={`${recipe.key}-covers`}>One batch covers</label>
                    <input id={`${recipe.key}-covers`} inputMode="decimal" value={recipe.use.covers ?? ''} placeholder="e.g. 2"
                      onChange={e => set(r => { if (r.use.kind === 'part') r.use.covers = num(e.target.value); })} className={modalField(!recipe.use.covers)} />
                  </div>
                </div>
              )}
              {recipe.use.kind === 'kept' && (
                <div className="grid sm:grid-cols-3 gap-3">
                  {recipe.target.kind === 'new' && (
                    <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
                      <span className="text-sm text-ink">Counted in</span>
                      <div role="radiogroup" aria-label={`${label} counted in`} className="flex rounded-lg bg-white p-0.5 text-xs border border-stone-200">
                        {([['pcs', 'Pieces'], ['kg', 'kg'], ['l', 'Litres']] as const).map(([u, text]) => (
                          <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => set(r => setKeptUnit(r, u === 'pcs' ? null : u))}
                            className={`px-3 py-1 rounded-md font-semibold ${unit === u ? 'bg-primary text-white' : 'text-muted hover:text-ink'}`}>{text}</button>
                        ))}
                      </div>
                      <span className="text-[11px] text-muted">{unit === 'pcs' ? 'A sponge base, a dough ball.' : 'A ganache, a custard, whipped cream: kept and used by weight.'}</span>
                    </div>
                  )}
                  <div>
                    <label className={MODAL_LABEL} htmlFor={`${recipe.key}-makes`}>One batch makes{unit !== 'pcs' && ` (${unit === 'kg' ? 'kg' : 'litres'})`}</label>
                    <input id={`${recipe.key}-makes`} inputMode="decimal" value={recipe.makes ?? ''} placeholder={unit === 'pcs' ? 'e.g. 4.5' : 'e.g. 0.8'}
                      onChange={e => set(r => { const n = num(e.target.value); r.makes = n && n > 0 ? n : null; })} className={modalField(!recipe.makes)} />
                    {recipe.makesAsWritten && <p className="text-[11px] text-muted mt-1">Written: “{recipe.makesAsWritten}”</p>}
                    {weight !== null && Math.abs((recipe.makes ?? 0) - weight) > 0.0005 && (
                      <p className="text-[11px] text-muted mt-1">
                        The ingredients add up to {formatItemQuantity(unit, weight)}.{' '}
                        <button type="button" onClick={() => set(r => { r.makes = weight; })} className="font-semibold text-primary hover:underline">Use {formatItemQuantity(unit, weight)}</button>
                        {' '}(less if some cooks off)
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={MODAL_LABEL} htmlFor={`${recipe.key}-in`}>Used in (optional)</label>
                    <select id={`${recipe.key}-in`} value={recipe.use.of ?? ''} className={modalField()}
                      onChange={e => set(r => { if (r.use.kind === 'kept') r.use.of = e.target.value || null; })}>
                      <option value="">Not yet: just save it</option>
                      {partOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {recipe.use.of && unit === 'pcs' && (
                    <div>
                      <label className={MODAL_LABEL} htmlFor={`${recipe.key}-per`}>How many go into one</label>
                      <input id={`${recipe.key}-per`} inputMode="decimal" value={recipe.use.perItem ?? ''} placeholder="e.g. 1"
                        onChange={e => set(r => { if (r.use.kind === 'kept') r.use.perItem = num(e.target.value); })} className={modalField(!recipe.use.perItem)} />
                      <p className="text-[11px] text-muted mt-1">0.5 for a half-kg cake on half a base.</p>
                    </div>
                  )}
                  {recipe.use.of && unit !== 'pcs' && (
                    <div>
                      <label className={MODAL_LABEL} htmlFor={`${recipe.key}-per`}>How much goes into one ({unit === 'kg' ? 'g' : 'ml'})</label>
                      <input id={`${recipe.key}-per`} inputMode="decimal" value={recipe.use.perItem ? toEntry(unit, recipe.use.perItem) : ''} placeholder="e.g. 150"
                        onChange={e => set(r => { if (r.use.kind === 'kept') { const n = num(e.target.value); r.use.perItem = n && n > 0 ? fromEntry(unit, n) : null; } })} className={modalField(!recipe.use.perItem)} />
                    </div>
                  )}
                  {existing && (
                    <div className="sm:col-span-3">
                      <label className={MODAL_LABEL} htmlFor={`${recipe.key}-target`}>On your menu</label>
                      <select id={`${recipe.key}-target`} value={targetValue} className={modalField()}
                        onChange={e => set(r => {
                          r.target = e.target.value === 'new' ? { kind: 'new' } : { kind: 'existing', menuItemId: existing.id, mode: e.target.value as 'replace' | 'add' };
                          // Kept in the unit of the item on the menu it goes to.
                          if (r.target.kind === 'existing') setKeptUnit(r, existing.countedIn ?? null);
                        })}>
                        <option value="replace">Use {existing.name}, and replace its recipe</option>
                        <option value="add">Use {existing.name}, and add to its recipe</option>
                        <option value="new">Save as a new item</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </fieldset>
          )}
          {recipe.use.kind === 'sell' && (
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className={MODAL_LABEL} htmlFor={`${recipe.key}-makes`}>One batch makes</label>
                <input id={`${recipe.key}-makes`} inputMode="decimal" value={recipe.makes ?? ''} placeholder="How many?"
                  onChange={e => set(r => { const n = num(e.target.value); r.makes = n && n > 0 ? n : null; })} className={modalField(!recipe.makes)} />
                {recipe.makesAsWritten && <p className="text-[11px] text-muted mt-1">Written: “{recipe.makesAsWritten}”</p>}
              </div>
              {existing ? (
                <div className="sm:col-span-2">
                  <label className={MODAL_LABEL} htmlFor={`${recipe.key}-target`}>On your menu</label>
                  <select id={`${recipe.key}-target`} value={targetValue} className={modalField()}
                    onChange={e => set(r => { r.target = e.target.value === 'new' ? { kind: 'new' } : { kind: 'existing', menuItemId: existing.id, mode: e.target.value as 'replace' | 'add' }; })}>
                    <option value="replace">Replace the recipe of {existing.name}</option>
                    <option value="add">Add to the recipe of {existing.name}</option>
                    <option value="new">Save as a new item</option>
                  </select>
                </div>
              ) : null}
              {recipe.target.kind === 'new' && (
                <div>
                  <label className={MODAL_LABEL} htmlFor={`${recipe.key}-price`}>Selling price ({currency}, optional)</label>
                  <input id={`${recipe.key}-price`} inputMode="decimal" value={recipe.sellingPrice ?? ''} onChange={e => set(r => { r.sellingPrice = num(e.target.value); })} className={modalField()} />
                </div>
              )}
              <label className="sm:col-span-3 flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" checked={!!recipe.madeToOrder} onChange={e => set(r => { r.madeToOrder = e.target.checked; })} className="mt-0.5 w-4 h-4 accent-[var(--color-primary)]" />
                <span><span className="font-semibold">Made when ordered</span> <span className="text-muted">— each sale takes its ingredients (and any base) from stock, with no production run.</span></span>
              </label>
            </div>
          )}

          <ul className="divide-y divide-stone-100">
            {recipe.lines.map((line, i) => (
              <IngredientRow key={line.key} draft={draft} recipe={recipe} line={line} materials={materials} currency={currency} cost={costs[i]} share={share}
                flagged={issueLines.has(line.key)} update={update} />
            ))}
          </ul>
          {keptParts.map(k => (
            <div key={k.key} className="flex justify-between items-baseline text-sm">
              <span className="text-ink">+ {k.unit === 'pcs' ? `${fmt(k.perItem)} ${k.name}` : `${formatItemQuantity(k.unit, k.perItem)} ${k.name}`} <span className="text-muted">(made ahead)</span></span>
              <span className="font-mono text-ink">{k.cost === null ? '—' : `${currency}${fmt(k.cost * k.perItem)}`}</span>
            </div>
          ))}
          <div className="flex justify-between items-baseline text-sm pt-1">
            <span className="text-muted">{recipe.use.kind === 'part' ? 'Adds to each item' : recipe.use.kind === 'kept' ? (unit === 'pcs' ? 'One piece costs' : `Cost ${perUnit(unit)}`) : 'One item costs'}</span>
            <span className="font-mono font-semibold text-ink">
              {currency}{fmt(total)}{(incomplete || keptIncomplete) && <span className="ml-2 text-[11px] font-sans font-semibold text-amber-700">cost incomplete</span>}
            </span>
          </div>
        </>
      )}
    </section>
  );
};

// ── One ingredient ───────────────────────────────────────────────────────────

const IngredientRow: React.FC<{
  draft: RecipeDraft; recipe: DraftRecipe; line: DraftLine; materials: RawMaterial[]; currency: string; cost: number | null; share: number | null;
  flagged: boolean; update: (fn: (d: RecipeDraft) => void) => void;
}> = ({ draft, recipe, line, materials, currency, cost, share, flagged, update }) => {
  const set = (fn: (l: DraftLine, d: RecipeDraft) => void) => update(d => {
    const l = d.recipes.find(x => x.key === recipe.key)?.lines.find(x => x.key === line.key);
    if (l) fn(l, d);
  });
  const res = resolveDraftLine(draft, recipe, line, materials);
  const material = lineMaterial(draft, line, materials);
  const ing = line.ingredient;
  const written = [ing.amountAsWritten, ing.unitAsWritten, ing.nameAsWritten].filter(Boolean).join(' ');
  const value = line.choice.kind === 'existing' ? `e:${line.choice.id}` : line.choice.kind === 'new' ? `n:${line.choice.key}` : 'skip';
  const ownNew = draft.newMaterials.find(n => squash(n.name) === squash(ing.nameAsWritten));
  const sorted = [...materials].sort((a, b) => a.name.localeCompare(b.name));

  const choose = (v: string) => set((l, d) => chooseLineMaterial(d, l,
    v === 'skip' ? { kind: 'skip' } : v.startsWith('e:') ? { kind: 'existing', id: v.slice(2) } : v === 'n:+' ? { kind: 'new_from_line' } : { kind: 'new', key: v.slice(2) }));
  const answer = (patch: DraftLine['answers']) => set(l => { l.answers = { ...l.answers, ...patch }; });

  return (
    <li className={`py-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem] sm:items-start ${flagged ? 'bg-amber-50 -mx-2 px-2 rounded-lg' : ''}`}>
      <div className="min-w-0">
        <p className="text-sm text-ink break-words">{written}</p>
        {ing.note && <p className="text-[11px] text-muted">{ing.note}</p>}
        {ing.unclear && <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">Hard to read: check</span>}
      </div>
      <div className="min-w-0 space-y-2">
        <select aria-label={`Material for ${ing.nameAsWritten}`} value={value} onChange={e => choose(e.target.value)} className={`${modalField(!material && line.choice.kind !== 'skip')} !py-2`}>
          {line.choice.kind === 'new' && <option value={value}>New: {draft.newMaterials.find(n => n.key === (line.choice as { key: string }).key)?.name}</option>}
          {line.choice.kind !== 'new' && !ownNew && <option value="n:+">New material: {ing.nameAsWritten}</option>}
          {line.choice.kind !== 'new' && ownNew && <option value={`n:${ownNew.key}`}>New: {ownNew.name}</option>}
          {sorted.map(m => <option key={m.id} value={`e:${m.id}`}>{m.name}</option>)}
          <option value="skip">Leave out</option>
        </select>
        {res?.status === 'ask' && <LineQuestionInput line={line} question={res.question} recipeUnit={res.recipeUnit} materialName={material?.name ?? ing.nameAsWritten} onAnswer={answer} />}
      </div>
      <div className="text-right font-mono text-sm">
        {line.choice.kind === 'skip' ? <span className="text-muted text-xs">Left out</span>
          : res?.status === 'ok' ? (
            res.skipped ? <span className="text-muted text-xs">{res.basis ?? 'Left out'}</span> : (
              <>
                <div className="text-ink">{share ? `${fmt(perItem(res.batchAmount, share))} ${res.recipeUnit}` : `${fmt(res.batchAmount)} ${res.recipeUnit} a batch`}</div>
                {res.basis && <div className="text-[10px] text-muted font-sans">{res.basis}</div>}
                <div className="text-[11px] text-muted">{cost !== null ? `${currency}${fmt(cost)}` : 'no price yet'}</div>
              </>
            ))
          : null}
      </div>
    </li>
  );
};

const LineQuestionInput: React.FC<{
  line: DraftLine; question: Extract<ReturnType<typeof resolveDraftLine>, { status: 'ask' }>['question']; recipeUnit: string; materialName: string;
  onAnswer: (patch: DraftLine['answers']) => void;
}> = ({ line, question, recipeUnit, materialName, onAnswer }) => {
  const [value, setValue] = useState('');
  const id = `${line.key}-answer`;
  const { prompt, unit, suggestion, answer: apply } = questionPrompt(question, line, materialName, recipeUnit);
  const submit = (n: number | null) => { if (n !== null) onAnswer(apply(n)); };
  return (
    <div className="rounded-lg bg-amber-50 p-2 space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-amber-800">{prompt}</label>
      <div className="flex items-center gap-2">
        <input id={id} inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} onBlur={() => submit(num(value))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(num(value)); } }}
          placeholder={suggestion ? String(suggestion) : ''} className="w-24 rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-sm font-mono" />
        <span className="text-xs text-muted">{unit}</span>
        {suggestion !== undefined && (
          <button type="button" onClick={() => onAnswer(apply(suggestion!))} className="text-xs font-semibold text-primary hover:underline">Use {fmt(suggestion)} {unit}</button>
        )}
        {question.kind === 'pinch' && <button type="button" onClick={() => onAnswer({ skip: true })} className="text-xs font-semibold text-primary hover:underline">Leave out</button>}
      </div>
    </div>
  );
};

// ── New materials ────────────────────────────────────────────────────────────

const NewMaterials: React.FC<{ draft: RecipeDraft; currency: string; update: (fn: (d: RecipeDraft) => void) => void }> = ({ draft, currency, update }) => {
  const used = usedNewMaterials(draft);
  if (used.length === 0) return null;
  const set = (key: string, fn: (n: RecipeDraft['newMaterials'][number]) => void) => update(d => { const n = d.newMaterials.find(x => x.key === key); if (n) fn(n); });
  return (
    <section aria-label="New materials" className="rounded-2xl bg-stone-50 p-4 sm:p-5 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-ink">New materials ({used.length})</h3>
        <p className="text-xs text-muted">These will be added to your stock with no quantity. Add a price if you know it; without one the item shows “cost incomplete” until you restock or add it.</p>
      </div>
      {used.map(n => (
        <div key={n.key} className="grid grid-cols-[minmax(0,1fr)_7rem_9rem] gap-2 items-center">
          <input aria-label="New material name" value={n.name} onChange={e => set(n.key, x => { x.name = e.target.value; })} className={`${modalField(!n.name.trim())} !py-2 bg-white`} />
          <select aria-label={`Unit for ${n.name}`} value={n.unit} onChange={e => set(n.key, x => { x.unit = e.target.value as 'g' | 'ml' | 'pcs'; })} className={`${modalField()} !py-2 bg-white`}>
            <option value="g">grams</option><option value="ml">ml</option><option value="pcs">pieces</option>
          </select>
          <input aria-label={`Price for ${n.name}, per ${BUY_UNIT[n.unit]}`} inputMode="decimal" placeholder={`${currency} per ${BUY_UNIT[n.unit]}`}
            value={n.pricePerBuyUnit ?? ''} onChange={e => set(n.key, x => { x.pricePerBuyUnit = num(e.target.value); })} className={`${modalField()} !py-2 bg-white font-mono`} />
        </div>
      ))}
    </section>
  );
};
