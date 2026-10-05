# Memorize

A small spaced-repetition app, in the spirit of Anki: questions you answer easily come
back less and less often, the ones you miss come back soon. It is a PWA: install it on a
phone or a desktop, and it works offline. Everything stays in your browser.

## Collections are plain text files

```
#lang: fr : es
bonjour : hola
merci : gracias
beau / joli : bonito
```

- One pair per line, `left : right`. The line is split on the first `:`, so the right
  side may contain colons (`lunch : 12:30`). Write `\:` for a colon on the left side.
- Blank lines and lines starting with `#` are ignored.
- The optional `#lang: <left> : <right>` header gives the language of each side
  (codes such as `fr`, `en`, `es`, `de`, `zh-Hant`). In typed-answer mode, the answer box
  is tagged with the expected language.
- In typed mode, an answer listing alternatives with `,` `;` `/` or `|` accepts any of
  them (`kiss, smell`), and text in parentheses is optional (`back (dos)` accepts `back`).
  Cards asking the same question accept each other's answers (`Wartawan : reporter` and
  `Jurnalis : reporter`).

To update a collection, edit the file and use **Update from file** on the collection
page: unchanged and edited lines keep their progress, new lines are added, lines that
are gone are removed. **Export as text** gives the file back.

## Studying

- Questions can go left → right, right → left, or both ways (per collection). Each
  direction has its own schedule.
- Two answer modes, switchable at any time: flip the card and grade yourself, or type
  the answer and let the app check it (case, accents and punctuation don't count; a small
  typo counts as "almost"). In both modes, you can override the suggested grade.
- Scheduling uses [FSRS](https://github.com/open-spaced-repetition/ts-fsrs), the
  algorithm behind Anki's current scheduler. Grades: Again / Hard / Good / Easy. Each
  button shows when the card will come back.
- Desktop shortcuts: <kbd>Space</kbd> shows the answer, <kbd>1</kbd>–<kbd>4</kbd> grade.

Progress lives in the browser's IndexedDB. To save it or move it to another device:

- **Export with progress**, on a collection page, saves that collection. Choosing that file
  in **New collection** (or **Settings → Restore backup**) adds it back without touching the
  other collections, after asking before replacing one with the same name.
- **Settings → Export backup** saves everything; restoring it replaces all data.

### About the phone keyboard

No web API lets a page switch the phone keyboard to another language. The answer box
carries a `lang` attribute, which some keyboards use as a hint. Gboard and the iOS
keyboard mostly ignore it, so a badge next to the box (⌨ ES) reminds you which keyboard to
pick with the globe key.

## Development

```sh
npm install
npm run dev        # http://localhost:5173/memorize/
npm test           # unit tests (vitest)
npm run build      # typecheck + production build in dist/
npm run preview    # serve dist/, service worker included
```

Stack: Vite, React, TypeScript, [vite-plugin-pwa](https://vite-pwa-org.netlify.app/),
[Dexie](https://dexie.org/) (IndexedDB), [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs).

```
src/lib/       parsing, merge on re-import, scheduling, answer checking, storage
src/views/     Home, Study, CollectionView, Settings, ImportDialog
src/i18n/      English and French strings
public/        icons and the sample collections
```

## Deployment to GitHub Pages

`.github/workflows/deploy.yml` tests, builds and publishes on every push to `main`.

1. Create a GitHub repository named `memorize` and push this project to `main`.
2. In the repository: **Settings → Pages → Source: GitHub Actions**.
3. The app is then served at `https://<user>.github.io/memorize/`.

If the repository has another name, change `base` in `vite.config.ts` to match.
