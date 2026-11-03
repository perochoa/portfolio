---
title: "Perocho Repairs: Getting a Family Side Hustle Off Facebook Marketplace"
description: "Building a website and request flow for my family's PS5 repair side hustle: drop-off times read from the techs' own Google Calendars, a first-to-take-it rule enforced by one SQL statement, and everything on free tiers."
pubDate: "Nov 03 2026"
---

My siblings and I repair PS5 consoles and controllers in Mississauga: deep cleanings, HDMI port replacements, and stick drift fixes. It started as a side hustle, with a Facebook Marketplace listing, a good rating, and every conversation in Messenger. As more and more customers came, we thought, why not expand a bit?

I'm a co-owner. My siblings are the techs right now, and I'm training to be one. My part is everything admin, the things customers don't see, including the roadmap for the business and the website. I built [repairs.perocho.com](https://repairs.perocho.com) and everything behind it, and the code is public: [perocho-er](https://github.com/perochoa/perocho-er).

The site is up, but it isn't finished. No real customer has sent a request through it yet. That starts once we launch the first version and pilot it. This post covers why we wanted a site at all, how the request flow works, and a few things that went wrong along the way.

## Why a website

Marketplace has been good to us, but everything about the business lived on it: the listing, the rating, and every conversation. I had the idea to start with a website so we aren't locked into Facebook Marketplace.

The other reason was to make intake more formal. Every request used to start as a Messenger chat. The site has a request form that asks for what the techs need up front: the device, what's wrong, a drop-off time, and a phone number. Messenger, email, and Marketplace all stay. The form is one more way in.

Before writing any code, I set three rules:

- **Build the simplest thing that works**, and add nothing until it's needed.
- **Keep running costs at or near zero.** This is a side hustle.
- **Never invent business details.** Anything we haven't decided stays unset, and the site hides that line instead of guessing.

## The stack

- **The site** is static [Astro](https://astro.build) on GitHub Pages, the same setup as the site you're reading, so the tooling and deploy carried over.
- **The request form** posts to a Cloudflare Worker, which keeps each request's state in D1, Cloudflare's SQLite database.
- **Availability** comes from the Google Calendar API, through a service account. The worker signs its own token requests with the Web Crypto API, so there's no Google SDK.
- **Email** goes out from `repairs@perocho.com` through Fastmail's JMAP API, on the same Fastmail account I set up in [citadel](../citadel/). Emails to the techs have the customer as the Reply-To, so replying reaches them directly.

Everything new runs on a free tier. The domain and Fastmail were already paid for.

## Drop-off times from the techs' own calendars

Availability was the hardest part to design. It's still a side hustle, and all of us have other jobs and responsibilities that need our attention, so tech availability varies and there are no fixed business hours.

So the source of truth is the Google Calendar each tech already uses:

- A tech adds an event whose title starts with `Available` for each stretch they can receive devices. A repeating event works, and an all-day one counts as 9 a.m. to 7 p.m.
- Inside those blocks, the form offers drop-off times on the quarter hour, from two hours ahead to about a month out.
- Any other event on their calendar blocks the time it covers. All-day events, events marked "free", and invites they've declined don't.

I went with each tech's own calendar over one shared business calendar, so their real plans block times automatically. Nobody has to copy their week into a second calendar. To take on less work, a tech trims their `Available` blocks, and that's the whole workload control.

### Drop-off windows, not appointments

The first version treated a picked time like an appointment. A booking blocked that time, so the worker re-checked for two customers racing for the same slot, and a tech couldn't take two repairs at once.

Then we went drop-off only. Driving to customers is a hassle and isn't worth it at the prices we're charging. We're starting lower on purpose, to gain experience and build a reputation before settling into market pricing.

Once everything is drop-off, a time is just when the customer brings the device in, not when it gets repaired. That simplified a lot:

- **Any number of customers can pick the same time.** The worker's holds and bookings go on the calendar as "free" events, so they never block anything. The slot race check, the "someone else took this time" page, and the clash check all went away.
- **The ready time is agreed between the tech and the customer**, by phone or email, outside the system.
- **Each tech has a queue** of repairs they've taken and haven't finished, ordered by drop-off time.
- **A rush** is +$20, paid in person like the rest, and moves the repair to the front of the queue.

## First tech to take it gets it

When a request comes in:

1. Every tech gets an email with their own link, and a copy without links goes to the business address.
2. Every tech who's free at that time also gets a tentative `Request: ...` hold on their calendar.
3. The first tech to press **Take it** gets the request. Their hold becomes a booking, everyone else's hold is deleted, and the customer and the other techs get an email.
4. **Decline** only takes out that tech. If every tech declines, the customer is told nobody can take it.
5. If nobody takes it before the drop-off time, it expires. An hourly job deletes the holds and emails the customer.

"First" has to mean first, even when two techs press the button in the same second. That's one SQL statement:

```sql
UPDATE requests SET status = 'confirmed', confirmed_by = ?2
WHERE id = ?1 AND status = 'pending' AND slot_start > ?3
```

The `WHERE` clause is the whole rule: the request has to still be pending, and its drop-off time can't have started yet. If two techs press at once, one update changes a row and the other changes nothing. The worker checks how many rows changed, and only the tech whose update changed one gets the booking. Anyone who presses it after sees that it's taken.

There's one more step after the update: putting the booking on the tech's calendar. If Google fails at that point, the worker sets the request back to pending before anyone is emailed. Nobody hears "confirmed" for a repair that isn't on a calendar.

## Things that went wrong

**One bad calendar hid every time.** One tech's calendar ID in the config pointed at a calendar the service account couldn't see. Google answered with a 404 for that one, the worker threw away every tech's times along with it, and the form showed none. Now a calendar that can't be read only costs that tech their own times, and the log names which tech's entry to fix. They still get request emails and can still take requests.

**Seven PRs that never reached `main`.** I split a batch of worker changes into seven stacked PRs, each based on the one before. The repo squash-merges and keeps merged branches around, so when I merged them in order, each one landed in the branch below it after that branch had already been merged. None of the work reached `main`. I rebased the same 19 commits onto `main` and landed them again as one PR. In a repo set up like that, don't stack PRs.

**The time picker took five tries.** It started as a dropdown, then became rows of day and time chips, then a week view with arrows, then times grouped by part of the day. It ended up as two dropdowns again: pick a day, then a time. The chips were too busy.

## Careful in a public repo

I like keeping the repo public, but it means being deliberate about what goes in it:

- **No location finer than "Mississauga"** anywhere on the site. The drop-off address goes out in Messenger.
- **Photos lose their GPS data before they're committed.** The built site drops EXIF data anyway, but the original files sit in the repo, so they're stripped with `exiftool -all= -overwrite_original <file>` first.
- **The techs' calendar IDs and emails live in a Worker secret**, never in the repo.

## The name

The repo is still called `perocho-er`, after the first name, Perocho ER, which came with an emergency room theme. We dropped both for Perocho Repairs. The logo is a joystick that's "worn and fixed": a faint ring for a stick that drifted, and a solid disc for the fixed one.

The site is teal, not the orange on this site. Customers find us through Marketplace and Messenger, not through perocho.com, so it doesn't need to look like my personal site.

## What's next

- **Finish the first version and pilot it** with real customers. That's when the site actually counts as done.
- **Add past repairs**, with before and after photos, once the foundation is in place.
- **Branch out slowly.** It's a side hustle today, and maybe a small business one day.
