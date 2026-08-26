const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const allowedOrigins = ["localhost:3000"];

if (appUrl) {
  try {
    allowedOrigins.push(new URL(appUrl).host);
  } catch {
    // O deploy continua funcional; a variável será corrigida pelo ambiente.
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
};

export default nextConfig;
