import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeImageProps {
  value: string;
  height?: number; // height of the bars, in pixels
  barWidth?: number; // width of the thinnest bar, in pixels
  fontSize?: number; // size of the number printed under the bars
}

// Draws a product's barcode as real, scannable bars with the number under it,
// so it can be read on screen or printed as a label. The drawing is done by
// the jsbarcode library.
//
// Barcodes the store generates are 13-digit EAN-13 (the kind on supermarket
// packaging). Older ones typed in by hand (e.g. "10001") aren't valid EAN-13,
// so those are drawn as Code 128, which can hold any text. Either way, a
// scanner reads back exactly the number shown.
export default function BarcodeImage({ value, height = 50, barWidth = 1.6, fontSize = 14 }: BarcodeImageProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // If the code can't be drawn at all, we just show it as text.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!svgRef.current || !value) return;

    const options = { height, width: barWidth, fontSize, displayValue: true };
    let drawn = false;

    // EAN-13 when it is one (13 digits with the right check digit). "flat"
    // prints all 13 digits underneath instead of one sticking out on the left.
    if (/^\d{13}$/.test(value)) {
      JsBarcode(svgRef.current, value, {
        ...options,
        format: 'EAN13',
        flat: true,
        valid: (ok: boolean) => {
          drawn = ok;
        },
      });
    }

    // Anything else (or an EAN-13 with a wrong check digit): Code 128.
    if (!drawn) {
      JsBarcode(svgRef.current, value, {
        ...options,
        format: 'CODE128',
        valid: (ok: boolean) => {
          drawn = ok;
        },
      });
    }

    setFailed(!drawn);
  }, [value, height, barWidth, fontSize]);

  if (!value) return null;

  return (
    <>
      <svg
        ref={svgRef}
        className="barcode-image"
        role="img"
        aria-label={`Barcode ${value}`}
        style={failed ? { display: 'none' } : undefined}
      />
      {failed && <span className="barcode-text">{value}</span>}
    </>
  );
}
