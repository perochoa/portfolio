---
title: "Building a Chess Engine in C++"
description: "A UCI-compatible chess engine written in C++17 using 64-bit bitboards, alpha-beta search, and perft testing."
pubDate: "May 21 2025"
heroImage: "../../assets/chess-engine.png"
---

## Why Bitboards?

* **Speed:** Bitwise operations on 64-bit integers are extremely fast.
* **Clarity:** A single `uint64_t` holds one piece type’s positions.
* **Parallelism:** You can represent entire move sets or masks in one register.

*Analogy:* Think of the 8×8 chessboard as a checkerboard painting. Each bit in a 64-bit integer is like one square: either painted (1) or blank (0).


## Understanding Bitboards

A **bitboard** is simply a 64-bit unsigned integer (`uint64_t` in C++). Each bit corresponds to one square on the chessboard:

```
bit 63 ◄ A8  B8  C8 ... H8 ► bit 56
...
bit  7 ◄ A1  B1  C1 ... H1 ► bit  0
```

* **LSB (bit 0):** A1
* **MSB (bit 63):** H8

You will typically maintain one bitboard for each piece type and side (e.g., white pawns, black knights, etc.).

## Mapping Squares to Bits

Define an enum or constants for square indices:

```cpp
enum Square {
    A1, B1, C1, D1, E1, F1, G1, H1,
    A2, B2, /* ... */ H8,
    NO_SQ
};

inline uint64_t square_bitboard(int sq) {
    return uint64_t(1) << sq;
}
```

*Real-world analogy:* If squares are mailboxes numbered 0–63, `square_bitboard(sq)` is how you drop a letter in mailbox `sq`.


## Basic Bitboard Operations

| Operation | C++ Code             | Meaning                     |
| --------- | -------------------- | --------------------------- |
| AND       | `bb & mask`          | Intersection |
| OR        | `bb \| mask`         | Union |
| XOR       | `bb ^ mask`          | Toggle |
| NOT       | `~bb`                | Inversion |
| SHIFT     | `bb << n`, `bb >> n` | Slide north/east/south/west |

```cpp
uint64_t all_white = white_pawns | white_knights | ...;
uint64_t empty = ~(all_white | all_black);
```


## Initializing the Board

Set starting positions using literal bitboards:

```cpp
const uint64_t START_WHITE_PAWNS = 0x000000000000FF00ULL;
const uint64_t START_BLACK_PAWNS = 0x00FF000000000000ULL;
// ... other pieces similarly

struct Position {
    uint64_t white_pawns, white_rooks, /* ... */;
    uint64_t black_pawns, black_rooks, /* ... */;
    bool white_to_move;
    // castling rights, en passant square, etc.
};

void init_starting_position(Position &pos) {
    pos.white_pawns   = START_WHITE_PAWNS;
    pos.white_rooks   = 0x0000000000000081ULL;
    // ...
    pos.white_to_move = true;
}
```

## Move Generation Basics

### Pawns

* **White pawn pushes:** `(pawns << 8) & empty`
* **Double pushes:** `((pawns << 8) & empty) << 8 & empty & rank4_mask`
* **Captures:** `(pawns << 7 & black_pieces & ~file_h_mask) | (pawns << 9 & black_pieces & ~file_a_mask)`

### Knights

Precompute a lookup table of knight attacks:

```cpp
uint64_t knight_attacks[64];

void init_knight_attacks() {
    for (int sq = 0; sq < 64; ++sq) {
        uint64_t b = square_bitboard(sq);
        // shifts: ±17, ±15, ±10, ±6 with file-edge masks
        knight_attacks[sq] = compute_knight_attacks(b);
    }
}
```

### Kings

Similar to knights: 8-direction shifts by 1.

## Sliding Piece Attacks

### Naïve Ray Casting

For each direction, shift until you hit blocker:

```cpp
uint64_t slider_attacks(int sq, uint64_t occupied, const int dirs[], int dir_count) {
    uint64_t attacks = 0ULL;
    for (int i = 0; i < dir_count; ++i) {
        int dir = dirs[i];
        int t = sq;
        while (true) {
            t += dir;
            if (offboard(t)) break;
            attacks |= square_bitboard(t);
            if (occupied & square_bitboard(t)) break;
        }
    }
    return attacks;
}
```

### Magic Bitboards (Advanced)

Use precomputed magic multipliers to index attack tables in O(1).

## Making and Unmaking Moves

Maintain a **move stack** that saves:

* Piece bitboards
* Side to move
* Castling rights
* En passant square
* Half-move clock

```cpp
struct State {
    uint64_t white_pawns, ...;
    bool white_to_move;
    int castling_rights;
    int en_passant_sq;
    int halfmove_clock;
};

std::vector<State> history;

void make_move(const Move &m, Position &pos) {
    history.push_back(pos);
    apply_move_bits(m, pos);
    pos.white_to_move = !pos.white_to_move;
}

void unmake_move(Position &pos) {
    pos = history.back();
    history.pop_back();
}
```

## Setting Up Search and Evaluation

### Minimax & Alpha–Beta

```cpp
int alpha_beta(Position &pos, int depth, int alpha, int beta) {
    if (depth == 0) return evaluate(pos);
    generate_moves(pos, moves);
    for (auto &m : moves) {
        make_move(m, pos);
        int score = -alpha_beta(pos, depth - 1, -beta, -alpha);
        unmake_move(pos);
        if (score >= beta) return beta;
        alpha = std::max(alpha, score);
    }
    return alpha;
}
```

### Simple Evaluation Function

* **Material:** Sum of piece values (`P=100`, `N=300`, `B=300`, `R=500`, `Q=900`)
* **Piece-square tables** for positional bonuses

## Perft Testing

`perft(depth)` counts leaf nodes at given depth:

```cpp
uint64_t perft(Position &pos, int depth) {
    if (depth == 0) return 1;
    generate_moves(pos, moves);
    uint64_t nodes = 0;
    for (auto &m : moves) {
        make_move(m, pos);
        nodes += perft(pos, depth - 1);
        unmake_move(pos);
    }
    return nodes;
}
```

Use known perft numbers to validate correctness at depths 1–6.


## Optimizations & Tips

* **Use `__builtin_popcountll`** for fast bit counts.
* **Bit scan forward/reverse**: `__builtin_ctzll`, `__builtin_clzll`.
* **Move ordering:** captures first, history heuristic.
* **Transposition table:** store previously evaluated positions.


## Putting It All Together

1. **Initialization:** load starting position, precompute attack tables.
2. **Main loop:** parse commands (UCI), set options.
3. **Search:** run alpha–beta to a fixed depth or time limit.
4. **Output:** best move, PV lines, evaluation score.
5. **Repeat** on each opponent move.


## Wrapping Up

Congratulations! 🎉 You now have a clear roadmap to build a chess engine in C++ using bitboards. While this guide covers the core concepts, real-world engines add many more enhancements: quiescence search, iterative deepening, advanced pruning, time management, and more.

Keep experimenting, profiling, and refining!

## TL;DR

* **Bitboards:** 64-bit ints where each bit is a square.
* **Move Generation:** precompute simple tables for knights/kings; use shifts for pawns; ray-cast or magic tables for sliders.
* **Search:** alpha–beta minimax with simple evaluation.
* **Test:** perft for correctness, then optimize (popcount, bit-scan, transposition tables).

Build step-by-step, and before you know it, you’ll have a fast, competitive chess engine! 🚀
