import assert from "node:assert/strict";
import {
  assertPlayerLifeInvariant,
  canTakeArtillerySplashDamage,
  canUsePrimaryWeapon,
  isValidPlayerLifeState,
  participatesInWorldSimulation,
  PlayerLifeState,
} from "./playerLife";

{
  assert.equal(isValidPlayerLifeState(PlayerLifeState.Alive), true);
  assert.equal(isValidPlayerLifeState("invalid"), false);
}

{
  assert.equal(canTakeArtillerySplashDamage(PlayerLifeState.Alive), true);
  assert.equal(canTakeArtillerySplashDamage(PlayerLifeState.SpawnProtected), false);
  assert.equal(canTakeArtillerySplashDamage(PlayerLifeState.AwaitingRespawn), false);
}

{
  assert.equal(canUsePrimaryWeapon(PlayerLifeState.Alive), true);
  assert.equal(canUsePrimaryWeapon(PlayerLifeState.SpawnProtected), true);
  assert.equal(canUsePrimaryWeapon(PlayerLifeState.AwaitingRespawn), false);
}

{
  assert.equal(participatesInWorldSimulation(PlayerLifeState.Alive), true);
  assert.equal(participatesInWorldSimulation(PlayerLifeState.SpawnProtected), true);
  assert.equal(participatesInWorldSimulation(PlayerLifeState.AwaitingRespawn), false);
}

{
  assert.doesNotThrow(() =>
    assertPlayerLifeInvariant(PlayerLifeState.AwaitingRespawn, 0, 100),
  );
  assert.throws(() =>
    assertPlayerLifeInvariant(PlayerLifeState.AwaitingRespawn, 1, 100),
  );
}

{
  assert.doesNotThrow(() =>
    assertPlayerLifeInvariant(PlayerLifeState.Alive, 50, 100),
  );
  assert.throws(() => assertPlayerLifeInvariant(PlayerLifeState.Alive, 0, 100));
}

{
  assert.doesNotThrow(() =>
    assertPlayerLifeInvariant(PlayerLifeState.SpawnProtected, 100, 100),
  );
  assert.throws(() =>
    assertPlayerLifeInvariant(PlayerLifeState.SpawnProtected, 101, 100),
  );
}

console.log("playerLife tests ok");
