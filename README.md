# Kornomart

The Kornomart storefront: rice in 25 kg and 50 kg sacks. A static site served by GitHub Pages.

| File | What it is |
|---|---|
| `index.html`, `css/site.css`, `js/app.js` | The site |
| `data/catalogue.json` | The price list. The page holds no prices of its own |

## Changing a price

Edit `data/catalogue.json`: change the `price` of the right `kg` pack and set `updated_at` to the time of the change. Open pages pick up the new price within a few minutes.

## Not connected yet

- **Orders** are not sent anywhere. `SETTINGS.orderEndpoint` in `js/app.js` is empty, so the order form shows a memo and says the order was not sent. The future order server must price each line from its own price table, then write the row to Google Sheets.
- **Price app.** Point `SETTINGS.catalogueUrl` at the app's price API and keep the same record shape as `data/catalogue.json`.
- **Shop phone and address** go in `SETTINGS.shop` in `js/app.js`.
