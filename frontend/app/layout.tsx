import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Taboo - Multiplayer Word Guessing Game',
  description: 'Play Taboo with friends online!',
}

export const viewport = {
  width: 'device-width',
  initialScale: 0.9,
  maximumScale: 1.0,
  userScalable: true,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logo.png" type="image/png" />
      </head>
      <body className={inter.className} suppressHydrationWarning>{children}</body>
    </html>
  )
}
