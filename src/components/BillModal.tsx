import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Receipt, Send } from 'lucide-react';
import html2canvas from 'html2canvas';
import { ModalShell } from './ModalShell';
import { BillCard, type OnlineLink } from './BillCard';
import { apiFetch } from '../utils/apiClient';
import {
  buildBill, buildBillMessage, buildUpiLink, buildWhatsAppUrl, normalizeWhatsAppNumber
} from '../utils/billing';
import type { BakerySettings, MenuItem, Order } from '../types';

/**
 * A shareable bill for one order (or every item of a multi-item order): the
 * itemised bill, a UPI payment QR (only when the business has a UPI ID and
 * bills in rupees), a "view bill online" QR, and ways to send it: the phone's
 * share sheet with the bill image attached, or WhatsApp's wa.me link with a
 * pre-filled message. Nothing is sent automatically; the owner taps Send in
 * WhatsApp.
 */
export const BillModal: React.FC<{
  orders: Order[];
  menu: MenuItem[];
  settings: BakerySettings;
  currency: { code: string; symbol: string };
  onClose: () => void;
}> = ({ orders, menu, settings, currency, onClose }) => {
  const billRef = useRef<HTMLDivElement>(null);
  const [online, setOnline] = useState<OnlineLink>({ status: 'loading' });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const bill = useMemo(() => buildBill({ orders, menu, settings, currency }), [orders, menu, settings, currency]);
  const customerPhone = orders.find(o => o.customerPhone)?.customerPhone;
  const whatsappReady = normalizeWhatsAppNumber(customerPhone) !== null;
  const orderId = orders[0].id;

  // Ask the server for the bill's public link. It creates the token on the
  // first call and reuses it afterwards, so the same link/QR comes back.
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok || !data.token) throw new Error(data.error || 'Failed');
        if (!cancelled) setOnline({ status: 'ready', url: `${window.location.origin}/bill/${data.token}` });
      })
      .catch(() => { if (!cancelled) setOnline({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [orderId]);

  const onlineUrl = online.status === 'ready' ? online.url : undefined;
  const upiLink = bill.upiId
    ? buildUpiLink({ upiId: bill.upiId, payeeName: bill.business.name, amount: bill.total, reference: bill.reference })
    : null;

  const renderImage = async (): Promise<File | null> => {
    if (!billRef.current) return null;
    try {
      const canvas = await html2canvas(billRef.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      return blob ? new File([blob], `bill-${bill.reference}.png`, { type: 'image/png' }) : null;
    } catch {
      return null;
    }
  };

  const saveFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownload = async () => {
    setBusy(true);
    setNotice('');
    const file = await renderImage();
    if (file) saveFile(file); else setNotice("Couldn't create the bill image. Please try again.");
    setBusy(false);
  };

  const handleWhatsApp = async () => {
    const message = buildBillMessage(bill, onlineUrl);
    const waUrl = buildWhatsAppUrl(customerPhone, message);
    if (!waUrl) return;
    setBusy(true);
    setNotice('');
    const file = await renderImage();
    try {
      // Phones: the share sheet with the bill image attached; WhatsApp is one tap away.
      if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: message });
        return;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // the owner closed the share sheet
    } finally {
      setBusy(false);
    }
    // Desktop and other browsers: save the image, then open WhatsApp with the message.
    if (file) {
      saveFile(file);
      setNotice('Bill image saved. Attach it in WhatsApp, then tap Send.');
    }
    window.open(waUrl, '_blank', 'noopener');
  };

  return (
    <ModalShell
      title="Bill"
      subtitle={`Ref ${bill.reference}`}
      icon={Receipt}
      onClose={onClose}
      widthClass="sm:max-w-lg"
      footer={
        <div className="space-y-2">
          {!whatsappReady && (
            <p className="text-xs text-muted">
              {customerPhone
                ? "That phone number doesn't look right, so WhatsApp is turned off. Fix it on the order."
                : 'Add a customer phone number on the order to send this bill over WhatsApp.'}
            </p>
          )}
          {notice && <p role="status" className="text-xs text-primary font-semibold">{notice}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={busy}
              className="h-12 px-5 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download size={18} /> Download
            </button>
            <button
              type="button"
              onClick={handleWhatsApp}
              disabled={busy || !whatsappReady || online.status === 'loading'}
              className="flex-1 h-12 px-5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} /> Send via WhatsApp
            </button>
          </div>
        </div>
      }
    >
      {/* This block is what gets rendered to the bill image. */}
      <div ref={billRef}>
        <BillCard bill={bill} upiLink={upiLink} online={online} />
      </div>
    </ModalShell>
  );
};
