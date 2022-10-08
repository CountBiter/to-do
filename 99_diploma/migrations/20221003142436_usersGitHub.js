/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("usersGitHub", (table) => {
    table.increments("_id");
    table.string("username", 255);
    table.string("photos", 255);
    table.string("id").unique();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("usersGitHub");
};
