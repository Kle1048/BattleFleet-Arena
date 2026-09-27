import type { ShipSocketTransform } from "../shipVisualLayout";

/** Generated from model nodes, never hand-authored and never supplied by clients. */
export type ModelSpatialMetadata = {
  contractVersion: 2;
  sourceSha256: string;
  sockets: Record<string, ShipSocketTransform>;
  rails: Record<string, ShipSocketTransform>;
  effects: Record<string, ShipSocketTransform>;
};
