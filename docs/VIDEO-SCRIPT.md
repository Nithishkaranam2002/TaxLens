# Video walkthrough script (about 8 minutes)

Simple first-person script. **Do** is what to click. **Say** is what to speak. Speak slowly; it is fine to pause while the screen loads.

Before recording: open the live app in a fresh browser window (or Firm → Data → Reset workspace), close other tabs, zoom the browser to 100%.

---

## 1. Opening (30 seconds)

**Do:** Show the welcome screen.

**Say:**
"Hi, I am Nithish. This is Tickmark, my answer to the redesign the tax workpaper case study. It is built on the Okafor Lindqvist packet: a married couple who moved from Sacramento to Austin in the middle of the year, with two W-2 jobs, a design studio, rentals, a condo sale, three brokerages, crypto, K-1s and a Swedish account.
The main idea is simple. Every number carries its proof. You click any amount and you see how it was built, which document it came from, who checked it and what changed it."

## 2. The core idea in one click (1 minute)

**Do:** Click *Start the work fresh*. On the Overview, click the federal balance. Then in the proof panel click one of the sources so the document opens with the value highlighted.

**Say:**
"This is the federal result. Right now it is the engine as delivered: they owe about 4,400 including the penalty.
When I click it, I get the proof. How it was built, the rule and the inputs, and below that, where every input came from. If I click a source, the document opens on the exact page, and the value is highlighted.
So a reviewer never has to go and hunt for the source. The proof is sitting on the number."

## 3. How the errors were found (1.5 minutes)

**Do:** Go to *Checks*. Open the RSU check, then the mileage check.

**Say:**
"The engine's arithmetic is actually correct. I proved that first. Tickmark has its own independent recompute of the return, and it matches all three engine runs and all five engine what-ifs to the dollar.
So the problem is not the maths. The problem is what went into the engine. That is why the checks do not trust the engine. They go back to the documents.
For example, this one re-read every value against its printed page. Three RSU lots were read as zero basis because the broker left the field blank. The supplemental statement has the real basis. Without this, about 47,000 of wages gets taxed twice.
This one compares the pages of the mileage log. Page 3 is a second scan of page 2, so the engine counted 3,700 miles two times.
In total there are 51 checks and 23 corrections. Each correction has its evidence, its authority, and its exact tax effect."

## 4. Changing the return safely (1.5 minutes)

**Do:** Go to *Open items*. Tick the Findings section, click *Propose recommended corrections*. Show the toast with Undo. Open a second browser tab with the same link, switch it to Daniel Ortiz from the top right. In Daniel's tab, open *Open items*, tick *Changes to approve*, click *Approve*. Switch back to the first tab.

**Say:**
"As Priya, the preparer, I can propose all the recommended corrections in one go, and one undo reverses the whole group.
But nothing changes on the return yet. A proposal only shows its effect. It applies when a reviewer approves it.
Now I open a second tab. Each tab is one person, so this is Daniel, the reviewer. He approves. The big ones, more than 1,000 of tax, still wait for Helen, the partner. That is the firm rule, and it is enforced, not just written somewhere. Priya does not even get an approve button on her own change, and if anyone breaks a rule, the app refuses and quotes the rule.
And see the first tab. It updated live. Two people can work on the same file at the same time."

**Do:** As Helen, approve the rest. Go back to Overview.

**Say:**
"After the partner approves, the federal result goes from owing about 4,400 to a refund of 4,851, and the California refund goes from 8,256 to 13,020. The engine's original number is still shown beside ours, struck through, so nothing is lost."

## 5. Review, sign-off and the recorded season (1.5 minutes)

**Do:** Firm → Data → *Load season* (or reload and choose *Load the recorded season*). You are Daniel. Open *Overview*, point at "Since you last looked". Open change 22 (home office) from *Needs you*, approve it, then open *Areas → Business*.

**Say:**
"This is a recorded season. Four months of work by the team, from March to June, played through the same rules. So it looks like a real file in the middle of review.
Daniel can see exactly what happened since he last looked.
Now he approves the home office change. Look at the Business area. Priya had signed it off, and now her sign-off is reopened, and it lists exactly which lines moved. A sign-off is tied to a fingerprint of the area, so any change reopens it automatically. Nobody has to remember to re-review. If I switch to Priya, her bell already tells her."

**Do (optional, 20 seconds):** Open any number's proof, write a review note *for* Marcus with a date, then switch to Marcus and open the bell.

**Say:**
"A review note can be handed to a person with a date. It shows up in his open items and his bell, it goes overdue when the season clock passes the date, and it blocks filing until the reviewer clears it. Nothing is stored for notifications; they are worked out from the log every time."

**Do:** Open *Records*, click *Sales detail*, scroll the virtual list. Then *Depreciation by asset*.

**Say:**
"The Records section has the schedules a CPA expects: return summary against last year, tax computation, sales detail with all the lots, books to tax, depreciation by asset for federal, California and AMT, state split, carryovers, basis by year, and prior preparer versus us. All of them are live from the same data."

## 6. Filing and after (1 minute)

**Do:** *Filing → Season replay*, click *Run to here* on the last step. Then *Notices*, click *Build response package*.

**Say:**
"The packet scripts what happens after July. Replay moves the clock forward and does each step as the right person, through the same rules.
In the script, the IRS rejects the e-file because of Theo's SSN. Tickmark caught that in March by comparing with last year's return, so here it is accepted the first time.
After acceptance the return is frozen. Any later change has to be an amendment on top of it, with review and the client's signature again.
And in 2028 the IRS sends a letter. The response package is built only from the frozen record, with the documents and the audit trail, and it has a fingerprint so we can prove what was sent."

## 7. Technical decisions and tradeoffs (1 minute)

**Do:** Open *Activity*.

**Say:**
"A few decisions that made this work.
First, the workpaper is an append-only log of events. The screen is just a function of the packet, the log and the time you are looking at. Because of that, undo, time travel, what changed since I last looked, sign-offs that reopen, freezing and amending all come from one mechanism.
Second, I recompute the return independently instead of using the per-dollar rates. It costs more work, but the tax effect of every change is exact, and the partner threshold uses the real number.
Third, the rules live in the actions, not in the screens, so the same rule protects every button.
The tradeoffs: permissions are checked in the browser today, and with the shared database the next step is to check them on the server too. The documents are simulated from the packet text, but each value keeps its position, so a real scan can replace the page."

## 8. AI and close (30 seconds)

**Say:**
"I built this with Claude as an AI agent. It wrote most of the code and the tests under my direction. I kept it honest by making the recompute match the engine before trusting it, and by making every correction come from the packet with evidence, never typed in.
The code, the one page design note, the list of errors and the AI note are in the repository. Thank you for watching."
