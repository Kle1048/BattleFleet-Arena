import { verifyShipAsset } from "../models/verifyShipAsset";
verifyShipAsset("fac", "assets/blender/gepard").catch(error => { console.error(error); process.exitCode = 1; });
