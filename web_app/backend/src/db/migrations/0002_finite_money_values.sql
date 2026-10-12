ALTER TABLE "bookings" DROP CONSTRAINT "bookings_amounts_nonnegative";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_amounts_valid";--> statement-breakpoint
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_amount_nonnegative";--> statement-breakpoint
ALTER TABLE "expert_services" DROP CONSTRAINT "expert_services_price_nonnegative";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_amounts_nonnegative" CHECK ("bookings"."price" between 0 and 99999999.99 and "bookings"."commission_amount" between 0 and 99999999.99 and "bookings"."expert_earning" between 0 and 99999999.99 and "bookings"."vat_amount" between 0 and 99999999.99 and "bookings"."total_amount" between 0 and 99999999.99);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amounts_valid" CHECK ("payments"."amount" between 0 and 99999999.99 and "payments"."refunded_amount" between 0 and "payments"."amount");--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_amount_nonnegative" CHECK ("payouts"."amount" between 0 and 99999999.99);--> statement-breakpoint
ALTER TABLE "expert_services" ADD CONSTRAINT "expert_services_price_nonnegative" CHECK ("expert_services"."price" between 0 and 99999999.99);