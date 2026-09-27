import { verifyShipAsset } from '../models/verifyShipAsset';
verifyShipAsset('cruiser','assets/blender/slava').catch(error=>{console.error(error);process.exitCode=1;});
