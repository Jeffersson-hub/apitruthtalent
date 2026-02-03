/** @type {import('next').NextConfig} */
const nextConfig = {
  // Désactiver les pages si non utilisées
  output: 'standalone',
  // Pour Vercel Edge Functions
  experimental: {
    runtime: 'edge'
  },
  // Configurer les tailles de body
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    responseLimit: false,
  },
  // Désactiver certaines fonctionnalités inutiles
  images: {
    unoptimized: true,
  },
  // Ignorer les erreurs de TypeScript pendant le build
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;