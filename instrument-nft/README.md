# Instrument NFT Exchange

A Robinhood-inspired experience for fractional instrument SPVs. This folder can live on its own as the [`jjasper-llee/instrument-nft`](https://github.com/jjasper-llee/instrument-nft) repository so collaborators can ship PRs without touching the main personal site.

## Quick start

```bash
# clone the dedicated repo
$ git clone https://github.com/jjasper-llee/instrument-nft.git
$ cd instrument-nft

# run any static server (or simply open index.html)
$ python -m http.server 8000
```

Then visit `http://localhost:8000` to interact with the SPV marketplace, account creation simulator, and governance voting flows.

## Files

- `index.html` – layout and content for the marketing + product walkthrough
- `styles.css` – dark-mode UI inspired by Robinhood (no build step required)
- `app.js` – client-side interactivity for balances, voting, and account workflows

## Working with PRs

1. Branch off `main` in the `instrument-nft` repository.
2. Edit the static files above (no frameworks necessary).
3. Commit, push, and open a pull request.
4. Merge + redeploy with GitHub Pages or any static hosting provider.

Because the project is framework-free, GitHub can serve it as-is without additional build commands.
