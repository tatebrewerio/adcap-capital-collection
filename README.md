# AdCap Capital Collection

A fan-made, 1 to 1 recreation of the **Career screen** from AdVenture Capitalist (version 9.28), where you can try on every hat, jacket, pair of pants and badge in the game and see how your capitalist looks.

Open the page, pick items from the Inventory tab, hit **Equip** and switch to the Swag tab to see the outfit on the male or female capitalist in front of the Earth swag scene.

## Features

- **All 344 items:** 68 hats, 66 jackets, 66 pants, 127 badges and 17 trophies, with their real names, rarities, stars and descriptions.
- **Male and female capitalists** with every outfit layer, placed exactly as the game places them.
- **Inventory filters:** Viewing (All, Hats, Jackets, Pants, Badges, Trophies), Planets and Sort, using the game's own dropdowns.
- **Item details popup** with Equip and Unequip, set progress and set bonus.
- **Swag tab:** 3 outfit slots and 3 badge slots. Tapping an empty slot jumps to that category in the inventory.
- **Shareable outfits:** your outfit is saved in the page address, so copying the link shares the exact look. It is also remembered in your browser.
- **Works on phones and desktops:** touch drag, mouse wheel and Escape to close popups.

## How it is built

Nothing here is a hand-drawn imitation. The screen is rebuilt from the game's own files:

- **UI layouts** are the original Unity prefabs (CareerScreen, EquipmentItemView, EquipmentItemDetailsPopup and others) exported to JSON in `data/ui/`.
- **`js/engine.js`** is a small Unity UI renderer for the browser. It reproduces RectTransform anchoring, Horizontal, Vertical, Grid and Flow layout groups, LayoutElement, ContentSizeFitter, sliced and filled images, masks, the game's PhotoshopUIOverlay and ReplaceColorUI shaders, theme colour binders and TextMeshPro text drawn from the game's signed distance field font atlases.
- **`js/app.js`** binds the item data to those prefabs and handles equipping, filters, popups and scrolling.
- **Item data** (`data/items.json`) comes from the game's equipment config, item manifests and English localisation.

## Run it locally

The page loads its data with `fetch`, so it needs a local web server rather than opening `index.html` directly:

```
python -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Publish with GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick your main branch and the `/ (root)` folder, then save.
4. After a minute the site is live at `https://<your-username>.github.io/adcap-capital-collection/`.

The `.nojekyll` file makes GitHub serve every file as is.

## Rebuilding the data (optional)

`tools/` has the Python scripts that produced `data/` and `img/` from an extracted copy of the game (UnityPy is required):

- `build_data.py` exports the prefabs, UI sprites, item icons, item data and text.
- `export_characters.py` exports the 400 x 550 male and female outfit layers from the equipment bundles.

They expect the extracted game files at the paths written at the top of each script, so edit those first.

`test/shot.js` is a Playwright script that loads the site and saves screenshots, useful for checking changes.

## Credits

AdVenture Capitalist, its artwork, fonts, item data and text belong to **Hyper Hippo Entertainment** and are used with their permission. This project is not affiliated with or endorsed by Hyper Hippo. The code is MIT licensed (see `LICENSE`).
