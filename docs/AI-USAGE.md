# How AI was used

The brief said to use any tools, including AI, and to say how. Here is exactly how.

## The short version

I built TaxLens with **Claude** (Anthropic) working as an agent in a long session: it read the brief and the packet, proposed the design, wrote the code, the tests and these documents, and ran the app in a real browser to test it. I set the direction and the bar, made the product decisions, reviewed the result, deployed it and recorded the walkthrough myself.

I am saying this plainly because the job is about putting AI to work on tax workflows, and how the AI was directed and checked is part of the answer.

## What the AI did

- **Read everything first.** The case study PDF and the full packet (74 documents, 3,012 extracted values, three engine runs, the timeline, agency records, firm standards).
- **Found the errors by building checks, not by eyeballing.** It wrote an independent recompute of the return and proved it against the engine before trusting it, then wrote 51 checks that re-read values against their pages, tie out brokers and books, and compare with agency records, the prior year and the client's answers.
- **Wrote the app**: data model, rules, recompute, checks, corrections, the recorded season, the UI, the optional shared-log API and the tests.
- **Tested its own work** in Chromium end to end: a fresh file taken through corrections, review, partner sign-off, client approval, e-file, refunds, quality review, roll-forward, the 2028 IRS letter and an amendment; and the e-file rejection path. It fixed what those runs exposed.

## How the output was kept honest

AI can be confidently wrong, especially with numbers. The design leans on that:

1. **Nothing is typed in.** Every amount in a correction is computed from the packet (a document value, an agency record, a client answer), and each correction carries its evidence and the authority relied on.
2. **The recompute must match the engine before it is used.** The tests require every numeric line of v1, v2 and v3 and all five engine what-ifs to match to the dollar. Only then are corrections recomputed on top of it.
3. **Tests over the whole workflow.** The recorded season runs more than 200 actions through the same rules as the app, and the tests fail if any step is refused.
4. **Facts only from the packet.** Client answers in the recorded season quote the client's own messages; nothing is invented about the household.

## A second pass

After the first build was finished and tested, I started a second Claude session with the finished project, the brief and a handoff note, and asked it to review the app the way the hiring team would (as a 20-year CPA and as an engineer reading the code) and to improve only what mattered. Before touching anything it ran the build and the 29 tests. It then made four changes, each followed by the build, the tests and a browser check:

1. Review notes can be handed to a named person with a due date (the event already had an `assignee` field that nothing set). Owners and due dates show in Open items, the Review page and the activity log; an overdue note is marked.
2. Notifications now also cover a sign-off of yours that reopened, notes handed to you or overdue, client questions past the date asked for, and the firm's own deadlines when they are near or passed on the season clock.
3. `rules.test.ts`: ten tests that prove the firm's rules refuse what they should (the season test only proved they allow what they should). 29 tests became 39.
4. Household and firm labels (the filers, filing status, forms, the move, the due date, the prior preparer) are read from the packet instead of being typed into the screens.

It changed no tax number and no correction. It also wrote this section.

## A third pass: the redesign

With the product working, I asked a third Claude session to redesign the interface so that a recruiter or a 20-year CPA opening the link sees a product a firm would pay for. The brief was strict: change how it looks, reads and feels, and nothing else. No change to `src/engine/`, `src/app/` or `src/data/`, no tax number, correction, check or judgment text, and no feature, control or shortcut removed.

How it went:

1. **Baseline first.** It ran the build and the 39 tests, then took screenshots of ten screens at 1440 and 390 pixels with Playwright.
2. **A written spec before any code**: type scale, spacing, colour tokens for light and dark, component rules and a page-by-page plan. I reviewed it and changed two things. Primary buttons stay near-black, and the indigo accent is used only for proof links and focus, because in this app colour already means *who did the work* (preparer blue, reviewer green, partner violet). It then picked the indigo by measuring colour distance against every person's ink in both themes. I also renamed the product from Tickmark to **TaxLens**.
3. **Nine steps, one commit each**, with the build, the 39 tests and fresh screenshots after every step:
   - tokens and kit
   - shell and welcome
   - Overview
   - Open items
   - proof drawer and document viewer
   - the remaining pages
   - empty, loading and error states
   - a responsive and dark-mode pass
   - these docs

   It pushed only after the build and tests passed.
4. **What changed:**
   - Text is 13px minimum and 15px for body; about 560 hard-coded sizes became eight tokens.
   - There is less on screen at once: completed filing steps, groups in Open items and secondary proof sections fold away, and Team and the 2024 comparison sit behind disclosures.
   - The welcome screen is a full-screen landing page.
   - Empty, loading and error states are designed.
   - It fixed one real bug the baseline exposed: a button nested inside a button in Open items, which React warned about in the console.
5. **Checked in a browser at the end:** approving change 22 as Daniel reopens Priya's Schedule C sign-off and lists the lines that moved. Clicking a number opens its proof, and its source opens the page with the value highlighted. The console is clean.

Browser storage keys still use the old name, so work already saved in a browser keeps loading.

## My role

- Set the goal and the standard: a real product a 20-year CPA would trust and a new hire could use on day one, not a spreadsheet.
- Chose how it is delivered: my own GitHub repository and Vercel deployment.
- Reviewed the code and the findings, deployed the app and recorded the video walkthrough.

## What I would do differently with more time

- Validate each event's role on the server as well as in the browser.
- Replace the simulated pages with the real scans and position-based highlights.
- Have a CPA review the judgment-call wording before it goes in front of a client.
