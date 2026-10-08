/**
 * billHtml.ts
 *
 * The public, read-only bill page: one self-contained HTML document (inline
 * CSS, no scripts, no external requests) rendered from a stored Bill. Every
 * value is HTML-escaped, since business and customer names are free text.
 */
import { billBalance, buildBillUpiLink, formatMoney, type Bill } from '../src/utils/billing';

export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const PAGE_STYLE = `
  *{box-sizing:border-box}body{margin:0;background:#eaf4f3;color:#2b313d;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  main{max-width:520px;margin:0 auto;padding:24px 16px}
  .card{background:#fff;border-radius:16px;padding:24px;box-shadow:0 8px 24px rgba(0,121,123,.1)}
  h1{margin:0 0 4px;font-size:22px}.muted{color:#5a5a5a;font-size:14px}.logo{height:48px;margin-bottom:12px}
  table{width:100%;border-collapse:collapse;margin:20px 0 8px}th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#5a5a5a;text-align:left;padding:6px 0;border-bottom:1px solid #e2e8f0}
  td{padding:10px 0;border-bottom:1px solid #f1f5f9;vertical-align:top}.num{text-align:right;white-space:nowrap}
  .row{display:flex;justify-content:space-between;padding:4px 0}.total{font-size:20px;font-weight:700;border-top:2px solid #2b313d;margin-top:8px;padding-top:12px}
  .pay{display:block;margin-top:20px;text-align:center;background:#00797b;color:#fff;text-decoration:none;font-weight:600;padding:14px;border-radius:12px}
  footer{text-align:center;color:#5a5a5a;font-size:12px;margin-top:16px}
  @media print{body{background:#fff}.card{box-shadow:none}.pay{display:none}}
`;

export function renderBillHtml(bill: Bill): string {
  const money = (n: number) => escapeHtml(formatMoney(n, bill.currency));
  const date = new Date(bill.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const statement = bill.kind === 'statement';
  const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const rows = bill.lines.map(l => `
        <tr><td>${statement && l.date ? `<span class="muted">${escapeHtml(shortDate(l.date))}</span><br>` : ''}${escapeHtml(l.name)}</td><td class="num">${escapeHtml(l.quantity)}</td><td class="num">${money(l.unitPrice)}</td><td class="num">${money(l.lineTotal)}</td></tr>`).join('');
  const logo = bill.business.logo ? `<img class="logo" src="${escapeHtml(bill.business.logo)}" alt="">` : '';
  // The payment link asks for the balance, never the total, so an advance is not charged twice. Bills saved before advances existed have no balance and use the total.
  const balance = billBalance(bill);
  const upiLink = buildBillUpiLink(bill);
  const upi = upiLink ? `<a class="pay" href="${escapeHtml(upiLink)}">Pay ${money(balance)} with UPI</a>` : '';
  const gstLabel = bill.gst
    ? `GST (${escapeHtml(bill.gst.rate)}%${bill.gst.mode === 'inclusive' ? ', included' : ''})`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${statement ? 'Statement' : 'Bill'} from ${escapeHtml(bill.business.name)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${statement ? 'Statement' : 'Invoice'} from ${escapeHtml(bill.business.name)}">
<meta property="og:description" content="${escapeHtml(balance > 0 ? `${formatMoney(balance, bill.currency)} due. Tap to view the bill and pay.` : 'Paid in full. Tap to view the bill.')}">
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
  <div class="card">
    ${logo}
    <h1>${escapeHtml(bill.business.name)}</h1>
    <div class="muted">${escapeHtml(bill.business.address)}${bill.business.phone ? ` · ${escapeHtml(bill.business.phone)}` : ''}</div>
    <div class="muted" style="margin-top:12px">${statement ? `Statement ${escapeHtml(bill.reference)} · ${escapeHtml(bill.orderCount)} order${bill.orderCount === 1 ? '' : 's'} · as of ${escapeHtml(date)}` : `Bill ${escapeHtml(bill.reference)} · ${escapeHtml(date)}`}${bill.customerName ? ` · ${escapeHtml(bill.customerName)}` : ''}</div>
    <table>
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table>
    <div class="row"><span>Items</span><span>${money(bill.itemsTotal)}</span></div>
    ${bill.deliveryCharge > 0 ? `<div class="row"><span>Delivery</span><span>${money(bill.deliveryCharge)}</span></div>` : ''}
    ${bill.discount > 0 ? `<div class="row"><span>Discount</span><span>-${money(bill.discount)}</span></div>` : ''}
    ${bill.gst ? `<div class="row"><span>${gstLabel}</span><span>${money(bill.gst.amount)}</span></div>` : ''}
    <div class="row total"><span>${statement && !bill.advance ? 'Total due' : 'Total'}</span><span>${money(bill.total)}</span></div>
    ${bill.advance ? `<div class="row"><span>Advance received${bill.advance.date ? ` (${escapeHtml(shortDate(bill.advance.date))})` : ''}</span><span>-${money(bill.advance.amount)}</span></div>
    <div class="row total"><span>Balance due</span><span>${money(balance)}</span></div>` : ''}
    ${upi}
  </div>
  <footer>Thank you for your order.</footer>
</main>
</body>
</html>`;
}

export const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Bill not found</title><style>${PAGE_STYLE}</style></head><body><main><div class="card"><h1>Bill not found</h1><p class="muted">This link is not valid. Please ask the business to send it again.</p></div></main></body></html>`;
