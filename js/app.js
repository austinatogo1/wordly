/* ============================================================
   WORDLY — app.js
   Dictionary SPA using the Free Dictionary API
   https://dictionaryapi.dev/

   Sections:
   1.  State
   2.  Element References
   3.  UI Helpers
   4.  Theme Toggle
   5.  Saved Words (localStorage)
   6.  Audio Playback
   7.  Render Result (DOM Manipulation)
   8.  Fetch / Search Word (Fetch API + Error Handling)
   9.  Form Event Listener
   10. Initialise
============================================================ */

/* ── 1. State ─────────────────────────────────────────────────────── */
const state = {
  savedWords:   JSON.parse(localStorage.getItem('wordly-saved') || '[]'),
  currentWord:  null,
  currentAudio: null,
  isLight:      localStorage.getItem('wordly-theme') === 'light',
};

/* ── 2. Element References ────────────────────────────────────────── */
const form        = document.getElementById('search-form');
const input       = document.getElementById('search-input');
const searchBtn   = document.getElementById('search-btn');
const loader      = document.getElementById('loader');
const errorBox    = document.getElementById('error-box');
const errorMsg    = document.getElementById('error-msg');
const result      = document.getElementById('result');
const savedWrap   = document.getElementById('saved-words-wrap');
const savedCount  = document.getElementById('saved-count');
const savedEmpty  = document.getElementById('saved-empty');
const themeToggle = document.getElementById('theme-toggle');

/* ── 3. UI Helpers ────────────────────────────────────────────────── */

/** Add the 'active' class to show an element */
function show(el) { el.classList.add('active'); }

/** Remove the 'active' class to hide an element */
function hide(el) { el.classList.remove('active'); }

/** Toggle the loading state — disables the search button while fetching */
function setLoading(active) {
  active ? show(loader) : hide(loader);
  searchBtn.disabled = active;
}

/** Display an error message in the error banner */
function showError(msg) {
  errorMsg.textContent = msg;
  show(errorBox);
  result.innerHTML = '';
}

/** Hide the error banner */
function clearError() { hide(errorBox); }

/**
 * Escape HTML special characters to prevent XSS
 * when injecting API data into innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── 4. Theme Toggle ──────────────────────────────────────────────── */

/** Apply the current theme to <body> and update the button label */
function applyTheme() {
  document.body.classList.toggle('light', state.isLight);
  themeToggle.textContent = state.isLight ? '☾ Dark' : '☀ Light';
}

themeToggle.addEventListener('click', () => {
  state.isLight = !state.isLight;
  localStorage.setItem('wordly-theme', state.isLight ? 'light' : 'dark');
  applyTheme();
});

// Apply saved theme on load
applyTheme();

/* ── 5. Saved Words (localStorage) ───────────────────────────────── */

/** Persist the saved words array to localStorage */
function persistSaved() {
  localStorage.setItem('wordly-saved', JSON.stringify(state.savedWords));
}

/** Re-render the Saved Words section */
function renderSaved() {
  savedCount.textContent = state.savedWords.length;

  if (!state.savedWords.length) {
    savedWrap.innerHTML = '';
    savedWrap.appendChild(savedEmpty);
    savedEmpty.style.display = '';
    return;
  }

  savedEmpty.style.display = 'none';
  savedWrap.innerHTML = '';

  state.savedWords.forEach((word) => {
    const chip = document.createElement('button');
    chip.className = 'saved-chip';
    chip.setAttribute('aria-label', `Search saved word: ${word}`);
    chip.innerHTML = `${escapeHtml(word)} <span class="remove-chip" aria-hidden="true">✕</span>`;

    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-chip')) {
        removeSaved(word);
      } else {
        input.value = word;
        searchWord(word);
      }
    });

    savedWrap.appendChild(chip);
  });
}

/** Check whether a word is already saved */
function isSaved(word) {
  return state.savedWords.includes(word.toLowerCase());
}

/**
 * Toggle save/unsave for a word.
*/
function toggleSaved(word) {
  const w = word.toLowerCase();

  if (isSaved(w)) {
    state.savedWords = state.savedWords.filter((s) => s !== w);
  } else {
    state.savedWords.push(w);
  }

  persistSaved();
  renderSaved();

  // Update the save button inside the visible result
  const saveBtn = document.getElementById('btn-save');
  if (saveBtn) {
    const saved = isSaved(w);
    saveBtn.classList.toggle('saved', saved);
    saveBtn.setAttribute('aria-label', saved ? 'Unsave word' : 'Save word');
    saveBtn.title       = saved ? 'Unsave word' : 'Save word';
    saveBtn.textContent = saved ? '★' : '☆';
  }
}

