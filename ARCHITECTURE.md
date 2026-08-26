# 🎯 Deployment Architecture

## Current Setup (Local Development)

```
┌─────────────────┐         ┌─────────────────┐
│   Frontend      │────────▶│    Backend      │
│   (Next.js)     │ Socket  │  (Socket.IO)    │
│  localhost:3001 │   ⚡    │  localhost:3000 │
└─────────────────┘         └─────────────────┘
      ✅ Works!                  ✅ Works!
```

---

## ❌ WRONG: Vercel Only (WON'T WORK)

```
┌─────────────────┐         ┌─────────────────┐
│   Frontend      │────────▶│    Backend      │
│   (Next.js)     │   ❌    │  (Socket.IO)    │
│   Vercel ✅     │  NO!    │   NOWHERE ❌    │
└─────────────────┘         └─────────────────┘
       Shows UI              NOT DEPLOYED!
     "Disconnected"          Game broken!
```

**Problem**: Backend not deployed = No multiplayer!

---

## ✅ CORRECT: Vercel + Render (WORKS!)

```
┌─────────────────┐         ┌─────────────────┐
│   Frontend      │────────▶│    Backend      │
│   (Next.js)     │ Socket  │  (Socket.IO)    │
│   Vercel ✅     │   ⚡    │   Render ✅     │
│                 │  HTTPS  │                 │
│ vercel.app      │         │ onrender.com    │
└─────────────────┘         └─────────────────┘
       ✅ Works!                  ✅ Works!
         
         Users can play from anywhere! 🌍
```

---

## Why Two Platforms?

### Vercel (Frontend)
- ✅ Perfect for Next.js
- ✅ Fast builds
- ✅ Global CDN
- ✅ Automatic deployments
- ❌ No WebSocket servers

### Render (Backend)
- ✅ Supports WebSockets
- ✅ Always-on server
- ✅ Free tier
- ✅ Easy deployment
- ❌ Not optimized for Next.js

### Together = Perfect! 🎯

---

## Data Flow

```
┌──────────┐
│  User 1  │──┐
└──────────┘  │
              ▼
┌──────────┐  ┌─────────────┐  ┌──────────────┐
│  User 2  │─▶│  Frontend   │─▶│   Backend    │
└──────────┘  │  (Vercel)   │  │  (Render)    │
              └─────────────┘  └──────────────┘
┌──────────┐        │                  │
│  User 3  │────────┘                  │
└──────────┘                           │
                                       │
              ┌────────────────────────┘
              ▼
       Game State Sync
       - Room management
       - Score updates
       - Real-time guesses
       - Turn timers
```

---

## Environment Variables

### Frontend (.env.local)
```bash
NEXT_PUBLIC_SERVER_URL=https://your-backend.onrender.com
```

This tells the frontend where to find the backend!

### Backend
No special env vars needed for basic deployment.

---

## Deployment Order

```
1. Deploy Backend First    (Render)
   ↓
2. Get Backend URL         (Copy it!)
   ↓
3. Update Frontend Config  (Add URL)
   ↓
4. Deploy Frontend         (Vercel)
   ↓
5. Test & Play!            🎉
```

**DO NOT** skip step 3 or it won't work!

---

## Quick Reference

| Component | Platform | URL Format | Free Tier |
|-----------|----------|------------|-----------|
| Frontend | Vercel | `*.vercel.app` | ✅ Yes |
| Backend | Render | `*.onrender.com` | ✅ Yes (750hrs) |

---

## Testing Checklist

After deployment, verify:

```
Frontend (Vercel):
├── ✅ Page loads
├── ✅ No 404 errors
├── ✅ Styles load correctly
└── ✅ Shows "Connected" status (🟢)

Backend (Render):
├── ✅ Service is "Live"
├── ✅ No crashes in logs
└── ✅ Responds to WebSocket connections

Game Functionality:
├── ✅ Can create room
├── ✅ Room code generated
├── ✅ Can join room from other device
├── ✅ Players see each other
├── ✅ Can join teams
├── ✅ Game starts
├── ✅ Words display
├── ✅ Typing works
├── ✅ Scores update in real-time
└── ✅ Game completes successfully
```

---

## Common Mistakes

### ❌ Deploying frontend before backend
**Result**: "Disconnected" error

**Fix**: Deploy backend first, get URL, then deploy frontend

---

### ❌ Forgetting environment variable
**Result**: Frontend tries to connect to localhost

**Fix**: Add `NEXT_PUBLIC_SERVER_URL` in Vercel dashboard

---

### ❌ Wrong backend URL format
**Result**: Cannot connect

**Fix**: Use full URL with https://
```bash
# ❌ Wrong
NEXT_PUBLIC_SERVER_URL=taboo-backend.onrender.com

# ✅ Correct  
NEXT_PUBLIC_SERVER_URL=https://taboo-backend.onrender.com
```

---

### ❌ Not redeploying after env change
**Result**: Old settings still active

**Fix**: Redeploy in Vercel after changing environment variables

---

## Success Indicators

### You'll know it works when:

1. **Connection Status**: 🟢 "Connected" (green)
2. **Create Room**: Generates 6-character code
3. **Join Room**: Another device can join
4. **Gameplay**: Words appear, typing works, scores update
5. **No Errors**: Browser console is clean

---

## Next Steps

After successful deployment:
1. ✅ Test thoroughly
2. ✅ Share URL with friends
3. ✅ Add custom domain (optional)
4. ✅ Monitor usage
5. ✅ Enjoy! 🎉

**Ready to deploy?** Follow [DEPLOY.md](./DEPLOY.md) for detailed steps!
