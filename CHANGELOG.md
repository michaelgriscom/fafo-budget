# Changelog

## [1.2.0](https://github.com/michaelgriscom/fafo-budget/compare/v1.1.0...v1.2.0) (2026-06-16)


### Features

* add optional PCE inflation adjustment for monthly target and allowances ([#10](https://github.com/michaelgriscom/fafo-budget/issues/10)) ([b8ea509](https://github.com/michaelgriscom/fafo-budget/commit/b8ea509ba73601b102381e5c5e4aa5c3b72f2d49))
* import PayPal Debit Card transactions from email receipts ([#13](https://github.com/michaelgriscom/fafo-budget/issues/13)) ([8f0fbcf](https://github.com/michaelgriscom/fafo-budget/commit/8f0fbcf3ed10eb63b964a885a9601b63dd8fbc9d))


### Bug Fixes

* prevent crash loop from failed bank sync ([#14](https://github.com/michaelgriscom/fafo-budget/issues/14)) ([a9297df](https://github.com/michaelgriscom/fafo-budget/commit/a9297dfe7aa48f100da4e556729977dd6dec4cf1))

## [1.1.0](https://github.com/michaelgriscom/fafo-budget/compare/v1.0.0...v1.1.0) (2026-03-18)


### Features

* add optional bank sync before reconciliation ([#7](https://github.com/michaelgriscom/fafo-budget/issues/7)) ([41ccbfb](https://github.com/michaelgriscom/fafo-budget/commit/41ccbfb5c306e2f4c6a302a15ba52048e147939e))

## 1.0.0 (2026-02-28)


### Features

* add health check endpoint for monitoring ([4a9fe8c](https://github.com/michaelgriscom/fafo-budget/commit/4a9fe8cf8d26fa429f0e8d150146ade3b87314a9)), closes [#4](https://github.com/michaelgriscom/fafo-budget/issues/4)
* initial implementation of FAFO budget reconciler ([9ec2b21](https://github.com/michaelgriscom/fafo-budget/commit/9ec2b2144e8f4eadf28aea961716664c1b65202e))


### Bug Fixes

* correct reconciliation to update source month flex budgets ([c506999](https://github.com/michaelgriscom/fafo-budget/commit/c5069996fce320783e7aa7c73ddd260b77eb804a))
* update Other budget in source month during reconciliation ([#6](https://github.com/michaelgriscom/fafo-budget/issues/6)) ([1d0d951](https://github.com/michaelgriscom/fafo-budget/commit/1d0d951396cfec7d90a64b479e90a410d0a84c11)), closes [#5](https://github.com/michaelgriscom/fafo-budget/issues/5)
