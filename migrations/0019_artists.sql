-- Vayu — the artists, and the pieces each of them made.
--
-- The shop shows work by people it names. Until now those people were
-- markup: /pages/artist.html carried a hand-written card for each one, and
-- the only artist with a page of their own — Jenjum Gadi — had his name,
-- his story and his picture written into /pages/jenjum.html, with the four
-- products of his capsule addressed as [category, index] pairs in
-- app/lib/pages/jenjum.js.
--
-- Three things followed from that, and they are the reason for this table:
--
--   * Adding an artist meant a code change, a new page file and a deploy.
--   * The index card and the artist's own page repeated the same name and
--     the same photograph, so the two could disagree — and a card for an
--     artist with no page still animated under the cursor as though it led
--     somewhere.
--   * The capsule was addressed by position. [fashion, 0] is whatever piece
--     happens to sit first in that category today; reorder the catalogue and
--     the artist's own collection quietly becomes someone else's work. The
--     events table already learned this and names its products instead,
--     which is what `curated` does here: [{cat, name}].
--
-- `story` is the artist's page copy, one paragraph per blank line, kept as
-- text rather than a JSON list — it is read whole, written whole and never
-- queried into, and a shop typing into a textarea should not have to think
-- about a list.
--
-- `listed` decides whether the artist has a page at all. An artist the shop
-- has only a photograph and two lines about belongs on the index; giving
-- them a page would be a room with nothing in it, and the card would
-- promise a click that leads nowhere.
CREATE TABLE artists (
  id         TEXT PRIMARY KEY,             -- slug, also the ?id= on their page
  name       TEXT NOT NULL,
  tag        TEXT NOT NULL DEFAULT '',     -- "Artist in Residence"
  place      TEXT NOT NULL DEFAULT '',     -- "Tirbin, Arunachal Pradesh"
  bio        TEXT NOT NULL DEFAULT '',     -- the paragraph on the index card
  portrait   TEXT NOT NULL DEFAULT '',     -- the index card's picture, 4:5
  hero       TEXT NOT NULL DEFAULT '',     -- the wide picture on their page, 21:9
  hero_alt   TEXT NOT NULL DEFAULT '',
  story      TEXT NOT NULL DEFAULT '',     -- their page's copy, blank line = paragraph
  curated    TEXT NOT NULL DEFAULT '[]',   -- [{cat, name}] — the capsule, named not indexed
  listed     INTEGER NOT NULL DEFAULT 1,   -- 0 = a card on the index, no page
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_artists_order ON artists(sort_order);

-- The one artist the site already carries, word for word from the two pages
-- he was written into, so nothing changes the minute this lands. The capsule
-- is the four [cat, idx] pairs from jenjum.js resolved to the names those
-- positions held: Sanganer Silk Stole and Heritage Linen Kurta from fashion,
-- the Sheesham Wood Console and the Framed Miniature Art. Everything here is
-- editable in the panel afterwards.
INSERT INTO artists (id, name, tag, place, bio, portrait, hero, hero_alt, story, curated, listed, sort_order, updated_at)
VALUES (
  'jenjum-gadi',
  'Jenjum Gadi',
  'Artist in Residence',
  'Tirbin, Arunachal Pradesh',
  'Working in brass from his New Delhi studio, Jenjum Gadi turns everyday forms into vessels for storytelling.',
  '/assets/images/jenjum_gadi.png',
  '/assets/images/jenjum_gadi.png',
  'Jenjum Gadi — Artist & Designer',
  'Born in Tirbin, a remote village in Arunachal Pradesh, Jenjum Gadi is an artist whose practice is rooted in memory, craft, and materiality. Drawing from personal histories, cultural traditions, and the natural world, he transforms everyday forms into vessels for storytelling.

Working primarily in brass, a material deeply embedded in India''s ritual and domestic traditions, he creates sculptural works that reflect on his memories and cultural inheritance.

Following his debut at Bikaner House with his solo exhibition, Gadi''s works have also been presented at Jodhpur Art Week and Art Mumbai.',
  '[{"cat":"fashion","name":"Sanganer Silk Stole"},{"cat":"fashion","name":"Heritage Linen Kurta"},{"cat":"furniture","name":"Sheesham Wood Console"},{"cat":"decor","name":"Framed Miniature Art"}]',
  1, 0, '2026-08-31T00:00:00.000Z'
);
