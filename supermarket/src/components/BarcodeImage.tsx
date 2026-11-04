// BarcodeImage.tsx: draws a product's barcode.
//
// Used in two places: the Inventory products table (small) and the POS
// ProductDetails pop-up (a bit bigger). Barcodes themselves are created by
// the database when a product is added, never typed in by hand.
//
// React words used here:
//   useRef    = a box ({ current: … }) React keeps between redraws. Passed as
//               ref={svgRef}, React puts the real <svg> element in it, so the
//               jsbarcode library can draw into that element.
//   useState  = a value React remembers; changing it redraws the component.
//   useEffect = code React runs AFTER the component is on screen (here: the
//               drawing, which needs the <svg> to exist first).
import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeImageProps {
  // The barcode number to draw.
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

  // Draw (or redraw) the bars. The list at the end, [value, height, barWidth,
  // fontSize], tells React to run this again only when one of those changes.
  useEffect(() => {
    if (!svgRef.current || !value) return;

    // displayValue: print the number under the bars.
    const options = { height, width: barWidth, fontSize, displayValue: true };
    // jsbarcode calls our `valid` function with true/false to say whether
    // the value could be drawn in that format; we remember the answer here.
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

  // No barcode -> draw nothing. (This early return comes AFTER the hooks on
  // purpose: React needs the same hooks to run in the same order every time.)
  if (!value) return null;

  // The <svg> stays on the page even when drawing failed (just hidden),
  // because the effect above needs it in svgRef to try again if `value`
  // changes. The class names are styled in App.css.
  // <>…</> is a "fragment": it returns two things side by side without
  // wrapping them in an extra element.
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
