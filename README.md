# Saved Shelf

**You save a lot of videos and posts, but they're scattered across different platforms. When you think of a specific one, you forget where you saved it, and when you actually try to find it, you can't.**

Was it a YouTube Watch Later? An Instagram reel? A Facebook post you saved at 2 a.m.? A TikTok? A Xiaohongshu note? Each app has its own tiny "saved" corner with weak search, and none of them talk to each other.

**Saved Shelf puts everything you saved in one place on your own computer**, tags it by topic automatically, and lets you search it or simply *ask* it: "which videos did I save about pricing a house?" You get a list of clickable links back.

> Personal tool, runs entirely in your own Chrome. No account, no server, nothing uploaded except the text sent to the AI provider you choose.

## What it does

- **Collects your saved items** from the platforms you're logged in to (your own browser session reads your own saved pages).
- **Tags them by topic** with the AI of your choice. Topics are fully editable; one item can carry several tags (playlists/collections can't do that).
- **One shelf to browse**: tiles or list, filter by topic, platform, "Watch later", "under 2 minutes", search; real thumbnails.
- **Ask AI**: a chat panel that searches your shelf in any language and answers with clickable links (opens in a second window). Save the chat as a Markdown file.
- **Cleans up**: find saved items whose link is dead (deleted/removed) and clear them in one go. Removing from the shelf never unsaves anything on the original site.
- **Yours**: stored in your browser (IndexedDB). Export/import JSON any time.

![Saved Shelf: everything you saved in one place](docs/images/04-shelf.png)

## Platforms

| Platform | Status | How |
|---|---|---|
| YouTube (playlists, Watch Later, Saved Shorts) | Built, most tested | same-origin requests from your logged-in tab |
| Instagram (saved posts) | Built | Instagram's own saved-posts endpoint |
| Facebook (Saved) | Built, fragile | reads the Saved page while scrolling |
| TikTok (Favorites) | **Experimental** | reads your Favorites tab |
| Xiaohongshu / RedNote (收藏) | **Experimental** | reads your saved notes tab |
| X / Twitter (Bookmarks) | **Experimental** | reads your Bookmarks page while scrolling |
| Threads (Saved) | **Experimental** | reads your saved posts page |
| **Any other site** | Bring your own | Settings → *Add a site*: give it the page with your saved items (and optionally CSS selectors) |

All of these rely on how each site currently looks and behaves, **not on official APIs** (none of these platforms offer an API for your saved items). They will break when sites change; fixes and selector updates are welcome as pull requests.

## Bring your own AI

Pick any provider in **Settings** and paste your own key. Nothing is bundled and no key is shared.

Claude (Anthropic) · OpenAI · Google Gemini · DeepSeek · OpenRouter · Groq · Mistral · Ollama (local, free, no key) · **Custom** (any OpenAI-compatible URL).

Tagging ~1,000 items typically costs a few cents with a small/fast model.

## Install (about 5 minutes)

**Step-by-step guide with screenshots: [docs/INSTALL.md](docs/INSTALL.md)**. The short version:

1. Download this repository (green **Code** button → *Download ZIP*) and unzip it somewhere permanent.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the unzipped folder.
4. Click the Saved Shelf icon to open your shelf, then **⚙ Settings**: choose your AI provider and key, and tick the platforms you use.
5. Make sure you're logged in to each platform in Chrome, then press its button under **Sync saved items**. Keep that tab visible while it runs.

Don't move or delete the folder afterwards (Chrome stores your data under an ID tied to that folder). Use **Export JSON** for backups.

## Heads-up, please read

- **Terms of service.** Some platforms (notably Meta: Facebook and Instagram) prohibit automated collection. This tool reads *your own* saved items from *your own* logged-in session at a human-like pace, but that can still be against a platform's rules and could trigger rate limits or account checks. Use it at your own risk, ideally on accounts you can afford to have limited. It is not affiliated with or endorsed by any platform.
- **Fragile by nature.** No official APIs are used, so syncing can stop working without notice.
- **Desktop Chrome only** (also works in Chromium browsers that support Manifest V3 extensions).
- **Dead-link check** for Facebook is slower and more cautious on purpose; it stops by itself if the page can't be read reliably.

## Privacy

- Your saved-item data never leaves your browser, except: the **title, author and length of items** are sent to the AI provider *you* chose, only to tag them or answer your questions.
- API keys are stored in your browser profile (`chrome.storage.local`) and sent only to the provider you select.
- No analytics, no tracking, no server of ours.

## Files at a glance

`manifest.json` · `background.js` (sync, tagging, link checks) · `collectors/` (one script per platform + `generic.js`) · `shelf.html/js/css` (the app page) · `chat.js` (Ask AI) · `llm.js` (providers) · `settings.js` · `sources.js` (platform list) · `taxonomy.js` (default topics) · `db.js` (local storage).

## Contributing

Pull requests welcome: new platform presets, selector fixes when a site changes, translations. Please don't commit personal exports (`.gitignore` already skips common ones).

## License

MIT
