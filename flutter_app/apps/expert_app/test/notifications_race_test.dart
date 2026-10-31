import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_expert/src/notifications_screen.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

/// Paging and request-race guards for the expert notifications feed.
///
/// The feed state machine itself is shared with the customer app through
/// `NotificationFeedController`; these tests pin the expert screen's use of it:
/// a second server page, a filter change that invalidates an in-flight
/// request, a stale load-more after a refresh, and a failing next page.
void main() {
  AppNotification item(String id, {bool read = false}) => AppNotification(
    id: id,
    type: 'booking_accepted',
    title: 'عنوان $id',
    body: 'نص $id',
    bookingId: null,
    readAt: read ? '2026-10-14T06:00:00.000Z' : null,
    createdAt: '2026-10-14T06:00:00.000Z',
  );

  CatalogPage<AppNotification> pageOf(
    List<AppNotification> items, {
    int page = 1,
    bool hasNext = false,
  }) => CatalogPage(items: items, page: page, limit: 20, hasNext: hasNext);

  final opened = <String>[];

  Future<void> pumpFeed(WidgetTester tester, _RaceGateway gateway) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ar'),
        supportedLocales: LamsaLocalizations.supportedLocales,
        localizationsDelegates: LamsaLocalizations.localizationsDelegates,
        theme: LamsaTheme.light(),
        home: Scaffold(
          body: ExpertNotificationsScreen(
            notifications: gateway,
            onOpenBooking: opened.add,
          ),
        ),
      ),
    );
  }

  testWidgets('the next page is appended from the server without duplicates', (
    tester,
  ) async {
    final gateway = _RaceGateway()
      ..pages['false|1'] = pageOf([item('n1'), item('n2')], hasNext: true)
      ..pages['false|2'] = pageOf([item('n3'), item('n4')], page: 2);

    await pumpFeed(tester, gateway);
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('notification-n1')), findsOneWidget);
    expect(find.byKey(const ValueKey('notification-n3')), findsNothing);

    await tester.ensureVisible(
      find.byKey(const ValueKey('notifications-load-more')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('notifications-load-more')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('notification-n1')), findsOneWidget);
    expect(find.byKey(const ValueKey('notification-n2')), findsOneWidget);
    expect(find.byKey(const ValueKey('notification-n3')), findsOneWidget);
    expect(find.byKey(const ValueKey('notification-n4')), findsOneWidget);
    expect(gateway.calls, ['false|1', 'false|2']);
    // The last page reports no next page, so the control disappears.
    expect(find.byKey(const ValueKey('notifications-load-more')), findsNothing);

    // Every tile appears exactly once: appending never duplicates an item.
    for (final id in ['n1', 'n2', 'n3', 'n4']) {
      expect(find.byKey(ValueKey('notification-$id')), findsOneWidget);
    }
    expect(opened, isEmpty);
  });

  testWidgets('changing the filter invalidates the request in flight', (
    tester,
  ) async {
    final gateway = _RaceGateway()
      ..pages['false|1'] = pageOf([item('all-1')], hasNext: true)
      ..pages['true|1'] = pageOf([item('unread-1')]);

    await pumpFeed(tester, gateway);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('notification-all-1')), findsOneWidget);

    // A page-two request for the current filter stays gated.
    gateway.gatePage('false|2');
    await tester.ensureVisible(
      find.byKey(const ValueKey('notifications-load-more')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('notifications-load-more')));
    await tester.pump();

    // The filter flips while that request is still in flight.
    await tester.tap(find.byKey(const ValueKey('notifications-unread-only')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('notification-unread-1')), findsOneWidget);
    expect(find.byKey(const ValueKey('notification-all-1')), findsNothing);

    // The stale page-two reply must not merge into the new filter's list.
    gateway.completeLast('false|2', pageOf([item('stale-2')], page: 2));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('notification-stale-2')), findsNothing);
    expect(find.byKey(const ValueKey('notification-unread-1')), findsOneWidget);
    expect(find.byKey(const ValueKey('notification-all-1')), findsNothing);
  });

  testWidgets('a stale load-more after a refresh never merges', (tester) async {
    final gateway = _RaceGateway()
      ..pages['false|1'] = pageOf([item('p1')], hasNext: true)
      ..pages['false|2'] = pageOf([item('p2')], page: 2);

    await pumpFeed(tester, gateway);
    await tester.pumpAndSettle();

    gateway.gatePage('false|2');
    await tester.ensureVisible(
      find.byKey(const ValueKey('notifications-load-more')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('notifications-load-more')));
    await tester.pump();

    // A refresh replaces the list and returns to page one.
    // The stale load-more keeps a spinner running, so pumpAndSettle would hang
    // until it completes: pump manually while the race is arranged.
    gateway.gatePage('false|1');
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    gateway.completeLast('false|1', pageOf([item('fresh-1')], hasNext: true));
    await tester.pump();
    gateway.completeLast('false|2', pageOf([item('stale-2')], page: 2));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('notification-stale-2')), findsNothing);
    expect(find.byKey(const ValueKey('notification-p1')), findsNothing);
    expect(find.byKey(const ValueKey('notification-fresh-1')), findsOneWidget);
  });

  testWidgets('a failing next page keeps the loaded items and offers retry', (
    tester,
  ) async {
    final gateway = _RaceGateway()
      ..pages['false|1'] = pageOf([
        item('keep-1'),
        item('keep-2'),
      ], hasNext: true)
      ..pages['false|2'] = pageOf([item('more-3')], page: 2);

    await pumpFeed(tester, gateway);
    await tester.pumpAndSettle();

    await tester.ensureVisible(
      find.byKey(const ValueKey('notifications-load-more')),
    );
    await tester.pumpAndSettle();
    gateway.failNextPage = const ApiFailure(
      kind: ApiFailureKind.server,
      code: 'FAILED',
      message: 'boom',
    );
    await tester.tap(find.byKey(const ValueKey('notifications-load-more')));
    await tester.pumpAndSettle();

    // Loaded items stay visible and the failure is stated, not hidden.
    expect(find.byKey(const ValueKey('notification-keep-1')), findsOneWidget);
    expect(find.byKey(const ValueKey('notification-keep-2')), findsOneWidget);
    expect(
      find.byKey(const ValueKey('notifications-page-error')),
      findsOneWidget,
    );
    expect(
      find.text('تعذّر تحميل المزيد. العناصر المعروضة لم تتغير.'),
      findsOneWidget,
    );
    expect(find.text('تعذّر تحميل التنبيهات.'), findsNothing);

    // Retry fetches the same next page and clears the notice.
    gateway.failNextPage = null;
    await tester.ensureVisible(
      find.byKey(const ValueKey('notifications-page-retry')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('notifications-page-retry')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('notification-more-3')), findsOneWidget);
    expect(
      find.byKey(const ValueKey('notifications-page-error')),
      findsNothing,
    );
  });

  testWidgets('concurrent load-more taps request the next page once', (
    tester,
  ) async {
    final gateway = _RaceGateway()
      ..pages['false|1'] = pageOf([item('one')], hasNext: true)
      ..pages['false|2'] = pageOf([item('two')], page: 2);

    await pumpFeed(tester, gateway);
    await tester.pumpAndSettle();

    gateway.gatePage('false|2');
    await tester.ensureVisible(
      find.byKey(const ValueKey('notifications-load-more')),
    );
    await tester.pumpAndSettle();

    final button = find.byKey(const ValueKey('notifications-load-more'));
    await tester.tap(button);
    await tester.pump();
    // Repeated taps while the first request is still in flight.
    await tester.tap(button, warnIfMissed: false);
    await tester.tap(button, warnIfMissed: false);
    await tester.pump();

    gateway.completeLast('false|2', pageOf([item('two')], page: 2));
    await tester.pumpAndSettle();

    expect(gateway.calls.where((call) => call == 'false|2').length, 1);
    expect(find.byKey(const ValueKey('notification-two')), findsOneWidget);
  });

  testWidgets('the unread count and a validated booking open still work', (
    tester,
  ) async {
    final gateway = _RaceGateway()
      ..pages['false|1'] = pageOf([item('n1')], hasNext: false)
      ..defaultUnread = 3;
    final linked = AppNotification(
      id: 'n2',
      type: 'booking_accepted',
      title: 'حجز مؤكد',
      body: 'تم تأكيد حجزك',
      bookingId: '11111111-1111-4111-8111-111111111111',
      readAt: null,
      createdAt: '2026-10-14T06:00:00.000Z',
    );
    gateway.pages['false|1'] = pageOf([item('n1'), linked], hasNext: true);
    gateway.pages['false|2'] = pageOf([], page: 2);

    await pumpFeed(tester, gateway);
    await tester.pumpAndSettle();

    expect(find.text('3 غير مقروء'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('notification-n2')));
    await tester.pumpAndSettle();

    expect(opened, ['11111111-1111-4111-8111-111111111111']);
    expect(gateway.markedRead, ['n2']);
  });
}

