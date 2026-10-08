import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

import { Board, Row } from "../src/board.js";
import {
  calculateWordScore,
  loadWords,
  WORD_SET,
  WORD_TIERS,
  randomLetter,
} from "../src/data.js";
import { BINGO_BONUS_MULTIPLIER, ROW_LEN } from "../src/config.js";

import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..");

async function runTests() {
  console.log("=== LETTER RISE PARITY TESTS ===");

  // 1. Load words and reference
  const wordsJson = JSON.parse(
    await fs.readFile(path.join(WEB_DIR, "assets/words.json"), "utf-8")
  );
  await loadWords(wordsJson);
  console.log(`Loaded ${WORD_SET.size} words in JS dictionary.`);

  const ref = JSON.parse(
    await fs.readFile(path.join(__dirname, "parity_reference.json"), "utf-8")
  );

  // 2. Test word scores
  console.log("\nChecking word scores...");
  for (const [word, expected] of Object.entries(ref.word_scores)) {
    assert.equal(
      WORD_SET.has(word),
      true,
      `Word "${word}" should exist in dictionary`
    );
    const jsTier = WORD_TIERS.get(word);
    assert.equal(
      jsTier,
      expected.tier,
      `Tier mismatch for "${word}": expected ${expected.tier}, got ${jsTier}`
    );
    const jsScore = calculateWordScore(word);
    assert.ok(
      Math.abs(jsScore - expected.score) < 0.0001,
      `Score mismatch for "${word}": expected ${expected.score}, got ${jsScore}`
    );
    let jsBingoScore = jsScore;
    if (word.length === ROW_LEN) {
      jsBingoScore *= BINGO_BONUS_MULTIPLIER;
    }
    assert.ok(
      Math.abs(jsBingoScore - expected.bingo_score) < 0.0001,
      `Bingo score mismatch for "${word}": expected ${expected.bingo_score}, got ${jsBingoScore}`
    );
    console.log(
      `  ✓ "${word}" -> tier ${jsTier}, base ${jsScore.toFixed(2)}, bingo ${jsBingoScore.toFixed(2)}`
    );
  }

  // 3. Test timing intervals
  console.log("\nChecking difficulty and intervals...");
  const board = new Board(0);
  for (const [secStr, expected] of Object.entries(ref.intervals)) {
    const elapsedSec = parseInt(secStr, 10);
    const now = elapsedSec * 1000;
    const diffSteps = board.difficulty_steps(now);
    const spawnInt = board.spawn_interval(now);
    const growthInt = board.row_growth_interval(now);

    assert.equal(
      diffSteps,
      expected.difficulty_steps,
      `Difficulty steps mismatch at ${elapsedSec}s`
    );
    assert.equal(
      spawnInt,
      expected.spawn_interval,
      `Spawn interval mismatch at ${elapsedSec}s`
    );
    assert.equal(
      growthInt,
      expected.row_growth_interval,
      `Row growth interval mismatch at ${elapsedSec}s`
    );
    console.log(
      `  ✓ ${elapsedSec}s: difficulty=${diffSteps}, spawn=${spawnInt}ms, growth=${growthInt}ms`
    );
  }

  console.log("\nChecking game modes...");
  const timeBoard = new Board(0, "time_attack");
  assert.equal(timeBoard.difficulty_steps(0), 0);
  assert.equal(timeBoard.spawn_interval(0), 750);
  assert.equal(timeBoard.row_growth_interval(0), 9000);
  assert.equal(timeBoard.difficulty_steps(25000), 1);
  assert.equal(timeBoard.time_remaining_seconds(0), 120);
  assert.equal(timeBoard.time_remaining_seconds(119500), 1);
  assert.equal(timeBoard.time_remaining_seconds(120000), 0);
  console.log("  ✓ Time Attack starts at 2:00 with faster spawn/growth tuning");

  // 4. Test danger levels & stack heights
  console.log("\nChecking danger levels and stack geometry...");
  const testBoard = new Board(0);
  for (const [rowCountStr, expected] of Object.entries(ref.danger_levels)) {
    const rowCount = parseInt(rowCountStr, 10);
    testBoard.rows = Array.from({ length: rowCount }, () => new Row());
    const topY = testBoard.stack_top_y();
    const danger = testBoard.danger_level();
    assert.equal(topY, expected.stack_top_y, `stack_top_y mismatch for ${rowCount} rows`);
    assert.ok(
      Math.abs(danger - expected.danger_level) < 0.0001,
      `danger_level mismatch for ${rowCount} rows: expected ${expected.danger_level}, got ${danger}`
    );
    console.log(
      `  ✓ ${rowCount} rows: top_y=${topY}px, danger=${danger.toFixed(3)}`
    );
  }

  // 5. Test word resolution, locked cells, and clearing
  console.log("\nChecking board resolution mechanics...");
  const simBoard = new Board(0);
  // Test invalid segment
  const row0 = simBoard.rows[0];
  row0.cells[0] = "x";
  row0.cells[1] = "x";
  row0.cells[2] = "x";
  simBoard.try_clear_segment(0, 0, 2, 0);
  row0.multiplier_cols.set(1, 2);
  assert.equal(row0.resolution_phase, "hold");
  simBoard.update(0.1, 350);
  assert.equal(row0.resolution_phase, "flicker");
  simBoard.update(0.1, 550);
  assert.equal(row0.resolution_phase, null);
  assert.ok(row0.isLocked(0), "Cell 0 should be locked after invalid word");
  assert.ok(row0.isLocked(1), "Cell 1 should be locked after invalid word");
  assert.ok(row0.isLocked(2), "Cell 2 should be locked after invalid word");
  assert.equal(row0.multiplier_cols.get(1), 2, "Invalid words should preserve multiplier tokens");
  console.log("  ✓ Invalid segment locks cells properly");

  // Test valid segment next to locked cells and unlocking
  row0.cells[3] = "c";
  row0.cells[4] = "a";
  row0.cells[5] = "t";
  row0.multiplier_cols.set(4, 3);
  simBoard.try_clear_segment(0, 3, 5, 600);
  simBoard.update(0.1, 950);
  simBoard.update(0.1, 1150);
  // "cat" was valid: cell 2 adjacent to cell 3 should now be unlocked!
  assert.ok(!row0.isLocked(2), "Cell 2 should be unlocked by adjacent valid word 'cat'");
  assert.ok(row0.scored_cols.has(3), "Cell 3 should be scored");
  assert.ok(row0.scored_cols.has(4), "Cell 4 should be scored");
  assert.ok(row0.scored_cols.has(5), "Cell 5 should be scored");
  assert.ok(simBoard.score > 0, "Score should have increased");
  assert.equal(simBoard.score, 15, "A 3x token should multiply the valid word score");
  assert.equal(row0.multiplier_cols.has(4), false, "Scored multiplier tokens should be consumed");
  console.log(`  ✓ Adjacent unlocking and scoring verified (score: ${simBoard.score.toFixed(2)})`);

  // Multiple multiplier tokens of either value may occupy the same row.
  const stackedBoard = new Board(0);
  const stackedRow = stackedBoard.rows[0];
  stackedRow.cells[0] = "c";
  stackedRow.cells[1] = "a";
  stackedRow.cells[2] = "t";
  stackedRow.multiplier_cols.set(0, 2);
  stackedRow.multiplier_cols.set(1, 2);
  stackedRow.multiplier_cols.set(2, 3);
  stackedBoard.try_clear_segment(0, 0, 2, 0);
  stackedBoard.update(0.1, 350);
  stackedBoard.update(0.1, 550);
  assert.equal(stackedBoard.score, 60, "All multiplier tokens in a word should stack multiplicatively");
  console.log("  ✓ Repeated and mixed multiplier tokens stack in one row");

  // 6. Test weighted random letter sampling
  console.log("\nChecking random letter sampling...");
  const counts = {};
  const trials = 10000;
  for (let i = 0; i < trials; i++) {
    const letter = randomLetter();
    counts[letter] = (counts[letter] || 0) + 1;
  }
  // 'e' should be more frequent than 'z'
  assert.ok(counts["e"] > counts["z"], "Letter 'e' should appear far more frequently than 'z'");
  console.log(`  ✓ Sampled ${trials} letters: 'e'=${counts["e"]}, 'z'=${counts["z"] || 0}`);

  console.log("\n>>> ALL PARITY TESTS PASSED! 100% PARITY WITH PYTHON <<<\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
