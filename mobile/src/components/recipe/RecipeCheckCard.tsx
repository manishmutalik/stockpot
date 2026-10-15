import React, { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { RecipeSetupView } from '../../../../src/utils/quickApiTypes';
import { perItem } from '../../../../src/utils/kitchenMeasures';
import { squash } from '../../../../src/utils/orderParse';
import {
  BUY_UNIT, asksWhatItIs, batchShare, batchWeight, chooseLineMaterial, chooseUse, keptPartsOf, lineCostPerItem, lineMaterial, questionPrompt, recipeUnit, resolveDraftLine,
  makesShown, makesUnitOf, makesUnitsFor, setMakes, setMakesUnit, usedNewMaterials,
  type DraftLine, type DraftRecipe, type LineChoice, type RecipeDraft,
} from '../../../../src/utils/recipeDraft';
import { ENTRY_UNITS, formatItemQuantity, fromEntry, perUnit as perItemUnit, toEntry } from '../../../../src/utils/itemUnits';
import { fmtAmount, perUnit } from '../../lib/recipeReader';
import { noOutline } from '../../lib/webInput';
import { colors, fonts, radius } from '../../theme';
import { Card } from '../Card';
import { ChoiceSheet, Choices, money, NumberField, PickerButton, type SheetOption } from './fields';

/**
 * One recipe on the phone's check screen, as on the web (src/components/RecipeReaderModal): its name, what one batch makes
 * (or, for a component: mixed into which item, covering how many; or made ahead and kept, with its batch size and what it
 * goes into), whether a sold item is made when ordered, whether it replaces a menu item's
 * recipe, and every ingredient matched to a material and worked out for one item. A line that needs an answer is marked
 * and asks its question in place; nothing is saved until every question is settled.
 */
export type Update = (fn: (d: RecipeDraft) => void) => void;
type Setup = Pick<RecipeSetupView, 'materials' | 'menu'> & { symbol: string };

export function RecipeCheckCard({ draft, recipe, setup, update, issueLines, single }: {
  draft: RecipeDraft; recipe: DraftRecipe; setup: Setup; update: Update; issueLines: Set<string>; single: boolean;
}) {
  const { materials, menu, symbol } = setup;
  const [partSheet, setPartSheet] = useState(false);
  // Remounts the batch size box when its value is set from outside (a new unit, the suggested weight).
  const [makesNonce, setMakesNonce] = useState(0);
  const set = (fn: (r: DraftRecipe) => void) => update(d => { const r = d.recipes.find(x => x.key === recipe.key); if (r) fn(r); });
  const sameName = recipe.name.trim() ? menu.find(m => squash(m.name) === squash(recipe.name)) : undefined;
  const existingId = recipe.target.kind === 'existing' ? recipe.target.menuItemId : sameName?.id;
  const existing = existingId ? menu.find(m => m.id === existingId) : undefined;
  const share = batchShare(recipe);
  const costs = recipe.lines.map(l => lineCostPerItem(draft, recipe, l, materials));
  const incomplete = recipe.lines.some((l, i) => {
    const r = resolveDraftLine(draft, recipe, l, materials);
    return costs[i] === null && r?.status === 'ok' && !r.skipped;
  });
  // Bases made ahead and kept that go into this item, each at what one piece costs.
  const keptParts = recipe.use.kind === 'sell' ? keptPartsOf(draft, recipe, materials) : [];
  const total = costs.reduce((a: number, c) => a + (c ?? 0), 0) + keptParts.reduce((a, k) => a + (k.cost ?? 0) * k.perItem, 0);
  const label = recipe.name.trim() || 'This recipe';
  // What a recipe made ahead and kept is counted in: an existing item's own unit, else the owner's choice (utils/itemUnits).
  const unit = recipeUnit(recipe, menu);
  const weight = recipe.use.kind === 'kept' && unit !== 'pcs' ? batchWeight(draft, recipe, materials) : null;
  const partOptions: SheetOption[] = [
    ...draft.recipes.filter(x => x.key !== recipe.key && x.include && x.use.kind === 'sell').map(x => ({ value: `recipe:${x.key}`, label: x.name || 'Unnamed recipe', hint: 'Read from this page' })),
    ...menu.map(m => ({ value: `menu:${m.id}`, label: m.name, hint: 'On your menu' })),
  ];
  const usedIn = recipe.use.kind === 'part' || recipe.use.kind === 'kept' ? partOptions.find(o => o.value === (recipe.use as { of: string | null }).of) : undefined;
  const partOf = recipe.use.kind === 'part' ? usedIn : undefined;
  // "One batch makes": the number, and the unit beside it (pieces, g, kg, ml, litres), which also says what the item is
  // counted in (utils/itemUnits). Changing the unit keeps the number: 1.5 is 1.5 kg once kg is chosen.
  const makesUnit = makesUnitOf(recipe, menu);
  const makesUnits = makesUnitsFor(recipe, menu);
  const makesField = (
    <View style={{ gap: 6 }}>
      <NumberField key={`${recipe.key}-makes-${makesUnit}-${makesNonce}`} label="One batch makes" value={makesShown(recipe, menu)}
        placeholder={makesUnit === 'pcs' ? 'How many?' : 'How much?'} flagged={!recipe.makes}
        onChange={n => set(r => setMakes(r, n, menu))} />
      {makesUnits.length > 1 && (
        <Choices label="One batch makes, in" value={makesUnit}
          options={ENTRY_UNITS.filter(u => makesUnits.includes(u.value))}
          onChange={v => { set(r => setMakesUnit(r, v, menu)); setMakesNonce(n => n + 1); }} />
      )}
      {recipe.target.kind === 'existing' && recipe.measuredYield && makesUnit === 'pcs' && existing ? (
        <Note tone="amber" text={`${existing.name} is counted in pieces on your menu. To keep it by weight, save this as a new item, or change it on the website's Menu first.`} />
      ) : null}
    </View>
  );
  const targetChoices = existing && (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.grey }}>{existing.name} is on your menu</Text>
      <Choices
        label="On your menu"
        value={recipe.target.kind === 'existing' ? recipe.target.mode : 'new'}
        options={[{ value: 'replace', label: 'Replace its recipe' }, { value: 'add', label: 'Add to its recipe' }, { value: 'new', label: 'Save as new item' }]}
        onChange={v => {
          set(r => {
            r.target = v === 'new' ? { kind: 'new' } : { kind: 'existing', menuItemId: existing.id, mode: v };
            // Kept in the unit of the item on the menu it goes to.
            // An item on the menu keeps its own unit: the batch is typed in it afresh.
            delete r.makesIn;
          });
          setMakesNonce(n => n + 1);
        }}
      />
    </View>
  );

  return (
    <Card style={{ gap: 14, opacity: recipe.include ? 1 : 0.6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TextInput
          value={recipe.name} onChangeText={t => set(r => { r.name = t; })} placeholder="Recipe name" placeholderTextColor={colors.grey} accessibilityLabel="Recipe name" maxLength={80}
          style={[{ flex: 1, fontFamily: fonts.bold, fontSize: 18, color: colors.ink, paddingVertical: 6, borderBottomWidth: 1, borderColor: recipe.include && !recipe.name.trim() && recipe.target.kind === 'new' ? colors.amber : `${colors.outline}99` }, noOutline]}
        />
        {!single && (
          <View style={{ alignItems: 'center' }}>
            <Switch value={recipe.include} onValueChange={v => set(r => { r.include = v; })} accessibilityLabel={`Save ${label}`} trackColor={{ true: colors.primary, false: colors.outline }} thumbColor={colors.white} />
            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.grey }}>{recipe.include ? 'Save' : 'Skip'}</Text>
          </View>
        )}
      </View>
      {recipe.looksCutOff && <Note tone="amber" text="This recipe looks cut off. If it carries on over the page, start again and add both pages." />}
      {recipe.notes ? <Note text={`Note: ${recipe.notes}`} /> : null}

      {recipe.include && (
        <>
          {asksWhatItIs(recipe) && (
            <View style={{ gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: recipe.use.kind === 'undecided' ? `${colors.amber}1A` : colors.inputFill }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>What is {label}?</Text>
              <Choices
                label="What it is for" value={recipe.use.kind === 'undecided' ? null : recipe.use.kind}
                options={[{ value: 'sell', label: 'I sell it' }, { value: 'part', label: 'Mixed into another item' }, { value: 'kept', label: 'Made ahead and kept' }]}
                onChange={v => { set(r => chooseUse(r, v, menu)); setMakesNonce(n => n + 1); }}
              />
              <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>
                {recipe.use.kind === 'kept'
                  ? 'Saved as its own item, not sold (a sponge base, a ganache). The items it goes into take it from its stock.'
                  : recipe.use.kind === 'part'
                    ? 'Its ingredients are added to the other item\'s recipe (frosting, whipped cream made fresh).'
                    : 'A base or filling you keep: "Made ahead and kept". One you make fresh each time: "Mixed into".'}
              </Text>
              {recipe.use.kind === 'part' && (
                <View style={{ gap: 10 }}>
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.grey }}>Part of</Text>
                    <PickerButton label="Part of" text={partOf?.label ?? 'Choose an item…'} muted={!partOf} flagged={!partOf} onPress={() => setPartSheet(true)} />
                  </View>
                  <NumberField key={`${recipe.key}-covers`} label="One batch covers how many?" value={recipe.use.covers} placeholder="e.g. 2" flagged={!recipe.use.covers}
                    onChange={n => set(r => { if (r.use.kind === 'part') r.use.covers = n; })} />
                </View>
              )}
              {recipe.use.kind === 'kept' && (
                <View style={{ gap: 10 }}>
                  {makesField}
                  {recipe.makesAsWritten ? <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey }}>Written: “{recipe.makesAsWritten}”</Text> : null}
                  {weight !== null && Math.abs((recipe.makes ?? 0) - weight) > 0.0005 && (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Use ${formatItemQuantity(unit, weight)}`} onPress={() => { set(r => { r.makes = weight; delete r.makesIn; }); setMakesNonce(n => n + 1); }}>
                      <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>
                        The ingredients add up to {formatItemQuantity(unit, weight)} (less if some cooks off). <Text style={{ fontFamily: fonts.semibold, color: colors.primary }}>Use {formatItemQuantity(unit, weight)}</Text>
                      </Text>
                    </Pressable>
                  )}
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.grey }}>Used in (optional)</Text>
                    <PickerButton label="Used in" text={usedIn?.label ?? 'Not yet: just save it'} muted={!usedIn} onPress={() => setPartSheet(true)} />
                  </View>
                  {usedIn && unit === 'pcs' && (
                    <NumberField key={`${recipe.key}-per-${makesNonce}`} label="How many go into one?" value={recipe.use.perItem} placeholder="e.g. 1" flagged={!recipe.use.perItem}
                      onChange={n => set(r => { if (r.use.kind === 'kept') r.use.perItem = n; })} />
                  )}
                  {usedIn && unit !== 'pcs' && (
                    <NumberField key={`${recipe.key}-per-${unit}-${makesNonce}`} label="How much goes into one?" suffix={unit === 'kg' ? 'g' : 'ml'}
                      value={recipe.use.perItem ? toEntry(unit, recipe.use.perItem) : null} placeholder="e.g. 150" flagged={!recipe.use.perItem}
                      onChange={n => set(r => { if (r.use.kind === 'kept') r.use.perItem = n === null ? null : fromEntry(unit, n); })} />
                  )}
                  {targetChoices}
                </View>
              )}
              <ChoiceSheet
                visible={partSheet} title={recipe.use.kind === 'kept' ? `${label} is used in` : `${label} is part of`}
                options={recipe.use.kind === 'kept' ? [{ value: '', label: 'Not yet: just save it' }, ...partOptions] : partOptions}
                selected={usedIn?.value}
                onClose={() => setPartSheet(false)}
                onChoose={v => { set(r => { if (r.use.kind === 'part' || r.use.kind === 'kept') r.use.of = v || null; }); setPartSheet(false); }}
              />
            </View>
          )}

          {recipe.use.kind === 'sell' && (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <View style={{ flexBasis: '100%' }}>{makesField}</View>
                {recipe.target.kind === 'new' && (
                  <NumberField key={`${recipe.key}-price`} label="Selling price (optional)" value={recipe.sellingPrice} suffix={symbol}
                    onChange={n => set(r => { r.sellingPrice = n; })} />
                )}
              </View>
              {recipe.makesAsWritten ? <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey }}>Written: “{recipe.makesAsWritten}”</Text> : null}
              {unit !== 'pcs'
                ? <Note tone="amber" text="Selling by weight is not available yet. Choose pieces and say how many it makes, or choose “Made ahead and kept” above to keep it by weight." />
                : recipe.measuredYield ? <Note text="Written as a weight: say how many pieces it makes (1 for one cake), or choose kg to keep it by weight." /> : null}
              {targetChoices}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>Made when ordered</Text>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey }}>Each sale takes its ingredients (and any base) from stock, with no production run.</Text>
                </View>
                <Switch value={!!recipe.madeToOrder} onValueChange={v => set(r => { r.madeToOrder = v; })} accessibilityLabel="Made when ordered" trackColor={{ true: colors.primary, false: colors.outline }} thumbColor={colors.white} />
              </View>
            </View>
          )}

          <View style={{ gap: 2 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.grey }}>
              {share ? (recipe.use.kind === 'part' ? 'Ingredients, for each item it is part of' : recipe.use.kind === 'kept' ? (unit === 'pcs' ? 'Ingredients, for one piece' : `Ingredients, ${perItemUnit(unit)}`) : 'Ingredients, for one item') : 'Ingredients'}
            </Text>
            {recipe.lines.map((line, i) => (
              <IngredientRow key={line.key} draft={draft} recipe={recipe} line={line} setup={setup} cost={costs[i]} share={share} flagged={issueLines.has(line.key)} update={update} />
            ))}
          </View>
          {keptParts.map(k => (
            <View key={k.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.ink, flex: 1 }}>+ {k.unit === 'pcs' ? fmtAmount(k.perItem) : formatItemQuantity(k.unit, k.perItem)} {k.name} (made ahead)</Text>
              <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: k.cost === null ? colors.amber : colors.ink }}>{k.cost === null ? 'no price yet' : money(symbol, k.cost * k.perItem)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: 1, borderColor: `${colors.outline}66`, paddingTop: 10 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.grey }}>{recipe.use.kind === 'part' ? 'Adds to each item' : recipe.use.kind === 'kept' ? (unit === 'pcs' ? 'Cost of one piece' : `Cost ${perItemUnit(unit)}`) : 'Cost of one item'}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: fonts.mono, fontSize: 16, color: colors.ink }}>{share ? money(symbol, total) : '—'}</Text>
              {incomplete && <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: colors.amber }}>cost incomplete</Text>}
            </View>
          </View>
        </>
      )}
    </Card>
  );
}

function Note({ text, tone }: { text: string; tone?: 'amber' }) {
  return <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: tone === 'amber' ? colors.amber : colors.grey }}>{text}</Text>;
}

const choiceValue = (c: LineChoice) => (c.kind === 'existing' ? `e:${c.id}` : c.kind === 'new' ? `n:${c.key}` : 'skip');

function IngredientRow({ draft, recipe, line, setup, cost, share, flagged, update }: {
  draft: RecipeDraft; recipe: DraftRecipe; line: DraftLine; setup: Setup; cost: number | null; share: number | null; flagged: boolean; update: Update;
}) {
  const { materials, symbol } = setup;
  const [sheet, setSheet] = useState(false);
  const set = (fn: (l: DraftLine, d: RecipeDraft) => void) => update(d => {
    const l = d.recipes.find(x => x.key === recipe.key)?.lines.find(x => x.key === line.key);
    if (l) fn(l, d);
  });
  const res = resolveDraftLine(draft, recipe, line, materials);
  const material = lineMaterial(draft, line, materials);
  const ing = line.ingredient;
  const written = [ing.amountAsWritten, ing.unitAsWritten, ing.nameAsWritten].filter(Boolean).join(' ');
  const ownNew = draft.newMaterials.find(n => squash(n.name) === squash(ing.nameAsWritten));
  const chosenNew = line.choice.kind === 'new' ? draft.newMaterials.find(n => n.key === (line.choice as { key: string }).key) : undefined;
  const pinned: SheetOption[] = [
    ownNew ? { value: `n:${ownNew.key}`, label: `New: ${ownNew.name}`, hint: 'Added to your stock when you save', icon: 'add-circle-outline' }
      : { value: 'n:+', label: `New material: ${ing.nameAsWritten}`, hint: 'Added to your stock when you save', icon: 'add-circle-outline' },
    ...(chosenNew && chosenNew.key !== ownNew?.key ? [{ value: `n:${chosenNew.key}`, label: `New: ${chosenNew.name}`, icon: 'add-circle-outline' as const }] : []),
    { value: 'skip', label: 'Leave out', hint: 'Not counted in the cost', icon: 'remove-circle-outline' },
  ];
  const options: SheetOption[] = [...materials].sort((a, b) => a.name.localeCompare(b.name)).map(m => ({
    value: `e:${m.id}`, label: m.name,
    hint: m.costPerUnit ? `${money(symbol, m.costPerUnit)} per ${perUnit(m.unit)}` : `In ${m.unit}, no price yet`,
  }));
  const choose = (v: string) => {
    setSheet(false);
    set((l, d) => chooseLineMaterial(d, l, v === 'skip' ? { kind: 'skip' } : v.startsWith('e:') ? { kind: 'existing', id: v.slice(2) } : v === 'n:+' ? { kind: 'new_from_line' } : { kind: 'new', key: v.slice(2) }));
  };
  const chosenText = line.choice.kind === 'skip' ? 'Left out' : line.choice.kind === 'new' ? `New: ${chosenNew?.name ?? ing.nameAsWritten}` : material?.name ?? 'Choose a material';

  return (
    <View style={{ paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderColor: `${colors.outline}40`, ...(flagged && { backgroundColor: `${colors.amber}12`, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: radius.md }) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{written}</Text>
          {ing.note ? <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey }}>{ing.note}</Text> : null}
          {ing.unclear && <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: colors.amber }}>HARD TO READ: CHECK IT</Text>}
        </View>
        <View style={{ alignItems: 'flex-end', maxWidth: '45%' }}>
          {line.choice.kind === 'skip' ? <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey }}>Left out</Text>
            : res?.status === 'ok' ? (
              res.skipped ? <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey, textAlign: 'right' }}>{res.basis ?? 'Left out'}</Text> : (
                <>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.ink }}>
                    {share ? `${fmtAmount(perItem(res.batchAmount, share))} ${res.recipeUnit}` : `${fmtAmount(res.batchAmount)} ${res.recipeUnit} a batch`}
                  </Text>
                  {res.basis ? <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.grey, textAlign: 'right' }}>{res.basis}</Text> : null}
                  <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: cost !== null ? colors.grey : colors.amber }}>{cost !== null ? money(symbol, cost) : 'no price yet'}</Text>
                </>
              ))
            : null}
        </View>
      </View>
      <PickerButton label={`Material for ${ing.nameAsWritten}`} text={chosenText} muted={line.choice.kind === 'skip'} flagged={!material && line.choice.kind !== 'skip'} onPress={() => setSheet(true)} />
      {res?.status === 'ask' && (
        <LineQuestion key={`${line.key}:${choiceValue(line.choice)}`} draftLine={line} question={res.question} recipeUnit={res.recipeUnit} materialName={material?.name ?? ing.nameAsWritten}
          onAnswer={patch => set(l => { l.answers = { ...l.answers, ...patch }; })} />
      )}
      <ChoiceSheet visible={sheet} title={`Which material is “${ing.nameAsWritten}”?`} options={options} pinned={pinned} selected={choiceValue(line.choice)} onChoose={choose} onClose={() => setSheet(false)} />
    </View>
  );
}

function LineQuestion({ draftLine, question, recipeUnit, materialName, onAnswer }: {
  draftLine: DraftLine; question: Parameters<typeof questionPrompt>[0]; recipeUnit: string; materialName: string; onAnswer: (patch: DraftLine['answers']) => void;
}) {
  const { prompt, unit, suggestion, answer, canLeaveOut } = questionPrompt(question, draftLine, materialName, recipeUnit);
  const [value, setValue] = useState<number | null>(null);
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: `${colors.amber}1A` }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>{prompt}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <NumberField label="Answer" value={null} onChange={setValue} suffix={unit} placeholder={suggestion ? String(suggestion) : ''} />
        <Pressable accessibilityRole="button" disabled={value === null} onPress={() => value !== null && onAnswer(answer(value))}
          style={{ minHeight: 48, paddingHorizontal: 16, borderRadius: radius.md, justifyContent: 'center', backgroundColor: colors.primary, opacity: value === null ? 0.5 : 1 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.white }}>OK</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {suggestion !== undefined && (
          <Pressable accessibilityRole="button" onPress={() => onAnswer(answer(suggestion))} hitSlop={6}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.primary }}>Use {fmtAmount(suggestion)} {unit} (typical)</Text>
          </Pressable>
        )}
        {canLeaveOut && (
          <Pressable accessibilityRole="button" onPress={() => onAnswer({ skip: true })} hitSlop={6}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.primary }}>Leave out</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** The materials this page adds to stock: their names, units and, if the owner knows it, the price. */
export function NewMaterialsCard({ draft, symbol, update }: { draft: RecipeDraft; symbol: string; update: Update }) {
  const used = usedNewMaterials(draft);
  if (used.length === 0) return null;
  const set = (key: string, fn: (n: RecipeDraft['newMaterials'][number]) => void) => update(d => { const n = d.newMaterials.find(x => x.key === key); if (n) fn(n); });
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialIcons name="add-circle-outline" size={20} color={colors.primary} />
          <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.ink }}>New materials ({used.length})</Text>
        </View>
        <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>
          Added to your stock with no quantity. Add a price if you know it; without one the item shows “cost incomplete” until you buy some.
        </Text>
      </View>
      {used.map(n => (
        <View key={n.key} style={{ gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderColor: `${colors.outline}40` }}>
          <TextInput value={n.name} onChangeText={t => set(n.key, x => { x.name = t; })} accessibilityLabel="New material name" maxLength={80}
            style={[{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, paddingVertical: 6, borderBottomWidth: 1, borderColor: n.name.trim() ? `${colors.outline}99` : colors.amber }, noOutline]} />
          <Choices label={`Unit for ${n.name}`} value={n.unit} options={[{ value: 'g', label: 'Grams' }, { value: 'ml', label: 'ml' }, { value: 'pcs', label: 'Pieces' }]}
            onChange={v => set(n.key, x => { x.unit = v; })} />
          <NumberField key={`${n.key}-price`} label={`Price per ${BUY_UNIT[n.unit]} (optional)`} value={n.pricePerBuyUnit} suffix={symbol}
            onChange={v => set(n.key, x => { x.pricePerBuyUnit = v; })} />
        </View>
      ))}
    </Card>
  );
}
