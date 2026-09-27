import { verifyShipAsset } from "../models/verifyShipAsset";
verifyShipAsset("destroyer", "assets/blender/spruance").catch(error => { console.error(error); process.exitCode = 1; });
