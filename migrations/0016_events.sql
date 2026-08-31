-- Vayu — the programme: what is on, what has been on, and the pictures of it.
--
-- Both houses run shows — Gallery Vayu exhibits, Design for Living runs
-- seasons — and until now each was a hardcoded block of markup in its own
-- page plus one entry in app/lib/data/events.js. Two consequences, and the
-- shop felt both:
--
--   * A new show meant a code change and a deploy. The dates printed on the
--     venue page, the dates in events.js and the dates printed onto the
--     poster image were three separate copies, and they had already drifted
--     once (the gallery page said 10 August while the poster said the 23rd).
--   * A show that ended simply disappeared. There was nowhere for it to go:
--     no past list, no page of its own, and the photographs of it went with
--     it. A gallery that keeps no record of what it has shown is throwing
--     away the most interesting thing it has.
--
-- So an event is a row, it has a page of its own at /pages/event.html?id=,
-- and `current` decides whether it is the show the venue page leads with or
-- one of the past ones listed underneath.
--
-- `images` and `curated` are JSON: read whole, written whole, never queried
-- inside — the same reasoning as journal.body and carts.items before them.
-- `images` is the plates, in the order they hang: [{img, alt, name, tag}].
-- `curated` names products rather than indexing them, exactly as events.js
-- did, because [cat, idx] points at a different piece the moment a category
-- is reordered: [{cat, name}].
CREATE TABLE events (
  id         TEXT PRIMARY KEY,             -- slug, also the ?id= on its page
  venue      TEXT NOT NULL,                -- 'gallery-vayu' | 'design-for-living'
  title      TEXT NOT NULL,
  dates      TEXT NOT NULL DEFAULT '',     -- as printed: "On view till 23 August 2026"
  note       TEXT NOT NULL DEFAULT '',     -- one line, for the menu card
  statement  TEXT NOT NULL DEFAULT '',     -- the italic paragraph on the page
  image      TEXT NOT NULL DEFAULT '',     -- hero plate, cropped 16:9
  alt        TEXT NOT NULL DEFAULT '',
  cta        TEXT NOT NULL DEFAULT '',     -- "Enter the exhibition"
  sec_note   TEXT NOT NULL DEFAULT '',     -- "Three rooms"
  images     TEXT NOT NULL DEFAULT '[]',
  curated    TEXT NOT NULL DEFAULT '[]',
  current    INTEGER NOT NULL DEFAULT 0,   -- at most one per venue
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_events_venue ON events(venue, current DESC, sort_order);

-- The two shows the site already carries, so the pages look the same the
-- minute this lands. Plates and statements are the ones written into
-- gallery.html and design-for-living.html; the curated lists are the ones
-- from events.js. Everything here is editable in the panel afterwards.
INSERT INTO events (id, venue, title, dates, note, statement, image, alt, cta, sec_note, images, curated, current, sort_order, updated_at)
VALUES
  ('personal-heirlooms', 'gallery-vayu', 'Personal Heirlooms',
   'On view till 23 August 2026',
   'Sarees from the collection of Malvika Singh, shown across three rooms.',
   'A room of quiet objects — brass, clay, cane and handwoven cloth — gathered from the makers we have kept company with for a decade.',
   '/assets/images/gallery_hero.jpg', 'Personal Heirlooms', 'Enter the exhibition', 'Three rooms',
   '[{"img":"/assets/images/gallery_tile1.png","alt":"Exhibition room — bedroom setting","name":"The Quiet Room","tag":"Room 01"},{"img":"/assets/images/gallery_tile2.png","alt":"Exhibition room — long table","name":"The Long Table","tag":"Room 02"},{"img":"/assets/images/gallery_tile3.png","alt":"Exhibition room — clay wall","name":"The Clay Wall","tag":"Room 03"}]',
   '[{"cat":"materials","name":"Block-Print Textile Panel"},{"cat":"fashion","name":"Handwoven Wool Shawl"},{"cat":"decor","name":"Framed Miniature Art"}]',
   1, 0, '2026-08-30T00:00:00.000Z'),

  ('summer-cut', 'design-for-living', 'Summer Cut',
   'From 21 May 2026',
   'A season of lighter cloth — linen, cotton and khadi, cut for the heat.',
   'Lighter cloth for the months that ask for it — linen, cotton and khadi, cut close to the body and left to move.',
   '/assets/images/summer_cut.png', 'Summer Cut', 'See the season', 'The season',
   '[]',
   '[{"cat":"fashion","name":"Sanganer Silk Stole"},{"cat":"fashion","name":"Grey Patterned Linen Shirt"},{"cat":"fashion","name":"Heritage Linen Kurta"}]',
   1, 0, '2026-08-30T00:00:00.000Z');
