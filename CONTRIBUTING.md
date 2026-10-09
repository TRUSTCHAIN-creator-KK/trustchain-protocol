# Contributing

Thanks for helping. Two kinds of contributions are most welcome: templates and fixes to the verifier.

## Templates

New templates and better wording are welcome. Open an issue with the "Template suggestion" form first if you are not sure it fits.

A template here is for an everyday deal between people. It should:

- **Use plain words.** Write it so both people can read it at a kitchen table. No "hereinafter", no "party of the first part", no "indemnify". If an idea needs a legal word, say in plain words what the two people mean.
- **Follow the shape.** Copy an existing template. Keep the headings: Short form, Full form, the five lines (What we're doing, Price and payment, Changes, Dates, If someone walks), Agreed, Optional clauses, Example, Check the rules where you live. End with "Not legal advice."
- **Use numbers, not adjectives.** Every amount, date and count is a `[PLACEHOLDER]` in UPPER CASE. Real amounts appear only in the Example.
- **Write changes as new notes.** Every Changes line says that a change is written down as its own note, not an edit to the old text.
- **Make no legal claims.** Do not say a term is binding, enforceable, valid or guaranteed. Do not name laws, sections or deadlines. Do not say what the law is anywhere. The "Check the rules where you live" note lists what to look up locally, nothing more.
- **Stand on its own.** No product pitch inside a template.

House style for all text in this repository:

- No em dashes or en dashes. Use a full stop, comma, colon or a plain hyphen.
- Short sentences.

Before you open a pull request, run:

```sh
node scripts/lint-templates.mjs
node scripts/check-dashes.mjs
```

## Verifier

- Keep it dependency-free and read-only. It must never send a transaction or ask for a key.
- Every new check must say exactly what it compared. The tool must never claim more than it checked.
- Add a test. Offline tests use the recorded fixture in `verify/test/fixtures/` or synthetic data built in `verify/test-support/`. Never put a real person's account ID, email or private record in a test.
- Run `cd verify && node --test`.

## Contract

The contract in `contracts/` is the deployed one, byte for byte. Do not edit `TrustChainRegistry.sol` or the files in `contracts/build/`: any change would stop them matching the chain. Notes and ideas for a future version are welcome as issues.

## Pull requests

- One change per pull request.
- Say what you changed and why.
- CI must pass: tests on Node.js 18 and 20, the template lint, the dash check and the contract build check.

By contributing, you agree that your contribution is licensed under the license of the folder it goes into: MIT for code, CC BY 4.0 for templates.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
