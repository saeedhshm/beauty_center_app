import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_customer/src/notifications_screen.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

/// Request-race guards for the customer notifications list: the unread
/// filter, pages, and refreshes follow the same generation discipline as the
/// bookings list, and a stale unread-count never leaks in either.
void main() {
  AppNotification item(String id) => AppNotification(
    id: id,
    type: 'booking.accepted',
    title: 'عنوان $id',
    body: 'نص $id',
    bookingId: null,
    readAt: null,
    createdAt: '2026-10-14T06:00:00.000Z',
  );

  CatalogPage<AppNotification> pageOf(
    List<AppNotification> items, {
    bool hasNext = false,
  }) => CatalogPage(items: items, page: 1, limit: 20, hasNext: hasNext);

  Future<void> pumpList(
    WidgetTester tester,
    _RaceNotificationsGateway gateway,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ar'),
        supportedLocales: LamsaLocalizations.supportedLocales,
        localizationsDelegates: LamsaLocalizations.localizationsDelegates,
        theme: LamsaTheme.light(),
        home: Scaffold(
          body: CustomerNotificationsScreen(
            notifications: gateway,
            bookings: _UnusedBookings(),
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
    final gateway = _RaceNotificationsGateway();
    gateway.pages['false|1'] = pageOf([item('seed')]);

    await pumpList(tester, gateway);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('notification-seed')), findsOneWidget);

    gateway.gates['true|1'] = Queue.of([Completer<CatalogPage<AppNotification>>()]);
    await tester.tap(find.byKey(const ValueKey('notifications-unread-only')));
    await tester.pump();

    gateway.gates['true|1'] = Queue.of([
      Completer<CatalogPage<AppNotification>>()..complete(
        pageOf([item('n-new')]),
      ),
    ]);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('notification-n-new')), findsOneWidget);

    gateway.consumedGates['true|1']!.first.complete(
      pageOf([item('n-old')]),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('notification-n-new')), findsOneWidget);
    expect(find.byKey(const ValueKey('notification-n-old')), findsNothing);
  });

  testWidgets('stale load-more never merges after a filter change', (
    tester,
  ) async {
    final gateway = _RaceNotificationsGateway();
    gateway.pages['false|1'] = pageOf([item('a1')], hasNext: true);
    gateway.pages['true|1'] = pageOf([item('u1')]);

    await pumpList(tester, gateway);
    await tester.pumpAndSettle();

    gateway.gates['false|2'] = Queue.of([
      Completer<CatalogPage<AppNotification>>(),
    ]);
    await tester.ensureVisible(
      find.byKey(const Key('notifications-load-more')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('notifications-load-more')));
    await tester.pump();

    await tester.tap(find.byKey(const ValueKey('notifications-unread-only')));
    await tester.pumpAndSettle();

    gateway.consumedGates['false|2']!.first.complete(
      pageOf([item('a2')]),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('notification-u1')), findsOneWidget);
    expect(find.byKey(const ValueKey('notification-a1')), findsNothing);
    expect(find.byKey(const ValueKey('notification-a2')), findsNothing);
  });

  testWidgets('a newer refresh wins over an older one', (tester) async {
    final gateway = _RaceNotificationsGateway();
    gateway.pages['false|1'] = pageOf([item('seed')]);

    await pumpList(tester, gateway);
    await tester.pumpAndSettle();

    final oldList = Completer<CatalogPage<AppNotification>>();
    final oldCount = Completer<int>();
    gateway.gates['true|1'] = Queue.of([oldList]);
    gateway.countGates.add(oldCount);
    await tester.tap(find.byKey(const ValueKey('notifications-unread-only')));
    await tester.pump();

    gateway.gates['true|1'] = Queue.of([
      Completer<CatalogPage<AppNotification>>()..complete(
        pageOf([item('n-second')]),
      ),
    ]);
    // The newer refresh also carries its own unread count.
    gateway.countGates.add(Completer<int>()..complete(7));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('notification-n-second')), findsOneWidget);
    expect(find.text('7 غير مقروء'), findsOneWidget);

    oldList.complete(pageOf([item('n-first')]));
    oldCount.complete(99);
    await tester.pumpAndSettle();

    // Neither the stale items nor the stale unread count leak through.
    expect(find.byKey(const ValueKey('notification-n-second')), findsOneWidget);
    expect(find.byKey(const ValueKey('notification-n-first')), findsNothing);
    expect(find.text('7 غير مقروء'), findsOneWidget);
    expect(find.text('99 غير مقروء'), findsNothing);
  });

  testWidgets('stale error and finally belong to the old request only', (
    tester,
  ) async {
    final gateway = _RaceNotificationsGateway();
    gateway.pages['false|1'] = pageOf([item('a1')]);

    await pumpList(tester, gateway);
    await tester.pumpAndSettle();

    gateway.gates['true|1'] = Queue.of([Completer<CatalogPage<AppNotification>>()]);
    await tester.tap(find.byKey(const ValueKey('notifications-unread-only')));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsWidgets);

    gateway.pages['true|1'] = pageOf([item('u2')]);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('notification-u2')), findsOneWidget);

    gateway.consumedGates['true|1']!.first.completeError(
      Exception('stale boom'),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('notification-u2')), findsOneWidget);
    expect(find.text('إعادة المحاولة'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });
}

class _RaceNotificationsGateway implements NotificationGateway {
  /// One-shot gated list responses consumed in order per "filter|page" key.
  final gates = <String, Queue<Completer<CatalogPage<AppNotification>>>>{};

  /// Gates already consumed, for tests to complete out of order.
  final consumedGates =
      <String, List<Completer<CatalogPage<AppNotification>>>>{};
  final pages = <String, CatalogPage<AppNotification>>{};

  /// One-shot gated unread counts, consumed in call order.
  final countGates = Queue<Completer<int>>();
  int defaultUnread = 0;

  @override
  Future<CatalogPage<AppNotification>> notifications({
    bool unreadOnly = false,
    int page = 1,
  }) {
    final key = '$unreadOnly|$page';
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
  Future<int> unreadCount() {
    if (countGates.isNotEmpty) return countGates.removeFirst().future;
    return Future.value(defaultUnread);
  }

  @override
  Future<RegisteredDevice> registerDevice(String token) =>
      throw UnimplementedError();

  @override
  Future<List<RegisteredDevice>> devices() => throw UnimplementedError();

  @override
  Future<void> removeDevice(String id) => throw UnimplementedError();

  @override
  Future<void> markRead(String id) async {}

  @override
  Future<void> markAllRead() async {}
}

class _UnusedBookings implements BookingGateway {
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
  Future<CatalogPage<Booking>> bookings({String? status, int page = 1}) =>
      throw UnimplementedError();

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
