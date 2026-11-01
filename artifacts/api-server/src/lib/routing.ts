import { pool } from "./store";
import { normalizeRouteContentSettings, type RouteContentSettings } from "./route-content";

type SourceRouteSettings = { destinationId: number; contentSettings: RouteContentSettings };
type FullRouteSettings = {
  sourceId: number;
  destinationId: number;
  hideSourceLink?: boolean;
  contentSettings?: Partial<RouteContentSettings>;
};

function routingError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

export async function replaceAllRouting(
  rules: FullRouteSettings[],
  suppliedClient?: Awaited<ReturnType<typeof pool.connect>>,
): Promise<void> {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (
      !Number.isInteger(rule.sourceId) || rule.sourceId <= 0 || rule.sourceId > 2147483647 ||
      !Number.isInteger(rule.destinationId) || rule.destinationId >= 0 || rule.destinationId < -2147483648 ||
      seen.has(`${rule.sourceId}:${rule.destinationId}`)
    ) {
      throw routingError("قاعدة ربط غير صالحة أو مكررة", 400);
    }
    seen.add(`${rule.sourceId}:${rule.destinationId}`);
  }

  const client = suppliedClient ?? await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(128006,2)");
    const existing = await client.query("SELECT source_id,destination_id,hide_source_link,content_settings FROM routing_rules");
    const existingByRoute = new Map(existing.rows.map((row) => [`${row.source_id}:${-row.destination_id}`, row]));
    const prepared: Array<{
      sourceId: number;
      destinationId: number;
      hideSourceLink: boolean;
      contentSettings: RouteContentSettings;
    }> = [];

    for (const rule of rules) {
      const [source, destination] = await Promise.all([
        client.query("SELECT id,config FROM source_channels WHERE id=$1", [rule.sourceId]),
        client.query("SELECT id FROM destination_channels WHERE id=$1", [-rule.destinationId]),
      ]);
      if (!source.rows.length || !destination.rows.length) {
        throw routingError("القناة المحددة لم تعد موجودة", 400);
      }

      const previous = existingByRoute.get(`${rule.sourceId}:${rule.destinationId}`);
      prepared.push({
        sourceId: rule.sourceId,
        destinationId: -rule.destinationId,
        hideSourceLink: rule.hideSourceLink ?? Boolean(previous?.hide_source_link),
        contentSettings: normalizeRouteContentSettings(
          rule.contentSettings ?? previous?.content_settings,
          !Boolean(source.rows[0].config?.skipMessagesWithLinks),
        ),
      });
    }

    await client.query("DELETE FROM routing_rules");
    for (const rule of prepared) {
      await client.query(
        "INSERT INTO routing_rules(source_id,destination_id,hide_source_link,content_settings) VALUES($1,$2,$3,$4)",
        [rule.sourceId, rule.destinationId, rule.hideSourceLink, rule.contentSettings],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    if (!suppliedClient) client.release();
  }
}

export async function replaceSourceRouting(
  sourceId: number,
  destinationIds: number[],
  hideSourceLinkDestinationIds?: number[],
  routeSettings?: SourceRouteSettings[],
): Promise<void> {
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    throw routingError("معرّف المصدر غير صالح", 400);
  }
  if (
    destinationIds.some((id) => !Number.isInteger(id) || id >= 0 || id < -2147483648) ||
    new Set(destinationIds).size !== destinationIds.length
  ) {
    throw routingError("قائمة الوجهات غير صالحة أو تحتوي على تكرار", 400);
  }
  if (
    hideSourceLinkDestinationIds?.some((id) => !Number.isInteger(id) || id >= 0 || id < -2147483648) ||
    new Set(hideSourceLinkDestinationIds ?? []).size !== (hideSourceLinkDestinationIds ?? []).length ||
    (hideSourceLinkDestinationIds ?? []).some((id) => !destinationIds.includes(id))
  ) {
    throw routingError("قائمة الوجهات المختارة لإخفاء رابط المصدر غير صالحة", 400);
  }
  if (
    (routeSettings ?? []).some((route) =>
      !Number.isInteger(route.destinationId) || route.destinationId >= 0 ||
      route.destinationId < -2147483648 || !destinationIds.includes(route.destinationId),
    ) ||
    new Set((routeSettings ?? []).map((route) => route.destinationId)).size !== (routeSettings ?? []).length
  ) {
    throw routingError("إعدادات محتوى المسار غير صالحة أو لا تطابق الوجهات المختارة", 400);
  }

  const destinationDbIds = destinationIds.map(Math.abs);
  const requestedSettings = new Map((routeSettings ?? []).map((route) => [route.destinationId, route.contentSettings]));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Coordinate with full routing saves while limiting this update to one source.
    await client.query("SELECT pg_advisory_xact_lock(128006,2)");

    const source = await client.query("SELECT id,config FROM source_channels WHERE id=$1 FOR UPDATE", [sourceId]);
    if (!source.rows.length) throw routingError("قناة المصدر المحددة غير موجودة", 404);
    const defaultShowLinks = !Boolean(source.rows[0].config?.skipMessagesWithLinks);

    if (destinationDbIds.length) {
      const destinations = await client.query(
        "SELECT id FROM destination_channels WHERE id=ANY($1::int[])",
        [destinationDbIds],
      );
      if (destinations.rowCount !== destinationDbIds.length) {
        throw routingError("إحدى قنوات الوجهة المحددة غير موجودة", 400);
      }
    }

    const previous = await client.query(
      "SELECT destination_id,hide_source_link,content_settings FROM routing_rules WHERE source_id=$1",
      [sourceId],
    );
    const previousHidden = new Set<number>(
      previous.rows.filter((row) => row.hide_source_link).map((row) => -row.destination_id),
    );
    const previousSettings = new Map<number, unknown>(
      previous.rows.map((row) => [-row.destination_id, row.content_settings]),
    );
    const hiddenDestinations = hideSourceLinkDestinationIds === undefined
      ? previousHidden
      : new Set(hideSourceLinkDestinationIds);
    await client.query("DELETE FROM routing_rules WHERE source_id=$1", [sourceId]);
    for (const destinationId of destinationDbIds) {
      const apiDestinationId = -destinationId;
      const contentSettings = normalizeRouteContentSettings(
        requestedSettings.get(apiDestinationId) ?? previousSettings.get(apiDestinationId),
        defaultShowLinks,
      );
      await client.query(
        "INSERT INTO routing_rules(source_id,destination_id,hide_source_link,content_settings) VALUES($1,$2,$3,$4)",
        [sourceId, destinationId, hiddenDestinations.has(apiDestinationId), contentSettings],
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
