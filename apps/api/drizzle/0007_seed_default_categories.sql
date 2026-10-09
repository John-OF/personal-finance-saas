-- Hand-written. The default categories (DEFAULT_CATEGORIES in @pf/shared, as of this migration) for
-- the profiles that already exist; new profiles get them when they are created (profiles/repo.ts).
INSERT INTO "categories" ("user_id", "kind", "name")
SELECT "profiles"."id", defaults.kind, defaults.name
FROM "profiles"
CROSS JOIN (
  VALUES
    ('expense', 'Comida'),
    ('expense', 'Transporte'),
    ('expense', 'Vivienda'),
    ('expense', 'Servicios'),
    ('expense', 'Salud'),
    ('expense', 'Educación'),
    ('expense', 'Ocio'),
    ('expense', 'Otros'),
    ('income', 'Sueldo'),
    ('income', 'Ventas'),
    ('income', 'Comisiones'),
    ('income', 'Otros')
) AS defaults (kind, name)
ON CONFLICT DO NOTHING;
