import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createType("identifier_type")
    .asEnum(["upc", "ean", "isbn10", "isbn13", "asin", "sku", "other"])
    .execute();
  await db.schema
    .createType("listing_status")
    .asEnum(["draft", "active", "sold", "ended"])
    .execute();
  await db.schema
    .createType("listing_marketplace_status")
    .asEnum(["active", "ended"])
    .execute();

  await db.schema
    .createTable("app_user")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("email", "text", (c) => c.notNull().unique())
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("user_settings")
    .addColumn("user_id", "uuid", (c) =>
      c.primaryKey().references("app_user.id").onDelete("cascade"),
    )
    .addColumn("default_commission_bps", "integer", (c) =>
      c.check(sql`default_commission_bps between 0 and 10000`),
    )
    .addColumn("default_commission_payee", "text")
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("category")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("app_user.id").onDelete("cascade"),
    )
    .addColumn("parent_id", "uuid", (c) => c.references("category.id").onDelete("restrict"))
    .addColumn("name", "text", (c) => c.notNull().check(sql`length(trim(name)) > 0`))
    .addColumn("archived_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("category_not_own_parent", sql`parent_id is distinct from id`)
    .execute();
  // Top-level categories have a null parent. Without NULLS NOT DISTINCT two of them could share a name.
  await sql`create unique index category_user_parent_name_key on category (user_id, parent_id, lower(name)) nulls not distinct`.execute(
    db,
  );
  await db.schema.createIndex("category_parent_id_idx").on("category").column("parent_id").execute();

  await db.schema
    .createTable("inventory_item")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("app_user.id").onDelete("cascade"),
    )
    .addColumn("title", "text", (c) => c.notNull().check(sql`length(trim(title)) > 0`))
    .addColumn("description", "text")
    .addColumn("category_id", "uuid", (c) =>
      c.notNull().references("category.id").onDelete("restrict"),
    )
    .addColumn("condition", "text")
    .addColumn("quantity_on_hand", "integer", (c) =>
      c.notNull().defaultTo(0).check(sql`quantity_on_hand >= 0`),
    )
    .addColumn("storage_location", "text")
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("inventory_item_user_id_idx")
    .on("inventory_item")
    .column("user_id")
    .execute();
  await db.schema
    .createIndex("inventory_item_category_id_idx")
    .on("inventory_item")
    .column("category_id")
    .execute();
  await sql`create index inventory_item_user_title_idx on inventory_item (user_id, lower(title))`.execute(
    db,
  );

  await db.schema
    .createTable("purchase")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("app_user.id").onDelete("cascade"),
    )
    .addColumn("item_id", "uuid", (c) =>
      c.notNull().references("inventory_item.id").onDelete("cascade"),
    )
    .addColumn("purchased_at", "date", (c) => c.notNull())
    .addColumn("quantity", "integer", (c) => c.notNull().check(sql`quantity > 0`))
    .addColumn("unit_cost_cents", "integer", (c) =>
      c.notNull().check(sql`unit_cost_cents >= 0`),
    )
    .addColumn("source", "text")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("purchase_item_id_idx").on("purchase").column("item_id").execute();
  await db.schema
    .createIndex("purchase_user_purchased_at_idx")
    .on("purchase")
    .columns(["user_id", "purchased_at"])
    .execute();

  await db.schema
    .createTable("item_identifier")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("app_user.id").onDelete("cascade"),
    )
    .addColumn("item_id", "uuid", (c) =>
      c.notNull().references("inventory_item.id").onDelete("cascade"),
    )
    .addColumn("type", sql`identifier_type`, (c) => c.notNull())
    .addColumn("value", "text", (c) => c.notNull().check(sql`length(value) > 0`))
    .addUniqueConstraint("item_identifier_item_type_value_key", ["item_id", "type", "value"])
    .execute();
  await db.schema
    .createIndex("item_identifier_user_value_idx")
    .on("item_identifier")
    .columns(["user_id", "value"])
    .execute();
  await db.schema
    .createIndex("item_identifier_item_id_idx")
    .on("item_identifier")
    .column("item_id")
    .execute();

  await db.schema
    .createTable("item_photo")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("app_user.id").onDelete("cascade"),
    )
    .addColumn("item_id", "uuid", (c) =>
      c.notNull().references("inventory_item.id").onDelete("cascade"),
    )
    .addColumn("cloudinary_public_id", "text", (c) => c.notNull())
    .addColumn("width", "integer", (c) => c.notNull().check(sql`width > 0`))
    .addColumn("height", "integer", (c) => c.notNull().check(sql`height > 0`))
    .addColumn("position", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("item_photo_item_position_idx")
    .on("item_photo")
    .columns(["item_id", "position"])
    .execute();

  await db.schema
    .createTable("marketplace")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("app_user.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (c) => c.notNull().check(sql`length(trim(name)) > 0`))
    .addColumn("archived_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`create unique index marketplace_user_name_key on marketplace (user_id, lower(name))`.execute(
    db,
  );

  await db.schema
    .createTable("fee_rule")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("app_user.id").onDelete("cascade"),
    )
    .addColumn("marketplace_id", "uuid", (c) =>
      c.notNull().references("marketplace.id").onDelete("cascade"),
    )
    .addColumn("category_id", "uuid", (c) => c.references("category.id").onDelete("cascade"))
    .addColumn("percent_bps", "integer", (c) =>
      c.notNull().defaultTo(0).check(sql`percent_bps between 0 and 10000`),
    )
    .addColumn("applies_to_shipping", "boolean", (c) => c.notNull().defaultTo(true))
    .addColumn("fixed_cents", "integer", (c) =>
      c.notNull().defaultTo(0).check(sql`fixed_cents >= 0`),
    )
    .addColumn("payment_percent_bps", "integer", (c) =>
      c.notNull().defaultTo(0).check(sql`payment_percent_bps between 0 and 10000`),
    )
    .addColumn("payment_fixed_cents", "integer", (c) =>
      c.notNull().defaultTo(0).check(sql`payment_fixed_cents >= 0`),
    )
    .execute();
  // A null category is the marketplace default. NULLS NOT DISTINCT keeps it to one default per marketplace.
  await sql`create unique index fee_rule_marketplace_category_key on fee_rule (marketplace_id, category_id) nulls not distinct`.execute(
    db,
  );
  await db.schema
    .createIndex("fee_rule_category_id_idx")
    .on("fee_rule")
    .column("category_id")
    .execute();
  await db.schema.createIndex("fee_rule_user_id_idx").on("fee_rule").column("user_id").execute();

  await db.schema
    .createTable("listing")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("app_user.id").onDelete("cascade"),
    )
    .addColumn("title", "text", (c) => c.notNull().check(sql`length(trim(title)) > 0`))
    .addColumn("status", sql`listing_status`, (c) => c.notNull().defaultTo("draft"))
    .addColumn("asking_price_cents", "integer", (c) =>
      c.notNull().check(sql`asking_price_cents >= 0`),
    )
    .addColumn("quantity", "integer", (c) => c.notNull().defaultTo(1).check(sql`quantity > 0`))
    .addColumn("shipping_charged_cents", "integer", (c) =>
      c.notNull().defaultTo(0).check(sql`shipping_charged_cents >= 0`),
    )
    .addColumn("est_shipping_cost_cents", "integer", (c) =>
      c.notNull().defaultTo(0).check(sql`est_shipping_cost_cents >= 0`),
    )
    .addColumn("commission_bps", "integer", (c) =>
      c.check(sql`commission_bps between 0 and 10000`),
    )
    .addColumn("commission_payee", "text")
    .addColumn("listed_at", "timestamptz")
    .addColumn("ended_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("listing_user_status_idx")
    .on("listing")
    .columns(["user_id", "status"])
    .execute();

  await db.schema
    .createTable("listing_item")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("app_user.id").onDelete("cascade"),
    )
    .addColumn("listing_id", "uuid", (c) =>
      c.notNull().references("listing.id").onDelete("cascade"),
    )
    .addColumn("item_id", "uuid", (c) =>
      c.notNull().references("inventory_item.id").onDelete("restrict"),
    )
    .addColumn("quantity_per_unit", "integer", (c) =>
      c.notNull().defaultTo(1).check(sql`quantity_per_unit > 0`),
    )
    .addColumn("position", "integer", (c) => c.notNull().defaultTo(0))
    .addUniqueConstraint("listing_item_listing_item_key", ["listing_id", "item_id"])
    .execute();
  await db.schema
    .createIndex("listing_item_item_id_idx")
    .on("listing_item")
    .column("item_id")
    .execute();

  await db.schema
    .createTable("listing_marketplace")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("app_user.id").onDelete("cascade"),
    )
    .addColumn("listing_id", "uuid", (c) =>
      c.notNull().references("listing.id").onDelete("cascade"),
    )
    .addColumn("marketplace_id", "uuid", (c) =>
      c.notNull().references("marketplace.id").onDelete("restrict"),
    )
    .addColumn("external_url", "text")
    .addColumn("asking_price_cents", "integer", (c) => c.check(sql`asking_price_cents >= 0`))
    .addColumn("status", sql`listing_marketplace_status`, (c) => c.notNull().defaultTo("active"))
    .addColumn("listed_at", "timestamptz")
    .addColumn("ended_at", "timestamptz")
    .addUniqueConstraint("listing_marketplace_listing_marketplace_key", [
      "listing_id",
      "marketplace_id",
    ])
    .execute();
  await db.schema
    .createIndex("listing_marketplace_marketplace_id_idx")
    .on("listing_marketplace")
    .column("marketplace_id")
    .execute();

  await db.schema
    .createTable("sale")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("app_user.id").onDelete("cascade"),
    )
    .addColumn("listing_id", "uuid", (c) =>
      c.notNull().references("listing.id").onDelete("restrict"),
    )
    .addColumn("marketplace_id", "uuid", (c) =>
      c.notNull().references("marketplace.id").onDelete("restrict"),
    )
    .addColumn("sold_at", "date", (c) => c.notNull())
    .addColumn("quantity", "integer", (c) => c.notNull().check(sql`quantity > 0`))
    .addColumn("sale_price_cents", "integer", (c) =>
      c.notNull().check(sql`sale_price_cents >= 0`),
    )
    .addColumn("shipping_charged_cents", "integer", (c) =>
      c.notNull().defaultTo(0).check(sql`shipping_charged_cents >= 0`),
    )
    .addColumn("shipping_cost_cents", "integer", (c) =>
      c.notNull().defaultTo(0).check(sql`shipping_cost_cents >= 0`),
    )
    .addColumn("marketplace_fee_cents", "integer", (c) =>
      c.notNull().defaultTo(0).check(sql`marketplace_fee_cents >= 0`),
    )
    .addColumn("additional_fees_cents", "integer", (c) =>
      c.notNull().defaultTo(0).check(sql`additional_fees_cents >= 0`),
    )
    .addColumn("cost_of_goods_cents", "integer", (c) =>
      c.notNull().check(sql`cost_of_goods_cents >= 0`),
    )
    .addColumn("commission_cents", "integer", (c) =>
      c.notNull().defaultTo(0).check(sql`commission_cents >= 0`),
    )
    .addColumn("commission_paid_at", "date")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("sale_listing_id_idx").on("sale").column("listing_id").execute();
  await db.schema
    .createIndex("sale_marketplace_id_idx")
    .on("sale")
    .column("marketplace_id")
    .execute();
  await db.schema
    .createIndex("sale_user_sold_at_idx")
    .on("sale")
    .columns(["user_id", "sold_at"])
    .execute();

  await db.schema
    .createTable("price_lookup_cache")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("app_user.id").onDelete("cascade"),
    )
    .addColumn("source", "text", (c) => c.notNull())
    .addColumn("normalized_query", "text", (c) => c.notNull())
    .addColumn("payload", "jsonb", (c) => c.notNull())
    .addColumn("fetched_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("price_lookup_cache_user_source_query_key", [
      "user_id",
      "source",
      "normalized_query",
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [
    "price_lookup_cache",
    "sale",
    "listing_marketplace",
    "listing_item",
    "listing",
    "fee_rule",
    "marketplace",
    "item_photo",
    "item_identifier",
    "purchase",
    "inventory_item",
    "category",
    "user_settings",
    "app_user",
  ]) {
    await db.schema.dropTable(table).ifExists().execute();
  }
  for (const type of ["listing_marketplace_status", "listing_status", "identifier_type"]) {
    await db.schema.dropType(type).ifExists().execute();
  }
}
