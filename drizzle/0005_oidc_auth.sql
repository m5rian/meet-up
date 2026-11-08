PRAGMA foreign_keys = ON;
--> statement-breakpoint
-- OIDC migration: all accounts become OIDC-only. Drop the manual password auth
-- and link identities to the IdP's `sub` claim. Existing password accounts have
-- no OIDC link, so their rows (and cascaded dependents) are purged.
DELETE FROM `users`;
--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `password_hash`;
--> statement-breakpoint
ALTER TABLE `users` ADD `oidc_sub` text NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `oidc_issuer` text NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_oidc_sub_unique` ON `users` (`oidc_sub`);