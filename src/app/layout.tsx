import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Noto_Sans_Arabic } from 'next/font/google';
import './globals.css';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { AuthProvider } from '@/lib/auth/AuthContext';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

const arabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KhidmatConnect AI — Emergency Coordination Platform',
  description:
    'AI-powered humanitarian emergency coordination platform for Pakistan. Report emergencies, track live response, and connect with verified relief resources.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${arabic.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
