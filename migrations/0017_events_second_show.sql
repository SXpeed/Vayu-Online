-- Vayu — a second show at each house, so both pages have a Previously.
--
-- 0016 seeded the two shows the site already carried, one per venue, and
-- both are current. That left the "Previously" section on each venue page
-- correct but invisible, and the whole point of putting the programme in the
-- database was that a finished show keeps its page instead of vanishing.
-- These are the two most recent closed shows, one per house.
--
-- The copy here is a starting point, not a record: the dates, statements and
-- captions are written in the site's voice against photographs the site
-- already ships, and every field is editable in the panel under What's On.
-- Correct them there rather than by another migration.
--
-- `current` is 0 on both — each house keeps the show 0016 marked as on — and
-- sort_order is 1 so they fall in behind it in every listing.
INSERT INTO events (id, venue, title, dates, note, statement, image, alt, cta, sec_note, images, curated, current, sort_order, updated_at)
VALUES
  ('hand-and-wheel', 'gallery-vayu', 'Hand & Wheel',
   'Shown 14 February — 30 March 2026',
   'A season of clay: thrown, pinched and fired by six potters working in three states.',
   'Six potters, three states, one material. Everything here was thrown or pinched by hand — the marks of both are left where they fell, because a pot that hides them could have been made by anyone.',
   '/assets/images/journal_ceramics.png', 'A potter shaping a vessel at the wheel',
   'See the show', 'Three rooms',
   '[{"img":"/assets/images/journal_ceramics.png","alt":"A potter shaping a vessel at the wheel","name":"At the Wheel","tag":"Room 01"},{"img":"/assets/images/prod_terracotta_vase.png","alt":"Terracotta vessels on a plinth","name":"The Standing Vessels","tag":"Room 02"},{"img":"/assets/images/prod_ceramic_plate_set.png","alt":"Stacked ceramic plates","name":"The Table","tag":"Room 03"}]',
   '[{"cat":"decor","name":"Terracotta Ritual Vase"},{"cat":"home","name":"Ceramic Dinner Plate Set"},{"cat":"materials","name":"Hand-Beaten Brass Bowl"}]',
   0, 1, '2026-03-30T00:00:00.000Z'),

  ('the-wool-months', 'design-for-living', 'The Wool Months',
   'Shown 5 December 2025 — 28 February 2026',
   'Winter cloth from the hill looms — wool, pashmina and heavy cotton, woven to be kept.',
   'Cloth for the cold months, off the hill looms of Kullu and Kinnaur. Wool takes dye slowly and holds it for years, which is why these pieces are bought once and worn for a decade.',
   '/assets/images/journal_weaving.png', 'Handloom weaving in progress',
   'See the season', 'The season',
   '[{"img":"/assets/images/journal_weaving.png","alt":"Handloom weaving in progress","name":"On the Loom","tag":"Kullu"},{"img":"/assets/images/prod_wool_shawl.png","alt":"A folded handwoven wool shawl","name":"The Shawl","tag":"Pashmina"},{"img":"/assets/images/cat_textiles.jpg","alt":"Stacked handwoven textiles","name":"The Pile","tag":"Winter cloth"}]',
   '[{"cat":"fashion","name":"Handwoven Wool Shawl"},{"cat":"fashion","name":"Indigo Striped Kimono Jacket"},{"cat":"materials","name":"Block-Print Textile Panel"}]',
   0, 1, '2026-02-28T00:00:00.000Z');
