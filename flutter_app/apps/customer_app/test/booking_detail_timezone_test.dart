import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_customer/src/bookings_screen.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

// Intentionally no ensureCairoTime() call anywhere in this file: each test
// file runs in a fresh isolate, so opening the detail screen first proves the
// formatters self-initialize instead of crashing with
// LocationNotFoundException, whatever the entry path (bookings list,
// notification deep-open, …).
void main() {
  testWidgets('booking detail renders Cairo times without prior init', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ar'),
        supportedLocales: LamsaLocalizations.supportedLocales,
        localizationsDelegates: LamsaLocalizations.localizationsDelegates,
        theme: LamsaTheme.light(),
        home: BookingDetailScreen(
          bookings: _BookingsGateway(),
          payments: _PaymentsGateway(),
          reviews: _ReviewsGateway(),
          currentUserId: 'c1',
          bookingId: 'b1',
        ),
      ),
    );
    await tester.pumpAndSettle();

    // 07:00Z on 2026-10-20 is 10:00 in Cairo (DST, UTC+3).
    expect(find.textContaining('10:00'), findsWidgets);
    expect(find.text('تفاصيل الحجز'), findsOneWidget);
  });

  testWidgets('bookings list renders Cairo dates without prior init', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ar'),
        supportedLocales: LamsaLocalizations.supportedLocales,
        localizationsDelegates: LamsaLocalizations.localizationsDelegates,
        theme: LamsaTheme.light(),
        home: Scaffold(
          body: CustomerBookingsScreen(
            bookings: _BookingsGateway(),
            payments: _PaymentsGateway(),
            reviews: _ReviewsGateway(),
            currentUserId: 'c1',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('مقبول · 300.50 EGP'), findsOneWidget);
    expect(find.textContaining('300.50 EGP'), findsWidgets);
  });
}

Booking _booking() => const Booking(
  id: 'b1',
  customerId: 'c1',
  expertId: 'e1',
  serviceId: 7,
  status: 'accepted',
  startsAt: '2026-10-20T07:00:00.000Z',
  endsAt: '2026-10-20T08:00:00.000Z',
  timeZone: 'Africa/Cairo',
  expiresAt: null,
  addressText: 'Cairo synthetic address',
  cityId: 1,
  price: '300.50',
  commissionRate: '20.0000',
  commissionAmount: '60.10',
  expertEarning: '240.40',
  vatRate: '0.0000',
  vatAmount: '0.00',
  totalAmount: '300.50',
  currency: 'EGP',
  notes: null,
  cancellationReason: null,
  cancelledAt: null,
  createdAt: '2026-10-13T06:00:00.000Z',
  updatedAt: '2026-10-13T06:00:00.000Z',
);

class _BookingsGateway implements BookingGateway {
  @override
  Future<Booking> createBooking({
    required String expertId,
    required int serviceId,
    required String addressId,
    required String startsAt,
    String? notes,
    required String idempotencyKey,
  }) => throw UnimplementedError();

  @override
  Future<CatalogPage<Booking>> bookings({String? status, int page = 1}) async =>
      CatalogPage(items: [_booking()], page: 1, limit: 20, hasNext: false);

  @override
  Future<Booking> booking(String id) async => _booking();

  @override
  Future<Booking> accept(String id) => throw UnimplementedError();

  @override
  Future<Booking> reject(String id, {String? reason}) =>
      throw UnimplementedError();

  @override
  Future<Booking> cancel(String id, {String? reason}) =>
      throw UnimplementedError();

  @override
  Future<Booking> complete(String id) => throw UnimplementedError();
}

class _PaymentsGateway implements PaymentGateway {
  @override
  Future<PaymentIntent> initiate(String bookingId) =>
      throw UnimplementedError();

  @override
  Future<List<BookingPayment>> attempts(String bookingId) async => const [];

  @override
  Future<DemoEventResult> sendDemoEvent({
    required String paymentId,
    required String eventId,
    required String outcome,
    required String amount,
    required String currency,
    required String token,
  }) => throw UnimplementedError();
}

class _ReviewsGateway implements ReviewGateway {
  @override
  Future<BookingReview> submit(
    String bookingId, {
    required int rating,
    String? comment,
  }) => throw UnimplementedError();

  @override
  Future<List<BookingReview>> forBooking(String bookingId) async => const [];
}
