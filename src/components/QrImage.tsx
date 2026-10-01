import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * A QR code for `value`, drawn as an <img> from an SVG data URL. (An image
 * rather than inline SVG so html2canvas, which renders the bill to a picture
 * for WhatsApp, captures it reliably.)
 */
export const QrImage: React.FC<{ value: string; size?: number; label: string }> = ({ value, size = 132, label }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Explicit width/height (4x the display size, so it stays sharp in the 2x image): without them
    // the SVG has only a viewBox and html2canvas draws it at the wrong size.
    QRCode.toString(value, { type: 'svg', width: size * 4, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2B313D', light: '#FFFFFF' } })
      .then(svg => { if (!cancelled) setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`); })
      .catch(() => { if (!cancelled) setSrc(null); });
    return () => { cancelled = true; };
  }, [value, size]);

  return src
    ? <img src={src} alt={label} width={size} height={size} style={{ display: 'block' }} />
    : <div style={{ width: size, height: size, background: '#F5F5F4', borderRadius: 6 }} aria-hidden="true" />;
};
