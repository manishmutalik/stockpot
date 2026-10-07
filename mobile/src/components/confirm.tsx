/**
 * confirm.tsx
 *
 * The four "check this before it is saved" cards, one per kind. They show the draft and the figures the server worked out
 * for it (the same plan the save runs); they never work out money. Editing is by changing the words or answering the
 * questions again, so a figure can never be one the server did not produce.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Currency, OrderDraft, OrderPreview, PaymentDraft, PaymentPreview, ProductionPreview, RestockPreview } from '../../../src/utils/quickApiTypes';
import { formatAmount } from '../../../src/utils/money';
import { formatDay } from '../lib/dates';
import { Card } from './Card';
import { colors, fonts, radius } from '../theme';

const label = { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.grey } as const;
const strong = { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink } as const;
const figure = { fontFamily: fonts.mono, fontSize: 15, color: colors.ink } as const;

function Pill({ text, tone = 'teal' }: { text: string; tone?: 'teal' | 'green' | 'coral' | 'amber' }) {
  const c = { teal: colors.primary, green: colors.green, coral: colors.coral, amber: colors.amber }[tone];
  return (
    <View style={{ backgroundColor: `${c}1F`, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: c }}>{text.toUpperCase()}</Text>
    </View>
  );
}

function Line({ left, right, bold, tone }: { left: string; right: string; bold?: boolean; tone?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <Text style={{ fontFamily: bold ? fonts.semibold : fonts.regular, fontSize: 15, color: colors.ink, flexShrink: 1 }}>{left}</Text>
      <Text style={{ ...figure, color: tone ?? colors.ink, fontFamily: fonts.mono }}>{right}</Text>
    </View>
  );
}

export function Notes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <View style={{ gap: 6 }}>
      {notes.map(n => (
        <View key={n} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <MaterialIcons name="info-outline" size={18} color={colors.grey} style={{ marginTop: 1 }} />
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey, flex: 1, lineHeight: 19 }}>{n}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── An order ───────────────────────────────────────────────────────────────

const METHOD: Record<string, string> = { upi: 'UPI', cash: 'Cash', card: 'Card', other: 'Other' };
const day = formatDay;

export function OrderConfirm({ draft, preview, currency }: { draft: OrderDraft; preview: OrderPreview | null | undefined; currency: Currency }) {
  const c = draft.common;
  const paid = c.paymentStatus !== 'unpaid';
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 8 }}>
        <Text style={{ ...strong, fontSize: 18 }}>{c.customerName ?? 'No name given'}</Text>
        <View style={{ flexDirection: 'row' }}>
          {c.preorder ? <Pill text={`Pre-order · ${day(c.date)}${c.dueSlot ? ` · ${c.dueSlot}` : ''}`} /> : <Pill text="From stock" tone="green" />}
        </View>
        {!!c.customerPhone && <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.grey }}>{c.customerPhone}</Text>}
        {!!c.deliveryAddress && <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.ink }}>Deliver to: {c.deliveryAddress}</Text>}
        {!!c.notes && <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.ink }}>Notes: {c.notes}</Text>}
      </Card>

      {preview && (
        <Card style={{ gap: 12 }}>
          {preview.lines.map(l => (
            <View key={l.menuItemId} style={{ gap: 2 }}>
              <Line left={`${l.name} × ${l.quantity}`} right={formatAmount(l.lineTotal, currency)} />
              {l.stockAfter !== null && <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey }}>{l.stockAfter} left in stock after this</Text>}
            </View>
          ))}
          <View style={{ backgroundColor: colors.inputFill, borderRadius: radius.md, padding: 12, gap: 8 }}>
            <Line left="Total" right={preview.label.total} bold />
            {preview.label.advance && <Line left={`Advance${c.advance ? ` (${METHOD[c.advance.method]})` : ''}`} right={`− ${preview.label.advance}`} />}
            {paid && !c.advance
              ? <Line left={`Paid${c.paymentMethod ? ` by ${METHOD[c.paymentMethod]}` : ''}`} right="✓" tone={colors.green} />
              : <Line left="Balance due" right={preview.label.balanceDue} bold tone={preview.balanceDue > 0 ? colors.coral : colors.green} />}
          </View>
        </Card>
      )}
    </View>
  );
}

// ─── Stock bought ───────────────────────────────────────────────────────────

export function RestockConfirm({ preview, currency }: { preview: RestockPreview | null | undefined; currency: Currency }) {
  if (!preview) return null;
  return (
    <View style={{ gap: 12 }}>
      <Text style={label}>DETECTED STOCK ({preview.lines.length})</Text>
      {preview.lines.map((l, i) => {
        const up = (l.costChangePct ?? 0) > 0;
        const flat = l.costChangePct === null || l.costChangePct === 0;
        const first = l.recipesAffected[0];
        return (
          <Card key={`${l.materialId}-${i}`} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={{ ...strong, fontSize: 18 }}>{l.name}</Text>
                <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: colors.grey }}>{l.quantity} {l.unit.toUpperCase()} · stock after {Math.round(l.newStock * 100) / 100} {l.stockUnit}</Text>
              </View>
              <Text style={{ fontFamily: fonts.mono, fontSize: 20, color: colors.ink }}>{l.label.total}</Text>
            </View>
            <View style={{ backgroundColor: flat ? `${colors.green}1A` : up ? `${colors.coral}14` : `${colors.green}1A`, borderRadius: radius.md, padding: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.ink, flexShrink: 1 }}>
                New cost {l.label.newCost}/{l.costUnit}{l.previousCost > 0 ? ` · was ${formatAmount(l.previousCost, currency)}/${l.costUnit}` : ''}
              </Text>
              {l.costChangePct !== null && <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: up ? colors.coral : colors.green }}>{up ? '+' : ''}{l.costChangePct}%</Text>}
            </View>
            {!!first && Math.abs(first.costChange) >= 0.005 && (
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey }}>
                {first.name} costs {formatAmount(Math.abs(first.costChange), currency)} {first.costChange > 0 ? 'more' : 'less'} to make{l.recipesAffected.length > 1 ? ` (and ${l.recipesAffected.length - 1} more affected)` : ''}.
              </Text>
            )}
          </Card>
        );
      })}
    </View>
  );
}

// ─── Something made ─────────────────────────────────────────────────────────

export function ProductionConfirm({ preview, currency, accepted, onAccept }: { preview: ProductionPreview | null | undefined; currency: Currency; accepted: boolean; onAccept: () => void }) {
  if (!preview) return null;
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 12 }}>
        <Text style={label}>MADE ON {day(preview.date).toUpperCase()}</Text>
        {preview.rows.map(r => (
          <View key={r.recipeId} style={{ gap: 2 }}>
            <Line left={`${r.name} × ${r.quantityProduced}`} right={formatAmount(r.costTotal, currency)} />
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey }}>
              {r.quantityYield !== r.quantityProduced ? `${r.quantityYield} sellable · ` : ''}{formatAmount(r.costPerUnit, currency)} each to make · {r.stockAfter} in stock after
            </Text>
          </View>
        ))}
        <View style={{ backgroundColor: colors.inputFill, borderRadius: radius.md, padding: 12 }}>
          <Line left="Ingredients used" right={preview.label.total} bold />
        </View>
      </Card>

      {preview.shortages.length > 0 && (
        <View style={{ backgroundColor: '#FDEEF1', borderRadius: radius.lg, padding: 16, gap: 10, borderWidth: 1, borderColor: `${colors.coral}66` }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.coral }}>Not enough in stock</Text>
          {preview.shortages.map(s => (
            <Text key={s.materialId} style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.ink }}>{s.name}: short by {s.short} {s.unit}</Text>
          ))}
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>Logging this takes the stock below nothing. Check what you bought, or log it anyway.</Text>
          <Pressable
            accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={onAccept} disabled={accepted}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}
          >
            <MaterialIcons name={accepted ? 'check-box' : 'check-box-outline-blank'} size={24} color={accepted ? colors.primary : colors.grey} />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>Produce anyway</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── A payment ──────────────────────────────────────────────────────────────

export function PaymentConfirm({ draft, preview }: { draft: PaymentDraft; preview: PaymentPreview | null | undefined }) {
  if (!preview) return null;
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 6 }}>
        <Text style={{ ...strong, fontSize: 18 }}>{preview.customerName}</Text>
        <View style={{ backgroundColor: colors.inputFill, borderRadius: radius.md, padding: 10 }}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.ink }}>OWED {preview.label.owed}</Text>
        </View>
      </Card>
      <Card style={{ gap: 12, alignItems: 'center' }}>
        <Text style={label}>AMOUNT RECEIVED</Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 36, color: colors.ink }}>{preview.label.amount}</Text>
        {!!draft.method && <Pill text={METHOD[draft.method] ?? draft.method} />}
        <View style={{ alignSelf: 'stretch', backgroundColor: preview.clearsAll ? `${colors.green}1F` : colors.inputFill, borderRadius: radius.md, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: preview.clearsAll ? colors.green : colors.ink, flexShrink: 1 }}>
            {preview.clearsAll ? 'Clears their full balance' : `Pays ${preview.ordersCovered} ${preview.ordersCovered === 1 ? 'order' : 'orders'}`}
          </Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.ink }}>{preview.label.remainingDue} DUE</Text>
        </View>
      </Card>
    </View>
  );
}
