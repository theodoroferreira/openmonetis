DROP INDEX "itens_pluggy_pluggy_item_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "itens_pluggy_pluggy_item_id_idx" ON "itens_pluggy" USING btree ("pluggy_item_id");