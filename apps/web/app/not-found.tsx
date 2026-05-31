import Link from 'next/link';

/**
 * Custom 404 page — shown for any unrecognised route.
 * Play Store reviewers commonly test URLs that don't exist; a branded page
 * looks professional and links back to the app instead of a generic Chrome error.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold text-2xl shadow-lg mb-6">
        HQ
      </div>

      <h1 className="text-6xl font-bold text-slate-900 mb-3">404</h1>
      <p className="text-xl font-semibold text-slate-700 mb-2">Page not found</p>
      <p className="text-slate-500 max-w-sm mb-8">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/" className="btn-primary !px-6 !py-3">
          Go to home
        </Link>
        <Link href="/login/choose" className="btn-secondary !px-6 !py-3">
          Sign in
        </Link>
      </div>
    </div>
  );
}
