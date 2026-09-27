type CloseableRoom = {
  leave(consented?: boolean): Promise<unknown>;
  connection?: { close(): void };
};

/** Send the existing consented-leave message, then close the transport as well.
 * Teardown cannot depend on an acknowledgement from an unreachable server. */
export function closeRoomConnection(room: CloseableRoom): void {
  try { void room.leave().catch(error => console.warn("Room leave failed", error)); }
  catch (error) { console.warn("Room leave failed", error); }
  finally { room.connection?.close(); }
}
