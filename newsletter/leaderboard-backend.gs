/* ============================================================
   CMU-Q Games — Leaderboard Backend (Google Apps Script)

   SETUP INSTRUCTIONS:
   1. Create a new Google Sheet (name it "CMU-Q Games Leaderboard")
   2. Rename the first sheet tab to "Scores"
   3. Add these headers in row 1:
      A1: timestamp | B1: pid | C1: name | D1: game | E1: date
      F1: score | G1: metric | H1: display
   4. Go to Extensions → Apps Script
   5. Delete any existing code and paste this entire file
   6. Click Deploy → New deployment
   7. Set type to "Web app"
   8. Set "Execute as" to your account
   9. Set "Who has access" to "Anyone"
   10. Click Deploy and copy the web app URL
   11. Paste that URL into leaderboard.js as the ENDPOINT value

   CORS NOTE: Apps Script web apps handle CORS automatically
   when deployed as "Anyone" access.
   ============================================================ */

// Valid score ranges for each game (used for basic validation)
var VALID_RANGES = {
  'connections': { min: 0, max: 4 },
  'wordle':      { min: 1, max: 6 },
  'crossword':   { min: 0, max: 3600 },
  'sudoku':      { min: 0, max: 3600 },
  'mathler':     { min: 1, max: 6 },
  'spelling-bee':{ min: 0, max: 500 },
  'minesweeper': { min: 0, max: 3600 },
  'trivia':      { min: 0, max: 10 }
};

// Personality quiz result types (for distribution mode)
var PERSONALITY_TYPES = {
  'A': { title: 'The Strategist', emoji: '📚' },
  'B': { title: 'The Collaborator', emoji: '🤝' },
  'C': { title: 'The Independent', emoji: '🎧' },
  'D': { title: 'The Night Owl', emoji: '🌙' }
};

/**
 * Handle GET requests — fetch leaderboard data
 * Query params: ?game=wordle&date=2026-04-11
 */
function doGet(e) {
  var game = (e.parameter.game || '').toLowerCase();
  var date = e.parameter.date || '';

  if (!game || !date) {
    return jsonResponse({ error: 'Missing game or date parameter' });
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Scores');
  if (!sheet) return jsonResponse({ error: 'Sheet not found' });

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = data.slice(1);

  // Filter rows matching game + date
  var filtered = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (String(row[3]).toLowerCase() === game && String(row[4]) === date) {
      filtered.push({
        pid: String(row[1]),
        name: String(row[2]),
        game: String(row[3]),
        date: String(row[4]),
        score: Number(row[5]),
        metric: String(row[6]),
        display: String(row[7])
      });
    }
  }

  // Special case: personality quiz returns type distribution
  if (game === 'personality') {
    return jsonResponse(buildDistribution(filtered));
  }

  // Sort by score ascending (lower = better)
  filtered.sort(function (a, b) { return a.score - b.score; });

  // Return top 20
  return jsonResponse(filtered.slice(0, 20));
}

/**
 * Handle POST requests — submit a score
 * Body: JSON { action, pid, name, game, date, score, metric, display }
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: 'Invalid JSON' });
  }

  if (body.action !== 'submit') {
    return jsonResponse({ error: 'Unknown action' });
  }

  var pid = String(body.pid || '');
  var name = String(body.name || '');
  var game = String(body.game || '').toLowerCase();
  var date = String(body.date || '');
  var score = Number(body.score);
  var metric = String(body.metric || '');
  var display = String(body.display || '');

  // Validate required fields
  if (!pid || !name || !game || !date) {
    return jsonResponse({ error: 'Missing required fields' });
  }

  // Personality quiz: no score validation, just store the type
  if (game === 'personality') {
    return handlePersonalitySubmit(pid, name, date, metric, display);
  }

  // Validate score range
  var range = VALID_RANGES[game];
  if (range && (score < range.min || score > range.max)) {
    return jsonResponse({ error: 'Score out of valid range' });
  }

  if (isNaN(score)) {
    return jsonResponse({ error: 'Invalid score' });
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Scores');
  if (!sheet) return jsonResponse({ error: 'Sheet not found' });

  // Check for existing entry (same pid + game + date)
  var data = sheet.getDataRange().getValues();
  var existingRow = -1;
  var existingScore = Infinity;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === pid &&
        String(data[i][3]).toLowerCase() === game &&
        String(data[i][4]) === date) {
      existingRow = i + 1; // 1-indexed for sheet
      existingScore = Number(data[i][5]);
      break;
    }
  }

  if (existingRow > 0) {
    // Update only if new score is better (lower)
    if (score < existingScore) {
      sheet.getRange(existingRow, 1).setValue(new Date());
      sheet.getRange(existingRow, 6).setValue(score);
      sheet.getRange(existingRow, 7).setValue(metric);
      sheet.getRange(existingRow, 8).setValue(display);
      return jsonResponse({ status: 'updated', score: score });
    } else {
      return jsonResponse({ status: 'exists', score: existingScore });
    }
  }

  // New entry — append
  sheet.appendRow([new Date(), pid, name, game, date, score, metric, display]);
  return jsonResponse({ status: 'ok', score: score });
}

/**
 * Handle personality quiz submissions (store type, not numeric score)
 */
function handlePersonalitySubmit(pid, name, date, metric, display) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Scores');
  if (!sheet) return jsonResponse({ error: 'Sheet not found' });

  var data = sheet.getDataRange().getValues();

  // Check for existing entry
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === pid &&
        String(data[i][3]).toLowerCase() === 'personality' &&
        String(data[i][4]) === date) {
      // Already submitted — don't update personality results
      return jsonResponse({ status: 'exists' });
    }
  }

  // New entry
  sheet.appendRow([new Date(), pid, name, 'personality', date, 0, metric, display]);
  return jsonResponse({ status: 'ok' });
}

/**
 * Build type distribution for personality quiz
 */
function buildDistribution(entries) {
  var types = {};
  var total = entries.length;

  // Initialize all types
  for (var key in PERSONALITY_TYPES) {
    types[key] = {
      title: PERSONALITY_TYPES[key].title,
      emoji: PERSONALITY_TYPES[key].emoji,
      count: 0
    };
  }

  // Count entries by type (stored in metric field)
  for (var i = 0; i < entries.length; i++) {
    var type = String(entries[i].metric).toUpperCase();
    if (types[type]) {
      types[type].count++;
    }
  }

  return { types: types, total: total };
}

/**
 * Return JSON response with CORS headers
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
