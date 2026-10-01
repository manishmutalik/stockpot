import React from 'react';
import { PAGE_HEIGHT, PAGE_WIDTH, LAYOUT, type MenuPage } from '../utils/menuShare';
import { formatMoney, usableLogo } from '../utils/billing';
import type { BakerySettings } from '../types';

/**
 * Hex colours, not Tailwind classes: html2canvas can't read the oklch()
 * colours Tailwind v4 emits. Same palette as BillCard, so a bill and a menu
 * look like one branded system.
 */
const INK = '#2B313D';
const MUTED = '#5A5A5A';
const LINE = '#E7E5E4';
const TEAL = '#00797B';
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const LOGO_BOX = 64; // explicit pixel size: html2canvas draws images wrong without one

/**
 * The menu as a stack of A4 pages (794 x 1123 px each), each a self-contained
 * element that pdfExport draws to one PDF page. Items with no description or
 * category simply show a name and price: no empty lines or gaps.
 */
export const MenuCard: React.FC<{
  pages: MenuPage[];
  settings: Pick<BakerySettings, 'name' | 'address' | 'phone' | 'logo'>;
  currency: { symbol: string };
  /** Index of the first page given, when only some pages of the menu are drawn (the preview draws one at a time). */
  firstIndex?: number;
  /** Total pages in the whole menu; defaults to the number given. */
  total?: number;
}> = ({ pages, settings, currency, firstIndex = 0, total = pages.length }) => {
  const logo = usableLogo(settings.logo);
  const contact = [settings.address, settings.phone].filter(Boolean).join(' · ');

  return (
    <>
      {pages.map((page, i) => {
        const pageIndex = firstIndex + i;
        const first = pageIndex === 0;
        return (
          <div
            key={pageIndex}
            data-menu-page={pageIndex}
            style={{
              width: PAGE_WIDTH, height: PAGE_HEIGHT, boxSizing: 'border-box', background: '#FFFFFF', color: INK,
              padding: LAYOUT.padding, position: 'relative', overflow: 'hidden', borderTop: `10px solid ${TEAL}`,
            }}
          >
            {/* Header: full on the first page, a slim one after */}
            {first ? (
              <div style={{ height: LAYOUT.firstHeader, display: 'flex', alignItems: 'center', gap: 20, borderBottom: `2px solid ${INK}`, boxSizing: 'border-box', paddingBottom: 24 }}>
                {logo && <img src={logo} alt="" width={LOGO_BOX} height={LOGO_BOX} style={{ width: LOGO_BOX, height: LOGO_BOX, objectFit: 'contain', display: 'block' }} />}
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: TEAL, fontWeight: 600 }}>Menu</div>
                  <h1 style={{ margin: '4px 0 10px', fontSize: 38, lineHeight: 1.15, fontWeight: 700 }}>{settings.name || 'Our menu'}</h1>
                  {contact && <div style={{ fontSize: 14, color: MUTED }}>{contact}</div>}
                </div>
              </div>
            ) : (
              <div style={{ height: LAYOUT.nextHeader, display: 'flex', alignItems: 'flex-start', borderBottom: `2px solid ${INK}`, boxSizing: 'border-box', paddingBottom: 16 }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{settings.name || 'Our menu'}</span>
                <span style={{ marginLeft: 12, fontFamily: MONO, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: TEAL, fontWeight: 600, paddingTop: 5 }}>Menu</span>
              </div>
            )}

            {page.sections.map((section, sectionIndex) => (
              <section key={sectionIndex}>
                <div style={{ height: LAYOUT.sectionHeading, display: 'flex', alignItems: 'flex-end', paddingBottom: 10, boxSizing: 'border-box' }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEAL, borderBottom: `3px solid ${TEAL}`, paddingBottom: 4 }}>
                    {section.title}{section.continued ? ' (continued)' : ''}
                  </h2>
                </div>
                {section.items.map(item => {
                  const description = (item.description || '').trim();
                  return (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, padding: '9px 0', borderBottom: `1px solid ${LINE}`, boxSizing: 'border-box', minHeight: LAYOUT.itemRow }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 17, fontWeight: 600 }}>{item.name}</div>
                        {description && <div style={{ fontSize: 13, lineHeight: `${LAYOUT.descriptionLine}px`, color: MUTED, marginTop: 2 }}>{description}</div>}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMoney(item.sellingPrice, currency)}</div>
                    </div>
                  );
                })}
              </section>
            ))}

            <div style={{ position: 'absolute', left: LAYOUT.padding, right: LAYOUT.padding, bottom: 28, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED }}>
              <span>Thank you for choosing {settings.name || 'us'}.</span>
              {total > 1 && <span style={{ fontFamily: MONO }}>{pageIndex + 1} / {total}</span>}
            </div>
          </div>
        );
      })}
    </>
  );
};
