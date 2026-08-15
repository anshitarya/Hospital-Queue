import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions · Turnos',
  description: 'Find answers to common questions about Turnos virtual tokens, waiting time calculations, and clinic queue configurations.',
  alternates: {
    canonical: '/faq',
  },
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
