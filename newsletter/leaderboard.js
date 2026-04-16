/* ============================================================
   CMU-Q Games — Shared Leaderboard Module

   Include this file in every game page:
     <script src="leaderboard.js"></script>

   SETUP: Replace ENDPOINT with your deployed Apps Script URL.
   See leaderboard-backend.gs for deployment instructions.
   ============================================================ */

window.Leaderboard = (function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────────
  // Replace with your deployed Google Apps Script web app URL
  var ENDPOINT = 'https://script.google.com/a/macros/andrew.cmu.edu/s/AKfycbx636xgPVWvZbA4XqPNkkHq825ou0xD3uxV6KjfoJkQHNbGX0wwG7BYJSCaN8Ebh5xD/exec';

  // ── Player Identity ────────────────────────────────────────
  // Reads Mailchimp merge tags from URL params, caches in sessionStorage.
  // Falls back to a name prompt for direct visitors.

  function getPlayer() {
    // Check sessionStorage first (survives page navigation)
    var pid = sessionStorage.getItem('lb_pid');
    var name = sessionStorage.getItem('lb_name');
    if (pid && name) return { pid: pid, name: name };

    // Read from URL params (Mailchimp merge tags)
    var params = new URLSearchParams(window.location.search);
    pid = params.get('pid') || '';
    name = params.get('name') || '';

    if (pid && name) {
      sessionStorage.setItem('lb_pid', pid);
      sessionStorage.setItem('lb_name', name);
      return { pid: pid, name: name };
    }

    // Check localStorage (returning direct visitor)
    pid = localStorage.getItem('lb_pid') || '';
    name = localStorage.getItem('lb_name') || '';
    if (pid && name) {
      sessionStorage.setItem('lb_pid', pid);
      sessionStorage.setItem('lb_name', name);
      return { pid: pid, name: name };
    }

    return null;
  }

  function promptForName() {
    return new Promise(function (resolve) {
      // Create overlay
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';

      var card = document.createElement('div');
      card.style.cssText = 'background:#fff;border-radius:12px;padding:28px;max-width:340px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-family:inherit;text-align:center;';

      card.innerHTML =
        '<div style="font-size:1.8rem;margin-bottom:8px;">🏆</div>' +
        '<div style="font-size:1.05rem;font-weight:700;margin-bottom:4px;">Join the Leaderboard</div>' +
        '<div style="font-size:0.82rem;color:#6b7280;margin-bottom:16px;">Enter your name to submit your score</div>' +
        '<input id="lb-name-input" type="text" placeholder="Your name" maxlength="30" ' +
        'style="width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:8px;font-size:0.9rem;font-family:inherit;outline:none;margin-bottom:12px;" />' +
        '<div style="display:flex;gap:8px;">' +
        '<button id="lb-name-skip" style="flex:1;padding:10px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-family:inherit;font-size:0.85rem;cursor:pointer;">Skip</button>' +
        '<button id="lb-name-submit" style="flex:1;padding:10px;border-radius:8px;border:none;background:#1a1a2e;color:#fff;font-family:inherit;font-size:0.85rem;font-weight:600;cursor:pointer;">Submit</button>' +
        '</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      var input = document.getElementById('lb-name-input');
      input.focus();

      function finish(name) {
        document.body.removeChild(overlay);
        if (name) {
          var pid = 'guest_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          sessionStorage.setItem('lb_pid', pid);
          sessionStorage.setItem('lb_name', name);
          localStorage.setItem('lb_pid', pid);
          localStorage.setItem('lb_name', name);
          resolve({ pid: pid, name: name });
        } else {
          resolve(null);
        }
      }

      document.getElementById('lb-name-submit').addEventListener('click', function () {
        var val = input.value.trim();
        if (val) finish(val);
      });

      document.getElementById('lb-name-skip').addEventListener('click', function () {
        finish(null);
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var val = input.value.trim();
          if (val) finish(val);
        }
      });
    });
  }

  // ── Score Submission ───────────────────────────────────────

  function submit(data) {
    // data: { game, date, score, metric, display }
    var player = getPlayer();

    function doSubmit(p) {
      if (!p) return Promise.resolve(null);

      var payload = {
        action: 'submit',
        pid: p.pid,
        name: p.name,
        game: data.game,
        date: data.date,
        score: data.score,
        metric: data.metric,
        display: data.display
      };

      return fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json(); })
        .catch(function () { return null; });
    }

    if (player) {
      return doSubmit(player);
    } else {
      return promptForName().then(doSubmit);
    }
  }

  // ── Leaderboard Display ────────────────────────────────────

  function show(containerId, game, date) {
    var container = document.getElementById(containerId);
    if (!container) return;

    // Show loading state
    container.innerHTML = renderShell('Loading leaderboard...');

    var url = ENDPOINT + '?game=' + encodeURIComponent(game) + '&date=' + encodeURIComponent(date);

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (game === 'personality') {
          container.innerHTML = renderDistribution(data);
        } else {
          container.innerHTML = renderRanking(data, game);
        }
      })
      .catch(function () {
        container.innerHTML = renderShell('Leaderboard unavailable');
      });
  }

  function renderShell(message) {
    return '<div style="' + shellStyle() + '">' +
      '<div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin-bottom:12px;">🏆 Leaderboard</div>' +
      '<div style="color:#6b7280;font-size:0.85rem;">' + message + '</div>' +
      '</div>';
  }

  function renderRanking(entries, game) {
    if (!entries || !entries.length) {
      return renderShell('No scores yet — be the first!');
    }

    var player = getPlayer();
    var playerPid = player ? player.pid : '';

    var medals = ['🥇', '🥈', '🥉'];
    var rows = '';
    var playerInTop = false;
    var playerEntry = null;
    var playerRank = 0;

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var isMe = e.pid === playerPid;
      if (isMe) {
        playerInTop = i < 10;
        playerEntry = e;
        playerRank = i + 1;
      }
      if (i >= 10 && !isMe) continue;
      if (i >= 10) continue;

      var medal = i < 3 ? medals[i] : '';
      var highlight = isMe ? 'background:#f0f7ff;' : '';
      rows += '<div style="display:flex;align-items:center;padding:8px 10px;border-radius:6px;' + highlight + '">' +
        '<span style="width:28px;font-size:0.8rem;font-weight:700;color:#6b7280;">' + (medal || (i + 1) + '.') + '</span>' +
        '<span style="flex:1;font-size:0.85rem;font-weight:' + (isMe ? '700' : '500') + ';">' +
        escapeHtml(e.name) + (isMe ? ' (you)' : '') + '</span>' +
        '<span style="font-size:0.85rem;font-weight:700;color:#1a1a2e;font-variant-numeric:tabular-nums;">' + escapeHtml(e.display) + '</span>' +
        '</div>';
    }

    // Show player outside top 10
    if (playerEntry && !playerInTop) {
      rows += '<div style="border-top:1px dashed #e5e7eb;margin:6px 0;"></div>';
      rows += '<div style="display:flex;align-items:center;padding:8px 10px;border-radius:6px;background:#f0f7ff;">' +
        '<span style="width:28px;font-size:0.8rem;font-weight:700;color:#6b7280;">' + playerRank + '.</span>' +
        '<span style="flex:1;font-size:0.85rem;font-weight:700;">' + escapeHtml(playerEntry.name) + ' (you)</span>' +
        '<span style="font-size:0.85rem;font-weight:700;color:#1a1a2e;font-variant-numeric:tabular-nums;">' + escapeHtml(playerEntry.display) + '</span>' +
        '</div>';
    }

    return '<div style="' + shellStyle() + '">' +
      '<div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin-bottom:12px;">🏆 Leaderboard</div>' +
      '<div style="display:flex;flex-direction:column;gap:2px;">' + rows + '</div>' +
      '</div>';
  }

  function renderDistribution(data) {
    // data: { types: { "A": { title, emoji, count }, ... }, total }
    if (!data || !data.types) {
      return renderShell('No results yet — be the first!');
    }

    var total = data.total || 1;
    var bars = '';
    var colors = ['#C41230', '#2563eb', '#16a34a', '#7c3aed'];
    var i = 0;

    for (var type in data.types) {
      var t = data.types[type];
      var pct = Math.round((t.count / total) * 100);
      var color = colors[i % colors.length];

      bars += '<div style="margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px;">' +
        '<span style="font-weight:600;">' + escapeHtml(t.emoji + ' ' + t.title) + '</span>' +
        '<span style="color:#6b7280;">' + t.count + ' (' + pct + '%)</span>' +
        '</div>' +
        '<div style="height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">' +
        '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:4px;transition:width 0.5s;"></div>' +
        '</div></div>';
      i++;
    }

    return '<div style="' + shellStyle() + '">' +
      '<div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin-bottom:12px;">📊 Community Results</div>' +
      bars +
      '<div style="font-size:0.75rem;color:#6b7280;text-align:center;margin-top:4px;">' + total + ' responses</div>' +
      '</div>';
  }

  // ── Helpers ────────────────────────────────────────────────

  function shellStyle() {
    return 'background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-top:16px;box-shadow:0 1px 4px rgba(0,0,0,0.06);';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Auto-init: read URL params on load ─────────────────────
  (function init() {
    var params = new URLSearchParams(window.location.search);
    var pid = params.get('pid');
    var name = params.get('name');
    if (pid && name) {
      sessionStorage.setItem('lb_pid', pid);
      sessionStorage.setItem('lb_name', name);
      localStorage.setItem('lb_pid', pid);
      localStorage.setItem('lb_name', name);
    }

    // Preserve identity params on all internal links (back links, etc.)
    var search = window.location.search;
    if (search) {
      document.querySelectorAll('a[href]').forEach(function(link) {
        var href = link.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('mailto:') && !href.includes('?')) {
          link.setAttribute('href', href + search);
        }
      });
    }
  })();

  // ── Public API ─────────────────────────────────────────────
  return {
    submit: submit,
    show: show,
    getPlayer: getPlayer
  };

})();