/** Remove a specific word from saved words */
function removeSaved(word) {
  state.savedWords = state.savedWords.filter((s) => s !== word.toLowerCase());
  persistSaved();
  renderSaved();

  // Reset save button if the removed word is currently displayed
  const saveBtn = document.getElementById('btn-save');
  if (saveBtn && state.currentWord === word.toLowerCase()) {
    saveBtn.classList.remove('saved');
    saveBtn.textContent = '☆';
  }
}

/* ── 6. Audio Playback ────────────────────────────────────────────── */

/**
 * Play the pronunciation audio from a URL.
 * Updates the audio button visual state while playing.
 * @param {string} url
 */
function playAudio(url) {
  // Stop any currently playing audio
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }

  const audioBtn = document.getElementById('btn-audio');
  if (!url) return;

  const audio = new Audio(url);
  state.currentAudio = audio;

  // Update button to "playing" state
  if (audioBtn) {
    audioBtn.classList.add('playing');
    audioBtn.textContent = '⏸ Playing…';
  }

  audio.play().catch(() => {
    // Handle browsers that block autoplay
    if (audioBtn) {
      audioBtn.classList.remove('playing');
      audioBtn.innerHTML = '▶ Pronunciation';
    }
  });

  audio.addEventListener('ended', () => {
    if (audioBtn) {
      audioBtn.classList.remove('playing');
      audioBtn.innerHTML = '▶ Pronunciation';
    }
    state.currentAudio = null;
  });
}

/* ── 7. Render Result (DOM Manipulation) ─────────────────────────── */

/**
 * Build and inject the full result HTML from API data.
 * Then attach all interactive event listeners.
 * @param {Array} data  — API response array
 */
function renderResult(data) {
  const entry = data[0];
  const word  = entry.word;
  state.currentWord = word.toLowerCase();

  // ── Extract phonetics & audio ──────────────────────────────────
  const phonetics    = entry.phonetics || [];
  const phoneticText = phonetics.find((p) => p.text)?.text || '';
  const rawAudio     = phonetics.find((p) => p.audio && p.audio.trim())?.audio || '';
  // Some API URLs are protocol-relative (//ssl.gstatic.com/…)
  const audioUrl = rawAudio.startsWith('//') ? 'https:' + rawAudio : rawAudio;

  const meanings = entry.meanings || [];

  // ── Build HTML string ─────────────────────────────────────────
  let html = `
    <div class="word-header">
      <div>
        <h2 class="word-title">${escapeHtml(word)}</h2>
        ${phoneticText ? `<p class="word-phonetic">${escapeHtml(phoneticText)}</p>` : ''}
      </div>
      <div class="word-actions">
        ${audioUrl ? `
          <button class="btn-audio" id="btn-audio" aria-label="Play pronunciation audio">
            ▶ Pronunciation
          </button>` : ''}
        <button
          class="btn-icon ${isSaved(word) ? 'saved' : ''}"
          id="btn-save"
          aria-label="${isSaved(word) ? 'Unsave word' : 'Save word'}"
          title="${isSaved(word) ? 'Unsave word' : 'Save word'}">
          ${isSaved(word) ? '★' : '☆'}
        </button>
      </div>
    </div>
    <div class="meanings-list">
  `;

  // ── Meanings loop ─────────────────────────────────────────────
  meanings.forEach((meaning) => {
    const pos  = meaning.partOfSpeech || '';
    const defs = meaning.definitions  || [];
    const syns = meaning.synonyms     || [];
    const ants = meaning.antonyms     || [];

    html += `
      <div class="meaning-block">
        ${pos ? `<span class="pos-tag">${escapeHtml(pos)}</span>` : ''}
        <ol class="definitions-list">
    `;

    // Up to 5 definitions per part of speech
    defs.slice(0, 5).forEach((d, i) => {
      html += `
        <li class="def-item">
          <span class="def-num">${i + 1}.</span>
          <div>
            <p class="def-text">${escapeHtml(d.definition)}</p>
            ${d.example
              ? `<p class="def-example">"${escapeHtml(d.example)}"</p>`
              : ''}
          </div>
        </li>
      `;
    });

    html += `</ol>`;

    // Synonyms
    if (syns.length) {
      html += `
        <div class="tags-section">
          <p class="tags-label">Synonyms</p>
          <div class="tags-wrap">
            ${syns.slice(0, 8).map((s) =>
              `<button class="tag" data-word="${escapeHtml(s)}">${escapeHtml(s)}</button>`
            ).join('')}
          </div>
        </div>
      `;
    }

    // Antonyms
    if (ants.length) {
      html += `
        <div class="tags-section">
          <p class="tags-label">Antonyms</p>
          <div class="tags-wrap">
            ${ants.slice(0, 8).map((a) =>
              `<button class="tag" data-word="${escapeHtml(a)}">${escapeHtml(a)}</button>`
            ).join('')}
          </div>
        </div>
      `;
    }

    html += `</div>`; // .meaning-block
  });

  html += `</div>`; // .meanings-list

  // ── Source URL ────────────────────────────────────────────────
  if (entry.sourceUrls && entry.sourceUrls.length) {
    html += `
      <div class="source-bar">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24"
             stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
        </svg>
        <span>Source:</span>
        <a href="${escapeHtml(entry.sourceUrls[0])}"
           target="_blank" rel="noopener">
          ${escapeHtml(entry.sourceUrls[0])}
        </a>
      </div>
    `;
  }

  // ── Inject into DOM ───────────────────────────────────────────
  result.innerHTML = html;

  // ── Attach event listeners to dynamically created elements ────

  // Audio button
  if (audioUrl) {
    document.getElementById('btn-audio')?.addEventListener('click', () => {
      playAudio(audioUrl);
    });
  }

  // Save button
  document.getElementById('btn-save')?.addEventListener('click', () => {
    toggleSaved(word);
  });

  // Synonym / Antonym tag buttons (search on click)
  result.querySelectorAll('.tag[data-word]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const w = btn.dataset.word;
      input.value = w;
      searchWord(w);
    });
  });
}

