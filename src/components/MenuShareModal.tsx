import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Download, Send, Utensils } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { MenuCard } from './MenuCard';
import { elementsToPdf } from '../utils/pdfExport';
import { saveFile, shareFileViaSystem } from '../utils/shareFile';
import { buildWhatsAppUrl, normalizeWhatsAppNumber } from '../utils/billing';
import { PAGE_HEIGHT, PAGE_WIDTH, buildMenuMessage, groupMenu, menuFileName, paginateMenu } from '../utils/menuShare';
import type { BakerySettings, MenuItem } from '../types';

/**
 * Shares the current menu with a customer as a PDF: a preview of the pages,
 * Download, and Send via WhatsApp. It works exactly like the bill: on phones
 * the share sheet opens with the PDF attached; on desktop the PDF is saved and
 * a wa.me link opens with a pre-filled message to attach it to. The PDF is
 * drawn from the live `menu` each time, so it is never out of date.
 */
export const MenuShareModal: React.FC<{
  menu: MenuItem[];
  settings: BakerySettings;
  currency: { code: string; symbol: string };
  customerName?: string;
  customerPhone?: string;
  onClose: () => void;
}> = ({ menu, settings, currency, customerName, customerPhone, onClose }) => {
  const captureRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const pages = useMemo(() => paginateMenu(groupMenu(menu)), [menu]);
  const itemCount = pages.reduce((n, p) => n + p.sections.reduce((m, s) => m + s.items.length, 0), 0);
  const whatsappReady = normalizeWhatsAppNumber(customerPhone) !== null;
  const fileName = menuFileName(settings.name);

  // Scale the preview to the width the modal gives it.
  useLayoutEffect(() => {
    const measure = () => setPreviewWidth(previewRef.current?.clientWidth || 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const scale = previewWidth > 0 ? Math.min(1, previewWidth / PAGE_WIDTH) : 0.55;

  const makePdf = async (): Promise<File | null> => {
    const pageElements = [...(captureRef.current?.querySelectorAll<HTMLElement>('[data-menu-page]') ?? [])];
    return elementsToPdf(pageElements, fileName);
  };

  const handleDownload = async () => {
    setBusy(true);
    setNotice('');
    const file = await makePdf();
    if (file) saveFile(file); else setNotice("Couldn't create the menu PDF. Please try again.");
    setBusy(false);
  };

  const handleWhatsApp = async () => {
    const message = buildMenuMessage(customerName, settings.name);
    const waUrl = buildWhatsAppUrl(customerPhone, message);
    if (!waUrl) return;
    setBusy(true);
    setNotice('');
    const file = await makePdf();
    // Phones: the share sheet with the PDF attached; WhatsApp is one tap away.
    const shared = file ? await shareFileViaSystem(file, message) : 'unsupported';
    setBusy(false);
    if (shared !== 'unsupported') return; // shared, or the owner closed the share sheet
    // Desktop and other browsers: save the PDF, then open WhatsApp with the message.
    if (file) {
      saveFile(file);
      setNotice('Menu PDF saved. Attach it in WhatsApp, then tap Send.');
    } else {
      setNotice("Couldn't create the menu PDF, so WhatsApp opened with the message only.");
    }
    window.open(waUrl, '_blank', 'noopener');
  };

  return (
    <ModalShell
      title="Share menu"
      subtitle={customerName ? `For ${customerName}` : 'Menu PDF'}
      icon={Utensils}
      onClose={onClose}
      widthClass="sm:max-w-xl"
      footer={
        <div className="space-y-2">
          {itemCount === 0 && (
            <p className="text-xs text-muted">Add menu items with a sale price first. Only priced items go on the menu.</p>
          )}
          {itemCount > 0 && !whatsappReady && (
            <p className="text-xs text-muted">
              {customerPhone
                ? "That phone number doesn't look right, so WhatsApp is turned off. Fix it on the order."
                : 'Add a customer phone number on the order to send this menu over WhatsApp.'}
            </p>
          )}
          {notice && <p role="status" className="text-xs text-primary font-semibold">{notice}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={busy || itemCount === 0}
              className="h-12 px-5 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download size={18} /> Download
            </button>
            <button
              type="button"
              onClick={handleWhatsApp}
              disabled={busy || itemCount === 0 || !whatsappReady}
              className="flex-1 h-12 px-5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} /> Send via WhatsApp
            </button>
          </div>
        </div>
      }
    >
      {/* Preview: the real pages, scaled down to fit. */}
      <div ref={previewRef} aria-label="Menu preview" className="space-y-3">
        {itemCount === 0 ? (
          <p className="text-sm text-muted text-center py-10">Your menu has no priced items yet.</p>
        ) : (
          pages.map((_, i) => (
            <div key={i} style={{ width: PAGE_WIDTH * scale, height: PAGE_HEIGHT * scale }} className="rounded-lg border border-stone-200 overflow-hidden shadow-sm mx-auto">
              <div style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <MenuCard pages={[pages[i]]} firstIndex={i} total={pages.length} settings={settings} currency={currency} />
              </div>
            </div>
          ))
        )}
        {pages.length > 1 && <p className="text-xs text-muted text-center">{pages.length} pages</p>}
      </div>

      {/* The copy that is drawn into the PDF: full size, off screen (not display:none, since html2canvas needs real layout). */}
      <div ref={captureRef} aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, width: PAGE_WIDTH }}>
        <MenuCard pages={pages} settings={settings} currency={currency} />
      </div>
    </ModalShell>
  );
};
