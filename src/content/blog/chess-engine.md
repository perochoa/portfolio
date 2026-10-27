---
title: "Building a Chess Engine in C++"
description: "Bitboards, magic bitboards, and a 24-bit move encoding in my C++ chess engine, plus the two silent bugs I found when I came back to it 18 months later."
pubDate: "May 21 2025"
updatedDate: "Oct 19 2026"
heroImage: "../../assets/chess-engine.png"
---

[CPPChess](https://github.com/perochoa/CPPChess) is a chess engine I started in C++ over the 2024–25 winter break. It isn't finished. It parses positions, generates pseudo-legal moves for every piece, and makes moves on the board, but it can't search or play a game yet. I wanted to understand how real engines represent a board before writing any search code. Going back to it this fall, I found two bugs that had been silently breaking a large part of the move generator.

This post covers how the engine represents the board and moves, how magic bitboards work, and what went wrong.

## One integer per piece type

A chessboard has 64 squares, and a `uint64_t` has 64 bits. A **bitboard** is a 64-bit integer where each bit says whether something is on a square. The engine keeps twelve of them, one for each piece type and colour (white pawns, black knights, and so on), plus three occupancy boards: white, black, and both.

The point is that board questions turn into bitwise operations that run in a cycle or two:

```cpp
Bitboard empty = ~occupancy[BOTH];
Bitboard white_pawn_pushes = (pieces[P] >> 8) & empty;  // a8 is bit 0, so "up" is a right shift
Bitboard attacked_by_knight = knight_masks[square] & occupancy[BLACK];
```

In my layout, `a8` is bit 0 and `h1` is bit 63, which matches the order a FEN string lists squares. That's why a white pawn moving "up" the board is a right shift here. Many engines use the opposite convention, so check this before you copy code from anywhere.

I wrapped the integer in a small `Bitboard` class with operator overloads, so `board[e4] = true` works. The `[]` operator returns a proxy object that sets or clears the bit on assignment. It's syntactic sugar, but it made the move generator read much more like chess than bit-twiddling.

## A move fits in 24 bits

Moves get created and thrown away millions of times during search, so each one is packed into a single `int`:

```text
0000 0000 0000 0000 0011 1111    source square     0x3f
0000 0000 0000 1111 1100 0000    target square     0xfc0
0000 0000 1111 0000 0000 0000    piece             0xf000
0000 1111 0000 0000 0000 0000    promoted piece    0xf0000
0001 0000 0000 0000 0000 0000    capture           0x100000
0010 0000 0000 0000 0000 0000    double push       0x200000
0100 0000 0000 0000 0000 0000    en passant        0x400000
1000 0000 0000 0000 0000 0000    castling          0x800000
```

A square needs 6 bits (0 to 63), a piece needs 4 (twelve kinds), and the flags take one bit each. Decoding is a mask and a shift.

## Precomputed attacks

Knights, kings, and pawns always attack the same squares from a given square, no matter what else is on the board. So the engine computes those 64-entry tables once at startup and looks them up afterwards.

Rooks, bishops, and queens are harder because they slide until they hit something. A rook on `a1` attacks a different set of squares depending on what's in its way. The simple approach walks each ray square by square, which works but is slow inside a search that visits millions of positions.

## Magic bitboards

Magic bitboards turn the sliding-piece question into a single table lookup:

1. For each square, build a **relevance mask** of the squares whose occupancy can change the answer. For a rook on `a1`, that's the rest of the a-file and the first rank, minus the edge squares, because a piece on the edge can't block anything behind it. This leaves 12 relevant bits in the corners and 10 in the middle of the board.
2. AND the real occupancy with that mask. Now only the bits that matter are left.
3. Multiply by a precomputed 64-bit **magic number** and shift right by `64 - relevant_bits`. A good magic maps every possible blocker pattern to a unique index (or to an index that shares the same attack set).
4. Use that index into a table filled at startup with the real attack set for every blocker pattern.

```cpp
occupancy &= raw_rook_masks[square];
occupancy *= ROOK_MAGIC_NUMBERS[square];
occupancy >>= 64 - ROOK_RELEVANT_BITS[square];
return rook_masks[square][occupancy];
```

Queens are just rook attacks OR bishop attacks. The magic numbers themselves come from a brute-force search: try random sparse 64-bit numbers until one produces no harmful collisions for a square. I used published magics instead of generating my own.

## The bugs I found 18 months later

When I came back to the project, I wrote a quick test: generate 12,800 random occupancy boards, compute rook and bishop attacks by walking the rays, and compare that with the magic lookup.

```text
rook wrong 11262/12800, bishop wrong 10962/12800
```

That's 88% of rook lookups and 86% of bishop lookups returning the wrong squares. The lookup above was fine. The bug was in the code that **fills** the table at startup:

```cpp
const int magic_bitboard = Magic::ROOK_MAGIC_NUMBERS[square];
const int magic_shift = 64 - Magic::ROOK_ATTACK_COUNT_MASK[square];
// ...
int magic_index = (masked_occupancy * magic_bitboard) >> magic_shift;
```

A magic number is a 64-bit value, and `const int` keeps only the low 32 bits. So the table was filled using one hash function and read using another. Each attack set landed at an index the lookup would never compute, and the slots the lookup did read held whatever pattern happened to land there. Changing both variables to `uint64_t` fixed it:

```text
rook wrong 0/12800, bishop wrong 0/12800
```

Nothing crashed and nothing looked broken. The engine just quietly produced wrong moves for every rook, bishop, and queen. Clang doesn't warn about the narrowing by default, either; `-Wshorten-64-to-32` (or `-Wconversion`) would have flagged it.

Once I was suspicious, a second test turned up another bug. I set up a lone pawn one step from promoting and counted the moves:

```text
white pawn about to promote: 1 moves, 0 with a promotion piece
black pawn about to promote: 5 moves, 4 with a promotion piece
```

The correct answer is 4 for both: promote to a queen, rook, bishop, or knight. White's check looks for a pawn on rank 8 (`a8` to `h8`) instead of rank 7, and a white pawn can never be on rank 8, so white never promotes. Black checks the right rank, but a missing `else` adds a plain push after the four promotions, which leaves a pawn sitting on the back rank. The capture branch has the same rank mistake.

I also found two smaller problems in the magic-bitboard file:

- **Fall-through.** The rook case in the initializer has no `return`, so it falls into the king case and recomputes the king mask. That happens to be harmless, because it ORs in the same bits, but it's luck rather than design.
- **Oversized tables.** All three slider tables are `[64][4096]`. That's right for rooks (2^12 entries for a corner square), but a bishop never has more than 9 relevant bits, so 512 entries would do. There's also a precomputed queen table that mixes rook and bishop indices, which are two different hash spaces. Nothing reads from it, because queen lookups combine the rook and bishop tables, but it still takes 2 MB.

## What I'd do next

- **Test the move generator before anything else.** The standard tool is **perft**: count every leaf node to depth *n* from a known position and compare with published totals. I already had the classic test positions ("tricky", "killer", and so on) saved as FEN strings in the repo, but I never wrote the perft function itself. Perft would have caught both bugs on day one, and it's what I should have built before the move generator grew.
- **Turn on more compiler warnings.** `-Wall -Wextra -Wconversion` would have flagged the truncation.
- **Then search.** Negamax with alpha-beta pruning, iterative deepening, and a basic material plus piece-square evaluation, followed by a UCI front end so it can play in a GUI like Cute Chess.

The main lesson is that a bitboard engine fails silently. Everything compiles, the board prints correctly, and the move counts look plausible. Only a test against known numbers tells you whether the engine is actually right.
