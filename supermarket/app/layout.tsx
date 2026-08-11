import type { Metadata } from 'next';
import '../src/App.css';

export const metadata: Metadata = {
  title: 'SuperMarket Express',
  description: 'Point of Sale, Inventory Management, and Loyalty System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}