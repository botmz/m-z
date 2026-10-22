import { pool } from "./store";

function routingError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

export async function replaceSourceRouting(sourceId: number, destinationIds: number[]): Promise<void> {
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    throw routingError("معرّف المصدر غير صالح", 400);
  }
  if (
    destinationIds.some((id) => !Number.isInteger(id) || id >= 0 || id < -2147483648) ||
    new Set(destinationIds).size !== destinationIds.length
  ) {
    throw routingError("قائمة الوجهات غير صالحة أو تحتوي على تكرار", 400);
  }

  const destinationDbIds = destinationIds.map(Math.abs);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Coordinate with full routing saves while limiting this update to one source.
    await client.query("SELECT pg_advisory_xact_lock(128006,2)");

    const source = await client.query("SELECT id FROM source_channels WHERE id=$1 FOR UPDATE", [sourceId]);
    if (!source.rows.length) throw routingError("قناة المصدر المحددة غير موجودة", 404);

    if (destinationDbIds.length) {
      const destinations = await client.query(
        "SELECT id FROM destination_channels WHERE id=ANY($1::int[])",
        [destinationDbIds],
      );
      if (destinations.rowCount !== destinationDbIds.length) {
        throw routingError("إحدى قنوات الوجهة المحددة غير موجودة", 400);
      }
    }

    await client.query("DELETE FROM routing_rules WHERE source_id=$1", [sourceId]);
    for (const destinationId of destinationDbIds) {
      await client.query(
        "INSERT INTO routing_rules(source_id,destination_id) VALUES($1,$2)",
        [sourceId, destinationId],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
