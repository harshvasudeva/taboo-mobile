# Word Feedback System - Quick Start

## Overview
Players can now report difficult or inappropriate words to help refine the word list! 

## What Players See
After each turn ends, an **info icon (ℹ️)** appears on each word card. Clicking it opens a feedback form where players can describe issues with the word.

## Setup (5 minutes)

### 1. Install Dependencies
Already done! The `googleapis` package is installed.

### 2. Create Google Sheet
1. Create a new [Google Sheet](https://sheets.google.com)
2. Name the first tab "Feedback"
3. Add headers: Timestamp | Room Code | Player Name | Word | Difficulty | Feedback
4. Copy the spreadsheet ID from the URL

### 3. Create Service Account
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable Google Sheets API
3. Create a service account
4. Download the JSON key file
5. Share your spreadsheet with the service account email (as Editor)

### 4. Set Environment Variables
Create a `.env` file:
```bash
GOOGLE_SHEETS_ID=your_spreadsheet_id
GOOGLE_SHEETS_CREDENTIALS='paste_entire_json_file_here_as_single_line'
```

### 5. Start Server
```bash
npm start
```

Look for: `✅ Google Sheets API initialized successfully`

## That's It!
- Players can submit feedback during games
- Feedback automatically uploads when games end
- Review feedback in your Google Sheet
- Use insights to improve your word list

## Without Google Sheets
The feature still works! Feedback is collected but not persisted. Perfect for testing.

## Need Help?
See [WORD_FEEDBACK_SETUP.md](./WORD_FEEDBACK_SETUP.md) for detailed instructions.
