-- Vayu — count what people search for, instead of logging each search.
--
-- `searches` was an event log: one row per search, trimmed to the newest 500
-- on every write. Three things followed from that, and all three showed up
-- in the panel:
--
--   * The "nothing found for" counts only reached back 500 events. A term
--     nobody stocks, searched forty times last month, was already gone. That
--     card exists to say what to buy next, and it was answering from a
--     window measured in days.
--   * The recent list was mostly the same term over and over, because every
--     repeat was another row.
--   * "Brass" and "brass" were different searches, except in the zero-result
--     query, which lowercased in its GROUP BY and so disagreed with the list
--     printed directly above it.
--
-- One row per normalised term fixes all three and makes the write cheaper:
-- an UPSERT rather than an insert plus a delete-scan on every keystroke
-- pause. The counts now run from the first day the term was ever typed.
--
-- What is given up: the individual events, their timestamps and the sid that
-- went with them — so "which visitor searched this" is no longer answerable.
-- Nothing read that. `sid` was selected by the panel's query and never
-- rendered, and it is the only field here that was ever personal.
CREATE TABLE search_terms (
  q          TEXT PRIMARY KEY,             -- lowercased, whitespace collapsed
  searches   INTEGER NOT NULL DEFAULT 0,   -- times typed, since first_seen
  zero_hits  INTEGER NOT NULL DEFAULT 0,   -- times it found nothing
  results    INTEGER NOT NULL DEFAULT 0,   -- what it found most recently
  first_seen TEXT NOT NULL,
  last_seen  TEXT NOT NULL
);

CREATE INDEX idx_search_terms_count ON search_terms(searches DESC);
CREATE INDEX idx_search_terms_zero  ON search_terms(zero_hits DESC);
CREATE INDEX idx_search_terms_seen  ON search_terms(last_seen DESC);

-- Fold the surviving events in rather than starting empty: whatever is left
-- of the last 500 searches is the only history there is, and throwing it
-- away would leave the card blank on the day this ships.
--
-- `results` is taken from the most recent event for the term, not from an
-- aggregate: a bare column beside both MIN(t) and MAX(t) is undefined in
-- SQLite, and "what it found last time" is the only reading that means
-- anything anyway.
INSERT INTO search_terms (q, searches, zero_hits, results, first_seen, last_seen)
SELECT g.k,
       g.cnt,
       g.zero,
       COALESCE((SELECT s.results FROM searches s
                  WHERE lower(trim(s.q)) = g.k
                  ORDER BY s.t DESC, s.id DESC LIMIT 1), 0),
       g.first_t,
       g.last_t
  FROM (SELECT lower(trim(q)) AS k,
               COUNT(*) AS cnt,
               SUM(CASE WHEN results = 0 THEN 1 ELSE 0 END) AS zero,
               MIN(t) AS first_t,
               MAX(t) AS last_t
          FROM searches
         WHERE trim(q) <> ''
         GROUP BY lower(trim(q))) AS g;

DROP TABLE searches;
