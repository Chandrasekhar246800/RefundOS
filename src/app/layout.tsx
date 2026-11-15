import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/components/providers/AppProvider';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';

export const metadata: Metadata = {
  title: 'REFUND OS — AI-Powered Intelligent Refund Management Platform',
  description: 'Enterprise AI-assisted refund management and decision automation platform powered by Laya API System One.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden bg-slate-50 font-sans antialiased text-slate-900">
        <AppProvider>
          {/* Left Sidebar */}
          <Sidebar />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
