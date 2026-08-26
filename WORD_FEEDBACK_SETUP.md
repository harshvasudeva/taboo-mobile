# Word Feedback System - Setup Guide

## Overview
The game now includes a word feedback system that allows players to report difficult or inappropriate words during gameplay. Feedback is collected throughout the game and automatically sent to Google Sheets when the game ends or room closes.

## Features
- **Info Icon on Words**: After each turn, an info icon (ℹ️) appears on each word card in the turn stats
- **Feedback Modal**: Clicking the icon opens a modal where players can submit feedback about the word
- **Local Storage**: Feedback is stored in the room's memory until the game ends
- **Batch Upload**: All feedback is sent to Google Sheets when:
  - Game naturally completes all rounds
  - Host manually ends the game
  - Room becomes empty (all players leave)
  - All players disconnect

## Google Sheets Setup

### Step 1: Create a Google Sheets Spreadsheet
1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Rename the first sheet to "Feedback"
4. Add headers in the first row:
   - A1: `Timestamp`
   - B1: `Room Code`
   - C1: `Player Name`
   - D1: `Word`
   - E1: `Difficulty`
   - F1: `Feedback`
5. Copy the Spreadsheet ID from the URL:
   - URL format: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
   - Save this ID for later

### Step 2: Create Google Cloud Service Account
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Google Sheets API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"
4. Create Service Account:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Name it "Taboo Word Feedback"
   - Click "Create and Continue"
   - Skip role assignment (click "Continue" then "Done")
5. Generate JSON Key:
   - Click on the newly created service account
   - Go to "Keys" tab
   - Click "Add Key" > "Create new key"
   - Choose "JSON" format
   - Download the JSON file (keep it secure!)

### Step 3: Share Spreadsheet with Service Account
1. Open your Google Sheets spreadsheet
2. Click "Share" button
3. Add the service account email (found in the JSON file as `client_email`)
4. Give it "Editor" permissions
5. Uncheck "Notify people" and click "Share"

### Step 4: Configure Environment Variables

#### For Local Development:
1. Open your `.env` file or create one in the project root
2. Add these environment variables:
```bash
GOOGLE_SHEETS_ID=your_spreadsheet_id_here
GOOGLE_SHEETS_CREDENTIALS='{"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"...@....iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}'
```

**Important**: 
- Copy the ENTIRE contents of your downloaded JSON file
- Paste it as a single-line string in the `GOOGLE_SHEETS_CREDENTIALS` variable
- Make sure to use single quotes around the JSON
- Keep the double quotes inside the JSON intact

#### For Production (Vercel/Netlify/etc):
1. Go to your hosting platform's environment variables settings
2. Add the same two variables:
   - `GOOGLE_SHEETS_ID`
   - `GOOGLE_SHEETS_CREDENTIALS`
3. Redeploy your application

### Step 5: Test the Integration
1. Start your server
2. Look for this message in the console:
   ```
   ✅ Google Sheets API initialized successfully
   ```
3. If you see an error, double-check your credentials
4. If not configured, you'll see:
   ```
   ⚠️ Google Sheets credentials not configured
   Word feedback will be stored locally but not sent to Google Sheets
   ```

## Usage

### For Players:
1. Play the game normally
2. After each turn, you'll see word cards with statistics
3. Click the info icon (ℹ️) on any word to provide feedback
4. Write your feedback (e.g., "Word was too obscure", "Nobody knew this word")
5. Click "Submit Feedback"
6. Feedback is saved and will be sent to Google Sheets when the game ends

### For Hosts/Admins:
- All feedback from your game room will be automatically collected
- When the game ends (naturally or manually), feedback is sent to Google Sheets
- Check your spreadsheet to see all feedback entries
- Use this data to refine your word list

## Fallback Behavior
If Google Sheets is not configured:
- The feedback feature still works!
- Players can still submit feedback
- Feedback is stored in the server's memory for that room
- It just won't be saved to Google Sheets when the game ends
- Console will show: `Skipping Google Sheets upload (not configured or no feedback)`

## Privacy & Security Notes
- Never commit your service account JSON file to version control
- Never expose your credentials in client-side code
- The service account only has access to the specific spreadsheet you shared
- Player names and room codes are stored - ensure compliance with your privacy policy
- Consider adding data retention policies to your spreadsheet

## Troubleshooting

### "Failed to initialize Google Sheets API"
- Check that your JSON credentials are valid
- Ensure the JSON is properly formatted as a single-line string
- Verify you've enabled the Google Sheets API in Google Cloud Console

### "Error sending feedback to Google Sheets"
- Verify the service account email has Editor access to the spreadsheet
- Check that the sheet name is exactly "Feedback" (case-sensitive)
- Ensure the spreadsheet ID is correct
- Check Google Cloud quotas/billing

### Feedback not appearing in sheets
- Verify the game actually ended (not just disconnected temporarily)
- Check server logs for error messages
- Ensure the spreadsheet has headers in row 1
- Verify the sheet tab is named "Feedback"

## Example Feedback Entry
```
| Timestamp           | Room Code | Player Name | Word       | Difficulty | Feedback                          |
|---------------------|-----------|-------------|------------|------------|-----------------------------------|
| 2026-01-14T10:30:45 | ABC123    | Player1     | ESOTERIC   | hard       | Too obscure, nobody knew it       |
| 2026-01-14T10:32:15 | ABC123    | Player2     | AMBIGUOUS  | medium     | Perfect difficulty level          |
```

## Future Enhancements
Consider adding:
- Aggregate statistics in separate sheet tabs
- Automatic word removal based on feedback threshold
- Admin dashboard to review and action feedback
- Email notifications for high-priority feedback
- A/B testing different word difficulty balances
