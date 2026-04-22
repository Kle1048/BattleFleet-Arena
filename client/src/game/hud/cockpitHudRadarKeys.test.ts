import assert from "node:assert/strict";
import {
  cockpitRadarBlipsKey,
  cockpitRadarEsmKey,
  cockpitRadarPortalMarkersKey,
} from "./cockpitRadarKeys";

{
  assert.equal(cockpitRadarBlipsKey([]), "");
  const k1 = cockpitRadarBlipsKey([{ nx: 0.1, ny: -0.5 }]);
  assert.equal(k1, "0.100_-0.500");
  assert.equal(cockpitRadarBlipsKey([{ nx: 0.1, ny: -0.5 }]), k1);
}

{
  assert.equal(cockpitRadarEsmKey([]), "");
  assert.equal(
    cockpitRadarEsmKey([{ x1: 1, y1: 2, x2: 3, y2: 4 }]),
    "1.00_2.00_3.00_4.00_",
  );
}

{
  assert.equal(cockpitRadarPortalMarkersKey([]), "");
  const pk = cockpitRadarPortalMarkersKey([
    { nx: 0, ny: -1 },
    { nx: 0.707, ny: -0.707 },
  ]);
  assert.equal(pk, "0.000_-1.000|0.707_-0.707");
}
