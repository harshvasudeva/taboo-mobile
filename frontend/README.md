# Taboo - Next.js Frontend

Modern Next.js frontend for the multiplayer Taboo game.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run development server:**
   ```bash
   npm run dev
   ```

3. **Open in browser:**
   ```
   http://localhost:3001
   ```

## Backend Server

Make sure the backend server is running on port 3000:

```bash
cd ..
node server.js
```

## Build for Production

```bash
npm run build
npm start
```

## Environment Variables

Create `.env.local`:
```
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

For production, update to your production server URL.
