![Token Radar](https://make.fun/badge/token-radar-01.svg)

# Token Radar — pre-token protocols ranked by implied value

An entry for make.fun's [token-radar-01](https://make.fun/c/token-radar-01) bounty:
a radar that finds protocols whose token does not exist yet, ranks them by an
implied value, and shows a reader how to farm each one.

## The model (radar-2)

Implied value is **not** TVL times a fixed multiple. The snapshot's own
live-token protocols are the peers' record: their realized market caps are the
ground truth for "what a token is worth", so every term is fitted from them at
runtime, inside `main.ts`, from the sealed snapshot alone.

```
log10(implied) = a + b·log10(TVL) + category adjustment + log10(0.6 + token odds)
                 + log10(growth multiplier) + log10(maturity multiplier)
```

- `b = 0.52` (OLS slope of log10(market cap) on log10(TVL) over 128 live-token
  peers): value grows with the **square root** of TVL, so the biggest TVL does
  not win by default.
- Category adjustment: log10(category median mcap/TVL / global median),
  shrunk by n/(n+5).
- Token odds: the share of the category's protocols that already have a token.
- Growth (weight 0.25, clamped −60%..+120%) and maturity (0.6 + age/1095d × 0.4)
  stay small bounded priors: their fitted coefficients were unstable held-out
  (growth came out negative; maturity flipped sign between fits).

Held-out validation on the live-token peers: walk-forward (train oldest 70% by
listed date, test newest 30%) Spearman 0.31, log10-RMSE 0.96; leave-one-out
Spearman 0.35, log10-RMSE 0.94. The starter model scores 0.21 / 1.17 on the
same walk-forward test.

## The board

200 rows: the 40 watchlist protocols (TVL ≥ $50M, no token on record) plus the
160 pre-token protocols below the floor with the highest implied value. Every
row carries its full formula, a six-step farm plan priced on its own chain
(gas, capital, days), and a verdict from expected value (implied × token
odds): worth farming at $5M+, marginal at $1M+.

## The dashboard

`dashboard/` is a static page (no network): sortable and filterable board,
per-protocol detail view with the row's formula, a model sandbox that re-ranks
the board under tweaked constants, and the validation numbers. Three
screenshots in `screenshots/` are real renders of it (board, detail, filtered).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22 or later, standard library only. Two runs write identical bytes.

## License

MIT — see [LICENSE](LICENSE).
