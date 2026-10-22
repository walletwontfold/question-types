/**
 * Question Types Knowledge Store
 * Shared by Auditor and Solver via GM storage key + embedded seed.
 * Trust states: unknown | candidate | tested | validated | deprecated
 * Only validated (or tested with explicit opt-in) procedures drive auto interaction.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CinderQuestionTypes = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'cinder_qt_knowledge_v1';
  const SCHEMA_VERSION = '1.0.0';

  const TRUST_RANK = {
    unknown: 0,
    candidate: 1,
    tested: 2,
    validated: 3,
    deprecated: -1
  };

  // Minimal seed if registry.json not loaded (userscript embeds via CFG or GM)
  const EMBEDDED_SEED = {
    schemaVersion: SCHEMA_VERSION,
    knowledgeVersion: '1.0.0',
    updatedAt: null,
    types: []
  };

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function loadFromGM(gmGet) {
    try {
      const raw = gmGet ? gmGet(STORAGE_KEY, null) : null;
      if (!raw) return null;
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!obj || !Array.isArray(obj.types)) return null;
      return obj;
    } catch (_) {
      return null;
    }
  }

  function saveToGM(store, gmSet) {
    if (!gmSet) return false;
    try {
      store.updatedAt = new Date().toISOString();
      gmSet(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (_) {
      return false;
    }
  }

  function createStore(seed, gmGet, gmSet) {
    let data = loadFromGM(gmGet) || clone(seed || EMBEDDED_SEED);
    if (!data.types) data.types = [];

    function byId(id) {
      return data.types.find(t => t.id === id) || null;
    }

    function list(filterTrust) {
      if (!filterTrust) return data.types.slice();
      const min = TRUST_RANK[filterTrust] ?? 0;
      return data.types.filter(t => (TRUST_RANK[t.trust] ?? 0) >= min && t.trust !== 'deprecated');
    }

    function upsert(record) {
      if (!record || !record.id) throw new Error('record.id required');
      const i = data.types.findIndex(t => t.id === record.id);
      const next = { ...record, version: record.version || '1.0.0' };
      if (i >= 0) data.types[i] = { ...data.types[i], ...next };
      else data.types.push(next);
      saveToGM(data, gmSet);
      return byId(record.id);
    }

    function setTrust(id, trust, evidence) {
      const rec = byId(id);
      if (!rec) return null;
      rec.trust = trust;
      if (evidence) {
        rec.testResults = rec.testResults || [];
        rec.testResults.push({ ...evidence, at: new Date().toISOString() });
      }
      if (trust === 'validated') rec.lastValidated = new Date().toISOString();
      saveToGM(data, gmSet);
      return rec;
    }

    function isAutoEligible(id) {
      const rec = byId(id);
      if (!rec) return false;
      return rec.trust === 'validated'; // tested requires explicit opt-in CFG.allowTestedProcedures
    }

    function matchDetection(root, qText) {
      // Return best matching type id by selector hits inside root
      if (!root) return 'unknown';
      const text = (qText || '').toLowerCase();
      let best = null;
      let bestScore = 0;
      for (const t of data.types) {
        if (t.id === 'unknown' || t.trust === 'deprecated') continue;
        const det = t.detection || {};
        // negativeSelectors: any hit disqualifies
        let neg = false;
        for (const sel of det.negativeSelectors || []) {
          try { if (root.querySelector(sel)) { neg = true; break; } } catch (_) {}
        }
        if (neg) continue;
        let score = 0;
        let matchCount = 0;
        const sels = det.selectors || [];
        for (const sel of sels) {
          try {
            const nodes = root.querySelectorAll(sel);
            if (nodes && nodes.length) {
              score += 2;
              matchCount += nodes.length;
            }
          } catch (_) {}
        }
        const minM = det.minMatches != null ? det.minMatches : 1;
        if (sels.length && matchCount < minM) continue;
        for (const hint of det.textHints || []) {
          try {
            if (new RegExp(hint, 'i').test(text)) score += 1;
          } catch (_) {}
        }
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      if (!best || bestScore < 1) return 'unknown';
      return best.id;
    }

    function getProcedure(id) {
      const rec = byId(id);
      if (!rec) return null;
      return {
        id: rec.id,
        trust: rec.trust,
        eligible: isAutoEligible(id),
        interaction: rec.interaction || {},
        completionCheck: rec.completionCheck || {},
        submission: rec.submission || {},
        recovery: rec.recovery || {},
        confidence: rec.confidence || 0
      };
    }

    function exportJSON() {
      return clone(data);
    }

    function importMerge(incoming) {
      if (!incoming || !Array.isArray(incoming.types)) return false;
      for (const t of incoming.types) {
        if (!t.id) continue;
        const existing = byId(t.id);
        if (!existing) {
          data.types.push(clone(t));
        } else {
          // Prefer higher trust; keep local testResults
          const rankIn = TRUST_RANK[t.trust] ?? 0;
          const rankEx = TRUST_RANK[existing.trust] ?? 0;
          if (rankIn > rankEx) {
            data.types[data.types.findIndex(x => x.id === t.id)] = {
              ...existing,
              ...t,
              testResults: (existing.testResults || []).concat(t.testResults || [])
            };
          }
        }
      }
      saveToGM(data, gmSet);
      return true;
    }

    return {
      STORAGE_KEY,
      SCHEMA_VERSION,
      byId,
      list,
      upsert,
      setTrust,
      isAutoEligible,
      matchDetection,
      getProcedure,
      exportJSON,
      importMerge,
      raw: () => data
    };
  }

  return {
    createStore,
    TRUST_RANK,
    STORAGE_KEY,
    SCHEMA_VERSION
  };
});
