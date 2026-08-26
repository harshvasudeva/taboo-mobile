# Admin Features Documentation

## Overview
Host/Admin controls have been added to the Taboo game to allow room management and game control.

## How to Access Admin Panel
- **Only visible to the room host**
- Click the purple "Admin" button in the top-right corner (next to Leave Game button)
- Opens a comprehensive admin panel modal

## Admin Features

### 1. Player Management
**Location:** Admin Panel → Player Management Section

**Features:**
- **View All Players:** See all players organized by team (Blue/Red)
- **Kick Player:** Remove any player from the game
  - Click "Kick" button next to player name
  - Player is immediately removed from the room
  - Game continues with remaining players
- **Make Describer:** Assign any player as the describer for their team
  - Click "Make Describer" button
  - Current describer is marked with yellow badge
  - Change takes effect immediately

### 2. Game Controls
**Location:** Admin Panel → Game Controls Section

**Features:**
- **Skip Turn:** Skip the current team's turn and move to the next team
  - Requires confirmation dialog
  - Advances to next team immediately
  - Useful for resolving issues or speeding up game
  
- **End Game:** Immediately end the game for all players
  - Requires confirmation dialog
  - Sends all players to game over screen
  - Shows final scores

### 3. Host Privileges

**Automatic Host Transfer:**
- If the host leaves, the first remaining player becomes the new host
- New host is notified via alert
- All admin features become available to new host

**Host Indicators:**
- Admin button only visible to host
- All admin actions require host verification on server
- Non-hosts cannot access admin functions

## Backend Implementation

### Socket Events (server.js)

1. **admin-end-game**
   - Ends the game immediately
   - Emits `game-over` event to all players
   - Clears game state

2. **admin-skip-turn**
   - Moves to next team
   - Checks if round completed
   - Ends game if max rounds reached
   - Emits `turn-skipped` event

3. **kick-player** (existing)
   - Removes player from room
   - Updates team rosters
   - Handles describer index adjustments

4. **set-describer** (existing)
   - Changes describer for any team
   - Emits `describer-changed` event
   - Updates game state

### Security
- All admin events verify `room.host === socket.id` on server
- Frontend checks `isHost` before showing controls
- Prevents unauthorized admin actions

## Frontend Implementation

### Components Modified

**GameScreen.tsx:**
- Added `showAdminPanel` state
- Added admin button in top-right
- Created comprehensive admin panel modal with:
  - Player management section (kick, make describer)
  - Game controls section (skip turn, end game)
- Added admin functions:
  - `handleEndGame()`
  - `handleAdminSkipTurn()`
  - `handleKickPlayer()` (existing)
  - `handleMakeDescriber()` (existing)

**GameContext.tsx:**
- Added `turn-skipped` event handler
- Updates game state on admin actions
- Shows alerts for important admin events

## UI/UX Details

### Admin Panel Modal
- **Glass morphism design** matching game theme
- **Responsive layout** works on mobile and desktop
- **Organized sections** for easy navigation
- **Color-coded teams** (Blue/Red)
- **Icon indicators** for visual clarity
- **Confirmation dialogs** for destructive actions

### Visual Elements
- Purple theme for admin controls (Settings icon, borders)
- Shield icon in panel header
- Player badges showing current describer
- Team-colored headings
- Hover effects on all buttons

## Usage Examples

### Scenario 1: Player Causing Issues
1. Host clicks "Admin" button
2. Finds player in Player Management section
3. Clicks "Kick" next to player name
4. Player removed, game continues

### Scenario 2: Turn Taking Too Long
1. Host clicks "Admin" button
2. Goes to Game Controls section
3. Clicks "Skip Turn"
4. Confirms action
5. Next team's turn begins immediately

### Scenario 3: Changing Describer
1. Host clicks "Admin" button
2. Finds player in their team section
3. Clicks "Make Describer"
4. Player becomes describer for their team

### Scenario 4: Ending Game Early
1. Host clicks "Admin" button
2. Clicks "End Game" in Game Controls
3. Confirms action
4. All players see game over screen with scores

## Future Enhancements (Potential)

Could be added in future updates:
- Adjust timer mid-game
- Pause/resume timer
- Change team names
- Adjust max rounds
- Change points per difficulty
- Toggle bonus word system
- Ban players (prevent rejoin)
- Transfer host to specific player
- Add spectator mode
- Room settings page

## Testing Checklist

- [x] Host sees Admin button
- [x] Non-hosts don't see Admin button
- [x] Kick player removes them from game
- [x] Make describer changes current describer
- [x] Skip turn advances to next team
- [x] End game shows game over screen
- [x] Confirmation dialogs work
- [x] Admin panel closes on action
- [x] Host transfer works when host leaves
- [x] Mobile responsive design

## Deployment Notes

**Files Modified:**
- `frontend/components/GameScreen.tsx` - Admin panel UI and functions
- `frontend/components/GameContext.tsx` - Event handlers
- `server.js` - Backend admin event handlers

**No Breaking Changes:**
- All new features are additive
- Existing functionality unchanged
- Backward compatible with current game flow

**Icons Added:**
- `Settings` - Admin button
- `Shield` - Admin panel header
- `UserX` - Kick player
- `SkipForward` - Skip turn

All icons from `lucide-react` library (already in use).
