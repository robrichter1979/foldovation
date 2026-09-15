/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://49.13.169.197:8000/api/:path*",
      },
    ]
  },
}

module.exports = nextConfig
