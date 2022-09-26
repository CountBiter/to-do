/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("notes", (table) => {
    table.increments("id");
    table.string("title", 255).notNullable();
    table.string("text", 255).notNullable();
    table.string("isArchived", 255);
    table.string("created", 255).notNullable();
    table.string("user_id", 255).notNullable();
    table.string("_id", 255).notNullable().unique();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("notes");
};
