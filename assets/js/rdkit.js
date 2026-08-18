(function () {
  'use strict';

  var DEFAULT_DELIMITER = ',';
  var DELIMITER_LABELS = {
    '\n': 'newline',
    '\t': 'tab',
    ',': 'comma',
    ';': 'semicolon'
  };
  var DELIMITER_CANDIDATES = ['\n', '\t', ',', ';'];
  var FP_RADIUS = 2;
  var DEFAULT_FP_NBITS = 1024;

  var formEl = document.getElementById('similarity-checker-form');
  var libraryEl = document.getElementById('similarity-library');
  var queryEl = document.getElementById('similarity-query');
  var topkEl = document.getElementById('similarity-topk');
  var fpSizeEl = document.getElementById('similarity-fp-size');
  var searchBtn = document.getElementById('similarity-search-btn');
  var statusEl = document.getElementById('similarity-status');
  var delimiterLabelEl = document.getElementById('similarity-delimiter-label');
  var resultsEl = document.getElementById('similarity-results');
  var resultsBodyEl = document.getElementById('similarity-results-body');

  if (!formEl || !libraryEl || !queryEl || !searchBtn || !statusEl) {
    return;
  }

  var RDKit = null;
  var libraryCache = {
    text: '',
    nBits: DEFAULT_FP_NBITS,
    delimiter: DEFAULT_DELIMITER,
    entries: []
  };

  function getFpNBits() {
    if (!fpSizeEl) {
      return DEFAULT_FP_NBITS;
    }
    return parseInt(fpSizeEl.value, 10) || DEFAULT_FP_NBITS;
  }

  function getFpOptions(nBits) {
    return JSON.stringify({ radius: FP_RADIUS, nBits: nBits });
  }

  function invalidateLibraryCache() {
    libraryCache.text = '';
    libraryCache.entries = [];
  }

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function popcount(byte) {
    var n = byte;
    n = n - ((n >> 1) & 0x55);
    n = (n & 0x33) + ((n >> 2) & 0x33);
    return ((n + (n >> 4)) & 0x0f);
  }

  function tanimoto(fpA, fpB) {
    var both = 0;
    var total = 0;
    for (var i = 0; i < fpA.length; i++) {
      both += popcount(fpA[i] & fpB[i]);
      total += popcount(fpA[i] | fpB[i]);
    }
    return total === 0 ? 0 : both / total;
  }

  function detectDelimiter(text) {
    if (!text || !text.trim()) {
      return DEFAULT_DELIMITER;
    }

    var bestDelimiter = DEFAULT_DELIMITER;
    var bestCount = -1;

    DELIMITER_CANDIDATES.forEach(function (delimiter) {
      var tokens = text.split(delimiter).map(function (token) {
        return token.trim();
      }).filter(function (token) {
        return token.length > 0;
      });
      if (tokens.length > bestCount) {
        bestCount = tokens.length;
        bestDelimiter = delimiter;
      }
    });

    return bestDelimiter;
  }

  function updateDelimiterLabel(delimiter) {
    if (!delimiterLabelEl) {
      return;
    }
    var label = DELIMITER_LABELS[delimiter] || 'comma';
    delimiterLabelEl.textContent = 'Delimiter: ' + label;
  }

  function splitLibrary(text, delimiter) {
    return text.split(delimiter).map(function (token) {
      return token.trim();
    }).filter(function (token) {
      return token.length > 0;
    });
  }

  function parseLibrary(text, nBits) {
    var delimiter = detectDelimiter(text);
    updateDelimiterLabel(delimiter);
    var tokens = splitLibrary(text, delimiter);
    var fpOptions = getFpOptions(nBits);
    var entries = [];
    var invalidCount = 0;

    tokens.forEach(function (smiles) {
      var mol = RDKit.get_mol(smiles);
      if (!mol) {
        invalidCount += 1;
        return;
      }
      var fp = mol.get_morgan_fp_as_uint8array(fpOptions);
      mol.delete();
      entries.push({
        smiles: smiles,
        fp: fp
      });
    });

    return {
      delimiter: delimiter,
      entries: entries,
      invalidCount: invalidCount
    };
  }

  function buildLibraryCache(text, nBits) {
    if (text === libraryCache.text && nBits === libraryCache.nBits) {
      return libraryCache;
    }

    var parsed = parseLibrary(text, nBits);
    libraryCache = {
      text: text,
      nBits: nBits,
      delimiter: parsed.delimiter,
      entries: parsed.entries,
      invalidCount: parsed.invalidCount
    };
    return libraryCache;
  }

  function renderResults(results) {
    resultsBodyEl.innerHTML = '';

    results.forEach(function (result, index) {
      var row = document.createElement('tr');

      var rankCell = document.createElement('td');
      rankCell.textContent = String(index + 1);
      row.appendChild(rankCell);

      var structureCell = document.createElement('td');
      structureCell.className = 'similarity-structure-cell';
      var mol = RDKit.get_mol(result.smiles);
      if (mol) {
        structureCell.innerHTML = mol.get_svg();
        mol.delete();
      }
      row.appendChild(structureCell);

      var smilesCell = document.createElement('td');
      smilesCell.className = 'similarity-smiles-cell';
      smilesCell.textContent = result.smiles;
      row.appendChild(smilesCell);

      var scoreCell = document.createElement('td');
      scoreCell.textContent = result.score.toFixed(3);
      row.appendChild(scoreCell);

      resultsBodyEl.appendChild(row);
    });

    resultsEl.hidden = results.length === 0;
  }

  function runSearch() {
    if (!RDKit) {
      setStatus('RDKit is still loading. Please wait…');
      return;
    }

    var libraryText = libraryEl.value;
    var querySmiles = queryEl.value.trim();
    var topK = parseInt(topkEl.value, 10);
    var nBits = getFpNBits();

    if (!libraryText.trim()) {
      setStatus('Paste a library of SMILES to search.');
      resultsEl.hidden = true;
      return;
    }

    if (!querySmiles) {
      setStatus('Enter a query SMILES.');
      resultsEl.hidden = true;
      return;
    }

    if (!topK || topK < 1) {
      setStatus('Top k must be at least 1.');
      resultsEl.hidden = true;
      return;
    }

    var queryMol = RDKit.get_mol(querySmiles);
    if (!queryMol) {
      setStatus('Invalid query SMILES.');
      resultsEl.hidden = true;
      return;
    }

    var queryFp = queryMol.get_morgan_fp_as_uint8array(getFpOptions(nBits));
    queryMol.delete();

    var cache = buildLibraryCache(libraryText, nBits);
    if (cache.entries.length === 0) {
      var skippedMsg = cache.invalidCount > 0
        ? 'No valid molecules found (' + cache.invalidCount + ' invalid SMILES skipped).'
        : 'No valid molecules found in library.';
      setStatus(skippedMsg);
      resultsEl.hidden = true;
      return;
    }

    var scored = cache.entries.map(function (entry) {
      return {
        smiles: entry.smiles,
        score: tanimoto(queryFp, entry.fp)
      };
    });

    scored.sort(function (a, b) {
      return b.score - a.score;
    });

    var results = scored.slice(0, topK);
    renderResults(results);

    var statusParts = [
      'Showing top ' + results.length + ' of ' + cache.entries.length + ' molecules (ECFP, ' + nBits + ' bits).'
    ];
    if (cache.invalidCount > 0) {
      statusParts.push(cache.invalidCount + ' invalid SMILES skipped.');
    }
    setStatus(statusParts.join(' '));
  }

  function onLibraryInput() {
    if (!RDKit) {
      return;
    }
    var delimiter = detectDelimiter(libraryEl.value);
    updateDelimiterLabel(delimiter);
    if (libraryEl.value !== libraryCache.text) {
      invalidateLibraryCache();
    }
  }

  function onFpSizeChange() {
    invalidateLibraryCache();
  }

  function initRDKit() {
    if (typeof window.initRDKitModule !== 'function') {
      setStatus('Failed to load RDKit.');
      return;
    }

    window.initRDKitModule()
      .then(function (module) {
        RDKit = module;
        searchBtn.disabled = false;
        setStatus('RDKit ready. Paste a library and query SMILES, then search.');
        onLibraryInput();
      })
      .catch(function () {
        setStatus('Failed to initialize RDKit.');
      });
  }

  formEl.addEventListener('submit', function (e) {
    e.preventDefault();
    runSearch();
  });

  libraryEl.addEventListener('input', onLibraryInput);

  if (fpSizeEl) {
    fpSizeEl.addEventListener('change', onFpSizeChange);
  }

  initRDKit();
})();
