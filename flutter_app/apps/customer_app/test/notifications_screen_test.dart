import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_customer/src/notifications_screen.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

void main() {
  testWidgets('list marks read and opens the booking fresh', (tester) async {
    final notifications = _NotificationsGateway(
      items: [
        _item('n1', read: false, bookingId: 'b1'),
        _item('n2', read: true, bookingId: null),
      ],
    );
    var opened = 0;
    await tester.pumpWidget(
      testApp(
        Scaffold(
          body: CustomerNotificationsScreen(
            notifications: notifications,
            bookings: _BookingsGateway(onDetail: () => opened += 1),
            payments: _PaymentsGateway(),
            reviews: _ReviewsGateway(),
            currentUserId: 'c1',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('1 غير مقروء'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('notification-n1')));
    await tester.pumpAndSettle();

    // Marked read, then the booking opens and refetches from the server.
    expect(notifications.read, ['n1']);
    expect(opened, 1);
    expect(find.text('تفاصيل الحجز'), findsOneWidget);
  });

  testWidgets('unread filter and read-all reload from the server', (
    tester,
  ) async {
    final notifications = _NotificationsGateway(
      items: [_item('n1', read: false, bookingId: null)],
    );
    await tester.pumpWidget(
      testApp(
        Scaffold(
          body: CustomerNotificationsScreen(
            notifications: notifications,
            bookings: _BookingsGateway(),
            payments: _PaymentsGateway(),
            reviews: _ReviewsGateway(),
            currentUserId: 'c1',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('notifications-unread-only')));
    await tester.pumpAndSettle();
    expect(notifications.unreadFilters.last, isTrue);

    await tester.tap(find.byKey(const ValueKey('notifications-read-all')));
    await tester.pumpAndSettle();
    expect(notifications.readAllCalls, 1);
  });
}

Widget testApp(Widget child) => MaterialApp(
  locale: const Locale('ar'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  theme: LamsaTheme.light(),
  home: child,
);

AppNotification _item(
  String id, {
  required bool read,
  required String? bookingId,
}) => AppNotification(
  id: id,
  type: 'booking.accepted',
  title: 'عنوان $id',
  body: 'نص $id',
  bookingId: bookingId,
  readAt: read ? '2026-10-14T07:00:00.000Z' : null,
  createdAt: '2026-10-14T06:00:00.000Z',
);

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

class _NotificationsGateway implements NotificationGateway {
  _NotificationsGateway({required this.items});

  List<AppNotification> items;
  final read = <String>[];
  final unreadFilters = <bool>[];
  int readAllCalls = 0;

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
  }) async {
    unreadFilters.add(unreadOnly);
    final visible = unreadOnly
        ? items.where((item) => !item.isRead).toList()
        : items;
    return CatalogPage(items: visible, page: 1, limit: 20, hasNext: false);
  }

  @override
  Future<int> unreadCount() async => items.where((item) => !item.isRead).length;

  @override
  Future<void> markRead(String id) async {
    read.add(id);
    items = [
      for (final item in items)
        item.id == id
            ? AppNotification(
                id: item.id,
                type: item.type,
                title: item.title,
                body: item.body,
                bookingId: item.bookingId,
                readAt: '2026-10-14T08:00:00.000Z',
                createdAt: item.createdAt,
              )
            : item,
    ];
  }

  @override
  Future<void> markAllRead() async {
    readAllCalls += 1;
    items = [
      for (final item in items)
        AppNotification(
          id: item.id,
          type: item.type,
          title: item.title,
          body: item.body,
          bookingId: item.bookingId,
          readAt: '2026-10-14T08:00:00.000Z',
          createdAt: item.createdAt,
        ),
    ];
  }
}

class _BookingsGateway implements BookingGateway {
  _BookingsGateway({this.onDetail});

  final void Function()? onDetail;

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
  Future<Booking> booking(String id) async {
    onDetail?.call();
    return _booking();
  }

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
