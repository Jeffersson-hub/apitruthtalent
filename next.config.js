/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,  // IMPORTANT: Désactive ESLint
  },
  typescript: {
    ignoreBuildErrors: true,   // IMPORTANT: Désactive erreurs TypeScript
  },
}

module.exports = nextConfig