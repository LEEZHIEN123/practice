/**
 * DEPRECATED: Do not overwrite recipe images with curated Unsplash matches.
 * Food library images must come from RECEPI.csv `img_src`.
 *
 * Use instead:
 *   python scripts/sync_recipe_images_from_csv.py
 */
console.error(
  "fix_food_images.mjs is disabled. Run: python scripts/sync_recipe_images_from_csv.py"
);
process.exit(1);
