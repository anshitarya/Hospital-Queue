import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/clinic-admin',
        '/doctor',
        '/reception',
        '/patient',
        '/profile',
        '/display',
      ],
    },
    sitemap: 'https://turnos.in/sitemap.xml',
  };
}
