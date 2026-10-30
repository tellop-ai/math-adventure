import { ArrowLeft } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';

import { BACK_TO_OWNER } from '../lib/data/person.js';
import { getLocale, t } from '../lib/i18n/index.js';
import { personOrNull } from '../lib/math/person.js';

import './globals.css';

export function generateMetadata() {
  const locale = getLocale();
  return { title: t('app.title', locale) };
}

/**
 * Every page of the game. While the app's owner looks at it as a Member or a
 * Viewer (`preview`, kit rule 1), a plain link above the page takes them back
 * to their own view; nobody else sees it.
 */
export default async function RootLayout({ children }) {
  const locale = getLocale();
  const person = await personOrNull();
  return (
    <html lang={locale}>
      <body>
        {person?.preview === true ? (
          <p className="flex justify-center px-4 pt-3" data-print-hidden>
            <a href={BACK_TO_OWNER} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <ArrowLeft aria-hidden="true" />
              {t('math.preview.back', locale)}
            </a>
          </p>
        ) : null}
        {children}
      </body>
    </html>
  );
}
