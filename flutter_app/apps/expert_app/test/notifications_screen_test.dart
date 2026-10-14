import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_expert/src/notifications_screen.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

void main() {
  testWidgets('booking item marks read and opens the validated booking', (
    tester,
  ) async {
    final notifications = _NotificationsGateway(
      items: [_item('n1', bookingId: _bookingId(1))],
    );
    final opened = <String>[];
    await tester.pumpWidget(
      _app(
        ExpertNotificationsScreen(
          notifications: notifications,
          onOpenBooking: opened.add,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('notification-n1')));
    await tester.pumpAndSettle();

    expect(notifications.read, ['n1']);
    expect(opened, [_bookingId(1)]);
  });

  testWidgets('plain item marks read without navigation', (tester) async {
    final notifications = _NotificationsGateway(
      items: [_item('n2', bookingId: null)],
    );
    final opened = <String>[];
    await tester.pumpWidget(
      _app(
        ExpertNotificationsScreen(
          notifications: notifications,
          onOpenBooking: opened.add,
        ),
      ),
    );
    await tester.pumpAndSettle();

    // No chevron for payload-free items.
    expect(find.byIcon(Icons.chevron_left), findsNothing);
    await tester.tap(find.byKey(const ValueKey('notification-n2')));
    await tester.pumpAndSettle();

    expect(notifications.read, ['n2']);
    expect(opened, isEmpty);
  });

  testWidgets('corrupt booking id shows a safe message, no navigation', (
    tester,
  ) async {
    final notifications = _NotificationsGateway(
      items: [_item('n3', bookingId: 'not-a-uuid')],
    );
    final opened = <String>[];
    await tester.pumpWidget(
      _app(
        ExpertNotificationsScreen(
          notifications: notifications,
          onOpenBooking: opened.add,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('notification-n3')));
    await tester.pumpAndSettle();

    expect(notifications.read, ['n3']);
    expect(opened, isEmpty);
    expect(find.text('رابط التنبيه غير صالح'), findsOneWidget);
  });
}

Widget _app(Widget child) => MaterialApp(
  locale: const Locale('ar'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  home: Scaffold(body: child),
);

/// Deterministic valid UUIDs: the notification validator only accepts
/// well-formed `lamsa://booking/<uuid>` references.
String _bookingId(int n) =>
    '00000000-0000-4000-8000-00000000000$n';

AppNotification _item(String id, {required String? bookingId}) =>
    AppNotification(
      id: id,
      type: 'booking.requested',
      title: 'عنوان $id',
      body: 'نص $id',
      bookingId: bookingId,
      readAt: null,
      createdAt: '2026-10-14T06:00:00.000Z',
    );

class _NotificationsGateway implements NotificationGateway {
  _NotificationsGateway({required this.items});

  List<AppNotification> items;
  final read = <String>[];

  @override
  Future<RegisteredDevice> registerDevice(String token) =>
      throw UnimplementedError();

  @override
  Future<List<RegisteredDevice>> devices() => throw UnimplementedError();

  @override
  Future<void> removeDevice(String id) => throw UnimplementedError();

  @override
  Future<CatalogPage<AppNotification>> notifications({
    bool unreadOnly = false,
    int page = 1,
  }) async => CatalogPage(items: items, page: 1, limit: 20, hasNext: false);

  @override
  Future<int> unreadCount() async => 1;

  @override
  Future<void> markRead(String id) async {
    read.add(id);
  }

  @override
  Future<void> markAllRead() async {}
}
