// app/layout.tsx
import './globals.css';

export const metadata = {
  title: 'CV Parser API',
  description: 'API de parsing intelligent de CV',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}