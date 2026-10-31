import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_customer/src/notifications_screen.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

/// A notification reference is data, not authority: only a well-formed booking
/// id navigates, and the booking itself is always refetched from the API so
/// ownership and state come from the server.
void main() {
  const bookingId = '11111111-1111-4111-8111-111111111111';

  AppNotification item(String id, {String? bookingId}) => AppNotification(
    id: id,
    type: 'booking_accepted',
    title: 'عنوان $id',
    body: 'نص $id',
    bookingId: bookingId,
    readAt: '2026-10-14T07:00:00.000Z',
    createdAt: '2026-10-14T06:00:00.000Z',
  );

  Future<void> pumpFeed(
    WidgetTester tester,
    _Notifications notifications,
    _Bookings bookings,
  ) async {
    await tester.pumpWidget(
      testApp(
        Scaffold(
          body: CustomerNotificationsScreen(
            notifications: notifications,
            bookings: bookings,
            payments: _Payments(),
            reviews: _Reviews(),
            currentUserId: 'c1',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('a valid booking id navigates and refetches from the API', (
    tester,
  ) async {
    final notifications = _Notifications([item('n1', bookingId: bookingId)]);
    final bookings = _Bookings();
    await pumpFeed(tester, notifications, bookings);

    await tester.tap(find.byKey(const ValueKey('notification-n1')));
    await tester.pumpAndSettle();

    expect(bookings.fetched, [bookingId]);
    expect(find.text('تفاصيل الحجز'), findsOneWidget);
    expect(find.textContaining('مقبول'), findsWidgets);
  });

  testWidgets(
    'an invalid booking id shows a safe message and fetches nothing',
    (tester) async {
      final notifications = _Notifications([
        item('n1', bookingId: 'not-a-uuid'),
      ]);
      final bookings = _Bookings();
      await pumpFeed(tester, notifications, bookings);

      await tester.tap(find.byKey(const ValueKey('notification-n1')));
      await tester.pumpAndSettle();

      expect(find.text('رابط التنبيه غير صالح'), findsOneWidget);
      expect(bookings.fetched, isEmpty);
      expect(find.text('تفاصيل الحجز'), findsNothing);
    },
  );

  testWidgets('a blank booking id is rejected like any other invalid value', (
    tester,
  ) async {
    final notifications = _Notifications([item('n1', bookingId: '   ')]);
    final bookings = _Bookings();
    await pumpFeed(tester, notifications, bookings);

    await tester.tap(find.byKey(const ValueKey('notification-n1')));
    await tester.pumpAndSettle();

    expect(find.text('رابط التنبيه غير صالح'), findsOneWidget);
    expect(bookings.fetched, isEmpty);
  });

  testWidgets(
    'a notification without a booking navigates nowhere and says nothing',
    (tester) async {
      final notifications = _Notifications([item('n1')]);
      final bookings = _Bookings();
      await pumpFeed(tester, notifications, bookings);

      await tester.tap(find.byKey(const ValueKey('notification-n1')));
      await tester.pumpAndSettle();

      expect(find.text('رابط التنبيه غير صالح'), findsNothing);
      expect(bookings.fetched, isEmpty);
      expect(find.text('تفاصيل الحجز'), findsNothing);
    },
  );

  testWidgets('a booking owned by someone else stays a server 404', (
    tester,
  ) async {
    final notifications = _Notifications([item('n1', bookingId: bookingId)]);
    final bookings = _Bookings(
      failure: const ApiFailure(
        kind: ApiFailureKind.notFound,
        code: 'NOT_FOUND',
        message: 'missing',
      ),
    );
    await pumpFeed(tester, notifications, bookings);

    await tester.tap(find.byKey(const ValueKey('notification-n1')));
    await tester.pumpAndSettle();

    // The id passed validation, so the server was asked and answered.
    expect(bookings.fetched, [bookingId]);
    // Nothing about the booking is shown.
    expect(
      find.text('الحجز غير موجود أو لا تملكين صلاحية عرضه'),
      findsOneWidget,
    );
    expect(find.textContaining('300.50'), findsNothing);
    expect(find.textContaining('Cairo synthetic address'), findsNothing);
  });
}

Widget testApp(Widget child) => MaterialApp(
  locale: const Locale('ar'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  theme: LamsaTheme.light(),
  home: child,
);

class _Notifications implements NotificationGateway {
  _Notifications(this.items);

  final List<AppNotification> items;
  final read = <String>[];

  @override
  Future<CatalogPage<AppNotification>> notifications({
    bool unreadOnly = false,
    int page = 1,
  }) async => CatalogPage(items: items, page: 1, limit: 20, hasNext: false);

  @override
  Future<int> unreadCount() async => 0;

  @override
  Future<void> markRead(String id) async => read.add(id);

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

class _Bookings implements BookingGateway {
  _Bookings({this.failure});

  final ApiFailure? failure;
  final fetched = <String>[];

  @override
  Future<Booking> booking(String id) async {
    fetched.add(id);
    final failure = this.failure;
    if (failure != null) throw failure;
    return Booking(
      id: id,
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
  }

  @override
  Future<CatalogPage<Booking>> bookings({String? status, int page = 1}) =>
      throw UnimplementedError();

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

class _Payments implements PaymentGateway {
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

class _Reviews implements ReviewGateway {
  @override
  Future<BookingReview> submit(
    String bookingId, {
    required int rating,
    String? comment,
  }) => throw UnimplementedError();

  @override
  Future<List<BookingReview>> forBooking(String bookingId) async => const [];
}
