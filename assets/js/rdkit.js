(function () {
  'use strict';

  var DEFAULT_DELIMITER = ',';
  var DELIMITER_LABELS = {
    '\n': 'newline',
    '\t': 'tab',
    ',': 'comma',
    ';': 'semicolon'
  };
  var DELIMITER_MAP = {
    ',': ',',
    newline: '\n',
    tab: '\t',
    semicolon: ';'
  };
  var DELIMITER_CANDIDATES = ['\n', '\t', ',', ';'];
  var DELIMITER_CHOICES_TEXT = 'Choose from comma, newline, tab, and semicolon.';
  var FP_RADIUS = 2;
  var DEFAULT_FP_NBITS = 1024;

  var formEl = document.getElementById('similarity-checker-form');
  var libraryEl = document.getElementById('similarity-library');
  var queryEl = document.getElementById('similarity-query');
  var topkEl = document.getElementById('similarity-topk');
  var fpSizeEl = document.getElementById('similarity-fp-size');
  var delimiterEl = document.getElementById('similarity-delimiter');
  var searchBtn = document.getElementById('similarity-search-btn');
  var statusEl = document.getElementById('similarity-status');
  var delimiterHintEl = document.getElementById('similarity-delimiter-hint');
  var resultsEl = document.getElementById('similarity-results');
  var resultsBodyEl = document.getElementById('similarity-results-body');

  if (!formEl || !libraryEl || !queryEl || !searchBtn || !statusEl) {
    return;
  }

  var RDKit = null;
  var libraryCache = {
    text: '',
    nBits: DEFAULT_FP_NBITS,
    delimiterKey: 'auto',
    delimiter: DEFAULT_DELIMITER,
    entries: []
  };

  function getDelimiterKey() {
    return delimiterEl ? delimiterEl.value : 'auto';
  }

  function isAutoDelimiter() {
    return getDelimiterKey() === 'auto';
  }

  function resolveDelimiter(text) {
    var key = getDelimiterKey();
    if (key === 'auto') {
      return detectDelimiter(text);
    }
    return DELIMITER_MAP[key] || DEFAULT_DELIMITER;
  }

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

  function computeSimilarities(fpA, fpB) {
    var both = 0;
    var countA = 0;
    var countB = 0;
    var union = 0;

    for (var i = 0; i < fpA.length; i++) {
      both += popcount(fpA[i] & fpB[i]);
      countA += popcount(fpA[i]);
      countB += popcount(fpB[i]);
      union += popcount(fpA[i] | fpB[i]);
    }

    return {
      tanimoto: union === 0 ? 0 : both / union,
      dice: (countA + countB) === 0 ? 0 : (2 * both) / (countA + countB)
    };
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

  function updateDelimiterHint(delimiter) {
    if (!delimiterHintEl) {
      return;
    }
    if (!isAutoDelimiter()) {
      delimiterHintEl.hidden = true;
      delimiterHintEl.textContent = '';
      return;
    }
    var label = DELIMITER_LABELS[delimiter] || 'comma';
    delimiterHintEl.innerHTML =
      '<span class="similarity-delimiter-hint-main">Detected delimiter: ' +
      '<span class="similarity-delimiter-hint-value">' + label + '</span></span>' +
      '<span class="similarity-delimiter-hint-sub">' + DELIMITER_CHOICES_TEXT + '</span>';
    delimiterHintEl.hidden = false;
  }

  function splitLibrary(text, delimiter) {
    return text.split(delimiter).map(function (token) {
      return token.trim();
    }).filter(function (token) {
      return token.length > 0;
    });
  }

  function parseLibrary(text, nBits, delimiter) {
    updateDelimiterHint(delimiter);
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

  function buildLibraryCache(text, nBits, delimiterKey) {
    if (
      text === libraryCache.text &&
      nBits === libraryCache.nBits &&
      delimiterKey === libraryCache.delimiterKey
    ) {
      return libraryCache;
    }

    var delimiter = resolveDelimiter(text);
    var parsed = parseLibrary(text, nBits, delimiter);
    libraryCache = {
      text: text,
      nBits: nBits,
      delimiterKey: delimiterKey,
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

      var tanimotoCell = document.createElement('td');
      tanimotoCell.textContent = result.tanimoto.toFixed(3);
      row.appendChild(tanimotoCell);

      var diceCell = document.createElement('td');
      diceCell.textContent = result.dice.toFixed(3);
      row.appendChild(diceCell);

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
    var delimiterKey = getDelimiterKey();

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

    var cache = buildLibraryCache(libraryText, nBits, delimiterKey);
    if (cache.entries.length === 0) {
      var skippedMsg = cache.invalidCount > 0
        ? 'No valid molecules found (' + cache.invalidCount + ' invalid SMILES skipped).'
        : 'No valid molecules found in library.';
      setStatus(skippedMsg);
      resultsEl.hidden = true;
      return;
    }

    var scored = cache.entries.map(function (entry) {
      var similarities = computeSimilarities(queryFp, entry.fp);
      return {
        smiles: entry.smiles,
        tanimoto: similarities.tanimoto,
        dice: similarities.dice
      };
    });

    scored.sort(function (a, b) {
      return b.tanimoto - a.tanimoto;
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
    if (isAutoDelimiter()) {
      updateDelimiterHint(resolveDelimiter(libraryEl.value));
    }
    if (
      libraryEl.value !== libraryCache.text ||
      getDelimiterKey() !== libraryCache.delimiterKey
    ) {
      invalidateLibraryCache();
    }
  }

  function onFpSizeChange() {
    invalidateLibraryCache();
  }

  function onDelimiterChange() {
    if (isAutoDelimiter()) {
      updateDelimiterHint(resolveDelimiter(libraryEl.value));
    } else if (delimiterHintEl) {
      delimiterHintEl.hidden = true;
      delimiterHintEl.textContent = '';
    }
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

  if (delimiterEl) {
    delimiterEl.addEventListener('change', onDelimiterChange);
  }

  initRDKit();
})();
