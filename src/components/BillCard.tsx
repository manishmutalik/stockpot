import React from 'react';
import { QrImage } from './QrImage';
import { billBalance, formatMoney, type Bill } from '../utils/billing';

export type OnlineLink = { status: 'loading' } | { status: 'error' } | { status: 'ready'; url: string };

/** Hex colours, not Tailwind classes: html2canvas can't read the oklch() colours Tailwind v4 emits. */
const INK = '#2B313D';
const MUTED = '#5A5A5A';
const LINE = '#E7E5E4';
const FAINT = '#F5F5F4';
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const QR_SIZE = 132;

/**
 * The bill as the customer sees it. It is captured to an image by BillModal
 * (html2canvas), so it is styled with inline hex colours only, like
 * NutritionCard, and its placeholders are drawn without Tailwind colours too.
 */
export const BillCard: React.FC<{ bill: Bill; upiLink: string | null; online: OnlineLink }> = ({ bill, upiLink, online }) => {
  const statement = bill.kind === 'statement';
  const money = (n: number) => formatMoney(n, bill.currency);
  const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const date = new Date(bill.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const th: React.CSSProperties = { padding: '6px 0', fontFamily: MONO, fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', color: MUTED, fontWeight: 600 };
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '2px 0' };
  const box: React.CSSProperties = { width: QR_SIZE, height: QR_SIZE, borderRadius: 6, background: FAINT };

  return (
    <div style={{ background: '#FFFFFF', color: INK, padding: 20, borderRadius: 12, border: `1px solid ${LINE}` }}>
      {bill.business.logo && <img src={bill.business.logo} alt="" style={{ height: 40, marginBottom: 8 }} />}
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{bill.business.name || 'Your business'}</h3>
      <p style={{ margin: 0, fontSize: 12, color: MUTED }}>{[bill.business.address, bill.business.phone].filter(Boolean).join(' · ')}</p>
      <p style={{ margin: '12px 0 0', fontFamily: MONO, fontSize: 11, color: MUTED }}>
        {statement ? `Statement · ${bill.orderCount} order${bill.orderCount === 1 ? '' : 's'} · as of ${date}` : date}{bill.customerName ? ` · ${bill.customerName}` : ''}
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th style={th}>Item</th>
            <th style={{ ...th, textAlign: 'right' }}>Qty</th>
            <th style={{ ...th, textAlign: 'right' }}>Price</th>
            <th style={{ ...th, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.map((l, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${FAINT}` }}>
              <td style={{ padding: '8px 8px 8px 0' }}>
                {statement && l.date && <span style={{ display: 'block', fontFamily: MONO, fontSize: 10, color: MUTED }}>{shortDate(l.date)}</span>}
                {l.name}
              </td>
              <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: MONO }}>{l.quantity}</td>
              <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: MONO, whiteSpace: 'nowrap' }}>{money(l.unitPrice)}</td>
              <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: MONO, whiteSpace: 'nowrap' }}>{money(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 8, fontSize: 14 }}>
        <div style={row}><span style={{ color: MUTED }}>Items</span><span style={{ fontFamily: MONO }}>{money(bill.itemsTotal)}</span></div>
        {bill.deliveryCharge > 0 && (
          <div style={row}><span style={{ color: MUTED }}>Delivery</span><span style={{ fontFamily: MONO }}>{money(bill.deliveryCharge)}</span></div>
        )}
        {bill.discount > 0 && (
          <div style={row}><span style={{ color: MUTED }}>Discount</span><span style={{ fontFamily: MONO }}>-{money(bill.discount)}</span></div>
        )}
        {bill.gst && (
          <div style={row}>
            <span style={{ color: MUTED }}>GST ({bill.gst.rate}%{bill.gst.mode === 'inclusive' ? ', included' : ''})</span>
            <span style={{ fontFamily: MONO }}>{money(bill.gst.amount)}</span>
          </div>
        )}
        <div style={{ ...row, borderTop: `2px solid ${INK}`, paddingTop: 8, marginTop: 8, fontSize: 16, fontWeight: 700 }}>
          <span>{statement && !bill.advance ? 'Total due' : 'Total'}</span><span style={{ fontFamily: MONO }}>{money(bill.total)}</span>
        </div>
        {bill.advance && (
          <>
            <div style={row}>
              <span style={{ color: MUTED }}>Advance received{bill.advance.date ? ` (${new Date(bill.advance.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})` : ''}</span>
              <span style={{ fontFamily: MONO }}>-{money(bill.advance.amount)}</span>
            </div>
            <div style={{ ...row, borderTop: `2px solid ${INK}`, paddingTop: 8, marginTop: 8, fontSize: 16, fontWeight: 700 }}>
              <span>Balance due</span><span style={{ fontFamily: MONO }}>{money(billBalance(bill))}</span>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20 }}>
        {upiLink && (
          <figure style={{ margin: 0, textAlign: 'center' }}>
            <QrImage value={upiLink} size={QR_SIZE} label="UPI payment QR code" />
            <figcaption style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>Scan to pay (UPI)</figcaption>
          </figure>
        )}
        <figure style={{ margin: 0, textAlign: 'center' }}>
          {online.status === 'ready' && <QrImage value={online.url} size={QR_SIZE} label="QR code to view this bill online" />}
          {online.status === 'loading' && <div style={box} aria-label="Preparing online link" />}
          {online.status === 'error' && (
            <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, boxSizing: 'border-box', fontSize: 11, color: MUTED }}>
              Online link unavailable right now
            </div>
          )}
          <figcaption style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>View bill online</figcaption>
        </figure>
      </div>
    </div>
  );
};
