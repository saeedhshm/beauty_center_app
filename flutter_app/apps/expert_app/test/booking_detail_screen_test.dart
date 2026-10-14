import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_expert/src/booking_detail_screen.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

void main() {
  testWidgets('pending booking renders from a fresh fetch', (tester) async {
    final gateway = _BookingGateway();
    await tester.pumpWidget(
      _app(
        ExpertBookingDetailScreen(
          bookings: gateway,
          bookingId: _bookingId(1),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // The screen fetched the id itself instead of trusting any payload.
    expect(gateway.fetched, [_bookingId(1)]);
    // Once in the status row, once in the fetched history.
    expect(find.text('معلق'), findsNWidgets(2));
    expect(find.textContaining('300.50 EGP'), findsOneWidget);
    expect(find.textContaining('12 شارع'), findsOneWidget);
  });

  testWidgets('confirmed booking renders without actions', (tester) async {
    final gateway = _BookingGateway(status: 'confirmed');
    await tester.pumpWidget(
      _app(
        ExpertBookingDetailScreen(
          bookings: gateway,
          bookingId: _bookingId(2),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('مؤكد'), findsOneWidget);
    expect(find.text('مكتمل'), findsNothing);
  });

  testWidgets('completed booking renders with its history', (tester) async {
    final gateway = _BookingGateway(status: 'completed');
    await tester.pumpWidget(
      _app(
        ExpertBookingDetailScreen(
          bookings: gateway,
          bookingId: _bookingId(3),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('مكتمل'), findsOneWidget);
    expect(find.text('سجل الحالات'), findsOneWidget);
    // No mutation buttons on a read-only detail screen.
    expect(find.byType(FilledButton), findsNothing);
    expect(find.byType(OutlinedButton), findsNothing);
  });

  testWidgets('cancelled booking renders its reason', (tester) async {
    final gateway = _BookingGateway(
      status: 'cancelled',
      cancellationReason: 'ظرف طارئ',
    );
    await tester.pumpWidget(
      _app(
        ExpertBookingDetailScreen(
          bookings: gateway,
          bookingId: _bookingId(4),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('ملغي'), findsOneWidget);
    expect(find.textContaining('ظرف طارئ'), findsOneWidget);
  });

  testWidgets('unowned booking shows a safe not-found message', (
    tester,
  ) async {
    final gateway = _BookingGateway(
      failure: const ApiFailure(
        kind: ApiFailureKind.notFound,
        code: 'NOT_FOUND',
        message: 'gone',
      ),
    );
    await tester.pumpWidget(
      _app(
        ExpertBookingDetailScreen(
          bookings: gateway,
          bookingId: _bookingId(5),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('الحجز غير موجود أو لا تملكين صلاحية عرضه'),
      findsOneWidget,
    );
    // Retry refetches instead of navigating anywhere.
    await tester.tap(find.text('إعادة المحاولة'));
    await tester.pumpAndSettle();
    expect(gateway.fetched.length, 2);
  });

  testWidgets('expired session shows the session message', (tester) async {
    final gateway = _BookingGateway(
      failure: const ApiFailure(
        kind: ApiFailureKind.unauthorized,
        code: 'UNAUTHORIZED',
        message: 'expired',
      ),
    );
    await tester.pumpWidget(
      _app(
        ExpertBookingDetailScreen(
          bookings: gateway,
          bookingId: _bookingId(6),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('انتهت الجلسة، سجلي الدخول مجددًا'),
      findsOneWidget,
    );
  });

  testWidgets('forbidden booking shows access-denied', (tester) async {
    final gateway = _BookingGateway(
      failure: const ApiFailure(
        kind: ApiFailureKind.forbidden,
        code: 'FORBIDDEN',
        message: 'denied',
      ),
    );
    await tester.pumpWidget(
      _app(
        ExpertBookingDetailScreen(
          bookings: gateway,
          bookingId: _bookingId(7),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('غير مسموح'), findsOneWidget);
  });
}

String _bookingId(int n) => '00000000-0000-4000-8000-00000000000$n';

Widget _app(Widget child) => MaterialApp(
  locale: const Locale('ar'),
  supportedLocales: LamsaLocalizations.supportedLocales,
  localizationsDelegates: LamsaLocalizations.localizationsDelegates,
  home: Scaffold(body: child),
);

Booking _booking({
  required String id,
  required String status,
  String? cancellationReason,
}) => Booking(
  id: id,
  customerId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  expertId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  serviceId: 7,
  status: status,
  startsAt: '2026-10-20T07:00:00.000Z',
  endsAt: '2026-10-20T08:00:00.000Z',
  timeZone: 'Africa/Cairo',
  expiresAt: null,
  addressText: '12 شارع التحرير، القاهرة',
  cityId: 1,
  price: '300.50',
  commissionRate: '20',
  commissionAmount: '60.10',
  expertEarning: '240.40',
  vatRate: '14',
  vatAmount: '42.07',
  totalAmount: '300.50',
  currency: 'EGP',
  notes: 'ملاحظة العميلة',
  cancellationReason: cancellationReason,
  cancelledAt: null,
  createdAt: '2026-10-14T06:00:00.000Z',
  updatedAt: '2026-10-14T06:00:00.000Z',
  statusHistory: const [
    BookingStatusEntry(
      status: 'pending',
      changedAt: '2026-10-14T06:00:00.000Z',
    ),
    BookingStatusEntry(
      status: 'accepted',
      changedAt: '2026-10-14T06:05:00.000Z',
    ),
  ],
);

class _BookingGateway implements BookingGateway {
  _BookingGateway({this.status = 'pending', this.cancellationReason, this.failure});

  final String status;
  final String? cancellationReason;
  final ApiFailure? failure;
  final fetched = <String>[];

  @override
  Future<Booking> booking(String id) async {
    fetched.add(id);
    final failure = this.failure;
    if (failure != null) throw failure;
    return _booking(id: id, status: status, cancellationReason: cancellationReason);
  }

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
