-- The Charles R. Drew/UCLA Medical Education Program shut down in 2026. Retire it (history and members' lists keep
-- their rows; every public read already skips an inactive school). Charles R. Drew University is its own entry.
UPDATE med_school SET active = false WHERE slug = 'charles-r-drew-ucla';
