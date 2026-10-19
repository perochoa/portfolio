---
title: "Designing a Live Brainstorm Board in One DynamoDB Table"
description: "Starting from access patterns instead of entities: single-table design, conditional writes that enforce the app's rules, and the trade-offs behind a classroom idea board on DynamoDB."
pubDate: "Oct 19 2026"
draft: true
---

For my Databases II course at Western, a group of five of us is digging into one database in depth. We picked Amazon DynamoDB, and to show what it's good at, we're building a **live classroom brainstorm board**. An instructor opens a room for a topic, students join with a short code and post ideas, everyone can vote and comment, and the board updates in real time.

I wrote the data layer and the design doc behind it. The most interesting part was unlearning how I'd design this in SQL.

## Start from the questions, not the tables

In a relational database, you design tables around entities (rooms, users, ideas, votes) and rely on joins to answer whatever questions come up later. DynamoDB flips that. It's fast and scales well for queries you planned for, and awkward or expensive for ones you didn't. So the design starts with a list of every read and write the app will do.

We came up with 18 access patterns. A few examples:

- Create a room with a unique join code
- Look up a room from its join code
- Load the whole board, newest ideas first
- Vote for an idea, at most once per person
- List an instructor's rooms
- Delete old rooms

Then we picked keys so that each pattern is one `GetItem` or one `Query`. There are no `Scan`s, which read the whole table and get slower and more expensive as it grows.

## One table, one partition per room

Everything lives in a single table. Every item has a **partition key** (`PK`), which decides which group it belongs to, and a **sort key** (`SK`), which orders items within that group. All of a room's data shares one partition key:

| Item | PK | SK |
| --- | --- | --- |
| Room info | `ROOM#<id>` | `META` |
| Participant | `ROOM#<id>` | `USER#<user>` |
| Idea | `ROOM#<id>` | `IDEA#<created_at>#<idea>` |
| Vote marker | `ROOM#<id>` | `VOTE#<user>#<idea>` |
| Comment | `ROOM#<id>` | `COMMENT#<idea>#<created_at>#<comment>` |
| Join code | `CODE#<code>` | `META` |

Because a whole room is one item collection, loading the board is a single `Query`, where SQL would need several joins.

## Making the sort order do the work

Sort keys are compared as strings, so the prefixes put a room's items in a predictable order:

```text
COMMENT#...  <  IDEA#...  <  META  <  USER#...  <  VOTE#...
```

We chose that order on purpose. A `Query` for sort keys `BETWEEN 'IDEA#' AND 'META'` returns the room info plus every idea. Extending the range down to the start of the partition adds the comments. Participants and votes sort after `META`, so a board load never reads them.

Timestamps inside the keys are ISO 8601 in UTC, always with milliseconds, so they're all the same length. That way sorting them as text also sorts them by time, and reading the range in reverse gives newest first.

The rule this creates for the future: any new kind of item in a room must use a prefix that sorts after `META`, or it will start showing up in board loads.

## Let the database enforce the rules

The app has rules: no posting in a closed room, one vote per person, and join codes that are unique among open rooms. The tempting way to enforce them is to read first, check in code, then write. Two requests arriving at the same moment can both pass that check.

So every write carries a **condition expression**, and DynamoDB only applies the write if the condition is true at that moment. When several items have to change together, we use a transaction (`TransactWriteItems`), where either every write happens or none do.

Voting is a good example. One vote is a transaction with three parts:

1. **Check the room** is still open and not expired.
2. **Add a vote marker** `VOTE#<user>#<idea>`, only if it doesn't already exist. If this person already voted, the marker exists, the condition fails, and the whole transaction is cancelled. That marker is what makes "one vote per person" true.
3. **Add 1 to the idea's `vote_count`** with an atomic `ADD`, only if the idea exists. Without that check, voting on a deleted idea would create a broken item that has nothing but a count.

Because all three are in one transaction, the marker and the count can't disagree.

Join codes work the same way. A code is 6 characters from an alphabet without look-alike characters (no `I`, `L`, `O`, `0`, or `1`). Each code gets its own item, created with `attribute_not_exists(PK) OR expires_at < :now`. If the code is taken, we pick another and try again. The second half of the condition lets a new room reuse an expired room's code right away, instead of waiting for it to be deleted.

## Retries that know when to give up

The AWS SDK doesn't retry a cancelled transaction on its own, so our code does. DynamoDB says why each part of a transaction failed, and we only retry when trying again could succeed: a conflict with another transaction on the same item, or throttling. A failed condition is never retried, because the answer won't change. Each retry sends the same client request token, so if an earlier attempt actually went through, DynamoDB won't apply it twice.

## Cleaning up for free, slowly

Every item in a room carries the room's `expires_at`, and DynamoDB's **Time to Live** deletes items once that time passes. Whole rooms clean themselves up, and TTL deletes don't use any write capacity.

The catch is that TTL can run days late. So every read checks `expires_at` itself and treats expired items as gone, and every write checks it in its condition. TTL handles the storage. Correctness can't depend on it.

## Things we chose not to do

- **No index for top-voted ideas.** A second index sorted by `vote_count` would mean every vote changes an index key, which costs extra writes. The board load already returns every idea, so we sort them in the app.
- **A sparse index for "my rooms".** Only room items have the index keys, so nothing else is copied into it, and the index stays small and cheap.
- **No sharding, yet.** A whole room lives in one partition, which can handle roughly 1,000 writes per second. A classroom won't get close to that, but we plan to measure it in our benchmark instead of assuming. The likelier problem is transaction conflicts on a popular idea's counter, which the retries handle.

## What's next

The project is still in progress. Next is live updates: a Lambda function will read the table's change stream and push changes to everyone in a room over a WebSocket. DynamoDB Streams only guarantee order for each item, not across a whole room, so the front-end has to treat each update independently and cope with seeing the same one twice.

The biggest thing I've taken from this so far: in SQL I think about what the data *is*. In DynamoDB I have to think about what I'll *ask* it, and that turned out to be a much better habit for spotting race conditions.
