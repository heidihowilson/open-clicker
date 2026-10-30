# Direction: shared designs and group buys on Ethos and Base

Recorded 2026-10-30 from Seth's notes. This is the direction for the project, committed to as a
proof of concept for Ethos. Many details are still open; they are listed at the end.

## The problem it solves

Every custom layout is its own circuit board. A board maker builds at least 5 bare boards and
assembles at least 2, and setup fees are paid once per design. One person's custom remote
therefore carries roughly $60–100 of one-off cost (an unquoted estimate, 2026-10-29), against the
roughly $15 that the price list shows at a 50-board batch. A design needs a group of buyers to
reach batch prices.

## The idea

1. **Save and share.** A user saves a design and gets a short URL.
2. **View a shared design.** Anyone who opens the URL sees the full layout and what is fixed
   versus what they can change:
   - **Fixed by the design:** the layout, because the layout is the circuit board.
   - **Yours to choose:** what each key does. Each viewer can try their own key roles on the
     shared layout and see the result.
3. **Join the batch.** A viewer says "I'm in" and commits to one board from the batch. Each
   member separately picks DIY, Kit or Fully assembled.
4. **Escrow on Base.** Payments go into an Ethereum smart contract on Base, which holds the
   money. Part of it is released to the designer to order the boards. When the boards arrive,
   the designer ships one to each member of the batch.
5. **Final release.** When every member has received their board, the rest of the money is
   released.
6. **Trust through Ethos.** The model depends on trust, so identity uses Ethos
   (<https://app.ethos.network>):
   - Members see the designer's Ethos score before they commit.
   - After the batch, members write reviews, which add to the designer's Ethos score.
   - Login is probably through Privy, limited to the social accounts that Ethos supports
     (X/Twitter, Discord and so on).

## Why this direction

1. It joins Seth's professional interests: Ethos and crypto.
2. It removes the payment and funding problem. Seth does not want to form a business or
   handle other people's money himself.
3. It proves another way to build on top of Ethos.

## Sharing that spreads

A design can be shown as an emoji grid, like a Wordle result, so it pastes anywhere as text:

```
⬜⠀⠀⠀⠀🟥

⠀⠀⠀⬛⠀⠀⠀
⬛⠀⬛⠀⬛
⠀⠀⠀⬛⠀⠀⠀

⬛ ⠀⬛⠀⬛
⬛ ⠀⬛⠀⬛
```

Each key is a square in its cap colour, and blank cells keep the spacing. Use the same
picture in the share page's OpenGraph image, so a link shows the layout in every feed.

## Open questions

- **Other parts.** Who ships the switches, keycaps, battery and shell to each member, and when?
  This is undecided.
- **Batch rules.** Minimum and maximum batch size, a deadline, and what happens when a batch
  doesn't fill (refunds from escrow?).
- **Release terms.** How much goes to the designer up front, what proves delivery for each
  member, and what happens if a member never confirms or a board arrives broken.
- **Disputes.** Who decides when the designer and a member disagree. Ethos reviews show
  reputation but don't move money.
- **The three tiers in one batch.** Kit and Fully assembled need someone to assemble and ship,
  so it's unclear who does that work in a group buy.
- **Payments.** Which token (USDC on Base is the obvious one), gas, and a way for people
  without a wallet to pay (Privy embedded wallets?).
- **Legal.** Whether holding and releasing funds through a contract avoids the business and
  money-handling burden in practice. This needs checking before real money moves.
- **Design changes.** A shared design is frozen once a batch opens. Edits make a new design
  with a new URL.
- **Key roles.** Per-member key roles live with the member, not the design, and the firmware
  has to load them per remote.
- **Standard boards.** This sits next to the option of a few standard boards with a socket at
  every grid slot (discussed 2026-10-29). Group buys suit custom layouts; standard boards may
  still suit the default templates.

## First steps (proposed, not yet scheduled)

1. Save a design and share it by short URL, as a read-only view with the emoji grid and an
   OpenGraph image. No money, no login.
2. Show the viewer's own key roles on a shared layout.
3. Log in with Privy plus Ethos, and show the designer's Ethos score on the share page.
4. "I'm in" as a non-binding pledge list, to learn whether batches fill.
5. The Base escrow contract, tested on Base Sepolia with test funds before any real money.
