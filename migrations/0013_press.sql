-- Vayu — press coverage, editable from the admin panel.
--
-- The journal is gone: its two pages were removed and its admin screen with
-- them. What the site still says about itself in that voice is what other
-- people wrote, and that lived only in the PRESS array in
-- app/lib/data/journal-data.js — a source file, so adding a piece of
-- coverage meant a code change and a deploy. This is the same shape in the
-- database, so the Press screen can add one in a minute.
--
-- The columns mirror that array exactly, which is what lets the static list
-- stay as the fallback: /pages/press.html renders rows from here when there
-- are any and the shipped array when there are none, so an empty table looks
-- like today's page rather than an empty one.
--
-- `verified` is not decoration. It records whether the article was read at
-- source; an entry with verified = 0 renders bare — publication, Vayu's own
-- one line and the link — so the page never prints a headline, byline, date
-- or quotation that nobody checked.
--
-- `quote` must be the publication's own words, never Vayu's description of
-- the piece: it is rendered inside quotation marks. `snippet` is Vayu's line
-- about it and is never quoted.
--
-- The journal table is deliberately left in place. Nothing reads it any
-- more, but dropping it would throw away stories that were written, and a
-- DROP cannot be undone by editing a file.
CREATE TABLE press (
  id                TEXT PRIMARY KEY,
  featured          INTEGER NOT NULL DEFAULT 0,
  verified          INTEGER NOT NULL DEFAULT 0,
  source            TEXT NOT NULL,
  headline          TEXT NOT NULL DEFAULT '',
  byline            TEXT NOT NULL DEFAULT '',
  date              TEXT NOT NULL DEFAULT '',
  quote             TEXT NOT NULL DEFAULT '',
  quote_attribution TEXT NOT NULL DEFAULT '',
  snippet           TEXT NOT NULL DEFAULT '',
  image             TEXT NOT NULL DEFAULT '',
  alt               TEXT NOT NULL DEFAULT '',
  url               TEXT NOT NULL DEFAULT '',
  sort_order        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_press_order ON press(sort_order);
