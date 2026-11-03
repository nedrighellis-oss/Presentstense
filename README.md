# Presents Tense: Christmas gift finder

## Before launch
1. **Affiliate tag**: already set to `presentstense-20` (change `AFFILIATE_TAG` in `index.html` if it ever changes).
2. **Domain**: already set to presentstense.com in `netlify.toml`.

## Deploy (free on Netlify)
1. Put this folder in a GitHub repo.
2. In Netlify: Add new site > Import from GitHub > pick the repo. The build settings come from `netlify.toml`.
3. Site settings > Environment variables: add `ANTHROPIC_API_KEY` (from console.anthropic.com). This powers the AI "describe them" box. Without it, the box falls back to keyword matching automatically.
4. Connect your domain, then submit `https://yourdomain.com/sitemap.xml` in Google Search Console.

## Editing
- Gifts, guides, and keywords all live between `// DATA-START` and `// DATA-END` in `index.html`.
- Each gift: `[name, price, interests, good-for, vibe, blurb, amazon search]`.
- Add a guide to `GUIDES` and the build creates its page and sitemap entry.
- Rebuild locally any time with `node build.mjs https://yourdomain.com`.

## Costs
- Hosting: free tier is plenty to start.
- AI: Haiku costs well under a cent per search. Set a monthly spend limit in the Anthropic console so a traffic spike can't surprise you.
