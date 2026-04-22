import assert from "node:assert/strict";
import {
  desiredServerBotCount,
  MAX_SERVER_BOTS,
  readMinTotalParticipantsFromEnv,
} from "./serverBotPopulation";

{
  const prev = process.env.BFA_MIN_ROOM_PLAYERS;
  delete process.env.BFA_MIN_ROOM_PLAYERS;
  assert.equal(readMinTotalParticipantsFromEnv(), 10);
  process.env.BFA_MIN_ROOM_PLAYERS = "6";
  assert.equal(readMinTotalParticipantsFromEnv(), 6);
  process.env.BFA_MIN_ROOM_PLAYERS = "0";
  assert.equal(readMinTotalParticipantsFromEnv(), 10);
  if (prev === undefined) delete process.env.BFA_MIN_ROOM_PLAYERS;
  else process.env.BFA_MIN_ROOM_PLAYERS = prev;
}

assert.equal(desiredServerBotCount(4, 0), 0);
assert.equal(desiredServerBotCount(4, 1), 3);
assert.equal(desiredServerBotCount(4, 2), 2);
assert.equal(desiredServerBotCount(4, 3), 1);
assert.equal(desiredServerBotCount(4, 4), 0);
assert.equal(desiredServerBotCount(4, 8), 0);
assert.equal(desiredServerBotCount(6, 2), 4);
assert.equal(desiredServerBotCount(20, 0), 0);
assert.equal(desiredServerBotCount(20, 1), MAX_SERVER_BOTS);
assert.equal(desiredServerBotCount(16, 1), MAX_SERVER_BOTS);
assert.equal(desiredServerBotCount(10, 1), MAX_SERVER_BOTS);
assert.equal(desiredServerBotCount(11, 1), MAX_SERVER_BOTS);
assert.equal(desiredServerBotCount(10, 10), 0);
assert.equal(desiredServerBotCount(6, 1), 5);

console.log("serverBotPopulation tests ok");