class _RaceGateway implements NotificationGateway {
  /// One-shot gated pages, keyed by "unreadOnly|page".
  final gates = <String, Queue<Completer<CatalogPage<AppNotification>>>>{};

  /// Gates already consumed, so a test can complete them out of order.
  final consumedGates =
      <String, List<Completer<CatalogPage<AppNotification>>>>{};
  final pages = <String, CatalogPage<AppNotification>>{};
  final calls = <String>[];
  final markedRead = <String>[];

  /// Set to fail only the next-page request, leaving page one intact.
  ApiFailure? failNextPage;

  /// Queues a gated reply for the next matching request.
  void gatePage(String key) {
    (gates[key] ??= Queue<Completer<CatalogPage<AppNotification>>>()).addLast(
      Completer<CatalogPage<AppNotification>>(),
    );
  }

  /// Completes the oldest already-consumed gate for this key.
  void completeLast(String key, CatalogPage<AppNotification> page) =>
      consumedGates[key]!.last.complete(page);
  int defaultUnread = 0;

  @override
  Future<CatalogPage<AppNotification>> notifications({
    bool unreadOnly = false,
    int page = 1,
  }) {
    final key = '$unreadOnly|$page';
    calls.add(key);
    final queue = gates[key];
    if (queue != null && queue.isNotEmpty) {
      final gate = queue.removeFirst();
      (consumedGates[key] ??= []).add(gate);
      return gate.future;
    }
    if (page > 1 && failNextPage != null) {
      return Future.error(failNextPage!);
    }
    return Future.value(
      pages[key] ??
          CatalogPage(items: const [], page: page, limit: 20, hasNext: false),
    );
  }

  @override
  Future<int> unreadCount() async => defaultUnread;

  @override
  Future<void> markRead(String id) async {
    markedRead.add(id);
  }

  @override
  Future<void> markAllRead() async {}

  @override
  Future<RegisteredDevice> registerDevice(String token) =>
      throw UnimplementedError();

  @override
  Future<List<RegisteredDevice>> devices() => throw UnimplementedError();

  @override
  Future<void> removeDevice(String id) => throw UnimplementedError();
}