/* ── 8. Fetch / Search Word ───────────────────────────────────────── */

/**
 * Validate input, call the Free Dictionary API,
 * and either render results or show appropriate error messages.
 * @param {string} word
 */
async function searchWord(word) {
  const trimmed = word.trim().toLowerCase();

  // ── Input validation (before any network call) ────────────────
  if (!trimmed) {
    showError('Please enter a word to search.');
    return;
  }

  if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) {
    showError('Please enter a valid word (letters, hyphens, and apostrophes only).');
    return;
  }

  if (trimmed.length > 60) {
    showError('That query is too long. Please enter a shorter word.');
    return;
  }

  // ── Prepare UI ────────────────────────────────────────────────
  clearError();
  setLoading(true);
  result.innerHTML = '';

  // ── API call ──────────────────────────────────────────────────
  try {
    const apiUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(trimmed)}`;

    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10000), // 10-second timeout
    });

    // Handle HTTP error statuses
    if (response.status === 404) {
      showError(`"${trimmed}" was not found. Please check the spelling and try again.`);
      return;
    }

    if (!response.ok) {
      showError(`API error (${response.status}). Please try again later.`);
      return;
    }

    const data = await response.json();

    // Guard against unexpected empty responses
    if (!Array.isArray(data) || data.length === 0) {
      showError(`No results found for "${trimmed}".`);
      return;
    }

    // ── Render the result ──────────────────────────────────────
    renderResult(data);

    // Smooth-scroll to result on mobile
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      showError('The request timed out. Please check your connection and try again.');
    } else {
      showError('Network error. Please check your internet connection and try again.');
    }
  } finally {
    // Always re-enable the UI
    setLoading(false);
  }
}

/* ── 9. Form Event Listener ───────────────────────────────────────── */

/**
 * Listen for form submission.
 * preventDefault() stops the page reloading — core to the SPA pattern.
 */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  searchWord(input.value);
});

/* ── 10. Initialise ───────────────────────────────────────────────── */

// Render any previously saved words from localStorage
renderSaved();

// Load a default word so the page isn't empty on first visit
searchWord('serendipity');
input.value = ''; // Clear input after auto-search