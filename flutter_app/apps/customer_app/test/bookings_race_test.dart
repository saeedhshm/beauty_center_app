import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_customer/src/bookings_screen.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

/// Request-race guards for the customer bookings list: a late response from
/// an older filter, page, or refresh must never replace current results, and
/// loading/error belong to the current request only.
void main() {
  Booking booking(String id, String status) => Booking(
    id: id,
    customerId: 'c1',
    expertId: 'e1',
    serviceId: 7,
    status: status,
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

  CatalogPage<Booking> pageOf(List<Booking> items, {bool hasNext = false}) =>
      CatalogPage(items: items, page: 1, limit: 20, hasNext: hasNext);

  Future<void> pumpList(
    WidgetTester tester,
    _RaceBookingsGateway gateway,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ar'),
        supportedLocales: LamsaLocalizations.supportedLocales,
        localizationsDelegates: LamsaLocalizations.localizationsDelegates,
        theme: LamsaTheme.light(),
        home: Scaffold(
          body: CustomerBookingsScreen(
            bookings: gateway,
            payments: _UnusedPayments(),
            reviews: _UnusedReviews(),
            currentUserId: 'c1',
          ),
        ),
      ),
    );
  }

  testWidgets('late response from a previous filter is ignored', (
    tester,
  ) async {
    final gateway = _RaceBookingsGateway();
    gateway.pages['null|1'] = pageOf([booking('seed', 'pending')]);

    await pumpList(tester, gateway);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('booking-seed')), findsOneWidget);

    // Old request for the new filter starts first and stays gated.
    gateway.gates['pending|1'] = Queue.of([Completer<CatalogPage<Booking>>()]);
    await tester.tap(find.byKey(const ValueKey('bookings-filter-pending')));
    await tester.pump();

    // Newer refresh of the same filter resolves first.
    gateway.gates['pending|1'] = Queue.of([
      Completer<CatalogPage<Booking>>()
        ..complete(pageOf([booking('p-new', 'pending')])),
    ]);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    // The older gated response lands last and must be ignored.
    final oldGate = gateway.consumedGates['pending|1']!.first;
    oldGate.complete(pageOf([booking('p-old', 'pending')]));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('booking-p-new')), findsOneWidget);
    expect(find.byKey(const ValueKey('booking-p-old')), findsNothing);
  });

  testWidgets('stale load-more never merges after a filter change', (
    tester,
  ) async {
    final gateway = _RaceBookingsGateway();
    gateway.pages['null|1'] = pageOf([booking('a1', 'pending')], hasNext: true);
    gateway.pages['pending|1'] = pageOf([booking('p1', 'pending')]);

    await pumpList(tester, gateway);
    await tester.pumpAndSettle();

    gateway.gates['null|2'] = Queue.of([Completer<CatalogPage<Booking>>()]);
    await tester.ensureVisible(find.byKey(const Key('bookings-load-more')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bookings-load-more')));
    await tester.pump();

    await tester.tap(find.byKey(const ValueKey('bookings-filter-pending')));
    await tester.pumpAndSettle();

    gateway.consumedGates['null|2']!.first.complete(
      pageOf([booking('a2', 'pending')]),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('booking-p1')), findsOneWidget);
    expect(find.byKey(const ValueKey('booking-a1')), findsNothing);
    expect(find.byKey(const ValueKey('booking-a2')), findsNothing);
  });

  testWidgets('a newer refresh wins over an older one', (tester) async {
    final gateway = _RaceBookingsGateway();
    gateway.pages['null|1'] = pageOf([booking('seed', 'pending')]);

    await pumpList(tester, gateway);
    await tester.pumpAndSettle();

    gateway.gates['pending|1'] = Queue.of([Completer<CatalogPage<Booking>>()]);
    await tester.tap(find.byKey(const ValueKey('bookings-filter-pending')));
    await tester.pump();

    gateway.gates['pending|1'] = Queue.of([
      Completer<CatalogPage<Booking>>()
        ..complete(pageOf([booking('p-second', 'pending')])),
    ]);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('booking-p-second')), findsOneWidget);

    gateway.consumedGates['pending|1']!.first.complete(
      pageOf([booking('p-first', 'pending')]),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('booking-p-second')), findsOneWidget);
    expect(find.byKey(const ValueKey('booking-p-first')), findsNothing);
  });

  testWidgets('stale error and finally belong to the old request only', (
    tester,
  ) async {
    final gateway = _RaceBookingsGateway();
    gateway.pages['null|1'] = pageOf([booking('a1', 'pending')]);

    await pumpList(tester, gateway);
    await tester.pumpAndSettle();

    gateway.gates['pending|1'] = Queue.of([Completer<CatalogPage<Booking>>()]);
    await tester.tap(find.byKey(const ValueKey('bookings-filter-pending')));
    await tester.pump();
    // Still loading the current request: spinner visible, no error.
    expect(find.byType(CircularProgressIndicator), findsWidgets);

    gateway.pages['pending|1'] = pageOf([booking('p2', 'pending')]);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('booking-p2')), findsOneWidget);

    // The stale request now fails: no error UI, current data stays.
    gateway.consumedGates['pending|1']!.first.completeError(
      Exception('stale boom'),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('booking-p2')), findsOneWidget);
    expect(find.text('إعادة المحاولة'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });
}

class _RaceBookingsGateway implements BookingGateway {
  /// One-shot gated responses consumed in order per "status|page" key.
  final gates = <String, Queue<Completer<CatalogPage<Booking>>>>{};

  /// Gates already consumed, for tests to complete out of order.
  final consumedGates = <String, List<Completer<CatalogPage<Booking>>>>{};
  final pages = <String, CatalogPage<Booking>>{};
  final calls = <String>[];

  @override
  Future<CatalogPage<Booking>> bookings({String? status, int page = 1}) {
    final key = '$status|$page';
    calls.add(key);
    final queue = gates[key];
    if (queue != null && queue.isNotEmpty) {
      final gate = queue.removeFirst();
      (consumedGates[key] ??= []).add(gate);
      return gate.future;
    }
    return Future.value(
      pages[key] ??
          CatalogPage(items: const [], page: page, limit: 20, hasNext: false),
    );
  }

  @override
  Future<Booking> booking(String id) => throw UnimplementedError();

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

class _UnusedPayments implements PaymentGateway {
  @override
  Future<PaymentIntent> initiate(String bookingId) =>
      throw UnimplementedError();

  @override
  Future<List<BookingPayment>> attempts(String bookingId) =>
      throw UnimplementedError();

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

class _UnusedReviews implements ReviewGateway {
  @override
  Future<BookingReview> submit(
    String bookingId, {
    required int rating,
    String? comment,
  }) => throw UnimplementedError();

  @override
  Future<List<BookingReview>> forBooking(String bookingId) =>
      throw UnimplementedError();
}
